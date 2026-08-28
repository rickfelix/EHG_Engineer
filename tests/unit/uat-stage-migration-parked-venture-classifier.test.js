import { describe, it, expect, vi } from 'vitest';
import { classifyParkedVentures, SHIFTED_STAGE_RANGE, runParkedVentureClassification } from '../../lib/eva/uat-stage-migration/parked-venture-classifier.mjs';

// TS-6: pure-logic unit test -- a stubbed ventures row with is_demo=false at stage_number 24
// simulates a real venture parked at a shifted stage; no DB connection involved.
describe('classifyParkedVentures', () => {
  it('does not block when every venture at a shifted stage is a demo fixture', () => {
    const rows = [
      { id: 'a', is_demo: true, current_lifecycle_stage: 23 },
      { id: 'b', is_demo: true, current_lifecycle_stage: 24 },
    ];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(false);
    expect(result.realCount).toBe(0);
    expect(result.demoCount).toBe(2);
  });

  it('blocks apply when a REAL venture is found at a shifted stage', () => {
    const rows = [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 24 }];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
    expect(result.real[0].id).toBe('real-1');
  });

  it('allows an explicit override to proceed despite a real venture being present', () => {
    const rows = [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 24 }];
    const result = classifyParkedVentures(rows, SHIFTED_STAGE_RANGE, { override: true });
    expect(result.blocked).toBe(false);
    expect(result.realCount).toBe(1); // still reported, just not blocking
  });

  it('ignores ventures outside the shifted stage range', () => {
    const rows = [{ id: 'x', is_demo: false, current_lifecycle_stage: 10 }];
    const result = classifyParkedVentures(rows);
    expect(result.total).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('treats a missing/undefined is_demo as real (fail closed)', () => {
    const rows = [{ id: 'y', current_lifecycle_stage: 25 }];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
  });

  it('exposes the default SHIFTED_STAGE_RANGE as 23-26', () => {
    expect(SHIFTED_STAGE_RANGE).toEqual({ min: 23, max: 26 });
  });
});

// SD-LEO-INFRA-STAGE-KEYED-DATA-001 FR-5: runParkedVentureClassification prefers the shared
// fn_parked_venture_preflight() SQL function when it exists live, falling back to the pre-existing
// JS classification when it does not (e.g. before v2's chairman-gated migration is applied).
describe('runParkedVentureClassification', () => {
  function stubClient(responses) {
    const query = vi.fn();
    for (const r of responses) query.mockResolvedValueOnce(r);
    return { query };
  }

  it('uses the shared SQL function when to_regprocedure resolves it (post-v2-apply)', async () => {
    const client = stubClient([
      { rows: [{ oid: 12345 }] }, // to_regprocedure found the function
      { rows: [{ verdict: { total: 2, demo_count: 2, real_count: 0, real_venture_ids: [], blocked: false } }] },
    ]);
    const result = await runParkedVentureClassification(client);
    expect(result).toEqual({ total: 2, demoCount: 2, realCount: 0, real: [], blocked: false });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('falls back to the JS classification when the SQL function does not exist yet (pre-v2-apply)', async () => {
    const client = stubClient([
      { rows: [{ oid: null }] }, // to_regprocedure found nothing
      { rows: [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 24 }] }, // fetchVenturesAtShiftedStages
    ]);
    const result = await runParkedVentureClassification(client);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('passes the override flag through to the shared SQL function', async () => {
    const client = stubClient([
      { rows: [{ oid: 12345 }] },
      { rows: [{ verdict: { total: 1, demo_count: 0, real_count: 1, real_venture_ids: ['real-1'], blocked: false } }] },
    ]);
    await runParkedVentureClassification(client, { override: true });
    const [, params] = client.query.mock.calls[1];
    expect(params).toEqual([23, 26, true]);
  });
});
