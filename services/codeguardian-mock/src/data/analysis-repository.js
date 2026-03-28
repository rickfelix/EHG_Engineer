import { validateAnalysis } from './analysis-validator.js';

export class AnalysisRepository {
  constructor() {
    this._analyses = new Map();
    this._findings = new Map();
    this._metrics = new Map();
  }

  clear() {
    this._analyses.clear();
    this._findings.clear();
    this._metrics.clear();
  }

  // Analyses
  addAnalysis(analysis) {
    const { valid, errors } = validateAnalysis('analysis', analysis);
    if (!valid) throw new Error(`Invalid analysis: ${errors.join(', ')}`);
    const record = { ...analysis, created_at: analysis.created_at || new Date().toISOString() };
    this._analyses.set(analysis.id, record);
    return record;
  }

  getAnalysis(id) { return this._analyses.get(id) || null; }

  listAnalyses({ repository_name, status, limit, offset } = {}) {
    let results = [...this._analyses.values()];
    if (repository_name) results = results.filter(a => a.repository_name === repository_name);
    if (status) results = results.filter(a => a.status === status);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  updateAnalysis(id, updates) {
    const existing = this._analyses.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this._analyses.set(id, updated);
    return updated;
  }

  deleteAnalysis(id) {
    return this._analyses.delete(id);
  }

  // Findings
  addFinding(finding) {
    const { valid, errors } = validateAnalysis('finding', finding);
    if (!valid) throw new Error(`Invalid finding: ${errors.join(', ')}`);
    if (!this._analyses.has(finding.analysis_id)) {
      throw new Error(`Analysis not found: ${finding.analysis_id}`);
    }
    this._findings.set(finding.id, { ...finding });
    return finding;
  }

  getFinding(id) { return this._findings.get(id) || null; }

  listFindings({ analysis_id, severity, finding_type, limit, offset } = {}) {
    let results = [...this._findings.values()];
    if (analysis_id) results = results.filter(f => f.analysis_id === analysis_id);
    if (severity) results = results.filter(f => f.severity === severity);
    if (finding_type) results = results.filter(f => f.finding_type === finding_type);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  // Metrics
  addMetric(metric) {
    const { valid, errors } = validateAnalysis('metric', metric);
    if (!valid) throw new Error(`Invalid metric: ${errors.join(', ')}`);
    if (!this._analyses.has(metric.analysis_id)) {
      throw new Error(`Analysis not found: ${metric.analysis_id}`);
    }
    this._metrics.set(metric.id, { ...metric });
    return metric;
  }

  getMetric(id) { return this._metrics.get(id) || null; }

  listMetrics({ analysis_id, metric_type, limit, offset } = {}) {
    let results = [...this._metrics.values()];
    if (analysis_id) results = results.filter(m => m.analysis_id === analysis_id);
    if (metric_type) results = results.filter(m => m.metric_type === metric_type);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  // Export/Import
  export() {
    return {
      analyses: this.listAnalyses(),
      findings: this.listFindings(),
      metrics: this.listMetrics()
    };
  }

  import(data) {
    this.clear();
    (data.analyses || []).forEach(a => this.addAnalysis(a));
    (data.findings || []).forEach(f => this.addFinding(f));
    (data.metrics || []).forEach(m => this.addMetric(m));
  }
}
