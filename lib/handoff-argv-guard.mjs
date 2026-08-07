/**
 * QF-20260807-289 — fail-closed argv for handoff.js.
 *
 * handoff.js is THE canonical state-mutating process script (CLAUDE.md names it as the
 * never-bypass path). It read argv positionally and ignored anything it did not recognise,
 * so a flag that does not exist was indistinguishable from a flag that does nothing. A
 * worker passed `execute PLAN-TO-EXEC <SD> --precheck` expecting a dry run and performed
 * the REAL transition. A no-op flag on an irreversible command is worse than an error:
 * the operator believes they are safe precisely when they are not.
 *
 * Builtin-free on purpose. handoff.js keeps its top-level imports free of anything that
 * resolves through node_modules so it still loads inside an orphaned worktree whose
 * node_modules junction is dangling; a guard that cannot load in that state would be
 * absent exactly when a confused invocation is most likely.
 *
 * SCOPE. This rejects unknown flags. It deliberately does NOT implement a dry run —
 * because two already exist (see NEAR_MISS below), which is the whole reason the accident
 * was a near miss rather than a missing feature.
 */

/**
 * Every flag reachable on the `node scripts/handoff.js ...` path, with the parse site that
 * consumes it. Sites were enumerated by reading the parsers, NOT by grepping handoff.js —
 * handoff.js is a 145-line thin wrapper that reads only argv[0]/argv[2] and
 * `--bypass-validation`. A whitelist derived from the wrapper would reject every entry
 * below except one, and would hard-break the fleet on the canonical script.
 */
export const KNOWN_HANDOFF_FLAGS = new Set([
  // cli/cli-main.js — global + execute
  '--bypass-validation',   // :556  documented bypass (audit-logged downstream)
  '--bypass-reason',       // :557  its mandatory reason payload
  '--pattern-id',          // :567
  '--followup-sd-key',     // :568
  '--no-cache',            // :940
  '--evaluate',            // :1373 dry-run gate scoring
  '--dry-run',             // :1378 REAL dry run on execute — short-circuits before the executor
  '--text',                // :1426 introspect output format
  '--vision-key',          // :1333
  '--arch-key',            // :1334

  // No parse site — `--help` falls to the switch's `default:` arm, which calls
  // displayHelp(). Verified by running it: `handoff.js --help` exits 0 and prints usage
  // today. Registered because rejecting the universal help convention on the fleet's most
  // used script would be a regression, and because asking for help mutates nothing.
  '--help',

  // auto-proceed-resolver.js — reads process.argv directly, not the CLI's `args`
  '--auto-proceed',        // :48
  '--no-auto-proceed',     // :49

  // lib/cross-sd-overlap.js parseAckFlags(), invoked from INSIDE gates on the execute
  // path (plan-to-exec + lead-final-approval). Far from the CLI and easy to miss.
  '--acknowledge-cross-sd-overlap', // :123
  '--ack-reason',                   // :126

  // cli/leo5-commands.js — kickback / invalidate / resume subcommands
  '--from',                // :198
  '--to',                  // :199
  '--reason',              // :200, :263
  '--type',                // :267
  '--correction',          // :334
  '--notes',               // :338
]);

/**
 * Flags an operator plausibly reaches for, mapped to the real spelling. `--precheck` is
 * the recorded near miss: `precheck` and `dry-run` are both genuine COMMANDS, and
 * `--dry-run` is a genuine FLAG on execute. The correct invocation was one token away, so
 * naming it in the error is most of this fix's value.
 */
export const NEAR_MISS = new Map([
  ['--precheck', "`handoff.js precheck TYPE SD-ID` (a command, not a flag), or `handoff.js execute TYPE SD-ID --dry-run`"],
  ['--dryrun', '--dry-run'],
  ['--dry', '--dry-run'],
  ['--check', "`handoff.js precheck TYPE SD-ID`"],
  ['--no-execute', "`handoff.js execute TYPE SD-ID --dry-run`"],
  ['--bypass', '--bypass-validation (and its required --bypass-reason)'],
  ['--autoproceed', '--auto-proceed'],
]);

/**
 * Return the unknown flags in `args`, in order, without duplicates.
 *
 * Only `--`-prefixed tokens are inspected, so flag VALUES are never mistaken for flags.
 * A bare `--` terminates scanning (conventional end-of-options).
 *
 * `--flag=value` is matched on its name half. Accepting the `=` form here does not claim
 * the parsers support it — they read values positionally — but this guard's job is
 * rejecting flags that do not exist, and mis-rejecting a real flag is the failure
 * direction that breaks every seat.
 */
export function findUnknownFlags(args = []) {
  const unknown = [];
  for (const raw of args) {
    if (typeof raw !== 'string') continue;
    if (raw === '--') break;
    if (!raw.startsWith('--')) continue;
    const name = raw.includes('=') ? raw.slice(0, raw.indexOf('=')) : raw;
    if (KNOWN_HANDOFF_FLAGS.has(name)) continue;
    if (!unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

/** Human-facing rejection text. Separated from process control so it is testable. */
export function formatUnknownFlagError(unknown) {
  const lines = [
    `[handoff.js] ❌ Unknown flag${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
    '   NOTHING WAS EXECUTED. handoff.js mutates strategic_directives_v2, so an',
    '   unrecognised flag is refused rather than ignored — a flag that silently does',
    '   nothing lets you believe a real transition was a rehearsal.',
  ];
  for (const flag of unknown) {
    if (NEAR_MISS.has(flag)) lines.push(`   Did you mean: ${NEAR_MISS.get(flag)}`);
  }
  lines.push('   Documented flags: ' + [...KNOWN_HANDOFF_FLAGS].join(' '));
  lines.push('   Full usage: node scripts/handoff.js help');
  return lines.join('\n');
}
