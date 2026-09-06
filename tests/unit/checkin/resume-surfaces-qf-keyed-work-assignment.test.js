/**
 * QF-20260905-017 — a directed WORK_ASSIGNMENT keyed to a QF (payload.qf_id/qf, not
 * assigned_sd/sd_key) addressed to a seat that already holds a claim was fully invisible:
 * seam-1's extractDirectedSd uses the deliberately narrow 'directed' profile (assigned_sd/
 * sd_key/target_sd only, by design -- lib/fleet/assignment-target.cjs PROFILES.directed), so it
 * never resolves a QF key and pendingAssignment stays null; the pendingDirectives fallback below
 * it then UNCONDITIONALLY excluded every WORK_ASSIGNMENT message_type, so the row matched neither
 * path. Measured specimens: Hotel/Golf-3 both held QF-604/QF-844 dispatches unread for 30+ min.
 *
 * Fix: pendingDirectives now surfaces a WORK_ASSIGNMENT not already covered by seam-1, as long as
 * it resolves via the broader extractSdFromAssignment profile (which does check qf_id/qf) and is
 * not a pure informational/broadcast nudge. PRINT-ONLY: it is never claimed or acked here, same
 * contract as every other pendingDirectives entry.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const resume = require('../../../lib/checkin/steps/resume.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const ME = 'sess-under-test';
const QF_KEYED_WA = {
  id: 'msg-qf-keyed-wa-1',
  message_type: 'WORK_ASSIGNMENT',
  created_at: new Date().toISOString(),
  subject: 'DIRECTED: QF-20260905-999',
  payload: { qf_id: 'QF-20260905-999' },
};
const BROADCAST_WA = {
  id: 'msg-broadcast-wa-1',
  message_type: 'WORK_ASSIGNMENT',
  created_at: new Date().toISOString(),
  payload: { available_sds: ['SD-A-001', 'SD-B-002'], current_sd: 'SD-CURRENT-001' },
};

// Mirrors lib/fleet/assignment-target.cjs's 'directed' vs 'worker' profile split closely enough
// for this unit: 'directed' checks only assigned_sd/sd_key; 'worker' additionally checks qf_id/qf.
function extractDirectedSd(m) {
  return m.payload?.assigned_sd || m.payload?.sd_key || null;
}
function extractSdFromAssignment(m) {
  return m.payload?.assigned_sd || m.payload?.sd_key || m.payload?.qf_id || m.payload?.qf || null;
}
function isInformationalNudge(m) {
  const p = m.payload || {};
  return p.kind === 'completion_nudge' || p.informational === true || (!!p.available_sds && !p.assigned_sd && !p.sd_key && !p.qf_id && !p.qf);
}

function makeSb() {
  return {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
}

function makeCtx({ messages, mySd = 'SD-CURRENT-001' } = {}) {
  return {
    sb: makeSb(),
    sessionId: ME,
    opts: {},
    mySd,
    sessionRole: 'worker',
    sessionMetadata: {},
    base: { callsign: null },
    helpers: {
      ws: { getMessagesForSession: async () => messages, DIRECTIVE_KINDS: [] },
      confirmRowGone: async () => false,
      selfHealStaleClaim: async () => {},
      findOwnSdClaim: async () => mySd,
      healOwnClaimPointer: async () => true,
      extractDirectedSd,
      extractSdFromAssignment,
      isInformationalNudge,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
      ackMessage: async () => { throw new Error('must not be called for a print-only surface'); },
    },
  };
}

describe('QF-20260905-017: resume surfaces a QF-keyed WORK_ASSIGNMENT it cannot claim', () => {
  it('surfaces the QF key in pending_directives, print-only, when the seat already holds a claim', async () => {
    const res = await runSteps([resume], makeCtx({ messages: [QF_KEYED_WA] }));
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-CURRENT-001');
    expect(res.pending_work_assignment).toBeUndefined(); // not seam-1 -- narrow profile never resolves it
    expect(res.pending_directives).toEqual(
      expect.arrayContaining([{ id: QF_KEYED_WA.id, kind: 'work_assignment', key: 'QF-20260905-999', subject: QF_KEYED_WA.subject }])
    );
    expect(res.message).toContain('work_assignment(QF-20260905-999)');
  });

  it('does not surface a pure broadcast/queue-pointer WORK_ASSIGNMENT (no directed key at all)', async () => {
    const res = await runSteps([resume], makeCtx({ messages: [BROADCAST_WA] }));
    expect(res.pending_directives).toBeUndefined();
  });

  it('does not double-surface a WORK_ASSIGNMENT already resolved by seam-1 (a different SD, not this seat\'s own)', async () => {
    const sdKeyedWa = { id: 'msg-sd-keyed-1', message_type: 'WORK_ASSIGNMENT', created_at: new Date().toISOString(), payload: { assigned_sd: 'SD-OTHER-999' } };
    const ctx = makeCtx({ messages: [sdKeyedWa] });
    ctx.helpers.ackMessage = async () => ({ acknowledged: true }); // seam-1 defers/acks this one, by design
    const res = await runSteps([resume], ctx);
    expect(res.pending_work_assignment).toMatchObject({ sd: 'SD-OTHER-999' });
    expect(res.pending_directives).toBeUndefined();
  });
});
