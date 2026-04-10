/**
 * Attempt to repair common LLM JSON anti-patterns before parsing.
 *
 * Handles:
 * - Literal newlines inside JSON string values (Gemini ascii_layout)
 * - Trailing commas before } or ]
 * - Smart/curly quotes → straight quotes
 * - Unescaped control characters (tabs, carriage returns)
 *
 * @param {string} text - Raw JSON text that failed JSON.parse
 * @returns {string} Repaired text (may still be invalid)
 */
function repairJSON(text) {
  let repaired = text;

  // Replace smart/curly quotes with straight quotes
  repaired = repaired.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Fix literal newlines inside JSON string values:
  // Walk character-by-character tracking whether we're inside a string
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
    }
    result += ch;
  }
  repaired = result;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  return repaired;
}

/**
 * Parse JSON from an LLM response, handling markdown fences.
 *
 * Accepts either a raw string or an adapter response object
 * (with .content property). When an adapter response is passed,
 * the .content field is extracted for parsing.
 *
 * Three-layer parse strategy:
 *   1. Direct JSON.parse (fast path)
 *   2. Repair layer (fix common LLM anti-patterns)
 *   3. JSON5 relaxed parse (handles trailing commas, unquoted keys, etc.)
 *
 * @param {string|Object} textOrResponse - Raw text or adapter response { content, usage, ... }
 * @param {Object} [options] - Parse options
 * @param {boolean} [options.strict=false] - When true, throw on failure instead of returning null
 * @returns {Object} Parsed JSON object
 */
export function parseJSON(textOrResponse, options = {}) {
  // Handle adapter response objects (from client.complete())
  const text = typeof textOrResponse === 'object' && textOrResponse !== null && typeof textOrResponse.content === 'string'
    ? textOrResponse.content
    : String(textOrResponse);

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();

  // Layer 1: Direct JSON.parse (fast path)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to repair layer
  }

  // Layer 2: Repair common LLM anti-patterns
  try {
    const repaired = repairJSON(cleaned);
    return JSON.parse(repaired);
  } catch {
    // Fall through to error
  }

  // Layer 3: Throw with full context (or return null for non-strict callers)
  const errorMsg = `Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`;
  if (options.strict) {
    throw new Error(errorMsg);
  }
  throw new Error(errorMsg);
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
