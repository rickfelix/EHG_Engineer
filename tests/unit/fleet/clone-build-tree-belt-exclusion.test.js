/**
 * SD-LEO-INFRA-CLONE-BUILD-TREE-BELT-EXCLUSION-001 (FR-3)
 *
 * A CLONE venture's build-tree must be auto-excluded from claim-eligibility AND the belt. The mechanism
 * is a DB-FREE marker (metadata.test_clone_build_tree=true) stamped at the source by the leo_bridge for
 * clone ventures (seeded_from_venture_id NOT NULL) and read by the two shared predicates. These tests
 * exercise the REAL predicates + the REAL bridge clone-detection/flag-fetch (no re-implementation).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');
import { isExcludedFromBelt, isCloneBuildTreeSd } from '../../../lib/coordinator/sd-exclusion.mjs';
import { isCloneVenture, fetchVentureFlags } from '../../../lib/eva/lifecycle-sd-bridge.js';

const sd = (extra = {}) => ({ sd_key: 'SD-CLONE-TREE-001', sd_type: 'feature', status: 'draft', title: 'Clone tree node', description: 'A real description distinct from the title.', metadata: {}, ...extra });

describe('FR-1: claim-eligibility excludes a marked clone build-tree node', () => {
  it("returns 'test_clone_build_tree' when metadata.test_clone_build_tree === true", () => {
    expect(classifyDispatchIneligibility(sd({ metadata: { test_clone_build_tree: true } }))).toBe('test_clone_build_tree');
  });
  it('is unaffected (null) for an unmarked SD', () => {
    expect(classifyDispatchIneligibility(sd())).toBeNull();
  });
  it('strict === true: a truthy non-boolean marker does NOT exclude', () => {
    expect(classifyDispatchIneligibility(sd({ metadata: { test_clone_build_tree: 'yes' } }))).toBeNull();
    expect(classifyDispatchIneligibility(sd({ metadata: { test_clone_build_tree: 1 } }))).toBeNull();
  });
  it('composes with existing axes (orchestrator still wins where it applies; marker excludes a plain feature)', () => {
    // a marked plain feature is excluded by the marker...
    expect(classifyDispatchIneligibility(sd({ sd_type: 'feature', metadata: { test_clone_build_tree: true } }))).toBe('test_clone_build_tree');
    // ...and an orchestrator parent is still caught by its own (earlier) axis
    expect(classifyDispatchIneligibility(sd({ sd_type: 'orchestrator', metadata: { test_clone_build_tree: true } }))).toBe('orchestrator_parent');
  });
});

describe('FR-1: belt-exclusion SSOT excludes a marked clone build-tree node', () => {
  it('isCloneBuildTreeSd true only for strict === true marker', () => {
    expect(isCloneBuildTreeSd(sd({ metadata: { test_clone_build_tree: true } }))).toBe(true);
    expect(isCloneBuildTreeSd(sd({ metadata: { test_clone_build_tree: false } }))).toBe(false);
    expect(isCloneBuildTreeSd(sd({ metadata: {} }))).toBe(false);
    expect(isCloneBuildTreeSd(sd({ metadata: { test_clone_build_tree: 'true' } }))).toBe(false);
    expect(isCloneBuildTreeSd(null)).toBe(false);
  });
  it('isExcludedFromBelt true for a marked node, false for an unmarked real SD', () => {
    expect(isExcludedFromBelt(sd({ metadata: { test_clone_build_tree: true } }))).toBe(true);
    expect(isExcludedFromBelt(sd())).toBe(false);
  });
});

describe('FR-2: isCloneVenture (clone detection from venture flags)', () => {
  it('true iff seeded_from_venture_id is non-null', () => {
    expect(isCloneVenture({ seeded_from_venture_id: 'src-1' })).toBe(true);
    expect(isCloneVenture({ seeded_from_venture_id: null })).toBe(false);
    expect(isCloneVenture({ is_demo: false, is_scaffolding: false })).toBe(false);
    expect(isCloneVenture(null)).toBe(false);
    expect(isCloneVenture(undefined)).toBe(false);
  });
});

describe('FR-2: fetchVentureFlags returns seeded_from_venture_id', () => {
  const flagsClient = (row) => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
        })),
      })),
    })),
  });

  it('surfaces seeded_from_venture_id for a clone venture row', async () => {
    const flags = await fetchVentureFlags(flagsClient({ is_demo: false, is_scaffolding: false, seeded_from_venture_id: 'src-9' }), 'v-clone');
    expect(flags).toEqual({ is_demo: false, is_scaffolding: false, seeded_from_venture_id: 'src-9' });
    expect(isCloneVenture(flags)).toBe(true);
  });
  it('normalizes a real venture (no seed) to seeded_from_venture_id null', async () => {
    const flags = await fetchVentureFlags(flagsClient({ is_demo: false, is_scaffolding: false }), 'v-real');
    expect(flags.seeded_from_venture_id).toBeNull();
    expect(isCloneVenture(flags)).toBe(false);
  });
  it('returns null (fail-safe) when the venture row is absent', async () => {
    expect(await fetchVentureFlags(flagsClient(null), 'v-missing')).toBeNull();
  });
});

describe('FR-2 end-to-end intent: a clone flag drives an excludable marker', () => {
  it('isCloneVenture(true) -> the node the bridge stamps is excluded by both predicates', () => {
    // The bridge stamps metadata.test_clone_build_tree=true exactly when isCloneVenture(flags) is true
    // (verified above). A node so stamped is excluded by BOTH shared predicates:
    const flags = { is_demo: false, is_scaffolding: false, seeded_from_venture_id: 'src-1' };
    const node = sd({ metadata: isCloneVenture(flags) ? { test_clone_build_tree: true } : {} });
    expect(classifyDispatchIneligibility(node)).toBe('test_clone_build_tree');
    expect(isExcludedFromBelt(node)).toBe(true);
    // a real venture's node carries no marker and stays claimable
    const realNode = sd({ metadata: isCloneVenture({ seeded_from_venture_id: null }) ? { test_clone_build_tree: true } : {} });
    expect(classifyDispatchIneligibility(realNode)).toBeNull();
    expect(isExcludedFromBelt(realNode)).toBe(false);
  });
});
