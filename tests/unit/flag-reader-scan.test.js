/**
 * Unit tests for the flag-reader-scan graduation-marker scanner.
 * QF-20260906-235.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraduatedMarkerIndex, buildFlagCodeIndices } from '../../lib/feature-flags/flag-reader-scan.js';

let repoRoot;

beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-reader-scan-test-'));
  fs.mkdirSync(path.join(repoRoot, 'lib', 'eva'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'lib', 'eva', 'stage-execution-worker.js'),
    [
      '// QF-20260712-716 (Adam flag-gov ruling 8118abe7, 2026-08-16): GRADUATED. The',
      '// leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED kill-switch read was',
      '// removed — it was enabled-never-rolled-out.',
      'export function noop() {}',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(repoRoot, 'lib', 'eva', 'unrelated.js'),
    'export function stillHere() { return "NOT_GRADUATED"; }'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'lib', 'eva', 'live-reader.js'),
    'if (getFlag("SOME_LIVE_FLAG")) { doThing(); }'
  );
});

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe('buildGraduatedMarkerIndex', () => {
  it('detects a flag named in a GRADUATED marker comment', () => {
    const isGraduated = buildGraduatedMarkerIndex(repoRoot);
    expect(isGraduated('LEO_HIGH_CONSEQUENCE_GATES_ENABLED')).toBe(true);
  });

  it('returns false for a flag never mentioned in any GRADUATED marker', () => {
    const isGraduated = buildGraduatedMarkerIndex(repoRoot);
    expect(isGraduated('SOME_OTHER_FLAG')).toBe(false);
  });

  it('returns false for every key when the tree has no GRADUATED marker at all', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-reader-scan-empty-'));
    fs.mkdirSync(path.join(emptyRoot, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(emptyRoot, 'lib', 'x.js'), 'export const x = 1;');
    try {
      const isGraduated = buildGraduatedMarkerIndex(emptyRoot);
      expect(isGraduated('LEO_HIGH_CONSEQUENCE_GATES_ENABLED')).toBe(false);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe('buildFlagCodeIndices', () => {
  it('computes both predicates from a single combined tree-walk', () => {
    const { hasLiveReaders, isGraduatedInCode } = buildFlagCodeIndices(repoRoot, ['SOME_LIVE_FLAG']);
    expect(hasLiveReaders('SOME_LIVE_FLAG')).toBe(true);
    expect(hasLiveReaders('NEVER_REFERENCED')).toBe(false);
    expect(isGraduatedInCode('LEO_HIGH_CONSEQUENCE_GATES_ENABLED')).toBe(true);
    expect(isGraduatedInCode('SOME_OTHER_FLAG')).toBe(false);
  });

  it('returns false predicates for an empty flagKeys list without erroring', () => {
    const { hasLiveReaders, isGraduatedInCode } = buildFlagCodeIndices(repoRoot);
    expect(hasLiveReaders('SOME_LIVE_FLAG')).toBe(false);
    expect(isGraduatedInCode('LEO_HIGH_CONSEQUENCE_GATES_ENABLED')).toBe(true);
  });
});
