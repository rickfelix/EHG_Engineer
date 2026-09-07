/**
 * QF-20260905-060 — a directed venture/cross-repo WORK_ASSIGNMENT must not be purged
 * unfit_repo_mismatch merely because the checking-in seat's cwd sits inside SOME leftover
 * .worktrees/ path. Specimen: WA 89c1faec (SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-B, target
 * app 'EHG') read from an EHG_Engineer .worktrees path left over from the already-completed
 * QF-20260903-347 -- purged, then the seat self-claimed unrelated harness work instead.
 *
 * Mirrors directed-assignment-parent-completion.test.js's mocking pattern: the REAL, unmocked
 * classifyAllDispatchIneligibility / isSdExecutableHere / isCwdWorktreeLiveClaim run against
 * fixture rows, so this proves the actual wiring, not an injected stand-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const directedAssignment = require_(path.join(REPO, 'lib/checkin/steps/directed-assignment.cjs'));

const VENTURE_KEY = 'SD-VENTURE-001';
const VENTURE_ID = 'venture-uuid-1';

function assignmentRow() {
  return {
    id: 'wa-1',
    message_type: 'WORK_ASSIGNMENT',
    created_at: new Date().toISOString(),
    payload: { sd_key: VENTURE_KEY },
  };
}

function baseHelpers() {
  return {
    ws: { getMessagesForSession: vi.fn(async () => [assignmentRow()]) },
    tryClaim: vi.fn(async () => ({ ok: true })),
    stampDirectedAssignment: vi.fn(async () => {}),
    ackMessage: vi.fn(async () => ({ acknowledged: true })),
    extractSdFromAssignment: () => VENTURE_KEY,
    isInformationalNudge: () => false,
    antiWinddownDirective: () => '',
    ASSIGNMENT_RECENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
    TERMINAL_CLAIM_ERRORS: new Set(),
  };
}

/** @param {{worktreeTable, worktreeCol, worktreeVal, worktreeRow}} worktree - the row backing
 *  whatever table/key isCwdWorktreeLiveClaim resolves the cwd's OWN worktree SD/QF against. */
function makeCtx({ helpers, worktree }) {
  const sb = {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col, val) => {
              if (col === 'sd_key' && val === VENTURE_KEY) {
                return { maybeSingle: () => Promise.resolve({
                  data: { id: VENTURE_ID, status: 'draft', sd_type: 'feature', metadata: {}, target_application: 'EHG' },
                  error: null,
                }) };
              }
              if (table === worktree.worktreeTable && col === worktree.worktreeCol && val === worktree.worktreeVal) {
                return { maybeSingle: () => Promise.resolve({ data: worktree.worktreeRow, error: null }) };
              }
              throw new Error(`unexpected sd_key lookup: ${val}`);
            },
          }),
        };
      }
      if (table === worktree.worktreeTable) {
        return {
          select: () => ({
            eq: (col, val) => {
              if (col === worktree.worktreeCol && val === worktree.worktreeVal) {
                return { maybeSingle: () => Promise.resolve({ data: worktree.worktreeRow, error: null }) };
              }
              throw new Error(`unexpected ${table} lookup: ${val}`);
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { sb, sessionId: 'worker-1', sessionRole: 'worker', helpers, base: {} };
}

describe('directed-assignment.cjs — QF-20260905-060 leftover-worktree repo_mismatch fix', () => {
  let cwdSpy;
  afterEach(() => { if (cwdSpy) cwdSpy.mockRestore(); });

  it('venture WA + leftover harness worktree cwd (completed QF, session never cd\'d away): CLAIMED', async () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('C:/Users/x/EHG_Engineer/.worktrees/qf/QF-LEFTOVER-001');
    const helpers = baseHelpers();
    const ctx = makeCtx({
      helpers,
      worktree: { worktreeTable: 'quick_fixes', worktreeCol: 'id', worktreeVal: 'QF-LEFTOVER-001', worktreeRow: { status: 'completed' } },
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeTruthy();
    expect(result.action).toBe('claimed_assignment');
    expect(result.sd).toBe(VENTURE_KEY);
    expect(helpers.tryClaim).toHaveBeenCalledWith(ctx.sb, VENTURE_KEY, 'worker-1');
  });

  it('venture WA + cwd inside a LIVE in-progress harness SD worktree: UNFIT, purged with a receipt', async () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('C:/Users/x/EHG_Engineer/.worktrees/SD-HARNESS-BUILD-001');
    const helpers = baseHelpers();
    const ctx = makeCtx({
      helpers,
      worktree: {
        worktreeTable: 'strategic_directives_v2', worktreeCol: 'sd_key', worktreeVal: 'SD-HARNESS-BUILD-001',
        worktreeRow: { status: 'in_progress', claiming_session_id: 'worker-1' },
      },
    });
    const result = await directedAssignment.run(ctx);
    expect(result).toBeUndefined();
    expect(helpers.tryClaim).not.toHaveBeenCalled();
    // "purged with a receipt": ackMessage stands for the DISPOSED/DECLINED receipt path
    // (ackWithReceipt only calls recordReceipt once ackMessage reports acknowledged:true).
    expect(helpers.ackMessage).toHaveBeenCalledWith(
      ctx.sb, 'wa-1', expect.objectContaining({ role: 'worker' })
    );
  });

  it('BEFORE-state regression, expressed: without the liveness gate, ANY worktree cwd purged the venture WA', () => {
    // isSdExecutableHere pre-fix (and still, when a caller omits cwdWorktreeIsLiveClaim) treats
    // every /.worktrees/ cwd as committed context regardless of whether ITS OWN claim is live —
    // this is the exact false positive QF-20260905-060 closes for the directed-assignment caller.
    const { isSdExecutableHere } = require_(path.join(REPO, 'lib/fleet/sd-executable-here.cjs'));
    const v = isSdExecutableHere(
      { sd_key: VENTURE_KEY, target_application: 'EHG', status: 'draft' },
      { cwd: 'C:/Users/x/EHG_Engineer/.worktrees/qf/QF-LEFTOVER-001' } // no cwdWorktreeIsLiveClaim
    );
    expect(v.blockClass).toBe('repo_mismatch'); // the pre-fix default this QF's caller now avoids
  });
});
