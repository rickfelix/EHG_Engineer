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
      if (!inString) { inString = true; result += ch; continue; }
      // SD-LEO-INFRA-S15-WIREFRAME-LLM-UNPARSEABLE-001 FR-2.2: distinguish a real closing quote from a
      // stray UNESCAPED inner double-quote (the likely S15 wireframe cause). A real closing quote is
      // followed (after optional whitespace) by a JSON structural delimiter (, } ] :) or end-of-input;
      // anything else means we're still inside the string value, so escape the quote instead of
      // mis-closing the string (which cascades into a parse failure for the whole document).
      let j = i + 1;
      while (j < repaired.length && (repaired[j] === ' ' || repaired[j] === '\t' || repaired[j] === '\n' || repaired[j] === '\r')) j++;
      const next = j < repaired.length ? repaired[j] : '';
      if (next === '' || next === ',' || next === '}' || next === ']' || next === ':') {
        inString = false; result += ch; continue; // real closing quote
      }
      result += '\\"'; continue; // stray inner quote → escape it
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
 * Parse strategy (SD-LEO-INFRA-LLM-PURPOSE-THREADING-TRUNCATION-001 FR-3 — docstring de-drifted; the
 * former Layer-3 claim of a relaxed/lenient third parser never existed in the code — Layer 3 throws):
 *   1. Direct JSON.parse (fast path)
 *   2. Repair layer (fix common LLM anti-patterns), then JSON.parse the repaired text
 *   3. On failure, throw with full context — and when the response was TRUNCATED at the token ceiling
 *      (finishReason==='MAX_TOKENS'), surface an actionable truncation message instead of the
 *      misleading "Failed to parse ... as JSON" (truncation is a token-ceiling problem, NOT a
 *      JSON-robustness one — that misdirection sent the original venture-1 diagnosis down the wrong path).
 *
 * @param {string|Object} textOrResponse - Raw text or adapter response { content, usage, finishReason, ... }
 * @param {Object} [options] - Parse options
 * @param {boolean} [options.strict=false] - When true, throw on failure instead of returning null
 * @returns {Object} Parsed JSON object
 */
export function parseJSON(textOrResponse, options = {}) {
  // Handle adapter response objects (from client.complete())
  const isResponseObj = typeof textOrResponse === 'object' && textOrResponse !== null && typeof textOrResponse.content === 'string';
  const text = isResponseObj ? textOrResponse.content : String(textOrResponse);
  // FR-3: read the truncation signal from the adapter response (when one was passed).
  const truncated = isResponseObj && textOrResponse.finishReason === 'MAX_TOKENS';
  // SD-LEO-INFRA-S15-WIREFRAME-LLM-UNPARSEABLE-001 FR-2.3: any non-STOP finishReason (SAFETY,
  // RECITATION, OTHER, length, content_filter, ...) is an abnormal-termination signal — classify it as
  // a truncation-class cause so the failure message names the real reason instead of the generic
  // "Failed to parse" misdirection. Success values (STOP/stop/end_turn/COMPLETE/empty) are NOT abnormal.
  const finishReason = isResponseObj ? textOrResponse.finishReason : undefined;
  const SUCCESS_FINISH = new Set(['STOP', 'stop', 'end_turn', 'COMPLETE', 'complete', '']);
  const abnormalFinish = finishReason != null && finishReason !== '' && !SUCCESS_FINISH.has(finishReason);

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

  // Layer 3: Throw with full context. FR-3 fail-loud: name the real cause when truncated.
  // SD-LEO-INFRA-S15-WIREFRAME-LLM-UNPARSEABLE-001 FR-1: attach full diagnostics (finishReason,
  // outputTokens, content length, and body HEAD+TAIL — not just the first 200 chars) so the exact
  // sub-cause is visible on the next run instead of being guessed. HEAD+TAIL matters because a
  // truncation shows in the tail and an unescaped-quote/structural break often shows mid/late.
  const len = cleaned.length;
  const head = cleaned.substring(0, 300);
  const tail = len > 600 ? cleaned.substring(len - 300) : '';
  const usage = extractUsage(textOrResponse);
  const diag = `[finishReason=${finishReason ?? 'n/a'} outputTokens=${usage?.outputTokens ?? 'n/a'} contentLength=${len}]`;
  let errorMsg;
  if (truncated) {
    errorMsg = `LLM response truncated at token ceiling (finishReason=MAX_TOKENS) — increase maxOutputTokens / thread the call purpose (e.g. purpose:'content-generation' → 16384). ${diag} HEAD: ${head}${tail ? `\nTAIL: ${tail}` : ''}`;
  } else if (abnormalFinish) {
    errorMsg = `LLM response abnormally terminated (finishReason=${finishReason}, non-STOP) — treat as a truncation-class failure, not a JSON-robustness one. ${diag} HEAD: ${head}${tail ? `\nTAIL: ${tail}` : ''}`;
  } else {
    errorMsg = `Failed to parse LLM response as JSON ${diag} HEAD: ${head}${tail ? `\nTAIL: ${tail}` : ''}`;
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
