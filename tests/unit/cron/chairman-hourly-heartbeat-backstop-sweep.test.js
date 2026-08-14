/**
 * SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001 — cloud-side hourly-heartbeat backstop sweep.
 *
 * Pins the status-decision-table dedupe (PLAN-phase TESTING sub-agent finding G1: mere row
 * existence must not count as "filled" — a stuck status='owed' row is exactly the failure mode
 * this backstop exists to catch), the negative selectivity controls (hour and kind — finding
 * G5), the read-error fail-closed branch (finding G3), and the staleness-threshold two-sided
 * assertion (finding G4). The fake supabase client below is FILTER-AWARE (records .eq/.gte/.lt
 * args and applies them to a fixture row set) specifically so these tests exercise the sweep's
 * own hour/kind selection logic rather than merely echoing a stub's return value — the
 * tautology risk the TESTING sub-agent flagged against the sibling's non-filter-aware fake.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseArgs,
  classifyRowCoverage,
  combineHourVerdict,
  STALENESS_GRACE_MS,
  LIVE_KIND,
  BACKSTOP_KIND,
} from '../../../scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs';
import { etHourWindowUtc } from '../../../lib/time/chairman-et-wall-clock.js';

// Instants chosen so the coarse window gate and both DST offsets are exercised. All at ET
// (chairman zone defaults to America/New_York in these tests via the stubbed resolver).
const MID_DAY = new Date('2026-07-18T17:30:00Z');       // 13:30 EDT -> zone hour 13 (in window)
const TOO_EARLY = new Date('2026-07-18T09:30:00Z');      // 05:30 EDT -> zone hour 5 (inert)
const TOO_LATE = new Date('2026-07-18T02:30:00Z');       // 22:30 EDT (prior-day UTC date) -> zone hour 22 (inert)
const WINTER_MID_DAY = new Date('2026-01-15T18:30:00Z'); // 13:30 EST -> zone hour 13 (in window)

function baseDeps(overrides = {}) {
  return {
    supabase: makeFilterAwareSupabase([]),
    env: { CHAIRMAN_PHONE: '+15555550123' },
    now: MID_DAY,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    resolveQuietHoursContext: vi.fn(async () => ({ allowQuietHours: false, chairmanZone: 'America/New_York', chairmanZoneSource: 'default' })),
    ...overrides,
  };
}

/**
 * Filter-aware fake supabase: records .eq/.gte/.lt args and applies them against `rows` so the
 * sweep's own kind/hour-window selection is genuinely exercised, not merely echoed.
 * @param {Array<{kind:string,status:string,created_at:string}>} rows
 */
function makeFilterAwareSupabase(rows) {
  const calls = [];
  // Each filter tracked under a distinct `${col}__${op}` key so .gte and .lt on the SAME
  // column (created_at) don't overwrite each other -- both bounds of the hour window must be
  // independently honored for the G5 negative-selectivity controls to be meaningful.
  function chain(filters) {
    const api = {
      eq: (col, val) => chain({ ...filters, [`${col}__eq`]: val }),
      gte: (col, val) => chain({ ...filters, [`${col}__gte`]: val }),
      lt: (col, val) => chain({ ...filters, [`${col}__lt`]: val }),
      order: () => api,
      limit: () => api,
      select: () => api,
      then: (resolve) => {
        calls.push(filters);
        const matched = rows.filter((r) => {
          if (filters['kind__eq'] !== undefined && r.kind !== filters['kind__eq']) return false;
          if (filters['created_at__gte'] !== undefined && !(r.created_at >= filters['created_at__gte'])) return false;
          if (filters['created_at__lt'] !== undefined && !(r.created_at < filters['created_at__lt'])) return false;
          return true;
        }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return Promise.resolve({ data: matched.slice(0, 1), error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from: () => chain({}), __calls: calls };
}

function makeErrorSupabase() {
  const api = {
    eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, select: () => api,
    then: (resolve) => Promise.resolve({ data: null, error: { message: 'connection refused' } }).then(resolve),
  };
  return { from: () => api };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('coarse window fixtures are valid (season sanity)', () => {
  it('MID_DAY / TOO_EARLY / TOO_LATE map to the expected zone hours', () => {
    expect(etHourWindowUtc(MID_DAY, 'America/New_York').hourKey.slice(-2)).toBe('13');
    expect(etHourWindowUtc(TOO_EARLY, 'America/New_York').hourKey.slice(-2)).toBe('05');
    expect(etHourWindowUtc(TOO_LATE, 'America/New_York').hourKey.slice(-2)).toBe('22');
  });
  it('winter mid-day is also zone hour 13', () => {
    expect(etHourWindowUtc(WINTER_MID_DAY, 'America/New_York').hourKey.slice(-2)).toBe('13');
  });
});

describe('classifyRowCoverage — status-decision table (finding G1)', () => {
  const now = MID_DAY;
  it('null row (no prior send) -> unfilled', () => {
    expect(classifyRowCoverage(null, now)).toBe('unfilled');
  });
  it('sent -> filled', () => {
    expect(classifyRowCoverage({ status: 'sent', created_at: now.toISOString() }, now)).toBe('filled');
  });
  it('delivered -> filled', () => {
    expect(classifyRowCoverage({ status: 'delivered', created_at: now.toISOString() }, now)).toBe('filled');
  });
  it('owed, fresh (within grace floor) -> in_flight, NOT filled (this is the G1 fix)', () => {
    const fresh = new Date(now.getTime() - 60 * 1000).toISOString(); // 1 min ago
    expect(classifyRowCoverage({ status: 'owed', created_at: fresh }, now)).toBe('in_flight');
  });
  it('owed, stale (past grace floor) -> unfilled — mere row existence must not suppress the backstop', () => {
    const stale = new Date(now.getTime() - STALENESS_GRACE_MS - 1000).toISOString();
    expect(classifyRowCoverage({ status: 'owed', created_at: stale }, now)).toBe('unfilled');
  });
  it('sending, fresh -> in_flight', () => {
    const fresh = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(classifyRowCoverage({ status: 'sending', created_at: fresh }, now)).toBe('in_flight');
  });
  it('failed (any age) -> unfilled (retry)', () => {
    expect(classifyRowCoverage({ status: 'failed', created_at: now.toISOString() }, now)).toBe('unfilled');
  });
  it('undelivered (any age) -> unfilled (retry)', () => {
    expect(classifyRowCoverage({ status: 'undelivered', created_at: now.toISOString() }, now)).toBe('unfilled');
  });
  it('canceled -> do_not_retry', () => {
    expect(classifyRowCoverage({ status: 'canceled', created_at: now.toISOString() }, now)).toBe('do_not_retry');
  });
  it('owed_escalate -> do_not_retry', () => {
    expect(classifyRowCoverage({ status: 'owed_escalate', created_at: now.toISOString() }, now)).toBe('do_not_retry');
  });
});

describe('combineHourVerdict', () => {
  it('filled beats everything', () => {
    expect(combineHourVerdict('filled', 'unfilled')).toBe('filled');
    expect(combineHourVerdict('unfilled', 'filled')).toBe('filled');
  });
  it('do_not_retry beats in_flight/unfilled', () => {
    expect(combineHourVerdict('do_not_retry', 'unfilled')).toBe('do_not_retry');
  });
  it('in_flight beats unfilled', () => {
    expect(combineHourVerdict('in_flight', 'unfilled')).toBe('in_flight');
  });
  it('both unfilled -> unfilled', () => {
    expect(combineHourVerdict('unfilled', 'unfilled')).toBe('unfilled');
  });
});

describe('TS-A — missed-hour: no qualifying row this chairman-zone hour -> sends exactly once', () => {
  it('sends via sendChairmanSMS with kind=heartbeat_status_backstop', async () => {
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase([]) }));

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const [message] = send.mock.calls[0];
    expect(message.kind).toBe(BACKSTOP_KIND);
    expect(message.dedupeKey).toContain(BACKSTOP_KIND);
  });
});

describe('TS-B — present-hour, live delivered -> zero send calls', () => {
  it('a heartbeat_status row (status=delivered) this hour suppresses the backstop', async () => {
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: MID_DAY.toISOString() }];
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('filled');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('TS-C — G1 fix: live stuck at status=owed past the grace floor still triggers a send', () => {
  it('a stale owed row does NOT suppress the backstop (mere row existence != filled)', async () => {
    const staleCreatedAt = new Date(MID_DAY.getTime() - STALENESS_GRACE_MS - 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'owed', created_at: staleCreatedAt }];
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a FRESH owed row (within the grace floor) is right-of-first-refusal — no send this tick', async () => {
    const freshCreatedAt = new Date(MID_DAY.getTime() - 60 * 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'owed', created_at: freshCreatedAt }];
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('in_flight');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('TS-D — stale backstop retry: a prior failed backstop attempt this hour is retried with a fresh key', () => {
  it('retries via a new dedupeKey, distinct from the failed attempt', async () => {
    const staleCreatedAt = new Date(MID_DAY.getTime() - STALENESS_GRACE_MS - 1000).toISOString();
    const rows = [{ kind: BACKSTOP_KIND, status: 'failed', created_at: staleCreatedAt }];
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('TS-E — present-hour, backstop already filled -> zero send calls', () => {
  it('a heartbeat_status_backstop row (status=sent) this hour suppresses a second fill', async () => {
    const rows = [{ kind: BACKSTOP_KIND, status: 'sent', created_at: MID_DAY.toISOString() }];
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('filled');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('TS-F — present-hour, canceled/owed_escalate -> do-not-retry, zero send calls', () => {
  it('a canceled live row this hour is never retried', async () => {
    const rows = [{ kind: LIVE_KIND, status: 'canceled', created_at: MID_DAY.toISOString() }];
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));
    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('do_not_retry');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('G5 — negative selectivity controls', () => {
  it('a heartbeat_status row from the PREVIOUS hour does NOT suppress the current hour', async () => {
    const prevHour = new Date(MID_DAY.getTime() - 60 * 60 * 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: prevHour }];
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('an unrelated kind (morning_brief) in the current hour does NOT suppress the backstop', async () => {
    const rows = [{ kind: 'morning_brief', status: 'delivered', created_at: MID_DAY.toISOString() }];
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('G3 — read-error branch fails closed', () => {
  it('a supabase read error results in no_send / inert, never a send attempt', async () => {
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeErrorSupabase() }));

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('read_error');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('coarse window gate: inert outside 06:00-22:00 chairman-zone', () => {
  it('inert before 06:00 zone-local', async () => {
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, now: TOO_EARLY }));
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('outside_coarse_window');
    expect(send).not.toHaveBeenCalled();
  });

  it('inert at/after 22:00 zone-local', async () => {
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, now: TOO_LATE }));
    expect(r.action).toBe('inert');
    expect(send).not.toHaveBeenCalled();
  });

  it('works on a winter mid-day tick', async () => {
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, now: WINTER_MID_DAY, supabase: makeFilterAwareSupabase([]) }));
    expect(r.action).toBe('sent');
  });
});

describe('quiet-hours pass-through: sendChairmanSMS surfaces the REAL rubric-blocked shape', () => {
  it('a rubric-blocked result is surfaced as no-send, not swallowed as success', async () => {
    const send = vi.fn(async () => ({ sent: false, held: true, reason: 'blocked', verdict: 'block', blockedReasons: ['quiet_hours'] }));
    const r = await main(['node', 's', '--once'], baseDeps({ send, supabase: makeFilterAwareSupabase([]) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.sent).toBe(false);
    expect(r.summary.held).toBe(true);
  });
});

describe('CHAIRMAN_PHONE unset -> inert', () => {
  it('logs inert and exits 0 with no send when the phone is unset', async () => {
    const send = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ send, env: {} }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('chairman_phone_unset');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('--dry-run makes zero send calls', () => {
  it('reports dry_run and never calls send', async () => {
    const send = vi.fn();
    const r = await main(['node', 's', '--once', '--dry-run'], baseDeps({ send, supabase: makeFilterAwareSupabase([]) }));
    expect(r.action).toBe('dry_run');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('PII-free logging (no phone/body in logs)', () => {
  it('no log line emits the recipient phone or the raw body text', async () => {
    const PHONE = '+15555550123';
    const send = vi.fn(async () => ({ sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' }));
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await main(['node', 's', '--once'], baseDeps({ send, logger, env: { CHAIRMAN_PHONE: PHONE }, supabase: makeFilterAwareSupabase([]) }));

    const logged = logger.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain(PHONE);
    expect(logged).not.toContain('Still here');
  });
});
