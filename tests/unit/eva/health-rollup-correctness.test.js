/**
 * Health-rollup correctness — FR-2 + FR-3 unit tests
 * SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001
 */
import { describe, it, expect } from 'vitest';
import { gateDecisionToHealth } from '../../../lib/eva/chairman-decision-watcher.js';
import { summarizeVenture } from '../../../lib/adam/briefings/venture.js';

describe('FR-2 gateDecisionToHealth — held-venture health from the gate verdict', () => {
  it('numeric pass -> green (a HOLD on a PASS is not RED)', () => {
    expect(gateDecisionToHealth('pass')).toBe('green');
  });
  it('conditional_pass -> yellow', () => {
    expect(gateDecisionToHealth('conditional_pass')).toBe('yellow');
  });
  it('a genuine fail / unknown -> null (fall back to normal advisory resolution)', () => {
    expect(gateDecisionToHealth('fail')).toBeNull();
    expect(gateDecisionToHealth('kill')).toBeNull();
    expect(gateDecisionToHealth(undefined)).toBeNull();
  });
});

describe('FR-3 summarizeVenture — ignores phantom future-stage rows', () => {
  const ventureId = 'v-1';

  it('excludes rows with lifecycle_stage > currentStage from the rollup', () => {
    const stageWork = [
      { lifecycle_stage: 5, stage_status: 'completed', health_score: 'green' },
      { lifecycle_stage: 20, stage_status: 'completed', health_score: 'red' }, // phantom (venture held@5)
      { lifecycle_stage: 21, stage_status: 'blocked', health_score: 'red' },   // phantom
    ];
    const out = summarizeVenture({ ventureId, stageWork, currentStage: 5 });
    expect(out.signals.stage_work_rows).toBe(1); // only the in-range S5 row
    expect(out.signals.blocked_or_red).toBe(0);  // phantom red rows excluded
  });

  it('counts a real in-range red row', () => {
    const stageWork = [{ lifecycle_stage: 5, stage_status: 'completed', health_score: 'red' }];
    const out = summarizeVenture({ ventureId, stageWork, currentStage: 5 });
    expect(out.signals.blocked_or_red).toBe(1);
  });

  it('keeps rows without a lifecycle_stage (defensive)', () => {
    const stageWork = [{ stage_status: 'blocked', health_score: 'red' }];
    const out = summarizeVenture({ ventureId, stageWork, currentStage: 5 });
    expect(out.signals.blocked_or_red).toBe(1);
  });

  it('no filtering when currentStage is null (back-compat)', () => {
    const stageWork = [
      { lifecycle_stage: 5, health_score: 'green' },
      { lifecycle_stage: 20, health_score: 'red' },
    ];
    const out = summarizeVenture({ ventureId, stageWork });
    expect(out.signals.stage_work_rows).toBe(2);
    expect(out.signals.blocked_or_red).toBe(1);
  });
});
