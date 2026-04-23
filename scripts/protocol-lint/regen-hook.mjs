/**
 * Regen pipeline hook for the Protocol Consistency Linter.
 *
 * Called by `scripts/generate-claude-md-from-db.js` after Supabase auth but
 * before `CLAUDEMDGeneratorV3.generate()`. Short-circuits regen when any
 * violation is severity=block, so stale / contradictory content cannot
 * overwrite CLAUDE*.md files.
 *
 * Behavior:
 *   - `PROTOCOL_LINT_DISABLED=1` env var disables the hook entirely (emergency
 *     kill switch, logged loudly).
 *   - `--skip-lint` flag bypasses the hook. Requires `--skip-reason "<text>"`.
 *     Bypasses are printed; CLI rate-limit handling arrives in slice 4.
 *   - Otherwise: runs linter, prints a summary, exits non-zero ONLY if any
 *     violation is severity=block.
 *
 * Slice 3 ships all seed rules as severity=warn (warn-first lifecycle), so
 * the block path is plumbed but never actually trips until a rule is
 * promoted. The plumbing is deliberate — validates the abort-before-write
 * path under CI without destabilising the current regen pipeline.
 *
 * SD-PROTOCOL-LINTER-001, slice 3/n.
 */

import { runProtocolLint } from './engine.mjs';

/**
 * Extract the value for a `--flag "value"` argv pair. Returns undefined if
 * the flag is absent; returns '' if the flag has no value.
 */
function extractFlagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const next = argv[idx + 1];
  if (next == null || next.startsWith('--')) return '';
  return next;
}

/**
 * Run the lint hook. Fetches sections via getActiveProtocol, evaluates rules,
 * logs a summary, and decides whether to abort the regen.
 *
 * @param {object} params
 * @param {object} params.supabase         — Supabase client (required)
 * @param {string[]} params.argv           — process.argv slice to parse flags from
 * @param {(supabase:object)=>Promise<object>} params.getActiveProtocol
 *        — typically the exported helper from claude-md-generator/db-queries.js
 * @returns {Promise<{abort:boolean, reason:string, result?:object}>}
 */
export async function runRegenLintHook({ supabase, argv, getActiveProtocol }) {
  // Master kill switch
  if (process.env.PROTOCOL_LINT_DISABLED === '1') {
    console.log('[protocol-lint] disabled via PROTOCOL_LINT_DISABLED=1');
    return { abort: false, reason: 'disabled_env' };
  }

  // --skip-lint (slice 4 will add rate-limiting to leo_lint_run_history)
  const skipLint = argv.includes('--skip-lint');
  if (skipLint) {
    const reason = extractFlagValue(argv, '--skip-reason');
    if (!reason) {
      console.error('[protocol-lint] --skip-lint requires --skip-reason "<text>"');
      return { abort: true, reason: 'missing_skip_reason' };
    }
    console.log(`[protocol-lint] SKIPPED via --skip-lint. reason: ${reason}`);
    return { abort: false, reason: 'bypass_skip_lint' };
  }

  // Normal path: fetch sections and run the linter
  const protocol = await getActiveProtocol(supabase);
  const sections = protocol?.sections || [];
  const result = await runProtocolLint({ mode: 'regen', ctx: { sections } });

  printSummary(result);

  if (result.critical_count > 0) {
    console.error('[protocol-lint] ❌ Aborting regen — critical violations present.');
    console.error('[protocol-lint]    Fix the violations above or re-run with --skip-lint --skip-reason "<text>".');
    return { abort: true, reason: 'critical_violations', result };
  }

  return { abort: false, reason: 'clean_or_warn_only', result };
}

function printSummary(result) {
  const total = result.violations.length;
  const blocking = result.critical_count;
  const warn = total - blocking;

  console.log(`[protocol-lint] ${result.rules_evaluated} rule(s) evaluated in ${result.duration_ms}ms`);

  if (total === 0) {
    console.log('[protocol-lint] ✅ Clean — no violations.');
    return;
  }

  if (blocking > 0) console.log(`[protocol-lint] 🛑 ${blocking} blocking violation(s):`);
  for (const v of result.violations.filter(v => v.severity === 'block')) {
    console.log(`  [block] ${v.rule_id}  section=${v.section_id ?? '-'}  ${v.message}`);
  }

  if (warn > 0) console.log(`[protocol-lint] ⚠️  ${warn} warning(s):`);
  for (const v of result.violations.filter(v => v.severity === 'warn')) {
    console.log(`  [warn]  ${v.rule_id}  section=${v.section_id ?? '-'}  ${v.message}`);
  }
}
