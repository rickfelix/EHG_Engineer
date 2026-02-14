/**
 * Unit Tests: Marketing Metrics Ingestor
 * SD-EVA-FEAT-MARKETING-AI-001 (US-006)
 */

import { describe, test, expect, vi } from 'vitest';
import { createMetricsIngestor, normalizeMetric, MAX_RETRIES, RETRY_DELAY_MS, WEBHOOK_PROCESSING_TARGET_MS } from '../../lib/marketing/ai/metrics-ingestor.js';

function mockSupabase(overrides = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

describe('MetricsIngestor', () => {
  describe('pollPlatform', () => {
    test('returns error when no client configured', async () => {
      const ingestor = createMetricsIngestor({ supabase: mockSupabase() });
      const result = await ingestor.pollPlatform('unknown');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No client for platform');
    });

    test('fetches and stores metrics successfully', async () => {
      const platformClients = {
        google: {
          fetchMetrics: vi.fn().mockResolvedValue([
            { channel: 'google', type: 'clicks', value: 100, timestamp: '2026-01-01T00:00:00Z' }
          ])
        }
      };
      const supabase = mockSupabase();
      const ingestor = createMetricsIngestor({ supabase, platformClients });
      const result = await ingestor.pollPlatform('google');

      expect(result.success).toBe(true);
      expect(result.metricsIngested).toBe(1);
    });

    test('updates poll state after successful fetch', async () => {
      const platformClients = {
        meta: { fetchMetrics: vi.fn().mockResolvedValue([]) }
      };
      const supabase = mockSupabase();
      const ingestor = createMetricsIngestor({ supabase, platformClients });
      await ingestor.pollPlatform('meta');

      expect(supabase.from).toHaveBeenCalledWith('metrics_poll_state');
    });

    test('returns error after retries exhausted', async () => {
      vi.useFakeTimers();
      try {
        const platformClients = {
          google: { fetchMetrics: vi.fn().mockRejectedValue(new Error('API timeout')) }
        };
        const logger = { warn: vi.fn(), error: vi.fn() };
        const ingestor = createMetricsIngestor({ supabase: mockSupabase(), platformClients, logger });
        const promise = ingestor.pollPlatform('google');
        await vi.advanceTimersByTimeAsync(90000);
        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.error).toContain('API timeout');
        expect(platformClients.google.fetchMetrics).toHaveBeenCalledTimes(MAX_RETRIES + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    test('alerts notifier on exhausted retries', async () => {
      vi.useFakeTimers();
      try {
        const platformClients = {
          google: { fetchMetrics: vi.fn().mockRejectedValue(new Error('fail')) }
        };
        const notifier = { alert: vi.fn().mockResolvedValue(undefined) };
        const ingestor = createMetricsIngestor({
          supabase: mockSupabase(),
          platformClients,
          notifier,
          logger: { warn: vi.fn(), error: vi.fn() }
        });
        const promise = ingestor.pollPlatform('google');
        await vi.advanceTimersByTimeAsync(90000);
        await promise;

        expect(notifier.alert).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'metrics_poll_failure', platform: 'google' })
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('processWebhook', () => {
    test('rejects invalid payload', async () => {
      const ingestor = createMetricsIngestor({ supabase: mockSupabase() });
      const result = await ingestor.processWebhook({
        platformName: 'google',
        payload: null
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('Invalid payload');
    });

    test('processes single event payload', async () => {
      const supabase = mockSupabase();
      const ingestor = createMetricsIngestor({ supabase });
      const result = await ingestor.processWebhook({
        platformName: 'meta',
        payload: { type: 'impression', value: 42, channel: 'instagram' }
      });

      expect(result.accepted).toBe(true);
      expect(result.metricsIngested).toBe(1);
      expect(result.processingTimeMs).toBeTypeOf('number');
    });

    test('processes array of events', async () => {
      const supabase = mockSupabase();
      const ingestor = createMetricsIngestor({ supabase });
      const result = await ingestor.processWebhook({
        platformName: 'google',
        payload: {
          events: [
            { type: 'click', value: 10 },
            { type: 'impression', value: 100 }
          ]
        }
      });

      expect(result.accepted).toBe(true);
      expect(result.metricsIngested).toBe(2);
    });

    test('rejects webhook with invalid signature', async () => {
      const platformClients = {
        stripe: { verifySignature: vi.fn().mockResolvedValue(false) }
      };
      const logger = { warn: vi.fn(), error: vi.fn() };
      const ingestor = createMetricsIngestor({ supabase: mockSupabase(), platformClients, logger });
      const result = await ingestor.processWebhook({
        platformName: 'stripe',
        payload: { value: 1 },
        headers: { 'x-signature': 'invalid' }
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    test('returns storage error when insert fails', async () => {
      const chain = {
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB write failed' } })
      };
      const supabase = { from: vi.fn().mockReturnValue(chain) };
      const ingestor = createMetricsIngestor({ supabase });
      const result = await ingestor.processWebhook({
        platformName: 'test',
        payload: { type: 'test', value: 1 }
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('Storage failed');
    });
  });

  describe('pollAll', () => {
    test('polls all configured platforms', async () => {
      const platformClients = {
        google: { fetchMetrics: vi.fn().mockResolvedValue([{ type: 'click', value: 1 }]) },
        meta: { fetchMetrics: vi.fn().mockResolvedValue([]) }
      };
      const supabase = mockSupabase();
      const ingestor = createMetricsIngestor({ supabase, platformClients });
      const result = await ingestor.pollAll();

      expect(result.results).toHaveLength(2);
      expect(result.results[0].platform).toBe('google');
      expect(result.results[1].platform).toBe('meta');
    });
  });

  describe('normalizeMetric', () => {
    test('normalizes raw metric with standard fields', () => {
      const result = normalizeMetric(
        { channel: 'email', type: 'open', value: 42, timestamp: '2026-01-01T00:00:00Z' },
        'resend'
      );
      expect(result.channel).toBe('email');
      expect(result.metric_type).toBe('open');
      expect(result.value).toBe(42);
      expect(result.source).toBe('resend');
      expect(result.raw_data).toBeTruthy();
    });

    test('uses fallback field names', () => {
      const result = normalizeMetric(
        { platform: 'facebook', event_type: 'impression', value: '100', created_at: '2026-02-01' },
        'meta'
      );
      expect(result.channel).toBe('facebook');
      expect(result.metric_type).toBe('impression');
      expect(result.value).toBe(100);
    });

    test('uses source as channel fallback', () => {
      const result = normalizeMetric({ value: 5 }, 'tiktok');
      expect(result.channel).toBe('tiktok');
      expect(result.metric_type).toBe('unknown');
    });

    test('parses string values to numbers', () => {
      const result = normalizeMetric({ value: '3.14' }, 'test');
      expect(result.value).toBeCloseTo(3.14);
    });

    test('defaults to 0 for unparseable values', () => {
      const result = normalizeMetric({ value: 'not-a-number' }, 'test');
      expect(result.value).toBe(0);
    });
  });

  describe('constants', () => {
    test('MAX_RETRIES is 2', () => {
      expect(MAX_RETRIES).toBe(2);
    });

    test('RETRY_DELAY_MS is 30000', () => {
      expect(RETRY_DELAY_MS).toBe(30_000);
    });

    test('WEBHOOK_PROCESSING_TARGET_MS is 500', () => {
      expect(WEBHOOK_PROCESSING_TARGET_MS).toBe(500);
    });
  });
});
