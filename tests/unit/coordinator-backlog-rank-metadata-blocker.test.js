/**
 * SD-REFILL-00AH2L4Q: the dispatch ranker (coordinator-backlog-rank.mjs) must honor the SAME
 * canonical metadata blocker key (metadata.blocked_by_sd_key) that dependency-resolver + worker-checkin
 * enforce — otherwise a metadata-blocked SD stays on the claimable belt (gets a dispatch_rank) even
 * though worker-checkin would refuse to claim it. blockerKeysFor() unifies the two readers on the
 * SAME predicate (the dependencies column PLUS metadata.blocked_by_sd_key).
 *
 * Also asserts the module is import-safe (the entrypoint is guarded), so importing it for this test
 * does NOT run the DB-touching backlog pass.
 */
import { describe, it, expect } from 'vitest';
import { blockerKeysFor } from '../../scripts/coordinator-backlog-rank.mjs';

describe('SD-REFILL-00AH2L4Q: backlog-rank honors metadata.blocked_by_sd_key (blockerKeysFor)', () => {
  it('no dependencies and no metadata blocker -> no blockers (claimable leaf)', () => {
    expect(blockerKeysFor({ dependencies: null, metadata: null })).toEqual([]);
    expect(blockerKeysFor({ dependencies: [], metadata: {} })).toEqual([]);
  });

  it('metadata.blocked_by_sd_key IS treated as a blocker (the bug: it used to be ignored by the ranker)', () => {
    const keys = blockerKeysFor({ dependencies: null, metadata: { blocked_by_sd_key: 'SD-BLOCKER-001' } });
    expect(keys).toContain('SD-BLOCKER-001');
  });

  it('combines the dependencies column AND metadata.blocked_by_sd_key', () => {
    const keys = blockerKeysFor({
      dependencies: ['SD-DEP-001'],
      metadata: { blocked_by_sd_key: 'SD-BLOCKER-002' },
    });
    expect(keys).toContain('SD-DEP-001');
    expect(keys).toContain('SD-BLOCKER-002');
  });

  it('metadata without blocked_by_sd_key contributes no extra blocker (only the dependencies column)', () => {
    const keys = blockerKeysFor({
      dependencies: ['SD-DEP-003'],
      metadata: { blocked_by: ['SD-LOOSE-001'], some_other: true }, // blocked_by array is NOT the enforced key
    });
    expect(keys).toEqual(['SD-DEP-003']);
  });

  it('module imported without running the DB pass (entrypoint guard) — reaching here proves it', () => {
    // If main() had run on import, this suite would have errored/hung on a DB call before asserting.
    expect(typeof blockerKeysFor).toBe('function');
  });
});
