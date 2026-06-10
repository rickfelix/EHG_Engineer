/**
 * PRD artifact contract — the single declarative shape-spec source for PRD
 * authoring payloads (SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001).
 *
 * Two consumption modes:
 *   - 'shape' (gate parity): EXACTLY what scripts/add-prd-to-database.js
 *     validateContentPayloadShape enforces today — type/shape of keys WHEN
 *     PRESENT. add-prd derives its checks from this table (the v1 gate-source
 *     inversion); behavior-identical by parity test.
 *   - 'authoring' (strict): everything 'shape' checks PLUS required keys,
 *     minimum counts, and exact-key sets that downstream quality gates
 *     (scripts/prd/quality-validator.js, grounding scorer) enforce later.
 *     Used by `npm run contract:check` so authors discover the full contract
 *     BEFORE burning sub-agent orchestration — not by failing gates one at
 *     a time.
 *
 * Every spec entry carries a `hint` quoting the folklore lesson that used to
 * live only in validator code + session memories.
 */

/**
 * @typedef {Object} FieldSpec
 * @property {string} field        top-level payload key
 * @property {'array'|'object'|'arrayOfObjects'|'string'} shape
 * @property {boolean} [required]      enforced in authoring mode only
 * @property {number}  [minItems]      enforced in authoring mode only
 * @property {string[]} [exactKeys]    enforced in authoring mode only
 * @property {string[]} [itemKeys]     advisory: expected keys per item (scaffold + hints)
 * @property {{path:string, shape:string}[]} [nested]  nested shape checks (shape mode)
 * @property {string}  hint
 * @property {string}  gate            which gate/validator enforces this downstream
 */

/** @type {FieldSpec[]} */
export const PRD_FIELD_SPECS = [
  {
    field: 'executive_summary', shape: 'string', required: true,
    hint: 'Required by the PRD quality gate; 2-5 sentences grounding the SD intent.',
    gate: 'scripts/prd/quality-validator.js',
  },
  {
    field: 'functional_requirements', shape: 'arrayOfObjects', required: true, minItems: 3,
    itemKeys: ['id', 'title', 'description', 'priority', 'acceptance_criteria'],
    hint: 'Array of OBJECTS (strings fail SHAPE_VIOLATION). >=3 required by the DB functional_requirements_min_count. The grounding validator scores title + requirement + description (deduped) — write the rich SD-vocabulary body in any of those fields (SD-FDBK-FIX-FIX-PRD-GROUNDING-001).',
    gate: 'add-prd shape + quality-validator + lib/prd-grounding-validator.js',
  },
  {
    field: 'technical_requirements', shape: 'arrayOfObjects',
    itemKeys: ['id', 'title', 'description'],
    hint: 'Array of objects when present.',
    gate: 'add-prd shape',
  },
  {
    field: 'test_scenarios', shape: 'arrayOfObjects',
    itemKeys: ['id', 'scenario', 'type', 'expected'],
    hint: 'Array of objects when present.',
    gate: 'add-prd shape',
  },
  {
    field: 'risks', shape: 'arrayOfObjects',
    itemKeys: ['risk', 'mitigation', 'severity'],
    hint: 'Array of objects ({} instead of [] fails SHAPE_VIOLATION).',
    gate: 'add-prd shape',
  },
  {
    field: 'smoke_test_steps', shape: 'arrayOfObjects',
    itemKeys: ['step_number', 'instruction', 'expected_outcome'],
    hint: 'Array of {step_number, instruction, expected_outcome}. Write CONCRETE observable steps — boilerplate like "Run the modified script" fails SMOKE_TEST_SPECIFICATION at LEAD-TO-PLAN. NOTE: the gate reads the SD-level TOP-LEVEL smoke_test_steps column (not PRD metadata).',
    gate: 'add-prd shape + SMOKE_TEST_SPECIFICATION (SD-level)',
  },
  {
    field: 'acceptance_criteria', shape: 'array',
    hint: 'Loose array (item shape varies).',
    gate: 'add-prd shape',
  },
  {
    field: 'strategic_objectives', shape: 'array',
    hint: 'Loose array.',
    gate: 'add-prd shape',
  },
  {
    field: 'key_changes', shape: 'array',
    hint: 'Loose array at the PRD layer. (The SD-level key_changes column is stricter: array of {change, type} objects — see the SD contract.)',
    gate: 'add-prd shape',
  },
  {
    field: 'integration_operationalization', shape: 'object', required: true,
    exactKeys: ['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout'],
    hint: 'An OBJECT (an array here is the classic trap), with EXACTLY these keys: consumers, dependencies, data_contracts, runtime_config, observability_rollout. The GATE_INTEGRATION_SECTION_VALIDATION gate at PLAN-TO-EXEC expects this exact key set.',
    gate: 'add-prd shape + GATE_INTEGRATION_SECTION_VALIDATION',
  },
  {
    field: 'metadata', shape: 'object',
    hint: 'Object when present.',
    gate: 'add-prd shape',
  },
  {
    field: 'system_architecture', shape: 'object',
    nested: [{ path: 'components', shape: 'array' }],
    hint: 'Object with a components ARRAY — a non-array components crashes scripts/prd/formatters.js downstream (SD-LEO-INFRA-HARDEN-ADD-PRD-001).',
    gate: 'add-prd shape (nested components check)',
  },
  {
    field: 'implementation_approach', shape: 'object',
    hint: 'Object when present (string fails SHAPE_VIOLATION).',
    gate: 'add-prd shape',
  },
  {
    field: 'activation_test_id', shape: 'string',
    hint: 'ADVISORY (not shape-enforced): code-producing SDs FAIL GATE_ACTIVATION_INVARIANT at LEAD-FINAL-APPROVAL unless product_requirements_v2.activation_test_id holds a relative test path that exists on disk AND the TESTING evidence row carries metadata.activation_invariant_verified=true. Set it at PRD authoring time.',
    gate: 'GATE_ACTIVATION_INVARIANT (LEAD-FINAL-APPROVAL)',
  },
];

/** A minimal valid PRD authoring payload (passes authoring-mode validation). */
export function scaffoldPrd() {
  return {
    executive_summary: 'One-paragraph summary: the problem, the delivered change, and the verification story, grounded in the SD vocabulary.',
    functional_requirements: [
      { id: 'FR-1', title: 'First functional requirement', description: 'Rich SD-vocabulary description of the behavior delivered (this field is grounding-scored).', priority: 'critical', acceptance_criteria: ['Observable criterion 1'] },
      { id: 'FR-2', title: 'Second functional requirement', description: 'Description with concrete file paths / behaviors.', priority: 'high', acceptance_criteria: ['Observable criterion 2'] },
      { id: 'FR-3', title: 'Third functional requirement', description: 'At least 3 FRs are required by the DB constraint.', priority: 'medium', acceptance_criteria: ['Observable criterion 3'] },
    ],
    technical_requirements: [
      { id: 'TR-1', title: 'Technical constraint', description: 'e.g. single-file, additive, no schema change.' },
    ],
    test_scenarios: [
      { id: 'TS-1', scenario: 'Core behavior', type: 'unit', expected: 'Observable expected outcome' },
    ],
    acceptance_criteria: ['Top-level acceptance criterion'],
    risks: [
      { risk: 'Primary risk', mitigation: 'How it is contained', severity: 'low' },
    ],
    integration_operationalization: {
      consumers: ['Who/what consumes this change'],
      dependencies: ['What this change depends on'],
      data_contracts: ['Schema/data contracts touched or "none"'],
      runtime_config: ['Env vars/flags or "none"'],
      observability_rollout: ['How rollout is observed/verified'],
    },
    system_architecture: {
      summary: 'One-line architecture summary.',
      components: [{ name: 'path/to/component', change: 'NEW or what changes' }],
    },
    implementation_approach: {
      summary: 'One-line approach.',
      steps: ['Step 1', 'Step 2'],
    },
    smoke_test_steps: [
      { step_number: 1, instruction: 'Concrete command or user action', expected_outcome: 'Concrete observable outcome' },
      { step_number: 2, instruction: 'Second concrete step', expected_outcome: 'Second observable outcome' },
      { step_number: 3, instruction: 'Third concrete step', expected_outcome: 'Third observable outcome' },
    ],
    metadata: { sd_key: 'SD-XXX-001' },
  };
}
