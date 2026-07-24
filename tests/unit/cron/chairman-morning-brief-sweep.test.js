/**
 * QF-20260720-531 — durable 6:00 ET self-healing morning-brief sweep.
 *
 * Pins the owed-state contract: enqueue-only (never provider.send), per-ET-date dedupe
 * double-fire no-op, the self-healing 5:00-11:59 ET window (QF-20260722-277: buffers GHA
 * scheduled-workflow lag; unlike morning-review's exact-hour gate, this window intentionally
 * spans multiple 15-min ticks so a missed first attempt is retried), the notBefore=6:00 AM ET
 * sleep-window deferral (QF-20260722-277: the window opening at 5:00 ET now overlaps the
 * 10PM-6AM ET SMS quiet window, so every enqueue is held until 6:00 AM regardless of tick time),
 * STAGED-absent fail-soft inert, and PII-free logging.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseArgs,
  etLocalHour,
  etDateStr,
  et6amIso,
} from '../../../scripts/cron/chairman-morning-brief-sweep.mjs';

// Instants chosen so the self-healing window gate is exercised in BOTH DST seasons.
const SUMMER_WINDOW_START = new Date('2026-07-18T09:00:00Z'); // 05:00 EDT -> ET hour 5 (does work)
const SUMMER_WINDOW_LATE = new Date('2026-07-18T14:45:00Z');  // 10:45 EDT -> ET hour 10 (still in window — retry tick)
const SUMMER_TOO_EARLY = new Date('2026-07-18T08:45:00Z');    // 04:45 EDT -> ET hour 4 (inert)
const SUMMER_TOO_LATE = new Date('2026-07-18T16:15:00Z');     // 12:15 EDT -> ET hour 12 (inert)
const WINTER_WINDOW_START = new Date('2026-01-15T10:00:00Z'); // 05:00 EST -> ET hour 5 (does work)

/** Minimal fake supabase — the brief body builder is imported/exercised via its own suite. */
function makeSupabase() {
  const api = {
    select: () => api, eq: () => api, gte: () => api, not: () => api, order: () => api, limit: () => api,
    then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return { from: () => api };
}

function baseDeps(overrides = {}) {
  return {
    supabase: makeSupabase(),
    env: { CHAIRMAN_PHONE: '+15555550123' },
    now: SUMMER_WINDOW_START,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    buildBody: vi.fn(async () => 'Roadmap: 40% build. Yesterday: 2 shipped.'),
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('self-healing window fixtures are valid (season sanity)', () => {
  it('summer window-start/late/too-early/too-late map to the expected ET hours', () => {
    expect(etLocalHour(SUMMER_WINDOW_START)).toBe(5);
    expect(etLocalHour(SUMMER_WINDOW_LATE)).toBe(10);
    expect(etLocalHour(SUMMER_TOO_EARLY)).toBe(4);
    expect(etLocalHour(SUMMER_TOO_LATE)).toBe(12);
  });
  it('winter window-start is ET hour 5', () => {
    expect(etLocalHour(WINTER_WINDOW_START)).toBe(5);
  });
});

describe('TS-1 — enqueues via the owed-state path, never fire-and-forget', () => {
  it('calls enqueueChairmanSms with kind=morning_brief at the window start', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue }));

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [, arg] = enqueue.mock.calls[0];
    expect(arg.kind).toBe('morning_brief');
    expect(arg.recipientPhone).toBe('+15555550123');
    expect(arg.decisionId).toBeNull();
    expect(arg.dedupeKey).toBe(`morning_brief:${etDateStr(SUMMER_WINDOW_START)}`);
  });
});

describe('TS-2 — self-healing: a later in-window tick retries after a missed first attempt', () => {
  it('a first attempt that never enqueued (e.g. transient failure) is retried and succeeds on a later tick', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-late' }));
    // Simulates the 6:00 tick having failed entirely (e.g. runner crash before this script ran) —
    // the NEXT 15-min tick in the window is the one under test here, and it must still enqueue.
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_WINDOW_LATE }));

    expect(r.action).toBe('enqueued');
    expect(enqueue.mock.calls[0][1].dedupeKey).toBe(`morning_brief:${etDateStr(SUMMER_WINDOW_LATE)}`);
  });

  it('a tick after the first successful enqueue is a deduped no-op (dedupe-key idempotency)', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: false, deduped: true }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_WINDOW_LATE }));

    expect(r.action).toBe('deduped');
    expect(r.exitCode).toBe(0);
  });
});

describe('TS-3 — window gate: inert outside 5:00-11:59 ET', () => {
  it('inert before 5:00 ET', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_TOO_EARLY }));
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('outside_et_window');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('inert at/after noon ET (bounded window, not unbounded all-day retry)', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_TOO_LATE }));
    expect(r.action).toBe('inert');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('works on the winter window start', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: WINTER_WINDOW_START }));
    expect(r.action).toBe('enqueued');
    expect(enqueue.mock.calls[0][1].dedupeKey).toBe('morning_brief:2026-01-15');
  });
});

describe('TS-4 — STAGED obligations table absent -> fail-soft inert, no crash', () => {
  it('table_absent return logs inert and exits 0 without throwing', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: false, reason: 'table_absent' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.summary.reason).toBe('table_absent');
  });
});

describe('TS-5 — QF-20260722-277: notBefore defers early-window enqueues to 6:00 AM ET (sleep-window safe)', () => {
  it('at window start (5:00 ET) notBefore is set to 6:00 AM ET the same day, deferring the actual send', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    await main(['node', 's', '--once'], baseDeps({ enqueue }));
    expect(enqueue.mock.calls[0][1].notBefore).toBe(et6amIso(SUMMER_WINDOW_START));
  });

  it('on a later in-window tick (10:45 ET) notBefore is already elapsed, so no extra delay is added', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-late' }));
    await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_WINDOW_LATE }));
    const notBefore = enqueue.mock.calls[0][1].notBefore;
    expect(notBefore).toBe(et6amIso(SUMMER_WINDOW_LATE));
    expect(new Date(notBefore).getTime()).toBeLessThan(SUMMER_WINDOW_LATE.getTime());
  });
});

describe('TS-6 — PII-free logging (no phone/body in logs)', () => {
  it('no log line emits the recipient phone or the raw body text', async () => {
    const PHONE = '+15555550123';
    const BODY = 'Roadmap: 40% build. Yesterday: 2 shipped.';
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await main(['node', 's', '--once'], baseDeps({ enqueue, logger, env: { CHAIRMAN_PHONE: PHONE } }));

    const logged = logger.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain(PHONE);
    expect(logged).not.toContain(BODY);
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

describe('body-build degradation is fail-soft', () => {
  it('a throwing buildBody falls back to a short status-unavailable body instead of crashing', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const buildBody = vi.fn(async () => { throw new Error('db down'); });
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, buildBody }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('enqueued');
  });
});
