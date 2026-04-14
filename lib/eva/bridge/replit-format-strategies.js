/**
 * Replit Format Strategies
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (Phase 4)
 *
 * Three pure formatting functions that transform export_blueprint_review
 * RPC data into Replit-optimized formats:
 *   1. replit.md — persistent project context
 *   2. Plan Mode prompt — concise feature scoping (<2000 chars)
 *   3. Per-feature prompts — sequential build instructions
 */

// ── Helpers ────────────────────────────────────────────

/**
 * Normalize group_key to handle the how_to_build vs how_to_build_it mismatch.
 */
export function normalizeGroupKey(key) {
  if (key === 'how_to_build') return 'how_to_build_it';
  return key;
}

/**
 * Find a group by key, handling the normalization.
 */
function findGroup(groups, key) {
  const normalized = normalizeGroupKey(key);
  return groups.find(g => normalizeGroupKey(g.group_key) === normalized);
}

/**
 * Safely extract text content from a group's artifacts by artifact_type.
 * When content is a JSON object or JSON string, formats it as readable markdown.
 */
export function extractArtifactContent(group, artifactType) {
  if (!group?.artifacts) return '';
  const artifact = group.artifacts.find(a =>
    a.artifact_type === artifactType || a.title?.toLowerCase().includes(artifactType.toLowerCase())
  );
  if (!artifact?.content) return '';
  return formatArtifactContent(artifact.content);
}

/**
 * Format a JSON artifact object as human-readable markdown.
 * Recognizes common artifact shapes and extracts key fields.
 */
export function formatJsonArtifact(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (Array.isArray(obj)) return obj.map(formatJsonArtifact).filter(Boolean).join('\n\n');

  const lines = [];

  // Product definition artifacts
  if (obj.description || obj.problemStatement || obj.valueProp) {
    if (obj.description) lines.push(obj.description);
    if (obj.problemStatement) lines.push(`\n**Problem**: ${obj.problemStatement}`);
    if (obj.valueProp) lines.push(`**Value Proposition**: ${obj.valueProp}`);
    if (obj.targetMarket) lines.push(`**Target Market**: ${obj.targetMarket}`);
    if (obj.moatStrategy) lines.push(`**Moat**: ${obj.moatStrategy}`);
    return lines.join('\n');
  }

  // Customer personas
  if (obj.customerPersonas && Array.isArray(obj.customerPersonas)) {
    for (const p of obj.customerPersonas.slice(0, 3)) {
      lines.push(`### ${p.name || 'Persona'}`);
      if (p.demographics?.role) lines.push(`- **Role**: ${p.demographics.role}`);
      if (p.goals?.length) lines.push(`- **Goals**: ${p.goals.slice(0, 3).join('; ')}`);
      if (p.painPoints?.length) lines.push(`- **Pain Points**: ${p.painPoints.slice(0, 3).join('; ')}`);
    }
    return lines.join('\n');
  }

  // Vision / roadmap
  if (obj.vision_statement || obj.milestones) {
    if (obj.vision_statement) lines.push(obj.vision_statement);
    if (obj.milestones?.length) {
      lines.push('\n**Milestones**:');
      for (const m of obj.milestones.slice(0, 4)) {
        lines.push(`- **${m.name}** (${m.priority || 'planned'}): ${m.deliverables?.slice(0, 3).join(', ') || ''}`);
      }
    }
    return lines.join('\n');
  }

  // Competitive analysis
  if (obj.competitors && Array.isArray(obj.competitors)) {
    for (const c of obj.competitors.slice(0, 3)) {
      lines.push(`- **${c.name}** (Threat: ${c.threat || '?'}): ${c.position || ''}`);
    }
    return lines.join('\n');
  }

  // Market tiers
  if (obj.marketTiers && Array.isArray(obj.marketTiers)) {
    for (const t of obj.marketTiers.slice(0, 3)) {
      lines.push(`- **${t.name}**: ${t.description || ''} (TAM: $${(t.tam / 1e6).toFixed(1)}M)`);
    }
    return lines.join('\n');
  }

  // Naming strategy
  if (obj.namingStrategy) {
    if (obj.namingStrategy.rationale) lines.push(obj.namingStrategy.rationale);
    if (obj.candidates?.length) {
      lines.push('\n**Name Candidates**: ' + obj.candidates.slice(0, 3).map(c => c.name).join(', '));
    }
    return lines.join('\n');
  }

  // Portfolio evaluation / cross-reference (summary only)
  if (obj.portfolio_evaluation || obj.cross_reference) {
    if (obj.portfolio_evaluation?.summary) lines.push(obj.portfolio_evaluation.summary);
    if (obj.problem_reframing?.original_problem) {
      lines.push(`\n**Problem**: ${obj.problem_reframing.original_problem}`);
    }
    return lines.join('\n');
  }

  // Wireframes
  if (obj.wireframes?.screens) {
    for (const screen of obj.wireframes.screens.slice(0, 4)) {
      lines.push(`**${screen.name || 'Screen'}**: ${screen.purpose || ''}`);
      if (screen.ascii_layout) lines.push('```\n' + screen.ascii_layout.slice(0, 300) + '\n```');
    }
    return lines.join('\n');
  }

  // Architecture artifacts — handled by extractArchitectureSection
  if (obj.architecture_summary || obj.layers) {
    return formatArchitectureOverview(obj);
  }

  // Strategic analysis
  if (obj.analysis?.strategic) {
    return summarizeContent(obj.analysis.strategic, 300);
  }

  // Fallback: extract string values from top-level keys
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && val.length > 10 && val.length < 500) {
      lines.push(`**${key.replace(/_/g, ' ')}**: ${val}`);
    }
  }
  return lines.join('\n') || JSON.stringify(obj, null, 2);
}

/**
 * Format the full architecture object as a readable overview.
 */
function formatArchitectureOverview(obj) {
  const lines = [];
  if (obj.architecture_summary) lines.push(obj.architecture_summary);
  if (obj.layers) {
    lines.push('\n**Layers**:');
    for (const [name, layer] of Object.entries(obj.layers)) {
      if (layer?.technology) {
        lines.push(`- **${name}**: ${layer.technology} — ${layer.components?.join(', ') || ''}`);
      }
    }
  }
  if (obj.security?.authStrategy) {
    lines.push(`\n**Auth**: ${obj.security.authStrategy}`);
  }
  return lines.join('\n');
}

/**
 * Parse artifact content to an object if it's a JSON string.
 */
function parseContent(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return null; }
    }
  }
  return null;
}

/**
 * Extract a specific sub-section from an architecture artifact.
 * Used to deduplicate Data Model / API / Architecture sections.
 */
export function extractArchitectureSection(group, section) {
  if (!group?.artifacts) return '';
  for (const artifact of group.artifacts) {
    const content = parseContent(artifact.content);
    if (!content || typeof content !== 'object') continue;

    if (section === 'data_model' && content.dataEntities) {
      const lines = ['**Entities**:'];
      for (const e of content.dataEntities.slice(0, 10)) {
        lines.push(`- **${e.name}**: ${e.description || e.desc || ''}`);
      }
      return lines.join('\n');
    }

    if (section === 'api' && content.layers?.api) {
      const api = content.layers.api;
      const lines = [];
      if (api.technology) lines.push(`**Protocol**: ${api.technology}`);
      if (api.components?.length) {
        lines.push('**Endpoints**: ' + api.components.join(', '));
      }
      if (api.rationale) lines.push(`\n${api.rationale}`);
      return lines.join('\n');
    }

    if (section === 'architecture' && (content.architecture_summary || content.layers)) {
      return formatArchitectureOverview(content);
    }
  }
  return '';
}

/**
 * Try to parse content that may be a JSON string and format it as markdown.
 * Returns formatted markdown if content is parseable JSON, otherwise the original string.
 */
export function formatArtifactContent(content) {
  if (!content) return '';
  if (typeof content === 'object') return formatJsonArtifact(content);
  if (typeof content !== 'string') return String(content);
  // Detect JSON strings
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const formatted = formatJsonArtifact(parsed);
      if (formatted && formatted.length > 0) return formatted;
    } catch {
      // Not valid JSON, fall through
    }
  }
  return content;
}

/**
 * Get display name from a group (handles both SQL field names).
 */
function groupDisplayName(group) {
  return group.group_name || group.group || group.group_key || 'Unknown';
}

/**
 * Summarize text to a max character count, respecting paragraph boundaries.
 */
export function summarizeContent(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  // Try to break at a paragraph boundary
  const truncated = text.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.6) {
    return truncated.slice(0, lastParagraph) + '\n\n_[Condensed for brevity]_';
  }
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.7) {
    return truncated.slice(0, lastSentence + 1) + ' _[Condensed]_';
  }
  return truncated + '...';
}

/**
 * Convert a feature name to a filename-safe slug.
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Detect tech stack from architecture artifacts.
 */
function detectStack(groups, { targetPlatform = 'web' } = {}) {
  const archGroup = findGroup(groups, 'how_to_build_it');
  const isMobile = targetPlatform === 'mobile' || targetPlatform === 'both';

  let techStack = isMobile ? 'React Native + Expo + Supabase' : 'React + TypeScript + Supabase';
  let framework = isMobile ? 'Expo (React Native)' : 'Vite';

  if (archGroup) {
    const archContent = JSON.stringify(archGroup.artifacts.map(a => a.content));
    if (!isMobile) {
      if (archContent.includes('Next.js') || archContent.includes('next')) framework = 'Next.js';
    }
    if (archContent.includes('FastAPI') || archContent.includes('fastapi')) techStack = 'FastAPI + Python';
  }

  return { techStack, framework, isMobile, targetPlatform };
}

/**
 * Extract sprint items from the sprint_plan group.
 */
function extractSprintItems(groups) {
  const sprintGroup = findGroup(groups, 'sprint_plan');
  if (!sprintGroup?.artifacts?.length) return [];

  const items = [];
  for (const artifact of sprintGroup.artifacts) {
    if (!artifact.content) continue;
    const content = parseContent(artifact.content) || {};
    const rawItems = content.items || content.sprint_items || [];
    if (Array.isArray(rawItems)) {
      for (const item of rawItems) {
        items.push({
          name: item.name || item.title || 'Unnamed Task',
          description: item.description || item.scope || '',
          storyPoints: item.story_points || item.points || 0,
          priority: item.priority || 'medium',
          acceptanceCriteria: item.success_criteria || item.acceptanceCriteria || item.acceptance_criteria || '',
        });
      }
    }
  }
  return items;
}

// ── Format 1: replit.md ────────────────────────────────

/**
 * Generate a replit.md persistent context file.
 *
 * @param {Array} groups - RPC groups array
 * @param {object} venture - { name, description }
 * @param {object} summary - RPC summary
 * @returns {string} Markdown content for replit.md
 */
export function formatReplitMd(groups, venture, summary) {
  const { techStack, framework } = detectStack(groups, { targetPlatform: venture.targetPlatform || 'web' });
  const lines = [];

  // Header
  lines.push(`# ${venture.name || 'Venture'}`);
  lines.push('');
  if (venture.description) {
    lines.push(`> ${venture.description}`);
    lines.push('');
  }

  // Project Overview
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    lines.push('## Project Overview');
    for (const artifact of buildGroup.artifacts) {
      if (!artifact.content) continue;
      lines.push(summarizeContent(formatArtifactContent(artifact.content), 1500));
      lines.push('');
    }
  }

  // Target Audience
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    lines.push('## Target Audience');
    for (const artifact of audienceGroup.artifacts) {
      if (!artifact.content) continue;
      lines.push(summarizeContent(formatArtifactContent(artifact.content), 1000));
      lines.push('');
    }
  }

  // Branding — extract from identity_naming_visual (Stage 11)
  const brandGroup = findGroup(groups, 'who_its_for');
  if (brandGroup) {
    const namingArtifact = brandGroup.artifacts.find(a =>
      a.artifact_type === 'identity_naming_visual' || a.title?.toLowerCase().includes('naming')
    );
    if (namingArtifact?.content) {
      const brandData = parseContent(namingArtifact.content) || {};
      lines.push('## Branding');

      // Product name
      const selectedName = brandData.decision?.selectedName || brandData.decision?.name;
      if (selectedName) {
        lines.push(`- **Product Name**: ${selectedName}`);
      } else if (brandData.candidates?.length) {
        const top = brandData.candidates[0];
        lines.push(`- **Product Name**: ${top.name || top}`);
      }

      // Color palette
      const colors = brandData.visualIdentity?.colorPalette;
      if (colors?.length) {
        lines.push('- **Color Palette**:');
        for (const color of colors.slice(0, 5)) {
          lines.push(`  - \`${color.hex}\` ${color.name}: ${color.usage || ''}`);
        }
      }

      // Typography
      const typo = brandData.visualIdentity?.typography;
      if (typo) {
        lines.push('- **Typography**:');
        if (Array.isArray(typo)) {
          for (const t of typo.slice(0, 3)) {
            lines.push(`  - ${t.name || t.role}: \`${t.font || t.fontFamily || t.family}\` — ${t.usage || ''}`);
          }
        } else if (typo.primary) {
          lines.push(`  - Primary: \`${typo.primary}\``);
        }
      }

      // Tagline / tone
      if (brandData.brandExpression?.tagline) {
        lines.push(`- **Tagline**: "${brandData.brandExpression.tagline}"`);
      }
      if (brandData.brandExpression?.toneKeywords?.length) {
        lines.push(`- **Tone**: ${brandData.brandExpression.toneKeywords.join(', ')}`);
      }
      lines.push('');
    }
  }

  // Tech Stack
  lines.push('## Tech Stack');
  lines.push(`- **Framework**: ${framework}`);
  lines.push(`- **Stack**: ${techStack}`);
  lines.push('- **Database**: Supabase (PostgreSQL with RLS)');
  lines.push('- **Auth**: Supabase Auth');
  lines.push('');

  // Data Model / API / Architecture — deduplicated extraction
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (archGroup) {
    // Try targeted extraction first (handles JSON architecture objects)
    const dataModel = extractArchitectureSection(archGroup, 'data_model') ||
      extractArtifactContent(archGroup, 'data_model') ||
      extractArtifactContent(archGroup, 'schema');
    if (dataModel) {
      lines.push('## Data Model');
      lines.push(summarizeContent(dataModel, 2000));
      lines.push('');
    }

    const apiContract = extractArchitectureSection(archGroup, 'api') ||
      extractArtifactContent(archGroup, 'api_contract');
    if (apiContract) {
      lines.push('## API Patterns');
      lines.push(summarizeContent(apiContract, 1500));
      lines.push('');
    }

    // Only show Architecture if it's distinct from above sections
    const architecture = extractArchitectureSection(archGroup, 'architecture');
    if (architecture && architecture !== dataModel && architecture !== apiContract) {
      lines.push('## Architecture');
      lines.push(summarizeContent(architecture, 2000));
      lines.push('');
    }
  }

  // Wireframes — extract screen list from Stage 15
  if (archGroup) {
    const wireframeArtifact = archGroup.artifacts.find(a =>
      a.artifact_type === 'blueprint_wireframes' || a.title?.toLowerCase().includes('wireframe')
    );
    if (wireframeArtifact?.content) {
      const wfData = parseContent(wireframeArtifact.content) || {};
      const screens = wfData.wireframes?.screens || wfData.screens || [];
      if (screens.length > 0) {
        lines.push('## Application Screens');
        lines.push(`This app has ${screens.length} screens. Build ALL of them:`);
        lines.push('');
        for (const screen of screens) {
          lines.push(`### ${screen.name || 'Screen'}`);
          if (screen.purpose) lines.push(`Purpose: ${screen.purpose}`);
          if (screen.persona) lines.push(`Primary user: ${screen.persona}`);
          if (screen.ascii_layout) {
            lines.push('```');
            lines.push(screen.ascii_layout.slice(0, 500));
            lines.push('```');
          }
          lines.push('');
        }
      }
    }
  }

  // Coding Standards (static)
  lines.push('## Coding Standards');
  lines.push('- TypeScript strict mode');
  lines.push('- Proper error handling on all API calls and async operations');
  lines.push('- Responsive design (mobile-first)');
  lines.push('- Semantic HTML with ARIA labels for accessibility');
  lines.push('- Component-based architecture with clear separation of concerns');
  lines.push('- Use environment variables for all secrets and configuration');
  lines.push('');

  // Monitoring & Error Tracking
  lines.push('## Monitoring & Error Tracking');
  lines.push('');
  lines.push('This venture is monitored by the EHG Software Factory self-healing loop.');
  lines.push('');
  lines.push('**Setup:**');
  lines.push('1. Install: `npm install @sentry/node`');
  lines.push('2. Initialize in entry point:');
  lines.push('   ```javascript');
  lines.push("   import * as Sentry from '@sentry/node';");
  lines.push("   Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'production' });");
  lines.push('   ```');
  lines.push('3. Add `SENTRY_DSN` to Replit Secrets (value provided by EHG provisioner)');
  lines.push('');
  if (venture?.metadata?.sentry?.dsn) {
    lines.push(`**DSN**: \`${venture.metadata.sentry.dsn}\``);
    lines.push('');
  }
  lines.push('> See `docs/monitoring.md` for framework-specific examples.');
  lines.push('');

  // User Feedback Page
  lines.push('## User Feedback (/feedback)');
  lines.push('');
  lines.push('This venture includes a built-in feedback page at `/feedback`.');
  lines.push('Users can report bugs, request features, and flag usability issues.');
  lines.push('');
  lines.push('**Implementation:**');
  lines.push('1. Create a feedback form page at `/feedback` with fields:');
  lines.push('   - `feedback_type`: dropdown (Bug Report, Feature Request, Usability Issue, Other)');
  lines.push('   - `description`: textarea (max 500 chars with counter)');
  lines.push('   - `contact_email`: optional email');
  lines.push('2. Submit directly to Supabase using the anon key:');
  lines.push('   ```javascript');
  lines.push("   const { error } = await supabase.from('feedback').insert({");
  lines.push("     feedback_type: 'user_bug', // or user_feature_request, user_usability, user_other");
  lines.push('     venture_id: import.meta.env.VITE_VENTURE_ID,');
  lines.push("     source_type: 'user_feedback',");
  lines.push('     content: description,');
  lines.push("     severity: 'medium',");
  lines.push('     metadata: { contact_email: email }');
  lines.push('   });');
  lines.push('   ```');
  lines.push('3. Add `VITE_VENTURE_ID` to Replit Secrets (provided by EHG provisioner)');
  lines.push('4. Rate limit: 50 submissions per hour per venture (enforced server-side)');
  lines.push('5. Add a "Feedback" link in footer or help menu navigation');
  lines.push('');

  // Git Workflow
  lines.push('## Git Workflow');
  lines.push('- Push to feature branch: `replit/sprint-1`');
  lines.push('- Do NOT push to `main` directly');
  lines.push('- Write descriptive commit messages');
  lines.push('- Include a README with setup instructions');
  lines.push('');

  return lines.join('\n');
}

// ── Format 2: Plan Mode Prompt ─────────────────────────

const PLAN_MODE_BUDGET = 2000;

/**
 * Generate a Plan Mode prompt for Replit.
 *
 * @param {Array} groups - RPC groups array
 * @param {object} venture - { name, description }
 * @param {object} summary - RPC summary
 * @returns {string} Concise plan mode prompt (<2000 chars)
 */
export function formatPlanModePrompt(groups, venture, summary) {
  const items = extractSprintItems(groups);
  const { framework } = detectStack(groups, { targetPlatform: venture.targetPlatform || 'web' });
  const lines = [];

  // One-sentence project description
  const desc = venture.description || `${venture.name || 'Venture'} application`;
  lines.push(`Build a ${framework} application: ${summarizeContent(desc, 150)}`);
  lines.push('');

  // MVP features from sprint items
  if (items.length > 0) {
    lines.push('MVP Features:');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const descText = item.description ? ` — ${item.description}` : '';
      const line = `${i + 1}. ${item.name} (${item.storyPoints} pts)${descText}`;
      lines.push(line);
      if (item.acceptanceCriteria) lines.push(`   Done when: ${item.acceptanceCriteria}`);
    }
    lines.push('');
  }

  // Architecture summary (condensed)
  const decisionsGroup = findGroup(groups, 'why_these_decisions');
  if (decisionsGroup?.artifacts?.length) {
    const firstDecision = decisionsGroup.artifacts[0];
    const content = formatArtifactContent(firstDecision.content);
    lines.push(`Architecture: ${summarizeContent(content, 200)}`);
    lines.push('');
  }

  // Build readiness
  const readinessGroup = findGroup(groups, 'build_readiness');
  if (readinessGroup?.artifacts?.length) {
    lines.push('Build readiness: Stages 1-18 complete.');
  }

  // Out of scope
  lines.push('');
  lines.push('Out of Scope for this sprint:');
  lines.push('- Social login / OAuth providers');
  lines.push('- Email notifications');
  lines.push('- Admin dashboard');
  lines.push('- Analytics / tracking');

  let prompt = lines.join('\n');

  // Enforce budget: truncate feature descriptions if over limit
  if (prompt.length > PLAN_MODE_BUDGET) {
    const shortLines = [];
    shortLines.push(`Build a ${framework} app: ${venture.name || 'Venture'}`);
    shortLines.push('');
    shortLines.push('MVP Features:');
    for (let i = 0; i < items.length; i++) {
      shortLines.push(`${i + 1}. ${items[i].name} (${items[i].storyPoints} pts)`);
    }
    shortLines.push('');
    shortLines.push('Build in order listed. Refer to replit.md for full context.');
    prompt = shortLines.join('\n');
  }

  return prompt;
}

// ── Format 3: Per-Feature Prompts ──────────────────────

/**
 * Generate one prompt per sprint item.
 *
 * @param {Array} groups - RPC groups array
 * @param {object} venture - { name, description }
 * @param {object} summary - RPC summary
 * @returns {Array<{filename: string, content: string, charCount: number}>}
 */
export function formatFeaturePrompts(groups, venture, summary) {
  const items = extractSprintItems(groups);
  if (items.length === 0) return [];

  const archGroup = findGroup(groups, 'how_to_build_it');
  const archContent = archGroup?.artifacts?.map(a =>
    typeof a.content === 'string' ? a.content : JSON.stringify(a.content)
  ).join(' ') || '';

  return items.map((item, index) => {
    const num = String(index + 1).padStart(2, '0');
    const filename = `${num}-${slugify(item.name)}.md`;
    const lines = [];

    // Feature header
    lines.push(`# Feature: ${item.name}`);
    lines.push('');
    if (item.description) {
      lines.push(item.description);
      lines.push('');
    }

    // Story points and priority
    lines.push(`**Story Points**: ${item.storyPoints} | **Priority**: ${item.priority}`);
    lines.push('');

    // Acceptance criteria (from S19 sprint planning)
    if (item.acceptanceCriteria) {
      lines.push('### Acceptance Criteria');
      lines.push(item.acceptanceCriteria);
      lines.push('');
    }

    // Build order context
    if (items.length > 1) {
      lines.push(`> This is feature ${index + 1} of ${items.length}.`);
      if (index > 0) {
        lines.push(`> Build after: ${items[index - 1].name}`);
      }
      lines.push('');
    }

    // Relevant architecture (keyword match)
    const keywords = item.name.toLowerCase().split(/\s+/);
    const relevantArch = keywords.some(kw => kw.length > 3 && archContent.toLowerCase().includes(kw));
    if (relevantArch && archGroup) {
      const matchedArtifact = archGroup.artifacts.find(a => {
        const c = typeof a.content === 'string' ? a.content : JSON.stringify(a.content);
        return keywords.some(kw => kw.length > 3 && c.toLowerCase().includes(kw));
      });
      if (matchedArtifact) {
        const matchContent = formatArtifactContent(matchedArtifact.content);
        lines.push('**Relevant Architecture:**');
        lines.push(summarizeContent(matchContent, 500));
        lines.push('');
      }
    }

    // Logo instruction for first feature (landing page / index)
    if (index === 0) {
      lines.push('');
      lines.push('**Logo:**');
      lines.push('- If `docs/stitch/DESIGN.md` exists, use the logo specs from it');
      lines.push('- Otherwise, generate a simple SVG text logo using the app name and primary brand color from replit.md');
      lines.push('- Save as `public/logo.svg` and reference it in the header/nav');
    }

    // Instructions
    lines.push('');
    lines.push('**Instructions:**');
    lines.push('- Refer to replit.md for project context, tech stack, and coding standards');
    lines.push('- Implement this feature completely before moving to the next');
    lines.push('- Test the feature works end-to-end before proceeding');
    lines.push('- Checkpoint after completion');

    const content = lines.join('\n');
    return { filename, content, charCount: content.length };
  });
}

// ── Format 3b: Wireframe-Based Feature Prompts ────────

/**
 * Extract wireframe screens from the how_to_build_it group.
 */
function extractWireframeScreens(groups) {
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (!archGroup?.artifacts?.length) return [];

  const wfArtifact = archGroup.artifacts.find(a =>
    a.artifact_type === 'blueprint_wireframes' || a.title?.toLowerCase().includes('wireframe')
  );
  if (!wfArtifact?.content) return [];

  const content = parseContent(wfArtifact.content) || {};
  return content.wireframes?.screens || content.screens || [];
}

/**
 * Generate one prompt per wireframe screen (full scope, not just sprint MVP).
 *
 * @param {Array} groups - RPC groups array
 * @param {object} venture - { name, description }
 * @param {object} summary - RPC summary
 * @returns {Array<{filename: string, content: string, charCount: number}>}
 */
export function formatWireframePrompts(groups, venture, summary) {
  const screens = extractWireframeScreens(groups);
  if (screens.length === 0) return [];

  return screens.map((screen, index) => {
    const num = String(index + 1).padStart(2, '0');
    const name = screen.name || `Screen ${index + 1}`;
    const filename = `${num}-${slugify(name)}.md`;
    const lines = [];

    lines.push(`# Screen: ${name}`);
    lines.push('');
    if (screen.purpose) {
      lines.push(`**Purpose**: ${screen.purpose}`);
      lines.push('');
    }
    if (screen.persona) {
      lines.push(`**Primary User**: ${screen.persona}`);
      lines.push('');
    }

    // ASCII wireframe layout
    if (screen.ascii_layout) {
      lines.push('**Layout Reference:**');
      lines.push('```');
      lines.push(screen.ascii_layout);
      lines.push('```');
      lines.push('');
    }

    // Build order
    if (screens.length > 1) {
      lines.push(`> Screen ${index + 1} of ${screens.length}.`);
      if (index > 0) {
        lines.push(`> Build after: ${screens[index - 1].name || `Screen ${index}`}`);
      }
      lines.push('');
    }

    lines.push('**Instructions:**');
    lines.push('- Refer to replit.md for branding (colors, typography, product name)');
    lines.push('- Refer to `docs/wireframes.md` for full wireframe specifications and screen flow');
    lines.push('- If available, refer to `docs/stitch/DESIGN.md` for design tokens and component specs');
    lines.push('- Match the wireframe layout as closely as possible');
    lines.push('- Implement all interactive elements shown in the wireframe');
    lines.push('- Ensure responsive design (mobile-first)');
    lines.push('- Test the screen works end-to-end before proceeding');
    lines.push('- Checkpoint after completion');

    const content = lines.join('\n');
    return { filename, content, charCount: content.length };
  });
}
