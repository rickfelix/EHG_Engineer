'use strict';

/**
 * ENF-05 (QF-20260525-658, RCA 6188492f): the Supabase schema pre-flight
 * (ENFORCEMENT 7 in pre-tool-enforce.cjs) must run only when a Supabase client
 * call is actually EXECUTED by a JS runner — not when it is a quoted MENTION
 * inside echo / grep / git commit / gh pr --body. Same quoted-mention CLASS as
 * ENF-15 (#3929) / ENF-12 (#3932), but those anchored a forbidden keyword to the
 * operative command; ENF-05's real use case is the call INSIDE node -e quotes
 * (quoted in both the real and false-positive case), so the distinguishing
 * signal is the GOVERNING command, which this helper resolves. Pure module
 * (mirrors coerce-literal.cjs) so it is unit-testable — the hook runs main() at load.
 */

// Single source of truth for Supabase operation detection (also used by extractTableName).
const SUPABASE_PATTERNS = [
  /\.from\(\s*['"`](\w+)['"`]\s*\)/,         // .from('table_name')
  /supabase\.from\(\s*['"`](\w+)['"`]\s*\)/, // supabase.from('table_name')
  /\.rpc\(\s*['"`](\w+)['"`]/,               // .rpc('function_name')
];

// Programs that actually evaluate JS (and would therefore execute the call).
const JS_RUNNERS = /^(node|tsx|ts-node|deno|bun|npx|pnpm|yarn)$/;

/** Earliest index any Supabase pattern matches, or -1. */
function firstSupabaseMatchIndex(command) {
  let idx = -1;
  for (const p of SUPABASE_PATTERNS) {
    const m = command.match(p);
    if (m && (idx === -1 || m.index < idx)) idx = m.index;
  }
  return idx;
}

// Start of the shell segment governing `pos`: char after the last UNQUOTED
// separator (; & | newline `(`) before pos. Quote tracking is approximate
// (single/double/backtick) — enough to attribute a mention to its outer command.
function segmentStart(command, pos) {
  let start = 0, quote = null;
  for (let i = 0; i < pos && i < command.length; i++) {
    const ch = command[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '(' || ch === '&' || ch === '|') start = i + 1;
  }
  return start;
}

/** True when a Supabase call in `command` is executed (not just mentioned). */
function isSupabaseExecution(command) {
  if (typeof command !== 'string' || command.length === 0) return false;
  const idx = firstSupabaseMatchIndex(command);
  if (idx === -1) return false;
  const segment = command.slice(segmentStart(command, idx), idx);
  const tok = segment.match(/(?:^|\s)([^\s;|&()'"`]+)/); // governing program
  if (!tok) return false;
  const prog = tok[1].replace(/.*[\\/]/, ''); // basename, cross-platform
  return JS_RUNNERS.test(prog) || /\.(c|m)?js$/.test(prog);
}

module.exports = { SUPABASE_PATTERNS, isSupabaseExecution, firstSupabaseMatchIndex };
