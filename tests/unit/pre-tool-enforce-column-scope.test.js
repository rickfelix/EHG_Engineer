/**
 * QF-20260609-547: pre-tool-enforce.cjs column-validation scan must (1) NOT descend into jsonb-array
 * inner objects and (2) scope columns to the nearest preceding .from() in a multi-table command.
 * Both previously false-blocked valid commands (forcing write-to-file / split-command workarounds).
 *
 * Test shape: STATIC source-pins (matching tests/unit/harness/block-claims-cancelled.test.js). The
 * hook runs main() at load (so its pure functions can't be required) AND it self-enforces a repeat
 * blocker on identical commands (so subprocess exit-code assertions flake across runs), AND the
 * schema-preflight DB path is CI-only (the existing pre-tool-enforce-schema.test.js's DB assertions
 * also can't run locally). The actual extraction behavior (top-level-only keys; per-from() scoping)
 * was verified separately with a 6/6 pure-logic harness; these pins guard against regression.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const hookSrc = fs.readFileSync(path.resolve('scripts/hooks/pre-tool-enforce.cjs'), 'utf8');

describe('QF-20260609-547: column-scope / jsonb-descent fixes (source pins)', () => {
  it('defect 1: extracts only TOP-LEVEL mutation keys (balanced body + strip nested groups)', () => {
    expect(hookSrc).toMatch(/function balancedBody\(/);
    expect(hookSrc).toMatch(/function stripNestedGroups\(/);
    // the mutation extraction now reads the balanced top-level body with nested groups stripped
    expect(hookSrc).toMatch(/stripNestedGroups\(balancedBody\(command, openIdx\)\)/);
    // the new top-of-object matcher replaced the old flat descending pattern
    expect(hookSrc).toContain('mutHeadPattern');
    expect(hookSrc).not.toContain('mutationPattern');
  });

  it('stripNestedGroups collapses nested {..}/[..] so inner jsonb keys are not read as columns', () => {
    expect(hookSrc).toMatch(/\.replace\(\/\\\{\[\^\{\}\]\*\\\}\/g, 'null'\)/);
    expect(hookSrc).toMatch(/\.replace\(\/\\\[\[\^\\\[\\\]\]\*\\\]\/g, 'null'\)/);
  });

  it('defect 2: segments by .from() and validates each segment against its OWN table', () => {
    expect(hookSrc).toMatch(/function extractTableSegments\(/);
    expect(hookSrc).toMatch(/const segments = extractTableSegments\(command\)/);
    expect(hookSrc).toMatch(/for \(const seg of segments\)/);
    expect(hookSrc).toMatch(/validateOperation\(seg\.table, 'query', params\)/);
    // params are extracted per-segment text, not from the whole command
    expect(hookSrc).toMatch(/extractParams\(seg\.text\)/);
  });

  it('regression: validation is NOT disabled (still calls validateOperation; still fail-open)', () => {
    expect(hookSrc).toMatch(/validateOperation/);
    expect(hookSrc).toMatch(/Fail-open: validation errors never block execution/);
  });
});
