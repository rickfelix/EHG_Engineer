/**
 * Robust CLI flag parser — SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-7.
 *
 * Fixes the args.indexOf(flag) -> args[i+1] class of bug found elsewhere in this repo (e.g.
 * scripts/record-plan-ratification.mjs:29-32): a naive "next token" grab accepts ANY next
 * token as the value, including another flag — so `--citation --actor "Rick"` silently records
 * the literal string "--actor" as the citation. That string is non-empty, so it can pass a bare
 * NOT NULL / non-empty check with zero real content. This parser rejects that shape outright.
 */

/**
 * Parses `--flag value` pairs from argv (starting at index 2). A flag whose next token starts
 * with "--" is a missing-value error, not a value — this is the one property that matters.
 * @param {string[]} argv
 * @param {string[]} knownFlags - e.g. ['--venture', '--type', '--verdict']
 * @returns {{values: Record<string,string>, error: string|null}}
 */
export function parseFlags(argv, knownFlags) {
  const values = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!knownFlags.includes(token)) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      return { values, error: `${token} requires a value (got ${next === undefined ? 'end of arguments' : `the flag "${next}"`} instead) — a flag value must not start with "--"` };
    }
    values[token] = next;
    i++; // consume the value token
  }
  return { values, error: null };
}
