/**
 * SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A Phase 0.
 * Unit tests for email-campaigns.js DB integration (campaign_enrollments).
 *
 * Verifies that the three previously-stubbed code paths now perform the
 * expected Supabase calls and return the right shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmailCampaigns, ENROLLMENT_STATUS } from '../../lib/marketing/ai/email-campaigns.js';

function makeSupabaseStub(handlers = {}) {
  // Chain-friendly mock: .from(table) returns an object whose methods are
  // preconfigured by the test per-table.
  return {
    from: vi.fn((table) => handlers[table] || {})
  };
}

describe('enrollInCampaign (campaign_enrollments INSERT)', () => {
  it('upserts a row and returns the generated enrollmentId', async () => {
    const upsertMock = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: 'e-123' }, error: null }) })
    }));
    const supabase = makeSupabaseStub({
      campaign_enrollments: { upsert: upsertMock }
    });
    const ec = createEmailCampaigns({ supabase, resendApiKey: 'k' });

    const result = await ec.enrollInCampaign({
      ventureId: 'v-1',
      leadEmail: 'a@b.co',
      campaignId: 'c-1'
    });

    expect(result).toEqual({ enrollmentId: 'e-123' });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({
      venture_id: 'v-1',
      lead_email: 'a@b.co',
      campaign_id: 'c-1',
      current_step: 0,
      opened_previous: false,
      status: ENROLLMENT_STATUS.ACTIVE
    });
    expect(opts).toEqual({ onConflict: 'venture_id,lead_email,campaign_id' });
  });

  it('throws when ventureId missing', async () => {
    const supabase = makeSupabaseStub({});
    const ec = createEmailCampaigns({ supabase });
    await expect(
      ec.enrollInCampaign({ leadEmail: 'a@b.co', campaignId: 'c-1' })
    ).rejects.toThrow(/ventureId/);
  });

  it('surfaces DB errors as thrown errors', async () => {
    const supabase = makeSupabaseStub({
      campaign_enrollments: {
        upsert: () => ({
          select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) })
        })
      }
    });
    const ec = createEmailCampaigns({ supabase });
    await expect(
      ec.enrollInCampaign({ ventureId: 'v', leadEmail: 'a@b.co', campaignId: 'c' })
    ).rejects.toThrow(/boom/);
  });
});

describe('handleUnsubscribe (campaign_enrollments UPDATE)', () => {
  it('returns campaignsRemoved equal to matched row count', async () => {
    // Build chainable mock: .update(...).eq(...).eq(...).select('id')
    const finalSelect = vi.fn(async () => ({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null }));
    const eqStatus = vi.fn(() => ({ select: finalSelect }));
    const eqEmail = vi.fn(() => ({ eq: eqStatus }));
    const updateMock = vi.fn(() => ({ eq: eqEmail }));
    const supabase = makeSupabaseStub({
      campaign_enrollments: { update: updateMock }
    });
    const ec = createEmailCampaigns({ supabase });

    const result = await ec.handleUnsubscribe('a@b.co');
    expect(result).toEqual({ campaignsRemoved: 3 });

    const [patch] = updateMock.mock.calls[0];
    expect(patch).toMatchObject({ status: ENROLLMENT_STATUS.UNSUBSCRIBED });
    expect(eqEmail).toHaveBeenCalledWith('lead_email', 'a@b.co');
    expect(eqStatus).toHaveBeenCalledWith('status', ENROLLMENT_STATUS.ACTIVE);
  });

  it('returns 0 when no rows matched', async () => {
    const supabase = makeSupabaseStub({
      campaign_enrollments: {
        update: () => ({
          eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) })
        })
      }
    });
    const ec = createEmailCampaigns({ supabase });
    expect(await ec.handleUnsubscribe('a@b.co')).toEqual({ campaignsRemoved: 0 });
  });

  it('returns 0 and logs on DB error (does not throw)', async () => {
    const supabase = makeSupabaseStub({
      campaign_enrollments: {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => ({ data: null, error: { message: 'rls denied' } })
            })
          })
        })
      }
    });
    const warn = vi.fn();
    const ec = createEmailCampaigns({ supabase, logger: { warn } });
    expect(await ec.handleUnsubscribe('a@b.co')).toEqual({ campaignsRemoved: 0 });
    expect(warn).toHaveBeenCalled();
  });
});

describe('processStep (campaign_enrollments UPDATE)', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeUpdateChain(result = { error: null }) {
    const eqMock = vi.fn(async () => result);
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    return { updateMock, eqMock };
  }

  it('advances current_step and opens windowed next_step_at on successful send', async () => {
    const { updateMock, eqMock } = makeUpdateChain();
    const supabase = makeSupabaseStub({
      campaign_enrollments: { update: updateMock }
    });
    const ec = createEmailCampaigns({
      supabase,
      resendClient: { emails: { send: async () => ({ id: 'msg-1' }) } }
    });

    const enrollment = {
      id: 'e-1',
      status: ENROLLMENT_STATUS.ACTIVE,
      current_step: 0,
      opened_previous: true,
      lead_email: 'a@b.co',
      campaign_id: 'c-1'
    };
    const steps = [{ subject: 's', htmlA: 'A', htmlB: 'B', delayHours: 1 }];

    const res = await ec.processStep(enrollment, steps);
    expect(res.action).toBe('sent');
    expect(res.nextStepAt).toBeTruthy();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [patch] = updateMock.mock.calls[0];
    expect(patch).toMatchObject({
      current_step: 1,
      opened_previous: false
    });
    expect(eqMock).toHaveBeenCalledWith('id', 'e-1');
  });

  it('marks enrollment completed when stepIndex >= steps.length', async () => {
    const { updateMock } = makeUpdateChain();
    const supabase = makeSupabaseStub({
      campaign_enrollments: { update: updateMock }
    });
    const ec = createEmailCampaigns({ supabase });
    const enrollment = {
      id: 'e-1',
      status: ENROLLMENT_STATUS.ACTIVE,
      current_step: 5
    };
    const res = await ec.processStep(enrollment, [{ subject: 's', htmlA: 'a' }]);
    expect(res).toEqual({ action: 'completed' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [patch] = updateMock.mock.calls[0];
    expect(patch.status).toBe(ENROLLMENT_STATUS.COMPLETED);
  });

  it('skips silently when enrollment.status !== active', async () => {
    const supabase = makeSupabaseStub({});
    const ec = createEmailCampaigns({ supabase });
    const res = await ec.processStep(
      { id: 'e-1', status: ENROLLMENT_STATUS.UNSUBSCRIBED, current_step: 0 },
      [{ subject: 's', htmlA: 'a' }]
    );
    expect(res.action).toBe('skipped');
  });
});

describe('no-stub-log regression', () => {
  it('source file does not contain the stale "not provisioned" string', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/marketing/ai/email-campaigns.js'),
      'utf8'
    );
    expect(src).not.toContain('not provisioned');
  });
});
