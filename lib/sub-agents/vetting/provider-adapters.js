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
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
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
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
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
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userPrompt }] }],
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

    throw new Error(`Google call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
}

/**
 * Get provider adapter by family name
 * @param {string} family - Provider family (anthropic, openai, google)
 * @param {Object} options - Adapter options
 * @returns {AnthropicAdapter|OpenAIAdapter|GoogleAdapter}
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
    default:
      throw new Error(`Unknown provider family: ${family}`);
  }
}

/**
 * Get all three adapters for multi-model debate
 * @returns {{ anthropic: AnthropicAdapter, openai: OpenAIAdapter, google: GoogleAdapter }}
 */
export function getAllAdapters() {
  return {
    anthropic: new AnthropicAdapter(),
    openai: new OpenAIAdapter(),
    google: new GoogleAdapter()
  };
}

export default {
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  getProviderAdapter,
  getAllAdapters
};
