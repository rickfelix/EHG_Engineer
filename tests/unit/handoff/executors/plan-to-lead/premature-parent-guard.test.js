// SD-REFILL-001YZJNQ — premature-parent guard. A parent orchestrator auto-completed when all its
// CREATED children finished, but the program plan declared MORE children (waves) never authored as
// SD rows (witnessed SD-LEO-ORCH-ADAM-PLAN-KEEPER-001). evaluatePlannedDecomposition decides whether
// an all-created-children-complete parent should still WAIT. It is CONSERVATIVE: wait=true ONLY on an
// explicit planned-children signal exceeding the created count AND decomposition not marked complete
// — so parents without a planned signal behave exactly as before (no regression).
import { describe, it, expect } from 'vitest';
import { evaluatePlannedDecomposition } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js';

describe('evaluatePlannedDecomposition (SD-REFILL-001YZJNQ premature-parent guard)', () => {
  it('WAITs when planned_children_count exceeds the created count', () => {
    const r = evaluatePlannedDecomposition({ parentMetadata: { planned_children_count: 14 }, createdChildCount: 6 });
    expect(r.wait).toBe(true);
    expect(r.plannedCount).toBe(14);
    expect(r.createdCount).toBe(6);
    expect(r.reason).toMatch(/8 planned child/);
  });

  it('does NOT wait when created >= planned', () => {
    expect(evaluatePlannedDecomposition({ parentMetadata: { planned_children_count: 6 }, createdChildCount: 6 }).wait).toBe(false);
    expect(evaluatePlannedDecomposition({ parentMetadata: { planned_children_count: 4 }, createdChildCount: 6 }).wait).toBe(false);
  });

  it('decomposition_complete=true short-circuits to NO wait even if planned > created', () => {
    const r = evaluatePlannedDecomposition({ parentMetadata: { decomposition_complete: true, planned_children_count: 14 }, createdChildCount: 6 });
    expect(r.wait).toBe(false);
    expect(r.reason).toMatch(/decomposition_complete/);
  });

  it('REGRESSION-FREE: no planned signal at all → no wait (behaves as today)', () => {
    expect(evaluatePlannedDecomposition({ parentMetadata: {}, createdChildCount: 6 }).wait).toBe(false);
    expect(evaluatePlannedDecomposition({ parentMetadata: undefined, createdChildCount: 6 }).wait).toBe(false);
    expect(evaluatePlannedDecomposition({ parentMetadata: { plan_content: 'free-form prose with 4 waves' }, createdChildCount: 6 }).wait).toBe(false); // text not parsed
  });

  it('accepts a planned_children array length as the signal', () => {
    const r = evaluatePlannedDecomposition({ parentMetadata: { planned_children: new Array(9).fill({}) }, createdChildCount: 3 });
    expect(r.wait).toBe(true);
    expect(r.plannedCount).toBe(9);
  });

  it('accepts a structured plan_content.planned_children_count', () => {
    const r = evaluatePlannedDecomposition({ parentMetadata: { plan_content: { planned_children_count: 10 } }, createdChildCount: 2 });
    expect(r.wait).toBe(true);
    expect(r.plannedCount).toBe(10);
  });

  it('is total on odd input', () => {
    expect(evaluatePlannedDecomposition().wait).toBe(false);
    expect(evaluatePlannedDecomposition({ parentMetadata: 42, createdChildCount: NaN }).wait).toBe(false);
    expect(evaluatePlannedDecomposition({ parentMetadata: { planned_children_count: 5 } }).createdCount).toBe(0);
  });

  it('precedence: explicit count wins over array, array over plan_content', () => {
    const r = evaluatePlannedDecomposition({ parentMetadata: { planned_children_count: 12, planned_children: [{}], plan_content: { planned_children_count: 3 } }, createdChildCount: 1 });
    expect(r.plannedCount).toBe(12);
  });
});
