/**
 * SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001 FR-2/FR-3/FR-6, TS-1/TS-6/TS-7/TS-8.
 *
 * Pure-function tests first (no IO), then the recordAndEvaluate() IO wrapper with an
 * injected fake supabase/notifyChairman -- never touches the real DB or Todoist API.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeHealthUpdate, evaluateAlarmTransition, checkCanaryFreshness, recordAndEvaluate } from '../../../lib/notifications/channel-health-recorder.js';

describe('computeHealthUpdate (TS-1): quiet-window suppressed is no-signal, not success', () => {
  it('returns null for a suppressed result -- caller must skip the write entirely', () => {
    expect(computeHealthUpdate({ consecutive_failures: 0 }, { success: true, suppressed: true, errorCode: 'SUPPRESSED_QUIET_WINDOW' })).toBeNull();
  });

  it('a suppressed result never advances last_success_at or resets consecutive_failures (no patch at all)', () => {
    const patch = computeHealthUpdate({ consecutive_failures: 3 }, { success: true, suppressed: true });
    expect(patch).toBeNull();
  });

  it('a real (non-suppressed) success resets consecutive_failures and stamps last_success_at', () => {
    const now = new Date('2026-07-04T15:00:00Z');
    const patch = computeHealthUpdate({ consecutive_failures: 5 }, { success: true, providerMessageId: 'msg-1' }, now);
    expect(patch.signalType).toBe('success');
    expect(patch.healthPatch.last_success_at).toBe(now.toISOString());
    expect(patch.healthPatch.consecutive_failures).toBe(0);
    expect(patch.healthPatch.last_error_class).toBeNull();
  });

  it('a failure increments consecutive_failures and records the error class', () => {
    const patch = computeHealthUpdate({ consecutive_failures: 1 }, { success: false, errorCode: 'MISSING_API_KEY' });
    expect(patch.signalType).toBe('failure');
    expect(patch.healthPatch.consecutive_failures).toBe(2);
    expect(patch.healthPatch.last_error_class).toBe('MISSING_API_KEY');
  });
});

describe('evaluateAlarmTransition (TS-6): hysteresis, storm prevention, no masking', () => {
  const now = new Date('2026-07-04T15:00:00Z');

  it('does NOT raise on a single transient failure below threshold', () => {
    const result = evaluateAlarmTransition({ alarm_state: 'clear' }, { signalType: 'failure', failuresAfter: 1, errorCode: 'TIMEOUT' }, now);
    expect(result).toBeNull();
  });

  it('raises on the 2nd consecutive failure (default threshold)', () => {
    const result = evaluateAlarmTransition({ alarm_state: 'clear' }, { signalType: 'failure', failuresAfter: 2, errorCode: 'TIMEOUT' }, now);
    expect(result.alarmPatch.alarm_state).toBe('raised');
    expect(result.shouldNotify).toBe(true);
  });

  it('raises immediately on an explicit quota-block even at failuresAfter=1', () => {
    const result = evaluateAlarmTransition({ alarm_state: 'clear' }, { signalType: 'failure', failuresAfter: 1, errorCode: 'HTTP_429' }, now);
    expect(result.alarmPatch.alarm_state).toBe('raised');
    expect(result.shouldNotify).toBe(true);
  });

  it('does not re-notify while already raised (dedup -- one alarm per outage)', () => {
    const result = evaluateAlarmTransition({ alarm_state: 'raised' }, { signalType: 'failure', failuresAfter: 5, errorCode: 'TIMEOUT' }, now);
    expect(result).toBeNull();
  });

  it('a verified success while raised transitions to cooldown (recovered), not straight to clear', () => {
    const result = evaluateAlarmTransition({ alarm_state: 'raised' }, { signalType: 'success' }, now);
    expect(result.alarmPatch.alarm_state).toBe('cooldown');
    expect(result.recovered).toBe(true);
    expect(result.shouldNotify).toBe(false);
  });

  it('cooldown finalizes to clear once the cooldown window has elapsed with no new failure', () => {
    const clearedAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 min ago, past the 15min default
    const result = evaluateAlarmTransition({ alarm_state: 'cooldown', alarm_cleared_at: clearedAt.toISOString() }, { signalType: 'success' }, now);
    expect(result.alarmPatch.alarm_state).toBe('clear');
  });

  it('a refail WITHIN the cooldown window does not storm (no re-notify) but still reflects raised state (no masking)', () => {
    const clearedAt = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago, well within 15min cooldown
    const result = evaluateAlarmTransition(
      { alarm_state: 'cooldown', alarm_cleared_at: clearedAt.toISOString(), alarm_raised_at: '2026-07-04T14:00:00Z' },
      { signalType: 'failure', failuresAfter: 2, errorCode: 'TIMEOUT' },
      now
    );
    expect(result.alarmPatch.alarm_state).toBe('raised'); // data is honest: it's broken again
    expect(result.shouldNotify).toBe(false); // but no storm -- same outage, no re-notify
  });

  it('a refail AFTER the cooldown window has fully elapsed IS treated as a genuinely new outage (re-notify)', () => {
    const clearedAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 min ago, past cooldown
    const result = evaluateAlarmTransition(
      { alarm_state: 'cooldown', alarm_cleared_at: clearedAt.toISOString() },
      { signalType: 'failure', failuresAfter: 2, errorCode: 'TIMEOUT' },
      now
    );
    expect(result.alarmPatch.alarm_state).toBe('raised');
    expect(result.shouldNotify).toBe(true); // genuinely new outage -- re-notify
  });
});

describe('checkCanaryFreshness (TS-8): absence detection', () => {
  it('treats a never-verified canary as stale', () => {
    expect(checkCanaryFreshness({ last_canary_verified_at: null }, new Date()).stale).toBe(true);
  });

  it('is fresh within the default 28h window', () => {
    const now = new Date('2026-07-04T15:00:00Z');
    const row = { last_canary_verified_at: new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString() }; // 10h ago
    expect(checkCanaryFreshness(row, now).stale).toBe(false);
  });

  it('is stale past the default 28h window (a dropped daily cron run)', () => {
    const now = new Date('2026-07-04T15:00:00Z');
    const row = { last_canary_verified_at: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString() }; // 30h ago
    expect(checkCanaryFreshness(row, now).stale).toBe(true);
  });
});

describe('recordAndEvaluate (TS-7): fail-safe IO wrapper with injected fakes', () => {
  function fakeSupabase(initialRow, { failSelect = false, failUpsert = false } = {}) {
    let row = initialRow;
    const calls = { upserts: [], updates: [] };
    return {
      calls,
      from: (table) => {
        expect(table).toBe('chairman_email_channel_health');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => failSelect ? { data: null, error: { message: 'select boom' } } : { data: row, error: null },
            }),
          }),
          upsert: (patch) => {
            calls.upserts.push(patch);
            if (failUpsert) return { error: { message: 'upsert boom' } };
            row = { ...row, ...patch };
            return Promise.resolve({ error: null });
          },
          update: (patch) => ({
            eq: () => {
              calls.updates.push(patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    };
  }

  it('a real success writes the health patch and does not call notifyChairman', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 0, alarm_state: 'clear' });
    const notifyChairman = vi.fn();
    const result = await recordAndEvaluate({ supabase, notifyChairman }, { success: true, providerMessageId: 'm1' }, { now: new Date() });
    expect(result.ok).toBe(true);
    expect(notifyChairman).not.toHaveBeenCalled();
    expect(supabase.calls.upserts.length).toBe(1);
  });

  it('a suppressed result skips the write entirely (TS-1 wired through the IO layer)', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 0, alarm_state: 'clear' });
    const result = await recordAndEvaluate({ supabase, notifyChairman: vi.fn() }, { success: true, suppressed: true }, { now: new Date() });
    expect(result.skipped).toBe(true);
    expect(supabase.calls.upserts.length).toBe(0);
  });

  it('2 consecutive failures raise the alarm and call notifyChairman exactly once', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 1, alarm_state: 'clear' });
    const notifyChairman = vi.fn().mockResolvedValue({ taskId: 't1', verified: true });
    const result = await recordAndEvaluate({ supabase, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date() });
    expect(result.notified).toBe(true);
    expect(notifyChairman).toHaveBeenCalledTimes(1);
    expect(notifyChairman.mock.calls[0][0].priority).toBe('high');
  });

  it('a notifyChairman failure is recorded but never thrown -- write already completed (TS-9)', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 1, alarm_state: 'clear' });
    const notifyChairman = vi.fn().mockRejectedValue(new Error('Todoist down'));
    const result = await recordAndEvaluate({ supabase, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date() });
    expect(result.ok).toBe(true); // never throws
    expect(result.notified).toBe(false);
    expect(result.error).toContain('Todoist down');
    expect(supabase.calls.upserts.length).toBe(1); // the health/alarm write already happened before notify was attempted
    expect(supabase.calls.updates.length).toBe(1); // last_alarm_notify_error recorded
  });

  it('a read failure trips the alarm (degraded) rather than throwing into the send path', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 0, alarm_state: 'clear' }, { failSelect: true });
    const result = await recordAndEvaluate({ supabase, notifyChairman: vi.fn() }, { success: false, errorCode: 'NETWORK_ERROR' }, { now: new Date() });
    expect(result.ok).toBe(false);
    expect(supabase.calls.upserts.some(p => p.alarm_state === 'raised' && p.last_error_class === 'RECORDER_WRITE_FAILURE')).toBe(true);
  });

  it('a write failure also trips the degraded alarm rather than being silently swallowed', async () => {
    const supabase = fakeSupabase({ consecutive_failures: 0, alarm_state: 'clear' }, { failUpsert: true });
    const result = await recordAndEvaluate({ supabase, notifyChairman: vi.fn() }, { success: true, providerMessageId: 'm1' }, { now: new Date() });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('write failed');
  });
});
