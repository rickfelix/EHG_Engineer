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

async function insertFeedbackRow(supabase, group) {
  const title = (group.sample_body || `${group.signal_type} (recurring)`).slice(0, 120);
  const description = `Worker signal aggregation (${group.callsigns.size} contributing callsign(s), severity ${group.max_severity}). Signal type: ${group.signal_type}. Sample body: ${group.sample_body.slice(0, 500)}`;
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
      metadata: {
        logged_via: 'signal-router.cjs',
        signal_fingerprint: group.fingerprint,
        signal_type: group.signal_type,
        contributing_workers: Array.from(group.callsigns),
        // QF-20260504-964 FIX 3: surface contract for "Known Friction Points"
        // (CLAUDE_CORE.md) reads contributing_callsigns + severity from metadata.
        contributing_callsigns: Array.from(group.callsigns),
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
      skipped++;
      continue;
    }

    await stampRouted(supabase, group.rows, feedback.id);
    promoted++;
    promotedRows.push({ feedback_id: feedback.id, fingerprint: group.fingerprint, signal_type: group.signal_type, callsigns: Array.from(group.callsigns), signal_count: group.rows.length });
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
