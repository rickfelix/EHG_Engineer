/**
 * Unit tests for regeneration hygiene.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 5 (FR-014)
 */
import { describe, it, expect } from 'vitest';
import { planRegeneration, isIdempotentRerun } from '../../../lib/eva/bridge/regeneration-hygiene.js';

describe('planRegeneration', () => {
  it('creates new keys, updates existing keys in place, and supersedes stale non-terminal keys', () => {
    const existing = [
      { sd_key: 'A', status: 'draft' },
      { sd_key: 'B', status: 'draft' },
      { sd_key: 'OLD', status: 'draft' },        // not in desired, non-terminal -> supersede
      { sd_key: 'DONE', status: 'completed' },   // not in desired, terminal -> leave
    ];
    const desired = [{ sd_key: 'A' }, { sd_key: 'B' }, { sd_key: 'C' }];
    const r = planRegeneration(existing, desired);
    expect(r.toCreate).toEqual(['C']);
    expect(r.toUpdate.sort()).toEqual(['A', 'B']);
    expect(r.toSupersede).toEqual(['OLD']);          // DONE (terminal) is NOT superseded
  });

  it('re-running the SAME tree is idempotent — zero creates, all updates (no duplicate tree)', () => {
    const tree = [{ sd_key: 'X', status: 'draft' }, { sd_key: 'Y', status: 'draft' }];
    const r = planRegeneration(tree, tree.map((s) => ({ sd_key: s.sd_key })));
    expect(r.toCreate).toEqual([]);
    expect(r.toUpdate.sort()).toEqual(['X', 'Y']);
    expect(isIdempotentRerun(tree, tree)).toBe(true);
  });

  it('the DataDistill 3-tree case: a stale draft tree not in the desired plan is superseded, the live one updated', () => {
    const existing = [
      { sd_key: 'SAAS-A', status: 'draft' }, { sd_key: 'SAAS-B', status: 'completed' },
      { sd_key: 'UNKNOWN-A', status: 'draft' }, { sd_key: 'UNKNOWN-B', status: 'draft' }, // stale duplicate tree
    ];
    const desired = [{ sd_key: 'SAAS-A' }, { sd_key: 'SAAS-B' }];
    const r = planRegeneration(existing, desired);
    expect(r.toCreate).toEqual([]);                          // no new tree spawned
    expect(r.toSupersede.sort()).toEqual(['UNKNOWN-A', 'UNKNOWN-B']); // the cruft tree
  });

  it('tolerates empty / non-array / keyless input', () => {
    expect(planRegeneration().toCreate).toEqual([]);
    expect(planRegeneration([{ status: 'draft' }], [{}]).toUpdate).toEqual([]); // keyless rows ignored
    expect(() => planRegeneration(null, null)).not.toThrow();
  });
});
