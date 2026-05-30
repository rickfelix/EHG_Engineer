#!/usr/bin/env node
/**
 * scripts/validate-boundary-config-coherence.mjs
 *
 * SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-7: CI pre-merge guard that asserts
 * every required artifact_type in public.gate_boundary_config maps to some
 * upstream stage's venture_stages.required_artifacts.
 *
 * Drift class this catches: someone adds a row to gate_boundary_config referencing
 * an artifact_type that no stage analyzer emits — the same class of bug that
 * NameSignal venture (57e2645a-...) hit at the 9->10 boundary on 2026-05-12.
 *
 * Exit codes (bracket-tokenized markers per LEO convention):
 *   0 + [BOUNDARY_COHERENCE_OK]               — all boundaries map to upstream emitters
 *   1 + [BOUNDARY_DRIFT]                       — at least one orphan artifact_type
 *   2 + [BOUNDARY_CHECK_INFRA_ERROR]           — missing env vars / DB unreachable
 *
 * Per memory QF-20260511-469: explicit process.exit() with awaited flush to avoid
 * Windows libuv async.c:76 hangs.
 *
 * Exported pure functions for unit testing:
 *   - findOrphanArtifactTypes(boundaries, stages) -> [{from_stage, to_stage, artifact_type}]
 *   - evaluateCoherence(boundaries, stages)       -> {ok, orphans, summary}
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Find artifact_types in `boundaries` that no upstream stage emits.
 *
 * @param {Array<{from_stage, to_stage, required_artifacts: string[]}>} boundaries
 * @param {Array<{stage_number, required_artifacts: string[]}>} stages
 * @returns {Array<{from_stage, to_stage, artifact_type}>}
 */
export function findOrphanArtifactTypes(boundaries, stages) {
  const orphans = [];
  for (const boundary of boundaries) {
    const upstreamEmitters = new Set();
    for (const stage of stages) {
      if (stage.stage_number > boundary.from_stage) continue;
      for (const at of (stage.required_artifacts || [])) {
        upstreamEmitters.add(at);
      }
    }
    for (const required of (boundary.required_artifacts || [])) {
      if (!upstreamEmitters.has(required)) {
        orphans.push({
          from_stage: boundary.from_stage,
          to_stage: boundary.to_stage,
          artifact_type: required,
        });
      }
    }
  }
  return orphans;
}

/**
 * Top-level coherence evaluator. Used by CI guard and integration tests.
 *
 * @param {Array} boundaries
 * @param {Array} stages
 * @returns {{ok: boolean, orphans: Array, summary: string}}
 */
export function evaluateCoherence(boundaries, stages) {
  const orphans = findOrphanArtifactTypes(boundaries, stages);
  const ok = orphans.length === 0;
  const summary = ok
    ? `OK: ${boundaries.length} boundaries, all required artifacts map to upstream emitters across ${stages.length} stages`
    : `DRIFT: ${orphans.length} orphan artifact_type(s) — boundaries reference names no upstream stage emits`;
  return { ok, orphans, summary };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('[BOUNDARY_CHECK_INFRA_ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let boundaries;
  let stages;
  try {
    const { data: boundaryRows, error: boundaryErr } = await supabase
      .from('gate_boundary_config')
      .select('from_stage, to_stage, required_artifacts');
    if (boundaryErr) throw boundaryErr;
    boundaries = boundaryRows || [];

    const { data: stageRows, error: stageErr } = await supabase
      .from('venture_stages')
      .select('stage_number, required_artifacts');
    if (stageErr) throw stageErr;
    stages = stageRows || [];
  } catch (err) {
    console.error(`[BOUNDARY_CHECK_INFRA_ERROR] DB read failed: ${err.message || err}`);
    process.exit(2);
  }

  const { ok, orphans, summary } = evaluateCoherence(boundaries, stages);

  if (!ok) {
    console.error('[BOUNDARY_DRIFT]', summary);
    for (const o of orphans) {
      console.error(`  - boundary ${o.from_stage}->${o.to_stage} requires '${o.artifact_type}' but no stage <= ${o.from_stage} emits it`);
    }
    process.exit(1);
  }

  console.log('[BOUNDARY_COHERENCE_OK]', summary);
  process.exit(0);
}

// libuv-safe exit pattern (QF-20260511-469): await main, catch unhandled, then
// explicit exit. Avoids dangling timers / handle close races on Windows.
main().catch((err) => {
  console.error(`[BOUNDARY_CHECK_INFRA_ERROR] Unhandled: ${err?.message || err}`);
  process.exit(2);
});
