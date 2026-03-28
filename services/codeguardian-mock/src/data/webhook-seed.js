export function getSeedData() {
  const deliveries = [
    { id: 'del-001', delivery_id: 'gh-del-1001', event_type: 'push', payload: { ref: 'refs/heads/main', commits: [{ id: 'abc123' }] }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-001', received_at: '2026-03-28T10:00:00Z', processed_at: '2026-03-28T10:00:01Z' },
    { id: 'del-002', delivery_id: 'gh-del-1002', event_type: 'pull_request', payload: { action: 'opened', number: 42 }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-001', received_at: '2026-03-28T10:05:00Z', processed_at: '2026-03-28T10:05:01Z' },
    { id: 'del-003', delivery_id: 'gh-del-1003', event_type: 'workflow_run', payload: { action: 'completed', workflow_run: { id: 9001 } }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-002', received_at: '2026-03-28T10:10:00Z', processed_at: '2026-03-28T10:10:02Z' },
    { id: 'del-004', delivery_id: 'gh-del-1004', event_type: 'check_suite', payload: { action: 'completed', check_suite: { id: 5001 } }, signature_valid: true, processed_successfully: false, sd_id: null, received_at: '2026-03-28T10:15:00Z', processed_at: null },
    { id: 'del-005', delivery_id: 'gh-del-1005', event_type: 'push', payload: { ref: 'refs/heads/feature/auth', commits: [{ id: 'def456' }] }, signature_valid: false, processed_successfully: false, sd_id: null, received_at: '2026-03-28T10:20:00Z', processed_at: null },
    { id: 'del-006', delivery_id: 'gh-del-1006', event_type: 'deployment_status', payload: { deployment: { id: 7001 }, state: 'success' }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-001', received_at: '2026-03-28T10:25:00Z', processed_at: '2026-03-28T10:25:01Z' },
    { id: 'del-007', delivery_id: 'gh-del-1007', event_type: 'push', payload: { ref: 'refs/heads/main', commits: [{ id: 'ghi789' }] }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-003', received_at: '2026-03-28T10:30:00Z', processed_at: '2026-03-28T10:30:01Z' },
    { id: 'del-008', delivery_id: 'gh-del-1008', event_type: 'pull_request', payload: { action: 'synchronize', number: 43 }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-002', received_at: '2026-03-28T10:35:00Z', processed_at: '2026-03-28T10:35:02Z' },
    { id: 'del-009', delivery_id: 'gh-del-1009', event_type: 'workflow_run', payload: { action: 'requested', workflow_run: { id: 9002 } }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-003', received_at: '2026-03-28T10:40:00Z', processed_at: '2026-03-28T10:40:01Z' },
    { id: 'del-010', delivery_id: 'gh-del-1010', event_type: 'push', payload: { ref: 'refs/heads/fix/hotfix', commits: [{ id: 'jkl012' }] }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-001', received_at: '2026-03-28T10:45:00Z', processed_at: '2026-03-28T10:45:01Z' },
    { id: 'del-011', delivery_id: 'gh-del-1011', event_type: 'check_suite', payload: { action: 'requested', check_suite: { id: 5002 } }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-002', received_at: '2026-03-28T10:50:00Z', processed_at: '2026-03-28T10:50:01Z' },
    { id: 'del-012', delivery_id: 'gh-del-1012', event_type: 'pull_request', payload: { action: 'closed', number: 44 }, signature_valid: true, processed_successfully: true, sd_id: 'SD-TEST-003', received_at: '2026-03-28T10:55:00Z', processed_at: '2026-03-28T10:55:01Z' }
  ];

  const pipelineRuns = [
    { id: 'run-001', sd_id: 'SD-TEST-001', repository_name: 'rickfelix/ehg', workflow_name: 'CI', run_id: 'gh-run-2001', commit_sha: 'abc123def456', status: 'completed', conclusion: 'success', started_at: '2026-03-28T10:00:05Z', completed_at: '2026-03-28T10:03:00Z', job_details: { event: 'push', actor: 'rickfelix' } },
    { id: 'run-002', sd_id: 'SD-TEST-001', repository_name: 'rickfelix/ehg', workflow_name: 'Deploy', run_id: 'gh-run-2002', commit_sha: 'abc123def456', status: 'completed', conclusion: 'failure', started_at: '2026-03-28T10:05:05Z', completed_at: '2026-03-28T10:08:00Z', job_details: { event: 'push', actor: 'rickfelix' } },
    { id: 'run-003', sd_id: 'SD-TEST-002', repository_name: 'rickfelix/EHG_Engineer', workflow_name: 'CI', run_id: 'gh-run-2003', commit_sha: 'def456ghi789', status: 'in_progress', conclusion: null, started_at: '2026-03-28T10:10:05Z', completed_at: null, job_details: { event: 'workflow_run' } },
    { id: 'run-004', sd_id: 'SD-TEST-002', repository_name: 'rickfelix/EHG_Engineer', workflow_name: 'Security Scan', run_id: 'gh-run-2004', commit_sha: 'def456ghi789', status: 'completed', conclusion: 'success', started_at: '2026-03-28T10:15:00Z', completed_at: '2026-03-28T10:17:00Z', job_details: { event: 'check_suite' } },
    { id: 'run-005', sd_id: 'SD-TEST-003', repository_name: 'rickfelix/ehg', workflow_name: 'CI', run_id: 'gh-run-2005', commit_sha: 'ghi789jkl012', status: 'queued', conclusion: null, started_at: null, completed_at: null, job_details: null },
    { id: 'run-006', sd_id: null, repository_name: 'rickfelix/ehg', workflow_name: 'Lint', run_id: 'gh-run-2006', commit_sha: 'jkl012mno345', status: 'completed', conclusion: 'success', started_at: '2026-03-28T10:45:05Z', completed_at: '2026-03-28T10:46:00Z', job_details: { event: 'push' } }
  ];

  const scanEvents = [
    { id: 'scan-001', pipeline_run_id: 'run-001', scan_type: 'sast', findings_count: 3, severity_summary: { critical: 0, high: 1, medium: 1, low: 1 }, started_at: '2026-03-28T10:00:10Z', completed_at: '2026-03-28T10:01:30Z', status: 'completed' },
    { id: 'scan-002', pipeline_run_id: 'run-001', scan_type: 'dependency', findings_count: 1, severity_summary: { critical: 0, high: 0, medium: 1, low: 0 }, started_at: '2026-03-28T10:00:10Z', completed_at: '2026-03-28T10:01:00Z', status: 'completed' },
    { id: 'scan-003', pipeline_run_id: 'run-002', scan_type: 'secret', findings_count: 0, severity_summary: { critical: 0, high: 0, medium: 0, low: 0 }, started_at: '2026-03-28T10:05:10Z', completed_at: '2026-03-28T10:06:00Z', status: 'completed' },
    { id: 'scan-004', pipeline_run_id: 'run-004', scan_type: 'sast', findings_count: 7, severity_summary: { critical: 1, high: 2, medium: 3, low: 1 }, started_at: '2026-03-28T10:15:05Z', completed_at: '2026-03-28T10:16:30Z', status: 'completed' },
    { id: 'scan-005', pipeline_run_id: 'run-003', scan_type: 'container', findings_count: 0, severity_summary: { critical: 0, high: 0, medium: 0, low: 0 }, started_at: '2026-03-28T10:10:10Z', completed_at: null, status: 'running' }
  ];

  return { deliveries, pipelineRuns, scanEvents };
}

export function seed(repository) {
  const data = getSeedData();
  repository.clear();
  data.deliveries.forEach(d => repository.addDelivery(d));
  data.pipelineRuns.forEach(r => repository.addPipelineRun(r));
  data.scanEvents.forEach(e => repository.addScanEvent(e));
  return data;
}
