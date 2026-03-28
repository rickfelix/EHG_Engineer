import { describe, it, expect, beforeEach } from 'vitest';
import { AnalysisRepository } from '../src/data/analysis-repository.js';
import { validateAnalysis } from '../src/data/analysis-validator.js';
import { getSeedData, seed } from '../src/data/analysis-seed.js';
import {
  VALID_ANALYSIS_STATUSES, VALID_SEVERITIES, VALID_FINDING_TYPES,
  VALID_METRIC_TYPES, REQUIRED_FIELDS
} from '../src/data/analysis-schema.js';

describe('Cross-Layer Integration: Schema → Validator → Repository', () => {
  let repo;
  beforeEach(() => { repo = new AnalysisRepository(); });

  it('valid analysis passes validation and stores successfully', () => {
    const analysis = { id: 'int-a1', repository_name: 'test/repo', commit_sha: 'abc123', status: 'completed', quality_score: 85 };
    const { valid } = validateAnalysis('analysis', analysis);
    expect(valid).toBe(true);
    const stored = repo.addAnalysis(analysis);
    expect(stored.created_at).toBeDefined();
    expect(repo.getAnalysis('int-a1')).toBeDefined();
  });

  it('invalid analysis fails validation and is NOT stored', () => {
    const bad = { id: 'int-a2', repository_name: 'test', commit_sha: 'abc', status: 'bogus_status' };
    const { valid } = validateAnalysis('analysis', bad);
    expect(valid).toBe(false);
    expect(() => repo.addAnalysis(bad)).toThrow();
    expect(repo.getAnalysis('int-a2')).toBeNull();
  });

  it('finding requires existing analysis (referential integrity)', () => {
    expect(() => repo.addFinding({
      id: 'orphan', analysis_id: 'nonexistent', severity: 'high', finding_type: 'bug',
      title: 'Test', file_path: 'x.js', line_number: 1, description: 'desc'
    })).toThrow('Analysis not found');
  });

  it('metric requires existing analysis (referential integrity)', () => {
    expect(() => repo.addMetric({
      id: 'orphan', analysis_id: 'nonexistent', metric_type: 'latency',
      name: 'P95', value: 50, unit: 'ms'
    })).toThrow('Analysis not found');
  });
});

describe('Cross-Layer Integration: Schema Constants Consistency', () => {
  it('all VALID_ANALYSIS_STATUSES accepted by validator', () => {
    for (const status of VALID_ANALYSIS_STATUSES) {
      const { valid } = validateAnalysis('analysis', {
        id: `test-${status}`, repository_name: 'r', commit_sha: 'c', status
      });
      expect(valid).toBe(true);
    }
  });

  it('all VALID_SEVERITIES accepted by validator', () => {
    for (const severity of VALID_SEVERITIES) {
      const { valid } = validateAnalysis('finding', {
        id: `test-${severity}`, analysis_id: 'a1', severity, finding_type: 'bug',
        title: 'T', file_path: 'f.js', line_number: 1, description: 'd'
      });
      expect(valid).toBe(true);
    }
  });

  it('all VALID_FINDING_TYPES accepted by validator', () => {
    for (const type of VALID_FINDING_TYPES) {
      const { valid } = validateAnalysis('finding', {
        id: `test-${type}`, analysis_id: 'a1', severity: 'high', finding_type: type,
        title: 'T', file_path: 'f.js', line_number: 1, description: 'd'
      });
      expect(valid).toBe(true);
    }
  });

  it('all VALID_METRIC_TYPES accepted by validator', () => {
    for (const type of VALID_METRIC_TYPES) {
      const { valid } = validateAnalysis('metric', {
        id: `test-${type}`, analysis_id: 'a1', metric_type: type,
        name: 'Test', value: 42, unit: 'units'
      });
      expect(valid).toBe(true);
    }
  });

  it('REQUIRED_FIELDS matches entity needs', () => {
    expect(REQUIRED_FIELDS.analysis).toContain('repository_name');
    expect(REQUIRED_FIELDS.analysis).toContain('commit_sha');
    expect(REQUIRED_FIELDS.finding).toContain('analysis_id');
    expect(REQUIRED_FIELDS.finding).toContain('severity');
    expect(REQUIRED_FIELDS.metric).toContain('analysis_id');
    expect(REQUIRED_FIELDS.metric).toContain('metric_type');
  });
});

describe('Cross-Layer Integration: Full Analysis Lifecycle', () => {
  let repo;
  beforeEach(() => { repo = new AnalysisRepository(); });

  it('complete lifecycle: analysis → findings → metrics → query', () => {
    // Step 1: Create analysis
    const analysis = repo.addAnalysis({
      id: 'lifecycle-a1', repository_name: 'test/lifecycle', commit_sha: 'abc123',
      status: 'completed', quality_score: 78,
      severity_summary: { critical: 1, high: 2, medium: 1, low: 0 }
    });
    expect(analysis.created_at).toBeDefined();

    // Step 2: Add findings
    repo.addFinding({ id: 'lf-1', analysis_id: 'lifecycle-a1', severity: 'critical', finding_type: 'vulnerability', title: 'SQL Injection', file_path: 'src/db.js', line_number: 45, description: 'Unparameterized query', rule_id: 'CWE-89' });
    repo.addFinding({ id: 'lf-2', analysis_id: 'lifecycle-a1', severity: 'high', finding_type: 'security_hotspot', title: 'Hardcoded key', file_path: 'src/config.js', line_number: 12, description: 'API key in source' });
    repo.addFinding({ id: 'lf-3', analysis_id: 'lifecycle-a1', severity: 'high', finding_type: 'bug', title: 'Null deref', file_path: 'src/handler.js', line_number: 30, description: 'Missing null check' });
    repo.addFinding({ id: 'lf-4', analysis_id: 'lifecycle-a1', severity: 'medium', finding_type: 'code_smell', title: 'Complex function', file_path: 'src/auth.js', line_number: 100, description: 'Cyclomatic complexity 15' });

    // Step 3: Add metrics
    repo.addMetric({ id: 'lm-1', analysis_id: 'lifecycle-a1', metric_type: 'test_coverage', name: 'Line Coverage', value: 78.5, unit: '%', threshold: 80, passed: false });
    repo.addMetric({ id: 'lm-2', analysis_id: 'lifecycle-a1', metric_type: 'latency', name: 'P95 Response', value: 45, unit: 'ms', threshold: 100, passed: true });

    // Step 4: Query and verify
    const findings = repo.listFindings({ analysis_id: 'lifecycle-a1' });
    expect(findings).toHaveLength(4);
    const criticals = repo.listFindings({ analysis_id: 'lifecycle-a1', severity: 'critical' });
    expect(criticals).toHaveLength(1);
    expect(criticals[0].rule_id).toBe('CWE-89');

    const metrics = repo.listMetrics({ analysis_id: 'lifecycle-a1' });
    expect(metrics).toHaveLength(2);
    const failing = metrics.filter(m => !m.passed);
    expect(failing).toHaveLength(1);
    expect(failing[0].metric_type).toBe('test_coverage');
  });

  it('update analysis marks completion with score', () => {
    repo.addAnalysis({ id: 'upd-a1', repository_name: 'r', commit_sha: 'c', status: 'running', quality_score: null });
    const updated = repo.updateAnalysis('upd-a1', { status: 'completed', quality_score: 92, completed_at: '2026-03-28T12:00:00Z' });
    expect(updated.status).toBe('completed');
    expect(updated.quality_score).toBe(92);
  });
});

describe('Cross-Layer Integration: Seed Data Round-Trip', () => {
  it('seed data populates all entity types', () => {
    const repo = new AnalysisRepository();
    seed(repo);
    expect(repo.listAnalyses().length).toBeGreaterThanOrEqual(5);
    expect(repo.listFindings().length).toBeGreaterThanOrEqual(8);
    expect(repo.listMetrics().length).toBeGreaterThanOrEqual(6);
  });

  it('export/import preserves all data', () => {
    const repo1 = new AnalysisRepository();
    seed(repo1);
    const exported = repo1.export();
    const repo2 = new AnalysisRepository();
    repo2.import(exported);
    expect(repo2.listAnalyses().length).toBe(repo1.listAnalyses().length);
    expect(repo2.listFindings().length).toBe(repo1.listFindings().length);
    expect(repo2.listMetrics().length).toBe(repo1.listMetrics().length);
  });

  it('specific seed records have expected content', () => {
    const repo = new AnalysisRepository();
    seed(repo);
    const a1 = repo.getAnalysis('an-001');
    expect(a1.repository_name).toBe('rickfelix/ehg');
    expect(a1.quality_score).toBe(72);
    const f1 = repo.getFinding('vf-001');
    expect(f1.rule_id).toBe('CWE-89');
    expect(f1.severity).toBe('critical');
  });
});

describe('Cross-Layer Integration: Filtering Consistency', () => {
  let repo;
  beforeEach(() => { repo = new AnalysisRepository(); seed(repo); });

  it('filters analyses by repository consistently', () => {
    const ehg = repo.listAnalyses({ repository_name: 'rickfelix/ehg' });
    ehg.forEach(a => expect(a.repository_name).toBe('rickfelix/ehg'));
    const engineer = repo.listAnalyses({ repository_name: 'rickfelix/EHG_Engineer' });
    engineer.forEach(a => expect(a.repository_name).toBe('rickfelix/EHG_Engineer'));
    expect(ehg.length + engineer.length).toBe(repo.listAnalyses().length);
  });

  it('filters findings by severity consistently', () => {
    for (const sev of ['critical', 'high', 'medium', 'low']) {
      const results = repo.listFindings({ severity: sev });
      results.forEach(f => expect(f.severity).toBe(sev));
    }
  });

  it('pagination produces non-overlapping pages', () => {
    const all = repo.listAnalyses();
    const p1 = repo.listAnalyses({ limit: 2, offset: 0 });
    const p2 = repo.listAnalyses({ limit: 2, offset: 2 });
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2);
    expect(p1[0].id).not.toBe(p2[0].id);
  });
});
