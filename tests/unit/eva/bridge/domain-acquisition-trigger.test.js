// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-10 (class j): post-approval acquisition-pipeline trigger.
import { describe, it, expect, vi } from 'vitest';
import {
  shouldTriggerAcquisitionPipeline,
  resolveAndRunAcquisitionPipeline,
  ACQUISITION_PACKET_KIND,
} from '../../../../lib/eva/bridge/domain-acquisition-trigger.js';

const DECISION_ID = 'aa11bb22-cc33-dd44-ee55-ff6677889900';

const ACQUISITION_DECISION_ROW = {
  status: 'approved',
  brief_data: { packet_kind: ACQUISITION_PACKET_KIND, recommended: 'craftbridge.com' },
};

describe('shouldTriggerAcquisitionPipeline (pure)', () => {
  it('an approved domain_acquisition decision should trigger', () => {
    expect(shouldTriggerAcquisitionPipeline(ACQUISITION_DECISION_ROW, 'approved')).toEqual({ shouldTrigger: true });
  });

  it('a rejected domain_acquisition decision does not trigger (no pipeline for a rejection)', () => {
    const result = shouldTriggerAcquisitionPipeline(ACQUISITION_DECISION_ROW, 'rejected');
    expect(result.shouldTrigger).toBe(false);
  });

  it('a non-acquisition decision (e.g. product_review, routed through the same chairman_approval category) never triggers', () => {
    const result = shouldTriggerAcquisitionPipeline({ status: 'approved', brief_data: { packet_kind: 'something_else' } }, 'approved');
    expect(result.shouldTrigger).toBe(false);
    expect(result.reason).toContain('something_else');
  });

  it('a null decision row (not found) never triggers', () => {
    expect(shouldTriggerAcquisitionPipeline(null, 'approved')).toEqual({ shouldTrigger: false, reason: 'decision row not found' });
  });

  it('a decision row with no brief_data never triggers (no packet_kind to match)', () => {
    const result = shouldTriggerAcquisitionPipeline({ status: 'approved' }, 'approved');
    expect(result.shouldTrigger).toBe(false);
  });
});

function makeSupabase({ decisionRow, decisionFetchError } = {}) {
  return {
    from: vi.fn((table) => {
      if (table !== 'chairman_decisions') throw new Error(`unmocked table: ${table}`);
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: decisionRow ?? null, error: decisionFetchError ?? null })) })) })) };
    }),
  };
}

describe('resolveAndRunAcquisitionPipeline (I/O)', () => {
  it('happy path: an approved acquisition decision runs the injected pipeline function in plan-mode (no registrar/execute deps)', async () => {
    const supabase = makeSupabase({ decisionRow: ACQUISITION_DECISION_ROW });
    const runPostApprovalPipelineFn = vi.fn().mockResolvedValue({ step: 'acquire', status: 'blocked_on_credentials', domain: 'craftbridge.com', plan: [] });

    const result = await resolveAndRunAcquisitionPipeline(supabase, { decisionId: DECISION_ID, action: 'approved', runPostApprovalPipelineFn });

    expect(result).toEqual({ ran: true, result: { step: 'acquire', status: 'blocked_on_credentials', domain: 'craftbridge.com', plan: [] } });
    expect(runPostApprovalPipelineFn).toHaveBeenCalledWith(supabase, DECISION_ID, {});
  });

  it('a rejected decision never invokes the pipeline function at all', async () => {
    const supabase = makeSupabase({ decisionRow: ACQUISITION_DECISION_ROW });
    const runPostApprovalPipelineFn = vi.fn();

    const result = await resolveAndRunAcquisitionPipeline(supabase, { decisionId: DECISION_ID, action: 'rejected', runPostApprovalPipelineFn });

    expect(result.ran).toBe(false);
    expect(runPostApprovalPipelineFn).not.toHaveBeenCalled();
  });

  it('a non-acquisition decision (different packet_kind) never invokes the pipeline function', async () => {
    const supabase = makeSupabase({ decisionRow: { status: 'approved', brief_data: { packet_kind: 'other' } } });
    const runPostApprovalPipelineFn = vi.fn();

    const result = await resolveAndRunAcquisitionPipeline(supabase, { decisionId: DECISION_ID, action: 'approved', runPostApprovalPipelineFn });

    expect(result.ran).toBe(false);
    expect(runPostApprovalPipelineFn).not.toHaveBeenCalled();
  });

  it('a pipeline function failure throws loudly rather than being swallowed', async () => {
    const supabase = makeSupabase({ decisionRow: ACQUISITION_DECISION_ROW });
    const runPostApprovalPipelineFn = vi.fn().mockRejectedValue(new Error('dns wiring failed'));

    await expect(resolveAndRunAcquisitionPipeline(supabase, { decisionId: DECISION_ID, action: 'approved', runPostApprovalPipelineFn }))
      .rejects.toThrow('dns wiring failed');
  });

  it('a chairman_decisions fetch error throws rather than silently skipping', async () => {
    const supabase = makeSupabase({ decisionFetchError: { message: 'connection refused' } });
    const runPostApprovalPipelineFn = vi.fn();

    await expect(resolveAndRunAcquisitionPipeline(supabase, { decisionId: DECISION_ID, action: 'approved', runPostApprovalPipelineFn }))
      .rejects.toThrow('connection refused');
    expect(runPostApprovalPipelineFn).not.toHaveBeenCalled();
  });
});
