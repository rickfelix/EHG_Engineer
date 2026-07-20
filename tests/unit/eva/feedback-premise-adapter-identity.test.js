// QF-20260703-428: checkFeedbackPremiseLiveness must key its overlap match on
// defect IDENTITY (referenced_files / per-row title), never on the shared
// `category` bucket -- else an unrelated same-category row's shipped fix
// falsely marks every other row STALE_PREMISE (recurred-family e2e per QF spec).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFeedbackPremiseLiveness } from '../../../lib/eva/feedback-premise-adapter.js';

function fakeSupabase({ handoffRows = [], completedSds = [] }) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        // recentRecount paginates (FR-6): .order() then awaited .range() terminal.
        return {
          select: () => ({
            eq: () => ({
              gte: () => {
                const b = { order: () => b, range: async () => ({ data: handoffRows, error: null }) };
                return b;
              },
            }),
          }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                // Real PostgREST `.or('title.ilike.%tok%,description.ilike.%tok%')` only
                // matches rows whose title/description actually contain the token -- mimic
                // that here instead of returning completedSds unconditionally, or this test
                // can't tell a correct token (identity match) from a wrong one (category match).
                or: (filterExpr) => {
                  const tok = filterExpr.match(/ilike\.%(.*?)%/)?.[1]?.toLowerCase() || '';
                  const matched = completedSds.filter(
                    (s) => (s.title || '').toLowerCase().includes(tok) || (s.description || '').toLowerCase().includes(tok)
                  );
                  return { limit: async () => ({ data: matched, error: null }) };
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const noGitHits = () => '';

describe('checkFeedbackPremiseLiveness identity keying (QF-20260703-428)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT mark an unrelated same-category row STALE just because another category-mate shipped', async () => {
    // Historical bug: gate_name was `category`, so ANY completed SD whose title/description
    // ilike-matched the broad category string ("harness_backlog") satisfied findShippedFix
    // for every row sharing that category -- including rows about a totally different defect.
    const rowA = {
      id: 'fb-aaa',
      category: 'harness_backlog',
      title: 'Belt-rank re-fire noise on stale claims',
      description: 'See scripts/belt-rank.js for the offending re-fire loop.',
    };
    const supabase = fakeSupabase({
      handoffRows: [], // recentCount === 0
      completedSds: [
        { sd_key: 'SD-LEO-INFRA-HARNESS-BACKLOG-CLEANUP-001', title: 'harness_backlog triage cleanup', completion_date: '2026-06-30' },
      ],
    });

    const verdict = await checkFeedbackPremiseLiveness(rowA, { supabase, git: noGitHits, nowMs: Date.parse('2026-07-03T00:00:00Z') });

    expect(verdict.status).toBe('LIVE');
    expect(verdict.recommendation).not.toBe('ARCHIVE');
  });

  it('still marks STALE when the SPECIFIC referenced file was fixed (genuine identity match)', async () => {
    const rowB = {
      id: 'fb-bbb',
      category: 'harness_backlog',
      title: 'sd-start.js skips husky install on worktree path',
      description: 'Root cause in scripts/sd-start.js install-skip branch.',
    };
    const supabase = fakeSupabase({ handoffRows: [], completedSds: [] });
    const gitWithFileFix = (argsString) =>
      argsString.includes('sd-start.js') ? 'abc1234 fix(sd-start): resolve worktree install path' : '';

    const verdict = await checkFeedbackPremiseLiveness(rowB, { supabase, git: gitWithFileFix, nowMs: Date.parse('2026-07-03T00:00:00Z') });

    expect(verdict.status).toBe('STALE');
    expect(verdict.recommendation).toBe('ARCHIVE');
  });
});
