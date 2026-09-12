/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-147 FR-2: chairman-decision constraint-sync validator.
 *
 * Pure-unit tests only (no live DB -- tests/database's db-tier vitest project is permanently
 * DB_TIER_BLOCKED in this repo, see tests/unit/scripts/discover-schema-constraints.test.js's
 * own header for why). findDeclaredDecisionValues reads real files on disk (the actual
 * lib/eva/stage-templates/ directory) deliberately -- that IS the live source of truth for
 * "what do the templates currently declare," mirroring the style of the registrar-adapter
 * tests earlier in this session that asserted real call shapes via injected fakes rather than
 * fully mocking the thing under test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findDeclaredDecisionValues,
  diffAgainstConstraint,
} from '../../../scripts/verify-chairman-decision-constraint-sync.mjs';

describe('findDeclaredDecisionValues (real stage-templates directory)', () => {
  it('finds stages 3, 5, and 13 with their documented decision values', () => {
    const found = findDeclaredDecisionValues('lib/eva/stage-templates');
    const byStage = Object.fromEntries(found.map((s) => [s.stageNumber, s.values]));
    expect(byStage[3]).toEqual(['pass', 'revise', 'kill']);
    expect(byStage[5]).toEqual(['pass', 'conditional_pass', 'kill']);
    expect(byStage[13]).toEqual(['pass', 'kill']);
  });

  it('never includes a stage using a different field name (gate_recommendation, verdict)', () => {
    const found = findDeclaredDecisionValues('lib/eva/stage-templates');
    const stageNumbers = found.map((s) => s.stageNumber);
    expect(stageNumbers).not.toContain(17); // gate_recommendation
    expect(stageNumbers).not.toContain(20); // verdict
  });

  it('source script never writes to a stage-template file (read-only contract, TR-1)', () => {
    const src = readFileSync('scripts/verify-chairman-decision-constraint-sync.mjs', 'utf8');
    expect(src).not.toMatch(/writeFileSync/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/ALTER TABLE/i);
  });
});

describe('diffAgainstConstraint', () => {
  it('TS-1: reports zero drift when every declared value is present in the live constraint', () => {
    const declared = [{ stageNumber: 3, file: 'stage-03.js', values: ['pass', 'revise', 'kill'] }];
    const live = ['pass', 'revise', 'kill', 'approve', 'reject'];
    expect(diffAgainstConstraint(declared, live)).toEqual([]);
  });

  it('TS-2: reports drift naming the exact missing value(s) when a declared value is absent from the live constraint', () => {
    const declared = [
      { stageNumber: 3, file: 'stage-03.js', values: ['pass', 'revise', 'kill'] },
      { stageNumber: 99, file: 'stage-99.js', values: ['pass', 'brand_new_value'] },
    ];
    const live = ['pass', 'revise', 'kill'];
    const drifted = diffAgainstConstraint(declared, live);
    expect(drifted).toHaveLength(1);
    expect(drifted[0]).toMatchObject({ stageNumber: 99, missing: ['brand_new_value'] });
  });

  it('pure: does not mutate its inputs', () => {
    const declared = [{ stageNumber: 3, file: 'stage-03.js', values: ['pass'] }];
    const live = ['pass'];
    diffAgainstConstraint(declared, live);
    expect(declared).toEqual([{ stageNumber: 3, file: 'stage-03.js', values: ['pass'] }]);
    expect(live).toEqual(['pass']);
  });
});
