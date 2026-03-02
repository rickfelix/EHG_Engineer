/** A06: lifecycle_stage_orchestration_and_artifact_versioning — 25-stage lifecycle with immutably versioned artifacts. */
export default {
  id: 'A06', name: 'lifecycle_stage_orchestration_and_artifact_versioning',
  checks: [
    { id: 'A06-C1', label: 'At least 25 stage template files exist',
      type: 'file_count', weight: 25,
      params: { glob: 'lib/eva/stage-templates/stage-*.js', minCount: 25 } },
    { id: 'A06-C2', label: 'Artifact versioning module exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/artifact-versioning.js' } },
    { id: 'A06-C3', label: 'Artifact version chain tracks lineage across stages',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/artifact-version-chain.js' } },
    { id: 'A06-C4', label: 'Venture state machine manages stage transitions',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/agents/venture-state-machine.js', pattern: 'transition|advance|nextStage|currentStage' } },
  ],
};
