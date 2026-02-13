/**
 * Tests for lib/notifications/resend-adapter.js
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Covers: sendEmail with mocked fetch
 * Focus: success, missing API key, timeout, HTTP errors, retries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must mock fetch before importing the module
const originalFetch = global.fetch;
let mockFetch;

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch;
  process.env.RESEND_API_KEY = 'test-api-key-123';
  process.env.RESEND_FROM_EMAIL = 'test@ehg.ai';
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

// Dynamic import to re-evaluate env vars each test
async function importSendEmail() {
  // Clear the module cache so env vars are re-evaluated
  const mod = await import('../../../lib/notifications/resend-adapter.js');
  return mod.sendEmail;
}

describe('resend-adapter', () => {
  const basePayload = {
    to: 'chairman@ehg.ai',
    subject: 'Test Email',
    html: '<h1>Hello</h1>',
    text: 'Hello'
  };

  describe('sendEmail - success', () => {
    it('returns success with provider message ID on 200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-abc-123' })
      });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('msg-abc-123');
    });

    it('sends correct request body to Resend API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-001' })
      });

      const sendEmail = await importSendEmail();
      await sendEmail(basePayload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key-123',
            'Content-Type': 'application/json'
          })
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.to).toEqual(['chairman@ehg.ai']);
      expect(callBody.subject).toBe('Test Email');
      expect(callBody.html).toBe('<h1>Hello</h1>');
      expect(callBody.text).toBe('Hello');
    });

    it('uses env RESEND_FROM_EMAIL when no from in payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-001' })
      });

      const sendEmail = await importSendEmail();
      await sendEmail(basePayload);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.from).toBe('test@ehg.ai');
    });

    it('uses payload from when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-001' })
      });

      const sendEmail = await importSendEmail();
      await sendEmail({ ...basePayload, from: 'custom@ehg.ai' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.from).toBe('custom@ehg.ai');
    });

    it('omits text field when not provided in payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-001' })
      });

      const sendEmail = await importSendEmail();
      await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).not.toHaveProperty('text');
    });
  });

  describe('sendEmail - missing API key', () => {
    it('returns MISSING_API_KEY error when env var not set', async () => {
      delete process.env.RESEND_API_KEY;

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_API_KEY');
      expect(result.errorMessage).toContain('RESEND_API_KEY');
    });

    it('does not call fetch when API key is missing', async () => {
      delete process.env.RESEND_API_KEY;

      const sendEmail = await importSendEmail();
      await sendEmail(basePayload);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendEmail - non-retryable client errors (4xx)', () => {
    it('returns HTTP_400 immediately without retry on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid email address' })
      });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('HTTP_400');
      expect(result.errorMessage).toBe('Invalid email address');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('returns HTTP_422 immediately on 422', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: () => Promise.resolve({ message: 'Missing required field' })
      });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('HTTP_422');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles json parse failure on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.reject(new Error('not json'))
      });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('HTTP_403');
      expect(result.errorMessage).toBe('Forbidden');
    });
  });

  describe('sendEmail - retryable errors (429, 5xx)', () => {
    it('retries on 429 and succeeds on second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({ message: 'Rate limited' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'msg-retry-ok' })
        });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('msg-retry-ok');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 and returns error after all retries exhausted', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Server error' })
      };
      // Initial + 2 retries = 3 total
      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse);

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('HTTP_500');
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('sendEmail - timeout (AbortError)', () => {
    it('retries on timeout and succeeds on later attempt', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'msg-timeout-retry' })
        });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('msg-timeout-retry');
    });

    it('returns TIMEOUT error after all retries exhausted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError);

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.errorMessage).toContain('timed out');
    });
  });

  describe('sendEmail - network errors', () => {
    it('retries on network error and succeeds on later attempt', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'msg-net-retry' })
        });

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('msg-net-retry');
    });

    it('returns NETWORK_ERROR after all retries exhausted', async () => {
      const netError = new Error('ECONNREFUSED');

      mockFetch
        .mockRejectedValueOnce(netError)
        .mockRejectedValueOnce(netError)
        .mockRejectedValueOnce(netError);

      const sendEmail = await importSendEmail();
      const result = await sendEmail(basePayload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
      expect(result.errorMessage).toBe('ECONNREFUSED');
    });
  });
});
