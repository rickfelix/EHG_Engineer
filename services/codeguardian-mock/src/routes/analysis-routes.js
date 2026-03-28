import { Router } from 'express';
import { AnalysisRepository } from '../data/analysis-repository.js';
import { seed } from '../data/analysis-seed.js';

const router = Router();
const repo = new AnalysisRepository();
seed(repo);

/** Expose repository for testing */
export { repo as analysisRepo };

router.get('/', (req, res) => {
  const { repository_name, status, limit, offset } = req.query;
  const filters = {};
  if (repository_name) filters.repository_name = repository_name;
  if (status) filters.status = status;
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  const all = repo.listAnalyses({});
  const filtered = repo.listAnalyses(filters);
  res.json({
    data: filtered,
    meta: { total: all.length, count: filtered.length, limit: filters.limit || null, offset: filters.offset || 0 }
  });
});

router.get('/stats', (_req, res) => {
  const analyses = repo.listAnalyses({});
  const findings = repo.listFindings({});
  const metrics = repo.listMetrics({});

  const statusCounts = {};
  let totalScore = 0;
  let scoredCount = 0;
  for (const a of analyses) {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    if (a.quality_score !== null && a.quality_score !== undefined) {
      totalScore += a.quality_score;
      scoredCount++;
    }
  }

  const severityCounts = {};
  for (const f of findings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
  }

  const metricPassRate = metrics.length > 0
    ? (metrics.filter(m => m.passed).length / metrics.length * 100).toFixed(1) + '%'
    : '0%';

  res.json({
    total_analyses: analyses.length,
    total_findings: findings.length,
    total_metrics: metrics.length,
    status_counts: statusCounts,
    severity_counts: severityCounts,
    avg_quality_score: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
    metric_pass_rate: metricPassRate
  });
});

router.get('/:id', (req, res) => {
  const analysis = repo.getAnalysis(req.params.id);
  if (!analysis) {
    return res.status(404).json({ error: 'Analysis not found', id: req.params.id });
  }
  const findings = repo.listFindings({ analysis_id: req.params.id });
  const metrics = repo.listMetrics({ analysis_id: req.params.id });
  res.json({ ...analysis, findings, metrics });
});

router.get('/:id/findings', (req, res) => {
  const analysis = repo.getAnalysis(req.params.id);
  if (!analysis) {
    return res.status(404).json({ error: 'Analysis not found', id: req.params.id });
  }
  const { severity, finding_type, limit, offset } = req.query;
  const filters = { analysis_id: req.params.id };
  if (severity) filters.severity = severity;
  if (finding_type) filters.finding_type = finding_type;
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  const all = repo.listFindings({ analysis_id: req.params.id });
  const filtered = repo.listFindings(filters);
  res.json({
    data: filtered,
    meta: { total: all.length, count: filtered.length, analysis_id: req.params.id }
  });
});

router.get('/:id/metrics', (req, res) => {
  const analysis = repo.getAnalysis(req.params.id);
  if (!analysis) {
    return res.status(404).json({ error: 'Analysis not found', id: req.params.id });
  }
  const { metric_type } = req.query;
  const filters = { analysis_id: req.params.id };
  if (metric_type) filters.metric_type = metric_type;

  const results = repo.listMetrics(filters);
  res.json({
    data: results,
    meta: { total: results.length, analysis_id: req.params.id }
  });
});

export default router;
