/**
 * Resend Email Adapter
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Provider interface pattern for email delivery via Resend API.
 * Handles timeout, retry, and error mapping to internal status codes.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const QUIET_WINDOW_TZ = 'America/New_York';
const QUIET_START_HOUR = 23; // 11:00 PM ET
const QUIET_END_HOUR = 5;    // 5:00 AM ET

/**
 * QF-20260703-195: chairman quiet window (23:00-05:00 America/New_York) — a hard floor at the
 * lowest shared send choke point so every caller (adam-heartbeat-email.mjs, adam-decision-email.mjs,
 * coordinator-*, fleet-down-alert.mjs) inherits it. Intl-based (DST-aware; never hand-offset).
 * Exported so callers can detect quiet-window edges (e.g. a post-resume note) and for unit tests.
 */
export function isWithinChairmanQuietWindow(now = new Date()) {
  const hour = Number(now.toLocaleTimeString('en-US', { timeZone: QUIET_WINDOW_TZ, hour12: false, hour: '2-digit' }));
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

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
 * @param {{ now?: Date }} [opts] - opts.now overrides the clock (unit tests only)
 * @returns {Promise<SendResult>}
 */
export async function sendEmail(payload, { now = new Date() } = {}) {
  if (isWithinChairmanQuietWindow(now)) {
    return {
      success: true,
      suppressed: true,
      errorCode: 'SUPPRESSED_QUIET_WINDOW',
      errorMessage: 'Chairman quiet window (23:00-05:00 America/New_York); send skipped to preserve quota.'
    };
  }

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
