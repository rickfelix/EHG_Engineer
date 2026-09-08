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

// QF-20260904-610: --roadmap-link-reason had NO path at all on --child -- every child mint
// recorded a reasonless roadmap-link exception unconditionally. Same shape as the --depends-on
// fix above: parsed on leo-create-sd.js's --child branch, threaded through createChild's
// overrides, passed straight into the SAME createSD() insert (never a separate write).
describe('createChild wiring — roadmap_link_reason (QF-20260904-610)', () => {
  it('passes roadmap_link_reason straight into the SAME createSD() insert when the operator supplied one', () => {
    const source = readFileSync('lib/sd-creation/source-adapters/child.js', 'utf8');
    const createSdCallStart = source.indexOf('const sd = await createSD({');
    const createSdCallEnd = source.indexOf('});', createSdCallStart);
    const createSdBody = source.slice(createSdCallStart, createSdCallEnd);
    expect(createSdBody).toContain('overrides.roadmapLinkReason');
    expect(createSdBody).toContain('roadmap_link_reason: overrides.roadmapLinkReason');
  });

  it('roadmap_link_reason is a TOP-LEVEL createSD param, not nested under metadata (pipeline.js destructures it there)', () => {
    const source = readFileSync('lib/sd-creation/source-adapters/child.js', 'utf8');
    const createSdCallStart = source.indexOf('const sd = await createSD({');
    const metadataStart = source.indexOf('metadata: {', createSdCallStart);
    const reasonIdx = source.indexOf('roadmap_link_reason: overrides.roadmapLinkReason', createSdCallStart);
    expect(reasonIdx).toBeGreaterThan(-1);
    expect(reasonIdx).toBeLessThan(metadataStart); // set BEFORE the metadata block, i.e. top-level
  });
});

describe('leo-create-sd.js --roadmap-link-reason CLI wiring for --child (QF-20260904-610)', () => {
  it('parses --roadmap-link-reason onto childOverrides.roadmapLinkReason', () => {
    const source = readFileSync('scripts/leo-create-sd.js', 'utf8');
    const childStart = source.indexOf("args[0] === '--child'");
    const childEnd = source.indexOf('const childRes = await createChild(');
    const childBody = source.slice(childStart, childEnd);
    expect(childBody).toContain("args.indexOf('--roadmap-link-reason')");
    expect(childBody).toContain('childOverrides.roadmapLinkReason');
  });

  it('excludes the --roadmap-link-reason value from index-arg detection (so it is never mistaken for the child index)', () => {
    const source = readFileSync('scripts/leo-create-sd.js', 'utf8');
    const flagSetStart = source.indexOf('const flagValuePositionsChild = new Set(');
    const flagSetEnd = source.indexOf(');', flagSetStart);
    expect(source.slice(flagSetStart, flagSetEnd)).toContain('childLinkReasonIdx');
  });
});
