/**
 * Unit tests — SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 TS-11.
 * The FR-9 revert script actually reverses a backfill run end-to-end from its own out-file.
 * Mocked supabase — no live DB writes.
 */
import { describe, it, expect } from 'vitest';
import { parseNdjson, revertRow, revertAll } from '../../../scripts/one-off/revert-completion-flag-finding-category.mjs';
import { toNdjsonLine } from '../../../scripts/one-off/backfill-completion-flag-finding-category.mjs';

function buildRevertSupabase({ currentCategoryById }) {
  const updates = [];
  return {
    _updates: updates,
    from: () => ({
      update: (patch) => {
        let filterId = null;
        let filterCategory = null;
        const chain = {
          eq: (col, val) => {
            if (col === 'id') filterId = val;
            if (col === 'category') filterCategory = val;
            return chain;
          },
          select: () => {
            updates.push({ id: filterId, patch, filterCategory });
            const current = currentCategoryById[filterId];
            const matches = current === filterCategory;
            return Promise.resolve({ data: matches ? [{ id: filterId }] : [], error: null });
          },
        };
        return chain;
      },
    }),
  };
}

describe('TS-11: NDJSON out-file round-trips through parse -> revert -> verify', () => {
  it('parseNdjson reads lines written by toNdjsonLine (FR-3/FR-4 out-file format)', () => {
    const contents = [
      toNdjsonLine({ id: 'fb-1', previousCategory: 'harness_backlog', newCategory: 'completion_flag_finding' }),
      toNdjsonLine({ id: 'fb-2', previousCategory: 'harness_backlog', newCategory: 'completion_flag_witness' }),
    ].join('\n') + '\n';
    const rows = parseNdjson(contents);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 'fb-1', previous_category: 'harness_backlog', new_category: 'completion_flag_finding', table: 'feedback' });
  });

  it('parseNdjson tolerates trailing blank lines', () => {
    const rows = parseNdjson('\n' + toNdjsonLine({ id: 'a', previousCategory: 'harness_backlog', newCategory: 'completion_flag_finding' }) + '\n\n');
    expect(rows).toHaveLength(1);
  });

  it('revertRow flips category back WHERE id AND current category still matches new_category', async () => {
    const supabase = buildRevertSupabase({ currentCategoryById: { 'fb-1': 'completion_flag_finding' } });
    const result = await revertRow(supabase, { id: 'fb-1', previous_category: 'harness_backlog', new_category: 'completion_flag_finding' });
    expect(result.outcome).toBe('reverted');
    expect(supabase._updates[0].patch).toEqual({ category: 'harness_backlog' });
    expect(supabase._updates[0].filterCategory).toBe('completion_flag_finding');
  });

  it('revertRow SKIPS (never clobbers) a row whose current category no longer matches', async () => {
    // Row was migrated by the backfill, then something ELSE changed it again.
    const supabase = buildRevertSupabase({ currentCategoryById: { 'fb-1': 'some_other_category' } });
    const result = await revertRow(supabase, { id: 'fb-1', previous_category: 'harness_backlog', new_category: 'completion_flag_finding' });
    expect(result.outcome).toBe('skipped_mismatch');
  });

  it('revertAll reverses a full backfill run end-to-end from its own out-file', async () => {
    const backfilled = [
      { id: 'fb-1', previous_category: 'harness_backlog', new_category: 'completion_flag_finding' },
      { id: 'fb-2', previous_category: 'harness_backlog', new_category: 'completion_flag_witness' },
      { id: 'fb-3', previous_category: 'harness_backlog', new_category: 'completion_flag_finding' }, // already re-changed by something else
    ];
    const supabase = buildRevertSupabase({
      currentCategoryById: { 'fb-1': 'completion_flag_finding', 'fb-2': 'completion_flag_witness', 'fb-3': 'manually_triaged' },
    });
    const { reverted, skipped, errored, results } = await revertAll(supabase, backfilled);
    expect(reverted).toBe(2);
    expect(skipped).toBe(1);
    expect(errored).toBe(0);
    expect(results.find((r) => r.id === 'fb-3').outcome).toBe('skipped_mismatch');
  });

  it('revertRow reports outcome "error" (not silently swallowed) on an UPDATE failure', async () => {
    const supabase = {
      from: () => ({
        update: () => ({
          eq: function () { return this; },
          select: () => Promise.resolve({ data: null, error: { message: 'db unreachable' } }),
        }),
      }),
    };
    const result = await revertRow(supabase, { id: 'fb-9', previous_category: 'harness_backlog', new_category: 'completion_flag_finding' });
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/db unreachable/);
  });
});
