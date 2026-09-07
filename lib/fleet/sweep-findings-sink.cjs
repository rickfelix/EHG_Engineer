'use strict';

/**
 * QF-20260905-230 — persistence + coordinator-alert sink for stale-session-sweep.cjs's
 * CONFLICTS/WARNINGS/SKIP_RESET findings, previously console.log-only (Task Scheduler runs the
 * sweep every 5 min with no log redirect, so each finding lived for the seconds a console was
 * open and reached no row, file or seat).
 *
 * jsonl append is unconditional (a complete audit trail); the directed coordinator row is
 * deduped per (finding_class, subject) within REEMIT_WINDOW_MS so a persisting finding re-alerts
 * every 6h instead of flooding the coordinator every 5-min tick. Routes through the existing
 * dispatch choke point (insertCoordinationRow), never a hand-rolled insert — mirrors
 * lib/coordinator/coordination-events.cjs's emitReaperStarvationAlert.
 */
const fs = require('fs');
const path = require('path');

const FINDINGS_LOG_PATH = path.join(__dirname, '..', '..', '.artifacts', 'stale-session-sweep-findings.ndjson');
const REEMIT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h
const ALERT_KIND = 'sweep_finding_alert';

/** Append one finding line to the per-run jsonl sink. Fail-soft, never throws. */
function appendFindingLine(finding) {
  try {
    fs.mkdirSync(path.dirname(FINDINGS_LOG_PATH), { recursive: true });
    fs.appendFileSync(FINDINGS_LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...finding }) + '\n');
  } catch (e) {
    console.error('[sweep-findings-sink] jsonl append failed (non-fatal): ' + ((e && e.message) || e));
  }
}

/**
 * Emit ONE directed session_coordination row to the active coordinator for a NEW finding,
 * deduped by (finding_class, subject) within REEMIT_WINDOW_MS. Fail-soft — never throws.
 * @param {object} supabase
 * @param {{findingClass: string, subject: string, summary: string, severity?: string}} finding
 */
async function emitFindingAlert(supabase, finding) {
  try {
    const sinceIso = new Date(Date.now() - REEMIT_WINDOW_MS).toISOString();
    const { data: dupes, error: dupeErr } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('payload->>kind', ALERT_KIND)
      .eq('payload->>finding_class', finding.findingClass)
      .eq('payload->>subject', finding.subject)
      .gte('created_at', sinceIso)
      .limit(1);
    if (dupeErr) {
      console.error('[sweep-findings-sink] dedup check failed (non-fatal): ' + dupeErr.message);
      return { ok: false, error: dupeErr.message };
    }
    if (dupes && dupes.length > 0) return { ok: true, skipped: true, id: dupes[0].id };

    // File-first, DB fallback (mirrors worker-signal.cjs's own resolution); null -> the
    // buffer-broadcast sentinel every writer in this codebase falls back to.
    const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');
    let coordinatorId = null;
    try { coordinatorId = await getActiveCoordinatorId(supabase); } catch { /* fail-soft */ }
    const target = coordinatorId || 'broadcast-coordinator';

    const { insertCoordinationRow } = require('../coordinator/dispatch.cjs');
    const { data, error } = await insertCoordinationRow(supabase, {
      sender_type: 'sweep',
      target_session: target,
      message_type: 'INFO',
      subject: '[SWEEP_FINDING:' + finding.findingClass.toUpperCase() + '] ' + finding.summary.slice(0, 80),
      body: finding.summary,
      // kind drives DRAIN_SETS/classifyCoordinationRow classification; signal_type (additive,
      // same idiom as worker-signal.cjs's payload.kind='worker_signal' beside signal_type) is
      // what the coordinator's canonical inbox (fleet-dashboard.cjs printInbox) filters/renders on.
      payload: {
        kind: ALERT_KIND,
        signal_type: 'sweep_finding',
        finding_class: finding.findingClass,
        subject: finding.subject,
        severity: finding.severity || 'medium',
      },
      expires_at: new Date(Date.now() + REEMIT_WINDOW_MS).toISOString(),
    }, { select: 'id', single: true });
    if (error) {
      console.error('[sweep-findings-sink] alert insert failed (non-fatal): ' + error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[sweep-findings-sink] alert threw (non-fatal): ' + ((e && e.message) || e));
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** Record ONE finding: unconditional jsonl append + deduped directed alert. Never throws. */
async function recordFinding(supabase, finding) {
  appendFindingLine(finding);
  return emitFindingAlert(supabase, finding);
}

module.exports = { FINDINGS_LOG_PATH, REEMIT_WINDOW_MS, appendFindingLine, emitFindingAlert, recordFinding };
