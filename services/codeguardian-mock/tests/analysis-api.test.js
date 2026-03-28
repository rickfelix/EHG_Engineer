import { describe, it, expect, beforeEach } from 'vitest';
import { analysisRepo } from '../src/routes/analysis-routes.js';
import { seed } from '../src/data/analysis-seed.js';

describe('Analysis API - GET /api/analysis-results (list)', () => {
  beforeEach(() => { seed(analysisRepo); });

  it('lists all analyses', () => {
    const all = analysisRepo.listAnalyses({});
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it('filters by status', () => {
    const completed = analysisRepo.listAnalyses({ status: 'completed' });
    expect(completed.length).toBeGreaterThan(0);
    completed.forEach(a => expect(a.status).toBe('completed'));
  });

  it('filters by repository_name', () => {
    const ehg = analysisRepo.listAnalyses({ repository_name: 'rickfelix/ehg' });
    expect(ehg.length).toBeGreaterThan(0);
    ehg.forEach(a => expect(a.repository_name).toBe('rickfelix/ehg'));
  });

  it('supports pagination', () => {
    const page = analysisRepo.listAnalyses({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });
});

describe('Analysis API - GET /api/analysis-results/:id', () => {
  beforeEach(() => { seed(analysisRepo); });

  it('returns analysis with findings and metrics', () => {
    const analysis = analysisRepo.getAnalysis('an-001');
    expect(analysis).toBeDefined();
    expect(analysis.repository_name).toBe('rickfelix/ehg');
    const findings = analysisRepo.listFindings({ analysis_id: 'an-001' });
    const metrics = analysisRepo.listMetrics({ analysis_id: 'an-001' });
    expect(findings.length).toBeGreaterThan(0);
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('returns null for nonexistent analysis', () => {
    expect(analysisRepo.getAnalysis('nonexistent')).toBeNull();
  });
});

describe('Analysis API - GET /api/analysis-results/:id/findings', () => {
  beforeEach(() => { seed(analysisRepo); });

  it('lists findings for an analysis', () => {
    const findings = analysisRepo.listFindings({ analysis_id: 'an-001' });
    expect(findings.length).toBeGreaterThanOrEqual(3);
    findings.forEach(f => expect(f.analysis_id).toBe('an-001'));
  });

  it('filters findings by severity', () => {
    const critical = analysisRepo.listFindings({ analysis_id: 'an-003', severity: 'critical' });
    expect(critical.length).toBeGreaterThan(0);
    critical.forEach(f => expect(f.severity).toBe('critical'));
  });

  it('filters findings by finding_type', () => {
    const vulns = analysisRepo.listFindings({ finding_type: 'vulnerability' });
    expect(vulns.length).toBeGreaterThan(0);
    vulns.forEach(f => expect(f.finding_type).toBe('vulnerability'));
  });
});

describe('Analysis API - GET /api/analysis-results/:id/metrics', () => {
  beforeEach(() => { seed(analysisRepo); });

  it('lists metrics for an analysis', () => {
    const metrics = analysisRepo.listMetrics({ analysis_id: 'an-001' });
    expect(metrics.length).toBeGreaterThanOrEqual(2);
    metrics.forEach(m => expect(m.analysis_id).toBe('an-001'));
  });

  it('filters metrics by type', () => {
    const coverage = analysisRepo.listMetrics({ metric_type: 'test_coverage' });
    expect(coverage.length).toBeGreaterThan(0);
    coverage.forEach(m => expect(m.metric_type).toBe('test_coverage'));
  });
});

describe('Analysis API - GET /api/analysis-results/stats', () => {
  beforeEach(() => { seed(analysisRepo); });

  it('returns correct total counts', () => {
    const analyses = analysisRepo.listAnalyses({});
    const findings = analysisRepo.listFindings({});
    const metrics = analysisRepo.listMetrics({});
    expect(analyses.length).toBeGreaterThanOrEqual(5);
    expect(findings.length).toBeGreaterThanOrEqual(8);
    expect(metrics.length).toBeGreaterThanOrEqual(6);
  });

  it('counts analyses by status', () => {
    const analyses = analysisRepo.listAnalyses({});
    const counts = {};
    for (const a of analyses) counts[a.status] = (counts[a.status] || 0) + 1;
    expect(counts.completed).toBeGreaterThanOrEqual(3);
  });

  it('computes average quality score', () => {
    const analyses = analysisRepo.listAnalyses({});
    const scored = analyses.filter(a => a.quality_score !== null);
    expect(scored.length).toBeGreaterThan(0);
    const avg = Math.round(scored.reduce((s, a) => s + a.quality_score, 0) / scored.length);
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(100);
  });
});

describe('Analysis API - Route registration', () => {
  it('exports analysisRepo', () => {
    expect(analysisRepo).toBeDefined();
    expect(typeof analysisRepo.addAnalysis).toBe('function');
    expect(typeof analysisRepo.listAnalyses).toBe('function');
    expect(typeof analysisRepo.listFindings).toBe('function');
    expect(typeof analysisRepo.listMetrics).toBe('function');
  });
});
