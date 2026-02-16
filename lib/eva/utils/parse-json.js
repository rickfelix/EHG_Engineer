/**
 * Parse JSON from an LLM response, handling markdown fences.
 *
 * Accepts either a raw string or an adapter response object
 * (with .content property). When an adapter response is passed,
 * the .content field is extracted for parsing.
 *
 * @param {string|Object} textOrResponse - Raw text or adapter response { content, usage, ... }
 * @returns {Object} Parsed JSON object
 */
export function parseJSON(textOrResponse) {
  // Handle adapter response objects (from client.complete())
  const text = typeof textOrResponse === 'object' && textOrResponse !== null && typeof textOrResponse.content === 'string'
    ? textOrResponse.content
    : String(textOrResponse);

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }
}

/**
 * Extract token usage from an LLM adapter response.
 *
 * Handles both adapter format ({ usage: { inputTokens, outputTokens } })
 * and raw Anthropic SDK format ({ usage: { input_tokens, output_tokens } }).
 *
 * @param {Object} response - LLM response (adapter or raw SDK)
 * @returns {{ inputTokens: number, outputTokens: number }|null}
 */
export function extractUsage(response) {
  if (!response || typeof response !== 'object') return null;

  const usage = response.usage;
  if (!usage) return null;

  // Adapter format (from client.complete())
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    return {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
    };
  }

  // Raw Anthropic SDK format (from client.messages.create())
  if (usage.input_tokens !== undefined || usage.output_tokens !== undefined) {
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    };
  }

  return null;
}
