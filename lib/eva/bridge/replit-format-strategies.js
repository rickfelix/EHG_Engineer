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
 */
export function extractArtifactContent(group, artifactType) {
  if (!group?.artifacts) return '';
  const artifact = group.artifacts.find(a =>
    a.artifact_type === artifactType || a.title?.toLowerCase().includes(artifactType.toLowerCase())
  );
  if (!artifact?.content) return '';
  return typeof artifact.content === 'string'
    ? artifact.content
    : JSON.stringify(artifact.content, null, 2);
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
    const content = typeof artifact.content === 'object' ? artifact.content : {};
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
      const content = typeof artifact.content === 'string'
        ? artifact.content : JSON.stringify(artifact.content, null, 2);
      lines.push(summarizeContent(content, 1500));
      lines.push('');
    }
  }

  // Target Audience
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    lines.push('## Target Audience');
    for (const artifact of audienceGroup.artifacts) {
      if (!artifact.content) continue;
      const content = typeof artifact.content === 'string'
        ? artifact.content : JSON.stringify(artifact.content, null, 2);
      lines.push(summarizeContent(content, 1000));
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

  // Data Model
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (archGroup) {
    const dataModel = extractArtifactContent(archGroup, 'data_model') ||
      extractArtifactContent(archGroup, 'schema');
    if (dataModel) {
      lines.push('## Data Model');
      lines.push(summarizeContent(dataModel, 2000));
      lines.push('');
    }

    const apiContract = extractArtifactContent(archGroup, 'api_contract') ||
      extractArtifactContent(archGroup, 'api');
    if (apiContract) {
      lines.push('## API Patterns');
      lines.push(summarizeContent(apiContract, 1500));
      lines.push('');
    }

    const architecture = extractArtifactContent(archGroup, 'architecture') ||
      extractArtifactContent(archGroup, 'technical');
    if (architecture) {
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
    const content = typeof firstDecision.content === 'string'
      ? firstDecision.content : JSON.stringify(firstDecision.content);
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
        const matchContent = typeof matchedArtifact.content === 'string'
          ? matchedArtifact.content : JSON.stringify(matchedArtifact.content, null, 2);
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
