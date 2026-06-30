/**
 * Clean-clone launcher — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-B / FR-2, FR-3
 *
 * Orchestrates the clean-clone launch by composing the EXISTING Stage-0 seed
 * mechanism shipped by sibling -A (executeVentureReseeding / the
 * SEEDED_FROM_VENTURE path / persistVentureBrief, driven by executeStageZero).
 * This module adds NO seed logic — it adds the prereq gate, the idempotency
 * guard, and the dry-run/live wiring.
 *
 * Flow:
 *   1. verifyPrereqsMerged — abort (fail-loud) if any FR-2 prereq is not merged.
 *   2. idempotency — if a non-cancelled venture already seeded_from the source
 *      exists, report it and do NOT create a duplicate.
 *   3. executeStageZero({ path: seeded_from_venture, source_venture_id }) — dry-run
 *      validates without persisting; live persists a fresh active venture the
 *      stage-execution daemon then advances S0->S19.
 *
 * @module lib/eva/clean-clone/launch
 */

import { verifyPrereqsMerged, PREREQ_SD_KEYS } from './prereq-verifier.js';

/** venture-1 ("Market Modeling SaaS") — the dogfood-complete source thesis (frozen at S19). */
export const DEFAULT_SOURCE_VENTURE_ID = '849cd2bd-cd6e-4a5e-870d-e21a47b71393';

/** Stage-0 entry path key for reseeding (mirrors path-router ENTRY_PATHS.SEEDED_FROM_VENTURE). */
export const SEEDED_FROM_VENTURE_PATH = 'seeded_from_venture';

/** SD-LEO-INFRA-CONVERGENCE-SUBJECT-LIFECYCLE-001-A (FR-1): the REAL S0 create path (mirrors
 *  ENTRY_PATHS.BLUEPRINT_BROWSE) used for the NON-CLONE convergence dummy subject — NOT the
 *  seeded-from-venture reseed path, so the created venture has seeded_from_venture_id=NULL. */
export const BLUEPRINT_BROWSE_PATH = 'blueprint_browse';
// SD-LEO-INFRA-NONCLONE-DUMMY-S0-PATH-DISCOVERY-001: the DEFAULT non-clone create path. blueprint_browse
// requires a curated blueprint to exist (0 do, so create always failed 'No blueprints available');
// discovery_mode + a strategy generates a from-scratch venture with NO pre-seeded data — the
// semantically-correct path for a convergence subject that has no curated thesis.
export const DISCOVERY_MODE_PATH = 'discovery_mode';
// A from-scratch discovery strategy present in FALLBACK_STRATEGIES (lib/eva/stage-zero/strategy-loader.js),
// so it works even with no discovery_strategies rows seeded.
export const DEFAULT_NONCLONE_STRATEGY = 'capability_overhang';

/**
 * Find an existing non-cancelled venture seeded from the source (idempotency).
 * Checks both the seeded_from_venture_id column and metadata.seeded_from_venture_id.
 *
 * @returns {Promise<{id:string,name:string,status:string}|null>}
 */
export async function findExistingClone(supabase, sourceVentureId) {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, status, seeded_from_venture_id, metadata') // schema-lint-disable-line: seeded_from_venture_id is a real uuid column added by sibling -A (CLEAN-CLONE-LAUNCH-001-A); lint snapshot is stale (verified live in information_schema)
    .or(`seeded_from_venture_id.eq.${sourceVentureId},metadata->>seeded_from_venture_id.eq.${sourceVentureId}`)
    .neq('status', 'cancelled');
  if (error) throw new Error(`idempotency check failed: ${error.message}`);
  const rows = (data || []).filter(
    (v) => v.seeded_from_venture_id === sourceVentureId
      || v.metadata?.seeded_from_venture_id === sourceVentureId,
  );
  return rows[0] || null;
}

/**
 * Launch (or dry-run) the clean clone.
 *
 * @param {Object} params
 * @param {string} [params.sourceVentureId=DEFAULT_SOURCE_VENTURE_ID]
 * @param {boolean} [params.dryRun=true] - dry-run validates without persisting (safe default)
 * @param {string[]} [params.prereqKeys=PREREQ_SD_KEYS]
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @param {Function} deps.executeStageZero - the Stage-0 driver (injected; from lib/eva/stage-zero)
 * @returns {Promise<Object>} structured launch result
 */
/**
 * SD-LEO-INFRA-CLONE-LAUNCH-ENABLES-REPAIR-OVERRIDE-001 (FR-1): opt a freshly-launched clone into the
 * vision-repair loop via the flag's DESIGNED per-venture override — the eva_venture_config key
 * `venture:<id>:vision_repair_loop_enabled`=true that isRepairLoopEnabled (lib/eva/vision-repair-loop.js)
 * already reads with precedence over the global flag. So a fresh clone (which structurally needs repair:
 * 0/10 sections, no chairman) can repair its draft_seed vision at S19, while the global kill-switch stays
 * default-off and real ventures are untouched. This is NOT a code bypass of isRepairLoopEnabled and NOT a
 * global-flag flip (the #5237 kill-switch / #5235 backdoor-closure governance stays intact). Idempotent
 * (onConflict 'key') and best-effort / non-fatal — the clone is already created, so a config-write
 * failure logs and returns false rather than throwing up. Clone-only: called solely by launchCleanClone.
 * @param {Object} supabase
 * @param {string} ventureId - the new clone's venture UUID
 * @param {Object} [logger=console]
 * @returns {Promise<boolean>} true when the override row was written
 */
export async function setCloneVisionRepairOverride(supabase, ventureId, logger = console) {
  if (!supabase || !ventureId) return false;
  const key = `venture:${ventureId}:vision_repair_loop_enabled`;
  try {
    const { error } = await supabase
      .from('eva_venture_config')
      .upsert({
        key,
        value: true,
        description: 'Per-venture vision-repair override set by clean-clone launch (SD-LEO-INFRA-CLONE-LAUNCH-ENABLES-REPAIR-OVERRIDE-001) so a fresh clone can repair its draft_seed vision at S19; global kill-switch stays off.',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    logger.log?.(`[CleanCloneLaunch] vision-repair per-venture override set: ${key}=true`);
    return true;
  } catch (e) {
    logger.warn?.(`[CleanCloneLaunch] vision-repair override upsert failed (non-fatal): ${e.message}`);
    return false;
  }
}

export async function launchCleanClone(params = {}, deps = {}) {
  const {
    sourceVentureId = DEFAULT_SOURCE_VENTURE_ID,
    dryRun = true,
    prereqKeys = PREREQ_SD_KEYS,
  } = params;
  const { supabase, logger = console, executeStageZero } = deps;
  if (!supabase) throw new Error('supabase client is required');
  if (typeof executeStageZero !== 'function') throw new Error('executeStageZero dependency is required');

  // 1. Prereq gate (fail-loud)
  const prereqs = await verifyPrereqsMerged(supabase, prereqKeys);
  if (!prereqs.ok) {
    logger.error(`[CleanCloneLaunch] ABORT — prereqs not merged: ${prereqs.missing.join(', ')}`);
    return { ok: false, stage: 'prereq', prereqs, seeded: false };
  }
  logger.log(`[CleanCloneLaunch] Prereqs verified merged (${prereqKeys.length} SD(s))`);

  // 2. Idempotency
  const existing = await findExistingClone(supabase, sourceVentureId);
  if (existing) {
    logger.log(`[CleanCloneLaunch] Clone already exists (${existing.id}, status=${existing.status}) — not duplicating`);
    return { ok: true, skipped: true, stage: 'idempotent', prereqs, existing, seeded: false };
  }

  // 3. Seed via the existing Stage-0 mechanism
  logger.log(`[CleanCloneLaunch] ${dryRun ? 'DRY-RUN' : 'LIVE'} seed from venture ${sourceVentureId} via ${SEEDED_FROM_VENTURE_PATH}`);
  const stageZero = await executeStageZero(
    {
      path: SEEDED_FROM_VENTURE_PATH,
      pathParams: { source_venture_id: sourceVentureId },
      options: { nonInteractive: true, dryRun },
    },
    { supabase, logger },
  );

  const newVentureId = stageZero?.record_id || stageZero?.venture_id || stageZero?.venture?.id || null;
  if (!dryRun && newVentureId) {
    logger.log(`[CleanCloneLaunch] LIVE clone created: ${newVentureId} — the daemon will advance it S0->S19`);
    // SD-LEO-INFRA-CLONE-LAUNCH-ENABLES-REPAIR-OVERRIDE-001 (FR-1): opt the clone into vision repair via
    // the designed per-venture override so it can promote its draft_seed vision at S19 (the global
    // kill-switch stays off; real ventures untouched). Best-effort — the clone already exists.
    await setCloneVisionRepairOverride(supabase, newVentureId, logger);
  }
  return {
    ok: stageZero?.success !== false,
    stage: 'seeded',
    dryRun,
    prereqs,
    stageZero,
    newVentureId,
    seeded: !dryRun && Boolean(newVentureId),
  };
}

/**
 * SD-LEO-INFRA-CONVERGENCE-SUBJECT-LIFECYCLE-001-A (FR-1): launch a NON-CLONE dummy SUBJECT for the
 * convergence walk. Unlike launchCleanClone (which RESEEDS from venture-1 via SEEDED_FROM_VENTURE), this
 * creates a real-shaped THROWAWAY subject via the REAL S0 create path (blueprint_browse) so it is NOT a
 * clone: seeded_from_venture_id=NULL, is_demo=FALSE, is_scaffolding=FALSE. Exercising the real S0/create
 * path proves the convergence harness on a non-clone subject; the daemon then advances it S0->S19.
 *
 * dryRun (default true) validates without persisting. executeStageZero is deps-injectable (CI mocks it —
 * no real venture). A LIVE create asserts the non-clone invariant (a clone/demo/scaffolding result is a
 * convergence-subject-invariant violation -> ok:false, loud).
 *
 * NOTE (FR-2 finding, surfaced for the orchestrator): a non-clone subject is NOT auto-vision-promoted —
 * _autoApproveCloneVision is clone-only (seeded_from_venture_id NOT NULL) and the dummy has no chairman,
 * so assertVentureVisionReady will BLOCK it at the S19 vision_approval gate. The convergence harness must
 * provide a vision-approval path for the subject (extend the auto-promote to a convergence-subject marker,
 * or approve its L2 vision at creation) BEFORE Phase-A run #1.
 *
 * @param {{ path?:string, strategy?:string, blueprintId?:(string|null), category?:(string|null), dryRun?:boolean }} params
 *   path defaults to discovery_mode (from-scratch, no pre-seeded data); strategy defaults to
 *   capability_overhang. Pass path=blueprint_browse + blueprintId to use a curated blueprint instead.
 * @param {{ supabase:object, logger?:object, executeStageZero:Function }} deps
 * @returns {Promise<{ ok:boolean, stage:string, dryRun:boolean, stageZero:object, newVentureId:(string|null), venture?:object }>}
 */
export async function launchNonCloneDummy(params = {}, deps = {}) {
  const {
    // SD-LEO-INFRA-NONCLONE-DUMMY-S0-PATH-DISCOVERY-001: default to discovery_mode + a from-scratch
    // strategy so a non-clone subject is actually creatable with NO pre-seeded data. blueprint_browse
    // (which needs a curated blueprint to exist — 0 do) stays reachable via params.path for a caller
    // that has seeded one.
    path = DISCOVERY_MODE_PATH,
    strategy = DEFAULT_NONCLONE_STRATEGY,
    blueprintId = null,
    category = null,
    dryRun = true,
  } = params;
  const { supabase, logger = console, executeStageZero } = deps;
  if (!supabase) throw new Error('supabase client is required');
  if (typeof executeStageZero !== 'function') throw new Error('executeStageZero dependency is required');

  // Build the path-specific params: discovery_mode generates from-scratch (strategy); blueprint_browse
  // selects a curated blueprint (blueprintId/category). The discovery default never trips 'No blueprints'.
  const pathParams = path === BLUEPRINT_BROWSE_PATH ? { blueprintId, category } : { strategy };
  logger.log(`[NonCloneDummy] ${dryRun ? 'DRY-RUN' : 'LIVE'} create a non-clone convergence subject via the REAL S0 path (${path}${path === DISCOVERY_MODE_PATH ? `, strategy=${strategy}` : ''}) — NOT the seeded reseed path`);
  const stageZero = await executeStageZero(
    {
      path,
      pathParams,
      options: { nonInteractive: true, dryRun },
    },
    { supabase, logger },
  );

  const newVentureId = stageZero?.record_id || stageZero?.venture_id || stageZero?.venture?.id || null;

  if (!dryRun && newVentureId) {
    // Assert the convergence-subject invariant: a real-shaped NON-CLONE throwaway. A clone (seeded),
    // demo, or scaffolding subject would NOT exercise the real create path / would trip other protections.
    const { data: v } = await supabase
      .from('ventures')
      .select('seeded_from_venture_id, is_demo, is_scaffolding')
      .eq('id', newVentureId)
      .maybeSingle();
    const nonClone = v && v.seeded_from_venture_id == null && v.is_demo !== true && v.is_scaffolding !== true;
    if (!nonClone) {
      logger.error(`[NonCloneDummy] created venture ${newVentureId} is NOT a clean non-clone subject (seeded=${v?.seeded_from_venture_id}, demo=${v?.is_demo}, scaffolding=${v?.is_scaffolding}) — convergence-subject invariant violated`);
      return { ok: false, stage: 'verify_non_clone', dryRun, stageZero, newVentureId, venture: v };
    }
    logger.log(`[NonCloneDummy] LIVE non-clone subject created: ${newVentureId} (seeded_from_venture_id=NULL) — the daemon will advance it S0->S19`);
  }

  return { ok: stageZero?.success !== false, stage: 'created', dryRun, stageZero, newVentureId };
}
