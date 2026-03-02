/** A03: eva_hub_and_orchestration_model — EVA as central orchestration hub; no domain intelligence in EVA itself. */
export default {
  id: 'A03', name: 'eva_hub_and_orchestration_model',
  checks: [
    { id: 'A03-C1', label: 'EVA orchestrator exists as central hub',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/eva-orchestrator.js' } },
    { id: 'A03-C2', label: 'Concurrent venture orchestrator supports parallel execution',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/concurrent-venture-orchestrator.js' } },
    { id: 'A03-C3', label: 'Stage-zero orchestrator handles entry-point routing',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/stage-zero/stage-zero-orchestrator.js' } },
    { id: 'A03-C4', label: 'EVA orchestrator routes to stages without embedded domain logic',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/eva-orchestrator.js', pattern: 'stageTemplate|routeStage|dispatch|execute' } },
    { id: 'A03-C5', label: 'Orchestrator state machine manages transitions',
      type: 'file_exists', weight: 15,
      params: { glob: 'lib/eva/orchestrator-state-machine.js' } },
  ],
};
