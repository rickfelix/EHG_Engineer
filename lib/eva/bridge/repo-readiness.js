/**
 * repo-readiness
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-C (Child C / FR-1, FR-2, FR-3)
 *
 * Backward-compatible readiness contract for the Stage-19 cutover. For a venture,
 * surfaces whether its repo is Claude-Code-ready (a canonical repo resolves + the
 * artifacts seedRepo() commits) and a summary of the venture-derived build plan —
 * the data the ehg S19 UI will consume in Child D instead of paste-into-Agent
 * prompts. This child only ADDS the contract; the prompts payload and the dead
 * generateBuildPrompts/replit.md path are removed later in Child E.
 *
 * `buildReadinessSummary` is PURE (unit-testable, mirrors the Child-A writers).
 * `resolveRepoReadiness` is the async wrapper that resolves the venture's repo and
 * screens the SAME way seedRepo() does (resolveVentureRepoUrl + the seeder's
 * resolveBuildScreens against export_blueprint_review's how_to_build_it group,
 * with the S15 wireframe_screens fallback) so the summary matches what gets
 * committed to docs/build-tasks.md. It NEVER throws — a readiness-resolution
 * failure must never break the (load-bearing) prompts payload (FR-3).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolveVentureRepoUrl } from './resolve-venture-repo.js';
import { resolveBuildScreens } from './replit-repo-seeder.js';
dotenv.config();

// The Claude-Code-ready artifacts seedRepo() commits to a venture repo
// (lib/eva/bridge/replit-repo-seeder.js — the SD-...-001-B wiring block).
export const SEEDED_ARTIFACTS = ['CLAUDE.md', 'docs/build-tasks.md', '.replit'];

/** Parse content that may be a JSON string (mirrors the seeder's parseContent). */
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
 * PURE: normalize a build-task completion signal (from the latest build_mvp_build
 * artifact_data) into { total, complete, ratio } or null.
 * SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001 / FR-3. Degrade-safe — any missing/invalid input
 * yields null so the readiness contract is unchanged from before FR-3.
 *
 * @param {Object|null} input - e.g. { build_tasks_total, build_tasks_complete } or { total, complete }
 * @returns {{ total: number, complete: number, ratio: number } | null}
 */
export function normalizeBuildTaskCompletion(input) {
  if (!input || typeof input !== 'object') return null;
  const total = Number(input.total ?? input.build_tasks_total);
  if (!Number.isFinite(total) || total <= 0) return null;
  const completeRaw = Number(input.complete ?? input.build_tasks_complete);
  const complete = Number.isFinite(completeRaw) ? Math.max(0, Math.min(completeRaw, total)) : 0;
  return { total, complete, ratio: Math.round((complete / total) * 100) / 100 };
}

/**
 * PURE: build the readiness summary from already-resolved inputs.
 *
 * buildPlanSummary mirrors build-tasks-writer.js (buildBuildTasks): the
 * decomposition always has 3 children, and Child 2 holds one grandchild per
 * screen — or a single minimal-skeleton task when no screens resolve.
 *
 * @param {Object} args
 * @param {boolean} [args.repoReady] - a canonical repo resolves for the venture
 * @param {string} [args.ventureName]
 * @param {Array} [args.screens] - normalized screens (from resolveBuildScreens)
 * @param {Object|null} [args.buildTaskCompletion] - latest build_mvp_build artifact_data (FR-3); normalized, degrade-safe
 * @returns {{ repoReady: boolean, seededArtifacts: string[], buildPlanSummary: object, buildTaskCompletion: object|null }}
 */
export function buildReadinessSummary({ repoReady = false, ventureName = 'Venture', screens = [], buildTaskCompletion = null } = {}) {
  const name = (ventureName && String(ventureName).trim()) || 'Venture';
  const screenCount = Array.isArray(screens) ? screens.length : 0;
  return {
    repoReady: !!repoReady,
    seededArtifacts: [...SEEDED_ARTIFACTS],
    buildPlanSummary: {
      orchestrator: `${name} build`,
      childCount: 3,
      screenCount,
      featureTaskCount: screenCount > 0 ? screenCount : 1,
      source: screenCount > 0 ? 'screens' : 'skeleton',
    },
    // FR-3: build-task completeness from the latest build_mvp_build artifact (null when none).
    buildTaskCompletion: normalizeBuildTaskCompletion(buildTaskCompletion),
  };
}

/**
 * ASYNC: resolve a venture's repo-readiness for the Stage-19 route. NEVER throws —
 * on any failure returns a safe not-ready summary so the prompts payload (which
 * the live ehg S19 UI depends on today) is unaffected.
 *
 * @param {string} ventureId
 * @param {Object} [opts]
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabase] - injected for tests; a service-role client is created when omitted
 * @returns {Promise<{ repoReady: boolean, seededArtifacts: string[], buildPlanSummary: object }>}
 */
export async function resolveRepoReadiness(ventureId, { supabase } = {}) {
  try {
    const db = supabase || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const repoUrl = await resolveVentureRepoUrl(db, ventureId);

    let ventureName = 'Venture';
    try {
      const { data: venture } = await db.from('ventures').select('name').eq('id', ventureId).maybeSingle();
      if (venture?.name) ventureName = venture.name;
    } catch { /* keep default */ }

    // Screens — same resolution as seedRepo(): blueprint_wireframes from the
    // export_blueprint_review how_to_build_it group, else the S15 wireframe_screens
    // artifact. Wrapped so a missing/failed RPC degrades to zero screens, not a throw.
    let screens = [];
    try {
      const { data } = await db.rpc('export_blueprint_review', { p_venture_id: ventureId });
      const groups = data?.groups || [];
      const archGroup = groups.find((g) => g.group_key === 'how_to_build_it');
      const wfArt = archGroup?.artifacts?.find((a) => a.artifact_type === 'blueprint_wireframes');
      const blueprintWireframes = parseContent(wfArt?.content) || {};
      let wireframeScreensArtifact = null;
      const hasBlueprintScreens =
        (blueprintWireframes?.wireframes?.screens?.length || blueprintWireframes?.screens?.length || 0) > 0;
      if (!hasBlueprintScreens) {
        const { data: wsArt } = await db
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
      screens = resolveBuildScreens({ blueprintWireframes, wireframeScreensArtifact }).screens;
    } catch { /* degrade to zero screens */ }

    // FR-3 (SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001): surface build-task completeness from the
    // latest build_mvp_build artifact (emitted at register-deployment). Degrade-safe — a
    // missing artifact or absent fields normalizes to null, leaving the contract unchanged.
    let buildTaskCompletion = null;
    try {
      const { data: bmb } = await db
        .from('venture_artifacts')
        .select('artifact_data')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'build_mvp_build')
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      buildTaskCompletion = bmb?.artifact_data || null;
    } catch { /* degrade to null */ }

    return buildReadinessSummary({ repoReady: !!repoUrl, ventureName, screens, buildTaskCompletion });
  } catch {
    return buildReadinessSummary({ repoReady: false });
  }
}

export default resolveRepoReadiness;
