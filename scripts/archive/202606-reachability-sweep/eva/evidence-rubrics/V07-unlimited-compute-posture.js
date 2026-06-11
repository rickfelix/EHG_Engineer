/** V07: unlimited_compute_posture — System scales without artificial constraints; cost awareness not enforcement. */
export default {
  id: 'V07', name: 'unlimited_compute_posture',
  checks: [
    { id: 'V07-C1', label: 'Token tracker exports recordTokenUsage',
      type: 'export_exists', weight: 20,
      params: { module: 'lib/eva/utils/token-tracker.js', exportName: 'recordTokenUsage' } },
    { id: 'V07-C2', label: 'DFE cost_threshold trigger exists for awareness',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/decision-filter-engine.js', pattern: 'cost_threshold|costThreshold' } },
    { id: 'V07-C3', label: 'Compute posture scorer exports scoreComputePosture',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/compute-posture-scorer.js', exportName: 'scoreComputePosture' } },
    { id: 'V07-C4', label: 'No hard budget enforcement blocking LLM calls',
      type: 'anti_pattern', weight: 20,
      params: { glob: 'lib/eva/utils/token-tracker.js', pattern: 'throw.*budget|reject.*budget|block.*exceed', maxMatches: 0 } },
    { id: 'V07-C5', label: 'Governance compute posture exports getComputePosture',
      type: 'export_exists', weight: 15,
      params: { module: 'lib/governance/compute-posture.js', exportName: 'getComputePosture' } },
  ],
};
