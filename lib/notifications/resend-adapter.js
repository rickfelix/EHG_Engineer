/**
 * Resend Email Adapter
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Provider interface pattern for email delivery via Resend API.
 * Handles timeout, retry, and error mapping to internal status codes.
 */

import { createClient } from '@supabase/supabase-js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

/**
 * @typedef {Object} EmailPayload
 * @property {string} to - Recipient email
 * @property {string} subject - Email subject
 * @property {string} html - HTML body
 * @property {string} [text] - Plain text body
 * @property {string} [from] - Override sender (defaults to env)
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [providerMessageId] - Resend message ID on success
 * @property {string} [errorCode] - Error classification
 * @property {string} [errorMessage] - Human-readable error detail
 */

/**
 * Send an email via Resend API with retry and timeout.
 * @param {EmailPayload} payload
 * @returns {Promise<SendResult>}
 */
export async function sendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      errorCode: 'MISSING_API_KEY',
      errorMessage: 'RESEND_API_KEY environment variable not set'
    };
  }

  const from = payload.from || process.env.RESEND_FROM_EMAIL || 'EHG Chairman <chairman@ehg.ai>';

  const body = {
    from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    ...(payload.text && { text: payload.text })
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          providerMessageId: data.id
        };
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          errorCode: `HTTP_${response.status}`,
          errorMessage: errorData.message || response.statusText
        };
      }

      // Retryable: 429 (rate limit) or 5xx
      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        errorCode: `HTTP_${response.status}`,
        errorMessage: errorData.message || `Provider returned ${response.status} after ${MAX_RETRIES + 1} attempts`
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage: `Request timed out after ${DEFAULT_TIMEOUT_MS}ms (${MAX_RETRIES + 1} attempts)`
        };
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err.message
      };
    }
  }
}
