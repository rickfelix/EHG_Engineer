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

/**
 * A named binding target: a file path, SD/QF key, DB table.column reference, or protocol section
 * id. QF-20260901-704: the dotted-identifier alternative required only 1+ chars per side
 * (`[a-z_]+\.[a-z_]+`), matching filler like "e.g." or "i.e." inside ordinary prose that quotes a
 * ratification — tightened to require 3+ chars starting with a letter on each side, closer to a
 * real table_name.column_name / module.export shape.
 */
const NAMED_TARGET_RE = /\b(?:[\w.-]+\/[\w.-]+\.(?:js|cjs|mjs|ts|tsx|sql|md)|SD-[A-Z0-9-]+|QF-\d{8}-\d+|section[_ ]?id[:\s]+\d+|\b[a-z][a-z0-9_]{2,}\.[a-z][a-z0-9_]{2,}\b)/i;

/** All named-target matches in text (not just the first) — used for ledger target-overlap checks. */
function extractNamedTargets(text) {
  const re = new RegExp(NAMED_TARGET_RE.source, 'gi');
  return String(text || '').match(re) || [];
}

/**
 * QF-20260901-704 leg (a): the diff buildCaptureMissRow's description already asserted
 * ("has no corresponding chairman_ratifications row") but no code ever computed. A flag-shaped
 * item is COVERED — not a genuine miss — when a ledger row ratified within windowHours of the
 * item's timestamp names an overlapping target (quote/marker_text/target_contracts contain one of
 * the item's own named-target strings).
 * @param {{text:string, created_at:string}} item
 * @param {Array<{ratified_at:string, quote?:string, marker_text?:string, target_contracts?:string[]}>} ledgerRows
 * @param {number} windowHours
 * @returns {boolean} true when NO covering row exists (a genuine capture-miss candidate)
 */
export function hasNoCoveringLedgerRow(item, ledgerRows, windowHours = 72) {
  const targets = extractNamedTargets(item?.text).map((t) => t.toLowerCase());
  if (targets.length === 0) return true;
  const itemMs = new Date(item?.created_at).getTime();
  if (!Number.isFinite(itemMs)) return true;
  const windowMs = windowHours * 3_600_000;
  return !(Array.isArray(ledgerRows) ? ledgerRows : []).some((r) => {
    const rMs = new Date(r?.ratified_at).getTime();
    if (!Number.isFinite(rMs) || Math.abs(itemMs - rMs) > windowMs) return false;
    const haystack = `${r.quote || ''} ${r.marker_text || ''} ${(r.target_contracts || []).join(' ')}`.toLowerCase();
    return targets.some((t) => haystack.includes(t));
  });
}

/**
 * QF-20260901-704 leg (b): a candidate item that QUOTES an existing ratification (by its full
 * UUID or its 8-char prefix, the form Solomon's advisories actually cite) is a relay of an
 * already-captured ruling, not a fresh miss. Prefix comparison is one-directional (checking
 * whether TEXT contains a slice of a KNOWN real id) — never reconstructing an id from a prefix
 * found in text, which would be a confident-not-found risk.
 */
export function isEchoOfRatification(item, ledgerRows) {
  const text = String(item?.text || '');
  return (Array.isArray(ledgerRows) ? ledgerRows : []).some(
    (r) => r?.id && (text.includes(r.id) || text.includes(String(r.id).slice(0, 8)))
  );
}

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

/** UTC calendar-day breach-window key, e.g. '2026-08-30'. */
export function breachWindowKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * QF-20260830-325 (Cycle-2 R7, Solomon STEP-0 294fb978): route the AGGREGATE capture-miss/
 * candidate signal to ONE deduped feedback row per breach window, instead of the stdout-only
 * `console.error` in scripts/solomon-advisory.cjs's checkRatificationCaptureMiss (which had no
 * disposal path — the audit's own evidence: "76->78 candidates printed to Solomon stdout").
 * Distinct from persistRow()'s per-ITEM dedup below (keyed on source_id): this dedupes the
 * per-SEND summary count itself, keyed on the calendar-day window, via metadata->>breach_window
 * (source_id must be a real UUID column per persistRow's own note, so a day-string key cannot
 * live there). Binding constraint (a) from Solomon: the row body NAMES its acting reader (the
 * weekly orphan-writers-registry triage, SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001) so this never
 * becomes a fresh reader-NONE specimen inside the very batch that exists to eliminate them.
 * Binding constraint (b): re-detection within the SAME window updates the existing open row's
 * count/last_seen; a detection in the next window opens a second row — never rebuilds a pile.
 * @param {object} supabase
 * @param {number} count - captureMiss.count for this detection
 * @param {Date} [now]
 * @returns {Promise<boolean>} true if persisted (false on any error or count<=0 — fail-soft)
 */
export async function routeCaptureMissBreach(supabase, count, now = new Date()) {
  if (!count || count <= 0) return false;
  const windowKey = breachWindowKey(now);
  const category = 'ratification_capture_miss_breach';
  const nowIso = now.toISOString();
  try {
    const { data: existing, error: selectError } = await supabase
      .from('feedback')
      .select('id')
      .eq('category', category)
      .eq('metadata->>breach_window', windowKey)
      .limit(1)
      .maybeSingle();
    if (!selectError && existing) {
      const { error: updateError } = await supabase
        .from('feedback')
        .update({ occurrence_count: count, last_seen: nowIso, updated_at: nowIso })
        .eq('id', existing.id);
      return !updateError;
    }
    const { error } = await supabase.from('feedback').insert({
      type: 'issue',
      source_application: 'EHG_Engineer',
      source_type: 'auto_capture',
      category,
      status: 'new',
      severity: 'low',
      title: `[RATIFICATION CAPTURE-MISS BREACH] ${windowKey}`,
      description: `${count} ratification capture-miss candidate(s)/miss(es) detected this window. Acting reader: the weekly orphan-writers-registry triage pass (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001) -- disposition each cycle rather than letting this accumulate unread.`,
      metadata: { breach_window: windowKey, count, detected_at: nowIso },
      occurrence_count: count,
      first_seen: nowIso,
      last_seen: nowIso,
    });
    return !error;
  } catch {
    return false;
  }
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
 * Bounded read of the ratification ledger for the cross-check below — mirrors detectEncodeMisses'
 * own limit(999) (ledger cardinality: dozens over years, per that function's own comment).
 */
async function fetchRatificationLedgerForCrossCheck(supabase) {
  try {
    const { data, error } = await supabase
      .from('chairman_ratifications')
      .select('id, ratified_at, quote, marker_text, target_contracts')
      .order('ratified_at', { ascending: false })
      .limit(999);
    return !error && Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * CAPTURE-MISS half: scan the corpus, classify each item, persist flags and candidates.
 * This is the `detector` Child A's seam expects: `(supabase, thresholdHours) => Promise<{count, rows}>`.
 * QF-20260901-704: a 'flag' verdict now cross-checks the ratification ledger before persisting —
 * an item that's an echo of an already-captured ratification, or has a covering ledger row within
 * the window, is a genuine capture (not a miss) and is dropped rather than flagged.
 * @param {object} supabase
 * @param {number} thresholdHours
 * @returns {Promise<{count:number, rows:Array, captureMisses:Array, candidates:Array}>}
 */
export async function detectCaptureMisses(supabase, thresholdHours) {
  const items = await scanCorpus(supabase, thresholdHours);
  const ledger = await fetchRatificationLedgerForCrossCheck(supabase);
  const captureMisses = [];
  const candidates = [];
  for (const item of items) {
    const verdict = classifyItem(item);
    if (verdict === 'flag') {
      if (isEchoOfRatification(item, ledger) || !hasNoCoveringLedgerRow(item, ledger)) continue;
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
 *
 * QF-20260901-704 leg (d) finding: this function has NO caller anywhere in the codebase outside
 * its own test file — nothing feeds it live `{predicted, actual}` pairs from production detector
 * runs. That is why it never surfaced the 57-68-send capture-miss overcount: a gauge that is never
 * invoked against real predictions cannot catch anything, regardless of how correct its math is.
 * Wiring it to a real human-labeled feedback loop is a separate follow-up, not in this QF's scope.
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
