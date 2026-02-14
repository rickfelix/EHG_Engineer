/**
 * Parse JSON from an LLM response, handling markdown fences.
 * @param {string} text
 * @returns {Object}
 */
export function parseJSON(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }
}
