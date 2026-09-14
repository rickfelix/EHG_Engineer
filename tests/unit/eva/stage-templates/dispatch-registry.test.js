/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-C FR-2 (P2.2) -- TS-1/TS-2.
 * Pure-logic tests: fixture-driven for the check functions, plus one
 * real-tree assertion proving the registry stays synchronized with the
 * actual repo layout (a stale registry entry should fail loudly, not drift
 * silently).
 */
import { describe, it, expect } from 'vitest';
import {
  STATIC_STAGE_DISPATCH,
  CROSS_CUTTING_DISPATCH,
  allDispatchEntries,
  listAnalysisStepFiles,
  checkRegistryEntriesResolve,
  checkDispatchCoverage,
} from '../../../../lib/eva/stage-templates/dispatch-registry.js';

describe('checkRegistryEntriesResolve (TS-1: blocking limb)', () => {
  it('passes (empty) when every entry resolves to a file the fake fs reports present', () => {
    const entries = [{ analysisStepFile: 'a.js' }, { analysisStepFile: 'b.js' }];
    const exists = () => true;
    expect(checkRegistryEntriesResolve(entries, '/fake/dir', exists)).toEqual([]);
  });

  it('flags an entry whose file does not resolve', () => {
    const entries = [{ analysisStepFile: 'a.js' }, { analysisStepFile: 'missing.js' }];
    const exists = (p) => !p.endsWith('missing.js');
    const failures = checkRegistryEntriesResolve(entries, '/fake/dir', exists);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ analysisStepFile: 'missing.js', reason: 'FILE_NOT_FOUND' });
  });

  it('TS-1 (real tree): every entry in the live registry resolves to a real file', () => {
    const failures = checkRegistryEntriesResolve(allDispatchEntries());
    expect(failures).toEqual([]);
  });
});

describe('checkDispatchCoverage (TS-2: advisory limb)', () => {
  it('reports UNREGISTERED for a file with zero registry entries', () => {
    const files = ['a.js', 'orphan.js'];
    const entries = [{ analysisStepFile: 'a.js' }];
    const advisories = checkDispatchCoverage(files, entries);
    expect(advisories).toEqual([{ file: 'orphan.js', registryEntryCount: 0, reason: 'UNREGISTERED' }]);
  });

  it('reports MULTIPLE_ENTRIES for a file registered more than once', () => {
    const files = ['a.js'];
    const entries = [{ analysisStepFile: 'a.js' }, { analysisStepFile: 'a.js' }];
    const advisories = checkDispatchCoverage(files, entries);
    expect(advisories).toEqual([{ file: 'a.js', registryEntryCount: 2, reason: 'MULTIPLE_ENTRIES' }]);
  });

  it('reports nothing for a file with exactly one registry entry', () => {
    const files = ['a.js'];
    const entries = [{ analysisStepFile: 'a.js' }];
    expect(checkDispatchCoverage(files, entries)).toEqual([]);
  });

  it('TS-2 (real tree): the advisory limb runs against the real 51-file directory without throwing, and never fails the build by itself', () => {
    const files = listAnalysisStepFiles();
    expect(files.length).toBeGreaterThan(0);
    const advisories = checkDispatchCoverage(files, allDispatchEntries());
    // Advisory-only: any count is acceptable here. This asserts the mechanism runs
    // end-to-end against the real tree, not that the count is zero.
    expect(Array.isArray(advisories)).toBe(true);
  });
});

describe('registry shape', () => {
  it('STATIC_STAGE_DISPATCH and CROSS_CUTTING_DISPATCH are both frozen arrays', () => {
    expect(Object.isFrozen(STATIC_STAGE_DISPATCH)).toBe(true);
    expect(Object.isFrozen(CROSS_CUTTING_DISPATCH)).toBe(true);
  });

  it('allDispatchEntries concatenates both lists with no entries dropped', () => {
    expect(allDispatchEntries()).toHaveLength(STATIC_STAGE_DISPATCH.length + CROSS_CUTTING_DISPATCH.length);
  });
});
