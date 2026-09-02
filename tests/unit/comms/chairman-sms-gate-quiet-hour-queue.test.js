/**
 * QF-20260902-939 — a chairman-SMS decision blocked SOLELY by quiet_hours must QUEUE (writes a
 * chairman_held_sends row, hold_reason='quiet_hour', hold_expires_at=next 06:00 local, result
 * carries queued_for), never held:true with no row. A decision blocked by any OTHER rubric
 * finding must DROP (never queued, never held:true, no row). A non-decision (status) send keeps
 * the pre-existing held:true/'blocked' shape byte-identical (scripts/adam-chairman-sms.mjs's
 * formatSendResult() depends on it — a NON-GOAL of this fix).
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { smsQuietWindowReleaseIso } from '../../../lib/time/chairman-et-wall-clock.js';

function makeFakeSupabaseForHold({ insertError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table !== 'chairman_held_sends') throw new Error(`unexpected table: ${table}`);
      return {
        insert(row) {
          inserted.push(row);
          return Promise.resolve(insertError ? { data: null, error: { message: insertError } } : { data: [{ id: 'held-row-1' }], error: null });
        },
      };
    },
    rpc: vi.fn(async () => ({ data: 'u-resolved', error: null })),
  };
}

const quietHoursOnlyEval = vi.fn().mockResolvedValue({
  verdict: 'blocked',
  authorityClass: 'sms',
  blockedReasons: ['quiet_hours: within 22:00-06:00 ET quiet window'],
  lintFindings: [{ check: 'quiet_hours', ok: false, blocking: true, detail: 'within 22:00-06:00 ET quiet window' }],
});

const mixedBlockEval = vi.fn().mockResolvedValue({
  verdict: 'blocked',
  authorityClass: 'sms',
  blockedReasons: ['quiet_hours: within window', 'no_secrets: secret(s) detected: token'],
  lintFindings: [
    { check: 'quiet_hours', ok: false, blocking: true, detail: 'within 22:00-06:00 ET quiet window' },
    { check: 'no_secrets', ok: false, blocking: true, detail: 'secret(s) detected: token' },
  ],
});

const NOW = new Date('2026-09-02T04:00:00.000Z'); // 00:00 ET (EDT, UTC-4) -- inside the quiet window
const ZONE = 'America/New_York';

describe('chairman-sms-gate quiet-hour queue vs rubric drop (QF-20260902-939)', () => {
  it('a DECISION blocked SOLELY by quiet_hours writes a chairman_held_sends row (hold_reason=quiet_hour) and reports queued_for, never held:true', async () => {
    const supabase = makeFakeSupabaseForHold();
    const sender = { send: vi.fn() };

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Approve the deploy?', options: [{ label: 'A' }, { label: 'B' }], decisionId: 'dec-qh-1', subject: '[TEST]' },
      { now: NOW, chairmanZone: ZONE },
      { evaluate: quietHoursOnlyEval, sender, supabase },
    );

    const expectedQueuedFor = smsQuietWindowReleaseIso(NOW, ZONE);
    expect(r.sent).toBe(false);
    expect(r.held).toBeUndefined();
    expect(r.dropped).toBeUndefined();
    expect(r.queued_for).toBe(expectedQueuedFor);
    expect(sender.send).not.toHaveBeenCalled();

    expect(supabase.inserted).toHaveLength(1);
    const row = supabase.inserted[0];
    expect(row.hold_reason).toBe('quiet_hour');
    expect(row.hold_expires_at).toBe(expectedQueuedFor);
    expect(row.decision_id).toBe('dec-qh-1');
    expect(row.consult_correlation_id).toBeUndefined();
  });

  it('a DECISION blocked by the rubric for any reason OTHER than quiet-hours-alone reports DROPPED and writes no chairman_held_sends row', async () => {
    const supabase = makeFakeSupabaseForHold();
    const sender = { send: vi.fn() };

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Approve X? sk_live_abc123', decisionId: 'dec-qh-2' },
      { now: NOW, chairmanZone: ZONE },
      { evaluate: mixedBlockEval, sender, supabase },
    );

    expect(r).toMatchObject({ sent: false, dropped: true, reason: 'blocked' });
    expect(r.held).toBeUndefined();
    expect(r.queued_for).toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
    expect(supabase.inserted).toHaveLength(0);
  });

  it('a non-decision (status) send blocked solely by quiet_hours keeps the PRE-EXISTING held:true/"blocked" shape unchanged -- NON-GOAL: adam-chairman-sms.mjs formatSendResult() reads this exact shape', async () => {
    const supabase = makeFakeSupabaseForHold();
    const sender = { send: vi.fn() };

    const r = await sendChairmanSMS(
      { type: 'status', body: 'Heartbeat: all systems nominal.' },
      { now: NOW, chairmanZone: ZONE },
      { evaluate: quietHoursOnlyEval, sender, supabase },
    );

    expect(r).toMatchObject({ sent: false, held: true, reason: 'blocked' });
    expect(r.queued_for).toBeUndefined();
    expect(r.dropped).toBeUndefined();
    expect(supabase.inserted).toHaveLength(0);
  });
});
