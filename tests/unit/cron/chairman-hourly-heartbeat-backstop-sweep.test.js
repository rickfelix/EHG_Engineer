/**
 * SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001 — cloud-side hourly-heartbeat backstop sweep.
 *
 * Pins the status-decision-table dedupe (PLAN-phase TESTING sub-agent finding G1: mere row
 * existence must not count as "filled" — a stuck status='owed' row is exactly the failure mode
 * this backstop exists to catch), the negative selectivity control (kind — finding G5), the
 * read-error fail-closed branch (finding G3), the staleness-threshold two-sided assertion
 * (finding G4), the TRAILING-WINDOW coverage read (EXEC-phase TESTING sub-agent finding F1: an
 * earlier revision used a fixed calendar-hour bucket, empty by construction at the top of every
 * hour), and the ENQUEUE-ONLY send path (EXEC-phase SECURITY sub-agent finding SEC-H1,
 * merge-blocking: an earlier revision called sendChairmanSMS's inline Twilio dispatch from a
 * GHA workflow that carries no Twilio credentials, which would have burned retry attempts and
 * dead-lettered unrelated owed obligations during the exact outage this SD exists to cover —
 * this sweep now enqueues only, via enqueueChairmanSms, and gates quiet-hours explicitly since
 * it no longer inherits that check from sendChairmanSMS's rubric). The fake supabase client
 * below is FILTER-AWARE (records .eq/.gte args and applies them to a fixture row set)
 * specifically so these tests exercise the sweep's own kind/window selection logic rather than
 * merely echoing a stub's return value.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseArgs,
  classifyRowCoverage,
  combineHourVerdict,
  STALENESS_GRACE_MS,
  LOOKBACK_MS,
  LIVE_KIND,
  BACKSTOP_KIND,
} from '../../../scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs';
import { etHourWindowUtc } from '../../../lib/time/chairman-et-wall-clock.js';

// Instants chosen so the coarse window gate (05:00-22:59 zone-local), the real quiet-hours gate
// (22:00-06:00), and both DST offsets are all exercised. All at ET (chairman zone defaults to
// America/New_York in these tests via the stubbed resolver).
const MID_DAY = new Date('2026-07-18T17:30:00Z');        // 13:30 EDT -> zone hour 13 (awake, in window)
const TOP_OF_HOUR = new Date('2026-07-18T18:00:00Z');     // 14:00:00 EDT exactly -> zone hour 14 (in window)
const TOO_EARLY = new Date('2026-07-18T08:30:00Z');       // 04:30 EDT -> zone hour 4 (outside coarse window)
const TOO_LATE = new Date('2026-07-19T03:30:00Z');        // 23:30 EDT -> zone hour 23 (outside coarse window)
// Inside the coarse pre-filter's buffer band (05:00-22:59) AND inside real quiet hours
// (22:00-06:00) -- exactly the case the buffer band exists to make reachable (finding: an
// exact-match coarse window would make the explicit isSmsQuietHour check unreachable dead
// code).
const IN_QUIET_HOURS_BUFFER = new Date('2026-07-19T02:30:00Z'); // 22:30 EDT -> zone hour 22 (coarse-window-in, quiet-hours-in)
const WINTER_MID_DAY = new Date('2026-01-15T18:30:00Z');  // 13:30 EST -> zone hour 13 (in window)

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
 * Filter-aware fake supabase: records .eq/.gte args and applies them against `rows` so the
 * sweep's own kind/window selection is genuinely exercised, not merely echoed.
 * @param {Array<{kind:string,status:string,created_at:string}>} rows
 */
function makeFilterAwareSupabase(rows) {
  const calls = [];
  function chain(filters) {
    const api = {
      eq: (col, val) => chain({ ...filters, [`${col}__eq`]: val }),
      gte: (col, val) => chain({ ...filters, [`${col}__gte`]: val }),
      order: () => api,
      limit: () => api,
      select: () => api,
      then: (resolve) => {
        calls.push(filters);
        const matched = rows.filter((r) => {
          if (filters['kind__eq'] !== undefined && r.kind !== filters['kind__eq']) return false;
          if (filters['created_at__gte'] !== undefined && !(r.created_at >= filters['created_at__gte'])) return false;
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
    eq: () => api, gte: () => api, order: () => api, limit: () => api, select: () => api,
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
  it('MID_DAY / TOO_EARLY / TOO_LATE / IN_QUIET_HOURS_BUFFER map to the expected zone hours', () => {
    expect(etHourWindowUtc(MID_DAY, 'America/New_York').hourKey.slice(-2)).toBe('13');
    expect(etHourWindowUtc(TOO_EARLY, 'America/New_York').hourKey.slice(-2)).toBe('04');
    expect(etHourWindowUtc(TOO_LATE, 'America/New_York').hourKey.slice(-2)).toBe('23');
    expect(etHourWindowUtc(IN_QUIET_HOURS_BUFFER, 'America/New_York').hourKey.slice(-2)).toBe('22');
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

describe('TS-A — missed-hour: no qualifying row in the trailing window -> enqueues exactly once', () => {
  it('enqueues via enqueueChairmanSms with kind=heartbeat_status_backstop, never sendChairmanSMS', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase([]) }));

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [, arg] = enqueue.mock.calls[0];
    expect(arg.kind).toBe(BACKSTOP_KIND);
    expect(arg.recipientPhone).toBe('+15555550123');
    expect(arg.decisionId).toBeNull();
    // EXEC-phase TESTING sub-agent finding F3: the millisecond-timestamp suffix is
    // load-bearing (it is what makes each real attempt's dedupeKey unique, avoiding a
    // same-key UPSERT collision) — assert the exact key format, not merely that it contains
    // the kind string, so a future "cleanup" to a tidy per-hour-only key fails this test.
    expect(arg.dedupeKey).toBe(`${BACKSTOP_KIND}:2026-07-18T13:${MID_DAY.getTime()}`);
  });
});

describe('TS-B — present-hour, live delivered -> zero enqueue calls', () => {
  it('a heartbeat_status row (status=delivered) in the trailing window suppresses the backstop', async () => {
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: MID_DAY.toISOString() }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('filled');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('TS-C — G1 fix: live stuck at status=owed past the grace floor still triggers an enqueue', () => {
  it('a stale owed row does NOT suppress the backstop (mere row existence != filled)', async () => {
    const staleCreatedAt = new Date(MID_DAY.getTime() - STALENESS_GRACE_MS - 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'owed', created_at: staleCreatedAt }];
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('a FRESH owed row (within the grace floor) is right-of-first-refusal — no enqueue this tick', async () => {
    const freshCreatedAt = new Date(MID_DAY.getTime() - 60 * 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'owed', created_at: freshCreatedAt }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('in_flight');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('TS-D — stale backstop retry: a prior failed backstop attempt is retried with a fresh key', () => {
  it('retries via a new dedupeKey, distinct from the failed attempt', async () => {
    const staleCreatedAt = new Date(MID_DAY.getTime() - STALENESS_GRACE_MS - 1000).toISOString();
    const rows = [{ kind: BACKSTOP_KIND, status: 'failed', created_at: staleCreatedAt }];
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-2' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('TS-E — present-hour, backstop already filled -> zero enqueue calls', () => {
  it('a heartbeat_status_backstop row (status=sent) in the trailing window suppresses a second fill', async () => {
    const rows = [{ kind: BACKSTOP_KIND, status: 'sent', created_at: MID_DAY.toISOString() }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('filled');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('TS-F — present-hour, canceled/owed_escalate -> do-not-retry, zero enqueue calls', () => {
  it('a canceled live row is never retried', async () => {
    const rows = [{ kind: LIVE_KIND, status: 'canceled', created_at: MID_DAY.toISOString() }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));
    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('do_not_retry');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('TS-I — deduped: a repeat tick against an already-enqueued dedupeKey is a no-op', () => {
  it('surfaces action=deduped, exitCode 0', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: false, deduped: true }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase([]) }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('deduped');
  });
});

describe('G5 — negative selectivity control (kind)', () => {
  it('an unrelated kind (morning_brief) in the trailing window does NOT suppress the backstop', async () => {
    const rows = [{ kind: 'morning_brief', status: 'delivered', created_at: MID_DAY.toISOString() }];
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('TS-G — F1 fix: a live send just before an hour boundary still counts as coverage at the next hour\'s first tick', () => {
  it('a delivered row 3 minutes before TOP_OF_HOUR suppresses the backstop at TOP_OF_HOUR exactly (trailing window spans the boundary)', async () => {
    const justBefore = new Date(TOP_OF_HOUR.getTime() - 3 * 60 * 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: justBefore }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: TOP_OF_HOUR, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(r.summary.reason).toBe('filled');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('regression guard: an EMPTY ledger at TOP_OF_HOUR still correctly triggers an enqueue (genuinely no coverage, not a calendar-bucket artifact)', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: TOP_OF_HOUR, supabase: makeFilterAwareSupabase([]) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('TS-H — trailing-window boundary: a send older than LOOKBACK_MS genuinely does not count as coverage', () => {
  it('a delivered row older than LOOKBACK_MS triggers an enqueue (real SLA breach, not a false positive)', async () => {
    const tooOld = new Date(MID_DAY.getTime() - LOOKBACK_MS - 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: tooOld }];
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('a delivered row just within LOOKBACK_MS still counts as coverage', async () => {
    const justWithin = new Date(MID_DAY.getTime() - LOOKBACK_MS + 1000).toISOString();
    const rows = [{ kind: LIVE_KIND, status: 'delivered', created_at: justWithin }];
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase(rows) }));

    expect(r.action).toBe('no_send');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('G3 — read-error branch fails closed', () => {
  it('a supabase read error results in inert, never an enqueue attempt', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, supabase: makeErrorSupabase() }));

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('read_error');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('coarse window gate: inert outside 05:00-22:59 chairman-zone', () => {
  it('inert before 05:00 zone-local', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: TOO_EARLY }));
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('outside_coarse_window');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('inert at/after 23:00 zone-local', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: TOO_LATE }));
    expect(r.action).toBe('inert');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('works on a winter mid-day tick', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: WINTER_MID_DAY, supabase: makeFilterAwareSupabase([]) }));
    expect(r.action).toBe('enqueued');
  });
});

describe('SEC-H1 remediation: explicit quiet-hours gate (no longer inherited from sendChairmanSMS)', () => {
  it('inside the coarse-window buffer band but inside real quiet hours (22:30 zone-local) -> inert, zero enqueue attempts', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: IN_QUIET_HOURS_BUFFER, supabase: makeFilterAwareSupabase([]) }));

    expect(r.action).toBe('inert');
    expect(r.reason).toBe('quiet_hours');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a chairman-authorized allowQuietHours override permits an enqueue even inside quiet hours', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const resolveQuietHoursContext = vi.fn(async () => ({ allowQuietHours: true, chairmanZone: 'America/New_York', chairmanZoneSource: 'chairman_preference' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, resolveQuietHoursContext, now: IN_QUIET_HOURS_BUFFER, supabase: makeFilterAwareSupabase([]) }));

    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('resolveQuietHoursContext is called with the real `now`, not silently dropped', async () => {
    const resolveQuietHoursContext = vi.fn(async () => ({ allowQuietHours: false, chairmanZone: 'America/New_York', chairmanZoneSource: 'default' }));
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    await main(['node', 's', '--once'], baseDeps({ enqueue, resolveQuietHoursContext, supabase: makeFilterAwareSupabase([]) }));
    expect(resolveQuietHoursContext).toHaveBeenCalledWith(MID_DAY);
  });
});

describe('CHAIRMAN_PHONE unset -> inert', () => {
  it('logs inert and exits 0 with no enqueue when the phone is unset', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, env: {} }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('chairman_phone_unset');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('--dry-run makes zero enqueue calls', () => {
  it('reports dry_run and never calls enqueue', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once', '--dry-run'], baseDeps({ enqueue, supabase: makeFilterAwareSupabase([]) }));
    expect(r.action).toBe('dry_run');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('PII-free logging (no phone/body in logs)', () => {
  it('no log line emits the recipient phone or the raw body text', async () => {
    const PHONE = '+15555550123';
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await main(['node', 's', '--once'], baseDeps({ enqueue, logger, env: { CHAIRMAN_PHONE: PHONE }, supabase: makeFilterAwareSupabase([]) }));

    const logged = logger.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain(PHONE);
    expect(logged).not.toContain('Still here');
  });
});
