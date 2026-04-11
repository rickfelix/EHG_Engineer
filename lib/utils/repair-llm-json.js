/**
 * Repair malformed LLM JSON output.
 *
 * Common LLM issues: markdown code fences, trailing commas,
 * missing closing braces. This utility attempts repair before failing.
 *
 * SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-B
 * @module lib/utils/repair-llm-json
 */

/**
 * Attempt to repair and parse malformed JSON from LLM output.
 *
 * @param {string} raw - Raw LLM text that should contain JSON
 * @returns {{ parsed: object|null, repaired: boolean, error: string|null }}
 */
export function repairLLMJson(raw) {
  if (!raw || typeof raw !== 'string') {
    return { parsed: null, repaired: false, error: 'Input is null or not a string' };
  }

  let text = raw.trim();

  // Step 1: Strip markdown code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  }

  // Step 2: Try parsing as-is first
  try {
    return { parsed: JSON.parse(text), repaired: false, error: null };
  } catch (_) {
    // Continue to repair
  }

  // Step 3: Remove trailing commas before } or ]
  let repaired = text.replace(/,\s*([\]}])/g, '$1');

  // Step 4: Try parsing after trailing comma fix
  try {
    return { parsed: JSON.parse(repaired), repaired: true, error: null };
  } catch (_) {
    // Continue to more aggressive repair
  }

  // Step 5: Try to balance braces/brackets
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;

  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }
  if (openBrackets > closeBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }

  // Step 6: Final parse attempt
  try {
    return { parsed: JSON.parse(repaired), repaired: true, error: null };
  } catch (err) {
    return { parsed: null, repaired: false, error: err.message };
  }
}
