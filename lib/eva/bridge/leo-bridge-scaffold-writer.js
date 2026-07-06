/**
 * leo-bridge-scaffold-writer
 * SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-1)
 *
 * Pure builders: CLAUDE.md and docs/build-tasks.md content for build_model='leo_bridge'
 * ventures. NOT a reuse of claude-md-writer.js / build-tasks-writer.js — those bake in
 * Stitch->Lovable->GitHub->Replit assumptions (a Lovable-built landing page, per-page
 * docs/design-prompts.md prompts, docs/wireframes.md screens) that do not hold for
 * leo_bridge ventures, which build incrementally via LEO Strategic Directives dispatched
 * by the fleet coordinator (see lib/eva/lifecycle-sd-bridge.js::convertSprintToSDs),
 * not a fixed per-screen decomposition. Writing the Lovable-flavored content into a
 * leo_bridge repo would reference a landing page and prompt files that do not exist.
 *
 * .replit IS shared with the Stitch/Lovable/Replit path (see replit-config-writer.js) —
 * its stack-descriptor dispatch is generic and holds for either build model.
 *
 * Pure (no DB / git / fs) so it is unit-testable in isolation.
 */
import {
  deployTargetFamily,
  resolveDbLabel,
  resolveStorageLabel,
} from '../../venture-deploy/stack-descriptor.js';

/**
 * @param {Object} ctx
 * @param {string} [ctx.name] - venture name
 * @param {Object} [ctx.stackDescriptor] - optional stack descriptor
 * @returns {string} CLAUDE.md markdown
 */
export function buildLeoBridgeClaudeMd(ctx = {}) {
  const name = (ctx.name && String(ctx.name).trim()) || 'this venture';
  const sd = ctx.stackDescriptor || null;
  const family = deployTargetFamily(sd);
  const useCloud = family !== 'replit';
  const platformLabel = family === 'cloud-run' ? 'Google Cloud Run' : 'Cloudflare';
  const dbLabel = resolveDbLabel(sd);
  const storageLabel = resolveStorageLabel(sd);

  const hostingLine = useCloud
    ? `**${platformLabel} hosts** the result (it builds from this GitHub repo).`
    : '**Replit hosts** the result (it pulls from this GitHub repo).';

  return `# CLAUDE.md — ${name}

> Build instructions for **Claude Code**. This file is read automatically every session and is the **authoritative** build context for this repo.

## Build model (READ THIS)
This venture builds via **LEO Strategic Directives** (build_model=\`leo_bridge\`), NOT a fixed per-page prompt sequence. The platform's fleet coordinator dispatches an orchestrator SD plus child SDs for each sprint; ${hostingLine}
- Work through **\`docs/build-tasks.md\`** for a snapshot of the current sprint's task breakdown. The authoritative, live task list is the SD queue itself (\`strategic_directives_v2\`, filtered to this venture) — \`docs/build-tasks.md\` is a point-in-time export, not the source of truth.
- **Lead task is always "discover current state"** — do not assume the repo is unbuilt; prior SDs may have already built significant functionality.
- Keep changes **additive and scoped** to the active SD; match the existing design system and conventions already present in the repo.

## Backend: ${useCloud ? `${platformLabel}-native` : 'Replit-native'} ONLY — never Supabase
- **Data** → **${dbLabel}**.
- **File storage** → **${storageLabel}**.
- **NEVER** add \`@supabase/supabase-js\`, Supabase URLs/keys, RLS-as-business-logic, or Supabase Edge Functions. Read all backend config from **env vars** — never hardcode secrets.

## Conventions
- TypeScript strict; proper error handling on all async/IO; responsive (mobile-first); semantic HTML + ARIA.
- Secrets via env vars only. Don't commit keys.
- After each task: a quick build/typecheck, then commit with a clear message referencing the SD key.
`;
}

/**
 * @param {Object} ctx
 * @param {string} [ctx.name] - venture name
 * @returns {string} docs/build-tasks.md markdown (always non-empty)
 */
export function buildLeoBridgeBuildTasks(ctx = {}) {
  const name = (ctx.name && String(ctx.name).trim()) || 'Venture';
  return `# Build Tasks — ${name}

> This venture builds via **LEO Strategic Directives** (build_model=\`leo_bridge\`), not a
> static per-page task list. The fleet coordinator dispatches an orchestrator SD and child
> SDs per sprint (see \`lib/eva/lifecycle-sd-bridge.js::convertSprintToSDs\` in the platform
> repo). This file is a point-in-time scaffold placeholder, not the live task source.

## Where the real task list lives
Query \`strategic_directives_v2\` filtered to this venture for the current orchestrator and
child SDs — that is the authoritative, up-to-date build plan. If you are Claude Code working
inside this repo directly (outside the platform's fleet loop), **discover current state
first**: inspect the existing routes, schema, and data layer before adding new work, since
prior SDs may have already built significant functionality.
`;
}

export default { buildLeoBridgeClaudeMd, buildLeoBridgeBuildTasks };
