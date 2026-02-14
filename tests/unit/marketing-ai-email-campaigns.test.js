/**
 * Unit Tests: Email Marketing via Resend with Drip Campaigns
 * SD-EVA-FEAT-MARKETING-AI-001 (US-005)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmailCampaigns, ENROLLMENT_STATUS, MAX_RETRY_ATTEMPTS, RETRY_DELAYS_MS, DEFAULT_STEP_DELAY_HOURS } from '../../lib/marketing/ai/email-campaigns.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function mockSupabase(overrides = {}) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'enroll-001' }, error: null }),
    ...overrides
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

describe('EmailCampaigns', () => {
  describe('sendEmail', () => {
    test('succeeds on first attempt with injected client', async () => {
      const resendClient = {
        emails: { send: vi.fn().mockResolvedValue({ id: 'msg-001' }) }
      };
      const campaigns = createEmailCampaigns({ supabase: mockSupabase(), resendClient });
      const result = await campaigns.sendEmail({
        to: 'user@example.com',
        subject: 'Welcome',
        html: '<h1>Hi</h1>'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-001');
      expect(result.attempts).toBe(1);
    });

    test('retries on 429 rate limit', async () => {
      const rateLimitErr = new Error('Rate limited');
      rateLimitErr.statusCode = 429;
      const resendClient = {
        emails: {
          send: vi.fn()
            .mockRejectedValueOnce(rateLimitErr)
            .mockResolvedValueOnce({ id: 'msg-002' })
        }
      };
      const logger = { warn: vi.fn(), error: vi.fn() };
      const campaigns = createEmailCampaigns({ supabase: mockSupabase(), resendClient, logger });
      const promise = campaigns.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>test</p>'
      });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('does not retry on 4xx client errors (except 429)', async () => {
      const clientErr = new Error('Bad request');
      clientErr.statusCode = 400;
      const resendClient = {
        emails: { send: vi.fn().mockRejectedValue(clientErr) }
      };
      const campaigns = createEmailCampaigns({ supabase: mockSupabase(), resendClient });
      const result = await campaigns.sendEmail({
        to: 'bad@example.com',
        subject: 'Test',
        html: '<p>test</p>'
      });

      expect(result.success).toBe(false);
      expect(resendClient.emails.send).toHaveBeenCalledTimes(1);
    });

    test('returns error after max retries exhausted', async () => {
      const serverErr = new Error('Server error');
      serverErr.statusCode = 500;
      const resendClient = {
        emails: { send: vi.fn().mockRejectedValue(serverErr) }
      };
      const campaigns = createEmailCampaigns({ supabase: mockSupabase(), resendClient });
      const promise = campaigns.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>test</p>'
      });
      await vi.advanceTimersByTimeAsync(20000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
      expect(result.attempts).toBe(MAX_RETRY_ATTEMPTS);
    });
  });

  describe('enrollInCampaign', () => {
    test('creates enrollment record', async () => {
      const supabase = mockSupabase();
      const campaigns = createEmailCampaigns({ supabase, resendClient: { emails: { send: vi.fn() } } });
      const result = await campaigns.enrollInCampaign({
        leadEmail: 'lead@example.com',
        campaignId: 'camp-001'
      });

      expect(result.enrollmentId).toBe('enroll-001');
      expect(supabase.from).toHaveBeenCalledWith('campaign_enrollments');
    });

    test('throws on database error', async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
      };
      const supabase = { from: vi.fn().mockReturnValue(chain) };
      const campaigns = createEmailCampaigns({ supabase, resendClient: { emails: { send: vi.fn() } } });

      await expect(campaigns.enrollInCampaign({
        leadEmail: 'fail@example.com',
        campaignId: 'camp-001'
      })).rejects.toThrow('Enrollment failed');
    });
  });

  describe('processStep', () => {
    test('skips non-active enrollment', async () => {
      const supabase = mockSupabase();
      const resendClient = { emails: { send: vi.fn().mockResolvedValue({ id: 'msg' }) } };
      const campaigns = createEmailCampaigns({ supabase, resendClient });
      const result = await campaigns.processStep(
        { id: 'e1', status: 'completed', current_step: 0, lead_email: 'a@b.com' },
        [{ subject: 'S1', htmlA: '<p>A</p>', delayHours: 24 }]
      );

      expect(result.action).toBe('skipped');
    });

    test('completes enrollment when all steps done', async () => {
      const supabase = mockSupabase();
      const resendClient = { emails: { send: vi.fn().mockResolvedValue({ id: 'msg' }) } };
      const campaigns = createEmailCampaigns({ supabase, resendClient });
      const result = await campaigns.processStep(
        { id: 'e1', status: 'active', current_step: 2, lead_email: 'a@b.com', campaign_id: 'c1' },
        [{ subject: 'S1', htmlA: '<p>A</p>' }, { subject: 'S2', htmlA: '<p>B</p>' }]
      );

      expect(result.action).toBe('completed');
    });

    test('sends email and advances step on success', async () => {
      const supabase = mockSupabase();
      const resendClient = { emails: { send: vi.fn().mockResolvedValue({ id: 'msg-100' }) } };
      const campaigns = createEmailCampaigns({ supabase, resendClient });
      const result = await campaigns.processStep(
        { id: 'e1', status: 'active', current_step: 0, lead_email: 'a@b.com', campaign_id: 'c1' },
        [{ subject: 'Welcome', htmlA: '<p>Hi A</p>', htmlB: '<p>Hi B</p>', delayHours: 48 }]
      );

      expect(result.action).toBe('sent');
      expect(result.nextStepAt).toBeTruthy();
    });

    test('uses htmlB for non-openers', async () => {
      const supabase = mockSupabase();
      const resendClient = { emails: { send: vi.fn().mockResolvedValue({ id: 'msg' }) } };
      const campaigns = createEmailCampaigns({ supabase, resendClient });
      await campaigns.processStep(
        { id: 'e1', status: 'active', current_step: 0, lead_email: 'a@b.com', campaign_id: 'c1', opened_previous: false },
        [{ subject: 'S1', htmlA: '<p>Opener</p>', htmlB: '<p>Non-opener</p>', delayHours: 24 }]
      );

      expect(resendClient.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({ html: '<p>Non-opener</p>' })
      );
    });
  });

  describe('handleUnsubscribe', () => {
    test('unsubscribes from all active campaigns', async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [{ id: 'e1' }, { id: 'e2' }], error: null })
      };
      const supabase = { from: vi.fn().mockReturnValue(chain) };
      const campaigns = createEmailCampaigns({ supabase, resendClient: { emails: { send: vi.fn() } } });
      const result = await campaigns.handleUnsubscribe('user@example.com');

      expect(result.campaignsRemoved).toBe(2);
    });
  });

  describe('constants', () => {
    test('ENROLLMENT_STATUS values', () => {
      expect(ENROLLMENT_STATUS.ACTIVE).toBe('active');
      expect(ENROLLMENT_STATUS.COMPLETED).toBe('completed');
      expect(ENROLLMENT_STATUS.UNSUBSCRIBED).toBe('unsubscribed');
      expect(ENROLLMENT_STATUS.FAILED).toBe('failed');
    });

    test('MAX_RETRY_ATTEMPTS is 3', () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });

    test('RETRY_DELAYS_MS has exponential backoff', () => {
      expect(RETRY_DELAYS_MS).toEqual([1000, 4000, 16000]);
    });

    test('DEFAULT_STEP_DELAY_HOURS is 48', () => {
      expect(DEFAULT_STEP_DELAY_HOURS).toBe(48);
    });
  });
});
