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
import { buildClaudeMd } from './claude-md-writer.js';
import { buildBuildTasks } from './build-tasks-writer.js';
import { buildDesignPrompts } from './design-prompts-writer.js';
import { buildReplitConfig } from './replit-config-writer.js';
// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C5 + C3 (SECURITY VB-5/VB-3): fail-closed
// venture-repo routing + secret scan before any push to an external venture repo.
import { SAFE_GITHUB_HTTPS } from './resolve-venture-repo.js';
import { scanSecrets } from '../../../scripts/modules/session-summary/secret-redactor.js';

// Platform repos must NEVER be a venture-seed target — seeding venture content into
// EHG/EHG_Engineer is a routing escape (C5/VB-5). Matched after .git/trailing-slash strip.
const PLATFORM_REPO_URL_RES = [
  /^https:\/\/github\.com\/rickfelix\/ehg$/i,
  /^https:\/\/github\.com\/rickfelix\/EHG_Engineer$/i,
];

/**
 * C5 (SECURITY VB-5): fail-closed venture-repo routing guard. The seeder clones and
 * PUSHES to repoUrl, so an empty/unknown/hostile/platform URL must hard-fail rather than
 * fall through (e.g. clone garbage, or push venture docs into the platform repo).
 *
 * @param {string} repoUrl
 * @returns {string} normalized https URL (no .git)
 * @throws if not a safe non-platform GitHub HTTPS venture URL
 */
export function assertSeedableVentureRepo(repoUrl) {
  const normalized = (repoUrl || '').trim().replace(/\.git\/?$/, '');
  if (!normalized || !SAFE_GITHUB_HTTPS.test(normalized)) {
    throw new Error(
      `[seeder] FAIL-CLOSED: repoUrl '${repoUrl ?? ''}' is not a valid GitHub HTTPS venture repo URL — `
      + `refusing to clone/seed (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C5 / SECURITY VB-5; no fall-through to platform).`
    );
  }
  if (PLATFORM_REPO_URL_RES.some((re) => re.test(normalized))) {
    throw new Error(
      `[seeder] FAIL-CLOSED: refusing to seed venture content into the PLATFORM repo '${normalized}' `
      + `(C5 / VB-5 — venture builds must target their own repo, never EHG/EHG_Engineer).`
    );
  }
  return normalized;
}

// Text file extensions worth scanning for secrets before push (skip binaries: png/jpg/etc).
const SCANNABLE_EXT_RE = /\.(md|markdown|json|jsonc|js|cjs|mjs|ts|tsx|jsx|txt|env|ya?ml|sh|bash|html?|css|toml|ini|cfg|conf|xml|svg)$/i;
const SCANNABLE_EXACT = new Set(['.replit', 'CLAUDE.md', 'replit.md', '.env', 'Dockerfile']);

/**
 * C3 (SECURITY VB-3): scan the text files staged for push for stack-aware secrets.
 * Returns the list of hits ({ file, categories }). Binary files are skipped. Pure
 * (fs read only) so it is unit-testable against a fixture dir.
 *
 * @param {string} repoDir
 * @param {string[]} stagedRelPaths - repo-relative paths (e.g. from git diff --cached --name-only)
 * @returns {{ file: string, categories: string[] }[]}
 */
export function scanStagedFilesForSecrets(repoDir, stagedRelPaths) {
  const hits = [];
  for (const rel of stagedRelPaths || []) {
    const base = rel.split('/').pop() || rel;
    if (!SCANNABLE_EXT_RE.test(rel) && !SCANNABLE_EXACT.has(base)) continue;
    const abs = join(repoDir, rel);
    if (!existsSync(abs)) continue;
    let content;
    try { content = readFileSync(abs, 'utf-8'); } catch { continue; }
    const { found, categories } = scanSecrets(content);
    if (found) hits.push({ file: rel, categories });
  }
  return hits;
}

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

// SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-E: generateAgentOptimizedReplitMd +
// generateInitialPrompt (the paste-into-Replit-Agent replit.md + scaffold-prompt
// generators) were removed. Claude Code now builds from the seeded repo
// (CLAUDE.md + docs/build-tasks.md, emitted in seedRepo()); there are no prompts to
// paste and no fresh replit.md is seeded (CLAUDE.md supersedes it).

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

  // C5 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-5): fail-closed routing.
  // The seeder clones AND pushes to repoUrl — an empty/unknown/hostile/platform URL must
  // hard-fail here rather than fall through to clone garbage or push venture content into
  // the platform repo. Validate for its throw side-effect; keep the caller's original URL
  // form (e.g. trailing .git) for downstream clone + venture_resources provenance.
  assertSeedableVentureRepo(repoUrl);

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
    // C1 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-1): per-venture token seam.
    // PREFERRED: a per-venture least-privilege token (a GitHub App installation token scoped to
    // THIS venture repo) supplied via options.tokenProvider. The shared ambient gh PAT grants
    // the harness write access to every repo the operator's gh login can reach — a lateral-
    // movement surface across all ventures + both platform repos. When no provider is wired we
    // fall back to that ambient credential helper and WARN loudly. FULL closure of VB-1 requires
    // provisioning the GitHub App (ops prerequisite) — and that closure GATES the FR-3 venture
    // re-route (routing the harness into untrusted venture repos under the shared PAT is exactly
    // the exposure C1 must remove first).
    let perVentureTokenConfigured = false;
    if (typeof options.tokenProvider === 'function') {
      try {
        const provided = await options.tokenProvider({ ventureId, repoUrl });
        if (provided && typeof provided.configureGit === 'function') {
          await provided.configureGit({ repoDir, repoUrl });
          perVentureTokenConfigured = true;
        }
      } catch (err) {
        errors.push(`per-venture tokenProvider failed: ${err.message}`);
      }
    }
    if (!perVentureTokenConfigured) {
      console.warn(
        '[seeder] ⚠ C1/VB-1: no per-venture tokenProvider supplied — falling back to the shared ambient '
        + 'gh PAT (broad write surface). Provision the GitHub App + pass options.tokenProvider to scope a '
        + 'least-privilege per-venture token. FR-3 venture re-route MUST NOT run until VB-1 is closed.'
      );
      try {
        execSync('gh auth setup-git', { encoding: 'utf-8', timeout: 15000 });
      } catch (err) {
        errors.push(`gh auth setup-git failed (private clone may not authenticate): ${err.message}`);
      }
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
  } else {
    // SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-E: a fresh replit.md is no longer
    // seeded. CLAUDE.md (committed by the Claude-Code-ready block below) is now the
    // authoritative build context and supersedes the legacy Agent-oriented replit.md.
    // An EXISTING replit.md (build-into repos that ship their own) is still preserved
    // above with the EHG build-context marker appended.
    docsCommitted.push('replit.md (not seeded — CLAUDE.md supersedes)');
  }

  // SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-B: emit the Claude-Code-ready repo
  // artifacts (CLAUDE.md + docs/build-tasks.md + minimal .replit) so a venture
  // reaching S19 is buildable by Claude Code, not just paste-into-Agent prompts.
  // Resolve the venture's screens the same way generateBuildPrompts does, then
  // feed the pure Child-A writers. CLAUDE.md/.replit are PRESERVED if the repo
  // already ships its own (same rule as replit.md); docs/build-tasks.md is
  // regenerated like the other docs.
  try {
    const archGroup = findGroup(groups, 'how_to_build_it');
    const wfArt = archGroup?.artifacts?.find(a => a.artifact_type === 'blueprint_wireframes');
    const blueprintWireframes = parseContent(wfArt?.content) || {};
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
    const ventureContext = { name: ventureName, screens };

    // docs/build-tasks.md — venture-derived; regenerated like the other docs.
    writeFileSync(join(docsDir, 'build-tasks.md'), buildBuildTasks(ventureContext));
    docsCommitted.push('docs/build-tasks.md');

    // docs/design-prompts.md — the four reusable additional-page build prompts
    // (SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001-B / FR-2). Static/product-agnostic;
    // referenced by build-tasks.md + CLAUDE.md. Staged via the `git add docs/` below.
    writeFileSync(join(docsDir, 'design-prompts.md'), buildDesignPrompts());
    docsCommitted.push('docs/design-prompts.md');

    // CLAUDE.md (root) — preserve a repo's own hand-tuned file; only seed when absent.
    const claudeMdPath = join(repoDir, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      writeFileSync(claudeMdPath, buildClaudeMd(ventureContext));
      docsCommitted.push('CLAUDE.md');
    } else {
      docsCommitted.push('CLAUDE.md (preserved — repo shipped its own)');
    }

    // .replit (root) — preserve the repo's own hosting config; only seed when absent.
    const replitConfigPath = join(repoDir, '.replit');
    if (!existsSync(replitConfigPath)) {
      writeFileSync(replitConfigPath, buildReplitConfig(ventureContext));
      docsCommitted.push('.replit');
    } else {
      docsCommitted.push('.replit (preserved — repo shipped its own)');
    }
  } catch (err) {
    errors.push(`claude-code-ready artifacts: ${err.message}`);
  }

  // Git add, commit, push — idempotent: no-op when re-run on an
  // already-up-to-date repo (was reporting misleading "git push failed:
  // Command failed: git commit" on a benign re-click of Step 1; verified
  // empirically against rickfelix/lexiguard on 2026-04-28).
  try {
    execSync('git add docs/ replit.md CLAUDE.md .replit', { cwd: repoDir, encoding: 'utf-8' });

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
      // C3 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-3): scan staged text files
      // for stack-aware secrets (Clerk/Gemini/Replit/…) BEFORE commit/push. Fail CLOSED — never
      // push a secret into an external venture repo. On a hit: record the error, unstage, and
      // skip commit+push (the caller surfaces `errors`).
      const stagedList = (execSync('git diff --cached --name-only', { cwd: repoDir, encoding: 'utf-8' }) || '')
        .split('\n').map((s) => s.trim()).filter(Boolean);
      const secretHits = scanStagedFilesForSecrets(repoDir, stagedList);
      if (secretHits.length > 0) {
        const detail = secretHits.map((h) => `${h.file} [${h.categories.join(', ')}]`).join('; ');
        errors.push(
          `[seeder] FAIL-CLOSED (C3/VB-3): refusing to commit/push — secrets detected in staged files: ${detail}. `
          + 'Remove the secret(s) before re-seeding.'
        );
        try { execSync('git reset', { cwd: repoDir, encoding: 'utf-8' }); } catch { /* best-effort unstage */ }
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
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-E: generateBuildPrompts +
 * getWrittenDesignStems (the CLI-only build-prompt generators) were removed.
 * Claude Code builds the features from the seeded repo via docs/build-tasks.md
 * (emitted by seedRepo()), so per-feature paste prompts are no longer generated.
 * The pure helpers resolveBuildScreens / buildFeaturePrompt / designFileStem
 * remain (used by repo-readiness.js and the Claude-Code-ready seed block).
 */

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
  seed <venture-id> <repo-url>     Clone repo, commit docs/ + Claude-Code-ready files, push

Examples:
  node lib/eva/bridge/replit-repo-seeder.js seed <id> https://github.com/user/repo.git
`);
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
}
