/**
 * --no-verify / --no-gpg-sign bypass-gate logic for pre-tool-enforce ENF-16 (QF-20260609-774).
 *
 * `git push --force` is gated by ENF-15, but --no-verify / --no-gpg-sign had NO programmatic
 * block — a single flag skips the local pre-commit secret scan (Supabase JWT / OpenAI / Resend
 * / Gemini key detection) and the CLAUDE.md-edit protection → data-leak exposure.
 *
 * Extracted so the matcher + override decision are unit-testable WITHOUT spawning the hook
 * (which runs main() at load) — mirrors scripts/hooks/lib/force-push-branch.cjs. The hook owns
 * audit + exit; this owns the pure decision.
 *
 * @module scripts/hooks/lib/no-verify-guard
 */

// Reuse the ENF-15 operative-command boundary: match only when `git` is the OPERATIVE command
// (start-of-command or after a true shell separator — ; | & ( newline && ||), NOT after a bare
// space or backtick. The flag must be a whitespace-delimited token (`\s--no-…\b`). This means a
// quoted/MENTIONED `git … --no-verify` (e.g. inside `echo "…"`) is NOT operative → never blocks.
const NO_VERIFY_RE = /(?:^|[;&|(\n]|&&|\|\|)\s*git\s+[^\n]*?\s--no-(?:verify|gpg-sign)\b/;

/**
 * Decide the ENF-16 outcome for a Bash command.
 *
 * Override: a single env var LEO_ALLOW_NO_VERIFY whose non-empty VALUE is the audited reason
 * (mirrors `EMERGENCY_PUSH="critical: reason" git push`). Empty/unset → block.
 *
 * @param {string} cmd - the Bash command string
 * @param {Object} [env=process.env] - environment carrying the LEO_ALLOW_NO_VERIFY override
 * @returns {{matched: boolean, outcome?: 'block'|'override', reason?: string, flag?: string, overrideReason?: string|null}}
 */
function decideNoVerify(cmd, env = process.env) {
  if (!NO_VERIFY_RE.test(cmd || '')) return { matched: false };
  const overrideReason = ((env && env.LEO_ALLOW_NO_VERIFY) || '').trim();
  const flag = /--no-gpg-sign\b/.test(cmd) ? 'no-gpg-sign' : 'no-verify';
  if (overrideReason.length > 0) {
    return { matched: true, outcome: 'override', reason: 'override_granted', flag, overrideReason };
  }
  return { matched: true, outcome: 'block', reason: 'no_verify_disallowed', flag, overrideReason: null };
}

module.exports = { NO_VERIFY_RE, decideNoVerify };
