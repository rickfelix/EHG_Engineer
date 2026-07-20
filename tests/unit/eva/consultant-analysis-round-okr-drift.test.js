/**
 * SD-LEO-INFRA-ADAM-EVA-SEAM-001 — analyzeOKRDrift OKR-drift blind-spot patch.
 *
 * The prior stub queried the non-existent `okr_key_results` table (hard-coded keyResults=[]) and
 * always returned [] — Adam's scan never produced an OKR-drift finding. The patch runs drift over
 * the REAL `key_results` (status 'at_risk' = behind; updated_at staleness) + `sd_key_result_alignment`
 * (at_risk KRs with no aligned SD = uncovered drift). `client` is injectable so this is unit-testable.
 */
import { describe, it, expect } from 'vitest';
import { analyzeOKRDrift } from '../../../scripts/eva/consultant-analysis-round.mjs';

// Minimal supabase-shaped mock. key_results: .from().select().eq('is_active',true) -> {data}.
// sd_key_result_alignment: .from().select('key_result_id') -> {data} (awaited directly).
function mockClient(keyResults, alignments = []) {
  const thenable = (data) => {
    const p = Promise.resolve({ data });
    p.eq = () => Promise.resolve({ data });
    // FR-6 batch 9: sd_key_result_alignment now reads via fetchAllPaginated, which
    // chains .order() then .range() instead of awaiting the builder directly.
    p.order = () => ({ range: () => Promise.resolve({ data, error: null }) });
    return p;
  };
  return {
    from: (table) => ({
      select: () => thenable(table === 'key_results' ? keyResults : alignments),
    }),
  };
}

const kr = (id, status, updatedDaysAgo = 0) => ({
  id, code: id, title: id, status,
  updated_at: new Date(Date.now() - updatedDaysAgo * 86400000).toISOString(),
});

describe('analyzeOKRDrift (OKR-drift blind-spot patch)', () => {
  it('flags >=3 at_risk key results as okr_drift', async () => {
    const krs = [kr('a', 'at_risk'), kr('b', 'at_risk'), kr('c', 'at_risk'), kr('d', 'on_track')];
    const aligns = krs.map((k) => ({ key_result_id: k.id })); // all covered -> no uncovered finding
    const findings = await analyzeOKRDrift(mockClient(krs, aligns));
    const atRisk = findings.find((f) => f.title.includes('at risk'));
    expect(atRisk).toBeTruthy();
    expect(atRisk.domain).toBe('okr_drift');
    expect(atRisk.dataPoints).toBe(3);
    expect(findings.some((f) => f.title.includes('no aligned SD'))).toBe(false);
  });

  it('does NOT flag fewer than 3 at_risk (threshold)', async () => {
    const krs = [kr('a', 'at_risk'), kr('b', 'at_risk'), kr('c', 'on_track')];
    const findings = await analyzeOKRDrift(mockClient(krs, [{ key_result_id: 'a' }, { key_result_id: 'b' }]));
    expect(findings.some((f) => f.title.includes('at risk'))).toBe(false);
  });

  it('flags >=3 stale (not updated in 14+ days) key results', async () => {
    const krs = [kr('a', 'on_track', 20), kr('b', 'on_track', 30), kr('c', 'achieved', 40), kr('d', 'on_track', 1)];
    const findings = await analyzeOKRDrift(mockClient(krs, krs.map((k) => ({ key_result_id: k.id }))));
    const stale = findings.find((f) => f.title.includes('not updated'));
    expect(stale).toBeTruthy();
    expect(stale.dataPoints).toBe(3);
  });

  it('flags an at_risk key result with NO aligned SD as uncovered drift (advisory)', async () => {
    const krs = [kr('a', 'at_risk'), kr('b', 'at_risk'), kr('c', 'at_risk')];
    const aligns = [{ key_result_id: 'a' }]; // b, c uncovered
    const findings = await analyzeOKRDrift(mockClient(krs, aligns));
    const uncovered = findings.find((f) => f.title.includes('no aligned SD'));
    expect(uncovered).toBeTruthy();
    expect(uncovered.dataPoints).toBe(2);
    expect(uncovered.domain).toBe('okr_drift');
  });

  it('returns [] when there are no active key results (no false drift)', async () => {
    expect(await analyzeOKRDrift(mockClient([], []))).toEqual([]);
    expect(await analyzeOKRDrift(mockClient(null, []))).toEqual([]);
  });

  it('does not flag uncovered when there are no at_risk KRs at all', async () => {
    const krs = [kr('a', 'on_track'), kr('b', 'achieved')];
    const findings = await analyzeOKRDrift(mockClient(krs, []));
    expect(findings.some((f) => f.title.includes('no aligned SD'))).toBe(false);
  });
});
