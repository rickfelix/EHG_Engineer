/** V11: governance_guardrail_enforcement — All governance guardrails enforced at system boundaries. */
export default {
  id: 'V11', name: 'governance_guardrail_enforcement',
  checks: [
    { id: 'V11-C1', label: 'Guardrail validator exports validateGuardrails',
      type: 'export_exists', weight: 25,
      params: { module: 'scripts/modules/guardrails/guardrail-validator.js', exportName: 'validateGuardrails' } },
    { id: 'V11-C2', label: 'Guardrail registry defines named guardrails',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/governance/guardrail-registry.js', pattern: 'spending|comms|deletion|deploy|migration|security|scope|bulk' } },
    { id: 'V11-C3', label: 'Guardrail intelligence analyzer exports analyzeGuardrailResults',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/governance/guardrail-intelligence-analyzer.js', exportName: 'analyzeGuardrailResults' } },
    { id: 'V11-C4', label: 'Guardrail registry exports check enforcement function',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/governance/guardrail-registry.js', exportName: 'check' } },
  ],
};
