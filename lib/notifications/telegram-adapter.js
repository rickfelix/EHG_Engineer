/**
 * Telegram Adapter
 * SD: SD-MAN-INFRA-TELEGRAM-ADAPTER-VISION-001
 *
 * Provider interface for delivering messages via the Telegram Bot API.
 * Mirrors the resend-adapter.js pattern: timeout, retry, error mapping.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN - Bot token from @BotFather
 *   TELEGRAM_CHAT_ID   - Target chat/channel ID
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;

/**
 * @typedef {Object} TelegramPayload
 * @property {string} chatId - Target chat ID (overrides TELEGRAM_CHAT_ID env var)
 * @property {string} text   - Message text (plain text or HTML with parse_mode)
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [providerMessageId] - Telegram message_id on success
 * @property {string} [errorCode]         - Error classification
 * @property {string} [errorMessage]      - Human-readable error detail
 */

/**
 * Send a message via Telegram Bot API with retry and timeout.
 * @param {TelegramPayload} payload
 * @returns {Promise<SendResult>}
 */
export async function sendTelegramMessage(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = payload.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    return {
      success: false,
      errorCode: 'MISSING_BOT_TOKEN',
      errorMessage: 'TELEGRAM_BOT_TOKEN environment variable not set — see .env.example'
    };
  }

  if (!chatId) {
    return {
      success: false,
      errorCode: 'MISSING_CHAT_ID',
      errorMessage: 'TELEGRAM_CHAT_ID environment variable not set — see .env.example'
    };
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text: payload.text };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          providerMessageId: String(data.result?.message_id || '')
        };
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          errorCode: `HTTP_${response.status}`,
          errorMessage: errorData.description || response.statusText
        };
      }

      // Retryable: 429 or 5xx
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        errorCode: `HTTP_${response.status}`,
        errorMessage: errorData.description || `Telegram API returned ${response.status} after ${MAX_RETRIES + 1} attempts`
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
          errorMessage: `Request timed out after ${DEFAULT_TIMEOUT_MS}ms`
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
