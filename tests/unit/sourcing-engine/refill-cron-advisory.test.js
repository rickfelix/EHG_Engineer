/**
 * SD-LEO-INFRA-WIRE-ALREADY-SHIPPED-001 (Phase 1) — wire crossRefShippedTitleAdvisory into the live
 * promotion caller (scripts/sourcing-engine/refill-cron.mjs).
 *
 * The pure matcher already has coverage (refill-substance-recovery.test.js). These tests pin the WIRING
 * helper collectShippedTitleAdvisories: it (a) flags a selected title that is a prefix/lookalike of a
 * shipped SD, (b) surfaces a byReason-style count so the false-positive rate is measurable, and
 * (c) is ADVISORY-ONLY — it never mutates the batch or any verdict. This closes the wired-to-fire gap:
 * before this SD the matcher was exported but had ZERO production call sites.
 */
import { describe, it, expect } from 'vitest';
import { collectShippedTitleAdvisories } from '../../../scripts/sourcing-engine/refill-cron.mjs';
import { normalizeTitleForCompare } from '../../../lib/sourcing-engine/refill-candidate-validity.js';

const shipped = new Set([normalizeTitleForCompare('Harden the worktree reaper across all pools')]);

describe('collectShippedTitleAdvisories (Phase 1 advisory wiring)', () => {
  it('flags a selected title that is a prefix/lookalike of a shipped SD', () => {
    const batch = [
      { title: 'Harden the worktree reaper', source_id: 'a' },        // lookalike of shipped
      { title: 'Add a brand-new marketing dashboard widget', source_id: 'b' }, // novel
    ];
    const { matches, byReason } = collectShippedTitleAdvisories(batch, shipped);
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe('Harden the worktree reaper');
    expect(matches[0].source_id).toBe('a');
    expect(matches[0].matched).toBeTruthy();
    // byReason count makes the FP rate measurable from run output.
    expect(byReason).toEqual({ ALREADY_SHIPPED_PREFIX_LOOKALIKE: 1 });
  });

  it('returns no matches / empty byReason when nothing looks shipped', () => {
    const batch = [{ title: 'Add a brand-new marketing dashboard widget', source_id: 'b' }];
    const { matches, byReason } = collectShippedTitleAdvisories(batch, shipped);
    expect(matches).toEqual([]);
    expect(byReason).toEqual({});
  });

  it('is advisory-only — does NOT mutate the batch', () => {
    const batch = [{ title: 'Harden the worktree reaper', source_id: 'a' }];
    const before = JSON.parse(JSON.stringify(batch));
    collectShippedTitleAdvisories(batch, shipped);
    expect(batch).toEqual(before);
  });

  it('is total on odd input (no batch / no set)', () => {
    expect(collectShippedTitleAdvisories(null, shipped)).toEqual({ matches: [], byReason: {} });
    expect(collectShippedTitleAdvisories([{ title: 'x' }], null)).toEqual({ matches: [], byReason: {} });
    expect(collectShippedTitleAdvisories([null, 42, { title: 'x' }], shipped))
      .toEqual({ matches: [], byReason: {} });
  });
});
