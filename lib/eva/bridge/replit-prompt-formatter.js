/**
 * Replit Prompt Formatter
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-1)
 *
 * Transforms export_blueprint_review RPC output into a structured
 * prompt suitable for Replit Agent. The prompt includes all planning
 * artifacts from Stages 1-17 organized into builder-friendly sections.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_BUDGET_WARN = 50000; // chars (~12.5K tokens)

/**
 * Format a single artifact group into a prompt section.
 */
function formatGroup(group) {
  if (!group || !group.artifacts || group.artifacts.length === 0) return '';

  const lines = [`### ${group.group_name || group.group}`];
  for (const artifact of group.artifacts) {
    if (!artifact.content) continue;
    lines.push(`#### ${artifact.title || artifact.artifact_type} (Stage ${artifact.lifecycle_stage})`);
    const content = typeof artifact.content === 'string'
      ? artifact.content
      : JSON.stringify(artifact.content, null, 2);
    lines.push(content);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Build Replit-specific instructions based on tech stack and architecture.
 */
function buildReplitInstructions(groups) {
  const archGroup = groups.find(g => g.group_key === 'how_to_build_it');
  let techStack = 'React + TypeScript + Supabase';
  let framework = 'Vite';

  if (archGroup) {
    const archContent = JSON.stringify(archGroup.artifacts.map(a => a.content));
    if (archContent.includes('Next.js') || archContent.includes('next')) framework = 'Next.js';
    if (archContent.includes('FastAPI') || archContent.includes('fastapi')) techStack = 'FastAPI + Python';
    if (archContent.includes('React Native') || archContent.includes('expo')) techStack = 'React Native + Expo';
  }

  return `## Build Instructions for Replit Agent

**Framework**: ${framework}
**Stack**: ${techStack}
**Database**: Supabase (connect via environment variables)

### Setup Steps
1. Create a new ${framework} project with TypeScript
2. Install Supabase client: \`@supabase/supabase-js\`
3. Configure environment variables for SUPABASE_URL and SUPABASE_ANON_KEY
4. Implement features according to the sprint items below
5. Ensure all routes and components are functional
6. Run tests before pushing to GitHub

### Code Quality Requirements
- TypeScript strict mode
- Proper error handling on all API calls
- Responsive design (mobile-first)
- Accessibility basics (semantic HTML, ARIA labels)

### Monitoring & Error Tracking
1. Install Sentry SDK: \`npm install @sentry/node\`
2. Add to your entry point (server.js / index.js / app.js):
   \`\`\`javascript
   import * as Sentry from '@sentry/node';
   Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'production' });
   \`\`\`
3. Add \`SENTRY_DSN\` to environment variables (provided by EHG provisioner)
4. Wrap error-prone operations with \`Sentry.captureException(error)\`

> This enables the EHG Software Factory self-healing loop to detect and auto-fix errors.

### GitHub Integration
- Push to a feature branch: \`replit/sprint-1\`
- Do NOT push to \`main\` directly
- Include a README with setup instructions
`;
}

/**
 * Export venture planning artifacts as a Replit-ready prompt.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options] - Formatting options
 * @param {boolean} [options.compact] - Use compact mode (summarize verbose sections)
 * @param {boolean} [options.includeInstructions] - Include Replit-specific build instructions (default: true)
 * @returns {Promise<{prompt: string, charCount: number, groupCount: number, warnings: string[]}>}
 */
export async function formatReplitPrompt(ventureId, options = {}) {
  const { compact = false, includeInstructions = true } = options;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Call the export_blueprint_review RPC
  const { data, error } = await supabase.rpc('export_blueprint_review', {
    p_venture_id: ventureId
  });

  if (error) {
    throw new Error(`export_blueprint_review failed: ${error.message}`);
  }

  if (!data || !data.groups || data.groups.length === 0) {
    throw new Error(`No planning artifacts found for venture ${ventureId}. Ensure Stages 1-17 are complete.`);
  }

  const warnings = [];
  const groups = data.groups;
  const summary = data.summary || {};

  // Get venture name for the prompt header
  const { data: venture } = await supabase
    .from('ventures')
    .select('name, description')
    .eq('id', ventureId)
    .single();

  const ventureName = venture?.name || 'Venture';
  const ventureDesc = venture?.description || '';

  // Build the prompt sections
  const sections = [];

  // Header
  sections.push(`# Build Brief: ${ventureName}`);
  sections.push('');
  if (ventureDesc) {
    sections.push(`> ${ventureDesc}`);
    sections.push('');
  }
  sections.push(`**Artifacts**: ${summary.total_artifacts || 'N/A'} across ${summary.group_count || groups.length} groups`);
  sections.push(`**Quality Score**: ${summary.overall_quality_score || 'N/A'}`);
  sections.push('');

  // Replit-specific instructions
  if (includeInstructions) {
    sections.push(buildReplitInstructions(groups));
  }

  // Group order optimized for Replit Agent consumption
  const groupOrder = [
    'what_to_build',      // Core product definition
    'who_its_for',        // Users and market
    'how_to_build_it',       // Technical architecture (most critical for Replit)
    'what_it_costs',      // Pricing/monetization
    'why_these_decisions', // Decision rationale
    'build_readiness',    // Stage 18 readiness
    'sprint_plan',        // Stage 19 sprint items (what to actually build)
    'visual_convergence', // Design references
    'design_intelligence' // SRIP data
  ];

  sections.push('---');
  sections.push('## Planning Artifacts');
  sections.push('');

  for (const key of groupOrder) {
    const group = groups.find(g => g.group_key === key);
    if (!group) continue;

    const formatted = formatGroup(group);
    if (formatted) {
      if (compact && formatted.length > 3000) {
        // In compact mode, truncate verbose sections
        sections.push(formatted.slice(0, 3000));
        sections.push(`\n_[Truncated — ${formatted.length - 3000} chars omitted in compact mode]_\n`);
        warnings.push(`Group "${group.group_name || group.group}" truncated from ${formatted.length} to 3000 chars`);
      } else {
        sections.push(formatted);
      }
    }
  }

  // Sprint items get special treatment — extracted as actionable tasks
  const sprintGroup = groups.find(g => g.group_key === 'sprint_plan');
  if (sprintGroup && sprintGroup.artifacts.length > 0) {
    sections.push('---');
    sections.push('## Sprint Items (Actionable Tasks)');
    sections.push('');
    sections.push('Build these features in order of priority:');
    sections.push('');

    for (const artifact of sprintGroup.artifacts) {
      if (!artifact.content) continue;
      const content = typeof artifact.content === 'object' ? artifact.content : {};
      const items = content.items || content.sprint_items || [];

      if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const name = item.name || item.title || `Task ${i + 1}`;
          const desc = item.description || item.scope || '';
          const points = item.story_points || item.points || '?';
          sections.push(`${i + 1}. **${name}** (${points} pts)`);
          if (desc) sections.push(`   ${desc}`);
          sections.push('');
        }
      }
    }
  }

  const prompt = sections.join('\n');
  const charCount = prompt.length;

  if (charCount > TOKEN_BUDGET_WARN) {
    warnings.push(`Prompt is ${charCount} chars (>${TOKEN_BUDGET_WARN}). Consider using --compact mode.`);
  }

  return { prompt, charCount, groupCount: groups.length, warnings };
}

/**
 * Export venture planning artifacts in Replit-optimized multi-format bundle.
 * Produces 3 formats: replit.md, plan mode prompt, per-feature prompts.
 *
 * @param {string} ventureId
 * @param {object} [options]
 * @returns {Promise<{replitMd, planModePrompt, featurePrompts, warnings, manifest}>}
 */
export async function formatReplitOptimized(ventureId, options = {}) {
  const { scope = 'sprint' } = options; // 'sprint' (MVP) or 'wireframes' (full scope)
  const { formatReplitMd, formatPlanModePrompt, formatFeaturePrompts, formatWireframePrompts } =
    await import('./replit-format-strategies.js');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('export_blueprint_review', { p_venture_id: ventureId });
  if (error) throw new Error(`export_blueprint_review failed: ${error.message}`);
  if (!data?.groups?.length) throw new Error(`No planning artifacts found for venture ${ventureId}.`);

  const { data: venture } = await supabase
    .from('ventures').select('name, description').eq('id', ventureId).single();
  const ventureMeta = { name: venture?.name || 'Venture', description: venture?.description || '' };
  const summary = data.summary || {};
  const warnings = [];

  const replitMdContent = formatReplitMd(data.groups, ventureMeta, summary);
  const planContent = formatPlanModePrompt(data.groups, ventureMeta, summary);

  // Feature prompts: sprint-scoped (MVP) or wireframe-scoped (full app)
  let features;
  if (scope === 'wireframes') {
    features = formatWireframePrompts(data.groups, ventureMeta, summary);
    if (features.length === 0) {
      warnings.push('No wireframe screens found — falling back to sprint items');
      features = formatFeaturePrompts(data.groups, ventureMeta, summary);
    }
  } else {
    features = formatFeaturePrompts(data.groups, ventureMeta, summary);
  }

  if (replitMdContent.length > 15000) {
    warnings.push(`replit.md is ${replitMdContent.length} chars (>15000 target)`);
  }
  if (planContent.length > 2000) {
    warnings.push(`Plan mode prompt is ${planContent.length} chars (>2000 target)`);
  }

  const totalChars = replitMdContent.length + planContent.length +
    features.reduce((sum, f) => sum + f.charCount, 0);

  return {
    replitMd: { content: replitMdContent, charCount: replitMdContent.length },
    planModePrompt: { content: planContent, charCount: planContent.length },
    featurePrompts: features,
    warnings,
    manifest: {
      ventureId,
      ventureName: ventureMeta.name,
      exportedAt: new Date().toISOString(),
      totalCharCount: totalChars,
      featureCount: features.length,
      formatVersion: '2.0',
    },
  };
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const args = process.argv.slice(2);
  const ventureId = args.find(a => !a.startsWith('--'));
  const compact = args.includes('--compact');
  const json = args.includes('--json');

  if (!ventureId) {
    console.error('Usage: node lib/eva/bridge/replit-prompt-formatter.js <venture-id> [--compact] [--json]');
    process.exit(1);
  }

  formatReplitPrompt(ventureId, { compact })
    .then(result => {
      if (json) {
        console.log(JSON.stringify({
          charCount: result.charCount,
          groupCount: result.groupCount,
          warnings: result.warnings
        }, null, 2));
        // Write prompt to stdout separately for piping
        process.stdout.write(result.prompt);
      } else {
        if (result.warnings.length > 0) {
          console.error('Warnings:');
          result.warnings.forEach(w => console.error(`  - ${w}`));
          console.error('');
        }
        console.error(`[${result.charCount} chars, ${result.groupCount} groups]`);
        console.log(result.prompt);
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
