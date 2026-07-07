/**
 * lib/fleet/door-routing-ledger.cjs's FR-5 extension (r_criterion, funnel_position) —
 * SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { writeDoorRoutingLedger, funnelPositionForPhase } = require('../../../lib/fleet/door-routing-ledger.cjs');

describe('funnelPositionForPhase', () => {
  it('LEAD-family phases map to selection', () => {
    expect(funnelPositionForPhase('LEAD')).toBe('selection');
    expect(funnelPositionForPhase('LEAD_APPROVAL')).toBe('selection');
  });
  it('PLAN-family phases map to design', () => {
    expect(funnelPositionForPhase('PLAN_PRD')).toBe('design');
  });
  it('any other non-empty phase maps to detailing', () => {
    expect(funnelPositionForPhase('EXEC')).toBe('detailing');
    expect(funnelPositionForPhase('PLAN_VERIFICATION'.replace('PLAN_VERIFICATION', 'VERIFY'))).toBe('detailing');
  });
  it('an empty/missing phase returns null rather than a guessed value', () => {
    expect(funnelPositionForPhase(null)).toBeNull();
    expect(funnelPositionForPhase(undefined)).toBeNull();
    expect(funnelPositionForPhase('')).toBeNull();
  });
});

describe('writeDoorRoutingLedger — FR-5 additive columns', () => {
  const prevFlag = process.env.DOOR_ROUTING_ENABLED;
  beforeEach(() => { process.env.DOOR_ROUTING_ENABLED = 'true'; });
  afterEach(() => { if (prevFlag === undefined) delete process.env.DOOR_ROUTING_ENABLED; else process.env.DOOR_ROUTING_ENABLED = prevFlag; });

  it('passes r_criterion and funnel_position through to the inserted row when flag is on', async () => {
    let inserted = null;
    const sb = { from: () => ({ insert: (row) => { inserted = row; return Promise.resolve({ error: null }); } }) };
    const result = await writeDoorRoutingLedger(sb, { work_key: 'SD-X-001', door: 'two_way', r_criterion: 'R3', funnel_position: 'design' });
    expect(result.written).toBe(true);
    expect(inserted.r_criterion).toBe('R3');
    expect(inserted.funnel_position).toBe('design');
  });

  it('defaults r_criterion/funnel_position to null when absent (byte-identical to pre-FR-5 callers)', async () => {
    let inserted = null;
    const sb = { from: () => ({ insert: (row) => { inserted = row; return Promise.resolve({ error: null }); } }) };
    await writeDoorRoutingLedger(sb, { work_key: 'SD-X-002', door: 'one_way' });
    expect(inserted.r_criterion).toBeNull();
    expect(inserted.funnel_position).toBeNull();
  });

  it('is a no-op when DOOR_ROUTING_ENABLED is off, regardless of the new fields', async () => {
    process.env.DOOR_ROUTING_ENABLED = 'false';
    const sb = { from: () => { throw new Error('should not be called'); } };
    const result = await writeDoorRoutingLedger(sb, { work_key: 'SD-X-003', door: 'two_way', r_criterion: 'R2', funnel_position: 'selection' });
    expect(result).toEqual({ written: false, error: null });
  });
});
