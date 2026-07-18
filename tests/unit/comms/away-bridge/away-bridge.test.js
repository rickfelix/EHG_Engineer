import { describe, it, expect, vi } from 'vitest';
import { isAway, processOwedDecisions } from '../../../../lib/comms/adam-outbound/away-bridge/index.js';

const AWAY = { now: 1_000_000, lastInputAt: 0, awayThresholdMs: 900_000 };      // 1_000_000 > 900_000 => away
const PRESENT = { now: 1_000_000, lastInputAt: 999_000, awayThresholdMs: 900_000 }; // diff 1000 => present

function owedDecision(overrides = {}) {
  return { owedId: 'owed-1', message: { type: 'decision', body: 'Approve deploy? A/B' }, answered: false, resurfaceCount: 0, resurfacedThisWindow: false, ...overrides };
}
function makeStore(items) {
  return { getOwedDecisions: vi.fn(async () => items), markResurfaced: vi.fn(async () => {}) };
}

describe('away-bridge', () => {
  it('isAway derives from fleet-wide last-input time, not per-message latency', () => {
    expect(isAway(AWAY)).toBe(true);
    expect(isAway(PRESENT)).toBe(false);
    expect(isAway({})).toBe(false); // unknown presence => present (never text blindly)
  });

  it('TS-1: away + owed unanswered decision -> re-surfaced with "Still pending:"', async () => {
    const store = makeStore([owedDecision()]);
    const sender = vi.fn(async () => {});
    const res = await processOwedDecisions(AWAY, { owedStore: store, sender, escalateEmail: vi.fn() });
    expect(res[0].action).toBe('resurfaced');
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][0].body).toMatch(/^Still pending:/);
    expect(store.markResurfaced).toHaveBeenCalledWith('owed-1');
  });

  it('TS-2: present (recent fleet input) -> no re-surface even if unanswered', async () => {
    const store = makeStore([owedDecision()]);
    const sender = vi.fn();
    const res = await processOwedDecisions(PRESENT, { owedStore: store, sender, escalateEmail: vi.fn() });
    expect(res[0].action).toBe('skipped_present');
    expect(sender).not.toHaveBeenCalled();
  });

  it('TS-3: already re-surfaced this window -> idempotent, not re-surfaced again', async () => {
    const store = makeStore([owedDecision({ resurfacedThisWindow: true })]);
    const sender = vi.fn();
    const res = await processOwedDecisions(AWAY, { owedStore: store, sender, escalateEmail: vi.fn() });
    expect(res[0].action).toBe('skipped_idempotent');
    expect(sender).not.toHaveBeenCalled();
  });

  it('TS-4: K re-surfaces reached -> escalate to email, not another text', async () => {
    const store = makeStore([owedDecision({ resurfaceCount: 3 })]);
    const sender = vi.fn();
    const escalateEmail = vi.fn(async () => {});
    const res = await processOwedDecisions(AWAY, { owedStore: store, sender, escalateEmail, K: 3 });
    expect(res[0].action).toBe('escalated_email');
    expect(escalateEmail).toHaveBeenCalledTimes(1);
    expect(sender).not.toHaveBeenCalled();
  });

  it('TS-5: answered decision -> dropped, not re-surfaced', async () => {
    const store = makeStore([owedDecision({ answered: true })]);
    const sender = vi.fn();
    const res = await processOwedDecisions(AWAY, { owedStore: store, sender, escalateEmail: vi.fn() });
    expect(res[0].action).toBe('dropped_answered');
    expect(sender).not.toHaveBeenCalled();
  });

  it('TS-6: heartbeats never suppressed by presence — the owed set is decisions-only, so an empty set sends nothing even when away', async () => {
    const store = makeStore([]); // store contract: only owed DECISIONS; heartbeats excluded
    const sender = vi.fn();
    const res = await processOwedDecisions(AWAY, { owedStore: store, sender, escalateEmail: vi.fn() });
    expect(res).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
  });
});
