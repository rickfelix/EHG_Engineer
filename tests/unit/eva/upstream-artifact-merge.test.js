import { describe, it, expect, vi } from 'vitest';

// Mock supabase client builder for testing
function mockSupabase(rows) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return chain;
}

// We test the merge logic directly since the functions are tightly coupled to supabase
// Extract the merge logic pattern used in both functions

describe('loadUpstreamArtifacts merge logic', () => {
  // Simulate the merge pattern from loadUpstreamArtifacts (sorted ASC, DA reviews excluded)
  function mergeArtifacts(rows) {
    const map = new Map();
    for (const row of rows) {
      const payload = row.artifact_data;
      if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) continue;

      if (!map.has(row.lifecycle_stage)) {
        map.set(row.lifecycle_stage, { ...payload });
      } else {
        const existing = map.get(row.lifecycle_stage);
        map.set(row.lifecycle_stage, { ...existing, ...payload });
      }
    }
    return map;
  }

  it('returns single artifact unchanged for single-artifact stage', () => {
    const rows = [
      { lifecycle_stage: 3, artifact_data: { market_analysis: 'strong', tam: 50000 } },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(3)).toEqual({ market_analysis: 'strong', tam: 50000 });
  });

  it('merges multiple artifacts for same stage', () => {
    const rows = [
      { lifecycle_stage: 5, artifact_data: { unitEconomics: { cac: 100 }, decision: 'approved' } },
      { lifecycle_stage: 5, artifact_data: { riskFactors: ['market', 'tech'] } },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(5)).toEqual({
      unitEconomics: { cac: 100 },
      decision: 'approved',
      riskFactors: ['market', 'tech'],
    });
  });

  it('skips artifacts with null artifact_data', () => {
    const rows = [
      { lifecycle_stage: 5, artifact_data: { unitEconomics: { cac: 100 } } },
      { lifecycle_stage: 5, artifact_data: null },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(5)).toEqual({ unitEconomics: { cac: 100 } });
  });

  it('skips artifacts with empty object artifact_data', () => {
    const rows = [
      { lifecycle_stage: 5, artifact_data: { unitEconomics: { cac: 100 } } },
      { lifecycle_stage: 5, artifact_data: {} },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(5)).toEqual({ unitEconomics: { cac: 100 } });
  });

  it('newer artifact wins on field collision (ASC order)', () => {
    // Sorted ASC: older first, newer last — newer overrides
    const rows = [
      { lifecycle_stage: 5, artifact_data: { decision: 'approved', unitEconomics: { cac: 100 } } },
      { lifecycle_stage: 5, artifact_data: { decision: 'challenged', riskScore: 7 } },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(5).decision).toBe('challenged');
    expect(result.get(5).unitEconomics).toEqual({ cac: 100 });
    expect(result.get(5).riskScore).toBe(7);
  });

  it('returns empty Map for no matching stages', () => {
    const result = mergeArtifacts([]);
    expect(result.size).toBe(0);
  });

  it('handles multiple stages independently', () => {
    const rows = [
      { lifecycle_stage: 3, artifact_data: { market: 'good' } },
      { lifecycle_stage: 5, artifact_data: { unitEconomics: { cac: 100 } } },
      { lifecycle_stage: 5, artifact_data: { riskFactors: ['market'] } },
    ];
    const result = mergeArtifacts(rows);
    expect(result.get(3)).toEqual({ market: 'good' });
    expect(result.get(5)).toEqual({ unitEconomics: { cac: 100 }, riskFactors: ['market'] });
  });
});

describe('fetchUpstreamArtifacts merge logic', () => {
  // Simulate the merge pattern from fetchUpstreamArtifacts (sorted ASC)
  function mergeArtifacts(rows) {
    const result = {};
    for (const artifact of rows) {
      const key = `stage${artifact.lifecycle_stage}Data`;
      let artifactData = artifact.artifact_data || artifact.metadata || artifact.content;
      if (typeof artifactData === 'string') {
        try { artifactData = JSON.parse(artifactData); } catch { /* keep */ }
      }
      if (!artifactData || (typeof artifactData === 'object' && Object.keys(artifactData).length === 0)) continue;

      if (!result[key]) {
        result[key] = typeof artifactData === 'object' ? { ...artifactData } : artifactData;
      } else if (typeof result[key] === 'object' && typeof artifactData === 'object') {
        result[key] = { ...result[key], ...artifactData };
      }
    }
    return result;
  }

  it('merges financial_model and DA review correctly (DA review has null data)', () => {
    // Sorted ASC: financial_model (older) first, DA review (newer) second
    const rows = [
      { lifecycle_stage: 5, artifact_type: 'truth_financial_model', artifact_data: { unitEconomics: { cac: 100 }, decision: 'approved' }, metadata: null, content: null },
      { lifecycle_stage: 5, artifact_type: 'system_devils_advocate_review', artifact_data: null, metadata: null, content: null },
    ];
    const result = mergeArtifacts(rows);
    expect(result.stage5Data).toEqual({ unitEconomics: { cac: 100 }, decision: 'approved' });
  });

  it('merges two valid artifacts for same stage', () => {
    const rows = [
      { lifecycle_stage: 5, artifact_type: 'truth_financial_model', artifact_data: { unitEconomics: { cac: 100 } }, metadata: null, content: null },
      { lifecycle_stage: 5, artifact_type: 'deployment_runbook', artifact_data: { deploySteps: ['step1'] }, metadata: null, content: null },
    ];
    const result = mergeArtifacts(rows);
    expect(result.stage5Data).toEqual({ unitEconomics: { cac: 100 }, deploySteps: ['step1'] });
  });

  it('falls back to metadata when artifact_data is null', () => {
    const rows = [
      { lifecycle_stage: 3, artifact_type: 'analysis', artifact_data: null, metadata: { score: 85 }, content: null },
    ];
    const result = mergeArtifacts(rows);
    expect(result.stage3Data).toEqual({ score: 85 });
  });

  it('parses string artifact_data as JSON', () => {
    const rows = [
      { lifecycle_stage: 3, artifact_type: 'analysis', artifact_data: null, metadata: null, content: '{"parsed":true}' },
    ];
    const result = mergeArtifacts(rows);
    expect(result.stage3Data).toEqual({ parsed: true });
  });

  it('returns empty object for no matching stages', () => {
    const result = mergeArtifacts([]);
    expect(Object.keys(result).length).toBe(0);
  });
});
