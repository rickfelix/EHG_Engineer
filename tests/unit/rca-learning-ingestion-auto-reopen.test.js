/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-4): auto-reopen a pattern on
 * recurrence after closure. Empirically overdue -- PAT-LEO-INFRA-WRITER-CONSUMER-
 * ASYMMETRY-001 was declared resolved at its 21st code-comment witness (PR #3700) yet
 * has been witnessed 3+ times since, with no DB-level reopen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let fetchResult;
let updatePayloads;

function createSupabaseStub() {
  return {
    from(table) {
      expect(table).toBe('issue_patterns');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => fetchResult,
          }),
        }),
        update: (payload) => {
          updatePayloads.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseClient: () => createSupabaseStub(),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('../../lib/utils/is-main-module.js', () => ({ isMainModule: () => false }));

const { updateIssuePatterns } = await import('../../scripts/rca-learning-ingestion.js');

describe('updateIssuePatterns — auto-reopen on recurrence (FR-4)', () => {
  beforeEach(() => {
    updatePayloads = [];
  });

  it('a currently active pattern just increments occurrence_count (no status/reopen fields touched)', async () => {
    fetchResult = { data: { id: 'PAT-X', occurrence_count: 2, status: 'active', metadata: {} }, error: null };
    await updateIssuePatterns({ pattern_id: 'PAT-X' }, {});
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toEqual({ occurrence_count: 3 });
  });

  it('a resolved pattern with a new occurrence auto-reopens: status back to active, reopen fields stamped, resolution fields untouched', async () => {
    fetchResult = {
      data: { id: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001', occurrence_count: 21, status: 'resolved', metadata: {} },
      error: null,
    };
    await updateIssuePatterns({ pattern_id: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001' }, {});
    expect(updatePayloads).toHaveLength(1);
    const payload = updatePayloads[0];
    expect(payload.occurrence_count).toBe(22);
    expect(payload.status).toBe('active');
    expect(payload.metadata.reopened_at).toBeTruthy();
    expect(payload.metadata.reopen_count).toBe(1);
    expect(payload.metadata.reopen_history).toHaveLength(1);
    expect(payload.metadata.reopen_history[0].previous_status).toBe('resolved');
    // resolution_date / resolution_notes are not part of the update payload at all —
    // the historical closure audit trail is left untouched.
    expect(payload.resolution_date).toBeUndefined();
    expect(payload.resolution_notes).toBeUndefined();
  });

  it('an obsolete pattern with a new occurrence also auto-reopens', async () => {
    fetchResult = { data: { id: 'PAT-Y', occurrence_count: 5, status: 'obsolete', metadata: {} }, error: null };
    await updateIssuePatterns({ pattern_id: 'PAT-Y' }, {});
    expect(updatePayloads[0].status).toBe('active');
  });

  it('reopen_history is bounded to the last 10 entries across repeated reopen cycles', async () => {
    const existingHistory = Array.from({ length: 10 }, (_, i) => ({ at: `t${i}`, previous_status: 'resolved' }));
    fetchResult = {
      data: { id: 'PAT-Z', occurrence_count: 30, status: 'resolved', metadata: { reopen_count: 10, reopen_history: existingHistory } },
      error: null,
    };
    await updateIssuePatterns({ pattern_id: 'PAT-Z' }, {});
    const payload = updatePayloads[0];
    expect(payload.metadata.reopen_count).toBe(11);
    expect(payload.metadata.reopen_history).toHaveLength(10);
    // Oldest entry (t0) dropped, newest kept.
    expect(payload.metadata.reopen_history.some((h) => h.at === 't0')).toBe(false);
  });
});
