/**
 * target_application vs scope cross-check validator.
 *
 * Part of SD-LEO-INFRA-SD-CREATION-TOOLING-001 Phase 4.
 *
 * Pure function — no I/O. Imported by:
 *   - scripts/create-sd.js (at INSERT time)
 *   - scripts/leo-create-sd.js (at INSERT time)
 *   - scripts/sd-start.js (before worktree creation)
 *
 * Purpose: catch the failure mode where an SD ships with scope text declaring
 * one repo ("EHG_Engineer only") but target_application pointing at the other
 * ("EHG"), which then causes sd-start.js to open the worktree in the wrong
 * repo. Observed twice on 2026-04-22 on this SD and on
 * SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
 *
 * Verdict levels:
 *   PASS  — no mismatch detected, or scope is mixed-repo
 *   WARN  — mismatch detected; advisory only (logs but does not block)
 *   BLOCK — mismatch detected AND env var TARGET_APP_CROSSCHECK_VERDICT=BLOCK
 *
 * Default is WARN for a 2-week observation window before promotion to BLOCK.
 * Callers decide whether to halt on WARN (none do by default).
 */

const ENGINEER_ONLY_PATTERNS = [
  /\bEHG_Engineer only\b/i,
  /\bengineer[-\s]only\b/i,
  /\bbackend only\b/i,
  /\bcli only\b/i,
  /\bscripts only\b/i
];

const EHG_ONLY_PATTERNS = [
  /\bEHG only\b/i,
  /\bfrontend only\b/i,
  /\bui only\b/i,
  /\bapp only\b/i
];

const MIXED_PATTERNS = [
  /\bEHG\s+and\s+EHG_Engineer\b/i,
  /\bboth\s+repos?\b/i,
  /\bmixed[-\s]repo\b/i,
  /\bcross[-\s]repo\b/i
];

/**
 * @param {{scope?: string|null, target_application?: string|null}} input
 * @returns {{verdict: 'PASS'|'WARN'|'BLOCK', reasons: string[], matchedPhrase?: string}}
 */
export function validateTargetApplication({ scope, target_application }) {
  const reasons = [];

  // Missing inputs: can't cross-check, pass-through
  if (!scope || typeof scope !== 'string') {
    return { verdict: 'PASS', reasons: ['scope not provided — skipping cross-check'] };
  }
  if (!target_application) {
    return { verdict: 'PASS', reasons: ['target_application not provided — skipping cross-check'] };
  }

  // Explicit mixed-repo scope always passes regardless of target_application
  for (const pattern of MIXED_PATTERNS) {
    if (pattern.test(scope)) {
      return { verdict: 'PASS', reasons: [`scope explicitly mixed-repo (matched /${pattern.source}/)`] };
    }
  }

  // Engineer-only scope with target_application=EHG is a mismatch
  for (const pattern of ENGINEER_ONLY_PATTERNS) {
    const match = scope.match(pattern);
    if (match && target_application === 'EHG') {
      reasons.push(`scope text contains "${match[0]}" but target_application="EHG"`);
      reasons.push('sd-start.js will open a worktree in the wrong repo unless target_application is corrected to "EHG_Engineer"');
      return finalize(reasons, match[0]);
    }
  }

  // EHG-only scope with target_application=EHG_Engineer is a mismatch
  for (const pattern of EHG_ONLY_PATTERNS) {
    const match = scope.match(pattern);
    if (match && target_application === 'EHG_Engineer') {
      reasons.push(`scope text contains "${match[0]}" but target_application="EHG_Engineer"`);
      reasons.push('sd-start.js will open a worktree in the wrong repo unless target_application is corrected to "EHG"');
      return finalize(reasons, match[0]);
    }
  }

  return { verdict: 'PASS', reasons: ['no repo-scope mismatch detected'] };
}

function finalize(reasons, matchedPhrase) {
  const envVerdict = (process.env.TARGET_APP_CROSSCHECK_VERDICT || 'WARN').toUpperCase();
  const verdict = envVerdict === 'BLOCK' ? 'BLOCK' : 'WARN';
  return { verdict, reasons, matchedPhrase };
}

/**
 * Format a cross-check result for console output.
 * @param {{verdict: string, reasons: string[], matchedPhrase?: string}} result
 * @returns {string}
 */
export function formatCrosscheckResult(result) {
  const icon = result.verdict === 'BLOCK' ? '❌' : result.verdict === 'WARN' ? '⚠️' : '✓';
  const header = `${icon} target_application cross-check: ${result.verdict}`;
  if (result.reasons.length === 0) return header;
  const lines = result.reasons.map(r => `   • ${r}`);
  return [header, ...lines].join('\n');
}
