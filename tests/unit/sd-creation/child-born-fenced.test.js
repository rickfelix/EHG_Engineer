/**
 * QF-20260711-841: born-fenced sequencing for orchestrator children.
 *
 * Live evidence: children C-G were sourced with no sequencing encoding and unset review
 * flags — a fast self-claiming worker grabbed a dependent child ahead of its prerequisite,
 * forcing the coordinator to hand-fence them post-hoc. normalizeDependsOn() is the PURE core
 * of the fix: it turns a --depends-on list of sibling sd_keys into the canonical `dependencies`
 * column shape ({sd_id: key}) that draftDepsSatisfied (lib/fleet/claim-eligibility.cjs, the
 * shared claim-eligibility predicate) already reads — closing the producer side so a
 * dependent child is born already carrying its fence, atomically with createChild()'s single
 * createSD() insert (no separate claimable window).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeDependsOn } from '../../../lib/sd-creation/source-adapters/child.js';

describe('normalizeDependsOn (PURE)', () => {
  it('turns a list of sibling sd_keys into {sd_id} objects', () => {
    expect(normalizeDependsOn(['SD-LEO-ORCH-FOO-001-A', 'SD-LEO-ORCH-FOO-001-B'])).toEqual([
      { sd_id: 'SD-LEO-ORCH-FOO-001-A' },
      { sd_id: 'SD-LEO-ORCH-FOO-001-B' },
    ]);
  });

  it('trims whitespace around each key', () => {
    expect(normalizeDependsOn([' SD-LEO-ORCH-FOO-001-A ', 'SD-LEO-ORCH-FOO-001-B\n'])).toEqual([
      { sd_id: 'SD-LEO-ORCH-FOO-001-A' },
      { sd_id: 'SD-LEO-ORCH-FOO-001-B' },
    ]);
  });

  it('drops non-string and blank entries rather than throwing', () => {
    expect(normalizeDependsOn(['SD-LEO-ORCH-FOO-001-A', '', '   ', null, undefined, 42])).toEqual([
      { sd_id: 'SD-LEO-ORCH-FOO-001-A' },
    ]);
  });

  it('returns an empty array for no/empty/non-array input (no dependency = no fence)', () => {
    expect(normalizeDependsOn(undefined)).toEqual([]);
    expect(normalizeDependsOn(null)).toEqual([]);
    expect(normalizeDependsOn([])).toEqual([]);
    expect(normalizeDependsOn('SD-LEO-ORCH-FOO-001-A')).toEqual([]); // a bare string is not a list
  });
});

describe('createChild wiring (QF-20260711-841)', () => {
  it('passes dependencies straight into the SAME createSD() insert — no separate write, no claimable window', () => {
    const source = readFileSync('lib/sd-creation/source-adapters/child.js', 'utf8');
    const depsLine = source.indexOf('const dependencies = normalizeDependsOn(overrides.dependsOn);');
    const createSdCallStart = source.indexOf('const sd = await createSD({');
    const createSdCallEnd = source.indexOf('});', createSdCallStart);
    expect(depsLine).toBeGreaterThan(-1);
    expect(depsLine).toBeLessThan(createSdCallStart); // computed BEFORE the insert
    const createSdBody = source.slice(createSdCallStart, createSdCallEnd);
    expect(createSdBody).toContain('dependencies,'); // passed straight into the insert payload
  });
});

describe('leo-create-sd.js --depends-on CLI wiring (QF-20260711-841)', () => {
  it('parses --depends-on into a comma-split array on childOverrides.dependsOn', () => {
    const source = readFileSync('scripts/leo-create-sd.js', 'utf8');
    expect(source).toContain("args.indexOf('--depends-on')");
    expect(source).toContain('childOverrides.dependsOn');
  });

  it('excludes the --depends-on value from index-arg detection (so it is never mistaken for the child index)', () => {
    const source = readFileSync('scripts/leo-create-sd.js', 'utf8');
    const flagSetStart = source.indexOf('const flagValuePositionsChild = new Set(');
    const flagSetEnd = source.indexOf(');', flagSetStart);
    expect(source.slice(flagSetStart, flagSetEnd)).toContain('childDependsOnIdx');
  });
});
