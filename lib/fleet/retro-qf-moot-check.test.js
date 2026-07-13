/**
 * Unit tests — SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-2
 * retro-qf-moot-check: claim-time moot-recheck for auto-promoted retro
 * action-item quick-fixes. Network-free: a fake supabase client models only
 * the .from().select().in() chain the module actually uses.
 */
import { describe, it, expect } from 'vitest';
import mod from './retro-qf-moot-check.cjs';

const { isRetroPromotedQf, extractSdKeys, checkQfMoot, cancelMootQf } = mod;

// Real QF-20260713-800 description text (SD-FDBK-FIX-RETRO-ACTION-ITEM-001's own
// investigation fixture) -- references a DIFFERENT SD than the retro's own parent.
const QF_800_DESCRIPTION = `Auto-promoted from 3 high-priority action item(s) in retrospective b5646cd8-28a9-4312-a202-ce6cd611570d (SD aeca17d0-e062-466c-b515-5f1ac4e9ce4e).
1. Create PRD for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 in product_requirements_v2 table (owner: PLAN Phase Agent, success criteria: PRD exists in database with directive_id=SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 and has ≥3 functional requirements)
2. Re-run blocking sub-agents for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 until PASS verdict (owner: EXEC Phase Agent, success criteria: All sub_agent_execution_results for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 show verdict='PASS')
3. Verify user journey E2E tests cover all acceptance criteria (owner: QA Agent, success criteria: Each user story has at least one passing E2E test)`;

function makeFakeSupabase({ rows = [], throwOnSelect = false } = {}) {
  const updates = [];
  return {
    _updates: updates,
    from(table) {
      return {
        select() {
          return {
            in() {
              if (throwOnSelect) throw new Error('connection lost');
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        update(payload) {
          updates.push({ table, payload });
          return { eq: () => Promise.resolve({ error: null }) };
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
});

describe('cancelMootQf', () => {
  it('updates status=cancelled with a verification_notes explanation', async () => {
    const sb = makeFakeSupabase();
    await cancelMootQf(sb, 'QF-1', 'SD-X-001', 'completed');
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].table).toBe('quick_fixes');
    expect(sb._updates[0].payload.status).toBe('cancelled');
    expect(sb._updates[0].payload.verification_notes).toContain('SD-X-001');
    expect(sb._updates[0].payload.verification_notes).toContain('completed');
  });

  it('fails open when the update throws', async () => {
    const sb = { from: () => { throw new Error('down'); } };
    await expect(cancelMootQf(sb, 'QF-1', 'SD-X-001', 'completed')).resolves.toBeUndefined();
  });
});
