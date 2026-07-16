/**
 * Unit tests for the durable governor-decision writer (fail-open).
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-4 / FR-5)
 */
import { describe, it, expect } from 'vitest';
import { normalizeGovernorRow, writeGovernorDecision } from '../../../lib/cost/governor-log.js';

/** Minimal in-memory supabase stub: captures the inserted row; optionally forces an error/throw. */
function makeStub({ error = null, throws = false } = {}) {
  const captured = { table: null, row: null };
  return {
    captured,
    from(table) {
      captured.table = table;
      return {
        insert(row) {
          if (throws) throw new Error('connection reset');
          captured.row = row;
          return Promise.resolve({ error });
        },
      };
    },
  };
}

describe('normalizeGovernorRow', () => {
  it('produces a well-formed row and defaults unknown enums safely', () => {
    const row = normalizeGovernorRow({
      decisionType: 'regen', action: 'throttle', targetKey: 'eva:artifact',
      mode: 'enforce', measured: { count: 25 }, reason: 'storm', thresholds: { maxPerWindow: 10 },
    });
    expect(row.decision_type).toBe('regen');
    expect(row.mode).toBe('enforce');
    expect(row.action).toBe('throttle');
    expect(row.target_key).toBe('eva:artifact');
    expect(row.measured).toEqual({ count: 25 });
  });

  it('coerces an invalid decision_type/mode to safe defaults', () => {
    const row = normalizeGovernorRow({ decisionType: 'bogus', mode: 'bogus' });
    expect(row.decision_type).toBe('anomaly');
    expect(row.mode).toBe('observe');
  });

  it('coerces non-object measured/thresholds to {} and truncates long reason', () => {
    const row = normalizeGovernorRow({ measured: 'x', thresholds: 5, reason: 'a'.repeat(5000) });
    expect(row.measured).toEqual({});
    expect(row.thresholds).toEqual({});
    expect(row.reason.length).toBe(2000);
  });
});

describe('writeGovernorDecision (fail-open)', () => {
  it('writes a well-formed row through the client', async () => {
    const stub = makeStub();
    const res = await writeGovernorDecision(stub, { decisionType: 'tier', action: 'hold', mode: 'observe' });
    expect(res.ok).toBe(true);
    expect(stub.captured.table).toBe('cost_governor_log');
    expect(stub.captured.row.decision_type).toBe('tier');
  });

  it('degrades to {ok:false} on a DB error — never throws', async () => {
    const stub = makeStub({ error: { message: 'permission denied' } });
    const res = await writeGovernorDecision(stub, { decisionType: 'regen', action: 'throttle' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/permission denied/);
  });

  it('degrades to {ok:false} when the client throws — never throws', async () => {
    const stub = makeStub({ throws: true });
    const res = await writeGovernorDecision(stub, { decisionType: 'anomaly', action: 'healthy' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/connection reset/);
  });

  it('fails open with no client (null)', async () => {
    const res = await writeGovernorDecision(null, { decisionType: 'tune', action: 'held' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no supabase/i);
  });
});
