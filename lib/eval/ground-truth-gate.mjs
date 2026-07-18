/**
 * ground-truth-gate.mjs — FR-3 ground-truth BINDING gate + regression for the
 * model-capability eval (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-C, child C).
 *
 * This is the routing-TRUST seam: it is the SOLE code path allowed to flip
 * model_capability_reference.trusted_for_routing=true, and it does so ONLY when a
 * grader verdict REPRODUCES an INDEPENDENTLY-ADJUDICATED expected verdict for >=1
 * (task,model,effort). Everything is fail-closed: on any doubt it does NOT bind.
 *
 * ANTI-TAUTOLOGY RULE (RISK e25f3adf, C1 CRITICAL): grading a sealed run against
 * its OWN key is a FRESH grade, not a REPRODUCTION of a KNOWN verdict. A run always
 * grades against its own key, so "grader ran without throwing" is circular — a broken
 * grader stuck at clears_bar=true would bind routing. Therefore bound=true requires
 * grader_verdict === an independently-adjudicated expected verdict. The sealed Fable-5
 * corpus is UNGRADED today (every row grading="NOT GRADED — sealing only; grading
 * belongs to the eval harness"), so NO adjudicated expected verdict exists. The correct,
 * PERMANENT steady-state until an authority (Solomon/chairman/Opus-5-GA) seals an
 * adjudicated-verdict oracle is: { bound:false, reason:'GROUND_TRUTH_ABSENT',
 * reproduced_task_ids:[] } — a distinct, honest fail-closed reason, NOT an error and
 * NOT a broken child. Child C must NEVER self-author the verdict (that re-circularizes).
 *
 * DISTINCT FROM scripts/eval/ground-truth-gate.mjs (EVAL-001 FR-5): that is a CLI
 * (`evaluateGroundTruth(rows)` + a `main()`) using an adversarial-split heuristic over
 * already-graded rows. THIS module is the EVAL-002-C library API (adjudicated-verdict
 * reproduction) — different directory, different export names, no import collision
 * (mirrors the golden-task-loader.js/.mjs coexistence precedent).
 *
 * CONTAMINATION GUARD (inherited absolute): keys/task_text stay DB-side. This module
 * imports NO `fs` and performs NO filesystem writes; nothing it returns ever carries an
 * answer_key or task_text (mirrors child B's results-only toReferenceRow).
 */
import crypto from 'node:crypto';
import {
  loadGoldenTaskSets,
  getAnswerKey,
  SEAL_EVENT_TYPE,
  MIRROR_CATEGORY,
  MIRROR_SUITE,
} from './golden-task-loader.js';
import { gradeGoldenTasks } from './grader.mjs';
import { costNorm } from './capability-scorer.mjs';

/** The staged reference table (already carries trusted_for_routing DEFAULT false). */
export const TABLE = 'model_capability_reference';

/** Distinct fail-closed reason: no adjudicated verdict exists to reproduce (steady state). */
export const GROUND_TRUTH_ABSENT = 'GROUND_TRUTH_ABSENT';

/** Sealed rows carry this grading text until an authority adjudicates — never a verdict. */
export const UNADJUDICATED_GRADING_PREFIX = 'NOT GRADED';

/** Composite identity of a (task,model,effort) grading unit. */
function keyOf(r) {
  return `${r.task_id}::${r.model_id ?? null}::${r.effort ?? null}`;
}

/**
 * Parse an adjudicated expected clears_bar from a durable field, or null when the row
 * carries no independently-adjudicated verdict. Accepts an explicit boolean
 * `expected_clears_bar` or an `expected_verdict` of 'pass'|'fail'. Anything else → null
 * (fail-closed: absence, not a guess).
 */
export function expectedClearsBar(row) {
  if (row == null) return null;
  if (typeof row.expected_clears_bar === 'boolean') return row.expected_clears_bar;
  if (row.expected_verdict === 'pass') return true;
  if (row.expected_verdict === 'fail') return false;
  return null;
}

/**
 * Read the sealed corpus payloads (system_events canonical FIRST, feedback mirror only
 * when canonical is empty/errors). Reuses the loader's store constants — never a second
 * copy. Fail-closed: any read error yields [] (caller treats as GROUND_TRUTH_ABSENT).
 * CONTAMINATION GUARD: returns the raw payloads to the local adjudication reader ONLY;
 * this function is not exported and no key/text ever escapes into a gate return.
 */
async function readSealedPayloads(supabase) {
  const canonical = await supabase.from('system_events').select('id, payload').eq('event_type', SEAL_EVENT_TYPE);
  if (!canonical.error && Array.isArray(canonical.data) && canonical.data.length) {
    return canonical.data.map((r) => r.payload || {});
  }
  const mirror = await supabase.from('feedback').select('id, metadata').eq('category', MIRROR_CATEGORY);
  if (mirror.error) return [];
  return (mirror.data || []).map((r) => r.metadata || {}).filter((p) => p.suite === MIRROR_SUITE);
}

/**
 * Default adjudicated-verdict accessor. Returns one entry per (task,model,effort) that
 * carries an INDEPENDENTLY-ADJUDICATED expected verdict — i.e. an explicit expected_*
 * field AND a grading that is NOT the "NOT GRADED — sealing only" sentinel (or an
 * explicit adjudicated_by provenance). A run graded against its own key is deliberately
 * EXCLUDED (that is the tautology this guards). Today's corpus yields [] — GROUND_TRUTH_ABSENT.
 *
 * Extracts ONLY task_id/model_id/effort/expected_clears_bar — never answer_key or task_text.
 * @returns {Promise<Array<{task_id:string, model_id:string|null, effort:string|null, expected_clears_bar:boolean}>>}
 */
export async function readAdjudicatedVerdicts(supabase) {
  const payloads = await readSealedPayloads(supabase);
  const out = [];
  for (const p of payloads) {
    if (!p || !p.task_id) continue;
    const expected = expectedClearsBar(p);
    if (expected === null) continue; // no explicit expected verdict → not adjudicated
    const gradingIsAdjudicated = typeof p.grading === 'string' && !p.grading.startsWith(UNADJUDICATED_GRADING_PREFIX);
    if (!gradingIsAdjudicated && !p.adjudicated_by) continue; // self-graded/ungraded → excluded
    out.push({
      task_id: p.task_id,
      model_id: p.model_id ?? null,
      effort: p.effort ?? null,
      expected_clears_bar: expected,
    });
  }
  return out;
}

/**
 * PURE binding decision: does the grader reproduce >=1 adjudicated verdict?
 * Fail-closed at every seam: no adjudicated verdicts → GROUND_TRUTH_ABSENT; a grader row
 * missing or with clears_bar null → that unit is skipped (ambiguous, never a match); zero
 * matches → REPRODUCTION_MISMATCH. bound=true ONLY when at least one adjudicated verdict
 * equals the grader's verdict for the same (task,model,effort).
 *
 * @param {Array} adjudicated entries from readAdjudicatedVerdicts (or a stub)
 * @param {Array} graderRows results-only rows with {task_id,model_id,effort,clears_bar}
 * @returns {{bound:boolean, reason:string, reproduced_task_ids:string[]}}
 */
export function evaluateBinding(adjudicated, graderRows) {
  const adj = Array.isArray(adjudicated) ? adjudicated : [];
  if (adj.length === 0) {
    return { bound: false, reason: GROUND_TRUTH_ABSENT, reproduced_task_ids: [] };
  }
  const byKey = new Map();
  for (const r of graderRows || []) byKey.set(keyOf(r), r);

  const reproduced = new Set();
  for (const a of adj) {
    const expected = expectedClearsBar(a);
    if (expected === null) continue; // ambiguous adjudication → skip (fail-closed)
    const row = byKey.get(keyOf(a));
    if (!row) continue; // no grader verdict for this unit → skip
    if (row.clears_bar === null || row.clears_bar === undefined) continue; // ambiguous grader → skip
    if (row.clears_bar === expected) reproduced.add(a.task_id);
  }
  if (reproduced.size >= 1) {
    return { bound: true, reason: 'REPRODUCED', reproduced_task_ids: [...reproduced] };
  }
  return { bound: false, reason: 'REPRODUCTION_MISMATCH', reproduced_task_ids: [] };
}

/**
 * Assert the grader REPRODUCES a known (adjudicated) result. The anti-tautology core.
 *
 * Order matters: read the adjudicated oracle FIRST. If it is absent, return
 * GROUND_TRUTH_ABSENT WITHOUT grading — there is nothing to reproduce, so a fresh grade
 * would be pure circularity (and wastes model calls). Only when an adjudicated verdict
 * exists do we grade (child B path) and compare.
 *
 * @param {Object} supabase
 * @param {Object} deps
 * @param {Function} deps.gradeFn required — (request,{tier})=>grade, dependency-injected (no live model)
 * @param {Function} [deps.loader] default loadGoldenTaskSets
 * @param {Function} [deps.keyAccessor] default getAnswerKey
 * @param {Function} [deps.verdictAccessor] default readAdjudicatedVerdicts
 * @returns {Promise<{bound:boolean, reason:string, reproduced_task_ids:string[]}>}
 */
export async function assertReproducesKnownResult(supabase, {
  gradeFn,
  loader = loadGoldenTaskSets,
  keyAccessor = getAnswerKey,
  verdictAccessor = readAdjudicatedVerdicts,
} = {}) {
  let adjudicated;
  try {
    adjudicated = await verdictAccessor(supabase);
  } catch {
    return { bound: false, reason: 'ADJUDICATION_READ_ERROR', reproduced_task_ids: [] };
  }
  if (!Array.isArray(adjudicated) || adjudicated.length === 0) {
    // Steady state until an authority seals an adjudicated-verdict oracle.
    return { bound: false, reason: GROUND_TRUTH_ABSENT, reproduced_task_ids: [] };
  }

  let graded;
  try {
    graded = await gradeGoldenTasks(supabase, { gradeFn, loader, keyAccessor });
  } catch {
    return { bound: false, reason: 'GRADER_ERROR', reproduced_task_ids: [] };
  }
  return evaluateBinding(adjudicated, graded.rows || []);
}

/**
 * Probe table liveness with a REAL-ROW select (NOT head:true — that false-positives on a
 * missing table). STAGED-absent → { live:false } so callers return CEREMONY_PENDING.
 */
async function probeTable(supabase) {
  try {
    const probe = await supabase.from(TABLE).select('id').limit(1);
    if (probe && probe.error) return { live: false, reason: probe.error.message || 'table absent' };
    return { live: true };
  } catch (err) {
    return { live: false, reason: (err && err.message) || String(err) };
  }
}

/**
 * SOLE-WRITER binding flip. Called ONLY when bound=true. Flips trusted_for_routing=true +
 * stamps bound_at + a binding_id provenance for the reproduced task rows. STAGED-absent →
 * { status:'CEREMONY_PENDING' } (no flip, no throw). Never flips on bound=false — that path
 * goes through clearStaleBinds instead.
 *
 * @param {Object} supabase
 * @param {{reproduced_task_ids:string[], binding_id?:string}} args
 */
export async function bindTrustedForRouting(supabase, { reproduced_task_ids, binding_id = crypto.randomUUID() } = {}) {
  const probe = await probeTable(supabase);
  if (!probe.live) return { status: 'CEREMONY_PENDING', flipped: 0, reason: probe.reason };
  if (!Array.isArray(reproduced_task_ids) || reproduced_task_ids.length === 0) {
    return { status: 'NO_ROWS', flipped: 0 };
  }
  const up = await supabase
    .from(TABLE)
    .update({ trusted_for_routing: true, bound_at: new Date().toISOString(), binding_id })
    .in('task_id', reproduced_task_ids)
    .select('id');
  if (up && up.error) return { status: 'WRITE_ERROR', flipped: 0, reason: up.error.message };
  return { status: 'BOUND', flipped: (up.data || []).length, binding_id, reproduced_task_ids };
}

/**
 * Clear any STALE bind: trusted_for_routing→false + null out bound_at/binding_id on every
 * currently-trusted row. Run whenever a rerun yields bound=false so a prior bind cannot
 * outlive the evidence that justified it. STAGED-absent → CEREMONY_PENDING (no-op, no throw).
 */
export async function clearStaleBinds(supabase) {
  const probe = await probeTable(supabase);
  if (!probe.live) return { status: 'CEREMONY_PENDING', cleared: 0, reason: probe.reason };
  const up = await supabase
    .from(TABLE)
    .update({ trusted_for_routing: false, bound_at: null, binding_id: null })
    .eq('trusted_for_routing', true)
    .select('id');
  if (up && up.error) return { status: 'WRITE_ERROR', cleared: 0, reason: up.error.message };
  return { status: 'CLEARED', cleared: (up.data || []).length };
}

/**
 * Pricing/limits rerun helper: recompute cost_norm ONLY (reuse capability-scorer costNorm),
 * NO re-grade. quality_score/clears_bar are untouched — pricing cannot change a grader verdict.
 */
async function recomputeCostNorm(supabase) {
  const { data, error } = await supabase.from(TABLE).select('id, quality_score, tokens');
  if (error) return { ok: false, updated: 0, reason: error.message };
  let updated = 0;
  for (const r of data || []) {
    const cn = costNorm(r.quality_score, r.tokens);
    const up = await supabase.from(TABLE).update({ cost_norm: cn }).eq('id', r.id).select('id');
    if (!(up && up.error)) updated += 1;
  }
  return { ok: true, updated };
}

/**
 * Binding re-check WITHOUT re-grading: compare adjudicated verdicts against the grader
 * verdicts ALREADY STORED in the table (clears_bar). Used by pricing/limits reruns, which
 * must not spend a fresh grade. In steady state (adjudicated absent) → GROUND_TRUTH_ABSENT.
 */
async function bindingFromStored(supabase, { verdictAccessor = readAdjudicatedVerdicts } = {}) {
  let adjudicated;
  try {
    adjudicated = await verdictAccessor(supabase);
  } catch {
    return { bound: false, reason: 'ADJUDICATION_READ_ERROR', reproduced_task_ids: [] };
  }
  if (!Array.isArray(adjudicated) || adjudicated.length === 0) {
    return { bound: false, reason: GROUND_TRUTH_ABSENT, reproduced_task_ids: [] };
  }
  const { data, error } = await supabase.from(TABLE).select('task_id, model_id, effort, clears_bar');
  if (error) return { bound: false, reason: 'STORED_VERDICT_READ_ERROR', reproduced_task_ids: [] };
  return evaluateBinding(adjudicated, data || []);
}

/**
 * Regression rerun, SCOPED by trigger (RISK e25f3adf):
 *   - 'model'            → FULL re-grade (re-run the binding gate via the grader path).
 *   - 'pricing'|'limits' → recompute cost_norm ONLY (no re-grade); re-check binding from
 *                          STORED grader verdicts.
 * After any rerun the binding gate is re-run: bound=true → sole-writer flip; bound=false →
 * clear stale binds. STAGED-absent → CEREMONY_PENDING (real-row liveness probe, not head:true).
 *
 * @param {Object} supabase
 * @param {Object} deps
 * @param {'model'|'pricing'|'limits'} deps.trigger
 * @param {Function} deps.gradeFn required for trigger='model' (dependency-injected)
 * @param {Function} [deps.loader]
 * @param {Function} [deps.keyAccessor]
 * @param {Function} [deps.verdictAccessor]
 */
export async function runRegression(supabase, {
  trigger,
  gradeFn,
  loader = loadGoldenTaskSets,
  keyAccessor = getAnswerKey,
  verdictAccessor = readAdjudicatedVerdicts,
} = {}) {
  if (!['model', 'pricing', 'limits'].includes(trigger)) {
    throw new Error(`runRegression: trigger must be one of model|pricing|limits, got ${trigger}`);
  }
  const probe = await probeTable(supabase);
  if (!probe.live) return { status: 'CEREMONY_PENDING', trigger, reason: probe.reason };

  let recomputed = null;
  let binding;
  if (trigger === 'pricing' || trigger === 'limits') {
    recomputed = await recomputeCostNorm(supabase); // cost_norm only — NO re-grade
    binding = await bindingFromStored(supabase, { verdictAccessor });
  } else {
    // 'model' → full re-grade through the grader path
    binding = await assertReproducesKnownResult(supabase, { gradeFn, loader, keyAccessor, verdictAccessor });
  }

  let flip;
  if (binding.bound) {
    flip = await bindTrustedForRouting(supabase, { reproduced_task_ids: binding.reproduced_task_ids });
  } else {
    flip = await clearStaleBinds(supabase); // clear any stale bind post-rerun
  }
  return { status: 'RERUN', trigger, recomputed, binding, flip };
}
