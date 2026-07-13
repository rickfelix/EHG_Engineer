/**
 * Unit tests — SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-2
 * retro-qf-moot-check: claim-time moot-recheck for auto-promoted retro
 * action-item quick-fixes. Network-free: a fake supabase client models the
 * .from().select().in() and .from().select().eq().maybeSingle() chains, plus
 * .from().update().eq().eq() for the guarded cancel write.
 */
import { describe, it, expect } from 'vitest';
import mod from './retro-qf-moot-check.cjs';

const { isRetroPromotedQf, extractSdKeys, extractParentSdUuid, checkQfMoot, cancelMootQf } = mod;

// Real QF-20260713-800 description text (SD-FDBK-FIX-RETRO-ACTION-ITEM-001's own
// investigation fixture) -- references a DIFFERENT SD than the retro's own parent
// (parent is the raw UUID aeca17d0-...; the action items name a wholly separate
// audited SD, SD-APEXNICHE-...-A2 -- a genuine cross-SD staleness reference, not a
// self-reference).
const QF_800_DESCRIPTION = `Auto-promoted from 3 high-priority action item(s) in retrospective b5646cd8-28a9-4312-a202-ce6cd611570d (SD aeca17d0-e062-466c-b515-5f1ac4e9ce4e).
1. Create PRD for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 in product_requirements_v2 table (owner: PLAN Phase Agent, success criteria: PRD exists in database with directive_id=SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 and has ≥3 functional requirements)
2. Re-run blocking sub-agents for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 until PASS verdict (owner: EXEC Phase Agent, success criteria: All sub_agent_execution_results for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 show verdict='PASS')
3. Verify user journey E2E tests cover all acceptance criteria (owner: QA Agent, success criteria: Each user story has at least one passing E2E test)`;

// Adversarial-review finding (PR #6076): lib/sub-agents/retro/action-items.js's
// generateSmartActionItems() builds gap-closure items that are SELF-referential to
// the retro's own parent SD ("Create PRD for ${sdKey}", "Re-run blocking sub-agents
// for ${sdKey} until PASS verdict") -- that parent SD is virtually guaranteed to
// already be 'completed' by the time a worker evaluates the promoted QF, since the
// retro (and the gap-closure item) only exist because that SD reached completion.
// This fixture reproduces that pattern: the parent UUID in the header resolves to
// the SAME sd_key named inside the action item text.
const SELF_REF_PARENT_UUID = 'aeca17d0-e062-466c-b515-5f1ac4e9ce4e';
const SELF_REF_DESCRIPTION = `Auto-promoted from 1 high-priority action item(s) in retrospective b5646cd8-28a9-4312-a202-ce6cd611570d (SD ${SELF_REF_PARENT_UUID}).
1. Re-run blocking sub-agents for SD-SELF-001 until PASS verdict (owner: EXEC Phase Agent, success criteria: All sub_agent_execution_results for SD-SELF-001 show verdict='PASS')`;

function makeFakeSupabase({ rows = [], parentRow = null, throwOnSelect = false, throwOnParentSelect = false } = {}) {
  const updates = [];
  return {
    _updates: updates,
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  if (throwOnParentSelect) throw new Error('connection lost');
                  return Promise.resolve({ data: parentRow, error: null });
                },
              };
            },
            in() {
              if (throwOnSelect) throw new Error('connection lost');
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        update(payload) {
          const filters = {};
          const chain = {
            eq(col, val) {
              filters[col] = val;
              return chain;
            },
            then(resolve) {
              updates.push({ table, payload, filters: { ...filters } });
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

describe('isRetroPromotedQf', () => {
  it('matches only the exact promotion title prefix', () => {
    expect(isRetroPromotedQf({ title: '[Retro action items] SD-FOO-001' })).toBe(true);
    expect(isRetroPromotedQf({ title: 'Some other QF' })).toBe(false);
    expect(isRetroPromotedQf({})).toBe(false);
    expect(isRetroPromotedQf(null)).toBe(false);
  });
});

describe('extractSdKeys', () => {
  it('extracts a multi-segment SD-key with an alpha suffix (QF-800 pattern)', () => {
    expect(extractSdKeys(QF_800_DESCRIPTION)).toEqual(['SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2']);
  });

  it('returns empty for text with no SD-key token', () => {
    expect(extractSdKeys('Land the ship_review_findings.repo column migration (fast-follow SD)')).toEqual([]);
  });

  it('never throws on non-string input', () => {
    expect(extractSdKeys(undefined)).toEqual([]);
    expect(extractSdKeys(null)).toEqual([]);
  });
});

describe('extractParentSdUuid', () => {
  it('extracts the UUID from the "(SD <uuid>)" header', () => {
    expect(extractParentSdUuid(QF_800_DESCRIPTION)).toBe('aeca17d0-e062-466c-b515-5f1ac4e9ce4e');
  });

  it('returns null when no parenthesized UUID header is present', () => {
    expect(extractParentSdUuid('No header here, just SD-FOO-001 mentioned.')).toBeNull();
  });

  it('never throws on non-string input', () => {
    expect(extractParentSdUuid(undefined)).toBeNull();
    expect(extractParentSdUuid(null)).toBeNull();
  });
});

describe('checkQfMoot', () => {
  it('flags moot when the referenced SD is already completed (QF-800 pattern)', async () => {
    const qf = { title: '[Retro action items] SD-X-001', description: QF_800_DESCRIPTION };
    const sb = makeFakeSupabase({ rows: [{ sd_key: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2', status: 'completed' }] });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(true);
    expect(result.sdKey).toBe('SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2');
    expect(result.status).toBe('completed');
  });

  it('is not moot when the referenced SD is still in-progress', async () => {
    const qf = { title: '[Retro action items] SD-X-001', description: QF_800_DESCRIPTION };
    const sb = makeFakeSupabase({ rows: [{ sd_key: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2', status: 'in_progress' }] });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });

  it('ignores non-retro-promoted QFs entirely', async () => {
    const qf = { title: 'Some other QF', description: QF_800_DESCRIPTION };
    const sb = makeFakeSupabase({ rows: [{ sd_key: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2', status: 'completed' }] });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });

  it('fails open when the status lookup throws', async () => {
    const qf = { title: '[Retro action items] SD-X-001', description: QF_800_DESCRIPTION };
    const sb = makeFakeSupabase({ throwOnSelect: true });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });

  it('fails open when no SD-key is present in the description', async () => {
    const qf = { title: '[Retro action items] SD-X-001', description: 'Land the fast-follow SD (no explicit key)' };
    const sb = makeFakeSupabase({ rows: [] });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });

  it('does NOT flag moot when the only referenced SD-key is the retro\'s own parent SD (self-referential gap-closure item, PR #6076 adversarial finding)', async () => {
    const qf = { title: '[Retro action items] SD-SELF-001', description: SELF_REF_DESCRIPTION };
    // Parent UUID resolves to the SAME sd_key the action item names -- and that SD is
    // completed, exactly as it always will be for this item shape. Even though `rows`
    // would report it completed if queried, the parent-exclusion means the .in() lookup
    // is never reached with that key as a candidate.
    const sb = makeFakeSupabase({
      parentRow: { sd_key: 'SD-SELF-001' },
      rows: [{ sd_key: 'SD-SELF-001', status: 'completed' }],
    });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });

  it('still flags moot on a genuinely different SD even when the parent SD is also present and excluded', async () => {
    const mixedDescription = `Auto-promoted from 2 high-priority action item(s) in retrospective b5646cd8-28a9-4312-a202-ce6cd611570d (SD ${SELF_REF_PARENT_UUID}).
1. Re-run blocking sub-agents for SD-SELF-001 until PASS verdict (owner: EXEC Phase Agent, success criteria: All sub_agent_execution_results for SD-SELF-001 show verdict='PASS')
2. Land the ship_review_findings.repo column migration for SD-OTHER-002 (owner: LEAD, success criteria: n/a)`;
    const qf = { title: '[Retro action items] SD-SELF-001', description: mixedDescription };
    const sb = makeFakeSupabase({
      parentRow: { sd_key: 'SD-SELF-001' },
      rows: [{ sd_key: 'SD-OTHER-002', status: 'completed' }],
    });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(true);
    expect(result.sdKey).toBe('SD-OTHER-002');
  });

  it('fails open (does not cancel) when the parent-SD exclusion lookup throws', async () => {
    const qf = { title: '[Retro action items] SD-SELF-001', description: SELF_REF_DESCRIPTION };
    const sb = makeFakeSupabase({ throwOnParentSelect: true });
    const result = await checkQfMoot(sb, qf);
    expect(result.moot).toBe(false);
  });
});

describe('cancelMootQf', () => {
  it('updates status=cancelled with a verification_notes explanation, guarded on status=open', async () => {
    const sb = makeFakeSupabase();
    await cancelMootQf(sb, 'QF-1', 'SD-X-001', 'completed');
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].table).toBe('quick_fixes');
    expect(sb._updates[0].payload.status).toBe('cancelled');
    expect(sb._updates[0].payload.verification_notes).toContain('SD-X-001');
    expect(sb._updates[0].payload.verification_notes).toContain('completed');
    expect(sb._updates[0].filters).toEqual({ id: 'QF-1', status: 'open' });
  });

  it('fails open when the update throws', async () => {
    const sb = { from: () => { throw new Error('down'); } };
    await expect(cancelMootQf(sb, 'QF-1', 'SD-X-001', 'completed')).resolves.toBeUndefined();
  });
});
