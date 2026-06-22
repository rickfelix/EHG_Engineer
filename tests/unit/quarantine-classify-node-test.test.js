// SD-REFILL-00CO4E8Q: classifyFile must distinguish a node:test-style file (valid under
// `node --test`, invisible to vitest -> "No test suite found") from a genuinely broken
// suite-load-error, so a manifest rebuild never re-lumps node:test files with dead tests.
import { describe, it, expect } from 'vitest';
import { classifyFile, classifyError } from '../../scripts/unit-tier-quarantine.mjs';

describe('classifyFile node:test detection (SD-REFILL-00CO4E8Q)', () => {
  const NO_SUITE = 'Error: No test suite found in file X';

  it('a node:test file with a no-suite error -> node-test-runner', () => {
    // tests/rank-items.test.js imports from 'node:test' (a real node:test file in this repo).
    expect(classifyFile('tests/rank-items.test.js', [NO_SUITE])).toBe('node-test-runner');
  });

  it('a non-node:test file with a missing-module error stays suite-load-error', () => {
    // A deleted/non-node:test path: not a node:test file, real load error preserved.
    expect(classifyFile('tests/unit/__nonexistent_dead__.test.js', ["Error: Cannot find module '/lib/gone.js'"]))
      .toBe('suite-load-error');
  });

  it('classifyError still maps no-suite / missing-module text to suite-load-error (text-only signal)', () => {
    expect(classifyError(NO_SUITE)).toBe('suite-load-error');
    expect(classifyError("Cannot find module '/x.js'")).toBe('suite-load-error');
  });
});
