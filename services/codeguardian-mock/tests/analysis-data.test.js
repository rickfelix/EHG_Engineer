import { describe, it, expect, beforeEach } from 'vitest';
import {
  VALID_ANALYSIS_STATUSES, VALID_SEVERITIES, VALID_FINDING_TYPES,
  VALID_METRIC_TYPES, REQUIRED_FIELDS
} from '../src/data/analysis-schema.js';
import { validateAnalysis } from '../src/data/analysis-validator.js';
import { AnalysisRepository } from '../src/data/analysis-repository.js';
import { getSeedData, seed } from '../src/data/analysis-seed.js';

describe('Analysis Schema', () => {
  it('exports valid analysis statuses', () => {
    expect(VALID_ANALYSIS_STATUSES).toContain('completed');
    expect(VALID_ANALYSIS_STATUSES).toContain('running');
    expect(VALID_ANALYSIS_STATUSES.length).toBeGreaterThanOrEqual(5);
  });

  it('exports valid finding types', () => {
    expect(VALID_FINDING_TYPES).toContain('vulnerability');
    expect(VALID_FINDING_TYPES).toContain('code_smell');
    expect(VALID_FINDING_TYPES.length).toBeGreaterThanOrEqual(5);
  });

  it('exports valid metric types', () => {
    expect(VALID_METRIC_TYPES).toContain('test_coverage');
    expect(VALID_METRIC_TYPES).toContain('latency');
    expect(VALID_METRIC_TYPES.length).toBeGreaterThanOrEqual(6);
  });

  it('exports required fields for all entity types', () => {
    expect(REQUIRED_FIELDS.analysis).toBeDefined();
    expect(REQUIRED_FIELDS.finding).toBeDefined();
    expect(REQUIRED_FIELDS.metric).toBeDefined();
  });
});

describe('Analysis Validator', () => {
  it('validates correct analysis', () => {
    const { valid } = validateAnalysis('analysis', { id: 'a1', repository_name: 'r', commit_sha: 'abc', status: 'completed' });
    expect(valid).toBe(true);
  });

  it('rejects analysis with invalid status', () => {
    const { valid, errors } = validateAnalysis('analysis', { id: 'a1', repository_name: 'r', commit_sha: 'abc', status: 'bogus' });
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects finding with invalid severity', () => {
    const { valid } = validateAnalysis('finding', {
      id: 'f1', analysis_id: 'a1', severity: 'extreme', finding_type: 'bug',
      title: 'Test', file_path: 'x.js', line_number: 1, description: 'desc'
    });
    expect(valid).toBe(false);
  });

  it('rejects finding with non-numeric line_number', () => {
    const { valid, errors } = validateAnalysis('finding', {
      id: 'f1', analysis_id: 'a1', severity: 'high', finding_type: 'bug',
      title: 'Test', file_path: 'x.js', line_number: 'ten', description: 'desc'
    });
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('line_number'))).toBe(true);
  });

  it('rejects metric with non-numeric value', () => {
    const { valid } = validateAnalysis('metric', {
      id: 'm1', analysis_id: 'a1', metric_type: 'latency', name: 'P95', value: 'fast', unit: 'ms'
    });
    expect(valid).toBe(false);
  });

  it('rejects unknown entity type', () => {
    const { valid } = validateAnalysis('unknown', { id: 'x' });
    expect(valid).toBe(false);
  });
});

describe('AnalysisRepository - Analyses', () => {
  let repo;
  beforeEach(() => { repo = new AnalysisRepository(); });

  it('adds and retrieves an analysis', () => {
    const analysis = repo.addAnalysis({ id: 'a1', repository_name: 'test/repo', commit_sha: 'abc', status: 'completed' });
    expect(analysis.created_at).toBeDefined();
    expect(repo.getAnalysis('a1')).toBeDefined();
  });

  it('returns null for missing analysis', () => {
    expect(repo.getAnalysis('nonexistent')).toBeNull();
  });

  it('filters analyses by status', () => {
    repo.addAnalysis({ id: 'a1', repository_name: 'r', commit_sha: 'c1', status: 'completed' });
    repo.addAnalysis({ id: 'a2', repository_name: 'r', commit_sha: 'c2', status: 'running' });
    expect(repo.listAnalyses({ status: 'completed' })).toHaveLength(1);
  });

  it('filters analyses by repository_name', () => {
    repo.addAnalysis({ id: 'a1', repository_name: 'repo-a', commit_sha: 'c1', status: 'completed' });
    repo.addAnalysis({ id: 'a2', repository_name: 'repo-b', commit_sha: 'c2', status: 'completed' });
    expect(repo.listAnalyses({ repository_name: 'repo-a' })).toHaveLength(1);
  });

  it('paginates analyses', () => {
    for (let i = 0; i < 10; i++) {
      repo.addAnalysis({ id: `a${i}`, repository_name: 'r', commit_sha: `c${i}`, status: 'completed' });
    }
    expect(repo.listAnalyses({ limit: 3, offset: 2 })).toHaveLength(3);
  });

  it('updates and deletes an analysis', () => {
    repo.addAnalysis({ id: 'a1', repository_name: 'r', commit_sha: 'c1', status: 'running' });
    const updated = repo.updateAnalysis('a1', { status: 'completed', quality_score: 85 });
    expect(updated.status).toBe('completed');
    expect(repo.deleteAnalysis('a1')).toBe(true);
    expect(repo.getAnalysis('a1')).toBeNull();
  });
});

describe('AnalysisRepository - Findings', () => {
  let repo;
  beforeEach(() => {
    repo = new AnalysisRepository();
    repo.addAnalysis({ id: 'a1', repository_name: 'r', commit_sha: 'c', status: 'completed' });
  });

  it('adds finding linked to analysis', () => {
    repo.addFinding({ id: 'f1', analysis_id: 'a1', severity: 'high', finding_type: 'bug', title: 'Bug', file_path: 'x.js', line_number: 1, description: 'desc' });
    expect(repo.getFinding('f1')).toBeDefined();
  });

  it('throws when analysis does not exist', () => {
    expect(() => repo.addFinding({
      id: 'f1', analysis_id: 'missing', severity: 'high', finding_type: 'bug',
      title: 'Bug', file_path: 'x.js', line_number: 1, description: 'desc'
    })).toThrow('Analysis not found');
  });

  it('filters findings by severity', () => {
    repo.addFinding({ id: 'f1', analysis_id: 'a1', severity: 'critical', finding_type: 'vulnerability', title: 'A', file_path: 'a.js', line_number: 1, description: 'd' });
    repo.addFinding({ id: 'f2', analysis_id: 'a1', severity: 'low', finding_type: 'code_smell', title: 'B', file_path: 'b.js', line_number: 2, description: 'd' });
    expect(repo.listFindings({ severity: 'critical' })).toHaveLength(1);
  });
});

describe('AnalysisRepository - Metrics', () => {
  let repo;
  beforeEach(() => {
    repo = new AnalysisRepository();
    repo.addAnalysis({ id: 'a1', repository_name: 'r', commit_sha: 'c', status: 'completed' });
  });

  it('adds metric linked to analysis', () => {
    repo.addMetric({ id: 'm1', analysis_id: 'a1', metric_type: 'test_coverage', name: 'Coverage', value: 85, unit: '%' });
    expect(repo.getMetric('m1').value).toBe(85);
  });

  it('filters metrics by type', () => {
    repo.addMetric({ id: 'm1', analysis_id: 'a1', metric_type: 'test_coverage', name: 'Coverage', value: 85, unit: '%' });
    repo.addMetric({ id: 'm2', analysis_id: 'a1', metric_type: 'latency', name: 'P95', value: 45, unit: 'ms' });
    expect(repo.listMetrics({ metric_type: 'latency' })).toHaveLength(1);
  });
});

describe('Analysis Seed', () => {
  it('returns seed data with sufficient counts', () => {
    const data = getSeedData();
    expect(data.analyses.length).toBeGreaterThanOrEqual(5);
    expect(data.findings.length).toBeGreaterThanOrEqual(8);
    expect(data.metrics.length).toBeGreaterThanOrEqual(6);
  });

  it('populates repository via seed()', () => {
    const repo = new AnalysisRepository();
    seed(repo);
    expect(repo.listAnalyses().length).toBeGreaterThanOrEqual(5);
    expect(repo.listFindings().length).toBeGreaterThanOrEqual(8);
    expect(repo.listMetrics().length).toBeGreaterThanOrEqual(6);
  });

  it('round-trips via export/import', () => {
    const repo1 = new AnalysisRepository();
    seed(repo1);
    const exported = repo1.export();
    const repo2 = new AnalysisRepository();
    repo2.import(exported);
    expect(repo2.listAnalyses().length).toBe(repo1.listAnalyses().length);
    expect(repo2.listFindings().length).toBe(repo1.listFindings().length);
    expect(repo2.listMetrics().length).toBe(repo1.listMetrics().length);
  });
});
