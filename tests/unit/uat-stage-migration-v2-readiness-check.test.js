import { describe, it, expect, vi } from 'vitest';
import { runV2ReadinessCheck } from '../../lib/eva/uat-stage-migration/v2-readiness-check.mjs';

// SD-LEO-INFRA-STAGE-KEYED-DATA-001 FR-6: surfaces v2's own 24-27 parked-venture precondition
// via the same isolated-check convention as the pre-existing drift/quiescence/parked checks.
describe('runV2ReadinessCheck', () => {
  function stubClient(responses) {
    const query = vi.fn();
    for (const r of responses) query.mockResolvedValueOnce(r);
    return { query };
  }

  it('reports not applicable when v1 has not been applied yet (no dedicated_venture_uat row)', async () => {
    const client = stubClient([{ rows: [] }]);
    const result = await runV2ReadinessCheck(client);
    expect(result).toEqual({ v1Applied: false, applicable: false, blocked: false });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('checks the 24-27 range via the shared classification once v1 is applied', async () => {
    const client = stubClient([
      { rows: [{ '?column?': 1 }] }, // v1 applied
      { rows: [{ oid: null }] }, // fn_parked_venture_preflight not yet live -> JS fallback
      { rows: [] }, // fetchVenturesAtShiftedStages: zero ventures in range
    ]);
    const result = await runV2ReadinessCheck(client);
    expect(result.v1Applied).toBe(true);
    expect(result.applicable).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.total).toBe(0);
    const [, params] = client.query.mock.calls[2];
    expect(params).toEqual([24, 27]);
  });

  it('blocks when a real venture is found in the 24-27 range', async () => {
    const client = stubClient([
      { rows: [{ '?column?': 1 }] },
      { rows: [{ oid: null }] },
      { rows: [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 25 }] },
    ]);
    const result = await runV2ReadinessCheck(client);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
  });

  it('passes the override flag through', async () => {
    const client = stubClient([
      { rows: [{ '?column?': 1 }] },
      { rows: [{ oid: 999 }] }, // shared SQL function IS live
      { rows: [{ verdict: { total: 1, demo_count: 0, real_count: 1, real_venture_ids: ['real-1'], blocked: false } }] },
    ]);
    const result = await runV2ReadinessCheck(client, { override: true });
    expect(result.blocked).toBe(false);
    const [, params] = client.query.mock.calls[2];
    expect(params).toEqual([24, 27, true]);
  });
});
