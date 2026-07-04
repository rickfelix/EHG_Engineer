/**
 * SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001, TS-2/TS-3/TS-4/TS-5/TS-10.
 *
 * These exercise the REAL sendEmail() path end-to-end (no gate-level mocking of the recorder
 * or alarm state machine, per the SD's explicit "no mocked gate" requirement) -- only the
 * outbound network calls to Resend (global.fetch, matching resend-adapter.test.js's own
 * convention) and Todoist (opts.notifyChairman, matching chairman-notify.js's own documented
 * injectable-deps convention for exactly this reason) are faked, so no test spams a real inbox
 * or the chairman's phone.
 *
 * A fresh in-memory fake Supabase (one singleton row) is threaded through opts.supabase on every
 * call -- this is what makes recordSendResult() exercise the real recorder/alarm logic instead of
 * silently no-op'ing under the process.VITEST guard (see channel-health-recorder.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = global.fetch;
let mockFetch;

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch;
  process.env.RESEND_API_KEY = 'test-api-key-123';
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
});

function makeFakeHealthDb(initialRow = { consecutive_failures: 0, alarm_state: 'clear' }) {
  let row = { ...initialRow };
  return {
    getRow: () => row,
    from: (table) => {
      expect(table).toBe('chairman_email_channel_health');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        upsert: (patch) => { row = { ...row, ...patch }; return Promise.resolve({ error: null }); },
        update: (patch) => ({ eq: () => { row = { ...row, ...patch }; return Promise.resolve({ error: null }); } }),
      };
    },
  };
}

const DAYTIME_NOW = new Date('2026-07-04T15:00:00Z'); // 11am ET -- outside quiet window
const basePayload = { to: 'chairman@ehg.ai', subject: 'Chairman escalation', html: '<p>x</p>', text: 'x' };

async function importSendEmail() {
  const mod = await import('../../../lib/notifications/resend-adapter.js');
  return mod.sendEmail;
}

describe('FAIL direction (TS-2): real sendEmail() path raises the alarm exactly once', () => {
  it('two consecutive real failures (real path, no key) raise the alarm and call notifyChairman exactly once', async () => {
    delete process.env.RESEND_API_KEY; // triggers a REAL MISSING_API_KEY failure through the real code path
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });

    const r1 = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    expect(r1.success).toBe(false);
    expect(notifyChairman).not.toHaveBeenCalled(); // 1st failure -- below threshold

    const r2 = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    expect(r2.success).toBe(false);
    expect(notifyChairman).toHaveBeenCalledTimes(1); // 2nd failure -- alarm raises exactly once
    expect(db.getRow().alarm_state).toBe('raised');

    // A third consecutive failure must NOT re-fire (dedup -- one alarm per outage)
    const r3 = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    expect(r3.success).toBe(false);
    expect(notifyChairman).toHaveBeenCalledTimes(1);
  });
});

describe('RECOVERY direction (TS-3): first verified success clears the alarm and stamps recovery', () => {
  it('a verified success after 2 failures transitions raised -> cooldown with a recovery stamp', async () => {
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });

    delete process.env.RESEND_API_KEY;
    await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    expect(db.getRow().alarm_state).toBe('raised');

    process.env.RESEND_API_KEY = 'restored-key';
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'msg-recovered' }) });
    const recovery = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });

    expect(recovery.success).toBe(true);
    expect(db.getRow().alarm_state).toBe('cooldown'); // recovered, not immediately re-armable to 'clear'
    expect(db.getRow().alarm_cleared_at).toBeTruthy();
    expect(db.getRow().last_success_at).toBeTruthy();
    expect(db.getRow().consecutive_failures).toBe(0);
  });
});

describe('PASS direction (TS-4): a healthy sequence produces zero alarms, no noise', () => {
  it('7 consecutive real successes never raise the alarm or call notifyChairman', async () => {
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn();

    for (let i = 0; i < 7; i++) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: `msg-${i}` }) });
      const r = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
      expect(r.success).toBe(true);
    }

    expect(notifyChairman).not.toHaveBeenCalled();
    expect(db.getRow().alarm_state).toBe('clear');
    expect(db.getRow().consecutive_failures).toBe(0);
  });
});

describe('2026-07-03 outage replay (TS-5): detected within one detection cycle, not hours', () => {
  it('replays the REAL quota-exhaustion shape (persistent HTTP 429, exhausting real sendEmail() retries) -- alarm fires on the very first detected failure, not hours later', async () => {
    // The real 2026-07-03 outage was quota exhaustion, not a missing key -- Resend returning
    // 429 on every request. Real sendEmail() retries 429 up to MAX_RETRIES=2 times per call
    // before giving up with errorCode:'HTTP_429'; queue enough 429 responses to exhaust every
    // attempt's internal retries too, so the REAL retry/backoff loop runs unmocked.
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests', json: () => Promise.resolve({ message: 'Rate limited' }) });

    // Simulate the real outage shape: quota exhaustion producing repeated real failures across
    // ~5.5h of caller activity (compressed here to a small loop -- what matters is WHICH attempt
    // number the alarm fires on, not wall-clock time or the exact call count. 3 outer attempts is
    // enough to prove both "fires immediately" and "dedups on repeat" -- each attempt already
    // exercises the REAL retry loop's exponential backoff (real setTimeout, ~3s/attempt), so this
    // intentionally stays small rather than literally replaying 62 requests.
    let alarmFiredAtAttempt = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
      expect(r.errorCode).toBe('HTTP_429'); // confirms the real retry loop ran and genuinely exhausted
      if (notifyChairman.mock.calls.length > 0 && alarmFiredAtAttempt === null) {
        alarmFiredAtAttempt = attempt;
      }
    }

    // An explicit quota-block raises immediately (evaluateAlarmTransition's isQuotaBlock check),
    // not gated on the generic 2-failure threshold -- detected on the very FIRST real failure,
    // not the 62nd request 5.5h later.
    expect(alarmFiredAtAttempt).toBe(1);
    expect(notifyChairman).toHaveBeenCalledTimes(1); // still only once across the whole simulated outage
  });
});

describe('Quiet-window contract (TS-10): out-of-scope fence -- byte-for-byte unchanged behavior', () => {
  it('still suppresses at 2:00 AM ET with no provider call and no health-write side effect visible to the caller', async () => {
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const twoAmEt = new Date('2026-01-02T07:00:00Z');

    const result = await sendEmail(basePayload, { now: twoAmEt, supabase: db, notifyChairman: vi.fn() });

    expect(result.success).toBe(true);
    expect(result.suppressed).toBe(true);
    expect(result.errorCode).toBe('SUPPRESSED_QUIET_WINDOW');
    expect(mockFetch).not.toHaveBeenCalled();
    // FR-2: suppressed is no-signal -- the health row must be untouched by this call.
    expect(db.getRow().last_success_at).toBeUndefined();
    expect(db.getRow().consecutive_failures).toBe(0);
  });

  it('still sends normally just past the window, unaffected by the new recorder hook', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'msg-6am' }) });
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const sixAmEt = new Date('2026-01-02T11:00:00Z');

    const result = await sendEmail(basePayload, { now: sixAmEt, supabase: db, notifyChairman: vi.fn() });

    expect(result.success).toBe(true);
    expect(result.suppressed).toBeUndefined();
    expect(result.providerMessageId).toBe('msg-6am');
  });
});

describe('TS-9: a Todoist failure never blocks the health/alarm write from having already completed', () => {
  it('the alarm state is raised even when notifyChairman throws', async () => {
    delete process.env.RESEND_API_KEY;
    const sendEmail = await importSendEmail();
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockRejectedValue(new Error('Todoist down'));

    await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });
    await sendEmail(basePayload, { now: DAYTIME_NOW, supabase: db, notifyChairman });

    expect(db.getRow().alarm_state).toBe('raised'); // write succeeded despite notify failing
    expect(db.getRow().last_alarm_notify_error).toContain('Todoist down');
  });
});
