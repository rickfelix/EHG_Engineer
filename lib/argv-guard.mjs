/**
 * Fail-closed argv scanning, shared. (QF-20260807-359; extracted from QF-20260807-289.)
 *
 * A state-mutating script that IGNORES an unknown flag is worse than one that errors: the
 * operator believes they asked for something and got it. handoff.js hit this when
 * `--precheck` silently no-op'd and performed a REAL transition; safe-root-resync.mjs hit
 * the same shape when `--help` ran the script, cleared a stale index.lock, and evaluated a
 * resync. Two independent rediscoveries of one workaround is a measurement of contract
 * discoverability, so this publishes the contract rather than copying the fix a second time.
 *
 * BUILTIN-FREE ON PURPOSE, inherited from the 289 rationale: handoff.js keeps its top-level
 * imports clear of anything resolving through node_modules so it still loads inside an
 * orphaned worktree with a dangling node_modules junction. A guard that cannot load in that
 * state would be absent exactly when a confused invocation is most likely.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: derive the flag set itself. A whitelist must be
 * enumerated by READING THE PARSE SITES — handoff.js is a 145-line wrapper that touches
 * three flags while thirteen more are consumed downstream, so anything auto-derived from the
 * entry file would reject almost every real flag and hard-break the fleet. Each caller owns
 * its set and cites the parse site per entry.
 */

/**
 * Return the unknown flags in `args`, in order, without duplicates.
 *
 * Only `--`-prefixed tokens are inspected, so flag VALUES are never mistaken for flags.
 * A bare `--` terminates scanning (conventional end-of-options). `--flag=value` is matched
 * on its name half: accepting the `=` form does not claim any parser supports it, but
 * mis-rejecting a real flag is the failure direction that breaks every seat.
 */
export function findUnknownFlags(args = [], knownFlags = new Set(), { singleDash = false } = {}) {
  // A default parameter only fires on `undefined`, so `null` walked straight into the for-of
  // and THREW — inherited from the 289 original. A guard that throws on hostile input fails
  // exactly when it is most needed, and on these call sites the throw would surface as a
  // crash of the very script the guard was added to make safer.
  const list = Array.isArray(args) ? args : [];
  const known = knownFlags instanceof Set ? knownFlags : new Set(knownFlags || []);
  const unknown = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    if (raw === '--') break;
    const isLong = raw.startsWith('--');
    // SINGLE-DASH IS OPT-IN, and the default is off ON PURPOSE. Scanning `-x` by default
    // would change handoff.js — the canonical never-bypass script — as a side effect of a
    // fix aimed at a different tool, which is not a trade a QF gets to make silently.
    //
    // It exists at all because the two-sided test for QF-359 caught `-h` RUNNING
    // safe-root-resync.mjs: only `--` tokens were inspected, so a single-dash flag sailed
    // through the guard into the mutating path. Worse, the `-h` entry already sat in that
    // tool's near-miss map — an entry that reads as coverage while being structurally
    // unreachable, which is the shape that makes a guard look armed when it is not.
    const isShort = singleDash && raw.length > 1 && raw[0] === '-' && !isLong;
    if (!isLong && !isShort) continue;
    const name = raw.includes('=') ? raw.slice(0, raw.indexOf('=')) : raw;
    if (known.has(name)) continue;
    if (!unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

/**
 * Human-facing rejection text. Separated from process control so it stays testable.
 *
 * `rationale` is per-tool and load-bearing: it must say what the tool would have MUTATED,
 * because "unknown flag" alone reads as pedantry while "nothing was executed, and this
 * script rewrites your working tree" reads as a rescue.
 */
export function formatUnknownFlagError({ tool, unknown = [], knownFlags = new Set(), nearMiss = new Map(), rationale = [], usage = '' }) {
  const lines = [`[${tool}] ❌ Unknown flag${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`, ...rationale];
  for (const flag of unknown) {
    if (nearMiss.has(flag)) lines.push(`   Did you mean: ${nearMiss.get(flag)}`);
  }
  lines.push('   Documented flags: ' + [...knownFlags].join(' '));
  if (usage) lines.push(`   Full usage: ${usage}`);
  return lines.join('\n');
}
