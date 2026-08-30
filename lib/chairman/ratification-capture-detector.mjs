/**
 * lib/chairman/ratification-capture-detector.mjs — SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C
 *
 * The real detector Child A left as a no-op inside checkRatificationCaptureMiss
 * (scripts/solomon-advisory.cjs). Composes existing primitives rather than reimplementing them:
 *   - lib/eva/filter-calibration.js's computeMetrics for the false-positive-rate gauge
 *   - lib/chairman/ratification-target-read-verifier.mjs's verifyRatificationTargetRead for the
 *     stronger half of encode-miss detection
 *   - lib/governance/ratification-stall.mjs's isStaleRatification for the threshold
 *
 * Predicate (recall-tuned, 3-part): a candidate item flags only when ALL THREE match —
 *   (a) verified chairman surface  — item.source is one of the surfaces Child A actually
 *       registered (CLAUDE_SOLOMON.md:133): session_coordination (chairman-authored kinds) or
 *       chairman_decisions.
 *   (b) directive/ratification verbs in his voice — a regex over ratification/directive language.
 *   (c) a named binding target — the item's text names a concrete artifact (file, SD key, table,
 *       section id) the ruling binds to.
 * Items matching (a)+(b) but missing (c) route to the CANDIDATE QUEUE (feedback table, a new
 * category) and NEVER auto-flag — zero rulings-by-silence.
 *
 * TODO (SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C): a third corpus source — object-embedded
 * rulings in ventures.metadata / strategic_directives_v2.metadata — is named in Child A's delivered
 * registry (CLAUDE_SOLOMON.md:133) but its embedding shape was not established during this SD's
 * exploration pass. Scanning it without a confirmed shape risks false negatives/positives from a
 * guessed parse. Requires: a follow-up SD or QF that first measures the actual metadata shape live
 * in production, then adds a third `scanEmbeddedMetadataRulings` source here.
 * Estimated effort: 2-4 hours. Current state: session_coordination + chairman_decisions only.
 */
import { computeMetrics } from '../eva/filter-calibration.js';
import { verifyRatificationTargetRead } from './ratification-target-read-verifier.mjs';

// No top-level await: this module is require()'d synchronously from scripts/solomon-advisory.cjs
// via Node's CJS-require-ESM interop, which rejects modules containing a top-level await
// (ERR_REQUIRE_ASYNC_MODULE). Resolve the stall-check lazily inside the async functions that need it.
const FALLBACK_STALE_HOURS = 24;
function fallbackIsStaleRatification(ageHours, encodedAt, thresholdHours = FALLBACK_STALE_HOURS) {
  return encodedAt == null && ageHours >= thresholdHours;
}
async function loadStallCheck() {
  try {
    return await import('../governance/ratification-stall.mjs');
  } catch {
    return { isStaleRatification: fallbackIsStaleRatification, DEFAULT_STALE_RATIFICATION_HOURS: FALLBACK_STALE_HOURS };
  }
}

/** Chairman-authored session_coordination payload.kind values (verified live 2026-08-29). */
const VERIFIED_SC_KINDS = Object.freeze(['adam_advisory', 'solomon_consult']);

/** Directive/ratification language in the chairman's voice. */
const DIRECTIVE_VERB_RE = /\b(rul(?:e|ing|ed)|ratif(?:y|ies|ied|ication)|directiv(?:e|es)|decid(?:e|ed|es)|approv(?:e|ed|es|al)|order(?:ed|s)?|mandat(?:e|ed|es))\b/i;

/** A named binding target: a file path, SD/QF key, DB table.column reference, or protocol section id. */
const NAMED_TARGET_RE = /\b(?:[\w.-]+\/[\w.-]+\.(?:js|cjs|mjs|ts|tsx|sql|md)|SD-[A-Z0-9-]+|QF-\d{8}-\d+|section[_ ]?id[:\s]+\d+|\b[a-z_]+\.[a-z_]+\b)/i;

/**
 * Evaluate the 3-part predicate against a single candidate item's text.
 * @param {{source:string, text:string}} item
 * @returns {{verifiedSurface:boolean, directiveVerbs:boolean, namedTarget:boolean}}
 */
export function evaluatePredicate(item) {
  const text = String(item?.text || '');
  return {
    verifiedSurface: VERIFIED_SC_KINDS.includes(item?.source) || item?.source === 'chairman_decisions',
    directiveVerbs: DIRECTIVE_VERB_RE.test(text),
    namedTarget: NAMED_TARGET_RE.test(text),
  };
}

/**
 * Classify one item against the predicate: 'flag' (all 3), 'candidate' ((a)+(b) only), or 'none'.
 * @param {{source:string, text:string}} item
 * @returns {'flag'|'candidate'|'none'}
 */
export function classifyItem(item) {
  const p = evaluatePredicate(item);
  if (p.verifiedSurface && p.directiveVerbs && p.namedTarget) return 'flag';
  if (p.verifiedSurface && p.directiveVerbs) return 'candidate';
  return 'none';
}

/**
 * Windowed, bounded read of the two corpus sources Child A actually registered.
 * Each read is explicitly limited (count-truncation-diff-lint) and windowed to thresholdHours so
 * this scan — running synchronously in solomon-advisory.cjs's main() before every send — never
 * grows unbounded against ~40k-row tables.
 * @param {object} supabase
 * @param {number} thresholdHours
 * @returns {Promise<Array<{id:string, source:string, text:string, created_at:string}>>}
 */
export async function scanCorpus(supabase, thresholdHours) {
  const sinceIso = new Date(Date.now() - thresholdHours * 3_600_000).toISOString();
  const items = [];

  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, subject, body, payload, created_at')
      .in('payload->>kind', VERIFIED_SC_KINDS)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      // Hard row cap (literal, per count-truncation-diff-lint): a candidate-scan window,
      // never a full-table read. thresholdHours is the operationally meaningful bound.
      .limit(200);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        items.push({
          id: row.id,
          source: row.payload?.kind || 'session_coordination',
          text: `${row.subject || ''}\n${row.body || ''}`,
          created_at: row.created_at,
        });
      }
    }
  } catch { /* fail-soft: corpus source unavailable, scan proceeds with what it has */ }

  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id, decision, status, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      // Hard row cap (literal, per count-truncation-diff-lint): a candidate-scan window,
      // never a full-table read. thresholdHours is the operationally meaningful bound.
      .limit(200);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        items.push({
          id: row.id,
          source: 'chairman_decisions',
          text: String(row.decision || row.status || ''),
          created_at: row.created_at,
        });
      }
    }
  } catch { /* fail-soft */ }

  return items;
}

/**
 * Natural key for a corpus item: stable across re-evaluations. feedback.source_id is a UUID
 * column (not text) — item.id is already the corpus row's own UUID primary key (from
 * session_coordination or chairman_decisions), unique on its own, so it satisfies the column
 * type directly. A composite "source:id" string was tried and rejected by Postgres with
 * "invalid input syntax for type uuid" on every insert/update (QF-20260830-628 hotfix).
 */
function itemSourceId(item) {
  return item.id;
}

/** Feedback-table row builder for a flagged capture-miss. Mirrors gauge-runner.mjs's buildFindingRow shape. */
export function buildCaptureMissRow(item) {
  return {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    source_id: itemSourceId(item),
    category: 'ratification_capture_miss',
    status: 'new',
    severity: 'medium',
    title: `[RATIFICATION CAPTURE MISS] ${item.source}:${item.id}`,
    description: `A ruling-shaped item (verified surface + directive verbs + named target) has no corresponding chairman_ratifications row: ${item.text.slice(0, 500)}`,
    metadata: { item_id: item.id, item_source: item.source, created_at: item.created_at, detected_at: new Date().toISOString() },
  };
}

/** Feedback-table row builder for a candidate-queue item (missing a named target). */
export function buildCandidateRow(item) {
  return {
    type: 'enhancement',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    source_id: itemSourceId(item),
    category: 'ratification_capture_candidate',
    status: 'new',
    severity: 'low',
    title: `[RATIFICATION CANDIDATE] ${item.source}:${item.id}`,
    description: `A verified-surface + directive-verb item without a named binding target — routed to the candidate queue, never auto-flagged: ${item.text.slice(0, 500)}`,
    metadata: { item_id: item.id, item_source: item.source, created_at: item.created_at, detected_at: new Date().toISOString() },
  };
}

/** Feedback-table row builder for a flagged encode-miss. */
export function buildEncodeMissRow(row, reason) {
  return {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    source_id: row.id,
    category: 'ratification_encode_miss',
    status: 'new',
    severity: 'medium',
    title: `[RATIFICATION ENCODE MISS] chairman_ratifications:${row.id}`,
    description: `Ratification row failed encode-miss verification: ${reason}`,
    metadata: { ratification_id: row.id, ratified_at: row.ratified_at, reason, detected_at: new Date().toISOString() },
  };
}

/**
 * Persist a row to feedback as an upsert keyed on (source_id, category) — no unique DB constraint
 * required (application-level equivalent, QF-20260830-628): a re-evaluation of the same corpus item
 * bumps occurrence_count/last_seen on the existing row instead of appending a new one every sweep
 * cycle. A failed persist must never throw out of the caller's fail-soft try/catch
 * (scripts/solomon-advisory.cjs:1294-1300).
 * @param {object} supabase
 * @param {object} row
 * @returns {Promise<boolean>} true if persisted
 */
async function persistRow(supabase, row) {
  try {
    const nowIso = new Date().toISOString();
    if (row.source_id) {
      const { data: existing, error: selectError } = await supabase
        .from('feedback')
        .select('id, occurrence_count')
        .eq('source_id', row.source_id)
        .eq('category', row.category)
        .limit(1)
        .maybeSingle();
      if (!selectError && existing) {
        const { error: updateError } = await supabase
          .from('feedback')
          .update({ occurrence_count: (existing.occurrence_count || 1) + 1, last_seen: nowIso, updated_at: nowIso })
          .eq('id', existing.id);
        return !updateError;
      }
    }
    const { error } = await supabase
      .from('feedback')
      .insert({ ...row, occurrence_count: 1, first_seen: nowIso, last_seen: nowIso });
    return !error;
  } catch {
    return false;
  }
}

/**
 * CAPTURE-MISS half: scan the corpus, classify each item, persist flags and candidates.
 * This is the `detector` Child A's seam expects: `(supabase, thresholdHours) => Promise<{count, rows}>`.
 * @param {object} supabase
 * @param {number} thresholdHours
 * @returns {Promise<{count:number, rows:Array, captureMisses:Array, candidates:Array}>}
 */
export async function detectCaptureMisses(supabase, thresholdHours) {
  const items = await scanCorpus(supabase, thresholdHours);
  const captureMisses = [];
  const candidates = [];
  for (const item of items) {
    const verdict = classifyItem(item);
    if (verdict === 'flag') {
      captureMisses.push(item);
      await persistRow(supabase, buildCaptureMissRow(item));
    } else if (verdict === 'candidate') {
      candidates.push(item);
      await persistRow(supabase, buildCandidateRow(item));
    }
  }
  return { count: captureMisses.length, rows: captureMisses, captureMisses, candidates };
}

/**
 * ENCODE-MISS half: rows past the stale-unencoded threshold, OR encoded rows whose target-read
 * verification fails (Child B's verifyRatificationTargetRead — stronger than encoded_at IS NOT NULL).
 * @param {object} supabase
 * @param {number} thresholdHours
 * @returns {Promise<{count:number, rows:Array}>}
 */
export async function detectEncodeMisses(supabase, thresholdHours) {
  const { isStaleRatification } = await loadStallCheck();
  const misses = [];
  try {
    const { data, error } = await supabase
      .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, may not be applied yet
      .select('id, ratified_at, encoded_at, encoded_ref, marker_text')
      .order('ratified_at', { ascending: true })
      .limit(999); // ledger cardinality: dozens over years — explicit bound (count-truncation-diff-lint)
    if (!error && Array.isArray(data)) {
      const nowMs = Date.now();
      for (const row of data) {
        const ageHours = (nowMs - new Date(row.ratified_at).getTime()) / 3_600_000;
        if (row.encoded_at == null) {
          if (isStaleRatification(ageHours, null, thresholdHours)) {
            misses.push(row);
            await persistRow(supabase, buildEncodeMissRow(row, `unencoded for ${ageHours.toFixed(1)}h, past ${thresholdHours}h threshold`));
          }
          continue;
        }
        const verdict = await verifyRatificationTargetRead(supabase, row);
        if (!verdict.verified) {
          misses.push(row);
          await persistRow(supabase, buildEncodeMissRow(row, verdict.reason || 'target-read verification failed'));
        }
      }
    }
  } catch { /* fail-soft */ }
  return { count: misses.length, rows: misses };
}

/**
 * False-positive-rate gauge: builds a local confusion matrix from labeled decisions and composes
 * lib/eva/filter-calibration.js's computeMetrics — never computeConfusionMatrix, which is hard-coded
 * to the unrelated DFE decision shape (dfe_context.auto_proceed).
 * @param {Array<{predicted:'flag'|'candidate'|'none', actual:boolean}>} labeled - actual: true means
 *   a human confirmed this was a genuine capture-miss/encode-miss.
 * @returns {{agreement_rate:number|null, false_positive_rate:number|null, false_negative_rate:number|null, total:number}}
 */
export function computeCaptureFalsePositiveRate(labeled) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const l of labeled) {
    const predictedPositive = l.predicted === 'flag';
    if (predictedPositive && l.actual) tp++;
    else if (predictedPositive && !l.actual) fp++;
    else if (!predictedPositive && l.actual) fn++;
    else tn++;
  }
  return computeMetrics({ tp, tn, fp, fn, total: tp + tn + fp + fn });
}

/**
 * The full detector, composing both halves. This is what wires into checkRatificationCaptureMiss's
 * default slot (scripts/solomon-advisory.cjs:896).
 * @param {object} supabase
 * @param {number} thresholdHours
 * @returns {Promise<{count:number, rows:Array, captureMisses:Array, encodeMisses:Array, candidates:Array}>}
 */
export async function detectRatificationCaptureMiss(supabase, thresholdHours) {
  const [captureResult, encodeResult] = await Promise.all([
    detectCaptureMisses(supabase, thresholdHours),
    detectEncodeMisses(supabase, thresholdHours),
  ]);
  return {
    count: captureResult.count + encodeResult.count,
    rows: [...captureResult.rows, ...encodeResult.rows],
    captureMisses: captureResult.captureMisses,
    encodeMisses: encodeResult.rows,
    candidates: captureResult.candidates,
  };
}
