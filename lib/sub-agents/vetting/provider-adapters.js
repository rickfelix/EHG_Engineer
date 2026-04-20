/**
 * Provider Adapters for Multi-Model Debate System
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (TR-1)
 *
 * Implements a shared interface for Anthropic, OpenAI, and Google providers
 * with strict timeout/retry policy.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getOpenAIModel, getClaudeModel, getGoogleModel } from '../../config/model-config.js';

// Timeout and retry configuration
const PROVIDER_TIMEOUT_MS = 30000; // 30 seconds per call (default for short operations)
const PROVIDER_TIMEOUT_LONG_MS = 180000; // 3 minutes for content generation (PRD, long-form)
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
  if (value == null) return '';
  // Preserve arrays (content block arrays for multimodal prompts)
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'object' && item !== null) {
        return Object.fromEntries(
          Object.entries(item).map(([k, v]) => [k, typeof v === 'string' ? sanitizeUnicode(v) : v])
        );
      }
      return typeof item === 'string' ? sanitizeUnicode(item) : item;
    });
  }
  if (typeof value !== 'string') return typeof value === 'object' ? JSON.stringify(value) : String(value);

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
 * Add OpenAI-compatible `.chat.completions.create()` interface to any adapter.
 *
 * Many callers were written against the OpenAI SDK format but now receive
 * factory adapters that only expose `.complete()`. This shim bridges the gap
 * so both calling patterns work on any adapter.
 *
 * @param {Object} adapter - Adapter instance with `.complete()` method
 */
function addOpenAICompatLayer(adapter) {
  adapter.chat = {
    completions: {
      create: async (params = {}) => {
        const { messages = [], model, response_format, max_completion_tokens, max_tokens, temperature } = params;

        // Extract system and user prompts from messages array
        const systemMsg = messages.find(m => m.role === 'system');
        const userMsg = messages.find(m => m.role === 'user');
        const systemPrompt = systemMsg?.content || '';
        const userPrompt = userMsg?.content || '';

        const options = {};
        // Only pass model override if compatible with the adapter's provider.
        // Prevents Claude/OpenAI model names from being sent to Google Gemini API
        // which causes 404 errors (PAT-AUTO-c9b12816).
        if (model) {
          const isGoogleAdapter = adapter.provider === 'google';
          const isCrossProviderModel = /^claude-|^gpt-|^o1-|^o3-/.test(model);
          if (!(isGoogleAdapter && isCrossProviderModel)) {
            options.model = model;
          }
        }
        if (max_completion_tokens) options.maxTokens = max_completion_tokens;
        if (max_tokens) options.maxTokens = max_tokens;
        if (temperature !== undefined) options.temperature = temperature;
        if (response_format) options.response_format = response_format;

        const result = await adapter.complete(systemPrompt, userPrompt, options);

        // Return OpenAI-compatible response format
        return {
          choices: [{
            message: { content: result.content, role: 'assistant' },
            index: 0,
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: result.usage?.inputTokens || 0,
            completion_tokens: result.usage?.outputTokens || 0,
            total_tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          },
          model: result.model || adapter.defaultModel
        };
      }
    }
  };
}

/**
 * Anthropic Provider Adapter
 */
export class AnthropicAdapter {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey
    });
    this.defaultModel = options.model || getClaudeModel('validation');
    this.model = this.defaultModel;
    this.provider = 'anthropic';
    this.family = 'anthropic';
    addOpenAICompatLayer(this);
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Build request params
        const requestParams = {
          model,
          max_tokens: options.maxTokens || options.max_tokens || 8192,
          system: sanitizeUnicode(systemPrompt),
          // Preserve array content blocks for multimodal (images + text)
          messages: [{ role: 'user', content: Array.isArray(userPrompt) ? sanitizeUnicode(userPrompt) : sanitizeUnicode(userPrompt) }]
        };

        // Add thinking support when budget_tokens specified
        if (options.thinkingBudget && options.thinkingBudget > 0) {
          requestParams.thinking = {
            type: 'enabled',
            budget_tokens: options.thinkingBudget
          };
          // Ensure max_tokens > budget_tokens (API requirement)
          if (requestParams.max_tokens <= options.thinkingBudget) {
            requestParams.max_tokens = options.thinkingBudget + 2000;
          }
          // Temperature must be omitted when thinking is enabled (API requirement)
          delete requestParams.temperature;
        } else if (options.temperature !== undefined) {
          requestParams.temperature = options.temperature;
        }

        let response;

        if (options.stream) {
          // Use streaming for long-running operations (required by Anthropic SDK
          // for operations that may take >10 minutes)
          // SD-LEO-FIX-REPLACE-EXTERNAL-API-001
          response = await this._completeWithStreaming(requestParams, options);
        } else {
          response = await Promise.race([
            this.client.messages.create(requestParams),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), options.timeout || PROVIDER_TIMEOUT_MS)
            )
          ]);
        }

        const durationMs = Date.now() - startTime;

        // Extract text content (skip thinking blocks)
        const textBlock = response.content.find(b => b.type === 'text');
        const thinkingBlock = response.content.find(b => b.type === 'thinking');

        return {
          content: textBlock?.text || response.content[0].text,
          thinking: thinkingBlock?.thinking || null,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          usage: {
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
            thinkingTokens: thinkingBlock ? (response.usage?.output_tokens || 0) : 0
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

  /**
   * Complete a request using streaming mode.
   * Required by Anthropic SDK for operations that may take >10 minutes.
   * Collects streamed chunks and assembles them into a standard response object.
   * SD-LEO-FIX-REPLACE-EXTERNAL-API-001
   *
   * @param {Object} requestParams - Anthropic API request parameters
   * @param {Object} options - Options including timeout
   * @returns {Promise<Object>} Response object matching non-streaming format
   */
  async _completeWithStreaming(requestParams, options = {}) {
    const timeout = options.timeout || PROVIDER_TIMEOUT_MS;
    const stream = this.client.messages.stream(requestParams);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        stream.abort();
        reject(new Error('TIMEOUT'));
      }, timeout);
    });

    try {
      const finalMessage = await Promise.race([stream.finalMessage(), timeoutPromise]);
      clearTimeout(timeoutId);
      return finalMessage;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

/**
 * OpenAI Provider Adapter
 */
export class OpenAIAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.defaultModel = options.model || getOpenAIModel('validation');
    this.model = this.defaultModel;
    this.provider = 'openai';
    this.family = 'openai';
    addOpenAICompatLayer(this);
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || PROVIDER_TIMEOUT_MS);

        const maxTokens = options.maxTokens || options.max_tokens || 8192;
        const requestBody = {
            model,
            max_completion_tokens: maxTokens,
            messages: [
              { role: 'system', content: sanitizeUnicode(systemPrompt) },
              { role: 'user', content: sanitizeUnicode(userPrompt) }
            ]
          };
        if (options.response_format) {
          requestBody.response_format = options.response_format;
        }
        if (options.temperature !== undefined) {
          requestBody.temperature = options.temperature;
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(requestBody),
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
          // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-034 / PAT-AUTO-4f8ac75c:
          // Use longer delay on TIMEOUT to let the API recover (not just rate-limit backoff)
          const delay = lastError.message === 'TIMEOUT'
            ? RETRY_DELAY_MS * 5 * (attempt + 1)  // 5s, 10s on TIMEOUT
            : RETRY_DELAY_MS * (attempt + 1);      // 1s, 2s on other errors
          console.warn(`[OpenAIAdapter] Attempt ${attempt + 1} failed, retrying...`, lastError.message);
          await sleep(delay);
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
/**
 * Gemini thinking level mapping.
 * Maps effort levels to thinkingConfig.thinkingLevel for each model family.
 *
 * Gemini 3.1 Pro supports: low, high (no medium — maps to low)
 * Gemini 3 Flash supports: low, medium, high
 */
const GEMINI_THINKING_LEVELS = {
  pro: { low: 'low', medium: 'low', high: 'high' },
  flash: { low: 'low', medium: 'medium', high: 'high' },
};

export class GoogleAdapter {
  static FALLBACK_MODELS = [getGoogleModel('validation'), getGoogleModel('fast')];

  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = options.model || 'gemini-2.5-pro';
    this.model = this.defaultModel;
    this.provider = 'google';
    this.family = 'google';
    this.fallbackEnabled = options.fallbackEnabled !== false;
    addOpenAICompatLayer(this);
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || PROVIDER_TIMEOUT_MS);

        // Build generationConfig
        const generationConfig = {
          maxOutputTokens: options.maxTokens || options.max_tokens || (options.purpose === 'content-generation' ? 16384 : 8192)
        };

        // Temperature support
        if (options.temperature !== undefined) {
          generationConfig.temperature = options.temperature;
        }

        // JSON mode: translate response_format to responseMimeType
        if (options.response_format?.type === 'json_object') {
          generationConfig.responseMimeType = 'application/json';
        }

        // Thinking level support — skip for pure content generation to maximize output tokens
        if (options.thinking === false || options.purpose === 'content-generation') {
          // No thinking config — all output tokens go to content
        } else {
        const effortLevel = options.effortLevel || this.effortLevel;
        const isGemini3x = /^gemini-3/.test(model);
        const isGemini2_5 = /^gemini-2\.5/.test(model);
        if (effortLevel && isGemini3x) {
          const family = model.includes('flash') ? 'flash' : 'pro';
          const levelMap = GEMINI_THINKING_LEVELS[family] || GEMINI_THINKING_LEVELS.pro;
          generationConfig.thinkingConfig = {
            thinkingLevel: levelMap[effortLevel] || 'low'
          };
        } else if (isGemini2_5) {
          // Gemini 2.5: thinking tokens share maxOutputTokens budget.
          // Without a cap, thinking consumes the entire budget leaving 0 for output.
          // Pro minimum is 128. Flash can be 0 (disabled).
          const isFlash = model.includes('flash');
          const budgetMap = { low: isFlash ? 512 : 512, medium: 2048, high: 8192 };
          const budget = effortLevel ? (budgetMap[effortLevel] || 1024) : 1024;
          // SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001: Ensure thinking budget
          // never exceeds 50% of maxOutputTokens so actual content can be generated.
          const maxOutput = generationConfig.maxOutputTokens || 8192;
          const cappedBudget = Math.min(budget, Math.floor(maxOutput * 0.5));
          generationConfig.thinkingConfig = { thinkingBudget: cappedBudget };
        }
        } // end thinking config else block

        // Use streaming endpoint for long-form generation to avoid connection drops
        const endpoint = options.stream
          ? `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`
          : `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

        // Build user content — convert OpenAI multimodal format to Gemini format
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-125: Convert image_url parts to inlineData
        // (OpenAI uses {type: "image_url", image_url: {url: "data:..."}},
        //  Gemini uses {inlineData: {mimeType: "...", data: "..."}})
        const userParts = Array.isArray(userPrompt)
          ? userPrompt.map(p => {
              if (p.type === 'text') return { text: sanitizeUnicode(p.text) };
              if (p.type === 'image_url' && p.image_url?.url) {
                const match = p.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  return { inlineData: { mimeType: match[1], data: match[2] } };
                }
              }
              return p;
            })
          : [{ text: sanitizeUnicode(userPrompt || 'Hello') }];

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(systemPrompt ? { systemInstruction: { parts: [{ text: sanitizeUnicode(systemPrompt) }] } } : {}),
            contents: [{ role: 'user', parts: userParts }],
            generationConfig
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Google API error ${response.status}: ${errorBody}`);
        }

        let data;
        if (options.stream) {
          // Parse SSE stream — accumulate text chunks
          const text = await response.text();
          const chunks = text.split('\n').filter(l => l.startsWith('data: ')).map(l => {
            try { return JSON.parse(l.slice(6)); } catch { return null; }
          }).filter(Boolean);
          // Merge chunks into single response
          const allText = chunks.map(c => c.candidates?.[0]?.content?.parts?.[0]?.text ?? '').join('');
          const lastChunk = chunks[chunks.length - 1] ?? {};
          data = {
            candidates: [{ content: { parts: [{ text: allText }] }, finishReason: lastChunk.candidates?.[0]?.finishReason }],
            usageMetadata: lastChunk.usageMetadata
          };
        } else {
          data = await response.json();
        }
        const durationMs = Date.now() - startTime;

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const finishReason = data.candidates?.[0]?.finishReason;

        // CronPulse RCA #1: Detect MAX_TOKENS truncation and warn caller
        if (finishReason === 'MAX_TOKENS') {
          console.warn(`[${this.provider}] Response truncated (finishReason=MAX_TOKENS, model=${model}). Consider increasing maxOutputTokens.`);
        }

        return {
          content,
          provider: this.provider,
          family: this.family,
          model,
          durationMs,
          finishReason,
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
          const is503 = lastError?.message?.includes('503');
          const baseDelay = is503 ? 3000 : RETRY_DELAY_MS;
          await sleep(baseDelay * (attempt + 1));
        }
      }
    }

    // Fallback: if rate-limited (429) or service unavailable (503), try fallback models before giving up
    const isRetryableError = lastError?.message?.includes('429') || lastError?.message?.includes('503') || lastError?.message?.includes('fetch failed');
    if (this.fallbackEnabled && !options._fallbackAttempt && isRetryableError) {
      const triedModel = model;
      const fallbacks = GoogleAdapter.FALLBACK_MODELS.filter(m => m !== triedModel);
      for (const fallbackModel of fallbacks) {
        try {
          const reason = lastError?.message?.includes('503') ? 'Service unavailable (503)' : 'Rate-limited (429)';
          console.warn(`[GoogleAdapter] ${reason} on ${triedModel}, falling back to ${fallbackModel}`);
          return await this.complete(systemPrompt, userPrompt, {
            ...options,
            model: fallbackModel,
            _fallbackAttempt: true
          });
        } catch (fallbackError) {
          console.warn(`[GoogleAdapter] Fallback ${fallbackModel} also failed: ${fallbackError.message?.slice(0, 100)}`);
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
    this.model = this.defaultModel;
    this.provider = 'ollama';
    this.family = 'local';
    this.fallbackEnabled = options.fallbackEnabled ??
      (process.env.OLLAMA_FALLBACK_ENABLED !== 'false');
    this.fallbackModel = options.fallbackModel || getClaudeModel('fast');
    this.timeoutMs = options.timeoutMs ||
      parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 30000;
    addOpenAICompatLayer(this);
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
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeoutMs);

        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ollama' // Required but ignored by Ollama
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || options.max_tokens || 8192,
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
 * @param {string} options.cloudModel - Cloud fallback model (default: claude haiku fast tier)
 * @returns {OllamaAdapter}
 */
export function getLocalFirstAdapter(options = {}) {
  return new OllamaAdapter({
    model: options.localModel || 'qwen3-coder:30b',
    fallbackModel: options.cloudModel || getClaudeModel('fast'),
    fallbackEnabled: true,
    ...options
  });
}

export { PROVIDER_TIMEOUT_LONG_MS };

export default {
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  OllamaAdapter,
  getProviderAdapter,
  getAllAdapters,
  getLocalFirstAdapter,
  PROVIDER_TIMEOUT_LONG_MS
};
