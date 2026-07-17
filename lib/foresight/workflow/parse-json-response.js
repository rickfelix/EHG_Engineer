/**
 * Shared helper: tolerantly extract a JSON object from an LLM completion.
 * Models routinely wrap JSON in ```json fences or add leading/trailing prose;
 * this strips fences and takes the first balanced {...} block before parsing,
 * rather than requiring `content` to be pure JSON.
 *
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function parseJsonResponse(rawText) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    return { ok: false, reason: 'empty_response' };
  }
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : rawText;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, reason: 'no_json_object_found' };
  }
  try {
    const value = JSON.parse(candidate.slice(start, end + 1));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'parsed_value_not_an_object' };
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, reason: `json_parse_error: ${e.message}` };
  }
}

/** True iff every key in `requiredKeys` is present (not undefined) on `obj`. */
export function hasRequiredKeys(obj, requiredKeys) {
  return requiredKeys.every((k) => obj[k] !== undefined);
}
