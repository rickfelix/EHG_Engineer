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
import { isMainModule } from '../../utils/is-main-module.js';
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

### Security Requirements
**Row Level Security (RLS)**:
- Enable RLS on EVERY public table: \`ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;\`
- Every policy MUST scope to the authenticated user via \`auth.uid()\`
- NEVER use \`USING (true)\` — this makes the table readable/writable by everyone
- Create separate policies for SELECT, INSERT, UPDATE, DELETE as needed

**Key Management**:
- \`SUPABASE_ANON_KEY\` is safe for client-side code (designed for browser use with RLS)
- \`SUPABASE_SERVICE_ROLE_KEY\` MUST NEVER appear in client code — it bypasses RLS entirely
- All third-party API keys (Stripe, AI providers, etc.) belong in Supabase Edge Functions only
- Use \`Deno.env.get()\` inside Edge Functions to access secrets

**SECURITY DEFINER Functions**:
- Avoid \`SECURITY DEFINER\` on PostgreSQL functions — they execute as the function owner (superuser), bypassing all RLS policies
- If unavoidable, add explicit \`auth.uid()\` checks inside the function body

**Rate Limiting**:
- Edge Functions handling sensitive operations (payments, auth, AI calls) must implement rate limiting
- Use Supabase's built-in rate limiting or a simple in-memory counter per user

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

### User Feedback Page (/feedback)
Every venture includes a built-in feedback form at \`/feedback\`.

**Create a file at \`src/pages/feedback.tsx\` (or \`app/feedback/page.tsx\` for Next.js):**

1. **Form fields**:
   - \`feedback_type\`: dropdown with options: "Bug Report", "Feature Request", "Usability Issue", "Other"
   - \`description\`: textarea (max 500 characters, show char count)
   - \`contact_email\`: optional email field
   - Submit button

2. **Submission**: POST directly to Supabase using the anon key:
   \`\`\`javascript
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
   );

   // Map UI labels to DB values
   const typeMap = { 'Bug Report': 'user_bug', 'Feature Request': 'user_feature_request',
     'Usability Issue': 'user_usability', 'Other': 'user_other' };

   const { error } = await supabase.from('feedback').insert({
     feedback_type: typeMap[selectedType],
     venture_id: process.env.NEXT_PUBLIC_VENTURE_ID || import.meta.env.VITE_VENTURE_ID,
     source_type: 'user_feedback',
     content: description,
     severity: 'medium',
     metadata: { contact_email: email || null }
   });
   \`\`\`

3. **UX**: Show success toast on submit, rate limit error message if blocked (50/hr max).
4. **Navigation**: Add a "Feedback" link in footer or help menu.

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
/**
 * Build Supabase connection section for Replit prompts.
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-C-A
 *
 * Reads venture_resources to find Supabase project config and generates
 * connection instructions with proper security guidance.
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<string|null>} Markdown section or null if no Supabase configured
 */
async function buildSupabaseConnectionSection(supabase, ventureId) {
  try {
    const { data: resource } = await supabase
      .from('venture_resources')
      .select('resource_url, metadata')
      .eq('venture_id', ventureId)
      .eq('resource_type', 'supabase_project')
      .maybeSingle();

    if (!resource) return null;

    const projectUrl = resource.metadata?.project_url || resource.resource_url || '';
    const projectRef = resource.metadata?.project_ref || '';

    if (!projectUrl && !projectRef) return null;

    const lines = [
      '## Supabase Database Connection',
      '',
      '**This venture uses Supabase for database and authentication.**',
      '',
      '### Environment Variables',
      'Add these to your `.env` (or Replit Secrets):',
      '```',
      `VITE_SUPABASE_URL=${projectUrl || `https://${projectRef}.supabase.co`}`,
      'VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-dashboard>',
      '```',
      '',
      '### Client Setup',
      '```typescript',
      "import { createClient } from '@supabase/supabase-js';",
      '',
      'const supabase = createClient(',
      '  import.meta.env.VITE_SUPABASE_URL,',
      '  import.meta.env.VITE_SUPABASE_ANON_KEY',
      ');',
      '```',
      '',
      '### Security Rules',
      '- **VITE_SUPABASE_ANON_KEY** is safe for client-side code (designed for browser use with RLS)',
      '- **NEVER** include `SUPABASE_SERVICE_ROLE_KEY` in client code — it bypasses all Row Level Security',
      '- Server-side operations requiring elevated access should use Supabase Edge Functions',
      '',
    ];

    return lines.join('\n');
  } catch {
    return null;
  }
}

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

  // SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-C-A: Supabase connection instructions
  // Extract Supabase config from venture_resources and include connection guidance
  const supabaseSection = await buildSupabaseConnectionSection(supabase, ventureId);
  if (supabaseSection) {
    sections.push(supabaseSection);
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
          const ac = item.success_criteria || item.acceptanceCriteria || item.acceptance_criteria || '';
          if (ac) sections.push(`   **Done when**: ${ac}`);
          sections.push('');
        }
      }
    }
  }

  // Design References — surface available design artifacts for Replit builders
  const designGroup = groups.find(g => g.group_key === 'visual_convergence' || g.group_key === 'design_intelligence');
  const stitchGroup = groups.find(g => g.group_key === 'how_to_build_it');
  const hasDesignArtifacts = designGroup?.artifacts?.length > 0;
  const hasStitchExport = stitchGroup?.artifacts?.some(a =>
    a.artifact_type === 'stitch_design_export' || a.title?.toLowerCase().includes('design')
  );

  if (hasDesignArtifacts || hasStitchExport) {
    sections.push('---');
    sections.push('## Design References');
    sections.push('');
    sections.push('Use these design documents to guide your implementation:');
    if (hasDesignArtifacts) {
      sections.push('- `docs/wireframes.md` — Wireframe layouts and screen flow');
    }
    if (hasStitchExport) {
      sections.push('- `docs/stitch/DESIGN.md` — Design tokens, colors, typography, and component specs');
    }
    sections.push('');
  }

  // Logo Generation — instruct Replit to create a branded logo
  const brandGroup = groups.find(g => g.group_key === 'who_its_for');
  const brandArtifact = brandGroup?.artifacts?.find(a =>
    a.artifact_type === 'naming_brand_identity' || a.title?.toLowerCase().includes('brand')
  );
  if (brandArtifact?.content) {
    const brandData = typeof brandArtifact.content === 'object' ? brandArtifact.content : {};
    const ventureName = brandData.decision?.selectedName || brandData.decision?.name || '';
    const colors = brandData.visualIdentity?.colorPalette;
    const hasStitchLogo = hasStitchExport; // Stitch design export includes logo specs

    if (ventureName || colors?.length) {
      sections.push('---');
      sections.push('## Logo Generation');
      sections.push('');
      if (hasStitchLogo) {
        sections.push('A logo specification is available in `docs/stitch/DESIGN.md`. Use the logo specs from the Stitch design export.');
      } else {
        sections.push('Generate a simple SVG text logo for the application:');
        if (ventureName) sections.push(`- Text: "${ventureName}"`);
        if (colors?.length) sections.push(`- Primary color: \`${colors[0].hex}\``);
        sections.push('- Style: Clean, modern sans-serif. Save as `public/logo.svg`.');
      }
      sections.push('');
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
if (isMainModule(import.meta.url)) {
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
