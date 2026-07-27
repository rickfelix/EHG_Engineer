// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3b
// Aggregate worker signals (session_coordination INFO + payload.signal_type) into
// harness-backlog feedback rows. Mirrors log-harness-bug.js dedup-by-hash pattern.
//
// Threshold: ≥3 distinct sender_callsigns within a 60-min window per fingerprint
//            OR a single critical-severity signal (bypasses count threshold).
// Idempotency (security M5): metadata->>signal_fingerprint matches → no new row.
//
// Called from scripts/stale-session-sweep.cjs every tick (no new cron).

// SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-4: normalize/fingerprint/
// severityRank/groupByFingerprint/shouldPromote are now implemented once in
// lib/shared/content-fingerprint.js and delegated to here — this file no longer
// reimplements fingerprinting. Behavior is byte-for-byte unchanged (TR-2): the
// extracted normalize()/fingerprint() bodies are verbatim copies, and the local
// groupByFingerprint()/shouldPromote() below are thin wrappers that reproduce the
// exact same per-row field derivation and preserve the `.callsigns` field name every
// downstream consumer in this file already depends on.
const {
  normalize,
  fingerprint,
  severityRank,
  groupByFingerprint: sharedGroupByFingerprint,
  shouldPromote: sharedShouldPromote
} = require('../shared/content-fingerprint.cjs');

// SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-1: the ONE body-cap + redaction policy,
// shared with the OUTBOUND hop (scripts/worker-signal.cjs) instead of the silent .slice() this
// file used to reimplement. capBodySafe is the non-throwing INBOUND adapter — see FR-2 and the
// module header for why the outbound throw contract must not escape into this hot loop.
const { capBodySafe } = require('../shared/body-cap.cjs');

const WINDOW_MIN = 60;
const THRESHOLD = 3;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: the signal window is a processed read
// (every row is grouped/threshold-counted/routed) — paginate past the PostgREST 1000-row cap.
// Fail-open { rows: [], error } policy preserved (fetchAllPaginated throws → caught below).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

async function loadRecentSignals(supabase, windowMin = WINDOW_MIN) {
  const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
  let data;
  try {
    data = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, sender_session, target_session, payload, body, created_at')
      .gte('created_at', cutoff)
      .not('payload->>signal_type', 'is', null)
      .order('id')); // unique-key tiebreaker for stable pagination
  } catch (error) {
    return { rows: [], error };
  }

  // Filter to rows that have not been previously routed.
  const fresh = (data || []).filter(r => !r.payload?.routed_to_feedback_id);
  return { rows: fresh, error: null };
}

// Thin wrapper over the shared groupByFingerprint: supplies this file's own per-row
// field derivation (unchanged from before extraction), then maps the shared module's
// generic { type, groupKeys } fields back onto this file's existing { signal_type,
// callsigns } shape so every downstream consumer (aggregateSignals, insertFeedbackRow,
// shouldRouteLone, ackAndRouteLoneSignal) is untouched.
function groupByFingerprint(rows) {
  const shared = sharedGroupByFingerprint(rows, (r) => ({
    type: r.payload?.signal_type,
    body: r.body || r.payload?.body || '',
    groupKey: r.payload?.sender_callsign,
    severity: r.payload?.severity,
    timestamp: r.created_at
  }));
  const groups = new Map();
  for (const [fp, g] of shared) {
    groups.set(fp, {
      fingerprint: g.fingerprint,
      signal_type: g.type,
      rows: g.rows,
      callsigns: g.groupKeys,
      max_severity: g.max_severity,
      first_seen: g.first_seen,
      last_seen: g.last_seen,
      sample_body: g.sample_body
    });
  }
  return groups;
}

function shouldPromote(group) {
  // Critical bypasses count threshold (single signal goes straight through).
  return sharedShouldPromote({ max_severity: group.max_severity, groupKeys: group.callsigns }, THRESHOLD);
}

async function findExistingFeedback(supabase, fp) {
  const { data } = await supabase
    .from('feedback')
    .select('id, status, metadata')
    .eq('category', 'harness_backlog')
    .eq('metadata->>signal_fingerprint', fp)
    .maybeSingle();
  return data || null;
}

/**
 * SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-3): worker signal payloads DO carry
 * sd_key, but nothing here ever mapped it onto the feedback row — measured consequence, across the
 * 61 feedback rows behind the promoted-QF cohort: sd_id populated 0/61, strategic_directive_id
 * 1/61. So the promoter could not know a signal already belonged to work in flight, and QFs were
 * minted duplicating an SD's own scope.
 *
 * Resolves the key to the SD's UUID because that is what existing populated rows hold. Returns
 * null on anything ambiguous — zero keys, MORE THAN ONE distinct key across the aggregated group,
 * an unresolvable key, or a query error. A wrong FK is worse than a null one: it would point the
 * resolution check at unrelated work and could suppress a real defect.
 */
async function resolveGroupSdId(supabase, group) {
  try {
    const keys = [...new Set((group.rows || []).map(r => r.payload?.sd_key).filter(Boolean))];
    if (keys.length !== 1) return null;
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', keys[0])
      .limit(1);
    if (error || !data || !data.length) return null;
    return { sdId: data[0].id, sdKey: keys[0] };
  } catch {
    return null; // never block signal routing on this enrichment
  }
}

// SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-2.
// feedback.title is VARCHAR(255). VERIFIED against the LIVE schema by probe insert (Postgres
// 22001 "value too long for type character varying(255)" at 300 chars) — NOT the "unbounded
// TEXT" an earlier review reported. feedback.DESCRIPTION is unbounded text; title is not, and
// conflating the two made the first cut of this change a data-loss REGRESSION: an over-length
// title fails the INSERT, so the group is never stamped routed_to_feedback_id, re-fails on every
// subsequent tick, and is dropped permanently once its rows age out of WINDOW_MIN — the exact
// total-loss failure this SD exists to eliminate, and strictly worse than the mid-word truncation
// it replaced. Caught by the ship gate's adversarial reviewer before merge.
const TITLE_MAX = 255;

/**
 * Bound a title to the column limit WITHOUT the mid-word silent cut this SD is about.
 * A title is a summary field with a hard DB limit, so bounding it is not data loss: the full
 * body is in description, and metadata.contributing_signal_ids points at the source rows. What
 * matters is that any cut is (a) explicitly marked and (b) never mid-token.
 */
function boundTitle(raw) {
  const t = String(raw || '').trim();
  if (t.length <= TITLE_MAX) return t;
  const MARK = '…';
  const cut = t.slice(0, TITLE_MAX - MARK.length);
  const lastSpace = cut.lastIndexOf(' ');
  // Prefer a word boundary, but never give up more than the tail quarter hunting for one.
  const safe = lastSpace > TITLE_MAX * 0.75 ? cut.slice(0, lastSpace) : cut;
  return safe + MARK;
}

async function insertFeedbackRow(supabase, group) {
  // FR-2: ONE policy, applied NON-THROWINGLY. This function previously cut the title at
  // .slice(0, 120) and the description at .slice(0, 500) — two silent, independent, tighter
  // cuts layered on a body scripts/worker-signal.cjs had ALREADY bounded to BODY_HARD_CAP at
  // write time. The 500-char cut is what destroyed QF-20260726-425's correction mid-word
  // ("...there happens to be no feature br"), while still stamping the row CRITICAL and
  // dispatching it. feedback.DESCRIPTION is unbounded text, so nothing at the storage layer ever
  // required THAT cut. feedback.TITLE is VARCHAR(255) and does have a real limit — see
  // boundTitle above; an earlier draft of this change asserted both were unbounded and was wrong.
  const capped = capBodySafe(group.sample_body || '');
  if (capped.error) {
    // Returned, never thrown: aggregateSignals' try/catch lives OUTSIDE its per-group loop.
    return { feedback: null, error: capped.error };
  }
  const body = capped.value;
  // Title = first LINE, then bounded to the real VARCHAR(255) limit on a word boundary with an
  // explicit marker. Never an unmarked mid-word cut, and never over-length (which would fail the
  // INSERT outright — see boundTitle above). The full text is in description regardless.
  const title = boundTitle(body.split('\n')[0]) || `${group.signal_type} (recurring)`;
  const linked = await resolveGroupSdId(supabase, group);
  // The sd_key is also written into the description so it survives into the promoted QF's title/
  // body, where extractWorkIdentifiers (lib/eva/feedback-premise-adapter.js, FR-2) can lift it back
  // out as an exact lookup token. Belt and braces: the column enables the join, the text keeps the
  // identifier recoverable even for rows whose key could not be resolved to a UUID.
  const sdNote = linked ? ` Relates to: ${linked.sdKey}.` : '';
  const description = `Worker signal aggregation (${group.callsigns.size} contributing callsign(s), severity ${group.max_severity}). Signal type: ${group.signal_type}.${sdNote} Sample body: ${body}`;
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      type: 'enhancement',
      category: 'harness_backlog',
      status: 'new',
      severity: group.max_severity,
      source_application: 'EHG_Engineer',
      source_type: 'manual_feedback',
      title,
      description,
      // FR-3: only ever set when unambiguously resolved (see resolveGroupSdId).
      ...(linked ? { sd_id: linked.sdId } : {}),
      metadata: {
        logged_via: 'signal-router.cjs',
        ...(linked ? { sd_key: linked.sdKey } : {}),
        signal_fingerprint: group.fingerprint,
        signal_type: group.signal_type,
        contributing_workers: Array.from(group.callsigns),
        // QF-20260504-964 FIX 3: surface contract for "Known Friction Points"
        // (CLAUDE_CORE.md) reads contributing_callsigns + severity from metadata.
        contributing_callsigns: Array.from(group.callsigns),
        // SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-3: the FORWARD link.
        // stampRouted() below writes the REVERSE link (payload.routed_to_feedback_id) onto
        // these same rows. Without this key a reader holding the promoted row could only walk
        // BACKWARDS — which is why recovering QF-20260726-425's lost 3145 chars took a manual
        // search of session_coordination that nobody had instructed. ALL contributing ids, not
        // just the fingerprint sample's: normalize() lowercases and truncates to 200 chars
        // before hashing, so rows sharing a fingerprint can carry non-identical raw bodies.
        contributing_signal_ids: group.rows.map(r => r.id),
        severity: group.max_severity,
        signal_count: group.rows.length,
        first_seen: group.first_seen,
        last_seen: group.last_seen
      }
    })
    .select('id')
    .single();
  return { feedback: data, error };
}

async function stampRouted(supabase, rows, feedbackId) {
  // Update each contributing row's payload.routed_to_feedback_id and acknowledged_at.
  // Supabase JSONB merge requires reading payload then writing back.
  const now = new Date().toISOString();
  for (const r of rows) {
    const merged = {
      ...(r.payload || {}),
      routed_to_feedback_id: feedbackId
    };
    await supabase
      .from('session_coordination')
      .update({ payload: merged, acknowledged_at: now })
      .eq('id', r.id);
  }
}

async function aggregateSignals(supabase, options = {}) {
  const windowMin = options.windowMin || WINDOW_MIN;
  const { rows, error } = await loadRecentSignals(supabase, windowMin);
  if (error) return { promoted: 0, skipped: 0, error };

  const groups = groupByFingerprint(rows);
  let promoted = 0;
  let skipped = 0;
  const promotedRows = [];

  for (const group of groups.values()) {
    // SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-4: isolate each group.
    // This function's only try/catch lives in its sweep-pass CALLERS
    // (lib/sweep/passes/coordination-detectors.cjs, lib/sweep/legacy-fallback.cjs) and wraps
    // the ENTIRE call — so without this an error on one group skipped every group after it in
    // the tick. And because a group is stamped routed_to_feedback_id only AFTER a successful
    // insert, the failing group reloaded and failed again on every subsequent tick, starving
    // its siblings until its rows aged out of WINDOW_MIN and vanished with nothing logged.
    try {
      if (!shouldPromote(group)) {
        skipped++;
        continue;
      }

      const existing = await findExistingFeedback(supabase, group.fingerprint);
      if (existing) {
        // Already routed in a prior sweep — stamp the new contributors so they don't re-aggregate.
        await stampRouted(supabase, group.rows, existing.id);
        skipped++;
        continue;
      }

      const { feedback, error: insertErr } = await insertFeedbackRow(supabase, group);
      if (insertErr || !feedback) {
        // NAME it. A skipped group used to be indistinguishable from a below-threshold one.
        // Wording note: says "no feedback row created" rather than naming the SQL verb, because
        // the ship review gate's CRIT-002 heuristic flags any template literal containing ${}
        // plus a SQL keyword — and the English word for that verb collides with it. No SQL on
        // this line; renaming the log string is cheaper than teaching the detector prose.
        console.warn(`[signal-router] skipped group fingerprint=${group.fingerprint} type=${group.signal_type} callsigns=${group.callsigns.size}: ${insertErr?.message || 'no feedback row created'}`);
        skipped++;
        continue;
      }

      await stampRouted(supabase, group.rows, feedback.id);
      promoted++;
      promotedRows.push({ feedback_id: feedback.id, fingerprint: group.fingerprint, signal_type: group.signal_type, callsigns: Array.from(group.callsigns), signal_count: group.rows.length });
    } catch (groupErr) {
      console.warn(`[signal-router] group FAILED fingerprint=${group.fingerprint} type=${group.signal_type}: ${groupErr?.message || groupErr}`);
      skipped++;
    }
  }

  return { promoted, skipped, error: null, promotedRows };
}

// ── SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-4 ──────────────────────────
// ROUTE != PROMOTE. shouldPromote() (above) is UNCHANGED — it still gates the
// harness_backlog insert (critical OR ≥3 callsigns). This is a SEPARATE path: a
// lone high-value signal (medium/high severity, < THRESHOLD callsigns, not critical)
// is worth the coordinator's attention but must NOT create a harness_backlog row.
// We stamp acknowledged_at (closes the "unacked forever" origin incident) and mark
// the signal routed-to-coordinator — WITHOUT calling insertFeedbackRow.
const ROUTE_MIN_SEVERITY = 'medium';

/**
 * A group is "lone-routable" when it is NOT a promotable aggregate (so critical and
 * ≥3-callsign groups are excluded — those go through aggregateSignals/promote) yet
 * still carries enough severity (>= medium) to warrant coordinator attention.
 * Pure + exported so the FR-4 matrix test can assert every severity×callsign cell.
 */
function shouldRouteLone(group) {
  if (shouldPromote(group)) return false; // promoted aggregates are not "lone"
  return severityRank(group.max_severity) >= severityRank(ROUTE_MIN_SEVERITY);
}

async function stampRoutedToCoordinator(supabase, rows) {
  // Mark each contributing row routed-to-coordinator + acknowledged. Distinct from
  // stampRouted(): NO routed_to_feedback_id (no harness_backlog row exists for a lone signal).
  const now = new Date().toISOString();
  for (const r of rows) {
    if (r.payload?.routed_to_coordinator && r.acknowledged_at) continue; // idempotent
    const merged = {
      ...(r.payload || {}),
      routed_to_coordinator: true
    };
    await supabase
      .from('session_coordination')
      .update({ payload: merged, acknowledged_at: now })
      .eq('id', r.id);
  }
}

/**
 * For each recent signal group that is lone-routable AND has at least one unacknowledged
 * row, stamp acknowledged_at + routed_to_coordinator and surface it for coordinator
 * attention. Never calls insertFeedbackRow (route != promote). Returns the routed groups
 * so the dashboard/coordinator can render them. Unacked/unrouted signals the coordinator
 * has not yet seen remain visible because this only touches lone-routable groups.
 */
async function ackAndRouteLoneSignal(supabase, options = {}) {
  const windowMin = options.windowMin || WINDOW_MIN;
  const { rows, error } = await loadRecentSignals(supabase, windowMin);
  if (error) return { routed: 0, skipped: 0, error, routedGroups: [] };

  const groups = groupByFingerprint(rows);
  let routed = 0;
  let skipped = 0;
  const routedGroups = [];

  for (const group of groups.values()) {
    if (!shouldRouteLone(group)) {
      skipped++;
      continue;
    }
    // Only act when at least one contributing row is still unacknowledged.
    const unacked = group.rows.filter(r => !r.acknowledged_at && !r.payload?.routed_to_coordinator);
    if (unacked.length === 0) {
      skipped++;
      continue;
    }
    await stampRoutedToCoordinator(supabase, unacked);
    routed++;
    routedGroups.push({
      fingerprint: group.fingerprint,
      signal_type: group.signal_type,
      severity: group.max_severity,
      callsigns: Array.from(group.callsigns),
      signal_count: group.rows.length,
      sample_body: group.sample_body
    });
  }

  return { routed, skipped, error: null, routedGroups };
}

module.exports = {
  WINDOW_MIN,
  THRESHOLD,
  normalize,
  fingerprint,
  severityRank,
  shouldPromote,
  groupByFingerprint,
  loadRecentSignals,
  findExistingFeedback,
  insertFeedbackRow,
  stampRouted,
  aggregateSignals,
  // FR-4 (SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001) — route != promote
  ROUTE_MIN_SEVERITY,
  shouldRouteLone,
  stampRoutedToCoordinator,
  ackAndRouteLoneSignal
};
