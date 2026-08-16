/**
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-4) — assertSdDispatchable's narrow
 * parent_completion exception to the orchestrator_parent dispatch fence.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { assertSdDispatchable } = require('./dispatch.cjs');

const PARENT_ID = 'parent-uuid-1';
const PARENT_KEY = 'SD-ORCH-PARENT-001';

function stubSupabase({ sdRow, childrenRows = [], handoffRows = [] }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col, val) => {
              // assertSdDispatchable's own lookup: eq('sd_key', sdKey)
              if (col === 'sd_key') return { maybeSingle: () => Promise.resolve({ data: sdRow, error: null }) };
              // checkParentCompletable's children lookup: eq('parent_sd_id', parent.id)
              if (col === 'parent_sd_id') return Promise.resolve({ data: childrenRows, error: null });
              throw new Error(`unexpected eq column: ${col}`);
            },
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            or: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: handoffRows, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function waRow(payload) {
  return {
    message_type: 'WORK_ASSIGNMENT',
    target_sd: PARENT_KEY,
    payload,
  };
}

describe('assertSdDispatchable — FR-4 parent_completion exception', () => {
  it('ALLOWS a parent_completion WA on an eligible orchestrator parent (all children terminal, no accepted LFA, not completed/cancelled)', async () => {
    const supabase = stubSupabase({
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'parent_completion' }), { warn() {}, error() {} })
    ).resolves.toBeUndefined();
  });

  it('REFUSES the SAME parent with status=cancelled (resurrection-exclusion regression test) -- caught by the EARLIER, independent terminal-status guard, before this FR\'s own check even runs; defense in depth, not a gap', async () => {
    const supabase = stubSupabase({
      sdRow: { id: PARENT_ID, status: 'cancelled', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'parent_completion' }), { warn() {}, error() {} })
    ).rejects.toMatchObject({ code: 'DISPATCH_SD_TERMINAL' });
  });

  it('checkParentCompletable itself ALSO refuses a cancelled parent as a second, independent layer (proven directly, since assertSdDispatchable never reaches this code for cancelled SDs)', async () => {
    const { checkParentCompletable } = require('../fleet/orchestrator-completion.cjs');
    const supabase = stubSupabase({ sdRow: {}, childrenRows: [], handoffRows: [] });
    const result = await checkParentCompletable(supabase, { id: PARENT_ID, sd_key: PARENT_KEY, status: 'cancelled' });
    expect(result.couldNotCheck).toBe(false);
    expect(result.completable).toBe(false);
    expect(result.reason).toContain('PARENT_ALREADY_TERMINAL');
  });

  it('REFUSES a non-parent_completion-kind WA on an orchestrator parent exactly as before this SD (no regression)', async () => {
    const supabase = stubSupabase({
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'some_other_kind' }), { warn() {}, error() {} })
    ).rejects.toMatchObject({ code: 'DISPATCH_SD_INELIGIBLE', verdict: 'orchestrator_parent' });
  });

  it('REFUSES with "could not verify" (never fail-open) when the eligibility check itself errors', async () => {
    const supabase = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: (col) => {
                if (col === 'sd_key') {
                  return {
                    maybeSingle: () =>
                      Promise.resolve({
                        data: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
                        error: null,
                      }),
                  };
                }
                if (col === 'parent_sd_id') return Promise.resolve({ data: null, error: new Error('boom') });
                throw new Error(`unexpected eq column: ${col}`);
              },
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'parent_completion' }), { warn() {}, error() {} })
    ).rejects.toMatchObject({ code: 'DISPATCH_SD_INELIGIBLE', verdict: 'orchestrator_parent_could_not_verify' });
  });

  it('is a no-op for a non-orchestrator SD regardless of payload.kind (unaffected by this FR)', async () => {
    const supabase = stubSupabase({
      sdRow: { id: 'leaf-1', status: 'pending_approval', sd_type: 'feature', metadata: {}, target_application: 'EHG_Engineer' },
    });
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'parent_completion' }), { warn() {}, error() {} })
    ).resolves.toBeUndefined();
  });

  it('SEC-H1 regression (evidence d727c054): an orchestrator parent that ALSO carries a real second hold (requires_human_action) is REFUSED, not silently let through as a bare orchestrator_parent case', async () => {
    // sd_type='orchestrator' fires the orchestrator_parent axis; metadata.requires_human_action
    // ALSO fires the human_action_required axis. classifyDispatchIneligibility (single, first-
    // match) would report only 'orchestrator_parent' (checked first in the axis table) and
    // silently mask the human-action hold -- the exact defect SEC-H1 describes. The fix uses
    // classifyAllDispatchIneligibility and requires the axis SET to be exactly
    // ['orchestrator_parent'] before the parent_completion exception applies.
    const supabase = stubSupabase({
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: { requires_human_action: true }, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    await expect(
      assertSdDispatchable(supabase, waRow({ kind: 'parent_completion' }), { warn() {}, error() {} })
    ).rejects.toMatchObject({ code: 'DISPATCH_SD_INELIGIBLE' });
  });
});
