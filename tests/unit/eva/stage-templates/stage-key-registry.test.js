// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001.
// This is the regression guard for the exact defect class this SD closes: a
// template's position (stage_number, via its filename) silently drifting out of
// sync with its content (stage_key) across a renumber, with nothing catching it.
import { describe, it, expect } from 'vitest';
import { STAGE_KEY_BY_NUMBER, validateStageKeyBinding } from '../../../../lib/eva/stage-templates/stage-key-registry.js';
import { StageRegistry } from '../../../../lib/eva/stage-registry.js';
import stage23 from '../../../../lib/eva/stage-templates/stage-23.js';
import stage24 from '../../../../lib/eva/stage-templates/stage-24.js';
import stage25 from '../../../../lib/eva/stage-templates/stage-25.js';
import stage26 from '../../../../lib/eva/stage-templates/stage-26.js';
import stage27 from '../../../../lib/eva/stage-templates/stage-27.js';

describe('validateStageKeyBinding', () => {
  it('is a silent no-op for a template with no declared stageKey (opt-in, stages 1-22)', () => {
    expect(validateStageKeyBinding(5, {})).toEqual({ valid: true, skipped: true });
  });

  it('is a silent no-op for a stage_number outside the known map', () => {
    expect(validateStageKeyBinding(999, { stageKey: 'anything' })).toEqual({ valid: true, skipped: true });
  });

  it('passes when the declared stageKey matches the expected position', () => {
    const result = validateStageKeyBinding(23, { stageKey: 'dedicated_venture_uat' });
    expect(result.valid).toBe(true);
    expect(result.expected).toBe('dedicated_venture_uat');
  });

  it('FAILS LOUD when the declared stageKey does not match the position (the exact drift class this SD closes)', () => {
    // Simulates the pre-fix bug: Launch Readiness content still sitting at 23.
    const result = validateStageKeyBinding(23, { stageKey: 'launch_readiness_gate' });
    expect(result.valid).toBe(false);
    expect(result.expected).toBe('dedicated_venture_uat');
    expect(result.actual).toBe('launch_readiness_gate');
  });
});

describe('StageRegistry.register() enforces the binding (not just the pure checker)', () => {
  it('throws when registering a mismatched template at a position that declares a stageKey', () => {
    const registry = new StageRegistry();
    expect(() => registry.register(24, { stageKey: 'go_live' })).toThrow(/stage_key mismatch/);
  });

  it('accepts a correctly-bound template', () => {
    const registry = new StageRegistry();
    expect(() => registry.register(24, { stageKey: 'launch_readiness_gate' })).not.toThrow();
    expect(registry.get(24)).toEqual({ stageKey: 'launch_readiness_gate' });
  });

  it('accepts a template with no declared stageKey unconditionally (backward-compat for stages 1-22)', () => {
    const registry = new StageRegistry();
    expect(() => registry.register(5, { id: 'stage-05' })).not.toThrow();
  });
});

describe('the live 23-27 template files bind to their SSOT-declared position', () => {
  const live = { 23: stage23, 24: stage24, 25: stage25, 26: stage26, 27: stage27 };
  for (const [stageNumber, template] of Object.entries(live)) {
    it(`stage-${stageNumber}.js declares stageKey="${STAGE_KEY_BY_NUMBER[stageNumber]}"`, () => {
      expect(validateStageKeyBinding(Number(stageNumber), template).valid).toBe(true);
      expect(template.stageKey).toBe(STAGE_KEY_BY_NUMBER[stageNumber]);
    });
  }
});
