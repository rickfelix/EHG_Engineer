/**
 * Provider Adapters for Multi-Model Debate System
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (TR-1)
 *
 * Implements a shared interface for Anthropic, OpenAI, and Google providers
 * with strict timeout/retry policy.
 */

import Anthropic from '@anthropic-ai/sdk';

// Timeout and retry configuration
const PROVIDER_TIMEOUT_MS = 15000; // 15 seconds per call
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * Base adapter interface
 * @typedef {Object} ProviderResponse
 * @property {string} content - The response content
 * @property {string} provider - Provider name (anthropic, openai, google)
 * @property {string} model - Model identifier
 * @property {number} durationMs - Time taken for the call
 * @property {Object} usage - Token usage info
 */

/**
 * Sleep helper for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize string by removing invalid Unicode surrogates.
 * Prevents JSON serialization errors when sending to LLM APIs.
 *
 * Node.js JSON.stringify encodes lone surrogates as \uDXXX which is
 * invalid JSON per RFC 8259. API servers (Anthropic, OpenAI) reject these.
 *
 * @param {string} value - String to sanitize
 * @returns {string} Sanitized string with invalid surrogates replaced by U+FFFD
 */
function sanitizeUnicode(value) {
  if (typeof value !== 'string') return value;

  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code >= 0xD800 && code <= 0xDBFF) {
      const nextCode = value.charCodeAt(i + 1);
      if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        result += value[i] + value[i + 1];
        i++;
      } else {
        result += '\uFFFD';
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      result += '\uFFFD';
    } else {
      result += value[i];
    }
  }
  return result;
}

/**
 * Anthropic Provider Adapter
 */
export class AnthropicAdapter {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.defaultModel = options.model || 'claude-sonnet-4-20250514';
    this.provider = 'anthropic';
    this.family = 'anthropic';
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await Promise.race([
          this.client.messages.create({
            model,
            max_tokens: options.maxTokens || 2000,
            system: sanitizeUnicode(systemPrompt),
            messages: [{ role: 'user', content: sanitizeUnicode(userPrompt) }]
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), PROVIDER_TIMEOUT_MS)
          )
        ]);

        const durationMs = Date.now() - startTime;

        return {
          content: response.content[0].text,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          usage: {
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens
          },
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          console.warn(`[AnthropicAdapter] Attempt ${attempt + 1} failed, retrying...`, error.message);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    triggerAPIFailureRCA('anthropic', model, lastError?.message);
    throw new Error(`Anthropic call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
}

/**
 * OpenAI Provider Adapter
 */
export class OpenAIAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.defaultModel = options.model || 'gpt-4o';
    this.provider = 'openai';
    this.family = 'openai';
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || 2000,
            messages: [
              { role: 'system', content: sanitizeUnicode(systemPrompt) },
              { role: 'user', content: sanitizeUnicode(userPrompt) }
            ]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const durationMs = Date.now() - startTime;

        return {
          content: data.choices[0].message.content,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          usage: {
            inputTokens: data.usage?.prompt_tokens,
            outputTokens: data.usage?.completion_tokens
          },
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error('TIMEOUT');
        }
        if (attempt < MAX_RETRIES) {
          console.warn(`[OpenAIAdapter] Attempt ${attempt + 1} failed, retrying...`, lastError.message);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    triggerAPIFailureRCA('openai', model, lastError?.message);
    throw new Error(`OpenAI call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
}

/**
 * Google (Gemini) Provider Adapter
 */
export class GoogleAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = options.model || 'gemini-1.5-pro';
    this.provider = 'google';
    this.family = 'google';
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

        const response = await fetch(
          `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sanitizeUnicode(systemPrompt) }] },
              contents: [{ parts: [{ text: sanitizeUnicode(userPrompt) }] }],
              generationConfig: {
                maxOutputTokens: options.maxTokens || 2000
              }
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Google API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const durationMs = Date.now() - startTime;

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return {
          content,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          usage: {
            inputTokens: data.usageMetadata?.promptTokenCount,
            outputTokens: data.usageMetadata?.candidatesTokenCount
          },
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error('TIMEOUT');
        }
        if (attempt < MAX_RETRIES) {
          console.warn(`[GoogleAdapter] Attempt ${attempt + 1} failed, retrying...`, lastError.message);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    triggerAPIFailureRCA('google', model, lastError?.message);
    throw new Error(`Google call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
}

/**
 * Ollama Local LLM Provider Adapter
 *
 * Provides local inference via Ollama with automatic fallback to cloud Haiku.
 * Uses OpenAI-compatible API format.
 *
 * Configuration via environment variables:
 *   OLLAMA_BASE_URL - Ollama server URL (default: http://localhost:11434)
 *   OLLAMA_MODEL - Default model (default: qwen3-coder:30b)
 *   OLLAMA_FALLBACK_ENABLED - Enable fallback to Haiku (default: true)
 *   OLLAMA_TIMEOUT_MS - Request timeout (default: 30000)
 *
 * @created 2026-02-05
 * @see scripts/benchmarks/ollama-model-benchmark.mjs for model selection rationale
 */
export class OllamaAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = options.model || process.env.OLLAMA_MODEL || 'qwen3-coder:30b';
    this.provider = 'ollama';
    this.family = 'local';
    this.fallbackEnabled = options.fallbackEnabled ??
      (process.env.OLLAMA_FALLBACK_ENABLED !== 'false');
    this.fallbackModel = options.fallbackModel || 'claude-haiku-3-5-20241022';
    this.timeoutMs = options.timeoutMs ||
      parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 30000;
  }

  /**
   * Check if Ollama server is available
   */
  async isAvailable() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ollama' // Required but ignored by Ollama
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || 2000,
            temperature: options.temperature ?? 0.1,
            messages: [
              { role: 'system', content: sanitizeUnicode(systemPrompt) },
              { role: 'user', content: sanitizeUnicode(userPrompt) }
            ]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Ollama API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const durationMs = Date.now() - startTime;

        return {
          content: data.choices[0].message.content,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          usage: {
            inputTokens: data.usage?.prompt_tokens,
            outputTokens: data.usage?.completion_tokens
          },
          attempt: attempt + 1,
          local: true
        };
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error('TIMEOUT');
        }
        if (attempt < MAX_RETRIES) {
          console.warn(`[OllamaAdapter] Attempt ${attempt + 1} failed, retrying...`, lastError.message);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    // Fallback to cloud Haiku if enabled
    if (this.fallbackEnabled) {
      console.warn('[OllamaAdapter] Local inference failed. Falling back to cloud Haiku.');
      const fallbackAdapter = new AnthropicAdapter({ model: this.fallbackModel });
      const result = await fallbackAdapter.complete(systemPrompt, userPrompt, options);
      return {
        ...result,
        fallback: true,
        originalError: lastError?.message
      };
    }

    triggerAPIFailureRCA('ollama', model, lastError?.message);
    throw new Error(`Ollama call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
}

/**
 * Fire-and-forget RCA trigger on API failure (SD-LEO-ENH-ENHANCE-RCA-SUB-001)
 * Never throws - safe to call in catch blocks
 */
async function triggerAPIFailureRCA(provider, model, errorMessage) {
  try {
    const { triggerRCAOnFailure, buildApiContext } = await import('../../rca/index.js');
    await triggerRCAOnFailure(buildApiContext({
      provider,
      model,
      errorMessage,
      errorCode: errorMessage?.includes('TIMEOUT') ? 'TIMEOUT' : undefined,
      httpStatus: parseInt(errorMessage?.match(/error (\d+)/)?.[1]) || undefined
    }));
  } catch {
    // RCA trigger should never crash the caller
  }
}

/**
 * Get provider adapter by family name
 * @param {string} family - Provider family (anthropic, openai, google, ollama)
 * @param {Object} options - Adapter options
 * @returns {AnthropicAdapter|OpenAIAdapter|GoogleAdapter|OllamaAdapter}
 */
export function getProviderAdapter(family, options = {}) {
  switch (family.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return new AnthropicAdapter(options);
    case 'openai':
    case 'gpt':
      return new OpenAIAdapter(options);
    case 'google':
    case 'gemini':
      return new GoogleAdapter(options);
    case 'ollama':
    case 'local':
      return new OllamaAdapter(options);
    default:
      throw new Error(`Unknown provider family: ${family}`);
  }
}

/**
 * Get all adapters for multi-model debate
 * @param {Object} options - Options to pass to adapters
 * @param {boolean} options.includeLocal - Include Ollama adapter (default: false for debate)
 * @returns {{ anthropic: AnthropicAdapter, openai: OpenAIAdapter, google: GoogleAdapter, ollama?: OllamaAdapter }}
 */
export function getAllAdapters(options = {}) {
  const adapters = {
    anthropic: new AnthropicAdapter(),
    openai: new OpenAIAdapter(),
    google: new GoogleAdapter()
  };

  if (options.includeLocal) {
    adapters.ollama = new OllamaAdapter();
  }

  return adapters;
}

/**
 * Get a "smart" adapter that tries local first, then falls back to cloud.
 * Useful for cost-sensitive operations that can tolerate local inference.
 *
 * @param {Object} options - Adapter options
 * @param {string} options.localModel - Local model to use (default: qwen3-coder:30b)
 * @param {string} options.cloudModel - Cloud fallback model (default: claude-haiku-3-5-20241022)
 * @returns {OllamaAdapter}
 */
export function getLocalFirstAdapter(options = {}) {
  return new OllamaAdapter({
    model: options.localModel || 'qwen3-coder:30b',
    fallbackModel: options.cloudModel || 'claude-haiku-3-5-20241022',
    fallbackEnabled: true,
    ...options
  });
}

export default {
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  OllamaAdapter,
  getProviderAdapter,
  getAllAdapters,
  getLocalFirstAdapter
};
