import { describe, it, expect } from 'vitest';
import {
  assertNegativeControl,
  KNOWN_NEGATIVE_CONTROL_ROWS,
  assertCheckConstraintFloor,
  CHECK_CONSTRAINT_LITERAL_26_FLOOR,
} from '../../lib/audits/stage-census/negative-control.mjs';

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

// SD-LEO-INFRA-STAGE-KEYED-DATA-001 FR-2: CHECK-constraint sweep negative control.
describe('assertCheckConstraintFloor', () => {
  const makeRow = (n) => ({ table_name: `t${n}`, constraint_name: `c${n}`, definition: `CHECK (x <= 26) /* ${n} */` });

  it('passes when findings meet the floor', () => {
    const findings = Array.from({ length: CHECK_CONSTRAINT_LITERAL_26_FLOOR }, (_, i) => makeRow(i));
    const result = assertCheckConstraintFloor(findings);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(CHECK_CONSTRAINT_LITERAL_26_FLOOR);
  });

  it('passes when findings exceed the floor', () => {
    const findings = Array.from({ length: CHECK_CONSTRAINT_LITERAL_26_FLOOR + 5 }, (_, i) => makeRow(i));
    expect(() => assertCheckConstraintFloor(findings)).not.toThrow();
  });

  it('throws when findings fall below the floor (silent zero-match regression)', () => {
    const findings = Array.from({ length: CHECK_CONSTRAINT_LITERAL_26_FLOOR - 1 }, (_, i) => makeRow(i));
    expect(() => assertCheckConstraintFloor(findings)).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });

  it('throws when findings is empty', () => {
    expect(() => assertCheckConstraintFloor([])).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });

  it('throws when findings is not an array', () => {
    expect(() => assertCheckConstraintFloor(null)).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });

  it('respects a custom floor override', () => {
    const findings = [makeRow(1), makeRow(2)];
    expect(() => assertCheckConstraintFloor(findings, 2)).not.toThrow();
    expect(() => assertCheckConstraintFloor(findings, 3)).toThrow(/NEGATIVE_CONTROL_FAILED/);
  });
});
