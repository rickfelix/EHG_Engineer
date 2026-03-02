/** A06: lifecycle_stage_orchestration_and_artifact_versioning — 25-stage lifecycle with immutably versioned artifacts. */
export default {
  id: 'A06', name: 'lifecycle_stage_orchestration_and_artifact_versioning',
  checks: [
    { id: 'A06-C1', label: 'At least 25 stage template files exist',
      type: 'file_count', weight: 25,
      params: { glob: 'lib/eva/stage-templates/stage-*.js', minCount: 25 } },
    { id: 'A06-C2', label: 'Artifact versioning exports createVersionedArtifact',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/artifact-versioning.js', exportName: 'createVersionedArtifact' } },
    { id: 'A06-C3', label: 'Artifact version chain exports createChain',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/artifact-version-chain.js', exportName: 'createChain' } },
    { id: 'A06-C4', label: 'Venture state machine exports VentureStateMachine class',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/agents/venture-state-machine.js', exportName: 'VentureStateMachine' } },
  ],
};
