// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3b
// Aggregate worker signals (session_coordination INFO + payload.signal_type) into
// harness-backlog feedback rows. Mirrors log-harness-bug.js dedup-by-hash pattern.
//
// Threshold: ≥3 distinct sender_callsigns within a 60-min window per fingerprint
//            OR a single critical-severity signal (bypasses count threshold).
// Idempotency (security M5): metadata->>signal_fingerprint matches → no new row.
//
// Called from scripts/stale-session-sweep.cjs every tick (no new cron).

const crypto = require('crypto');

const WINDOW_MIN = 60;
const THRESHOLD = 3;

// Security M3: normalize() must NFKC + lowercase + strip control chars + strip
// zero-width unicode + collapse whitespace + trim punctuation + truncate 200c.
// Without this, an attacker can defeat aggregation via synthetic-variant bodies.
function normalize(body) {
  if (typeof body !== 'string') return '';
  let s = body.normalize('NFKC').toLowerCase();
  // strip ASCII control + DEL
  s = s.replace(/[\x00-\x1F\x7F]/g, ' ');
  // strip zero-width + format characters
  s = s.replace(/[​-‏﻿]/g, '');
  // collapse all whitespace runs to single space
  s = s.replace(/\s+/g, ' ');
  // strip leading/trailing punctuation + whitespace
  s = s.replace(/^[\s\W]+|[\s\W]+$/g, '');
  return s.slice(0, 200);
}

function fingerprint(signalType, body) {
  return crypto
    .createHash('sha256')
    .update(`${signalType}::${normalize(body)}`)
    .digest('hex');
}

async function loadRecentSignals(supabase, windowMin = WINDOW_MIN) {
  const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, target_session, payload, body, created_at')
    .gte('created_at', cutoff)
    .not('payload->>signal_type', 'is', null);

  if (error) return { rows: [], error };

  // Filter to rows that have not been previously routed.
  const fresh = (data || []).filter(r => !r.payload?.routed_to_feedback_id);
  return { rows: fresh, error: null };
}

function groupByFingerprint(rows) {
  const groups = new Map();
  for (const r of rows) {
    const sigType = r.payload?.signal_type;
    const body = r.body || r.payload?.body || '';
    const fp = fingerprint(sigType, body);
    if (!groups.has(fp)) {
      groups.set(fp, {
        fingerprint: fp,
        signal_type: sigType,
        rows: [],
        callsigns: new Set(),
        max_severity: 'low',
        first_seen: r.created_at,
        last_seen: r.created_at,
        sample_body: body
      });
    }
    const g = groups.get(fp);
    g.rows.push(r);
    if (r.payload?.sender_callsign) g.callsigns.add(r.payload.sender_callsign);
    g.last_seen = r.created_at > g.last_seen ? r.created_at : g.last_seen;
    g.first_seen = r.created_at < g.first_seen ? r.created_at : g.first_seen;
    g.max_severity = severityRank(r.payload?.severity) > severityRank(g.max_severity)
      ? (r.payload?.severity || 'medium')
      : g.max_severity;
  }
  return groups;
}

function severityRank(level) {
  return { low: 0, medium: 1, high: 2, critical: 3 }[level] ?? 1;
}

function shouldPromote(group) {
  // Critical bypasses count threshold (single signal goes straight through).
  if (severityRank(group.max_severity) >= severityRank('critical')) return true;
  return group.callsigns.size >= THRESHOLD;
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
  aggregateSignals
};
