/** V04: decision_filter_engine_escalation — Gates resolve automatically; Chairman escalation only through DFE triggers. */
export default {
  id: 'V04', name: 'decision_filter_engine_escalation',
  checks: [
    { id: 'V04-C1', label: 'Decision Filter Engine module exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/decision-filter-engine.js' } },
    { id: 'V04-C2', label: 'DFE has multiple trigger types defined',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/decision-filter-engine.js', pattern: 'cost|budget|tech|pivot|score|pattern|drift|vision' } },
    { id: 'V04-C3', label: 'DFE context adapter transforms venture context for evaluation',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/dfe-context-adapter.js' } },
    { id: 'V04-C4', label: 'Reality gates validate stage transitions automatically',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/reality-gates.js', pattern: 'evaluate|validate|gate' } },
  ],
};
