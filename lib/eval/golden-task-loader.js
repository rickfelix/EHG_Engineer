/**
 * golden-task-loader.js — FR-1 golden task-set loader over the sealed Fable-5 rows
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-A).
 *
 * Read-only foundation for the model-capability eval. This module ONLY reads the
 * sealed baselines and defines contracts — it does NOT grade, score, run models,
 * or route (those are children B/C/D).
 *
 * CONTAMINATION GUARD (load-bearing security requirement, Solomon: keys DB-side
 * only): the golden task SETS returned by loadGoldenTaskSets DELIBERATELY carry
 * no answer_key. Answer keys live only in the DB and are reachable exclusively
 * through getAnswerKey (a server-side accessor used only by a future grader).
 * This module performs NO filesystem writes of any kind — it never imports `fs`.
 *
 * Distinct from the EVAL-001 `golden-task-loader.mjs` (loadGoldenSuite/GoldenTask):
 * that module models an answer-key redaction suite; this module (EVAL-002-A)
 * assembles per-task SETS carrying the multi-effort sealed_run outputs for
 * capability grading, plus the model_capability_reference population contract.
 */

/** system_events canonical seal event type. */
export const SEAL_EVENT_TYPE = 'fable5_baseline_seal';
/** feedback mirror discriminators. */
export const MIRROR_CATEGORY = 'model_capability_baseline';
export const MIRROR_SUITE = 'FABLE5-BASELINE-2026-07-16';

/** Named error for corpus-unavailable / integrity conditions. Never interpolates key text. */
export class GoldenTaskLoaderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoldenTaskLoaderError';
  }
}

/**
 * Normalize a store row to its sealed payload object. system_events keeps it under
 * `payload`; the feedback mirror keeps it under `metadata`.
 */
function payloadOf(row) {
  return (row && (row.payload || row.metadata)) || {};
}

/**
 * Read the raw sealed rows: canonical system_events FIRST, feedback mirror only
 * when system_events yields zero rows (or errors). Returns { rows, source }.
 */
async function readSealedRows(supabase) {
  const canonical = await supabase
    .from('system_events')
    .select('id, payload')
    .eq('event_type', SEAL_EVENT_TYPE);

  if (!canonical.error && Array.isArray(canonical.data) && canonical.data.length) {
    return { rows: canonical.data, source: 'system_events' };
  }

  const mirror = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', MIRROR_CATEGORY);

  if (mirror.error) {
    throw new GoldenTaskLoaderError(
      'sealed corpus unavailable from both system_events (canonical) and the feedback mirror',
    );
  }
  // suite lives inside metadata (feedback has no top-level suite column).
  const rows = (mirror.data || []).filter((r) => payloadOf(r).suite === MIRROR_SUITE);
  return { rows, source: 'feedback' };
}

/**
 * Load the sealed Fable-5 corpus into per-task golden task SETS.
 *
 * @param {Object} supabase - supabase-js client (or stub).
 * @returns {Promise<{sets: Array, integrityErrors: Array, source: string}>}
 *   sets: [{ task_id, shape, task_text, sealed_runs: [{effort, model_id, tokens, wall_clock, run_at, output}] }]
 *   — NEVER contains an answer_key field.
 *   integrityErrors: [{ task_id, error, reason }] when task_text is not
 *   byte-identical across a task's rows (flagged, never silently merged).
 */
export async function loadGoldenTaskSets(supabase) {
  const { rows, source } = await readSealedRows(supabase);

  const byTask = new Map();
  const firstTaskText = new Map(); // task_id -> first-seen task_text (byte-identity anchor)
  const integrityErrors = [];
  const flagged = new Set();

  for (const row of rows) {
    const p = payloadOf(row);
    const taskId = p.task_id;
    if (!taskId) continue;

    // Byte-identity integrity: task_text must match across every row (answer_key +
    // sealed_run) sharing a task_id, so the same prompt replays on successors.
    if (firstTaskText.has(taskId)) {
      if (firstTaskText.get(taskId) !== p.task_text && !flagged.has(taskId)) {
        flagged.add(taskId);
        integrityErrors.push({
          task_id: taskId,
          error: 'TASK_TEXT_MISMATCH',
          reason: `task_text is not byte-identical across the sealed rows for ${taskId}`,
        });
      }
    } else {
      firstTaskText.set(taskId, p.task_text);
    }

    if (!byTask.has(taskId)) {
      byTask.set(taskId, {
        task_id: taskId,
        shape: p.shape || null,
        task_text: p.task_text,
        sealed_runs: [],
      });
    }
    const set = byTask.get(taskId);
    if (!set.shape && p.shape) set.shape = p.shape;

    if (p.record_kind === 'sealed_run') {
      // CONTAMINATION GUARD: only these six fields are lifted. answer_key is NEVER
      // read here (sealed_run rows carry `fable5_answer` as the run output, not a key).
      set.sealed_runs.push({
        effort: p.effort ?? null,
        model_id: p.model_id ?? null,
        tokens: p.tokens ?? null,
        // stores diverge: system_events uses `wall_clock`, the mirror uses `wall_clock_ms`.
        wall_clock: p.wall_clock ?? p.wall_clock_ms ?? null,
        run_at: p.run_at ?? null,
        output: p.fable5_answer ?? null,
      });
    }
    // record_kind === 'answer_key' rows contribute shape/task_text ONLY.
    // Their answer_key value is intentionally never lifted into a set.
  }

  const sets = [...byTask.values()].sort((a, b) => a.task_id.localeCompare(b.task_id));
  for (const s of sets) {
    s.sealed_runs.sort((a, b) => String(a.effort).localeCompare(String(b.effort)));
  }

  return { sets, integrityErrors, source };
}

/**
 * Server-side answer-key accessor — the ONLY sanctioned way to read a sealed key.
 * Used only by a future grader that runs server-side. NEVER caches to disk.
 *
 * @param {Object} supabase
 * @param {string} taskId
 * @returns {Promise<string|null>} the answer_key STRING, or null if not found.
 */
export async function getAnswerKey(supabase, taskId) {
  const { rows } = await readSealedRows(supabase);
  const keyRow = rows
    .map(payloadOf)
    .find((p) => p.record_kind === 'answer_key' && p.task_id === taskId);
  return keyRow ? (keyRow.answer_key ?? null) : null;
}

/**
 * POPULATION CONTRACT for EVAL-001's staged `model_capability_reference` table.
 * Children B/C grade the sealed_runs and populate one row per (problem_shape,
 * model, effort). Exported here so downstream children share one canonical shape.
 */
export const MODEL_CAPABILITY_REFERENCE_CONTRACT = Object.freeze({
  table: 'model_capability_reference',
  staged: true, // chairman-gated; migration applies at the ceremony.
  key_tuple: Object.freeze(['problem_shape', 'model', 'effort']),
  columns: Object.freeze({
    problem_shape: 'text',
    model: 'text',
    effort: 'text',
    clears_bar: 'boolean',
    quality_score: 'numeric',
    tokens: 'integer',
    wall_clock: 'integer',
    cost_norm: 'numeric',
    graded_at: 'timestamptz',
  }),
});

/**
 * Fail-closed population path for model_capability_reference. FR-1 does NOT
 * implement grading (child B) — this only proves the fail-closed contract path.
 *
 * Probes table liveness with a REAL-ROW select (`.select('*').limit(1)`), NOT a
 * head:true count (which false-positives on a missing table). When the STAGED
 * table is absent it returns { ok:false, status:'CEREMONY_PENDING' } and never
 * throws/crashes.
 *
 * Child B (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-B) wires the grading path: when
 * the table exists AND a `gradeFn` is supplied, this delegates to lib/eval/grader.mjs
 * `gradeGoldenTasks` to produce results-only reference rows (trusted_for_routing=false).
 * The delegation uses a LAZY dynamic import because grader.mjs imports from THIS module
 * (loadGoldenTaskSets/getAnswerKey/MIRROR_SUITE) — a static import would cycle.
 *
 * @param {Object} supabase
 * @param {Array|Object} [rowsOrOpts=[]] legacy: pre-built rows array (shape-validated);
 *   or an options object { rows?, gradeFn?, bar? } to drive the B grading path.
 * @returns {Promise<{ok:boolean, status:string, ...}>}
 */
export async function populateReference(supabase, rowsOrOpts = []) {
  const opts = Array.isArray(rowsOrOpts) ? { rows: rowsOrOpts } : (rowsOrOpts || {});
  const providedRows = Array.isArray(opts.rows) ? opts.rows : [];
  const gradeFn = typeof opts.gradeFn === 'function' ? opts.gradeFn : null;

  let probe;
  try {
    probe = await supabase.from('model_capability_reference').select('*').limit(1);
  } catch (err) {
    return {
      ok: false,
      status: 'CEREMONY_PENDING',
      table: 'model_capability_reference',
      reason: (err && err.message) || String(err),
    };
  }

  if (probe && probe.error) {
    return {
      ok: false,
      status: 'CEREMONY_PENDING',
      table: 'model_capability_reference',
      reason: probe.error.message || 'model_capability_reference is absent (staged, pre-ceremony)',
    };
  }

  // Table exists. Without a gradeFn there is no grading verb to run — B's grader is
  // dependency-injected so it stays unit-testable. Preserve the legacy seam verdict.
  if (!gradeFn) {
    return {
      ok: false,
      status: 'GRADING_NOT_IMPLEMENTED_IN_CHILD_A',
      table: 'model_capability_reference',
      contract: MODEL_CAPABILITY_REFERENCE_CONTRACT.key_tuple,
      would_write: providedRows.length,
    };
  }

  // Child B grading path: lazy import to avoid the grader↔loader import cycle.
  const { gradeGoldenTasks } = await import('./grader.mjs');
  const graded = await gradeGoldenTasks(supabase, { gradeFn, bar: opts.bar });
  return {
    ok: true,
    status: 'GRADED',
    table: 'model_capability_reference',
    contract: MODEL_CAPABILITY_REFERENCE_CONTRACT.key_tuple,
    graded_rows: graded.rows.length,
    ranked: graded.ranked,
    stats: graded.stats,
    integrityErrors: graded.integrityErrors,
    source: graded.source,
    // trusted_for_routing stays false on every row (toReferenceRow hardcodes it);
    // only child C's ground-truth gate may flip routing trust.
  };
}
