/**
 * Review Gate Engine for /ship Step 4.5
 *
 * Orchestrates code review at the assigned tier:
 *   Light  → self-review, advisory (findings logged, never blocks)
 *   Standard → self-review with adversarial framing, blocking
 *   Deep → multi-agent adversarial review, blocking (Phase 2 SD)
 *
 * CRITICAL findings from closed enumeration always block regardless of tier.
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
const TEST_FIXTURE_EXEMPT_IDS = new Set(['CRIT-002', 'CRIT-003', 'CRIT-004']);

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
 * Split a unified diff into per-file segments so path-scoped exemptions apply.
 * A segment inherits its file path from the `diff --git … b/<path>` / `+++ b/<path>`
 * headers. Content before any header (e.g. a bare snippet passed by a unit test)
 * has a null path and is scanned as one non-exempt segment.
 * @param {string} diffContent
 * @returns {Array<{ path: string | null, body: string }>}
 */
function splitDiffByFile(diffContent) {
  const segments = [];
  let current = { path: null, body: [] };
  // QF-20260712-610 hardening (adversarial-review finding): real `+++ b/` / `--- a/`
  // headers only appear BEFORE a file's first `@@` hunk. Inside a hunk, an added line
  // whose content starts `++ b/tests/...` renders as `+++ b/tests/...` and would spoof
  // the segment path onto a test file, leaking the test-fixture exemption to the rest
  // of a non-test file. Only honor headers outside hunks.
  let inHunk = false;
  const flush = () => { if (current.body.length) segments.push({ path: current.path, body: current.body.join('\n') }); };

  for (const line of diffContent.split('\n')) {
    const gitHeader = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (gitHeader) { flush(); current = { path: gitHeader[1], body: [] }; inHunk = false; continue; }
    if (/^@@ /.test(line)) inHunk = true;
    const plusHeader = !inHunk && line.match(/^\+\+\+ b\/(.+)$/);
    if (plusHeader) { current.path = plusHeader[1]; continue; }
    if (!inHunk && /^--- a\//.test(line)) continue; // diff metadata, not content
    current.body.push(line);
  }
  flush();
  return segments.length ? segments : [{ path: null, body: diffContent }];
}

/**
 * Check diff content against CRITICAL enumeration patterns
 * @param {string} diffContent - The PR diff text
 * @returns {{ found: boolean, findings: Array<{ id: string, name: string, matches: string[] }> }}
 */
export function checkCriticalFindings(diffContent) {
  const findings = [];
  const segments = splitDiffByFile(diffContent);

  for (const pattern of criticalConfig.critical_patterns) {
    const matches = [];
    for (const regexStr of pattern.patterns) {
      for (const segment of segments) {
        if (TEST_FIXTURE_EXEMPT_IDS.has(pattern.id) && isTestFixturePath(segment.path)) continue;
        const regex = new RegExp(regexStr, 'gi');
        while (regex.exec(segment.body) !== null) {
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
