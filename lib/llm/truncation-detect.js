/**
 * QF-20260802-207 — SHARED TRUNCATION PREDICATE.
 *
 * WHY THIS EXISTS AS ONE FUNCTION RATHER THAN TWO CHECKS. Venture 50763b6a (Image Alt Text
 * Generator, the ratified first-revenue venture) sat orchestrator_state=failed at stage 5 from
 * 2026-07-26 with three BYTE-IDENTICAL failures:
 *   Failed to parse LLM response as JSON [finishReason=STOP outputTokens=997 contentLength=3180]
 *
 * Two guards existed and BOTH were blind to it, because both keyed on finishReason==='MAX_TOKENS':
 *   - the fail-loud classifier (lib/eva/utils/parse-json.js) named the wrong cause, sending three
 *     investigations at the prompt instead of the ceiling;
 *   - the no-cache guard (lib/llm/client-factory.js) let the truncated body into the cache, so every
 *     "retry" replayed the same poisoned response and never re-asked the model. That is why the QF
 *     records retry-alone as proven useless.
 *
 * GEMINI-FAMILY ADAPTERS REPORT A HIT OUTPUT CEILING AS 'STOP', NOT 'MAX_TOKENS'. A truncation the
 * truncation-detector cannot see is worse than no detector, because its silence is read as health.
 *
 * Kept in lib/llm (not lib/eva) so the low-level client can import it without reaching upward into
 * the EVA layer. ONE definition, two consumers — two definitions of "truncated" is precisely how the
 * original purpose-threading fix ended up half-covering.
 */

/** finishReason values that a provider uses to mean "the model chose to stop". */
export const SUCCESS_FINISH = Object.freeze(
  new Set(['STOP', 'stop', 'end_turn', 'COMPLETE', 'complete', '']),
);

/** finishReason values that explicitly name a ceiling hit. */
export const EXPLICIT_TRUNCATION_FINISH = Object.freeze(
  new Set(['MAX_TOKENS', 'max_tokens', 'length']),
);

/**
 * Does this body LOOK like a JSON document that was cut off?
 *
 * DELIBERATELY CONSERVATIVE. Returns false for prose, so a normal text completion is never
 * mistaken for a truncation and denied the cache. It fires only when the content opens a JSON
 * structure and then fails to parse — a model that genuinely finished does not emit a half-open
 * object when the schema asked for JSON.
 */
export function looksLikeUnterminatedJson(content) {
  if (typeof content !== 'string') return false;
  const cleaned = content.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  if (!cleaned) return false;
  if (cleaned[0] !== '{' && cleaned[0] !== '[') return false;   // not a JSON document — leave it alone
  try {
    JSON.parse(cleaned);
    return false;                                               // parsed fine: not truncated
  } catch {
    return true;                                                // opens JSON, will not parse
  }
}

/**
 * THE PREDICATE. True when the response should be treated as truncated for BOTH fail-loud
 * classification and the cache ban.
 *
 * @param {{finishReason?: string, content?: string}} response adapter response object
 * @returns {boolean}
 */
export function isTruncatedResponse(response) {
  if (!response || typeof response !== 'object') return false;
  const finishReason = String(response.finishReason ?? '');

  // Explicit: the provider named the ceiling.
  if (EXPLICIT_TRUNCATION_FINISH.has(finishReason)) return true;

  // Implicit: the provider claimed success, but the body is an unterminated JSON document.
  // This is the QF-20260802-207 case — STOP + unparseable JSON.
  if (SUCCESS_FINISH.has(finishReason)) return looksLikeUnterminatedJson(response.content);

  // Anything else (SAFETY, RECITATION, content_filter, ...) is abnormal but not truncation-by-ceiling;
  // the parse-json classifier already names those separately and they must not be conflated here.
  return false;
}

export default { isTruncatedResponse, looksLikeUnterminatedJson, SUCCESS_FINISH, EXPLICIT_TRUNCATION_FINISH };
