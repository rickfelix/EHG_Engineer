/**
 * Tests for lib/notifications/orchestrator.js
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Covers: sendImmediateNotification, sendDailyDigest, sendWeeklySummary
 * Focus: full pipeline (queue -> quiet hours -> rate limit -> send -> status update),
 *        idempotency, error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing orchestrator
vi.mock('../../../lib/notifications/resend-adapter.js', () => ({
  sendEmail: vi.fn()
}));

vi.mock('../../../lib/notifications/rate-limiter.js', () => ({
  checkRateLimit: vi.fn()
}));

vi.mock('../../../lib/notifications/email-templates.js', () => ({
  immediateTemplate: vi.fn(() => ({
    html: '<h1>Test</h1>',
    text: 'Test',
    subject: '[Action Required] Test Decision'
  })),
  dailyDigestTemplate: vi.fn(() => ({
    html: '<h1>Digest</h1>',
    text: 'Digest',
    subject: '[Daily Digest] 2026-02-13'
  })),
  weeklySummaryTemplate: vi.fn(() => ({
    html: '<h1>Summary</h1>',
    text: 'Summary',
    subject: '[Weekly Summary] 2026-02-10 - 2026-02-16'
  }))
}));

import { sendImmediateNotification, sendDailyDigest, sendWeeklySummary } from '../../../lib/notifications/orchestrator.js';
import { sendEmail } from '../../../lib/notifications/resend-adapter.js';
import { checkRateLimit } from '../../../lib/notifications/rate-limiter.js';

describe('orchestrator', () => {
  let mockSupabase;
  let mockFromChain;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: rate limit allows, email succeeds
    checkRateLimit.mockResolvedValue({ allowed: true, currentCount: 2, limit: 10 });
    sendEmail.mockResolvedValue({ success: true, providerMessageId: 'msg-001' });

    // Build a flexible mock Supabase chain
    mockFromChain = {};
    mockSupabase = {
      from: vi.fn(() => mockFromChain)
    };
  });

  /**
   * Helper: configure the Supabase mock for a series of `from()` calls.
   * Each call to `from()` returns the next chain in sequence.
   */
  function configureFromSequence(chains) {
    let callIdx = 0;
    mockSupabase.from = vi.fn(() => {
      const chain = chains[callIdx] || chains[chains.length - 1];
      callIdx++;
      return chain;
    });
  }

  /**
   * Helper: create a chain for insert(...).select(...).single()
   */
  function insertChain({ data = null, error = null } = {}) {
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error })
        })
      })
    };
  }

  /**
   * Helper: create a chain for select(...).eq(...).single() used by quiet hours check
   */
  function selectSingleChain({ data = null, error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data, error })
          })
        })
      })
    };
  }

  /**
   * Helper: create a chain for update(...).eq(...)
   */
  function updateChain({ error = null } = {}) {
    return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error })
      })
    };
  }

  /**
   * Helper: create a chain for select(...).eq(...).in(...).limit(...)
   * used by idempotency checks
   */
  function selectIdempotencyChain({ data = [], error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data, error })
          })
        })
      })
    };
  }

  /**
   * Helper: create a chain for event queries
   */
  function selectEventsChain({ data = [], error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data, error })
              })
            })
          })
        })
      })
    };
  }

  /**
   * Helper: create a chain for ventures by stage query
   */
  function selectVenturesChain({ data = [], error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error })
      })
    };
  }

  /**
   * Helper: create a chain for decisions query
   */
  function selectDecisionsChain({ data = [], error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data, error })
        })
      })
    };
  }

  describe('sendImmediateNotification', () => {
    const baseParams = {
      decisionId: 'dec-001',
      decisionTitle: 'Approve Funding',
      ventureName: 'Venture X',
      priority: 'critical',
      chairmanUserId: 'user-001',
      recipientEmail: 'chairman@ehg.ai'
    };

    it('creates notification, checks quiet hours + rate limit, sends email, and updates status to sent', async () => {
      configureFromSequence([
        // 1. Insert notification record
        insertChain({ data: { id: 'notif-001' } }),
        // 2. Quiet hours check (no prefs = not in quiet hours)
        selectSingleChain({ data: null }),
        // 3. Rate limit check (separate from() call for chairman_notifications)
        // Rate limiter is mocked, so this from() call is for the status update
        // Actually, checkRateLimit is fully mocked and doesn't call supabase
        // 4. Update notification status to 'sent'
        updateChain()
      ]);

      const result = await sendImmediateNotification(mockSupabase, baseParams);

      expect(result.notificationId).toBe('notif-001');
      expect(result.status).toBe('sent');
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('returns deferred when chairman is in quiet hours', async () => {
      configureFromSequence([
        // 1. Insert notification
        insertChain({ data: { id: 'notif-002' } }),
        // 2. Quiet hours check - returns enabled quiet hours that cover current time
        selectSingleChain({
          data: {
            preference_value: JSON.stringify({
              enabled: true,
              start: '00:00',
              end: '23:59'
            })
          }
        }),
        // 3. Update status to deferred
        updateChain()
      ]);

      const result = await sendImmediateNotification(mockSupabase, baseParams);

      expect(result.notificationId).toBe('notif-002');
      expect(result.status).toBe('deferred');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('returns rate_limited when rate limit exceeded', async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, currentCount: 10, limit: 10 });

      configureFromSequence([
        // 1. Insert notification
        insertChain({ data: { id: 'notif-003' } }),
        // 2. Quiet hours check (not in quiet hours)
        selectSingleChain({ data: null }),
        // 3. Update status to rate_limited
        updateChain()
      ]);

      const result = await sendImmediateNotification(mockSupabase, baseParams);

      expect(result.notificationId).toBe('notif-003');
      expect(result.status).toBe('rate_limited');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('returns failed when email send fails', async () => {
      sendEmail.mockResolvedValue({
        success: false,
        errorCode: 'HTTP_500',
        errorMessage: 'Server error'
      });

      configureFromSequence([
        // 1. Insert notification
        insertChain({ data: { id: 'notif-004' } }),
        // 2. Quiet hours check
        selectSingleChain({ data: null }),
        // 3. Update status to failed
        updateChain()
      ]);

      const result = await sendImmediateNotification(mockSupabase, baseParams);

      expect(result.notificationId).toBe('notif-004');
      expect(result.status).toBe('failed');
    });

    it('throws when insert fails', async () => {
      configureFromSequence([
        insertChain({ data: null, error: { message: 'DB insert error' } })
      ]);

      await expect(sendImmediateNotification(mockSupabase, baseParams))
        .rejects.toThrow('Failed to create notification record');
    });

    it('skips quiet hours when preference is disabled', async () => {
      configureFromSequence([
        insertChain({ data: { id: 'notif-005' } }),
        selectSingleChain({
          data: {
            preference_value: JSON.stringify({ enabled: false, start: '00:00', end: '23:59' })
          }
        }),
        updateChain()
      ]);

      const result = await sendImmediateNotification(mockSupabase, baseParams);
      expect(result.status).toBe('sent');
    });
  });

  describe('sendDailyDigest', () => {
    const baseParams = {
      chairmanUserId: 'user-001',
      recipientEmail: 'chairman@ehg.ai',
      timezone: 'UTC',
      sendDate: '2026-02-13'
    };

    it('returns already_sent when digest for this key already exists', async () => {
      configureFromSequence([
        // Idempotency check returns existing record
        selectIdempotencyChain({ data: [{ id: 'existing-notif' }] })
      ]);

      const result = await sendDailyDigest(mockSupabase, baseParams);
      expect(result.notificationId).toBe('existing-notif');
      expect(result.status).toBe('already_sent');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('returns no_events when no events found in the last 24 hours', async () => {
      configureFromSequence([
        // Idempotency check - no existing
        selectIdempotencyChain({ data: [] }),
        // Event query - returns empty
        selectEventsChain({ data: [] })
      ]);

      const result = await sendDailyDigest(mockSupabase, baseParams);
      expect(result.notificationId).toBeNull();
      expect(result.status).toBe('no_events');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends digest and returns sent on success', async () => {
      configureFromSequence([
        // Idempotency check - no existing
        selectIdempotencyChain({ data: [] }),
        // Event query - returns events
        selectEventsChain({
          data: [
            { event_type: 'stage_completion', event_data: { venture_name: 'V1', description: 'Completed' }, created_at: '2026-02-13T10:00:00Z' }
          ]
        }),
        // Insert notification
        insertChain({ data: { id: 'digest-001' } }),
        // Update status to sent
        updateChain()
      ]);

      const result = await sendDailyDigest(mockSupabase, baseParams);
      expect(result.notificationId).toBe('digest-001');
      expect(result.status).toBe('sent');
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('returns failed when email send fails', async () => {
      sendEmail.mockResolvedValue({
        success: false,
        errorCode: 'HTTP_500',
        errorMessage: 'Email delivery failed'
      });

      configureFromSequence([
        selectIdempotencyChain({ data: [] }),
        selectEventsChain({
          data: [{ event_type: 'test', event_data: {}, created_at: '2026-02-13T10:00:00Z' }]
        }),
        insertChain({ data: { id: 'digest-002' } }),
        updateChain()
      ]);

      const result = await sendDailyDigest(mockSupabase, baseParams);
      expect(result.notificationId).toBe('digest-002');
      expect(result.status).toBe('failed');
    });

    it('throws when insert fails', async () => {
      configureFromSequence([
        selectIdempotencyChain({ data: [] }),
        selectEventsChain({
          data: [{ event_type: 'test', event_data: {}, created_at: '2026-02-13T10:00:00Z' }]
        }),
        insertChain({ data: null, error: { message: 'Insert failed' } })
      ]);

      await expect(sendDailyDigest(mockSupabase, baseParams))
        .rejects.toThrow('Failed to create digest notification');
    });
  });

  describe('sendWeeklySummary', () => {
    const baseParams = {
      chairmanUserId: 'user-001',
      recipientEmail: 'chairman@ehg.ai',
      timezone: 'UTC',
      weekStart: '2026-02-10',
      weekEnd: '2026-02-16'
    };

    it('returns already_sent when summary for this key already exists', async () => {
      configureFromSequence([
        selectIdempotencyChain({ data: [{ id: 'existing-summary' }] })
      ]);

      const result = await sendWeeklySummary(mockSupabase, baseParams);
      expect(result.notificationId).toBe('existing-summary');
      expect(result.status).toBe('already_sent');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('gathers metrics and sends summary on success', async () => {
      configureFromSequence([
        // Idempotency check - no existing
        selectIdempotencyChain({ data: [] }),
        // Ventures by stage query
        selectVenturesChain({
          data: [
            { current_stage: 'Stage 0' },
            { current_stage: 'Stage 0' },
            { current_stage: 'Stage 1' }
          ]
        }),
        // Decisions query
        selectDecisionsChain({
          data: [
            { decision_type: 'advance' },
            { decision_type: 'kill' }
          ]
        }),
        // Insert notification
        insertChain({ data: { id: 'summary-001' } }),
        // Update status to sent
        updateChain()
      ]);

      const result = await sendWeeklySummary(mockSupabase, baseParams);
      expect(result.notificationId).toBe('summary-001');
      expect(result.status).toBe('sent');
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('returns failed when email send fails', async () => {
      sendEmail.mockResolvedValue({
        success: false,
        errorCode: 'TIMEOUT',
        errorMessage: 'Request timed out'
      });

      configureFromSequence([
        selectIdempotencyChain({ data: [] }),
        selectVenturesChain({ data: [] }),
        selectDecisionsChain({ data: [] }),
        insertChain({ data: { id: 'summary-002' } }),
        updateChain()
      ]);

      const result = await sendWeeklySummary(mockSupabase, baseParams);
      expect(result.notificationId).toBe('summary-002');
      expect(result.status).toBe('failed');
    });

    it('throws when insert fails', async () => {
      configureFromSequence([
        selectIdempotencyChain({ data: [] }),
        selectVenturesChain({ data: [] }),
        selectDecisionsChain({ data: [] }),
        insertChain({ data: null, error: { message: 'Insert failed' } })
      ]);

      await expect(sendWeeklySummary(mockSupabase, baseParams))
        .rejects.toThrow('Failed to create weekly summary notification');
    });
  });
});
