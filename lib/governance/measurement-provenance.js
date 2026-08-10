/**
 * Measurement provenance stamping.
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E (FR-1, FR-3, TR-4)
 *
 * WHY THIS EXISTS: a claim recorded into the `feedback` table carries no record of
 * WHEN it was measured or WHICH ref it was measured against, so a premise that was
 * true when taken keeps flowing after its author knows better. `created_at` conflates
 * "when the row was inserted" with "when the underlying claim was measured". This
 * module produces the missing provenance so a consumer can see the measurement's age
 * and origin rather than inferring them.
 *
 * THREE DELIBERATE PROPERTIES:
 *
 * 1. measured_at is ALWAYS an explicit-offset instant (Date#toISOString is always
 *    UTC `Z`), never a naive local-time string. This repo has a documented, recurring
 *    four-hour-shift bug class where naive `timestamp without time zone` values are
 *    parsed as LOCAL by a bare `new Date(...)` — fixed independently at least three
 *    times (scripts/modules/handoff/retro-filters.js parseAsUTC, lib/handoff/
 *    wait-verdict.js, scripts/hooks/stop-subagent-enforcement/time-utils.js
 *    normalizeToUTC; commits 4fcd2bad594, c3c2fe144a8, 7f2b9442ac8). Emitting an
 *    explicit offset at the SOURCE means an age computed from this field is
 *    timezone-independent by construction and that bug class cannot reach it. Any
 *    READ-side normalisation must reuse one of the three existing helpers — do not
 *    write a fourth.
 *
 * 2. Git capture is INJECTABLE and FAIL-SOFT (TR-4). It shells out, and a feedback
 *    write must never fail because git did. `defaultGit` mirrors the established
 *    best-effort convention at lib/eva/premise-liveness.js (execSync, bounded
 *    timeout, '' on any failure). A detached HEAD, a non-repo cwd, or a missing git
 *    binary yields absent git fields, never a throw.
 *
 * 3. Stamped fields are applied LAST by the caller so a caller-supplied
 *    metadata.measured_at cannot override the real one — the same tamper-evident
 *    spread-then-stamp ordering used by lib/governance/hold-state-contract.js
 *    buildProvenancedStamp (PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001).
 */

import { runHardenedGit } from '../git/hardened-runner.cjs';

/** Default git runner: trimmed stdout, '' on any failure (best-effort, bounded).
 *  The seam contract (args STRING in, stdout out) is unchanged for the 9 injected-fake call
 *  sites; only the default implementation moved off the template-literal execSync shell sink
 *  onto the published argv runner (SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A). The strings
 *  are internal literals ('rev-parse --short HEAD' etc.), so whitespace-split is exact. */
export function defaultGit(argsString) {
  try {
    return runHardenedGit(String(argsString).trim().split(/\s+/), { timeout: 8000 }).trim();
  } catch {
    return '';
  }
}

/**
 * Build the measurement-provenance stamp.
 *
 * @param {Object}   [deps]
 * @param {Function} [deps.git]  - injectable git runner (args string -> stdout). May throw; treated as unavailable.
 * @param {Function} [deps.now]  - injectable clock returning a Date (tests).
 * @returns {{measured_at: string, timezone: (string|null), git_sha?: string, git_ref?: string}}
 */
export function buildMeasurementProvenance({ git = defaultGit, now = () => new Date() } = {}) {
  // Always explicit-offset (Z). Never a naive local string — see property 1 above.
  const measured_at = now().toISOString();

  let timezone = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    timezone = null;
  }

  // Fail-soft per TR-4: an injected git that THROWS is treated exactly like a git
  // that returned nothing. The write proceeds without the git fields.
  const safeGit = (args) => {
    try {
      return git(args) || '';
    } catch {
      return '';
    }
  };

  const git_sha = safeGit('rev-parse HEAD');
  const git_ref = safeGit('rev-parse --abbrev-ref HEAD');

  const provenance = { measured_at, timezone };
  if (git_sha) provenance.git_sha = git_sha;
  if (git_ref) provenance.git_ref = git_ref;
  return provenance;
}

export default buildMeasurementProvenance;
