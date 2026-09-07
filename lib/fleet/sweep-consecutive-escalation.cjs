'use strict';

/**
 * QF-20260905-594 — after ESCALATE_AFTER consecutive appearances of the same
 * (finding_class, subject) pair in the QF-20260905-230 jsonl sink, write ONE coordinator
 * decision row (through the same insertCoordinationRow choke point sweep-findings-sink.cjs and
 * emitReaperStarvationAlert already use), mark the pair escalated in that SAME jsonl, and stop
 * re-emitting it as a new finding while the decision row stays open. A different subject is
 * unaffected (streak is tracked per-subject); once the decision row is acknowledged, the streak
 * resets and normal recording resumes on the next occurrence. No new table — consecutive-run
 * state is read entirely from the existing per-run jsonl plus the existing acknowledged_at
 * column already used by every other sweep alert in this codebase.
 */
const fs = require('fs');
const { FINDINGS_LOG_PATH, recordFinding } = require('./sweep-findings-sink.cjs');

const ESCALATE_AFTER = 12; // ~1h at the sweep's 5-minute cadence

/** Trailing streak for (findingClass, subject) since the last escalation marker (or start). */
function tailStreak(findingClass, subject) {
  let lines;
  try { lines = fs.readFileSync(FINDINGS_LOG_PATH, 'utf8').split('\n').filter(Boolean); }
  catch { return { count: 0, openDecisionRowId: null }; }
  let count = 0;
  let openDecisionRowId = null;
  for (const raw of lines) {
    let e;
    try { e = JSON.parse(raw); } catch { continue; }
    if (e.findingClass !== findingClass || e.subject !== subject) continue;
    if (e.escalationMarker) { count = 0; openDecisionRowId = e.decisionRowId || null; continue; }
    count += 1;
  }
  return { count, openDecisionRowId };
}

async function isDecisionRowOpen(supabase, id) {
  if (!id) return false;
  try {
    const { data } = await supabase.from('session_coordination').select('acknowledged_at').eq('id', id).maybeSingle();
    return !!data && data.acknowledged_at == null;
  } catch { return false; }
}

/**
 * Drop-in replacement for a bare recordFinding() call at a skip_reset/conflict site.
 * @returns {Promise<{printed: boolean}>} whether the caller should also console.log this run.
 */
async function guardedRecordFinding(supabase, finding) {
  const { findingClass, subject } = finding;
  const { count, openDecisionRowId } = tailStreak(findingClass, subject);
  if (await isDecisionRowOpen(supabase, openDecisionRowId)) return { printed: false };

  const nextCount = count + 1;
  await recordFinding(supabase, finding);
  if (nextCount >= ESCALATE_AFTER) {
    const { insertCoordinationRow, isDeliveredDispatchError } = require('../coordinator/dispatch.cjs');
    let decisionRowId = null;
    try {
      const result = await insertCoordinationRow(supabase, {
        target_session: 'broadcast-coordinator',
        sender_type: 'sweep',
        message_type: 'INFO',
        subject: '[SWEEP_ESCALATION:' + findingClass.toUpperCase() + '] ' + subject + ' unresolved for ' + nextCount + ' runs',
        body: 'The same ' + findingClass + ' finding for ' + subject + ' has now printed on ' + nextCount
          + ' consecutive sweep runs with no decision on record. Pick one: claim ' + subject
          + ', correct its status directly, or reply here recording why it should stay as-is.',
        payload: { kind: 'sweep_escalation_decision', finding_class: findingClass, subject, streak: nextCount },
      }, { select: 'id', single: true });
      if (!isDeliveredDispatchError(result) && result.data) decisionRowId = result.data.id;
    } catch (e) {
      console.error('[sweep-consecutive-escalation] decision row insert failed (non-fatal): ' + ((e && e.message) || e));
    }
    try {
      fs.appendFileSync(FINDINGS_LOG_PATH, JSON.stringify({
        findingClass, subject, escalationMarker: true, decisionRowId, ts: new Date().toISOString(),
      }) + '\n');
    } catch (e) {
      console.error('[sweep-consecutive-escalation] marker append failed (non-fatal): ' + ((e && e.message) || e));
    }
  }
  return { printed: true };
}

module.exports = { ESCALATE_AFTER, guardedRecordFinding, tailStreak };
