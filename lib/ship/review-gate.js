/**
 * Review Gate Engine for /ship Step 4.5
 *
 * Orchestrates code review at the assigned tier:
 *   Light  → self-review, advisory (findings logged, never blocks)
 *   Standard → self-review with adversarial framing, blocking
 *   Deep → multi-agent adversarial review, blocking (Phase 2 SD)
 *
 * CRITICAL findings from closed enumeration always block regardless of tier.
 *
 * SECURITY (SD-LEO-FIX-REVIEW-GATE-POLARITY-001, evidence 9752c295, S-4): git's
 * combined-diff (`--cc`) format is a LOSSY security substrate by construction --
 * it omits any line that merged cleanly from at least one parent, even if that
 * line is a genuine, dangerous addition present in the final merged tree. This
 * module now parses combined-diff format correctly (see splitDiffByFile/
 * addedLinesOnly below), but correct parsing of an inherently-incomplete input
 * is not the same as complete coverage -- always source diffContent from a
 * two-way diff (`gh pr diff <PR#>`, `git diff <base>...HEAD`), never from
 * `git show`/`git log -p` on a merge commit. The width-N handling here is
 * defense-in-depth for that format if it's ever passed in, not a license to
 * treat merge-commit output as an equivalent review substrate.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let criticalConfig;
try {
  const configPath = resolve(__dirname, '../../config/review-critical-findings.json');
  criticalConfig = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  criticalConfig = { critical_patterns: [] };
}

/**
 * CRIT ids exempted for test/fixture paths. Hostile-input test fixtures
 * legitimately embed SQL-injection and destructive-schema strings as test DATA
 * (e.g. sqlite_master probes, DROP-TABLE assertions), so scanning them yields
 * structural false positives on every venture PR. (QF-20260711-047)
 */
// QF-20260712-610 extends the exemption to CRIT-003 (auth_bypass): test files
// encode forbidden patterns as NEGATIVE guard assertions (e.g. a migration-pin
// asserting `not.toMatch(/DISABLE ROW LEVEL SECURITY/i)`), which the
// `disable.*(?:auth|rls|security)` pattern matched — CRITICAL-blocking the very
// PR whose test forbids the behavior. Non-test segments are still scanned.
//
// SD-LEO-INFRA-CHRONIC-RED-GUARD-001 extends the exemption to CRIT-006
// (permission_escalation) and CRIT-007 (service_role_exposure): a regression
// test proving these patterns STILL fire on a genuine dangerous shape (a
// backend secret handed off to a front-end consumer) necessarily embeds that
// same shape as a fixture string, which then CRITICAL-blocks the very PR that
// adds the regression test — the identical class of problem QF-20260712-610
// already fixed for CRIT-003. Unlike CRIT-001 (hardcoded_secret, deliberately
// NOT exempted below), CRIT-006/007 match CODE SHAPES and identifier-naming
// conventions, never an actual secret VALUE, so a test fixture embedding them
// carries no real credential-leak risk — the same "pattern as inert test data"
// category as CRIT-002/003/004, not CRIT-001's "a real secret got committed".
const TEST_FIXTURE_EXEMPT_IDS = new Set(['CRIT-002', 'CRIT-003', 'CRIT-004', 'CRIT-006', 'CRIT-007']);

/**
 * True when a diff file path is a test/fixture path eligible for the exemption.
 * Matches a `tests/` (or `test/`, `__tests__/`) directory anywhere in the path,
 * or a `.test.`/`.spec.` filename. A null path (bare snippet with no diff header)
 * is never exempt.
 * @param {string | null} path
 * @returns {boolean}
 */
function isTestFixturePath(path) {
  if (!path) return false;
  return /(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path);
}

/**
 * True for this file's own pattern-definition source (config/review-critical-findings.json).
 * SD-LEO-INFRA-CHRONIC-RED-GUARD-001: a closed-enum regex compiled to match bare keywords
 * (e.g. `disable`, `service_role_key`, `NEXT_PUBLIC_`) necessarily contains those same
 * keywords as literal substrings in its OWN JSON-encoded pattern string -- editing that
 * pattern's own definition line therefore always self-matches its own detection, independent
 * of any `_note` phrasing (verified: this held for CRIT-003's pattern text before this SD's
 * changes too, just never surfaced because no prior PR had touched that exact line). The
 * SAME TEST_FIXTURE_EXEMPT_IDS category applies -- this file's content is a pattern
 * DEFINITION, not executable production code -- so pattern-editing PRs are not permanently
 * unshippable through this gate. CRIT-001 is deliberately excluded from that set (a real
 * secret VALUE pasted into this file would still be a genuine leak), so this exemption never
 * weakens that check.
 * @param {string | null} path
 * @returns {boolean}
 */
function isPatternDefinitionPath(path) {
  if (!path) return false;
  // Anchored at the start (repo-relative diff paths never have a leading '/') so a
  // same-named file elsewhere (e.g. vendor/config/review-critical-findings.json) is
  // NOT exempted -- deep-tier adversarial review finding, this SD.
  return /^config\/review-critical-findings\.json$/i.test(path);
}

/**
 * Split a unified OR combined diff into per-file segments so path-scoped
 * exemptions apply. A segment inherits its file path from the
 * `diff --git … b/<path>` / `diff --cc <path>` / `diff --combined <path>` /
 * `+++ b/<path>` headers, and its polarity-column `width` from its hunk
 * header. Content before any header (e.g. a bare snippet passed by a unit
 * test) has a null path, width 1, and is scanned as one non-exempt segment.
 *
 * QF-20260818-024 (RCA, following QF-20260818-651): a unified-diff hunk
 * header is `@@ ... @@` (2 '@', one polarity column per line: '+'/'-'/' ').
 * A COMBINED diff (git's `--cc`/`--combined` format, e.g. `git show
 * <merge-sha>` for a 2+-parent merge) uses `@@@ ... @@@` (N+1 '@' for an
 * N-parent merge, one polarity column PER PARENT). `/^@@ /` never matches
 * `@@@`, so a combined-diff hunk was never recognized as "in a hunk" --
 * reopening the `+++`-marker path-spoof class this file's own header
 * comment documents, for the whole file. Widened to `/^(@@+) /`, a strict
 * superset that also captures the header's own '@' run length to compute
 * the per-file polarity-column width (captured length - 1).
 *
 * QF-20260818-024 FIX-2 (VALIDATION finding, evidence aca26942, real-git-
 * fixture-proven regression in this SD's own first pass): combined diffs'
 * FILE boundary is `diff --cc <path>` / `diff --combined <path>` (a single
 * path, no `a/`/`b/` pair), NOT `diff --git a/... b/...`. The inHunk-width
 * widening above, landed without also recognizing this header shape, meant
 * `inHunk` was set true at file 1's first hunk and NEVER reset at file 2's
 * boundary (unrecognized) -- collapsing an entire multi-file combined diff
 * into one segment pinned to file 1's path, leaking file 1's test-fixture
 * exemption onto every other file's content. Recognized here as an
 * additional file-boundary trigger, on equal footing with `diff --git`.
 * @param {string} diffContent
 * @returns {Array<{ path: string | null, body: string, width: number }>}
 */
function splitDiffByFile(diffContent) {
  const segments = [];
  let current = { path: null, body: [], width: 1 };
  // QF-20260712-610 hardening (adversarial-review finding): real `+++ b/` / `--- a/`
  // headers only appear BEFORE a file's first hunk. Inside a hunk, an added line
  // whose content starts `++ b/tests/...` renders as `+++ b/tests/...` and would spoof
  // the segment path onto a test file, leaking the test-fixture exemption to the rest
  // of a non-test file. Only honor headers outside hunks.
  let inHunk = false;
  const flush = () => { if (current.body.length) segments.push({ path: current.path, body: current.body.join('\n'), width: current.width }); };

  // TESTING finding F-2 (PLAN-phase prospective review, evidence 4ef59b24): all
  // four boundary/header regexes below originally ended `(.+)$`. JS '.' excludes
  // '\r', and unflagged '$' requires alignment with the true end of the (already
  // \n-split) string -- so a CRLF-terminated line's trailing '\r' makes EVERY one
  // of these regexes fail to match, silently missing the file/hunk boundary. On
  // an ordinary width-1 diff this only degrades to the pre-existing F-1 path-
  // tracking gap; combined with THIS SD's per-segment width tracking, a missed
  // boundary can let a later '@@@'-width apply to an earlier width-1 payload
  // line, corrupting its content slice and defeating every start-anchored CRIT
  // pattern -- a genuine fail-open, not reachable today (core.autocrlf=false,
  // gh pr diff never emits CR bytes), but the same defense-in-depth class this
  // SD exists to close. `[^\r\n]+` (vs `(.+)$`) captures up to a trailing '\r'
  // without requiring exact end-of-string alignment.
  for (const line of diffContent.split('\n')) {
    const gitHeader = line.match(/^diff --git a\/.+ b\/([^\r\n]+)/);
    if (gitHeader) { flush(); current = { path: gitHeader[1], body: [], width: 1 }; inHunk = false; continue; }
    const combinedHeader = line.match(/^diff --(?:cc|combined) ([^\r\n]+)/);
    if (combinedHeader) { flush(); current = { path: combinedHeader[1], body: [], width: 1 }; inHunk = false; continue; }
    const hunkHeader = line.match(/^(@@+) /);
    if (hunkHeader) { inHunk = true; current.width = hunkHeader[1].length - 1; }
    const plusHeader = !inHunk && line.match(/^\+\+\+ b\/([^\r\n]+)/);
    if (plusHeader) { current.path = plusHeader[1]; continue; }
    if (!inHunk && /^--- a\//.test(line)) continue; // diff metadata, not content
    current.body.push(line);
  }
  flush();
  return segments.length ? segments : [{ path: null, body: diffContent, width: 1 }];
}

/**
 * Reduce a diff segment body down to ADDED content only, width-aware.
 * QF-20260818-651 (RCA, 5th+ occurrence: PRs #7030, #7155, #7244): every CRIT
 * pattern is a presence detector ("this dangerous construct exists in the code
 * now"), never an absence detector. Scanning a REMOVED or unchanged CONTEXT
 * line is a category error -- a line being deleted, or left untouched, cannot
 * introduce a NEW vulnerability into the codebase.
 * QF-20260818-024 (RCA follow-up, coordinator-directed): the width-1 rule
 * above (`startsWith('+')`) silently FAILED OPEN on combined-diff format,
 * where a line added relative to only one merge parent renders with a SPACE
 * before the '+' (e.g. ' +code' for a 2-parent merge) -- `startsWith('+')`
 * is false, so a genuine finding was dropped rather than merely mis-flagged.
 * Generalized to a width-N polarity-column read: a line is scanned if its
 * column contains AT LEAST ONE '+' (new/changed relative to at least one
 * parent -- conservative, fail-closed toward scanning); excluded only if
 * EVERY column is unanimously ' ' (pure context) or '-' (pure removal),
 * mirroring the width-1 rule exactly when width is 1.
 * QF-20260818-024 FIX-2 (VALIDATION finding, evidence aca26942): this
 * function's first pass ALSO unconditionally excluded any line whose raw
 * text started with `+++`, to keep a genuine `+++ b/path` header line (if
 * it ever leaked into `body`) from being misread as content. At width >= 2
 * that guard fires on legitimate ADDED-in-every-parent content whose text
 * happens to start with '+' (the raw diff line reads `++` followed by
 * content that is itself `+`-prefixed), silently dropping a genuine finding --
 * the exact failure mode this SD exists to close, reintroduced one line
 * down. Removed: `splitDiffByFile` above already strips every genuine
 * header line (both `diff --git`/`+++ b/`, and now `diff --cc`/`diff
 * --combined`) from `body` before this function ever runs, so the
 * defensive guard was both unnecessary and unsafe. No test relies on it --
 * removing it only WIDENS detection.
 * @param {string} body
 * @param {number} [width]
 * @returns {string}
 */
function addedLinesOnly(body, width = 1) {
  return body
    .split('\n')
    .filter((line) => {
      const prefix = line.slice(0, width);
      return prefix.length === width && prefix.includes('+');
    })
    .map((line) => line.slice(width))
    .join('\n');
}

/**
 * Check diff content against CRITICAL enumeration patterns
 * @param {string} diffContent - The PR diff text
 * @returns {{ found: boolean, findings: Array<{ id: string, name: string, matches: string[] }> }}
 */
export function checkCriticalFindings(diffContent) {
  const findings = [];
  const segments = splitDiffByFile(diffContent).map((segment) => ({
    ...segment,
    addedBody: addedLinesOnly(segment.body, segment.width),
  }));

  for (const pattern of criticalConfig.critical_patterns) {
    const matches = [];
    for (const regexStr of pattern.patterns) {
      for (const segment of segments) {
        if (TEST_FIXTURE_EXEMPT_IDS.has(pattern.id) &&
            (isTestFixturePath(segment.path) || isPatternDefinitionPath(segment.path))) continue;
        const regex = new RegExp(regexStr, 'gi');
        while (regex.exec(segment.addedBody) !== null) {
          // Log category, not the actual code excerpt (CISO requirement)
          matches.push(`Line match: ${pattern.name} pattern detected`);
        }
      }
    }
    if (matches.length > 0) {
      findings.push({ id: pattern.id, name: pattern.name, matches });
    }
  }

  return { found: findings.length > 0, findings };
}

/**
 * Build the adversarial review prompt for multi-agent Deep tier review.
 * The prompt frames the reviewer as a hostile auditor looking for concrete
 * security vulnerabilities and correctness defects — not style issues.
 *
 * @param {string} diffContent - The PR diff text
 * @returns {string} The adversarial review prompt
 */
export function buildAdversarialPrompt(diffContent) {
  const diffPreview = diffContent.length > 12000
    ? diffContent.slice(0, 12000) + '\n... [diff truncated]'
    : diffContent;

  return `You are performing an adversarial security and correctness review. You did NOT write this code. Your goal is to find real, exploitable problems — not style nits.

Focus areas:
1. SECURITY: Auth bypasses, injection vectors, permission escalation, secret exposure, RLS gaps
2. CORRECTNESS: Logic errors, off-by-one, null derefs, race conditions, data loss paths
3. DATA INTEGRITY: Missing constraints, unsafe deletes, schema migration safety

DIFF TO REVIEW:
\`\`\`
${diffPreview}
\`\`\`

Rules:
- Only flag CONCRETE problems visible in this diff. No theoretical or speculative issues.
- Every finding must cite a specific line or code pattern from the diff.
- If the code is clean, say so. Do not manufacture findings.

Return JSON:
{
  "findings": [
    { "type": "CRITICAL|WARNING|INFO", "description": "...", "location": "file:line (approximate)" }
  ],
  "summary": "1-2 sentence assessment"
}

If no issues: { "findings": [], "summary": "No issues detected" }`;
}

/**
 * Build the adversarial review prompt for self-review
 * @param {string} diffContent - The PR diff text
 * @param {'light'|'standard'|'deep'} tier - Review tier
 * @returns {string} The review prompt
 */
export function buildReviewPrompt(diffContent, tier) {
  const intensity = tier === 'light' ? 'quick' : 'thorough';
  const diffPreview = diffContent.length > 8000
    ? diffContent.slice(0, 8000) + '\n... [diff truncated]'
    : diffContent;

  return `You are a code reviewer performing a ${intensity} adversarial review. Your job is to find bugs, security issues, and logic errors in this diff. You did NOT write this code — approach it with fresh eyes and skepticism.

REVIEW THIS DIFF:
\`\`\`
${diffPreview}
\`\`\`

For each issue found, classify it as:
- CRITICAL: Security vulnerability, data loss risk, auth bypass
- WARNING: Logic error, missing edge case, potential regression
- INFO: Style issue, minor improvement suggestion

Return your findings as JSON:
{
  "findings": [
    { "type": "WARNING|CRITICAL|INFO", "description": "...", "location": "file:line (approximate)" }
  ],
  "summary": "1-2 sentence overall assessment"
}

If no issues found, return: { "findings": [], "summary": "No issues detected" }

Be specific. Do NOT flag theoretical issues — only flag concrete problems visible in the diff.`;
}

/**
 * Parse review findings from LLM response
 * @param {string} response - Raw LLM response text
 * @returns {{ findings: Array<{ type: string, description: string, location?: string }>, summary: string }}
 */
export function parseReviewFindings(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        summary: parsed.summary || 'Review complete'
      };
    }
  } catch {
    // Fall through to empty result
  }
  return { findings: [], summary: 'Review parsing failed — treating as no findings' };
}

/**
 * Run the review gate at the assigned tier
 *
 * NOTE: This function prepares the review but does NOT invoke the LLM directly.
 * The /ship skill is responsible for executing the prompt via Claude's self-review
 * or spawning an Agent for Deep tier (Phase 2).
 *
 * @param {string} diffContent - The PR diff text
 * @param {'light'|'standard'|'deep'} tier - Review tier from risk scorer
 * @returns {{ verdict: 'pass'|'block'|'review_needed', criticalFindings: Array, reviewPrompt: string, tierEnforcement: 'advisory'|'blocking' }}
 */
export function runReview(diffContent, tier) {
  // Step 1: Check CRITICAL enumeration (always runs, regardless of tier)
  const critical = checkCriticalFindings(diffContent);

  if (critical.found) {
    return {
      verdict: 'block',
      criticalFindings: critical.findings,
      reviewPrompt: null,
      tierEnforcement: 'blocking',
      reason: `CRITICAL findings detected: ${critical.findings.map(f => f.name).join(', ')}`
    };
  }

  // Step 2: Deep tier → multi-agent adversarial review
  if (tier === 'deep') {
    return {
      verdict: 'review_needed',
      criticalFindings: [],
      multiAgent: true,
      adversarialPrompt: buildAdversarialPrompt(diffContent),
      reviewPrompt: null,
      tierEnforcement: 'blocking',
      reason: 'deep tier review — multi-agent adversarial, blocking enforcement'
    };
  }

  // Step 3: Light/Standard → self-review
  const reviewPrompt = buildReviewPrompt(diffContent, tier);
  const tierEnforcement = tier === 'light' ? 'advisory' : 'blocking';

  return {
    verdict: 'review_needed',
    criticalFindings: [],
    multiAgent: false,
    adversarialPrompt: null,
    reviewPrompt,
    tierEnforcement,
    reason: `${tier} tier review — ${tierEnforcement} enforcement`
  };
}

/**
 * Evaluate review findings against tier enforcement
 *
 * @param {Array<{ type: string }>} findings - Parsed review findings
 * @param {'advisory'|'blocking'} enforcement - Tier enforcement level
 * @returns {{ verdict: 'pass'|'block', blockingFindings: Array, advisoryFindings: Array }}
 */
export function evaluateFindings(findings, enforcement) {
  const criticals = findings.filter(f => f.type === 'CRITICAL');
  const warnings = findings.filter(f => f.type === 'WARNING');
  const infos = findings.filter(f => f.type === 'INFO');

  // CRITICAL findings always block, regardless of enforcement level
  if (criticals.length > 0) {
    return {
      verdict: 'block',
      blockingFindings: criticals,
      advisoryFindings: [...warnings, ...infos]
    };
  }

  // Advisory enforcement: warnings are logged but don't block
  if (enforcement === 'advisory') {
    return {
      verdict: 'pass',
      blockingFindings: [],
      advisoryFindings: [...warnings, ...infos]
    };
  }

  // Blocking enforcement: warnings block merge
  if (warnings.length > 0) {
    return {
      verdict: 'block',
      blockingFindings: warnings,
      advisoryFindings: infos
    };
  }

  return {
    verdict: 'pass',
    blockingFindings: [],
    advisoryFindings: infos
  };
}

/**
 * Evaluate adversarial agent response for Deep tier review.
 * On agent failure (null/undefined response, parse error, timeout),
 * returns hard-fail — never degrades to Standard.
 *
 * @param {string|null} agentResponse - Raw response from adversarial agent, or null on failure
 * @returns {{ verdict: 'pass'|'block', findings: Array, reason: string }}
 */
export function evaluateAdversarialFindings(agentResponse) {
  if (!agentResponse) {
    return {
      verdict: 'block',
      findings: [],
      reason: 'agent_failure: adversarial agent returned no response — hard-fail (no degradation)'
    };
  }

  const parsed = parseReviewFindings(agentResponse);

  if (parsed.findings.length === 0) {
    return { verdict: 'pass', findings: [], reason: 'adversarial review: no issues detected' };
  }

  const evaluation = evaluateFindings(parsed.findings, 'blocking');
  return {
    verdict: evaluation.verdict,
    findings: parsed.findings,
    reason: evaluation.verdict === 'block'
      ? `adversarial review: ${evaluation.blockingFindings.length} blocking finding(s)`
      : `adversarial review: ${evaluation.advisoryFindings.length} advisory finding(s) only`
  };
}
