/** V02: chairman_governance_model — AI-only operation with Chairman review of decisions, not data. */
export default {
  id: 'V02', name: 'chairman_governance_model',
  checks: [
    { id: 'V02-C1', label: 'Chairman decision watcher exists and polls for decisions',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/chairman-decision-watcher.js', pattern: 'pending|queue|poll|watch' } },
    { id: 'V02-C2', label: 'Chairman preference store manages thresholds',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/chairman-preference-store.js' } },
    { id: 'V02-C3', label: 'Chairman override tracker at stage entry',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/stage-zero/chairman-override-tracker.js', pattern: 'override|authority|veto' } },
    { id: 'V02-C4', label: 'No auto-approval or timeout bypass in chairman modules',
      type: 'anti_pattern', weight: 25,
      params: { glob: 'lib/eva/chairman-decision-watcher.js', pattern: 'autoApprove|auto_approve|forceApprove', maxMatches: 0 } },
    { id: 'V02-C5', label: 'Chairman backend modules exist (>=5 chairman-*.js)',
      type: 'file_count', weight: 15,
      params: { glob: 'lib/eva/chairman-*.js', minCount: 5 } },
  ],
};
