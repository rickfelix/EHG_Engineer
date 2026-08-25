import { describe, it, expect } from 'vitest';
import { assertNegativeControl, KNOWN_NEGATIVE_CONTROL_ROWS } from '../../lib/audits/stage-census/negative-control.mjs';

// TS-1 (success path, unit-level): both known-live rows present -> passes.
// TS-2 (failure path): either known-live row missing -> throws / non-zero-exit signal.
describe('assertNegativeControl', () => {
  it('passes when both known-live mismatch rows are present', () => {
    const findings = [
      { stage_number: 21, component_path: 'Stage22DistributionSetup.tsx' },
      { stage_number: 22, component_path: 'Stage21VisualAssets.tsx' },
      { stage_number: 23, component_path: 'Stage23SomethingElse.tsx' }, // unrelated extra row
    ];
    const result = assertNegativeControl(findings);
    expect(result.ok).toBe(true);
    expect(result.matched).toEqual(KNOWN_NEGATIVE_CONTROL_ROWS);
  });

  it('throws when the stage 21 mismatch row is missing', () => {
    const findings = [
      { stage_number: 22, component_path: 'Stage21VisualAssets.tsx' },
    ];
    expect(() => assertNegativeControl(findings)).toThrow(/NEGATIVE_CONTROL_FAILED/);
    expect(() => assertNegativeControl(findings)).toThrow(/stage_number=21/);
  });

  it('throws when the stage 22 mismatch row is missing', () => {
    const findings = [
      { stage_number: 21, component_path: 'Stage22DistributionSetup.tsx' },
    ];
    expect(() => assertNegativeControl(findings)).toThrow(/stage_number=22/);
  });

  it('throws when findings is empty', () => {
    expect(() => assertNegativeControl([])).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });

  it('throws when findings is not an array', () => {
    expect(() => assertNegativeControl(undefined)).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });
});
