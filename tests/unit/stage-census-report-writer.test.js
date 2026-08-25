import { describe, it, expect } from 'vitest';
import { renderCensusReport } from '../../lib/audits/stage-census/report-writer.mjs';

// FR-5 / AC-3: committed document must carry a Generated timestamp, the SD key, and the literal
// re-run command; FR-2's per-surface completeness (0 stated explicitly) is also exercised.
describe('renderCensusReport', () => {
  const baseResult = {
    generatedAt: '2026-08-25T20:00:00.000Z',
    codeFindings: [],
    dbFindings: [{ surface: 'pg_proc function bodies', rows: [], classification: 'hand-written' }],
    negativeControl: { ok: true, matched: [{ stage_number: 21, component_path: 'Stage22DistributionSetup.tsx' }] },
  };

  it('includes the Generated timestamp, SD key, and literal re-run command', () => {
    const md = renderCensusReport(baseResult);
    expect(md).toContain('2026-08-25T20:00:00.000Z');
    expect(md).toContain('SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A');
    expect(md).toContain('node scripts/audits/stage-21-26-census.mjs');
  });

  it('states an empty surface as 0, not omitted', () => {
    const md = renderCensusReport(baseResult);
    expect(md).toMatch(/pg_proc function bodies \| 0 \|/);
  });

  it('states "2 repos, 1 shared database" explicitly (FR-7)', () => {
    const md = renderCensusReport(baseResult);
    expect(md).toMatch(/2 filesystem repos.*1 shared database/);
  });

  it('reports negative-control PASS with the matched rows when ok', () => {
    const md = renderCensusReport(baseResult);
    expect(md).toContain('PASS');
    expect(md).toContain('stage_number=21');
  });

  it('reports negative-control FAILED distinctly when not ok', () => {
    const md = renderCensusReport({ ...baseResult, negativeControl: { ok: false, matched: [] } });
    expect(md).toContain('FAILED');
  });
});
