/**
 * Replit Repo Seeder
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001
 *
 * Seeds a Replit-connected GitHub repo with curated reference documents
 * extracted from venture pipeline artifacts (Stages 0-19).
 *
 * Flow:
 *   1. Chairman creates blank Replit project, publishes to GitHub
 *   2. Chairman gives EHG the GitHub URL
 *   3. This module clones the repo, commits docs/ folder, pushes
 *   4. Replit syncs and has all reference files available
 *   5. Build prompts reference docs/ instead of inlining content
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  formatArtifactContent,
  normalizeGroupKey,
} from './replit-format-strategies.js';

/**
 * Parse content that may be a JSON string.
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

function findGroup(groups, key) {
  const normalized = normalizeGroupKey(key);
  return groups.find(g => normalizeGroupKey(g.group_key) === normalized);
}

// ── Document Generators ────────────────────────────

function generateBrandingDoc(groups) {
  const lines = ['# Branding & Personas\n'];

  // Personas from S10
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    const personaArt = buildGroup.artifacts.find(a =>
      a.artifact_type === 'identity_persona_brand' || a.lifecycle_stage === 10
    );
    if (personaArt?.content) {
      const data = parseContent(personaArt.content) || {};
      lines.push('## Customer Personas\n');

      const personas = data.customerPersonas || data.personas || [];
      if (Array.isArray(personas)) {
        for (const p of personas.slice(0, 5)) {
          lines.push(`### ${p.name || 'Persona'}`);
          if (p.demographics?.role) lines.push(`- **Role**: ${p.demographics.role}`);
          if (p.demographics?.age) lines.push(`- **Age**: ${p.demographics.age}`);
          if (p.goals?.length) lines.push(`- **Goals**: ${p.goals.slice(0, 4).join('; ')}`);
          if (p.painPoints?.length) lines.push(`- **Pain Points**: ${p.painPoints.slice(0, 4).join('; ')}`);
          if (p.techStack) lines.push(`- **Tech Stack**: ${p.techStack}`);
          lines.push('');
        }
      }

      // Brand genome
      if (data.brandGenome) {
        lines.push('## Brand Genome\n');
        const bg = data.brandGenome;
        if (bg.personality) lines.push(`- **Personality**: ${bg.personality}`);
        if (bg.values?.length) lines.push(`- **Values**: ${bg.values.join(', ')}`);
        if (bg.voice) lines.push(`- **Voice**: ${bg.voice}`);
        if (bg.archetype) lines.push(`- **Archetype**: ${bg.archetype}`);
        lines.push('');
      }
    }
  }

  // Naming & Visual Identity from S11
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    const namingArt = audienceGroup.artifacts.find(a =>
      a.artifact_type === 'identity_naming_visual'
    );
    if (namingArt?.content) {
      const data = parseContent(namingArt.content) || {};

      lines.push('## Product Name\n');
      const selectedName = data.decision?.selectedName || data.decision?.name;
      if (selectedName) {
        lines.push(`**Selected**: ${selectedName}`);
        if (data.decision?.rationale) lines.push(`\n${data.decision.rationale}`);
      } else if (data.candidates?.length) {
        lines.push(`**Top candidate**: ${data.candidates[0].name || data.candidates[0]}`);
      }
      lines.push('');

      // Colors
      const colors = data.visualIdentity?.colorPalette;
      if (colors?.length) {
        lines.push('## Color Palette\n');
        lines.push('| Color | Hex | Usage |');
        lines.push('|-------|-----|-------|');
        for (const c of colors) {
          lines.push(`| ${c.name} | \`${c.hex}\` | ${c.usage || ''} |`);
        }
        lines.push('');
      }

      // Typography
      const typo = data.visualIdentity?.typography;
      if (typo) {
        lines.push('## Typography\n');
        if (Array.isArray(typo)) {
          for (const t of typo) {
            lines.push(`- **${t.name || t.role}**: \`${t.font || t.fontFamily || t.family}\` — ${t.usage || ''}`);
          }
        } else if (typeof typo === 'object') {
          for (const [k, v] of Object.entries(typo)) {
            lines.push(`- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
          }
        }
        lines.push('');
      }

      // Brand expression
      if (data.brandExpression) {
        lines.push('## Brand Expression\n');
        if (data.brandExpression.tagline) lines.push(`- **Tagline**: "${data.brandExpression.tagline}"`);
        if (data.brandExpression.toneKeywords?.length) lines.push(`- **Tone**: ${data.brandExpression.toneKeywords.join(', ')}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generateArchitectureDoc(groups) {
  const lines = ['# Technical Architecture\n'];
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (!archGroup) return lines.join('\n');

  for (const artifact of archGroup.artifacts) {
    if (!artifact.content) continue;
    if (artifact.artifact_type === 'blueprint_wireframes') continue; // separate doc

    lines.push(`## ${artifact.title || artifact.artifact_type}\n`);
    lines.push(formatArtifactContent(artifact.content));
    lines.push('');
  }

  return lines.join('\n');
}

function generateWireframesDoc(groups, { targetPlatform = 'web' } = {}) {
  const lines = ['# Application Wireframes\n'];
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (!archGroup) return '';

  const wfArt = archGroup.artifacts.find(a =>
    a.artifact_type === 'blueprint_wireframes'
  );
  if (!wfArt?.content) return '';

  const data = parseContent(wfArt.content) || {};
  let screens = data.wireframes?.screens || data.screens || [];
  if (screens.length === 0) return '';

  // Filter screens by platform (SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-B)
  const MOBILE_KEYWORDS = /\b(mobile|phone|ios|android|app.home|on.the.go)\b/i;
  const DESKTOP_KEYWORDS = /\b(dashboard|admin|analytics|portal|editor|console|monitor)\b/i;

  if (targetPlatform === 'mobile') {
    const mobileScreens = screens.filter(s => {
      const text = `${s.name || ''} ${s.purpose || ''}`;
      return MOBILE_KEYWORDS.test(text) || !DESKTOP_KEYWORDS.test(text);
    });
    screens = mobileScreens.length > 0 ? mobileScreens : screens; // fallback to all if none match
  } else if (targetPlatform === 'web') {
    const webScreens = screens.filter(s => {
      const text = `${s.name || ''} ${s.purpose || ''}`;
      return DESKTOP_KEYWORDS.test(text) || !MOBILE_KEYWORDS.test(text);
    });
    screens = webScreens.length > 0 ? webScreens : screens;
  }
  // targetPlatform === 'both': keep all screens, mobile-first ordering
  if (targetPlatform === 'both') {
    const mobile = screens.filter(s => MOBILE_KEYWORDS.test(`${s.name || ''} ${s.purpose || ''}`));
    const other = screens.filter(s => !MOBILE_KEYWORDS.test(`${s.name || ''} ${s.purpose || ''}`));
    screens = [...mobile, ...other];
  }

  lines.push(`Platform: ${targetPlatform} | Screens: ${screens.length}\n`);

  for (const screen of screens) {
    lines.push(`## ${screen.name || 'Screen'}`);
    if (screen.purpose) lines.push(`**Purpose**: ${screen.purpose}`);
    if (screen.persona) lines.push(`**Primary user**: ${screen.persona}`);
    lines.push('');
    if (screen.ascii_layout) {
      lines.push('```');
      lines.push(screen.ascii_layout);
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateContextDoc(groups) {
  const lines = ['# Product Context\n'];

  // S1 Idea brief
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    const ideaArt = buildGroup.artifacts.find(a => a.artifact_type === 'truth_idea_brief');
    if (ideaArt?.content) {
      const data = parseContent(ideaArt.content) || {};
      lines.push('## Problem & Value Proposition\n');
      if (data.problemStatement) lines.push(`**Problem**: ${data.problemStatement}\n`);
      if (data.valueProp) lines.push(`**Value Proposition**: ${data.valueProp}\n`);
      if (data.targetMarket) lines.push(`**Target Market**: ${data.targetMarket}\n`);
      if (data.description) lines.push(`${data.description}\n`);
    }
  }

  // S4 Competitive analysis
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    const compArt = audienceGroup.artifacts.find(a =>
      a.artifact_type === 'truth_competitive_analysis'
    );
    if (compArt?.content) {
      const data = parseContent(compArt.content) || {};
      const competitors = data.competitors || [];
      if (competitors.length > 0) {
        lines.push('## Competitive Landscape\n');
        for (const c of competitors.slice(0, 5)) {
          const name = c.name || c.company || 'Competitor';
          const threat = c.threat || c.threatLevel || '?';
          lines.push(`- **${name}** (Threat: ${threat}): ${c.position || c.keyStrength || ''}`);
        }
        lines.push('');
      }
    }
  }

  // S13 Product roadmap
  if (buildGroup) {
    const roadmapArt = buildGroup.artifacts.find(a =>
      a.artifact_type === 'blueprint_product_roadmap'
    );
    if (roadmapArt?.content) {
      const data = parseContent(roadmapArt.content) || {};
      const milestones = data.milestones || [];
      if (milestones.length > 0) {
        lines.push('## Product Roadmap\n');
        for (const m of milestones.slice(0, 6)) {
          const name = m.name || m.title || 'Milestone';
          const deliverables = m.deliverables?.slice(0, 3).join(', ') || '';
          lines.push(`- **${name}** (${m.priority || 'planned'}): ${deliverables}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generatePricingDoc(groups) {
  const costGroup = findGroup(groups, 'what_it_costs');
  if (!costGroup?.artifacts?.length) return '';

  const lines = ['# Pricing Model\n'];
  for (const artifact of costGroup.artifacts) {
    if (!artifact.content) continue;
    lines.push(`## ${artifact.title || artifact.artifact_type}\n`);
    lines.push(formatArtifactContent(artifact.content));
    lines.push('');
  }

  return lines.join('\n');
}

function generateMonitoringDoc(ventureName, sentryConfig) {
  const dsn = sentryConfig?.dsn || 'YOUR_SENTRY_DSN';
  const project = sentryConfig?.project || ventureName.toLowerCase().replace(/\s+/g, '-');

  return `# Monitoring & Error Tracking — ${ventureName}

This venture is monitored by the EHG Software Factory self-healing loop.
Errors detected by Sentry are automatically written to the central feedback
table, scored by the heal loop, and corrective SDs are auto-generated.

## Sentry Configuration

- **Project**: ${project}
- **DSN**: \`${dsn}\`
- **Environment Variable**: \`SENTRY_DSN\`

## Node.js / Express Setup

\`\`\`javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1,
});

// Express error handler (add AFTER all routes)
app.use(Sentry.Handlers.errorHandler());
\`\`\`

## React / Vite Setup

\`\`\`javascript
import * as Sentry from '@sentry/react';
import { isMainModule } from '../../utils/is-main-module.js';

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
});
\`\`\`

## Next.js Setup

See: https://docs.sentry.io/platforms/javascript/guides/nextjs/

\`\`\`bash
npx @sentry/wizard@latest -i nextjs
\`\`\`

## How the Self-Healing Loop Works

1. Sentry captures runtime errors from this venture
2. EHG polls Sentry every 30 minutes via \`scripts/factory/poll-errors.js\`
3. Errors are sanitized (prompt injection defense) and written to the feedback table
4. The \`/heal\` scoring loop evaluates error impact
5. Corrective SDs are auto-generated for fixable issues
6. Chairman reviews and approves PRs (Phase 1: human-in-the-loop)

## Guardrails

- Max 3 automated corrections per venture per 24 hours
- 30 LOC limit per correction
- All fixes require passing tests before PR creation
- Global kill switch available via chairman dashboard
`;
}

// ── Initial Prompt Generator ───────────────────────

/**
 * Generate the "blank slate" initial prompt for creating the Replit project.
 */
// ── Agent-Optimized Document Generators ────────────

function generateSpecDoc(groups, ventureName, { targetPlatform = 'web' } = {}) {
  const lines = [`# ${ventureName || 'Venture'} — Specification\n`];

  // Section 1: Problem Statement (from context doc)
  lines.push('## Problem Statement\n');
  const contextContent = generateContextDoc(groups);
  if (contextContent.length > 20) {
    lines.push(contextContent.replace(/^# Product Context\n*/m, ''));
  } else {
    lines.push('_No problem statement available from pipeline artifacts._\n');
  }

  // Section 2: User & Brand Identity (from branding doc)
  lines.push('## User & Brand Identity\n');
  const brandContent = generateBrandingDoc(groups);
  if (brandContent.length > 20) {
    lines.push(brandContent.replace(/^# Branding & Personas\n*/m, ''));
  } else {
    lines.push('_No branding data available._\n');
  }

  // Section 3: Technical Architecture (from architecture doc)
  lines.push('## Technical Architecture\n');
  const archContent = generateArchitectureDoc(groups);
  if (archContent.length > 20) {
    lines.push(archContent.replace(/^# Technical Architecture\n*/m, ''));
  } else {
    lines.push('_No architecture data available._\n');
  }

  // Section 4: Screen Layouts (from wireframes doc)
  lines.push('## Screen Layouts\n');
  const wireContent = generateWireframesDoc(groups, { targetPlatform });
  if (wireContent.length > 20) {
    lines.push(wireContent.replace(/^# Application Wireframes\n*/m, ''));
  } else {
    lines.push('_No wireframe data available._\n');
  }

  return lines.join('\n');
}

function generateTasksDoc(groups) {
  const lines = ['# Implementation Tasks\n'];
  lines.push('Each task is atomic — complete one before starting the next.\n');

  let taskNum = 0;

  // Extract feature/sprint items from build group
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    for (const artifact of buildGroup.artifacts) {
      if (!artifact.content) continue;
      const data = parseContent(artifact.content) || {};

      // Sprint items / features
      const items = data.sprintItems || data.features || data.milestones || [];
      for (const item of items) {
        taskNum++;
        const name = item.name || item.title || item.feature || `Feature ${taskNum}`;
        const desc = item.description || item.scope || '';
        lines.push(`### Task ${taskNum}: ${name}`);
        if (desc) lines.push(desc);
        lines.push('');
        if (item.acceptanceCriteria?.length) {
          lines.push('**Acceptance Criteria:**');
          for (const ac of item.acceptanceCriteria) {
            lines.push(`- [ ] ${typeof ac === 'string' ? ac : ac.criterion || ac.description || JSON.stringify(ac)}`);
          }
        } else if (item.deliverables?.length) {
          lines.push('**Deliverables:**');
          for (const d of item.deliverables) {
            lines.push(`- [ ] ${d}`);
          }
        }
        lines.push('');
      }
    }
  }

  // Extract wireframe screens as UI tasks
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (archGroup) {
    const wfArt = archGroup.artifacts.find(a => a.artifact_type === 'blueprint_wireframes');
    if (wfArt?.content) {
      const data = parseContent(wfArt.content) || {};
      const screens = data.wireframes?.screens || data.screens || [];
      for (const screen of screens) {
        taskNum++;
        lines.push(`### Task ${taskNum}: Build ${screen.name || 'Screen'} page`);
        if (screen.purpose) lines.push(`Build the ${screen.name} page: ${screen.purpose}`);
        lines.push('');
        lines.push('**Acceptance Criteria:**');
        lines.push('- [ ] Page renders at correct route');
        if (screen.ascii_layout) lines.push('- [ ] Layout matches wireframe in docs/spec.md');
        lines.push('- [ ] Responsive on mobile and desktop');
        lines.push('- [ ] Uses brand colors and typography from docs/spec.md');
        lines.push('');
      }
    }
  }

  if (taskNum === 0) {
    lines.push('_No tasks could be extracted from pipeline artifacts._\n');
  } else {
    lines.push(`---\n**Total: ${taskNum} tasks**\n`);
  }

  return lines.join('\n');
}

function generateAgentOptimizedReplitMd(ventureName, stitchManifest) {
  // Pre-existing dead `stitchFileMap` removed during US-005 cleanup
  // (was defined but never used; the inline `${stitchManifest ? ... : ''}`
  // ternary in the table below renders the file map directly).
  const stitchBuildStep = stitchManifest
    ? '\n5. **Check docs/stitch/** for high-fidelity design references before building any UI'
    : '';

  return `# ${ventureName}

## File Map

Read these files in order when starting a new feature:

| File | Purpose | When to Read |
|------|---------|-------------|
| **docs/designs/** | Approved HTML designs for each screen — pixel-perfect reference | **First** — open the relevant screen's HTML before building any UI |
| **docs/color-palette.md** | Brand colors as CSS custom properties — copy into global CSS | **First** — import :root block before writing any styles |
| **docs/spec.md** | Complete specification: problem, users, architecture, screens | Before writing any code |
| **docs/tasks.md** | Pre-decomposed implementation steps with acceptance criteria | Pick your next task from here |
| **docs/architecture.md** | Tech stack, data model, API surface | When implementing backend/database work |
| **docs/branding.md** | Typography, personas, brand voice | When implementing any UI |
| **docs/product-roadmap.md** | Feature priorities and MVP phasing | When deciding build order |

## Build Workflow

For each feature or task:
1. **Open docs/designs/** and find the HTML file for the screen you're building — match it closely
2. **Copy the CSS custom properties** from docs/color-palette.md into your global stylesheet (do this once)
3. **Read docs/tasks.md** and pick the next uncompleted task
4. **Read docs/spec.md** for the full context on that feature
5. **Use docs/architecture.md** for data model and API patterns
6. **Check off** the task's acceptance criteria when done

## Coding Standards
- TypeScript strict mode
- Proper error handling on all API calls
- Responsive design (mobile-first)
- Semantic HTML with ARIA labels
- Use environment variables for all secrets
- Follow existing patterns in the codebase

## Design Consistency
The approved HTML designs in docs/designs/ were generated independently per screen.
There may be inconsistencies between them (e.g., one screen missing a sidebar that all
others have, different header layouts, inconsistent navigation patterns). When you notice
inconsistencies:
- Identify the **majority pattern** across all screens (e.g., 5 of 6 screens have a sidebar)
- Apply the majority pattern to ALL screens — normalize the shared layout elements
- Shared elements to keep consistent: navigation/sidebar, header, footer, color usage, typography scale, spacing system
- Screen-specific elements (hero sections, data tables, forms) should follow the individual design

## Key Rules
- Do NOT invent features not in docs/tasks.md
- Do NOT change the data model without checking docs/architecture.md
- Do NOT use colors not in docs/color-palette.md — use the CSS custom properties
- Do NOT deviate from the approved screen designs in docs/designs/ (except to normalize inconsistencies as described above)
- Complete one task fully before starting the next
`;
}

export function generateInitialPrompt(ventureName, framework = 'Vite') {
  return `Create a new ${framework} + TypeScript project called "${ventureName}".

IMPORTANT: This repo already contains a docs/ folder with reference documents.
Read docs/color-palette.md first and copy the CSS custom properties into your global stylesheet.
Read docs/designs/ to see the approved HTML designs for each screen.

Setup:
- ${framework} with TypeScript (strict mode)
- Tailwind CSS for styling
- React Router for navigation
- A clean folder structure: src/components/, src/pages/, src/lib/
- Import the brand colors from docs/color-palette.md as CSS custom properties

Do NOT build any features yet. Just:
1. Initialize the project with the tech stack above
2. Copy the :root CSS custom properties from docs/color-palette.md into your global CSS
3. Create a basic App.tsx with a router and navigation layout matching the majority pattern in docs/designs/
4. Add a simple home page that says "${ventureName}" with a subtitle using the brand colors
5. Ensure the dev server runs without errors

Then proceed to replit.md for the full build workflow.`;
}

// ── Main Seeder Function ───────────────────────────

/**
 * Seed a GitHub repo with reference documents from venture artifacts.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} repoUrl - GitHub repo URL (e.g., https://github.com/user/repo.git)
 * @param {object} [options]
 * @param {string} [options.cloneDir] - Where to clone (default: temp dir)
 * @returns {Promise<{success: boolean, docsCommitted: string[], errors: string[]}>}
 */
export async function seedRepo(ventureId, repoUrl, options = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const errors = [];
  const docsCommitted = [];

  // Fetch all artifacts via the RPC
  const { data, error } = await supabase.rpc('export_blueprint_review', { p_venture_id: ventureId });
  if (error) throw new Error(`export_blueprint_review failed: ${error.message}`);
  if (!data?.groups?.length) throw new Error('No planning artifacts found');

  const groups = data.groups;

  // Get venture name and platform
  const { data: venture } = await supabase
    .from('ventures').select('name, target_platform').eq('id', ventureId).single();
  const ventureName = venture?.name || 'Venture';
  const targetPlatform = venture?.target_platform || 'web';

  // Determine clone directory
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/);
  const repoName = match?.[1] || 'venture-repo';
  const parentDir = options.cloneDir || process.cwd();
  const repoDir = join(parentDir, repoName);

  // Clone or use existing
  if (!existsSync(repoDir)) {
    execSync(`git clone "${repoUrl}" "${repoDir}"`, { encoding: 'utf-8', timeout: 30000 });
  }

  // Create docs directory
  const docsDir = join(repoDir, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Fetch venture metadata for monitoring config
  const { data: ventureMeta } = await supabase
    .from('ventures').select('metadata').eq('id', ventureId).single();
  const sentryConfig = ventureMeta?.metadata?.sentry;

  // Check Stitch governance config for docs/stitch/ seeding
  let stitchManifest = null;
  try {
    const { data: stitchArtifact } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'stitch_project')
      .single();

    if (stitchArtifact?.artifact_data) {
      const { data: configRow } = await supabase
        .from('chairman_dashboard_config')
        .select('taste_gate_config')
        .limit(1)
        .single();

      if (configRow?.taste_gate_config?.stitch_enabled) {
        stitchManifest = stitchArtifact.artifact_data;
      }
    }
  } catch {
    // Stitch not provisioned for this venture — skip silently
  }

  // Determine doc format: agent-optimized (new) or legacy (original 6 files)
  const docFormat = ventureMeta?.metadata?.doc_format || 'agent-optimized';

  // Generate and write each document
  const docs = docFormat === 'agent-optimized' ? [
    { name: 'spec.md', generator: () => generateSpecDoc(groups, ventureName, { targetPlatform }), required: true },
    { name: 'tasks.md', generator: () => generateTasksDoc(groups), required: true },
    { name: 'architecture.md', generator: () => generateArchitectureDoc(groups), required: true },
    { name: 'branding.md', generator: () => generateBrandingDoc(groups), required: true },
  ] : [
    { name: 'branding.md', generator: () => generateBrandingDoc(groups), required: true },
    { name: 'architecture.md', generator: () => generateArchitectureDoc(groups), required: true },
    { name: 'wireframes.md', generator: () => generateWireframesDoc(groups, { targetPlatform }), required: true },
    { name: 'context.md', generator: () => generateContextDoc(groups), required: false },
    { name: 'pricing.md', generator: () => generatePricingDoc(groups), required: false },
    { name: 'monitoring.md', generator: () => generateMonitoringDoc(ventureName, sentryConfig), required: false },
  ];

  for (const doc of docs) {
    try {
      const content = doc.generator();
      if (!content || content.trim().length < 20) {
        if (doc.required) errors.push(`${doc.name}: no content generated`);
        continue;
      }
      writeFileSync(join(docsDir, doc.name), content);
      docsCommitted.push(doc.name);
    } catch (err) {
      errors.push(`${doc.name}: ${err.message}`);
    }
  }

  // Seed docs/stitch/ if Stitch artifacts available
  // SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-C (US-005): materialize stitch_design_export
  // contents to disk instead of just creating empty directories. The previous
  // version only mkdirSync'd the dirs and pushed a "directory created" entry.
  if (stitchManifest) {
    try {
      const stitchDir = join(docsDir, 'stitch');
      mkdirSync(join(stitchDir, 'screens'), { recursive: true });
      mkdirSync(join(stitchDir, 'screenshots'), { recursive: true });
      docsCommitted.push('docs/stitch/ (directory created)');

      // Look up the latest stitch_design_export row for this venture (child A
      // persists these via lib/eva/bridge/stitch-exporter.js).
      const { data: exportRow } = await supabase
        .from('venture_artifacts')
        .select('metadata')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'stitch_design_export')
        .eq('lifecycle_stage', 17)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const exportMeta = exportRow?.metadata;
      if (exportMeta) {
        // PNG magic bytes for validation
        const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

        // Path-traversal guard: screen_id is ultimately sourced from Stitch API
        // output stored in Supabase. Even under today's trust model it MUST NOT
        // contain path separators or `..` segments, because path.join resolves
        // traversal and writeFileSync would happily create arbitrary files.
        // Validate strictly and skip non-conforming entries.
        const SAFE_SCREEN_ID = /^[a-zA-Z0-9_-]{1,64}$/;

        // Materialize HTML files
        for (const html of exportMeta.html_files || []) {
          if (!html?.screen_id || typeof html?.html !== 'string') continue;
          if (!SAFE_SCREEN_ID.test(html.screen_id)) {
            errors.push('docs/stitch/screens/<invalid screen_id>: rejected — does not match ^[a-zA-Z0-9_-]{1,64}$');
            continue;
          }
          try {
            const target = join(stitchDir, 'screens', `${html.screen_id}.html`);
            writeFileSync(target, html.html, 'utf-8');
            docsCommitted.push(`docs/stitch/screens/${html.screen_id}.html`);
          } catch (err) {
            errors.push(`docs/stitch/screens/${html.screen_id}.html: ${err.message}`);
          }
        }

        // Materialize PNG files (base64 → Buffer with magic-byte validation)
        for (const png of exportMeta.png_files_base64 || []) {
          if (!png?.screen_id || typeof png?.base64 !== 'string') continue;
          if (!SAFE_SCREEN_ID.test(png.screen_id)) {
            errors.push('docs/stitch/screenshots/<invalid screen_id>: rejected — does not match ^[a-zA-Z0-9_-]{1,64}$');
            continue;
          }
          try {
            const buf = Buffer.from(png.base64, 'base64');
            if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
              errors.push(`docs/stitch/screenshots/${png.screen_id}.png: invalid PNG magic bytes — skipped`);
              continue;
            }
            const target = join(stitchDir, 'screenshots', `${png.screen_id}.png`);
            writeFileSync(target, buf);
            docsCommitted.push(`docs/stitch/screenshots/${png.screen_id}.png`);
          } catch (err) {
            errors.push(`docs/stitch/screenshots/${png.screen_id}.png: ${err.message}`);
          }
        }

        // Materialize DESIGN.md
        if (typeof exportMeta.design_md === 'string' && exportMeta.design_md.trim().length > 0) {
          try {
            writeFileSync(join(stitchDir, 'DESIGN.md'), exportMeta.design_md, 'utf-8');
            docsCommitted.push('docs/stitch/DESIGN.md');
          } catch (err) {
            errors.push(`docs/stitch/DESIGN.md: ${err.message}`);
          }
        }
      }
      // If exportRow is missing entirely we skip silently — legacy ventures
      // without Stitch exports get the empty directory structure as before.
    } catch (err) {
      errors.push(`docs/stitch/: ${err.message}`);
    }
  }

  // ── S17 Approved Designs (HTML files) ──────────────────────────
  // Write each approved desktop design as a standalone HTML file in docs/designs/
  try {
    const { data: approvedDesigns } = await supabase
      .from('venture_artifacts')
      .select('artifact_data, metadata, title')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'stage_17_approved_desktop')
      .eq('is_current', true)
      .order('created_at');

    if (approvedDesigns?.length) {
      const designsDir = join(docsDir, 'designs');
      mkdirSync(designsDir, { recursive: true });

      // Also load screen names from wireframe_screens for better filenames
      const { data: wfArt } = await supabase
        .from('venture_artifacts')
        .select('artifact_data')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'wireframe_screens')
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();
      const screenNames = new Map();
      for (const s of (wfArt?.artifact_data?.screens || [])) {
        if (s.id && s.name) screenNames.set(s.id, s.name);
      }

      for (const design of approvedDesigns) {
        const html = design.artifact_data?.html;
        if (!html || typeof html !== 'string') continue;
        const screenId = design.metadata?.screenId || 'unknown';
        const screenName = screenNames.get(screenId) || design.title?.replace(/\s*—.*$/, '') || screenId;
        const filename = screenName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '') + '.html';
        try {
          writeFileSync(join(designsDir, filename), html, 'utf-8');
          docsCommitted.push(`docs/designs/${filename}`);
        } catch (err) {
          errors.push(`docs/designs/${filename}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`docs/designs/: ${err.message}`);
  }

  // ── Product Roadmap (S13) ─────────────────────────────────────
  try {
    const { data: roadmapArt } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'blueprint_product_roadmap')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();

    if (roadmapArt?.artifact_data) {
      const rd = roadmapArt.artifact_data;
      const lines = ['# Product Roadmap\n'];
      if (rd.vision_statement) lines.push(`> ${rd.vision_statement}\n`);
      for (const phase of (rd.phases || [])) {
        lines.push(`## ${phase.name || 'Phase'}`);
        if (phase.start_date && phase.end_date) lines.push(`_${phase.start_date} — ${phase.end_date}_\n`);
        for (const ms of (phase.milestones || rd.milestones || [])) {
          lines.push(`### ${ms.name || 'Milestone'} (${ms.priority || 'now'})`);
          for (const d of (ms.deliverables || [])) {
            lines.push(`- ${d}`);
          }
          lines.push('');
        }
      }
      const content = lines.join('\n');
      if (content.length > 50) {
        writeFileSync(join(docsDir, 'product-roadmap.md'), content);
        docsCommitted.push('docs/product-roadmap.md');
      }
    }
  } catch (err) {
    errors.push(`docs/product-roadmap.md: ${err.message}`);
  }

  // ── GTM & Sales Strategy (S12) ────────────────────────────────
  try {
    const { data: gtmArt } = await supabase
      .from('venture_artifacts')
      .select('artifact_data, content')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'identity_gtm_sales_strategy')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();

    if (gtmArt) {
      const d = gtmArt.artifact_data || parseContent(gtmArt.content);
      if (d) {
        const lines = ['# Go-To-Market & Sales Strategy\n'];
        if (d.positioning) lines.push(`## Positioning\n${d.positioning}\n`);
        if (d.messaging_pillars) {
          lines.push('## Messaging Pillars');
          (Array.isArray(d.messaging_pillars) ? d.messaging_pillars : [d.messaging_pillars]).forEach(p => lines.push(`- ${p}`));
          lines.push('');
        }
        if (d.channels) {
          lines.push('## Channels');
          (Array.isArray(d.channels) ? d.channels : [d.channels]).forEach(c => lines.push(`- ${typeof c === 'object' ? c.name || JSON.stringify(c) : c}`));
          lines.push('');
        }
        if (d.launch_strategy) lines.push(`## Launch Strategy\n${d.launch_strategy}\n`);
        const content = lines.join('\n');
        if (content.length > 50) {
          writeFileSync(join(docsDir, 'gtm-strategy.md'), content);
          docsCommitted.push('docs/gtm-strategy.md');
        }
      }
    }
  } catch (err) {
    errors.push(`docs/gtm-strategy.md: ${err.message}`);
  }

  // ── Color Palette as CSS (from S11 identity_naming_visual) ────
  try {
    const { data: visualArt } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'identity_naming_visual')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();

    const palette = visualArt?.artifact_data?.visualIdentity?.colorPalette;
    if (palette?.length) {
      const lines = ['# Brand Color Palette\n', '## CSS Custom Properties\n', '```css', ':root {'];
      palette.forEach((c, i) => {
        const name = (c.usage || '').split(/[,.]/)[ 0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `color-${i + 1}`;
        lines.push(`  --brand-${name}: ${c.hex}; /* ${c.usage || ''} */`);
      });
      lines.push('}', '```\n');
      lines.push('## Palette Reference\n');
      lines.push('| Hex | Usage |', '|-----|-------|');
      palette.forEach(c => lines.push(`| \`${c.hex}\` | ${c.usage || ''} |`));
      lines.push('');

      // Add imagery guidance if available
      const imagery = visualArt?.artifact_data?.visualIdentity?.imageryGuidance;
      if (imagery) lines.push(`## Imagery Direction\n${imagery}\n`);

      // Add typography if available
      const typo = visualArt?.artifact_data?.logoSpec?.typography;
      if (typo) lines.push(`## Typography\n- Heading: ${typo.heading || typo}\n- Body: ${typo.body || ''}\n`);

      const content = lines.join('\n');
      writeFileSync(join(docsDir, 'color-palette.md'), content);
      docsCommitted.push('docs/color-palette.md');
    }
  } catch (err) {
    errors.push(`docs/color-palette.md: ${err.message}`);
  }

  // Update replit.md — use agent-optimized template or legacy
  if (docFormat === 'agent-optimized') {
    const replitMd = generateAgentOptimizedReplitMd(ventureName, stitchManifest);
    writeFileSync(join(repoDir, 'replit.md'), replitMd);
    docsCommitted.push('replit.md (agent-optimized)');
  } else {
  // Legacy replit.md
  const stitchSection = stitchManifest ? `
## High-Fidelity Design References

Design artifacts generated by Google Stitch are in \`docs/stitch/\`:

- **docs/stitch/DESIGN.md** — Design tokens (colors, typography, spacing, components)
- **docs/stitch/screens/*.html** — Self-contained HTML screens for each page
- **docs/stitch/screenshots/*.png** — PNG screenshots for visual acceptance criteria

When building UI features:
1. Read docs/stitch/DESIGN.md for design tokens (colors, fonts, spacing)
2. Reference the HTML screen for the page you're building
3. Match the layout, spacing, and visual hierarchy from the screenshots
4. Fall back to docs/wireframes.md if a screen has no Stitch export
` : '';

  const replitMd = `# ${ventureName}

This project was scaffolded by Replit and enriched with planning documents from EHG.

## Reference Documents

All planning artifacts are in the \`docs/\` folder:

- **docs/branding.md** — Product name, color palette, typography, personas, brand voice
- **docs/architecture.md** — Tech stack, data model, API contract, schema
- **docs/wireframes.md** — All screen layouts with ASCII mockups
- **docs/context.md** — Problem statement, value proposition, competitive landscape, roadmap
- **docs/pricing.md** — Pricing model and tiers (if applicable)
- **docs/designs/*.html** — Approved HTML designs for each screen (pixel-perfect reference)
- **docs/product-roadmap.md** — Feature priorities and phases
- **docs/gtm-strategy.md** — Marketing messaging and positioning
- **docs/color-palette.md** — Brand colors as CSS custom properties
${stitchSection}
## Build Instructions

When given a feature prompt, always:
1. Read the relevant docs/ file referenced in the prompt
2. **Check docs/designs/ first** — these are approved HTML designs for each screen. Match them as closely as possible.
3. Use the CSS custom properties from docs/color-palette.md for all colors
4. Follow the branding (typography, product name) from docs/branding.md
5. Use the data model from docs/architecture.md for database operations
6. Reference docs/product-roadmap.md for feature priority and phasing

## Coding Standards
- TypeScript strict mode
- Proper error handling on all API calls
- Responsive design (mobile-first)
- Semantic HTML with ARIA labels
- Use environment variables for all secrets
`;

  writeFileSync(join(repoDir, 'replit.md'), replitMd);
  docsCommitted.push('replit.md');
  } // end legacy format block

  // Git add, commit, push
  try {
    execSync('git add docs/ replit.md', { cwd: repoDir, encoding: 'utf-8' });
    execSync(
      'git commit -m "docs: seed reference documents from EHG venture pipeline\n\nAdds branding, architecture, wireframes, approved designs, roadmap,\nGTM strategy, and color palette from Stages 0-17 planning artifacts."',
      { cwd: repoDir, encoding: 'utf-8' }
    );
    execSync('git push', { cwd: repoDir, encoding: 'utf-8', timeout: 30000 });
  } catch (err) {
    errors.push(`git push failed: ${err.message}`);
  }

  return { success: errors.length === 0, docsCommitted, errors, repoDir, ventureName };
}

// ── Build Prompt Generator (References docs/) ──────

/**
 * Generate build prompts that reference the seeded docs/ files.
 *
 * @param {string} ventureId
 * @returns {Promise<{initial: string, features: Array<{title: string, prompt: string}>}>}
 */
export async function generateBuildPrompts(ventureId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('export_blueprint_review', { p_venture_id: ventureId });
  if (error) throw new Error(`export_blueprint_review failed: ${error.message}`);

  const groups = data?.groups || [];
  const { data: venture } = await supabase
    .from('ventures').select('name').eq('id', ventureId).single();
  const ventureName = venture?.name || 'Venture';

  // Extract wireframe screens
  const archGroup = findGroup(groups, 'how_to_build_it');
  const wfArt = archGroup?.artifacts?.find(a => a.artifact_type === 'blueprint_wireframes');
  const wfData = parseContent(wfArt?.content) || {};
  const screens = wfData.wireframes?.screens || [];

  const features = screens.map((screen, i) => {
    const name = screen.name || `Screen ${i + 1}`;
    return {
      title: name,
      prompt: `Build the "${name}" screen.

Reference files:
- See docs/designs/${name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.html for the approved visual design
- See docs/color-palette.md for brand colors (use the CSS custom properties)
- See docs/architecture.md for data model and API endpoints
- See docs/wireframes.md section "${name}" for additional layout context

${screen.purpose ? `Purpose: ${screen.purpose}` : ''}
${screen.persona ? `Primary user: ${screen.persona}` : ''}

${screens.length > 1 ? `This is screen ${i + 1} of ${screens.length}.${i > 0 ? ` Build after: ${screens[i - 1].name || `Screen ${i}`}` : ''}` : ''}

Instructions:
- Match the approved HTML design in docs/designs/ as closely as possible
- Use the CSS custom properties from docs/color-palette.md for all colors
- Ensure shared layout elements (nav, sidebar, header) are consistent across all screens
- Implement all interactive elements shown in the design
- Ensure responsive design (mobile-first)
${screen.micro_animations ? `- Add micro-animations (designed for this screen's brand feel):
  ${screen.micro_animations.entry_transition ? `• Entry: ${screen.micro_animations.entry_transition}` : ''}
  ${screen.micro_animations.hover_states ? `• Hover: ${screen.micro_animations.hover_states}` : ''}
  ${screen.micro_animations.loading_animation ? `• Loading: ${screen.micro_animations.loading_animation}` : ''}
  ${screen.micro_animations.cta_effects ? `• CTA: ${screen.micro_animations.cta_effects}` : ''}
  Use Tailwind transition/animate classes or inline CSS transitions.` : ''}
- Test the screen works end-to-end before proceeding
- Checkpoint after completion`,
    };
  });

  return {
    initial: generateInitialPrompt(ventureName),
    features,
  };
}

// CLI entry point
const _isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (_isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const ventureId = args[1];
  const repoUrl = args[2];

  if (!cmd || args.includes('--help')) {
    console.error(`
Replit Repo Seeder

Commands:
  seed <venture-id> <repo-url>     Clone repo, commit docs/, push
  prompts <venture-id>             Generate build prompts (after seed)
  initial <venture-name>           Generate initial blank-slate prompt

Examples:
  node lib/eva/bridge/replit-repo-seeder.js seed <id> https://github.com/user/repo.git
  node lib/eva/bridge/replit-repo-seeder.js prompts <id>
  node lib/eva/bridge/replit-repo-seeder.js initial "CronRead"
`);
    process.exit(0);
  }

  if (cmd === 'initial') {
    console.log(generateInitialPrompt(ventureId || 'MyApp'));
    process.exit(0);
  }

  if (cmd === 'seed') {
    if (!ventureId || !repoUrl) {
      console.error('Usage: seed <venture-id> <repo-url>');
      process.exit(1);
    }
    seedRepo(ventureId, repoUrl).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }

  if (cmd === 'prompts') {
    if (!ventureId) {
      console.error('Usage: prompts <venture-id>');
      process.exit(1);
    }
    generateBuildPrompts(ventureId).then(result => {
      console.log('=== INITIAL PROMPT ===\n');
      console.log(result.initial);
      console.log('\n');
      for (let i = 0; i < result.features.length; i++) {
        console.log(`=== FEATURE ${i + 1}: ${result.features[i].title} ===\n`);
        console.log(result.features[i].prompt);
        console.log('\n');
      }
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }
}
