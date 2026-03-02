/** V07: unlimited_compute_posture — System scales without artificial constraints; cost awareness not enforcement. */
export default {
  id: 'V07', name: 'unlimited_compute_posture',
  checks: [
    { id: 'V07-C1', label: 'Token tracker records usage to venture_token_ledger',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/utils/token-tracker.js', pattern: 'venture_token_ledger|recordToken' } },
    { id: 'V07-C2', label: 'DFE cost_threshold trigger exists for awareness',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/decision-filter-engine.js', pattern: 'cost_threshold|costThreshold' } },
    { id: 'V07-C3', label: 'Compute posture scorer defaults to awareness mode',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/compute-posture-scorer.js', pattern: 'awareness|advisory|blockOnExceed.*false' } },
    { id: 'V07-C4', label: 'No hard budget enforcement blocking LLM calls',
      type: 'anti_pattern', weight: 20,
      params: { glob: 'lib/eva/utils/token-tracker.js', pattern: 'throw.*budget|reject.*budget|block.*exceed', maxMatches: 0 } },
    { id: 'V07-C5', label: 'Governance compute posture module exists',
      type: 'file_exists', weight: 15,
      params: { glob: 'lib/governance/compute-posture.js' } },
  ],
};
