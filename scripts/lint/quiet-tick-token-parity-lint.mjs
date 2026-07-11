// quiet-tick-token-parity-lint.mjs — cross-checks QUIET_TICK_* tokens emitted by an
// *-quiet-tick.mjs script against the tokens its paired *-startup-check.mjs prompt
// allowlists. Generalizes a round-1 CRITICAL finding (adam-quiet-tick.mjs emitted
// QUIET_TICK_VENTURE_STALL_ALERT/QUIET_TICK_INBOX_CAP that adam-startup-check.mjs's
// prompt never mentioned — those lines would silently fall through the "NO-OP if
// output contains none of X/Y/Z" gate and never get actioned). The emitter and its
// consumer-prompt allowlist must ship together; this lint makes that mechanical.
// Retro action item (SD-EHG-CONSOLE-PENDING-COUNT-SSOT-001 family, QF-20260711-095).
// Mirrors the structure of scripts/lint/fleet-liveness-select-lint.mjs (pure
// extractors + reason-required allowlist + self-invoke guard). ADVISORY-FIRST:
// exit 0 by default; pass --enforce for exit 1 on an under-covered emitter.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/quiet-tick-token-parity-allowlist.json');

// Each pair: emitter script (produces QUIET_TICK_* lines) -> consumer script whose
// prompt string names the tokens it treats as actionable / non-NO-OP signals.
export const PAIRS = [
  { emitter: 'scripts/adam-quiet-tick.mjs', consumer: 'scripts/adam-startup-check.mjs' },
  { emitter: 'scripts/coordinator-quiet-tick.mjs', consumer: 'scripts/coordinator-startup-check.mjs' },
];

const TOKEN_RE = /QUIET_TICK_[A-Z_]+/g;

/**
 * Strip // line and block comments so a token merely MENTIONED in a comment (e.g.
 * "consider adding QUIET_TICK_FOO") doesn't register as emitted/allowlisted.
 * Preserves line count (PRESERVES newlines) — matches the convention in
 * scripts/lint/fleet-liveness-select-lint.mjs.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

/**
 * Tokens a script's source references as string literals (whole-file scan, comments
 * stripped). Deliberately NOT scoped to a single call's argument list: a token may be
 * assigned to a variable via a ternary/conditional before being interpolated into the
 * actual console.log/error call (e.g. adam-quiet-tick.mjs's inbox-surface loop), so
 * restricting to "inside this one call's parens" misses real emissions. Pure +
 * string-only so it is unit-testable.
 * @param {string} src
 * @returns {Set<string>}
 */
export function extractTokens(src) {
  const found = new Set();
  const clean = stripComments(src);
  let t;
  TOKEN_RE.lastIndex = 0;
  while ((t = TOKEN_RE.exec(clean)) !== null) found.add(t[0]);
  return found;
}

export const extractEmittedTokens = extractTokens;
export const extractAllowlistedTokens = extractTokens;

export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${path}: ${e.message}`); }
  const entries = json.allow || json;
  for (const [k, v] of Object.entries(entries)) {
    if (!v || typeof v !== 'string' || !v.trim()) throw new Error(`Allowlist entry '${k}' must have a non-empty reason string`);
  }
  return entries;
}

/**
 * Compare each pair's emitted vs allowlisted token sets.
 * @returns {Array<{pair: string, missingFromConsumer: string[], deadInConsumer: string[]}>}
 */
export function checkPairs(pairs = PAIRS, root = ROOT) {
  return pairs.map(({ emitter, consumer }) => {
    const emitterSrc = readFileSync(resolve(root, emitter), 'utf8');
    const consumerSrc = readFileSync(resolve(root, consumer), 'utf8');
    const emitted = extractEmittedTokens(emitterSrc);
    const allowed = extractAllowlistedTokens(consumerSrc);
    // QUIET_TICK_ERROR is a structural/self-describing line (always safe to ignore if
    // unmentioned — it signals the tick itself errored, not a domain event to action),
    // exempt it from the "missing" check the same way every emitter treats it as terminal.
    const missingFromConsumer = [...emitted].filter((t) => t !== 'QUIET_TICK_ERROR' && !allowed.has(t));
    const deadInConsumer = [...allowed].filter((t) => !emitted.has(t));
    return { pair: `${emitter} -> ${consumer}`, missingFromConsumer, deadInConsumer };
  });
}

async function main() {
  const enforce = process.argv.includes('--enforce');
  const allow = loadAllowlist();
  const results = checkPairs();
  let ungoverned = 0;
  for (const r of results) {
    const missing = r.missingFromConsumer.filter((t) => !(`${r.pair}:${t}` in allow));
    console.log(`[QUIET-TICK-TOKEN-PARITY] ${r.pair}`);
    if (missing.length) {
      ungoverned += missing.length;
      console.log(`  CRITICAL: emitted but not in consumer's allowlist (would silently fall through NO-OP gate): ${missing.join(', ')}`);
    }
    if (r.deadInConsumer.length) {
      console.log(`  advisory: consumer allowlists tokens the emitter never prints (dead reference): ${r.deadInConsumer.join(', ')}`);
    }
    if (!missing.length && !r.deadInConsumer.length) console.log('  0 drift — parity OK.');
  }
  console.log(`\n[QUIET-TICK-TOKEN-PARITY] ${ungoverned} ungoverned missing-token finding(s) across ${results.length} pair(s).`);
  if (enforce && ungoverned) process.exitCode = 1;
}

if (process.argv[1] && /quiet-tick-token-parity-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
