/**
 * Harness-truncation detection in the protocol file tracker.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-0 / TS-1.
 *
 * WHY A NEW FILE: all four pre-existing hosts (tests/unit/protocol-file-read-gate.test.js,
 * protocol-file-read-cross-mode.test.js, and both under partial-read-detection/) are in
 * tests/quarantine-manifest.json and resolve ZERO tests under the `unit` project. Adding these
 * assertions there would have printed nothing and read as green.
 *
 * The payload shapes below are RECORDED, not invented: captured from live PostToolUse hook input
 * by reading CLAUDE_ADAM.md twice — once with limit=5 (control) and once un-paginated (truncated
 * at line 176/492, harness-reported 41,399 tokens against a 25,000 cap). `truncatedByTokenCap`
 * appeared ONLY on the truncated read.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { deriveReadCoverage } = require('../../scripts/hooks/protocol-file-tracker.cjs');

// Un-paginated read of an over-cap file. No limit/offset — the operator asked for the whole file
// and the harness silently returned 36% of it.
const TRUNCATED = {
  tool_input: { file_path: 'C:/repo/CLAUDE_ADAM.md' },
  tool_response: {
    type: 'text',
    file: { filePath: 'C:/repo/CLAUDE_ADAM.md', content: 'x'.repeat(58696), numLines: 176, startLine: 1, totalLines: 492, truncatedByTokenCap: true }
  }
};

// Deliberate pagination. Partial by operator choice — key ABSENT, not false.
const PAGINATED = {
  tool_input: { file_path: 'C:/repo/CLAUDE_ADAM.md', limit: 5 },
  tool_response: {
    type: 'text',
    file: { filePath: 'C:/repo/CLAUDE_ADAM.md', content: 'x'.repeat(322), numLines: 5, startLine: 1, totalLines: 492 }
  }
};

// A file that fits in one call. The load-bearing control.
const COMPLETE = {
  tool_input: { file_path: 'C:/repo/CLAUDE_CORE_DIGEST.md' },
  tool_response: {
    type: 'text',
    file: { filePath: 'C:/repo/CLAUDE_CORE_DIGEST.md', content: 'x'.repeat(5306), numLines: 140, startLine: 1, totalLines: 140 }
  }
};

// The pre-fix derivation, pinned verbatim so the regression cannot silently return.
const legacyDerive = (h) => {
  const i = h.tool_input || {};
  return (i.limit !== undefined && i.limit !== null) || (i.offset !== undefined && i.offset !== null);
};

describe('deriveReadCoverage — harness truncation (FR-0)', () => {
  it('pins the defect: the old input-only derivation calls a truncated read COMPLETE', () => {
    // This is the inverted gauge the SD exists to fix. It passed on a 165%-over-cap file.
    expect(legacyDerive(TRUNCATED)).toBe(false);
    // ...while flagging correct pagination as the problem.
    expect(legacyDerive(PAGINATED)).toBe(true);
  });

  it('treats a harness-truncated read as partial', () => {
    const r = deriveReadCoverage(TRUNCATED);
    expect(r.isPartialRead).toBe(true);
    expect(r.truncatedByHarness).toBe(true);
  });

  it('records the lines ACTUALLY returned, not the full-file request that did not happen', () => {
    // {offset:1, limit:null} would claim total coverage and let unionRangeCoverage credit 100%.
    expect(deriveReadCoverage(TRUNCATED).range).toEqual({ offset: 1, limit: 176 });
  });

  it('CONTROL: a read that fits in one call stays NON-partial', () => {
    // Without this, "flag everything partial" passes every other assertion in this file.
    const r = deriveReadCoverage(COMPLETE);
    expect(r.isPartialRead).toBe(false);
    expect(r.truncatedByHarness).toBe(false);
    expect(r.range).toEqual({ offset: 1, limit: null });
  });

  it('CONTROL: deliberate pagination stays partial, and is NOT mislabelled as truncation', () => {
    const r = deriveReadCoverage(PAGINATED);
    expect(r.isPartialRead).toBe(true);
    expect(r.truncatedByHarness).toBe(false);
    expect(r.range).toEqual({ offset: 1, limit: 5 });
  });

  it('does not infer truncation from line arithmetic', () => {
    // startLine+numLines-1 < totalLines is TRUE for PAGINATED (1+5-1=5 < 492). Deriving
    // truncation that way re-creates the same inversion wearing a fix's label.
    expect(deriveReadCoverage(PAGINATED).truncatedByHarness).toBe(false);
  });

  it('a MISSING truncatedByTokenCap is not a negative result derived from truthiness', () => {
    const falsey = { tool_input: { file_path: '/r/CLAUDE_ADAM.md' }, tool_response: { file: { numLines: 10, startLine: 1, totalLines: 10, truncatedByTokenCap: false } } };
    expect(deriveReadCoverage(falsey).truncatedByHarness).toBe(false);
    // and a malformed/absent tool_response must not throw or silently claim completeness
    expect(deriveReadCoverage({ tool_input: { file_path: '/r/CLAUDE_ADAM.md' } }).isPartialRead).toBe(false);
    expect(deriveReadCoverage({}).truncatedByHarness).toBe(false);
  });
});
