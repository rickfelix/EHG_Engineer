/**
 * Regression test: loadOpenQuickFixes must exclude QFs during merge race window.
 * QF-20260423-380
 *
 * A parallel session populates pr_url/commit_sha in complete-quick-fix.js BEFORE
 * flipping status to 'completed'. Filtering on status alone surfaces phantom QFs
 * during the 30-90s merge window.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadOpenQuickFixes } from '../../../scripts/modules/sd-next/data-loaders.js';

function makeSupabase(queryResult) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queryResult),
  };
  return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

describe('loadOpenQuickFixes — merge race safety', () => {
  it('applies .is(pr_url, null) and .is(commit_sha, null) filters', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await loadOpenQuickFixes(supabase);
    expect(supabase._builder.is).toHaveBeenCalledWith('pr_url', null);
    expect(supabase._builder.is).toHaveBeenCalledWith('commit_sha', null);
  });

  it('still filters status IN (open, in_progress)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await loadOpenQuickFixes(supabase);
    expect(supabase._builder.in).toHaveBeenCalledWith('status', ['open', 'in_progress']);
  });

  it('returns rows when loader gets data', async () => {
    const rows = [{ id: 'QF-TEST-001', status: 'open', pr_url: null, commit_sha: null }];
    const supabase = makeSupabase({ data: rows, error: null });
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual(rows);
  });

  it('returns [] on query error without throwing', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'db down' } });
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual([]);
  });

  it('returns [] when supabase.from throws', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('boom'); }) };
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual([]);
  });
});
