/**
 * QF-20260831-947 — WORK_ASSIGNMENT-outranks-self-claim, fork (b) (coordinator ruling 6fe0e4fe,
 * 2026-08-31, Adam as owner / Solomon concurring on author-intent).
 *
 * Narrow: a WORK_ASSIGNMENT purged this SAME tick as orchestrator_parent-ineligible, whose
 * target is INDEPENDENTLY completable per checkParentCompletable, suppresses every self-claim
 * tier below MECHANICALLY (no prose read required) instead of silently falling through.
 *
 * Fork (a) -- unconditional suppression for any ineligible-purge reason -- was ruled OUT for
 * this QF (a selector-contract change, Tier-3 SD scope). This step is deliberately separate
 * from directed-assignment.cjs so that file's own 5 tests (incl. SEC-H1) stay untouched.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const step = require_(path.join(REPO, 'lib/checkin/steps/directed-assignment-outranks-self-claim.cjs'));

const PARENT_KEY = 'SD-ORCH-PARENT-001';
const PARENT_ID = 'parent-uuid-1';

function makeSb({ sdRow, childrenRows = [], handoffRows = [], sdQueryError = null, childrenQueryThrows = false }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col) => {
              if (col === 'sd_key') return { maybeSingle: () => Promise.resolve({ data: sdRow, error: sdQueryError }) };
              if (col === 'parent_sd_id') {
                if (childrenQueryThrows) throw new Error('boom');
                return Promise.resolve({ data: childrenRows, error: null });
              }
              throw new Error(`unexpected eq column: ${col}`);
            },
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return { select: () => ({ or: () => ({ eq: () => ({ order: () => Promise.resolve({ data: handoffRows, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('directed-assignment-outranks-self-claim.cjs — QF-20260831-947 fork (b)', () => {
  it('applies() is false when no purge happened this tick', () => {
    expect(step.applies({ base: {} })).toBe(false);
  });

  it('applies() is false for a NON-orchestrator_parent purge reason', () => {
    expect(step.applies({ base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'repo_mismatch' } } })).toBe(false);
  });

  it('applies() is true for an orchestrator_parent purge', () => {
    expect(step.applies({ base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'orchestrator_parent' } } })).toBe(true);
  });

  it('[SPECIMEN] suppresses self-claim (truthy return, short-circuits runSteps) when the parent is independently completable', async () => {
    const sb = makeSb({
      sdRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'active' },
      childrenRows: [{ id: 'c1', status: 'completed' }, { id: 'c2', status: 'cancelled' }],
      handoffRows: [],
    });
    const ctx = { sb, base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'orchestrator_parent' } } };
    const result = await step.run(ctx);
    expect(result).toBeTruthy();
    expect(result.action).toBe('directed_assignment_outranks_self_claim');
    expect(result.sd).toBe(PARENT_KEY);
  });

  it('[TWO-SIDED] does NOT suppress (undefined return) when the parent is genuinely not completable', async () => {
    const sb = makeSb({
      sdRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'active' },
      childrenRows: [{ id: 'c1', status: 'in_progress' }],
      handoffRows: [],
    });
    const ctx = { sb, base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'orchestrator_parent' } } };
    const result = await step.run(ctx);
    expect(result).toBeUndefined();
  });

  it('never fails open: the parent row lookup erroring leaves self-claim fallthrough untouched', async () => {
    const sb = makeSb({ sdRow: null, sdQueryError: { message: 'boom' } });
    const ctx = { sb, base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'orchestrator_parent' } } };
    expect(await step.run(ctx)).toBeUndefined();
  });

  it('never fails open: checkParentCompletable throwing leaves self-claim fallthrough untouched', async () => {
    const sb = makeSb({ sdRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'active' }, childrenQueryThrows: true });
    const ctx = { sb, base: { assignment_ineligible_purged: { sd: PARENT_KEY, reason: 'orchestrator_parent' } } };
    expect(await step.run(ctx)).toBeUndefined();
  });

  it('does not run at all when applies() gates it out (pipeline-level check)', () => {
    const runSpy = vi.spyOn(step, 'run');
    const ctx = { base: {} };
    if (step.applies(ctx)) step.run(ctx);
    expect(runSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });
});
