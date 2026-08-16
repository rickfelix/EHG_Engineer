/**
 * proven_solution / quarantine guard — SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-4).
 *
 * Pure, dependency-free: evaluateQuarantineRefusal() does zero I/O when called with an explicit
 * `manifest` array, so it is unit-testable with no filesystem or Supabase mocking. Wired into
 * both proven_solutions write sites in lib/learning/issue-knowledge-base.js's recordOccurrence().
 *
 * THE ACTUAL DEFECT THIS CLOSES: a proven_solution could be (and, per PAT-AUTO-114c1f4a[0], WAS)
 * recorded and later served as `success_rate: 100` while its target test sat in
 * tests/quarantine-manifest.json — masked for weeks. was_successful DEFAULTS to true at the only
 * live caller, so this guard must key purely on the presence of a quarantine match, never on a
 * caller remembering to pass false.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MANIFEST_PATH = path.join(process.cwd(), 'tests', 'quarantine-manifest.json');

/**
 * TR-4: tests/quarantine-manifest.json entries are POSIX-style relative paths; a target path
 * supplied at runtime (win32 environment) must be normalized before comparison, or the guard
 * silently never matches on Windows — confirmed as a real risk by direct measurement, not a
 * theoretical concern.
 */
export function normalizeTestPath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Load the quarantine manifest's `.quarantined` array. Fails LOUD on a missing/malformed
 * manifest — never silently returns [] (which would make every check pass, the opposite of the
 * fail-closed posture this guard exists to provide).
 *
 * @param {string} [manifestPath]
 * @returns {Array<{file: string}>}
 */
export function loadQuarantineManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    throw new Error(`evaluateQuarantineRefusal: could not read quarantine manifest at ${manifestPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`evaluateQuarantineRefusal: quarantine manifest at ${manifestPath} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed?.quarantined)) {
    throw new Error(`evaluateQuarantineRefusal: quarantine manifest at ${manifestPath} has no .quarantined array`);
  }
  return parsed.quarantined;
}

/**
 * Decide whether ANY of targetTestPaths matches a quarantined entry.
 *
 * @param {Object} params
 * @param {string[]} [params.targetTestPaths] - candidate test paths a proven_solution names.
 *   Absent/empty is the SAFE default (never refuses) -- absence of evidence is not evidence of
 *   absence; a caller with no test-path data must never manufacture a false block.
 * @param {Array<{file: string}>} params.manifest - quarantine-manifest.json's `.quarantined` array
 * @returns {{refused: boolean, reason: string|null, matchedPath: string|null}}
 */
export function evaluateQuarantineRefusal({ targetTestPaths, manifest } = {}) {
  if (!Array.isArray(targetTestPaths) || targetTestPaths.length === 0) {
    return { refused: false, reason: null, matchedPath: null };
  }
  const quarantinedSet = new Set(
    (Array.isArray(manifest) ? manifest : [])
      .map((entry) => normalizeTestPath(entry?.file))
      .filter(Boolean),
  );
  for (const raw of targetTestPaths) {
    const normalized = normalizeTestPath(raw);
    if (normalized && quarantinedSet.has(normalized)) {
      return {
        refused: true,
        reason: `target test path '${normalized}' is present in tests/quarantine-manifest.json -- a solution cannot be marked successful while its target test is quarantined`,
        matchedPath: normalized,
      };
    }
  }
  return { refused: false, reason: null, matchedPath: null };
}
