/**
 * Dedupe an array whose entries may be plain strings OR objects (e.g.
 * retrospectives.key_learnings/action_items, whose documented schema allows
 * object entries), capped at `max`. A bare `new Set()` never collapses object
 * entries by value (reference equality only) -- this stringifies non-string
 * entries for the dedup key while preserving the original value in the output.
 *
 * @param {Array<string|object>} arr
 * @param {number} max
 * @returns {Array<string|object>}
 */
export function dedupeMixed(arr, max) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
