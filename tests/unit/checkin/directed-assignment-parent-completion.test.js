/**
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-1) — directed-assignment.cjs's symmetric
 * exception to the orchestrator_parent claim fence, mirroring FR-4's dispatch.cjs exception.
 *
 * Without this, a parent_completion WORK_ASSIGNMENT that assertSdDispatchable allowed to be
 * CREATED would still be immediately DECLINED/purged at the worker's own claim step, because
 * classifyDispatchIneligibility is consumed independently here too (TESTING finding TST-C3).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const directedAssignment = require_(path.join(REPO, 'lib/checkin/steps/directed-assignment.cjs'));

const PARENT_KEY = 'SD-ORCH-PARENT-001';
const PARENT_ID = 'parent-uuid-1';

function assignmentRow(kind) {
  return {
    id: 'wa-1',
    message_type: 'WORK_ASSIGNMENT',
    created_at: new Date().toISOString(),
    payload: { sd_key: PARENT_KEY, kind },
  };
}

function baseHelpers({ classifyVerdict = 'orchestrator_parent', claimResult = { ok: true } } = {}) {
  return {
    ws: { getMessagesForSession: vi.fn(async () => [assignmentRow('parent_completion')]) },
    tryClaim: vi.fn(async () => claimResult),
    stampDirectedAssignment: vi.fn(async () => {}),
    ackMessage: vi.fn(async () => ({ acknowledged: true })),
    extractSdFromAssignment: () => PARENT_KEY,
    isInformationalNudge: () => false,
    classifyDispatchIneligibility: vi.fn(() => classifyVerdict),
    antiWinddownDirective: () => '',
    ASSIGNMENT_RECENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
    TERMINAL_CLAIM_ERRORS: new Set(),
  };
}

function makeCtx({ helpers, sdRow, childrenRows = [], handoffRows = [] }) {
  const sb = {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col, val) => {
              if (col === 'sd_key') return { maybeSingle: () => Promise.resolve({ data: sdRow, error: null }) };
              if (col === 'parent_sd_id') return Promise.resolve({ data: childrenRows, error: null });
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
  return { sb, sessionId: 'worker-1', sessionRole: 'worker', helpers, base: {} };
}

describe('directed-assignment.cjs — FR-1 parent_completion claim exception', () => {
  it('CLAIMS a parent_completion assignment on an eligible orchestrator parent (classifier says orchestrator_parent, but the parent is independently completable)', async () => {
    const helpers = baseHelpers();
    const ctx = makeCtx({
      helpers,
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeTruthy();
    expect(result.action).toBe('claimed_assignment');
    expect(result.sd).toBe(PARENT_KEY);
    expect(helpers.tryClaim).toHaveBeenCalledWith(ctx.sb, PARENT_KEY, 'worker-1');
  });

  it('DECLINES a parent_completion assignment on a NOT-completable orchestrator parent (e.g. an incomplete child) -- never fails open', async () => {
    const helpers = baseHelpers();
    const ctx = makeCtx({
      helpers,
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'in_progress' }],
      handoffRows: [],
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeUndefined();
    expect(helpers.tryClaim).not.toHaveBeenCalled();
    expect(helpers.ackMessage).toHaveBeenCalled(); // declined/purged, acked so it does not re-fire forever
  });

  it('DECLINES (never fails open) when the completability check itself throws', async () => {
    const helpers = baseHelpers();
    const throwingSb = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: (col) => {
                if (col === 'sd_key') {
                  return {
                    maybeSingle: () =>
                      Promise.resolve({ data: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' }, error: null }),
                  };
                }
                if (col === 'parent_sd_id') throw new Error('boom');
                throw new Error(`unexpected eq column: ${col}`);
              },
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const ctx = { sb: throwingSb, sessionId: 'worker-1', sessionRole: 'worker', helpers, base: {} };
    const result = await directedAssignment.run(ctx);
    expect(result).toBeUndefined();
    expect(helpers.tryClaim).not.toHaveBeenCalled();
  });

  it('a NON-parent_completion kind on an orchestrator parent is still refused exactly as before this SD', async () => {
    const helpers = {
      ...baseHelpers(),
      ws: { getMessagesForSession: vi.fn(async () => [assignmentRow('some_other_kind')]) },
    };
    const ctx = makeCtx({
      helpers,
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'orchestrator', metadata: {}, target_application: 'EHG_Engineer' },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      handoffRows: [],
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeUndefined();
    expect(helpers.tryClaim).not.toHaveBeenCalled();
  });

  it('a non-orchestrator_parent ineligibility verdict is never overridden by this exception', async () => {
    const helpers = baseHelpers({ classifyVerdict: 'human_action_required' });
    const ctx = makeCtx({
      helpers,
      sdRow: { id: PARENT_ID, status: 'pending_approval', sd_type: 'feature', metadata: { requires_human_action: true }, target_application: 'EHG_Engineer' },
      childrenRows: [],
      handoffRows: [],
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeUndefined();
    expect(helpers.tryClaim).not.toHaveBeenCalled();
  });
});
