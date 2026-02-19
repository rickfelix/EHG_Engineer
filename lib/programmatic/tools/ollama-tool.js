/**
 * Ollama Local LLM Tool for Programmatic Tool Calling
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Wraps OllamaAdapter.complete() as an Anthropic tool definition.
 * Used by vision-scorer.js to call qwen3-coder:30b for scoring.
 *
 * @module lib/programmatic/tools/ollama-tool
 */

import { OllamaAdapter } from '../../sub-agents/vetting/provider-adapters.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3-coder:30b';

/**
 * Create a local LLM call tool backed by Ollama.
 *
 * @param {Object} [options]
 * @param {string} [options.baseUrl] - Ollama base URL (default: http://localhost:11434)
 * @param {string} [options.model] - Model name (default: qwen3-coder:30b)
 * @returns {{ definition: Object, handler: Function }}
 */
export function createOllamaTool(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;

  const adapter = new OllamaAdapter({ model, baseUrl });

  const definition = {
    name: 'call_local_llm',
    description:
      'Call the local Ollama LLM (qwen3-coder:30b) to generate a response. ' +
      'Use for scoring, classification, or content generation that should not ' +
      'go to a cloud API. Returns the model response as a string.',
    input_schema: {
      type: 'object',
      properties: {
        system_prompt: {
          type: 'string',
          description: 'System prompt / instructions for the model',
        },
        user_prompt: {
          type: 'string',
          description: 'User message / content to process',
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens in response (default: 2000)',
        },
      },
      required: ['system_prompt', 'user_prompt'],
    },
  };

  async function handler(input, { dryRun } = {}) {
    const { system_prompt, user_prompt, max_tokens = 2000 } = input;

    if (dryRun) {
      return JSON.stringify({
        dry_run: true,
        model,
        message: 'Dry run — no Ollama call made',
        mock_response: '{"total_score": 82, "action": "proceed", "dimension_scores": {}}',
      });
    }

    try {
      const result = await adapter.complete(system_prompt, user_prompt, { maxTokens: max_tokens });
      return result.content ?? result;
    } catch (err) {
      return JSON.stringify({ error: `Ollama call failed: ${err.message}`, model });
    }
  }

  return { definition, handler };
}
