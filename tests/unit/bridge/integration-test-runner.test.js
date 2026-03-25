import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runIntegrationTests, formatForAdvisoryData } from '../../../lib/eva/bridge/integration-test-runner.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('integration-test-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTEGRATION_TEST_TIMEOUT_MS;
  });

  describe('runIntegrationTests', () => {
    it('returns all passing results for healthy endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ status: 'ok' }),
      });
      // Fix headers.get for mock
      mockFetch.mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        headers: { get: (k) => k === 'content-type' ? 'application/json' : null },
        json: async () => ({ status: 'ok' }),
      });

      const results = await runIntegrationTests('http://localhost:3000', { logger: silentLogger });
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results[0].name).toBe('health_check');
      expect(results[0].passed).toBe(true);
    });

    it('skips API and data flow tests when health check fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

      const results = await runIntegrationTests('http://localhost:3000', { logger: silentLogger });
      expect(results[0].name).toBe('health_check');
      expect(results[0].passed).toBe(false);
      expect(results[1].details).toContain('Skipped');
      expect(results[2].details).toContain('Skipped');
    });

    it('handles connection timeout gracefully', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 10);
        });
      });

      const results = await runIntegrationTests('http://unreachable:9999', {
        timeoutMs: 50,
        logger: silentLogger,
      });
      expect(results[0].passed).toBe(false);
      expect(results[0].details).toContain('Timeout');
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const results = await runIntegrationTests('http://localhost:9999', { logger: silentLogger });
      expect(results[0].passed).toBe(false);
      expect(results[0].details).toContain('ECONNREFUSED');
    });

    it('detects non-JSON API response', async () => {
      // Health check passes
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
      // API contract returns HTML
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        headers: { get: () => 'text/html' },
      });
      // Data flow
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

      const results = await runIntegrationTests('http://localhost:3000', { logger: silentLogger });
      const apiResult = results.find(r => r.name.startsWith('api_contract'));
      expect(apiResult.passed).toBe(false);
      expect(apiResult.details).toContain('Expected JSON');
    });

    it('respects INTEGRATION_TEST_TIMEOUT_MS env var', async () => {
      process.env.INTEGRATION_TEST_TIMEOUT_MS = '5000';
      mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => ({ status: 'ok' }),
      });

      const results = await runIntegrationTests('http://localhost:3000', { logger: silentLogger });
      expect(results[0].passed).toBe(true);
    });
  });

  describe('formatForAdvisoryData', () => {
    it('formats results for advisory_data JSONB', () => {
      const results = [
        { name: 'health_check', passed: true, details: 'OK', duration_ms: 50 },
        { name: 'api_contract', passed: true, details: 'OK', duration_ms: 100 },
        { name: 'data_flow', passed: false, details: 'Failed', duration_ms: 200 },
      ];

      const formatted = formatForAdvisoryData(results);
      expect(formatted.integration_test_results).toEqual(results);
      expect(formatted.integration_test_summary.total).toBe(3);
      expect(formatted.integration_test_summary.passing).toBe(2);
      expect(formatted.integration_test_summary.pass_rate).toBe(67);
      expect(formatted.integration_test_summary.tested_at).toBeTruthy();
    });

    it('handles empty results', () => {
      const formatted = formatForAdvisoryData([]);
      expect(formatted.integration_test_summary.total).toBe(0);
      expect(formatted.integration_test_summary.pass_rate).toBe(0);
    });
  });
});
