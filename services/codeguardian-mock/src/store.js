const analyses = new Map();
let counter = 0;

export function createAnalysis(prNumber, repo) {
  const id = String(++counter);
  const analysis = {
    id,
    pr_number: prNumber,
    repository: repo,
    status: 'pending',
    result: null,
    findings: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  analyses.set(id, analysis);
  return analysis;
}

export function getAnalysis(id) {
  return analyses.get(id) || null;
}

export function completeAnalysis(id, result) {
  const analysis = analyses.get(id);
  if (!analysis) return null;
  analysis.status = 'completed';
  analysis.result = result;
  analysis.findings = result === 'success'
    ? [{ type: 'info', message: 'All checks passed' }]
    : [{ type: 'error', message: 'Code quality issues detected' }];
  analysis.updated_at = new Date().toISOString();
  return analysis;
}

export function listAnalyses() {
  return [...analyses.values()];
}

export function reset() {
  analyses.clear();
  counter = 0;
}
