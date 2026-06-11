/** A03: eva_hub_and_orchestration_model — EVA as central orchestration hub; no domain intelligence in EVA itself. */
export default {
  id: 'A03', name: 'eva_hub_and_orchestration_model',
  checks: [
    { id: 'A03-C1', label: 'EVA orchestrator exports processStage',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/eva-orchestrator.js', exportName: 'processStage' } },
    { id: 'A03-C2', label: 'Concurrent venture orchestrator exports class',
      type: 'export_exists', weight: 20,
      params: { module: 'lib/eva/concurrent-venture-orchestrator.js', exportName: 'ConcurrentVentureOrchestrator' } },
    { id: 'A03-C3', label: 'Stage-zero orchestrator exports executeStageZero',
      type: 'export_exists', weight: 20,
      params: { module: 'lib/eva/stage-zero/stage-zero-orchestrator.js', exportName: 'executeStageZero' } },
    { id: 'A03-C4', label: 'EVA orchestrator routes to stages without embedded domain logic',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/eva-orchestrator.js', pattern: 'stageTemplate|routeStage|dispatch|execute' } },
    { id: 'A03-C5', label: 'Orchestrator state machine exports validateStateTransition',
      type: 'export_exists', weight: 15,
      params: { module: 'lib/eva/orchestrator-state-machine.js', exportName: 'validateStateTransition' } },
  ],
};
