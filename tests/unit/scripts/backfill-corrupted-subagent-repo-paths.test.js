/**
 * tests/unit/scripts/backfill-corrupted-subagent-repo-paths.test.js
 *
 * SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 (FR-3). Coverage: the pure
 * detectCorruption() seam only — the DB-backed main()/scan logic is exercised
 * live via --dry-run, not unit-mocked, per this repo's convention for one-off
 * backfill CLIs (see tests/unit/backfill-canonical-lfa.test.js for the sibling
 * pattern: only the pure helpers get unit coverage).
 *
 * Named `.test.js` (not `.test.mjs`) so it is actually collected by vitest —
 * vitest.config.js's `unit` project include is `**\/*.test.js` only; a sibling
 * `.test.mjs` file would silently never run under `npm test`.
 */
import { describe, it, expect } from 'vitest';
import { detectCorruption } from '../../../scripts/backfill-corrupted-subagent-repo-paths.mjs';

describe('detectCorruption (SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 FR-3)', () => {
  it('flags the known-corrupted sample: dropped separators + literal embedded CR byte', () => {
    // "C:\Users\rickf\Projects\_EHG\EHG_Engineer" after JS string-escape
    // corruption: \U \P \_ \E dropped (backslash disappears, letters stay),
    // \r IS a recognized JS escape and becomes a literal 0x0D control byte —
    // the `\r` below is a REAL embedded carriage-return, not the two chars
    // backslash+r (this is the exact corrupted value observed live in
    // sub_agent_execution_results.metadata.repo_path).
    const corrupted = 'C:Users\rickfProjects_EHGEHG_Engineer';
    expect(corrupted).toBe('C:Users' + String.fromCharCode(0x0D) + 'ickfProjects_EHGEHG_Engineer');
    expect(detectCorruption(corrupted)).toBe(true);
  });

  it('does not flag a clean forward-slash path', () => {
    expect(detectCorruption('C:/Users/rickf/Projects/_EHG/EHG_Engineer')).toBe(false);
  });

  it('does not flag a clean Windows backslash path (backslash itself is not a control char)', () => {
    expect(detectCorruption('C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer')).toBe(false);
  });

  it('does not flag or throw on null/undefined/empty-string input', () => {
    expect(detectCorruption(null)).toBe(false);
    expect(detectCorruption(undefined)).toBe(false);
    expect(detectCorruption('')).toBe(false);
  });

  it('does not throw on non-string input (number/object)', () => {
    expect(detectCorruption(42)).toBe(false);
    expect(detectCorruption({ not: 'a string' })).toBe(false);
  });

  it('tab (\\x09) is intentionally NOT in the reject class', () => {
    expect(detectCorruption('C:/Users/rickf\t/Projects')).toBe(false);
  });

  it('flags any other C0 control character (e.g. \\x01)', () => {
    expect(detectCorruption('C:/Users/\x01rickf')).toBe(true);
  });

  it('flags a literal embedded newline (\\x0A) — regression test for a reject-class range bug', () => {
    // An earlier draft's regex was [\x00-\x08\x0B-\x1F], which silently excluded
    // \x0A (newline) alongside tab (\x09). A path containing "\node_modules"
    // (a directory name that appears throughout this repo) has its \n JS-escaped
    // into a literal embedded LF byte during hand-typed inline INSERT corruption,
    // exactly analogous to the \r -> CR case this whole SD exists to catch. Must
    // stay flagged.
    const corrupted = 'C:/Users/rickf' + String.fromCharCode(0x0A) + 'ode_modules';
    expect(detectCorruption(corrupted)).toBe(true);
  });
});
