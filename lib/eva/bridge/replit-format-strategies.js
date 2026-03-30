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
function detectStack(groups) {
  const archGroup = findGroup(groups, 'how_to_build_it');
  let techStack = 'React + TypeScript + Supabase';
  let framework = 'Vite';

  if (archGroup) {
    const archContent = JSON.stringify(archGroup.artifacts.map(a => a.content));
    if (archContent.includes('Next.js') || archContent.includes('next')) framework = 'Next.js';
    if (archContent.includes('FastAPI') || archContent.includes('fastapi')) techStack = 'FastAPI + Python';
    if (archContent.includes('React Native') || archContent.includes('expo')) techStack = 'React Native + Expo';
  }

  return { techStack, framework };
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
  const { techStack, framework } = detectStack(groups);
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

  // Coding Standards (static)
  lines.push('## Coding Standards');
  lines.push('- TypeScript strict mode');
  lines.push('- Proper error handling on all API calls and async operations');
  lines.push('- Responsive design (mobile-first)');
  lines.push('- Semantic HTML with ARIA labels for accessibility');
  lines.push('- Component-based architecture with clear separation of concerns');
  lines.push('- Use environment variables for all secrets and configuration');
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
  const { framework } = detectStack(groups);
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

    // Instructions
    lines.push('**Instructions:**');
    lines.push('- Refer to replit.md for project context, tech stack, and coding standards');
    lines.push('- Implement this feature completely before moving to the next');
    lines.push('- Test the feature works end-to-end before proceeding');
    lines.push('- Checkpoint after completion');

    const content = lines.join('\n');
    return { filename, content, charCount: content.length };
  });
}
