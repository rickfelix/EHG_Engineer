/**
 * Anthropic SDK client factory.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Single source of the SDK + model configuration so sub-flow modules
 * never import the SDK directly.
 */

import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-4-8';

export function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required. Get a key at https://console.anthropic.com/');
  }
  return new Anthropic({ apiKey });
}

/**
 * Single-shot completion helper. Returns reply text + token counts.
 * @param {object} params
 * @param {object} params.client - Anthropic SDK client
 * @param {string} params.systemPrompt
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.model]
 * @param {number} [params.maxTokens]
 * @returns {Promise<{reply: string, tokens_in: number, tokens_out: number, model: string}>}
 */
export async function complete({ client, systemPrompt, messages, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  const reply = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return {
    reply,
    tokens_in: response.usage?.input_tokens ?? 0,
    tokens_out: response.usage?.output_tokens ?? 0,
    model: response.model || model,
  };
}

export default { createAnthropicClient, complete, DEFAULT_MODEL };
