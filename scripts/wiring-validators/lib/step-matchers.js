/**
 * Step output matchers for e2e-demo-recorder.
 *
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (FR-2)
 *
 * Three matchers chosen by heuristic on each step's expected_outcome:
 *   - SUBSTRING (default): plain text expected to appear in actual stdout
 *   - REGEX: when expected_outcome is wrapped in /.../  delimiters
 *   - STRUCTURAL: when expected_outcome parses as JSON — shape match
 *     (extra fields in actual ignored, missing fields fail, key order ignored)
 *
 * Pure module: no I/O, no async, no external deps. Fully unit-testable.
 *
 * Each matcher returns { matched: boolean, method: string, delta?: string,
 * warnings?: string[] }. Matchers NEVER throw — invalid regex falls back to
 * SUBSTRING with a warning rather than propagating the SyntaxError.
 */

const TRUNCATE_DELTA_AT = 500;

/**
 * Heuristic matcher selection.
 * Examines expected_outcome shape and returns the matcher to use.
 *
 * @param {string} expected_outcome
 * @returns {'SUBSTRING' | 'REGEX' | 'STRUCTURAL'}
 */
export function chooseMatcher(expected_outcome) {
  if (typeof expected_outcome !== 'string') return 'SUBSTRING';
  const trimmed = expected_outcome.trim();
  // REGEX: wrapped in /.../  with at least one char between
  if (trimmed.length >= 3 && trimmed.startsWith('/') && trimmed.endsWith('/')) {
    return 'REGEX';
  }
  // STRUCTURAL: parses as a JSON object or array
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'STRUCTURAL';
    } catch {
      // Looked like JSON but isn't — fall through to substring
    }
  }
  return 'SUBSTRING';
}

/**
 * Substring matcher — expected_outcome must appear somewhere in actual.
 */
export function matchSubstring(expected_outcome, actual_stdout) {
  const matched = typeof actual_stdout === 'string' &&
                  actual_stdout.includes(expected_outcome);
  if (matched) return { matched: true, method: 'SUBSTRING' };
  return {
    matched: false,
    method: 'SUBSTRING',
    delta: truncate(`Expected substring not found.\nExpected: ${expected_outcome}\nActual stdout: ${actual_stdout || '(empty)'}`)
  };
}

/**
 * Regex matcher — expected_outcome wrapped in /.../  is compiled and tested.
 * Invalid regex falls back to SUBSTRING with a warning.
 */
export function matchRegex(expected_outcome, actual_stdout) {
  // Strip leading/trailing slashes and any optional flags after final slash
  const trimmed = expected_outcome.trim();
  const inner = trimmed.slice(1, -1);
  let regex;
  try {
    regex = new RegExp(inner);
  } catch (err) {
    // Invalid regex — fall back to substring of the inner pattern
    const fallback = matchSubstring(inner, actual_stdout);
    return {
      ...fallback,
      method: 'SUBSTRING',
      warnings: [`Invalid regex /${inner}/ (${err.message}); fell back to SUBSTRING`]
    };
  }
  const matched = typeof actual_stdout === 'string' && regex.test(actual_stdout);
  if (matched) return { matched: true, method: 'REGEX' };
  return {
    matched: false,
    method: 'REGEX',
    delta: truncate(`Regex did not match.\nPattern: ${expected_outcome}\nActual stdout: ${actual_stdout || '(empty)'}`)
  };
}

/**
 * Structural matcher — expected_outcome (JSON) describes the SHAPE that actual
 * output (also JSON) must satisfy. Extra fields in actual are tolerated; missing
 * fields fail; primitive values must match exactly; arrays must have all expected
 * elements (in the same positions).
 */
export function matchStructural(expected_outcome, actual_stdout) {
  let expected, actual;
  try {
    expected = JSON.parse(expected_outcome.trim());
  } catch (err) {
    return {
      matched: false,
      method: 'STRUCTURAL',
      delta: truncate(`Expected_outcome not valid JSON: ${err.message}`)
    };
  }
  // Try to parse actual_stdout — strip surrounding noise to find a JSON region
  const jsonRegion = extractJsonRegion(actual_stdout);
  if (!jsonRegion) {
    return {
      matched: false,
      method: 'STRUCTURAL',
      delta: truncate(`No JSON region found in actual stdout: ${actual_stdout || '(empty)'}`)
    };
  }
  try {
    actual = JSON.parse(jsonRegion);
  } catch (err) {
    return {
      matched: false,
      method: 'STRUCTURAL',
      delta: truncate(`Actual JSON region failed to parse: ${err.message}\nRegion: ${jsonRegion}`)
    };
  }
  const result = shapeMatch(expected, actual, '');
  if (result.matched) return { matched: true, method: 'STRUCTURAL' };
  return {
    matched: false,
    method: 'STRUCTURAL',
    delta: truncate(result.reason)
  };
}

/**
 * Recursive shape match. Returns { matched, reason? }.
 * - For objects: every key in expected must exist in actual and shape-match.
 *   Extra keys in actual are ignored.
 * - For arrays: lengths must match; each element shape-matches by position.
 * - For primitives: strict equality.
 */
function shapeMatch(expected, actual, path) {
  if (expected === null) {
    return actual === null
      ? { matched: true }
      : { matched: false, reason: `${path || '$'}: expected null, got ${typeof actual}` };
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return { matched: false, reason: `${path || '$'}: expected array, got ${typeof actual}` };
    }
    if (expected.length !== actual.length) {
      return { matched: false, reason: `${path || '$'}: expected array length ${expected.length}, got ${actual.length}` };
    }
    for (let i = 0; i < expected.length; i++) {
      const r = shapeMatch(expected[i], actual[i], `${path}[${i}]`);
      if (!r.matched) return r;
    }
    return { matched: true };
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      return { matched: false, reason: `${path || '$'}: expected object, got ${actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual}` };
    }
    for (const key of Object.keys(expected)) {
      if (!(key in actual)) {
        return { matched: false, reason: `${path || '$'}.${key}: missing in actual` };
      }
      const r = shapeMatch(expected[key], actual[key], `${path}.${key}`);
      if (!r.matched) return r;
    }
    return { matched: true };
  }
  // Primitive comparison
  if (expected === actual) return { matched: true };
  return { matched: false, reason: `${path || '$'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` };
}

/**
 * Extract the first JSON region (object or array) from a noisy stdout string.
 * Returns null if no balanced region found.
 */
function extractJsonRegion(s) {
  if (typeof s !== 'string' || !s) return null;
  const startIdx = Math.min(
    ...['{', '['].map(c => {
      const i = s.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  if (!isFinite(startIdx)) return null;
  // Scan forward tracking brace/bracket depth, ignoring those inside strings
  const open = s[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(startIdx, i + 1);
    }
  }
  return null;
}

function truncate(s) {
  if (typeof s !== 'string') return String(s);
  return s.length <= TRUNCATE_DELTA_AT ? s : s.slice(0, TRUNCATE_DELTA_AT) + '...[truncated]';
}

/**
 * Top-level matcher dispatcher. Picks the right matcher and runs it.
 */
export function matchStep(expected_outcome, actual_stdout) {
  const method = chooseMatcher(expected_outcome);
  if (method === 'REGEX') return matchRegex(expected_outcome, actual_stdout);
  if (method === 'STRUCTURAL') return matchStructural(expected_outcome, actual_stdout);
  return matchSubstring(expected_outcome, actual_stdout);
}
