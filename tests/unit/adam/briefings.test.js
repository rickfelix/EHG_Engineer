/**
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 — per-scope briefing summarizers
 * (pure, DB-free).
 */
import { describe, it, expect } from 'vitest';
import { summarizeHarness } from '../../../lib/adam/briefings/harness.js';
import { summarizePlatform } from '../../../lib/adam/briefings/platform.js';
import { summarizeVenture } from '../../../lib/adam/briefings/venture.js';

describe('summarizeHarness', () => {
  it('counts signals and surfaces no fabricated candidate', () => {
    const r = summarizeHarness({ backlog: [1, 2], retros: [1], gateRecs: [1, 2, 3], evaRecs: [] });
    expect(r.scope_key).toBe('harness');
    expect(r.signals).toMatchObject({ open_harness_backlog: 2, recent_retros: 1, gate_tuning_recs: 3, pending_eva_recs: 0 });
    expect(r.candidates).toEqual([]);
  });
  it('treats empty inputs as no signal, not an error', () => {
    const r = summarizeHarness();
    expect(r.signals.open_harness_backlog).toBe(0);
  });
  it('accepts an exact count number for backlog (QF-20260720-887 cap-safe count path)', () => {
    // briefHarness now passes a head:true count:'exact' total (a number) instead of a
    // capped rows array, so a value beyond the old 1000-row cap is reported faithfully.
    expect(summarizeHarness({ backlog: 1500 }).signals.open_harness_backlog).toBe(1500);
    expect(summarizeHarness({ backlog: 0 }).signals.open_harness_backlog).toBe(0);
  });
});

describe('summarizePlatform', () => {
  it('clusters gate failures by stage and reports the liveness guard', () => {
    const r = summarizePlatform({
      stages: new Array(26).fill({}),
      gateFailures: [{ stage_number: 16 }, { stage_number: 16 }, { stage_number: 19 }],
      blockedWork: [{ lifecycle_stage: 16 }],
      liveVentureCount: 2,
    });
    expect(r.signals.ssot_stage_count).toBe(26);
    expect(r.signals.failure_clusters).toEqual({ stage_16: 2, stage_19: 1 });
    expect(r.liveness.allowed).toBe(false); // 2 < K=3
    expect(r.candidates).toEqual([]);
  });
});

describe('summarizeVenture', () => {
  it('surfaces data-gap proposals when telemetry is dry (never fabricates a KR)', () => {
    const r = summarizeVenture({ ventureId: 'V1', competitors: [], stageWork: [], separability: [], visionDocs: [] });
    expect(r.scope_key).toBe('venture:V1');
    expect(r.candidates).toEqual([]);
    const areas = r.gaps.map((g) => g.area);
    expect(areas).toContain('competitive_intel');
    expect(areas).toContain('l2_vision');
  });

  it('reports an L2 vision as present and counts blocked/red stage work', () => {
    const r = summarizeVenture({
      ventureId: 'V2',
      competitors: [{ id: 'c1' }],
      stageWork: [{ stage_status: 'blocked' }, { health_score: 'red' }, { stage_status: 'completed', health_score: 'green' }],
      separability: [{ overall_score: 80 }],
      visionDocs: [{ level: 'L2', chairman_approved: true }],
    });
    expect(r.signals.l2_vision_present).toBe(true);
    expect(r.signals.blocked_or_red).toBe(2);
    expect(r.gaps.map((g) => g.area)).not.toContain('l2_vision');
  });
});
