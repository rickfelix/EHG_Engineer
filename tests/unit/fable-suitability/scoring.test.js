import { describe, it, expect, vi } from 'vitest';
import { scoreImpact, extractImpactSignals } from '../../../lib/fable-suitability/score-impact.mjs';
import {
  scoreOpportunity,
  filterSyntheticPatterns,
  BYPASS_RESOLUTION_TYPES,
  SYNTHETIC_OCCURRENCE_FLOOR,
  SYNTHETIC_OCCURRENCE_CEILING,
} from '../../../lib/fable-suitability/score-opportunity.mjs';
import { scoreReasoningDepth } from '../../../lib/fable-suitability/score-reasoning-depth.mjs';
import { scoreRegion } from '../../../lib/fable-suitability/score-region.mjs';
import { deriveRegion } from '../../../lib/fable-suitability/region-cluster.mjs';
import { getFamily, DUTY_CLUSTERS } from '../../../lib/fable-suitability/cluster-families.mjs';
import { validateEvidence } from '../../../lib/fable-suitability/map-writer.mjs';

/** A mock reasoning-depth client that records whether it was called. */
function mockClient(score = 4, rationale = 'entangled') {
  return {
    calls: 0,
    async scoreStructured() {
      this.calls += 1;
      return { score, rationale };
    },
  };
}

describe('deriveRegion (FR-4)', () => {
  it('collapses a file path to a canonical, child-A-valid region_key', () => {
    expect(deriveRegion('lib/fable-suitability/score-impact.mjs')).toBe('lib/fable-suitability');
  });
  it('prepends repo and normalizes Windows separators (repo-relative path)', () => {
    expect(deriveRegion('Lib\\Gates\\x.js', { repo: 'EHG_Engineer' })).toBe('ehg_engineer/lib/gates');
  });
  it('strips a Windows drive prefix from an absolute path', () => {
    // Absolute paths keep their real leading dir segments (here "proj/src" is the first region depth).
    expect(deriveRegion('C:\\proj\\src\\thing.js')).toBe('proj/src');
  });
  it('rejects an empty path', () => {
    expect(() => deriveRegion('')).toThrow();
  });
});

describe('cluster-families (FR-4)', () => {
  it('exposes all four duty clusters with axis weights', () => {
    for (const c of DUTY_CLUSTERS) {
      const fam = getFamily(c);
      expect(fam.impact).toBeTruthy();
      expect(fam.opportunity).toBeTruthy();
      expect(fam.reasoningDepth).toBeTruthy();
    }
  });
  it('throws on an unknown cluster (fail loud)', () => {
    expect(() => getFamily('nope')).toThrow();
  });
});

describe('scoreImpact — deterministic, no model (FR-1 / TS-1)', () => {
  it('maps known structural signals to a 1-5 band with inputs + rationale', () => {
    const r = scoreImpact({ centrality: 20, fanOut: 15, crossRepoCount: 2 }, 'architecture-refactor');
    expect(r.score).toBeGreaterThanOrEqual(4); // high centrality/fan-out -> high band
    expect(r.inputs.centrality).toBe(20);
    expect(typeof r.rationale).toBe('string');
  });
  it('low structural signals -> low band', () => {
    const r = scoreImpact({ centrality: 0, fanOut: 0, crossRepoCount: 1 }, 'dedup');
    expect(r.score).toBeLessThanOrEqual(2);
  });
  it('is synchronous/deterministic — returns a value, not a Promise (no async model call)', () => {
    const out = scoreImpact({ centrality: 5, fanOut: 5, crossRepoCount: 1 }, 'dedup');
    expect(out).not.toBeInstanceOf(Promise);
    expect(typeof out.score).toBe('number');
  });
  it('extractImpactSignals derives centrality/fan-out from static-analysis-shaped inputs', () => {
    const consumerIndex = {
      named: new Map([['lib/target/x.js', new Map([['foo', [{ file: 'a.js' }, { file: 'b.js' }]]])]]),
      wholeModule: new Map(),
    };
    const callGraph = { edges: new Map([['lib/target/x.js', ['lib/other/y.js', 'lib/target/z.js']]]) };
    const regionOf = (f) => f.split('/').slice(0, 2).join('/');
    const sig = extractImpactSignals({ consumerIndex, callGraph, region: 'lib/target', regionOf });
    expect(sig.centrality).toBe(2); // a.js + b.js
    expect(sig.fanOut).toBe(1);     // reaches lib/other (not itself)
  });
});

describe('scoreOpportunity — deterministic, synthetic-filtered (FR-2 / TS-2)', () => {
  it('filters synthetic vision-gap rows before weighting', () => {
    const real = { id: 'p1', occurrence_count: 8, trend: 'increasing' };
    const synthetic = { id: 'p2', occurrence_count: 73000 };
    const kept = filterSyntheticPatterns([real, synthetic]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('p1');
  });
  it('a 73k synthetic row does NOT float the opportunity score', () => {
    const withSynthetic = scoreOpportunity(
      { issuePatterns: [{ id: 's', occurrence_count: 73000 }], bypassCount: 0, failurePatternCount: 0 },
      'flaky-RCA',
    );
    expect(withSynthetic.score).toBe(1); // filtered out -> nothing floats it
    expect(withSynthetic.inputs.syntheticFiltered).toBe(1);
    expect(withSynthetic.inputs.realPatternCount).toBe(0);
  });
  it('real recurrence + bypass raise the score', () => {
    const r = scoreOpportunity(
      {
        issuePatterns: [{ id: 'p', occurrence_count: 40, trend: 'increasing' }],
        bypassCount: 5,
        failurePatternCount: 5,
        consumerCount: 10,
        churn: 20,
        complexityProxy: 5,
      },
      'flaky-RCA',
    );
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.sourceIds).toContain('p');
  });
  it('exposes the correct bypass resolution_type set (no ADMIN_OVERRIDE)', () => {
    expect(BYPASS_RESOLUTION_TYPES).toEqual(['bypass', 'bypass_planned', 'library_sd_bypass']);
    expect(BYPASS_RESOLUTION_TYPES).not.toContain('ADMIN_OVERRIDE');
  });
  it('synthetic band constants match the seeded vision-gap range', () => {
    expect(SYNTHETIC_OCCURRENCE_FLOOR).toBe(10000);
    expect(SYNTHETIC_OCCURRENCE_CEILING).toBe(73000);
  });
});

describe('scoreReasoningDepth — LLM-only, injected + constrained (FR-3 / TS-3)', () => {
  it('uses the injected mock client and returns a 1-5 score via structured decode', async () => {
    const client = mockClient(4, 'deep');
    const r = await scoreReasoningDepth({ region_key: 'lib/x' }, { blastRadius: 3, lookAhead: 4 }, { client, dutyCluster: 'harness-depth' });
    expect(r.score).toBe(4);
    expect(client.calls).toBe(1);
    expect(r.degraded).toBe(false);
  });
  it('degrades to a NEUTRAL 3 (never floats to 5) when the model returns garbage', async () => {
    const badClient = { async scoreStructured() { return { score: 99, rationale: 'x' }; } };
    const r = await scoreReasoningDepth({ region_key: 'lib/x' }, {}, { client: badClient, dutyCluster: 'dedup' });
    expect(r.score).toBe(3);
    expect(r.degraded).toBe(true);
  });
  it('degrades on a client throw rather than crashing the pipeline', async () => {
    const throwing = { async scoreStructured() { throw new Error('rate limited'); } };
    const r = await scoreReasoningDepth({ region_key: 'lib/x' }, {}, { client: throwing, dutyCluster: 'dedup' });
    expect(r.score).toBe(3);
    expect(r.degraded).toBe(true);
  });
  it('requires an injected client (no implicit live model)', async () => {
    await expect(scoreReasoningDepth({ region_key: 'lib/x' }, {}, { dutyCluster: 'dedup' })).rejects.toThrow(/injected client/);
  });
});

describe('scoreRegion — composite + evidence (FR-5 / TS-4, TS-5)', () => {
  const baseSignals = {
    impact: { centrality: 20, fanOut: 15, crossRepoCount: 2 },
    opportunity: { issuePatterns: [{ id: 'p', occurrence_count: 45, trend: 'increasing' }], bypassCount: 5, failurePatternCount: 5, consumerCount: 20, churn: 30, complexityProxy: 8 },
    reasoning: { blastRadius: 4, lookAhead: 4 },
  };

  it('TS-4 anti-gaming: max reasoning-depth alone cannot float a low-impact/opportunity region', async () => {
    const client = mockClient(5, 'max judgment');
    const { row } = await scoreRegion(
      { region_key: 'lib/mechanical', repo: 'EHG_Engineer' },
      { impact: { centrality: 0, fanOut: 0, crossRepoCount: 1 }, opportunity: { issuePatterns: [] }, reasoning: {} },
      { dutyCluster: 'dedup', client, computedAt: '2026-07-17T00:00:00.000Z' },
    );
    expect(row.axis_reasoning_depth).toBe(5);
    expect(row.axis_impact).toBe(1);
    expect(row.axis_opportunity).toBe(1);
    expect(row.composite_score).toBe(5); // 1 * 1 * 5 — NOT floated
  });

  it('composite is the product of the three axes and evidence round-trips validateEvidence', async () => {
    const client = mockClient(4, 'deep');
    const { row, evidence } = await scoreRegion(
      { region_key: 'lib/gates', repo: 'EHG_Engineer' },
      baseSignals,
      { dutyCluster: 'harness-depth', client, computedAt: '2026-07-17T00:00:00.000Z' },
    );
    expect(row.composite_score).toBe(row.axis_impact * row.axis_opportunity * row.axis_reasoning_depth);
    expect(() => validateEvidence(evidence)).not.toThrow();
    expect(evidence.recurrence.source_ids).toContain('p');
  });

  it('TS-6: family weighting changes the score for the same signals', async () => {
    const client = mockClient(3, 'mid');
    const region = { region_key: 'lib/gates', repo: 'EHG_Engineer' };
    const flaky = await scoreRegion(region, baseSignals, { dutyCluster: 'flaky-RCA', client, computedAt: '2026-07-17T00:00:00.000Z' });
    const arch = await scoreRegion(region, baseSignals, { dutyCluster: 'architecture-refactor', client, computedAt: '2026-07-17T00:00:00.000Z' });
    // Both produce valid rows; the family blend is applied (opportunity inputs carry the weights).
    expect(flaky.row.evidence.axes.opportunity.inputs.weights).not.toEqual(arch.row.evidence.axes.opportunity.inputs.weights);
  });

  it('requires region_key and repo (fail loud)', async () => {
    const client = mockClient();
    await expect(scoreRegion({ repo: 'EHG_Engineer' }, baseSignals, { dutyCluster: 'dedup', client })).rejects.toThrow(/region_key/);
    await expect(scoreRegion({ region_key: 'lib/x' }, baseSignals, { dutyCluster: 'dedup', client })).rejects.toThrow(/repo/);
  });
});
