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
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  formatArtifactContent,
  normalizeGroupKey,
} from './replit-format-strategies.js';
import { registerVentureResource } from '../../venture-resources.js';

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

// ── Pure Build-Prompt Helpers (DB/git-free, unit-testable) ─────────
// SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C)

/**
 * Convert a screen name into the canonical docs/designs/<file>.html filename
 * stem used by the docs/designs writer (~writeApprovedDesignsToDocs). MUST stay
 * byte-identical to the filename rule used when the HTML files are written, so
 * that membership checks against the written-set line up exactly.
 *
 * @param {string} name
 * @returns {string} e.g. "Dashboard Home" -> "dashboard-home"
 */
export function designFileStem(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
}

/**
 * Resolve the list of build screens for a venture's Stage 19 build prompts.
 *
 * Pure function — no DB, no git, no fs. Inputs are injected so this can be unit
 * tested in isolation.
 *
 * Resolution order (SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 / Concern C):
 *   1. PREFERRED: `blueprint_wireframes` (legacy export_blueprint_review path).
 *      Preserved byte-identically — screens come from `wireframes.screens`,
 *      `name` is `screen.name`, and the raw screen object is returned so the
 *      downstream prompt builder keeps full access to purpose/persona/etc.
 *   2. FALLBACK: when blueprint_wireframes is absent OR yields zero screens,
 *      use the S15 `wireframe_screens` artifact's `artifact_data.screens[]`.
 *      Each screen name is `screen.screen_name ?? screen.name`.
 *
 * The returned screens are normalized so the prompt builder can rely on a
 * `name` field regardless of source, while `raw` carries the original object.
 *
 * @param {Object} args
 * @param {Object|null} [args.blueprintWireframes] - parsed `blueprint_wireframes` artifact content (the object with `.wireframes.screens` or `.screens`)
 * @param {Object|null} [args.wireframeScreensArtifact] - the S15 `wireframe_screens` venture_artifacts row's `artifact_data` (object with `.screens`)
 * @returns {{ screens: Array<{ name: string, raw: object }>, source: 'blueprint_wireframes'|'wireframe_screens'|'none' }}
 */
export function resolveBuildScreens({ blueprintWireframes = null, wireframeScreensArtifact = null } = {}) {
  // 1. Preferred legacy path — preserve existing behavior byte-identically.
  const bpScreens = blueprintWireframes?.wireframes?.screens || blueprintWireframes?.screens || [];
  if (Array.isArray(bpScreens) && bpScreens.length > 0) {
    return {
      source: 'blueprint_wireframes',
      screens: bpScreens.map((screen, i) => ({
        name: screen.name || `Screen ${i + 1}`,
        raw: screen,
      })),
    };
  }

  // 2. Fallback — S15 wireframe_screens artifact (new-pipeline ventures).
  const wfScreens = wireframeScreensArtifact?.screens || [];
  if (Array.isArray(wfScreens) && wfScreens.length > 0) {
    return {
      source: 'wireframe_screens',
      screens: wfScreens.map((screen, i) => ({
        name: screen.screen_name ?? screen.name ?? `Screen ${i + 1}`,
        raw: screen,
      })),
    };
  }

  return { source: 'none', screens: [] };
}

/**
 * Build a single feature build-prompt for one screen.
 *
 * Pure function. Gates the "see docs/designs/<screen>.html" reference on whether
 * that design file was ACTUALLY written: `writtenDesignStems` is the Set of
 * filename stems (from designFileStem) for which an HTML file exists in
 * docs/designs/. When the screen has no written design, the prompt references
 * docs/wireframes.md / the screen description instead — never instructs the
 * builder to open a file that does not exist.
 *
 * @param {Object} args
 * @param {{ name: string, raw: object }} args.screen - normalized screen (from resolveBuildScreens)
 * @param {number} args.index - zero-based index in the screen list
 * @param {number} args.total - total screen count
 * @param {{ name: string, raw: object }} [args.prevScreen] - previous screen (for ordering hint)
 * @param {Set<string>} args.writtenDesignStems - design-file stems actually written to docs/designs/
 * @returns {{ title: string, prompt: string }}
 */
export function buildFeaturePrompt({ screen, index, total, prevScreen = null, writtenDesignStems = new Set() }) {
  const name = screen.name;
  const raw = screen.raw || {};
  const stem = designFileStem(name);
  const hasDesignFile = writtenDesignStems.has(stem);
  // New-pipeline screens carry `description`; legacy ones carry `purpose`.
  const description = raw.description || '';
  const purpose = raw.purpose || '';

  // Visual-reference line: only point at docs/designs/<stem>.html when it was
  // actually written; otherwise fall back to docs/wireframes.md (+ description).
  const visualRef = hasDesignFile
    ? `- See docs/designs/${stem}.html for the approved visual design`
    : `- See docs/wireframes.md section "${name}" for the layout and structure${description ? ` (${description})` : ''}`;

  // Closing design-match instruction mirrors the visual-reference gating.
  const designMatchInstruction = hasDesignFile
    ? '- Match the approved HTML design in docs/designs/ as closely as possible'
    : '- Match the layout described in docs/wireframes.md as closely as possible';

  const prompt = `Build the "${name}" screen.

Reference files:
${visualRef}
- See docs/color-palette.md for brand colors (use the CSS custom properties)
- See docs/architecture.md for data model and API endpoints
- See docs/wireframes.md section "${name}" for additional layout context

${purpose ? `Purpose: ${purpose}` : ''}${description && !purpose ? `Purpose: ${description}` : ''}
${raw.persona ? `Primary user: ${raw.persona}` : ''}

${total > 1 ? `This is screen ${index + 1} of ${total}.${index > 0 && prevScreen ? ` Build after: ${prevScreen.name}` : ''}` : ''}

Instructions:
${designMatchInstruction}
- Use the CSS custom properties from docs/color-palette.md for all colors
- Ensure shared layout elements (nav, sidebar, header) are consistent across all screens
- Implement all interactive elements shown in the design
- Ensure responsive design (mobile-first)
${raw.micro_animations ? `- Add micro-animations (designed for this screen's brand feel):
  ${raw.micro_animations.entry_transition ? `• Entry: ${raw.micro_animations.entry_transition}` : ''}
  ${raw.micro_animations.hover_states ? `• Hover: ${raw.micro_animations.hover_states}` : ''}
  ${raw.micro_animations.loading_animation ? `• Loading: ${raw.micro_animations.loading_animation}` : ''}
  ${raw.micro_animations.cta_effects ? `• CTA: ${raw.micro_animations.cta_effects}` : ''}
  Use Tailwind transition/animate classes or inline CSS transitions.` : ''}
- Test the screen works end-to-end before proceeding
- Checkpoint after completion`;

  return { title: name, prompt };
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

function generateAgentOptimizedReplitMd(ventureName, stitchManifest, { hasDesigns = true } = {}) {
  // Pre-existing dead `stitchFileMap` removed during US-005 cleanup
  // (was defined but never used; the inline `${stitchManifest ? ... : ''}`
  // ternary in the table below renders the file map directly).
  const stitchBuildStep = stitchManifest
    ? '\n5. **Check docs/stitch/** for high-fidelity design references before building any UI'
    : '';

  // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C): only reference
  // docs/designs/ when approved HTML designs were actually written. Autonomous-
  // worker ventures have no stage_17_approved_desktop artifacts, so docs/designs/
  // is empty — pointing the builder at it produces dangling references. When no
  // designs exist, fall back to docs/wireframes.md.
  const designFileMapRow = hasDesigns
    ? '| **docs/designs/** | Approved HTML designs for each screen — pixel-perfect reference | **First** — open the relevant screen\'s HTML before building any UI |\n'
    : '| **docs/wireframes.md** | Screen layouts with ASCII mockups — structural reference | **First** — read the relevant screen\'s layout before building any UI |\n';

  const designBuildStep1 = hasDesigns
    ? '1. **Open docs/designs/** and find the HTML file for the screen you\'re building — match it closely'
    : '1. **Read docs/wireframes.md** and find the layout for the screen you\'re building — match its structure';

  const designConsistencySection = hasDesigns
    ? `## Design Consistency
The approved HTML designs in docs/designs/ were generated independently per screen.
There may be inconsistencies between them (e.g., one screen missing a sidebar that all
others have, different header layouts, inconsistent navigation patterns). When you notice
inconsistencies:
- Identify the **majority pattern** across all screens (e.g., 5 of 6 screens have a sidebar)
- Apply the majority pattern to ALL screens — normalize the shared layout elements
- Shared elements to keep consistent: navigation/sidebar, header, footer, color usage, typography scale, spacing system
- Screen-specific elements (hero sections, data tables, forms) should follow the individual design
`
    : `## Design Consistency
No approved HTML designs were generated for this venture — build UI from the wireframe
layouts in docs/wireframes.md. Keep shared layout elements (navigation/sidebar, header,
footer, color usage, typography scale, spacing system) consistent across all screens.
`;

  const designKeyRule = hasDesigns
    ? '- Do NOT deviate from the approved screen designs in docs/designs/ (except to normalize inconsistencies as described above)'
    : '- Do NOT deviate from the screen layouts in docs/wireframes.md';

  return `# ${ventureName}

## File Map

Read these files in order when starting a new feature:

| File | Purpose | When to Read |
|------|---------|-------------|
${designFileMapRow}| **docs/color-palette.md** | Brand colors as CSS custom properties — copy into global CSS | **First** — import :root block before writing any styles |
| **docs/spec.md** | Complete specification: problem, users, architecture, screens | Before writing any code |
| **docs/tasks.md** | Pre-decomposed implementation steps with acceptance criteria | Pick your next task from here |
| **docs/architecture.md** | Tech stack, data model, API surface | When implementing backend/database work |
| **docs/branding.md** | Typography, personas, brand voice | When implementing any UI |
| **docs/product-roadmap.md** | Feature priorities and MVP phasing | When deciding build order |

## Build Workflow

For each feature or task:
${designBuildStep1}
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

${designConsistencySection}
## Key Rules
- Do NOT invent features not in docs/tasks.md
- Do NOT change the data model without checking docs/architecture.md
- Do NOT use colors not in docs/color-palette.md — use the CSS custom properties
${designKeyRule}
- Complete one task fully before starting the next
`;
}

export function generateInitialPrompt(ventureName, framework = 'Vite', { hasDesigns = true } = {}) {
  // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C): gate docs/designs/
  // references on whether approved designs were actually written.
  const designReadLine = hasDesigns
    ? 'Read docs/designs/ to see the approved HTML designs for each screen.'
    : 'Read docs/wireframes.md to see the layout for each screen.';
  const layoutSourceRef = hasDesigns ? 'docs/designs/' : 'docs/wireframes.md';

  return `Create a new ${framework} + TypeScript project called "${ventureName}".

IMPORTANT: This repo already contains a docs/ folder with reference documents.
Read docs/color-palette.md first and copy the CSS custom properties into your global stylesheet.
${designReadLine}

Setup:
- ${framework} with TypeScript (strict mode)
- Tailwind CSS for styling
- React Router for navigation
- A clean folder structure: src/components/, src/pages/, src/lib/
- Import the brand colors from docs/color-palette.md as CSS custom properties

Do NOT build any features yet. Just:
1. Initialize the project with the tech stack above
2. Copy the :root CSS custom properties from docs/color-palette.md into your global CSS
3. Create a basic App.tsx with a router and navigation layout matching the majority pattern in ${layoutSourceRef}
4. Add a simple home page that says "${ventureName}" with a subtitle using the brand colors
5. Ensure the dev server runs without errors

Then proceed to replit.md for the full build workflow.`;
}

// ── Build-into replit.md marker section (SD-LEO-FEAT-S19-BUILDS-INTO-001) ──
// In build-into mode the repo IS the venture's design (e.g. a Lovable app) and
// ships its own replit.md. We never overwrite it — instead we append (or refresh)
// a clearly-delimited, idempotent EHG build-context section pointing the builder
// at the seeded docs/. The markers make the section re-runnable and reversible.
const EHG_BUILD_CONTEXT_START = '<!-- EHG-BUILD-CONTEXT:START (managed by EHG Stage-19 seeder) -->';
const EHG_BUILD_CONTEXT_END = '<!-- EHG-BUILD-CONTEXT:END -->';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEhgBuildContextSection(ventureName, hasDesigns) {
  const designsRow = hasDesigns
    ? '| docs/designs/ | Approved HTML screen designs (pixel reference) |\n'
    : '';
  return `${EHG_BUILD_CONTEXT_START}
## EHG Build Context

This repository is **${ventureName}**'s approved Stage-17 design. EHG added planning
documents under \`docs/\` to guide continued development — **build on the existing app;
do not start over or remove existing files.**

| File | Purpose |
|------|---------|
| docs/spec.md | Full specification (problem, users, screens, architecture) |
| docs/tasks.md | Pre-decomposed implementation tasks with acceptance criteria |
| docs/architecture.md | Tech stack, data model, API surface, schema |
| docs/branding.md / docs/color-palette.md | Typography, personas, brand colors |
| docs/product-roadmap.md | Feature priorities and phasing |
| docs/marketing-copy.md | Marketing copy (when generated) |
${designsRow}
When building a feature: read the relevant docs/ file, follow the existing app's
patterns and design system, and use the brand colors from docs/color-palette.md.
${EHG_BUILD_CONTEXT_END}`;
}

/**
 * Preserve an existing replit.md while appending/refreshing the EHG build-context
 * section idempotently. Returns the new file contents.
 */
function withEhgBuildContextSection(existingContent, ventureName, hasDesigns) {
  const section = buildEhgBuildContextSection(ventureName, hasDesigns);
  if (existingContent.includes(EHG_BUILD_CONTEXT_START)) {
    // Idempotent refresh: replace the prior marker block in place.
    const blockRe = new RegExp(`${escapeRegExp(EHG_BUILD_CONTEXT_START)}[\\s\\S]*?${escapeRegExp(EHG_BUILD_CONTEXT_END)}`);
    return existingContent.replace(blockRe, section);
  }
  return `${existingContent.replace(/\s*$/, '')}\n\n${section}\n`;
}

// ── Main Seeder Function ───────────────────────────

/**
 * Seed a GitHub repo with reference documents from venture artifacts.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} repoUrl - GitHub repo URL (e.g., https://github.com/user/repo.git)
 * @param {object} [options]
 * @param {string} [options.cloneDir] - Where to clone (default: temp dir)
 * @param {('create-new'|'build-into')} [options.mode='create-new'] - 'build-into'
 *   seeds additively into the venture's existing (possibly private) design repo:
 *   authenticated clone, preserve the root replit.md, never force-push.
 * @returns {Promise<{success: boolean, docsCommitted: string[], errors: string[], mode: string}>}
 */
export async function seedRepo(ventureId, repoUrl, options = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const errors = [];
  const docsCommitted = [];
  // SD-LEO-FEAT-S19-BUILDS-INTO-001: 'create-new' (default, unchanged behavior)
  // or 'build-into' (seed into the venture's existing design repo).
  const mode = options.mode === 'build-into' ? 'build-into' : 'create-new';

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

  // SD-LEO-FEAT-S19-BUILDS-INTO-001 (TR-3a): build-into clones an EXISTING repo
  // that may be private. Configure git to use the gh CLI's credential helper so
  // the clone + push authenticate. Non-fatal — if gh isn't available the clone
  // below surfaces the failure (we never silently fall back to a new repo).
  if (mode === 'build-into') {
    try {
      execSync('gh auth setup-git', { encoding: 'utf-8', timeout: 15000 });
    } catch (err) {
      errors.push(`gh auth setup-git failed (private clone may not authenticate): ${err.message}`);
    }
  }

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
  // Write each approved desktop design as a standalone HTML file in docs/designs/.
  // SD-LEO-FEAT-S19-BUILDS-INTO-001 (TR-3c): skip in build-into mode — the repo
  // already IS the venture's design, so seeding static HTML exports is redundant
  // (github_sync ventures have no stage_17_approved_desktop artifacts anyway).
  if (mode !== 'build-into') try {
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

  // Marketing copy docs (Stage 18)
  // SD-MAN-FIX-WIRE-S18-S22-001: Materialize marketing_copy_* artifacts as docs/marketing-copy.md
  try {
    const marketingTypes = [
      'marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero',
      'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement',
      'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft',
    ];
    const { data: marketingArts } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, artifact_data')
      .eq('venture_id', ventureId)
      .in('artifact_type', marketingTypes);
    if (marketingArts && marketingArts.length > 0) {
      const mcLines = ['# Marketing Copy\n', '> Auto-generated by EVA Stage 18 Marketing Copy Studio\n'];
      for (const art of marketingArts) {
        const label = art.artifact_type.replace('marketing_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        mcLines.push(`## ${label}\n`);
        const d = art.artifact_data || {};
        if (d.text) mcLines.push(d.text + '\n');
        if (d.headline) mcLines.push(`**${d.headline}**\n`);
        if (d.subheadline) mcLines.push(d.subheadline + '\n');
        if (d.cta_text) mcLines.push(`CTA: ${d.cta_text}\n`);
        if (d.subject) mcLines.push(`**Subject:** ${d.subject}\n`);
        if (d.body) mcLines.push(d.body + '\n');
        if (d.title) mcLines.push(`**${d.title}**\n`);
        if (d.intro) mcLines.push(d.intro + '\n');
        if (d.sections) mcLines.push(d.sections.map(s => `- ${s}`).join('\n') + '\n');
        if (d.conclusion) mcLines.push(d.conclusion + '\n');
        if (d.description) mcLines.push(`Description: ${d.description}\n`);
        if (d.keywords) mcLines.push(`Keywords: ${d.keywords.join(', ')}\n`);
        if (d.twitter) mcLines.push(`**Twitter/X:** ${d.twitter}\n`);
        if (d.linkedin) mcLines.push(`**LinkedIn:** ${d.linkedin}\n`);
        if (d.instagram) mcLines.push(`**Instagram:** ${d.instagram}\n`);
        if (d.facebook) mcLines.push(`**Facebook:** ${d.facebook}\n`);
        if (d.product_hunt) mcLines.push(`**Product Hunt:** ${d.product_hunt}\n`);
        if (d.persona_target) mcLines.push(`*Persona: ${d.persona_target}*\n`);
        mcLines.push('');
      }
      writeFileSync(join(docsDir, 'marketing-copy.md'), mcLines.join('\n'));
      docsCommitted.push('docs/marketing-copy.md');
    }
  } catch (err) {
    errors.push(`docs/marketing-copy.md: ${err.message}`);
  }

  // Update replit.md — use agent-optimized template or legacy.
  // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C): the target repos are
  // Replit-Agent repos that ship their OWN replit.md alongside .agents/.replit.
  // NEVER overwrite an existing replit.md wholesale — only write a fresh one
  // when none exists. When one is present we skip the write and record it so
  // callers can see the seeder deliberately preserved it.
  const replitMdPath = join(repoDir, 'replit.md');
  const replitMdExists = existsSync(replitMdPath);

  // Did the docs/designs writer actually write any approved HTML designs?
  // The writer pushes `docs/designs/<file>.html` entries to docsCommitted.
  // Gate all "see docs/designs/..." language on this so we never reference an
  // empty docs/designs/ folder. SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (C).
  const hasWrittenDesigns = docsCommitted.some(d => /^docs\/designs\/.+\.html$/.test(d));

  if (replitMdExists) {
    if (mode === 'build-into') {
      // SD-LEO-FEAT-S19-BUILDS-INTO-001 (TR-3b): preserve the repo's own replit.md
      // but append/refresh a marker-delimited EHG build-context section (idempotent)
      // so the builder is pointed at the seeded docs/. NEVER overwrite.
      try {
        const existing = readFileSync(replitMdPath, 'utf-8');
        writeFileSync(replitMdPath, withEhgBuildContextSection(existing, ventureName, hasWrittenDesigns));
        docsCommitted.push('replit.md (preserved; EHG build-context section appended)');
      } catch (err) {
        errors.push(`replit.md build-context append failed: ${err.message}`);
        docsCommitted.push('replit.md (preserved — repo shipped its own)');
      }
    } else {
      docsCommitted.push('replit.md (preserved — repo shipped its own)');
    }
  } else if (docFormat === 'agent-optimized') {
    const replitMd = generateAgentOptimizedReplitMd(ventureName, stitchManifest, { hasDesigns: hasWrittenDesigns });
    writeFileSync(replitMdPath, replitMd);
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

  // Gate docs/designs references on whether designs were actually written.
  const designsRefLine = hasWrittenDesigns
    ? '- **docs/designs/*.html** — Approved HTML designs for each screen (pixel-perfect reference)\n'
    : '';
  const designsBuildStep = hasWrittenDesigns
    ? '2. **Check docs/designs/ first** — these are approved HTML designs for each screen. Match them as closely as possible.\n'
    : '2. **Check docs/wireframes.md** — these are the screen layouts. Match their structure as closely as possible.\n';

  const replitMd = `# ${ventureName}

This project was scaffolded by Replit and enriched with planning documents from EHG.

## Reference Documents

All planning artifacts are in the \`docs/\` folder:

- **docs/branding.md** — Product name, color palette, typography, personas, brand voice
- **docs/architecture.md** — Tech stack, data model, API contract, schema
- **docs/wireframes.md** — All screen layouts with ASCII mockups
- **docs/context.md** — Problem statement, value proposition, competitive landscape, roadmap
- **docs/pricing.md** — Pricing model and tiers (if applicable)
${designsRefLine}- **docs/product-roadmap.md** — Feature priorities and phases
- **docs/gtm-strategy.md** — Marketing messaging and positioning
- **docs/color-palette.md** — Brand colors as CSS custom properties
${stitchSection}
## Build Instructions

When given a feature prompt, always:
1. Read the relevant docs/ file referenced in the prompt
${designsBuildStep}3. Use the CSS custom properties from docs/color-palette.md for all colors
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

  writeFileSync(replitMdPath, replitMd);
  docsCommitted.push('replit.md');
  } // end legacy format block

  // Git add, commit, push — idempotent: no-op when re-run on an
  // already-up-to-date repo (was reporting misleading "git push failed:
  // Command failed: git commit" on a benign re-click of Step 1; verified
  // empirically against rickfelix/lexiguard on 2026-04-28).
  try {
    execSync('git add docs/ replit.md', { cwd: repoDir, encoding: 'utf-8' });

    // `git diff --cached --quiet` exits 0 when nothing is staged, 1 when
    // there are staged changes. Wrap in try because execSync throws on
    // non-zero exit, which here means "there ARE changes to commit".
    let hasStagedChanges = false;
    try {
      execSync('git diff --cached --quiet', { cwd: repoDir, encoding: 'utf-8' });
      // exit 0 → nothing staged → re-run on an unchanged repo
    } catch {
      // exit 1 → staged changes exist → proceed with commit+push
      hasStagedChanges = true;
    }

    if (!hasStagedChanges) {
      console.log('[github-repo] No changes to commit (repo already up-to-date) — skipping commit+push');
    } else {
      execSync(
        'git commit -m "docs: seed reference documents from EHG venture pipeline\n\nAdds branding, architecture, wireframes, approved designs, roadmap,\nGTM strategy, and color palette from Stages 0-17 planning artifacts."',
        { cwd: repoDir, encoding: 'utf-8' }
      );
      try {
        execSync('git push', { cwd: repoDir, encoding: 'utf-8', timeout: 30000 });
      } catch (pushErr) {
        // SD-LEO-FEAT-S19-BUILDS-INTO-001: in build-into, a live repo may have
        // advanced between clone and push (non-fast-forward). Rebase onto the
        // latest remote and retry ONCE. NEVER force-push (would clobber the
        // venture's design). create-new keeps the original throw behavior.
        if (mode === 'build-into') {
          console.warn('[seeder] build-into push failed; pull --rebase + retry:', pushErr.message);
          execSync('git pull --rebase', { cwd: repoDir, encoding: 'utf-8', timeout: 30000 });
          execSync('git push', { cwd: repoDir, encoding: 'utf-8', timeout: 30000 });
        } else {
          throw pushErr;
        }
      }
    }
  } catch (err) {
    errors.push(`git push failed: ${err.message}`);
  }

  // Persist repo URL provenance (idempotent under venture_resources UNIQUE
  // constraint). Pre-2026-05-09 the seeder used the URL to clone/commit/push
  // but never recorded it, so Stage 19/20 lookups failed for ventures seeded
  // via the CLI / programmatic path — see feedback 9af99a84 (LexiGuard).
  //
  // ── Stage-19 registration gate (SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 / C) ──
  // INVESTIGATION (confirmed against lib/venture-resolver.js, lib/eva/bridge/
  // sd-router.js, venture-routing-error.js, applications/registry.json):
  //   * The gate clears when a venture is RESOLVABLE by the venture resolver
  //     AND ventures.repo_url is populated before Stage 19.
  //   * The PREFERRED resolver path is getVentureConfigAsync({ name, supabase }),
  //     which reads the `vw_venture_registry` DB view (a view over the `ventures`
  //     table) and matches by `normalized_name`. A venture that exists as a row
  //     in `ventures` with a non-colliding name IS resolvable here WITHOUT any
  //     edit to applications/registry.json.
  //   * The legacy sync path getVentureConfig(name) reads applications/registry.json
  //     and matches ventures.name (NFKD-normalized) against each entry's `.name`.
  //     applications/registry.json registers APPLICATIONS (APP001=ehg) at the app
  //     level — it is NOT a per-venture registry.
  //   * VentureNotRegisteredError's message ("Add to applications/registry.json
  //     AND populate ventures.repo_url before Stage 19, OR rename...") documents
  //     the two-sided contract: name-resolvable + repo_url set.
  //
  // The single registration step we own here is setting ventures.repo_url (below).
  // We deliberately DO NOT edit applications/registry.json per-venture: the SD
  // scope forbids blindly editing the app-level registry, and fresh-venture
  // validation resolves via the vw_venture_registry DB view (the ventures row
  // already carries ventures.name). If a future caller's venture is NOT
  // resolvable via the DB view (e.g. a name collision, or a deployment that
  // genuinely requires an app-level registry entry), that is a chairman-
  // governance / registry-management action — handle it via the registry tooling
  // (scripts/register-app.js), NOT an inline edit from the seeder.
  // TODO(SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001): if end-to-end validation on a
  // fresh venture shows the DB-view path is insufficient, add a dedicated
  // registerVentureFromArtifacts() helper rather than mutating registry.json here.
  try {
    await registerVentureResource(ventureId, 'github_repo', repoUrl, 'github', {
      seeded_by: 'replit-repo-seeder',
      seeded_at: new Date().toISOString(),
      docs_committed_count: docsCommitted.length,
    });
    // Single registration step the seeder owns: ensure ventures.repo_url is set
    // (clears the repo_url half of the Stage-19 gate). In build-into mode the
    // repo_url is ALREADY the SSOT (the resolver read it, normalized) — don't
    // overwrite it with the .git-suffixed clone URL.
    if (mode !== 'build-into') {
      await supabase.from('ventures').update({ repo_url: repoUrl }).eq('id', ventureId);
    }
  } catch (err) {
    errors.push(`venture_resources persistence failed: ${err.message}`);
  }

  return { success: errors.length === 0, docsCommitted, errors, repoDir, ventureName, mode };
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

  // Extract wireframe screens — PREFERRED: blueprint_wireframes (legacy export).
  const archGroup = findGroup(groups, 'how_to_build_it');
  const wfArt = archGroup?.artifacts?.find(a => a.artifact_type === 'blueprint_wireframes');
  const blueprintWireframes = parseContent(wfArt?.content) || {};

  // FALLBACK: S15 wireframe_screens artifact (new-pipeline ventures have no
  // blueprint_wireframes). Only fetch when the preferred path yields no screens.
  // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C).
  let wireframeScreensArtifact = null;
  const hasBlueprintScreens =
    (blueprintWireframes?.wireframes?.screens?.length || blueprintWireframes?.screens?.length || 0) > 0;
  if (!hasBlueprintScreens) {
    const { data: wsArt } = await supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'wireframe_screens')
      .eq('lifecycle_stage', 15)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    wireframeScreensArtifact = wsArt?.artifact_data || null;
  }

  const { screens } = resolveBuildScreens({ blueprintWireframes, wireframeScreensArtifact });

  // Determine which docs/designs/<stem>.html files actually exist for this
  // venture. They are only written when stage_17_approved_desktop artifacts are
  // present (mirrors the docs/designs writer in seedRepo). Without this, build
  // prompts emit dangling "see docs/designs/..." references for autonomous-
  // worker ventures that never produced approved desktop designs.
  const writtenDesignStems = await getWrittenDesignStems(supabase, ventureId);

  const features = screens.map((screen, i) =>
    buildFeaturePrompt({
      screen,
      index: i,
      total: screens.length,
      prevScreen: i > 0 ? screens[i - 1] : null,
      writtenDesignStems,
    })
  );

  return {
    initial: generateInitialPrompt(ventureName, 'Vite', { hasDesigns: writtenDesignStems.size > 0 }),
    features,
  };
}

/**
 * Compute the set of docs/designs/<stem>.html filename stems that the seeder
 * WOULD write for a venture. Mirrors the docs/designs writer in seedRepo (~L770):
 * a design file is written for each stage_17_approved_desktop artifact whose
 * artifact_data.html is a string, named from the matching wireframe screen name
 * (or the artifact title / screenId fallback).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<Set<string>>} stems (from designFileStem) of written design files
 */
async function getWrittenDesignStems(supabase, ventureId) {
  const stems = new Set();
  try {
    const { data: approvedDesigns } = await supabase
      .from('venture_artifacts')
      .select('artifact_data, metadata, title')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'stage_17_approved_desktop')
      .eq('is_current', true)
      .order('created_at');

    if (!approvedDesigns?.length) return stems;

    // Screen-name map (screen id -> name), same source the writer uses.
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
      if (s.id && (s.name || s.screen_name)) screenNames.set(s.id, s.name || s.screen_name);
    }

    for (const design of approvedDesigns) {
      const html = design.artifact_data?.html;
      if (!html || typeof html !== 'string') continue;
      const screenId = design.metadata?.screenId || 'unknown';
      const screenName = screenNames.get(screenId) || design.title?.replace(/\s*—.*$/, '') || screenId;
      stems.add(designFileStem(screenName));
    }
  } catch {
    // On any lookup error, return what we have — better to omit a design
    // reference than to emit a dangling one.
  }
  return stems;
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
