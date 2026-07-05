/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B: gate inventory extraction (pure, no DB).
 */

import { describe, it, expect } from 'vitest';
import { buildInventory } from '../../../scripts/eva/gate-inventory-extract.mjs';

describe('gate-inventory-extract.mjs', () => {
  it('extracts a substantial, non-trivial gate inventory (set-difference discipline)', () => {
    const { inventory } = buildInventory();
    const distinctIds = new Set(inventory.map(g => g.gate_id));
    // Real count as of this SD: 125 distinct gate_ids across the 5 handoff executors + shared gates.
    // Assert a floor, not an exact number, so legitimate future gate additions don't break this test.
    expect(distinctIds.size).toBeGreaterThanOrEqual(100);
  });

  it('covers all 5 handoff types plus shared gates', () => {
    const { inventory } = buildInventory();
    const handoffTypes = new Set(inventory.map(g => g.handoff_type));
    expect(handoffTypes.has('LEAD-TO-PLAN')).toBe(true);
    expect(handoffTypes.has('PLAN-TO-EXEC')).toBe(true);
    expect(handoffTypes.has('EXEC-TO-PLAN')).toBe(true);
    expect(handoffTypes.has('PLAN-TO-LEAD')).toBe(true);
    expect(handoffTypes.has('LEAD-FINAL-APPROVAL')).toBe(true);
  });

  it('captures PR_PRECHECK and PR_MERGE_VERIFICATION from the flat lead-final-approval/gates.js file', () => {
    const { inventory } = buildInventory();
    const ids = new Set(inventory.map(g => g.gate_id));
    expect(ids.has('PR_PRECHECK')).toBe(true);
    expect(ids.has('PR_MERGE_VERIFICATION')).toBe(true);
  });

  it('every extracted gate has a non-empty gate_id and source_file', () => {
    const { inventory } = buildInventory();
    for (const g of inventory) {
      expect(typeof g.gate_id).toBe('string');
      expect(g.gate_id.length).toBeGreaterThan(0);
      expect(typeof g.source_file).toBe('string');
      expect(g.source_file.length).toBeGreaterThan(0);
    }
  });
});
