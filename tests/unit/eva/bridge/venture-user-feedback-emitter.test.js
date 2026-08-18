// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-9 (class i): venture-user feedback emitter.
// The authenticated live-DB smoke test lives in the sibling
// venture-user-feedback-emitter-smoke.db.test.js file -- a describeDb suite cannot live in this
// unit-tier file (DB-test guard: describeDb suites can never run in the unit project).
import { describe, it, expect, vi } from 'vitest';
import { emitVentureUserFeedback } from '../../../../lib/eva/bridge/venture-user-feedback-emitter.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

describe('emitVentureUserFeedback', () => {
  it('a null ingestSecret short-circuits BEFORE any supabase call -- no venture has one provisioned today (QF-20260817-982)', async () => {
    const rpc = vi.fn();
    const supabase = { rpc };

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: VENTURE_ID, ingestSecret: null, feedbackType: 'user_other', title: 't', description: 'd',
    });

    expect(result).toEqual({ submitted: false, reason: 'no_ingest_secret_provisioned (blocked on QF-20260817-982)' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a real secret calls the RPC with the exact documented parameter names', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, id: 'fb-1' }, error: null });
    const supabase = { rpc };

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: VENTURE_ID, ingestSecret: 'real-secret', feedbackType: 'user_bug', title: 'Broken checkout', description: 'Cart empties on refresh',
    });

    expect(rpc).toHaveBeenCalledWith('fn_submit_venture_user_feedback', {
      p_venture_id: VENTURE_ID, p_ingest_secret: 'real-secret', p_feedback_type: 'user_bug',
      p_title: 'Broken checkout', p_description: 'Cart empties on refresh',
    });
    expect(result).toEqual({ submitted: true, id: 'fb-1' });
  });

  it('a wrong/unprovisioned secret surfaces the DB unauthorized error legibly, never throws', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'fn_submit_venture_user_feedback: unauthorized', code: '28000' } }) };

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: VENTURE_ID, ingestSecret: 'wrong-secret', feedbackType: 'user_other', title: 't', description: 'd',
    });

    expect(result).toEqual({ submitted: false, reason: 'rpc_error: fn_submit_venture_user_feedback: unauthorized' });
  });

  it('a missing-function error (migration not applied) is distinguished from a generic rpc error', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'schema cache miss' } }) };

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: VENTURE_ID, ingestSecret: 'real-secret', feedbackType: 'user_other', title: 't', description: 'd',
    });

    expect(result.reason).toContain('not yet applied');
  });

  it('an unexpected thrown error (e.g. network failure) is caught, never propagates', async () => {
    const supabase = { rpc: vi.fn().mockRejectedValue(new Error('ECONNRESET')) };

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: VENTURE_ID, ingestSecret: 'real-secret', feedbackType: 'user_other', title: 't', description: 'd',
    });

    expect(result.submitted).toBe(false);
    expect(result.reason).toContain('ECONNRESET');
  });
});
