/**
 * parseTargetReposArg unit tests
 * SD-LEO-INFRA-LEO-CREATE-CROSS-001 (FR-5)
 *
 * Verifies the --target-repos flag parser exported from scripts/leo-create-sd.js.
 * Pure function: validates against ALLOWED_REPOS, normalizes case, dedups.
 * Invalid input → console.error([INVALID_TARGET_REPOS] ...) + process.exit(1).
 *
 * Writer/consumer parity: ALLOWED_REPOS = {EHG, EHG_Engineer} matches the
 * canonical names accepted by computeReposForSD() in
 * scripts/modules/handoff/executors/lead-final-approval/gates.js
 * (SD-LEO-INFRA-CROSS-REPO-MERGE-001).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseTargetReposArg, ALLOWED_REPOS } from '../../scripts/leo-create-sd.js';

describe('parseTargetReposArg (SD-LEO-INFRA-LEO-CREATE-CROSS-001)', () => {
  let exitSpy, errorSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('FR-5a: single repo → array with one canonical entry', () => {
    expect(parseTargetReposArg('EHG')).toEqual(['EHG']);
    expect(parseTargetReposArg('EHG_Engineer')).toEqual(['EHG_Engineer']);
  });

  it('FR-5b: both repos comma-separated → preserves order', () => {
    expect(parseTargetReposArg('EHG,EHG_Engineer')).toEqual(['EHG', 'EHG_Engineer']);
    expect(parseTargetReposArg('EHG_Engineer,EHG')).toEqual(['EHG_Engineer', 'EHG']);
  });

  it('FR-5c: lowercase normalization → canonical case', () => {
    expect(parseTargetReposArg('ehg,ehg_engineer')).toEqual(['EHG', 'EHG_Engineer']);
    expect(parseTargetReposArg('EHG,ehg_ENGINEER')).toEqual(['EHG', 'EHG_Engineer']);
  });

  it('FR-5d: dedup duplicates → single entry preserved', () => {
    expect(parseTargetReposArg('EHG,EHG')).toEqual(['EHG']);
    expect(parseTargetReposArg('EHG,EHG_Engineer,EHG,EHG_Engineer')).toEqual(['EHG', 'EHG_Engineer']);
    expect(parseTargetReposArg('ehg,EHG,Ehg')).toEqual(['EHG']); // case-insensitive dedup
  });

  it('FR-5e: whitespace tolerance → trimmed before validation', () => {
    expect(parseTargetReposArg(' EHG , EHG_Engineer ')).toEqual(['EHG', 'EHG_Engineer']);
    expect(parseTargetReposArg('  EHG_Engineer  ')).toEqual(['EHG_Engineer']);
  });

  it('FR-5f: empty/null/undefined input → null (no metadata key set)', () => {
    expect(parseTargetReposArg('')).toBeNull();
    expect(parseTargetReposArg('   ')).toBeNull();
    expect(parseTargetReposArg(null)).toBeNull();
    expect(parseTargetReposArg(undefined)).toBeNull();
  });

  it('FR-5g: invalid repo → bracket-tokenized error + process.exit(1)', () => {
    expect(() => parseTargetReposArg('EHG,FooBar')).toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalled();
    const errMsg = errorSpy.mock.calls.map(c => c[0]).join('\n');
    expect(errMsg).toContain('[INVALID_TARGET_REPOS]');
    expect(errMsg).toContain('FooBar');
    expect(errMsg).toContain('EHG, EHG_Engineer'); // valid values listed
  });

  it('FR-5h: empty entries between commas → silently dropped', () => {
    expect(parseTargetReposArg('EHG,,EHG_Engineer')).toEqual(['EHG', 'EHG_Engineer']);
    expect(parseTargetReposArg(',EHG,')).toEqual(['EHG']);
  });

  it('FR-5i: ALLOWED_REPOS export matches consumer expectations', () => {
    // Writer/consumer parity check (validation-agent's #5 refinement)
    expect(ALLOWED_REPOS).toBeInstanceOf(Set);
    expect(ALLOWED_REPOS.has('EHG')).toBe(true);
    expect(ALLOWED_REPOS.has('EHG_Engineer')).toBe(true);
    expect(ALLOWED_REPOS.has('ehg')).toBe(false); // canonical case only
    expect(ALLOWED_REPOS.size).toBe(2);
  });

  it('FR-5j: non-string input → null (defensive)', () => {
    expect(parseTargetReposArg(123)).toBeNull();
    expect(parseTargetReposArg(['EHG'])).toBeNull();
    expect(parseTargetReposArg({ repo: 'EHG' })).toBeNull();
  });
});
