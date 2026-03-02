/** V11: governance_guardrail_enforcement — All governance guardrails enforced at system boundaries. */
export default {
  id: 'V11', name: 'governance_guardrail_enforcement',
  checks: [
    { id: 'V11-C1', label: 'Guardrail validator module exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'scripts/modules/guardrails/guardrail-validator.js' } },
    { id: 'V11-C2', label: 'Guardrail registry defines named guardrails',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/governance/guardrail-registry.js', pattern: 'spending|comms|deletion|deploy|migration|security|scope|bulk' } },
    { id: 'V11-C3', label: 'Guardrail intelligence analyzer detects violations',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/governance/guardrail-intelligence-analyzer.js' } },
    { id: 'V11-C4', label: 'Guardrail validator checks multiple named guardrails',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/modules/guardrails/guardrail-validator.js', pattern: 'validate|enforce|check' } },
  ],
};
