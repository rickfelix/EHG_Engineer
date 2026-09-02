/**
 * Artifact verification for the TESTING sub-agent's evidence-reuse fast-path.
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001.
 *
 * Both reuse paths in index.js (checkTestEvidence/test_runs and
 * checkApiTestEvidence/sd_testing_status) previously trusted DB-stored pass/fail counts
 * with no cross-check against the actual on-disk Playwright artifact they claimed to be
 * backed by. A hand-written test_runs/sd_testing_status row could therefore certify an
 * unqualified PASS with no real test execution behind it (witnessed 2026-09-01 on
 * SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001: a row claiming 51/51 passed while the real artifact
 * showed 481 expected / 1276 unexpected / 1673 skipped).
 *
 * This module centralizes "read + validate + derive counts from an artifact" so both
 * reuse paths apply the identical check. All functions fail toward REFUSING reuse --
 * never toward silently trusting an unverifiable claim -- and never throw.
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';

/**
 * Runner sources that may produce an unqualified PASS from reused evidence.
 * Sized from the two triggered_by values live ingest code actually sets as a default
 * (PLAYWRIGHT_REPORTER in scripts/lib/test-evidence-ingest.js and lib/reporters/
 * leo-playwright-reporter.js; CI_PIPELINE per the original table comment) -- NOT from
 * migration-comment-only values with no live writer. Exported so it is extensible
 * without touching call sites.
 */
export const RUNNER_TRIGGER_ALLOWLIST = new Set(['PLAYWRIGHT_REPORTER', 'CI_PIPELINE']);

/**
 * Upper bound on an artifact file's size before it is refused outright, rather than being
 * read into memory and JSON.parse'd. `report_file_path`/`e2e_evidence` point at a path this
 * code does not otherwise constrain, so an oversized file (however it got there) must fail
 * closed instead of costing unbounded memory/CPU (security review, SD-FDBK-INFRA-TESTING-
 * EVIDENCE-REUSE-001).
 */
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

function readRawCapped(filePath, readFile) {
  if (!filePath) return null;
  try {
    const raw = readFile(filePath, 'utf8');
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_ARTIFACT_BYTES) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Shape-validates a native Playwright JSON report's already-read content.
 *
 * Deliberately narrow: only trusts report.stats.{expected,unexpected,skipped} as
 * Number.isInteger values (flaky defaults to 0 if absent/non-integer, since not every
 * Playwright version emits it). A vitest-shaped report (no stats object at all -- the
 * shape 12 of 14 live test_runs rows actually carry) or any malformed/partial stats
 * object is refused, never coerced (undefined > 0 is false, which would silently read
 * as "zero failures").
 * @param {string} raw
 * @returns {{expected:number, unexpected:number, skipped:number, flaky:number, startTime:string|null}|null}
 */
function parseArtifactStats(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    return null;
  }
  const stats = report && typeof report === 'object' ? report.stats : null;
  if (!stats || typeof stats !== 'object') return null;
  const { expected, unexpected, skipped, flaky, startTime } = stats;
  if (!Number.isInteger(expected) || !Number.isInteger(unexpected) || !Number.isInteger(skipped)) {
    return null;
  }
  return {
    expected,
    unexpected,
    skipped,
    flaky: Number.isInteger(flaky) ? flaky : 0,
    startTime: typeof startTime === 'string' ? startTime : null
  };
}

/**
 * SHA-256 of already-read artifact content, computed the SAME way scripts/lib/
 * test-evidence-ingest.js's computeReportHash() computes test_runs.report_hash (sha256 of
 * JSON.stringify(parsed report) -- NOT the raw file bytes, which would never match
 * report_hash's own re-serialized-object method and would make every comparison a false
 * mismatch). Returns null on malformed JSON, never throws.
 * @param {string} raw
 * @returns {string|null}
 */
function hashArtifactContent(raw) {
  try {
    const parsed = JSON.parse(raw);
    return createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Reads and shape-validates a native Playwright JSON report from disk.
 * @param {string|null|undefined} filePath
 * @param {Function} readFile - injectable readFileSync, defaults to the real one
 * @returns {{expected:number, unexpected:number, skipped:number, flaky:number, startTime:string|null}|null}
 */
export function readArtifact(filePath, readFile = readFileSync) {
  const raw = readRawCapped(filePath, readFile);
  if (raw === null) return null;
  return parseArtifactStats(raw);
}

/**
 * SHA-256 of the artifact at filePath -- see hashArtifactContent for the hashing method.
 * @param {string|null|undefined} filePath
 * @param {Function} readFile - injectable readFileSync
 * @returns {string|null}
 */
export function computeArtifactSha(filePath, readFile = readFileSync) {
  const raw = readRawCapped(filePath, readFile);
  if (raw === null) return null;
  return hashArtifactContent(raw);
}

/**
 * Combined read-once variant of readArtifact + computeArtifactSha. Reading the same path
 * twice (once to validate shape, once to hash) leaves a TOCTOU window in which the file on
 * disk could change between reads -- the accepted stats and the recorded artifact_sha would
 * then describe two different files, defeating the report_hash binding this function exists
 * to support (security review, SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001). Callers that need
 * both values MUST use this instead of calling readArtifact and computeArtifactSha
 * separately.
 * @param {string|null|undefined} filePath
 * @param {Function} readFile - injectable readFileSync
 * @returns {{artifact: object|null, sha: string|null}}
 */
export function readArtifactWithSha(filePath, readFile = readFileSync) {
  const raw = readRawCapped(filePath, readFile);
  if (raw === null) return { artifact: null, sha: null };
  return { artifact: parseArtifactStats(raw), sha: hashArtifactContent(raw) };
}

/**
 * Does the freshly-computed artifact_sha match the row's own report_hash (when both are
 * present)? A mismatch means the row is pointing at an artifact that is NOT the one it was
 * originally ingested with -- e.g. a fabricated row borrowing a genuinely-clean artifact
 * from a different, unrelated run. Non-blocking (a WARNING per FR-5 AC-4, not a hard
 * failure): older rows predate this SD and may carry a stale/absent report_hash, which must
 * not itself disqualify otherwise-legitimate reuse.
 * @param {string|null|undefined} artifactSha
 * @param {string|null|undefined} reportHash
 * @returns {boolean} true when both are present and DIFFER (a genuine mismatch)
 */
export function isReportHashMismatch(artifactSha, reportHash) {
  return Boolean(artifactSha && reportHash && artifactSha !== reportHash);
}

/**
 * Is the artifact fresh relative to the commit it is being asked to certify?
 * Fails toward "not fresh" (refuse reuse) on any unparseable/missing input -- an artifact
 * whose freshness cannot be determined must never be treated as verified.
 * @param {string|null|undefined} artifactStartTime - ISO string from report.stats.startTime
 * @param {string|null|undefined} commitTimestamp - ISO string, e.g. from `git show -s --format=%cI`
 * @returns {boolean}
 */
export function isArtifactFresh(artifactStartTime, commitTimestamp) {
  if (!artifactStartTime || !commitTimestamp) return false;
  const artifactMs = Date.parse(artifactStartTime);
  const commitMs = Date.parse(commitTimestamp);
  if (!Number.isFinite(artifactMs) || !Number.isFinite(commitMs)) return false;
  return artifactMs >= commitMs;
}

/**
 * Does this triggered_by/trigger source qualify for an unqualified PASS?
 * @param {string|null|undefined} triggeredBy
 * @returns {boolean}
 */
export function classifyProvenance(triggeredBy) {
  return typeof triggeredBy === 'string' && RUNNER_TRIGGER_ALLOWLIST.has(triggeredBy);
}

/**
 * Derives phase3-shaped test counts from a verified artifact, using the IDENTICAL formula
 * phase3-execution.js's runFullE2ESuite() already applies to a real run (tests_executed =
 * expected+unexpected+flaky; tests_passed = expected+flaky; failed_tests = unexpected) --
 * so the existing processPhase3Results() consumer (which already correctly BLOCKs on a low
 * pass rate and treats tests_executed===0 as no-evidence) receives artifact-verified counts
 * through the SAME contract it already trusts, with no new invariant-checking needed at
 * the consumer end.
 * @param {{expected:number, unexpected:number, skipped:number, flaky:number}} artifact
 * @returns {{tests_executed:number, tests_passed:number, failed_tests:number, skipped_tests:number}}
 */
export function deriveCountsFromArtifact(artifact) {
  return {
    tests_executed: artifact.expected + artifact.unexpected + artifact.flaky,
    tests_passed: artifact.expected + artifact.flaky,
    failed_tests: artifact.unexpected,
    skipped_tests: artifact.skipped
  };
}
