/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H — end-to-end proof that approving a
 * thesis_kill_tier_b decision through the real CLI approval path (scripts/
 * eva-decisions.js approveDecision) triggers the exit-init wiring, and that
 * approving any OTHER decision_type does not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { approveDecision } from '../../scripts/eva-decisions.js';

const ORIGINAL_ARGV = [...process.argv];

function setArgv(...extraFlags) {
  process.argv = [...ORIGINAL_ARGV.slice(0, 2), ...extraFlags];
}

beforeEach(() => setArgv('--rationale', 'test rationale, long enough'));
afterEach(() => {
  process.argv = [...ORIGINAL_ARGV];
  vi.restoreAllMocks();
});

function makeSupabaseStub(existingRow) {
  const inserted = [];
  const updated = [];
  return {
    inserted,
    updated,
    from(table) {
      if (table === 'chairman_decisions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: existingRow, error: null }),
            }),
          }),
          update: (payload) => ({
            eq: async () => {
              updated.push({ table, payload });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'system_events') {
        return {
          insert: async (row) => {
            inserted.push({ table, row });
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table in test stub: ${table}`);
    },
  };
}

describe('approveDecision — kill-to-exit wiring integration', () => {
  it('approving a thesis_kill_tier_b decision creates a PENDING exit-init marker', async () => {
    const supabase = makeSupabaseStub({
      id: 'decision-1',
      status: 'pending',
      venture_id: 'venture-1',
      lifecycle_stage: 16,
      brief_data: {},
      decision_type: 'thesis_kill_tier_b',
    });
    const exitSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await approveDecision(supabase, 'decision-1');

    expect(supabase.updated).toHaveLength(1);
    expect(supabase.updated[0].payload.status).toBe('approved');
    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0].table).toBe('system_events');
    expect(supabase.inserted[0].row.event_type).toBe('exit_init_pending');
    expect(supabase.inserted[0].row.venture_id).toBe('venture-1');

    exitSpy.mockRestore();
  });

  it('approving a non-kill decision_type does NOT create an exit-init marker', async () => {
    const supabase = makeSupabaseStub({
      id: 'decision-2',
      status: 'pending',
      venture_id: 'venture-2',
      lifecycle_stage: 22,
      brief_data: {},
      decision_type: 'stage_gate',
    });
    const exitSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await approveDecision(supabase, 'decision-2');

    expect(supabase.updated).toHaveLength(1);
    expect(supabase.inserted).toHaveLength(0);

    exitSpy.mockRestore();
  });
});
