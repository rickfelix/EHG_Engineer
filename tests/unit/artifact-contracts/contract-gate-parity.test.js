/**
 * SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001 — contract<->gate parity + scaffolds + errors.
 *
 * The load-bearing property: after the gate-source inversion, add-prd's
 * validateContentPayloadShape (now contract-derived, mode:'shape') accepts and
 * rejects EXACTLY what the previous hand-rolled implementation did. The legacy
 * behavior is pinned here as a reference implementation (copied verbatim from
 * the pre-inversion function) and both are run over a corpus of valid payloads
 * + one payload per documented trap.
 */
import { describe, it, expect } from 'vitest';
import { validateArtifact, formatViolations, scaffold, PRD_FIELD_SPECS, SD_FIELD_SPECS } from '../../../lib/artifact-contracts/index.js';
import { validateContentPayloadShape } from '../../../scripts/add-prd-to-database.js';
import { validateMetricsSufficiency } from '../../../scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js';

// ─── Legacy reference implementation (pre-inversion, verbatim semantics) ───
function legacyShapeErrors(payload) {
  const errors = [];
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const expectArray = (key) => {
    if (!(key in payload)) return;
    if (!Array.isArray(payload[key])) errors.push(key);
  };
  const expectObject = (key) => {
    if (!(key in payload)) return;
    const v = payload[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) errors.push(key);
  };
  const expectArrayOfObjects = (key) => {
    if (!(key in payload)) return;
    if (!Array.isArray(payload[key])) { errors.push(key); return; }
    payload[key].forEach((item, idx) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) errors.push(`${key}[${idx}]`);
    });
  };
  expectArrayOfObjects('functional_requirements');
  expectArrayOfObjects('technical_requirements');
  expectArrayOfObjects('test_scenarios');
  expectArrayOfObjects('risks');
  expectArrayOfObjects('smoke_test_steps');
  expectArray('acceptance_criteria');
  expectArray('strategic_objectives');
  expectArray('key_changes');
  expectObject('integration_operationalization');
  expectObject('metadata');
  expectObject('system_architecture');
  expectObject('implementation_approach');
  if (
    payload.system_architecture && typeof payload.system_architecture === 'object' &&
    !Array.isArray(payload.system_architecture) &&
    'components' in payload.system_architecture &&
    !Array.isArray(payload.system_architecture.components)
  ) {
    errors.push('system_architecture.components');
  }
  return errors;
}

// ─── Corpus: valid payloads + one per documented trap ───
const CORPUS = {
  valid_full: scaffold('prd'),
  valid_minimal: { executive_summary: 'x' },
  valid_empty: {},
  trap_io_as_array: { integration_operationalization: [] },
  trap_fr_as_strings: { functional_requirements: ['just a string'] },
  trap_risks_as_object: { risks: {} },
  trap_arch_components_string: { system_architecture: { components: 'not-an-array' } },
  trap_impl_approach_string: { implementation_approach: 'a string' },
  trap_smoke_steps_object: { smoke_test_steps: { step_number: 1 } },
  trap_key_changes_object: { key_changes: {} },
  trap_metadata_array: { metadata: [] },
  trap_fr_nested_array_item: { functional_requirements: [{ id: 'FR-1' }, ['nested-array']] },
};

describe('contract<->gate parity (mode:shape vs legacy implementation)', () => {
  for (const [name, payload] of Object.entries(CORPUS)) {
    it(`parity: ${name}`, () => {
      const legacy = legacyShapeErrors(payload);
      const { violations } = validateArtifact('prd', payload, { mode: 'shape' });
      const contractFields = violations.map((v) => v.field).sort();
      const legacyFields = legacy.map((k) => k).sort();
      expect(contractFields, `field sets must match legacy for ${name}`).toEqual(legacyFields);
    });
  }

  it('the WIRED gate (validateContentPayloadShape) rejects traps with CONTENT_SHAPE_VIOLATION + hints', () => {
    let threw = null;
    try { validateContentPayloadShape(CORPUS.trap_io_as_array); } catch (e) { threw = e; }
    expect(threw).toBeTruthy();
    expect(threw.code).toBe('CONTENT_SHAPE_VIOLATION');
    expect(threw.message).toMatch(/integration_operationalization/);
    expect(threw.message).toMatch(/expected object, got array/);
    expect(threw.message).toMatch(/hint:/);                 // self-describing (FR-3)
    expect(threw.message).toMatch(/contract:check/);        // points authors at the tooling
  });

  it('the WIRED gate still accepts valid payloads (no behavior change)', () => {
    expect(() => validateContentPayloadShape(CORPUS.valid_full)).not.toThrow();
    expect(() => validateContentPayloadShape(CORPUS.valid_minimal)).not.toThrow();
    expect(() => validateContentPayloadShape(CORPUS.valid_empty)).not.toThrow();
  });

  it('shape mode does NOT enforce authoring-only rules (required keys, minItems, exactKeys)', () => {
    // {} has none of the required fields and io with wrong keys is absent — shape mode passes.
    expect(validateArtifact('prd', {}, { mode: 'shape' }).valid).toBe(true);
    // exactKeys not enforced in shape mode (gate parity: legacy only checked object-ness)
    const partialIo = { integration_operationalization: { consumers: [] } };
    expect(validateArtifact('prd', partialIo, { mode: 'shape' }).valid).toBe(true);
  });
});

describe('authoring mode (strict, what contract:check runs)', () => {
  it('scaffold(prd) passes its own authoring validation', () => {
    const r = validateArtifact('prd', scaffold('prd'), { mode: 'authoring' });
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('scaffold(sd) passes its own authoring validation with zero violations', () => {
    const r = validateArtifact('sd', scaffold('sd'), { mode: 'authoring' });
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('authoring mode enforces integration_operationalization EXACT keys', () => {
    const payload = { ...scaffold('prd'), integration_operationalization: { consumers: [], wrong_key: [] } };
    const r = validateArtifact('prd', payload, { mode: 'authoring' });
    const v = r.violations.find((x) => x.field === 'integration_operationalization');
    expect(v).toBeTruthy();
    expect(v.expected).toMatch(/consumers, dependencies, data_contracts, runtime_config, observability_rollout/);
  });

  it('authoring mode enforces functional_requirements >=3', () => {
    const payload = { ...scaffold('prd'), functional_requirements: [{ id: 'FR-1', title: 't', description: 'd' }] };
    const r = validateArtifact('prd', payload, { mode: 'authoring' });
    expect(r.violations.some((x) => x.field === 'functional_requirements' && /(>=|≥)3/.test(x.expected))).toBe(true);
  });

  it('SD metrics validation DELEGATES to the canonical validateMetricsSufficiency', () => {
    const sd = { ...scaffold('sd'), success_metrics: [{ metric: 'only one', target: '>=1', actual: '0' }], success_criteria: undefined };
    delete sd.success_criteria;
    const canonical = validateMetricsSufficiency(sd);
    const r = validateArtifact('sd', sd, { mode: 'authoring' });
    // contract verdict mirrors the canonical function
    expect(r.violations.some((x) => x.field === 'success_metrics')).toBe(!canonical.pass);
  });

  it('SD duplicate metrics fail (canonical dedup) — padding does not help', () => {
    const m = { metric: 'same text', target: '>=1', actual: '0' };
    const sd = { ...scaffold('sd'), success_metrics: [m, { ...m }, { ...m }] };
    const r = validateArtifact('sd', sd, { mode: 'authoring' });
    expect(r.violations.some((x) => x.field === 'success_metrics')).toBe(true);
  });

  it('boilerplate smoke steps produce ADVISORY warnings, not violations', () => {
    const sd = {
      ...scaffold('sd'),
      smoke_test_steps: [{ step_number: 1, instruction: 'Run the modified script/gate for: X', expected_outcome: 'Script executes without errors' }],
    };
    const r = validateArtifact('sd', sd, { mode: 'authoring' });
    expect(r.warnings.some((w) => w.field.startsWith('smoke_test_steps'))).toBe(true);
    expect(r.violations.some((v) => v.field.startsWith('smoke_test_steps['))).toBe(false);
  });

  it('SD key_changes as strings violates (DB CHECK key_changes_is_array shape)', () => {
    const sd = { ...scaffold('sd'), key_changes: ['a string change'] };
    const r = validateArtifact('sd', sd, { mode: 'authoring' });
    expect(r.violations.some((x) => x.field === 'key_changes[0]')).toBe(true);
  });
});

describe('self-describing errors + spec completeness', () => {
  it('violations carry field/expected/got/hint', () => {
    const { violations } = validateArtifact('prd', CORPUS.trap_io_as_array, { mode: 'shape' });
    expect(violations.length).toBe(1);
    const v = violations[0];
    expect(v.field).toBe('integration_operationalization');
    expect(v.expected).toBe('object');
    expect(v.got).toBe('array');
    expect(v.hint).toMatch(/exact/i);
  });

  it('formatViolations renders field + expected + hint lines', () => {
    const { violations } = validateArtifact('prd', CORPUS.trap_io_as_array, { mode: 'shape' });
    const out = formatViolations(violations);
    expect(out).toMatch(/\.integration_operationalization: expected object, got array/);
    expect(out).toMatch(/hint:/);
  });

  it('every spec entry has a non-empty hint and gate attribution', () => {
    for (const spec of [...PRD_FIELD_SPECS, ...SD_FIELD_SPECS]) {
      expect(spec.hint, `${spec.field} missing hint`).toBeTruthy();
      expect(spec.gate, `${spec.field} missing gate attribution`).toBeTruthy();
    }
  });
});
