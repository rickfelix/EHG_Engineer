/** V04: decision_filter_engine_escalation — Gates resolve automatically; Chairman escalation only through DFE triggers. */
export default {
  id: 'V04', name: 'decision_filter_engine_escalation',
  checks: [
    { id: 'V04-C1', label: 'DFE exports evaluateDecision function',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/decision-filter-engine.js', exportName: 'evaluateDecision' } },
    { id: 'V04-C2', label: 'DFE has multiple trigger types defined',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/decision-filter-engine.js', pattern: 'cost|budget|tech|pivot|score|pattern|drift|vision' } },
    { id: 'V04-C3', label: 'DFE context adapter exports transformForPresentation',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/dfe-context-adapter.js', exportName: 'transformForPresentation' } },
    { id: 'V04-C4', label: 'Reality gates export evaluateRealityGate',
      type: 'export_exists', weight: 30,
      params: { module: 'lib/eva/reality-gates.js', exportName: 'evaluateRealityGate' } },
  ],
};
