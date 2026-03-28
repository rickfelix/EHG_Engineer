export function getSeedData() {
  const analyses = [
    { id: 'an-001', repository_name: 'rickfelix/ehg', commit_sha: 'abc123def', branch: 'main', pr_number: null, status: 'completed', total_findings: 8, severity_summary: { critical: 1, high: 2, medium: 3, low: 2 }, quality_score: 72, started_at: '2026-03-28T10:00:00Z', completed_at: '2026-03-28T10:03:00Z', metadata: { trigger: 'push' } },
    { id: 'an-002', repository_name: 'rickfelix/ehg', commit_sha: 'def456ghi', branch: 'feat/auth', pr_number: '42', status: 'completed', total_findings: 3, severity_summary: { critical: 0, high: 1, medium: 1, low: 1 }, quality_score: 85, started_at: '2026-03-28T10:05:00Z', completed_at: '2026-03-28T10:07:00Z', metadata: { trigger: 'pull_request' } },
    { id: 'an-003', repository_name: 'rickfelix/EHG_Engineer', commit_sha: 'ghi789jkl', branch: 'main', pr_number: null, status: 'completed', total_findings: 12, severity_summary: { critical: 2, high: 3, medium: 4, low: 3 }, quality_score: 61, started_at: '2026-03-28T10:10:00Z', completed_at: '2026-03-28T10:14:00Z', metadata: { trigger: 'push' } },
    { id: 'an-004', repository_name: 'rickfelix/ehg', commit_sha: 'jkl012mno', branch: 'fix/hotfix', pr_number: '43', status: 'running', total_findings: 0, severity_summary: { critical: 0, high: 0, medium: 0, low: 0 }, quality_score: null, started_at: '2026-03-28T10:15:00Z', completed_at: null, metadata: null },
    { id: 'an-005', repository_name: 'rickfelix/EHG_Engineer', commit_sha: 'mno345pqr', branch: 'main', pr_number: null, status: 'failed', total_findings: 0, severity_summary: { critical: 0, high: 0, medium: 0, low: 0 }, quality_score: null, started_at: '2026-03-28T10:20:00Z', completed_at: '2026-03-28T10:20:30Z', metadata: { error: 'timeout' } },
    { id: 'an-006', repository_name: 'rickfelix/ehg', commit_sha: 'pqr678stu', branch: 'feat/dashboard', pr_number: '44', status: 'completed', total_findings: 5, severity_summary: { critical: 0, high: 0, medium: 3, low: 2 }, quality_score: 90, started_at: '2026-03-28T10:25:00Z', completed_at: '2026-03-28T10:27:00Z', metadata: { trigger: 'pull_request' } }
  ];

  const findings = [
    { id: 'vf-001', analysis_id: 'an-001', severity: 'critical', finding_type: 'vulnerability', title: 'SQL Injection in query builder', file_path: 'src/db/query.js', line_number: 45, description: 'User input concatenated directly into SQL query', rule_id: 'CWE-89', suggestion: 'Use parameterized queries' },
    { id: 'vf-002', analysis_id: 'an-001', severity: 'high', finding_type: 'security_hotspot', title: 'Hardcoded secret in config', file_path: 'src/config.js', line_number: 12, description: 'API key stored as string literal', rule_id: 'CWE-798', suggestion: 'Use environment variables' },
    { id: 'vf-003', analysis_id: 'an-001', severity: 'high', finding_type: 'vulnerability', title: 'Missing CSRF protection', file_path: 'src/routes/api.js', line_number: 8, description: 'POST endpoints lack CSRF token validation', rule_id: 'CWE-352', suggestion: 'Add csurf middleware' },
    { id: 'vf-004', analysis_id: 'an-001', severity: 'medium', finding_type: 'code_smell', title: 'Function too complex', file_path: 'src/services/auth.js', line_number: 100, description: 'Cyclomatic complexity of 15 exceeds threshold of 10', rule_id: 'S3776', suggestion: 'Extract helper functions' },
    { id: 'vf-005', analysis_id: 'an-002', severity: 'high', finding_type: 'bug', title: 'Null dereference in error handler', file_path: 'src/middleware/error.js', line_number: 22, description: 'err.response accessed without null check', rule_id: 'S2259', suggestion: 'Add optional chaining' },
    { id: 'vf-006', analysis_id: 'an-002', severity: 'medium', finding_type: 'duplication', title: 'Duplicated validation logic', file_path: 'src/validators/user.js', line_number: 15, description: '23 lines duplicated with src/validators/admin.js', rule_id: 'S1192', suggestion: 'Extract shared validation function' },
    { id: 'vf-007', analysis_id: 'an-003', severity: 'critical', finding_type: 'vulnerability', title: 'Path traversal in file upload', file_path: 'src/upload/handler.js', line_number: 34, description: 'User-supplied filename used without sanitization', rule_id: 'CWE-22', suggestion: 'Use path.basename and whitelist extensions' },
    { id: 'vf-008', analysis_id: 'an-003', severity: 'critical', finding_type: 'security_hotspot', title: 'Weak encryption algorithm', file_path: 'src/crypto/encrypt.js', line_number: 5, description: 'Using DES instead of AES-256-GCM', rule_id: 'CWE-327', suggestion: 'Upgrade to AES-256-GCM' },
    { id: 'vf-009', analysis_id: 'an-006', severity: 'medium', finding_type: 'code_smell', title: 'Unused import', file_path: 'src/components/Chart.tsx', line_number: 3, description: 'Import useState is declared but never used', rule_id: 'S1128', suggestion: 'Remove unused import' },
    { id: 'vf-010', analysis_id: 'an-006', severity: 'low', finding_type: 'code_smell', title: 'Magic number', file_path: 'src/utils/pagination.js', line_number: 18, description: 'Literal 25 should be a named constant', rule_id: 'S109', suggestion: 'Extract to PAGE_SIZE constant' }
  ];

  const metrics = [
    { id: 'pm-001', analysis_id: 'an-001', metric_type: 'test_coverage', name: 'Line Coverage', value: 78.5, unit: '%', threshold: 80, passed: false, measured_at: '2026-03-28T10:02:00Z' },
    { id: 'pm-002', analysis_id: 'an-001', metric_type: 'bundle_size', name: 'Main Bundle', value: 312, unit: 'KB', threshold: 250, passed: false, measured_at: '2026-03-28T10:02:30Z' },
    { id: 'pm-003', analysis_id: 'an-002', metric_type: 'test_coverage', name: 'Line Coverage', value: 92.1, unit: '%', threshold: 80, passed: true, measured_at: '2026-03-28T10:06:00Z' },
    { id: 'pm-004', analysis_id: 'an-002', metric_type: 'latency', name: 'API Response P95', value: 45, unit: 'ms', threshold: 100, passed: true, measured_at: '2026-03-28T10:06:30Z' },
    { id: 'pm-005', analysis_id: 'an-003', metric_type: 'memory', name: 'Heap Usage', value: 256, unit: 'MB', threshold: 512, passed: true, measured_at: '2026-03-28T10:13:00Z' },
    { id: 'pm-006', analysis_id: 'an-003', metric_type: 'cpu', name: 'Build CPU Time', value: 12.5, unit: 'seconds', threshold: 30, passed: true, measured_at: '2026-03-28T10:13:30Z' },
    { id: 'pm-007', analysis_id: 'an-006', metric_type: 'test_coverage', name: 'Line Coverage', value: 95.3, unit: '%', threshold: 80, passed: true, measured_at: '2026-03-28T10:26:00Z' },
    { id: 'pm-008', analysis_id: 'an-006', metric_type: 'throughput', name: 'Requests/sec', value: 1250, unit: 'rps', threshold: 500, passed: true, measured_at: '2026-03-28T10:26:30Z' }
  ];

  return { analyses, findings, metrics };
}

export function seed(repository) {
  const data = getSeedData();
  repository.clear();
  data.analyses.forEach(a => repository.addAnalysis(a));
  data.findings.forEach(f => repository.addFinding(f));
  data.metrics.forEach(m => repository.addMetric(m));
  return data;
}
