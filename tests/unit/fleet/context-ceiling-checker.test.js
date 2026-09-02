/**
 * SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001 -- unit tests for
 * lib/fleet/context-ceiling-checker.cjs. Everything (usage-row reader, compact-skill
 * invoker, ceiling-event writer) is dependency-injected -- no real DB, no real compaction.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { checkContextCeiling, isEnforcementEnabled, DEFAULT_FRESHNESS_WINDOW_MS } = require('../../../lib/fleet/context-ceiling-checker.cjs');

const ENFORCE_ENV = { COORD_CONTEXT_CEILING_ENFORCE_V1: 'on' };

function freshRow(usage_percent) {
  return { usage_percent, created_at: new Date().toISOString() };
}

describe('isEnforcementEnabled', () => {
  it('is OFF by default (no env var)', () => {
    expect(isEnforcementEnabled({})).toBe(false);
  });

  it('is ON only for truthy values', () => {
    expect(isEnforcementEnabled({ COORD_CONTEXT_CEILING_ENFORCE_V1: 'on' })).toBe(true);
    expect(isEnforcementEnabled({ COORD_CONTEXT_CEILING_ENFORCE_V1: '1' })).toBe(true);
    expect(isEnforcementEnabled({ COORD_CONTEXT_CEILING_ENFORCE_V1: 'false' })).toBe(false);
    expect(isEnforcementEnabled({ COORD_CONTEXT_CEILING_ENFORCE_V1: '0' })).toBe(false);
  });
});

describe('checkContextCeiling -- DISABLED (default OFF)', () => {
  it('never reads or acts when the enforcement flag is off', async () => {
    const readLatestUsageRow = vi.fn(async () => freshRow(99));
    const invokeCompactSkill = vi.fn(async () => {});
    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: {},
      deps: { readLatestUsageRow, invokeCompactSkill },
    });
    expect(result.verdict).toBe('DISABLED');
    expect(readLatestUsageRow).not.toHaveBeenCalled();
    expect(invokeCompactSkill).not.toHaveBeenCalled();
  });
});

describe('checkContextCeiling -- TS-1: a seat over its ceiling', () => {
  it('emits the HARD line, invokes compact, and persists a before/after ceiling event', async () => {
    const readLatestUsageRow = vi.fn()
      .mockResolvedValueOnce(freshRow(96)) // before
      .mockResolvedValueOnce(freshRow(20)); // after (post-compact)
    const invokeCompactSkill = vi.fn(async () => {});
    const persistCeilingEvent = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill, persistCeilingEvent },
    });

    expect(result.verdict).toBe('CEILING');
    expect(result.before_percent).toBe(96);
    expect(result.after_percent).toBe(20);
    expect(invokeCompactSkill).toHaveBeenCalledTimes(1);
    expect(persistCeilingEvent).toHaveBeenCalledTimes(1);
    expect(persistCeilingEvent.mock.calls[0][0]).toMatchObject({ before_percent: 96, after_percent: 20, role: 'coordinator' });
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('QUIET_TICK_CONTEXT_CEILING'))).toBe(true);

    logSpy.mockRestore();
  });
});

describe('checkContextCeiling -- coordinator ruling 04cf607d: same-turn = calling seat acts on the printed line', () => {
  it('QUIET_TICK_CONTEXT_CEILING is emitted EXACTLY ONCE per crossing, and is grep-distinct from any other log line', async () => {
    const readLatestUsageRow = vi.fn()
      .mockResolvedValueOnce(freshRow(96))
      .mockResolvedValueOnce(freshRow(20));
    const invokeCompactSkill = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill },
    });

    // Exactly once: a calling seat's own turn must see this line a single time per crossing --
    // a duplicate would be ambiguous about whether one compaction or two was requested.
    const ceilingLines = logSpy.mock.calls.filter((c) => String(c[0]).includes('QUIET_TICK_CONTEXT_CEILING'));
    expect(ceilingLines).toHaveLength(1);

    // Grep-distinct: the exact token QUIET_TICK_CONTEXT_CEILING must not collide with a
    // same-prefix-but-different token (e.g. a hypothetical *_ENFORCED variant) elsewhere in the
    // same output -- a grep for the bare token must match this line and only this line.
    const wholeOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const matches = wholeOutput.match(/QUIET_TICK_CONTEXT_CEILING\b/g) || [];
    expect(matches).toHaveLength(1);

    logSpy.mockRestore();
  });
});

describe('checkContextCeiling -- TS-2: a seat under its ceiling stays silent', () => {
  it('emits nothing and never invokes the compact skill', async () => {
    const readLatestUsageRow = vi.fn(async () => freshRow(40));
    const invokeCompactSkill = vi.fn(async () => {});
    const persistCeilingEvent = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill, persistCeilingEvent },
    });

    expect(result.verdict).toBe('HEALTHY');
    expect(invokeCompactSkill).not.toHaveBeenCalled();
    expect(persistCeilingEvent).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('QUIET_TICK_CONTEXT_CEILING'))).toBe(false);

    logSpy.mockRestore();
  });

  it('a worker/global role only crosses at the higher GLOBAL threshold, not the coordinator one', async () => {
    // 90 is >= COORDINATOR_THRESHOLDS.critical (85) but < GLOBAL_THRESHOLDS.critical (93).
    const readLatestUsageRow = vi.fn(async () => freshRow(90));
    const invokeCompactSkill = vi.fn(async () => {});
    const result = await checkContextCeiling({
      role: 'worker',
      sessionId: 's-2',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill },
    });
    expect(result.verdict).toBe('HEALTHY');
    expect(invokeCompactSkill).not.toHaveBeenCalled();
  });
});

describe('checkContextCeiling -- TS-4: stale row never produces a false verdict', () => {
  it('a row older than the freshness window returns UNKNOWN, not HEALTHY or CEILING', async () => {
    const staleRow = { usage_percent: 99, created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() };
    const readLatestUsageRow = vi.fn(async () => staleRow);
    const invokeCompactSkill = vi.fn(async () => {});

    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill },
    });

    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toBe('stale');
    expect(invokeCompactSkill).not.toHaveBeenCalled();
  });

  it('no row at all returns UNKNOWN with reason no_row', async () => {
    const readLatestUsageRow = vi.fn(async () => null);
    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow },
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toBe('no_row');
  });

  it('respects a custom freshnessWindowMs override', async () => {
    const row = { usage_percent: 99, created_at: new Date(Date.now() - 2000).toISOString() };
    const readLatestUsageRow = vi.fn(async () => row);
    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow },
      freshnessWindowMs: 1000, // 2s-old row exceeds a 1s window
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toBe('stale');
  });
});

describe('checkContextCeiling -- error handling', () => {
  it('never throws even when deps.readLatestUsageRow throws', async () => {
    const readLatestUsageRow = vi.fn(async () => { throw new Error('db unavailable'); });
    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow },
    });
    expect(result.verdict).toBe('ERROR');
    expect(result.reason).toBe('db unavailable');
  });

  it('a failed compact invocation is recorded on the event but does not prevent persistence', async () => {
    const readLatestUsageRow = vi.fn()
      .mockResolvedValueOnce(freshRow(96))
      .mockResolvedValueOnce(freshRow(96));
    const invokeCompactSkill = vi.fn(async () => { throw new Error('skill unavailable'); });
    const persistCeilingEvent = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await checkContextCeiling({
      role: 'coordinator',
      sessionId: 's-1',
      env: ENFORCE_ENV,
      deps: { readLatestUsageRow, invokeCompactSkill, persistCeilingEvent },
    });

    expect(result.verdict).toBe('CEILING');
    expect(result.compact_error).toBe('skill unavailable');
    expect(persistCeilingEvent).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it('missing deps.readLatestUsageRow returns ERROR rather than throwing', async () => {
    const result = await checkContextCeiling({ role: 'coordinator', sessionId: 's-1', env: ENFORCE_ENV, deps: {} });
    expect(result.verdict).toBe('ERROR');
  });
});

describe('DEFAULT_FRESHNESS_WINDOW_MS', () => {
  it('is 15 minutes', () => {
    expect(DEFAULT_FRESHNESS_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
