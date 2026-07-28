/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-1 — shared argv→body extraction.
 *
 * THE DEFECT THIS REMOVES. Both senders built their message body by excluding a hand-maintained list
 * of argv INDEXES:
 *
 *   const flagValueIdxs = new Set([tIdx, tIdx + 1, rIdx, rIdx + 1, ... ].filter(i => i >= 0));
 *   const body = argv.slice(1).filter((a, i) => !flagValueIdxs.has(i + 1)).join(' ').trim();
 *
 * Every flag added to the parse had to be remembered a second time, in a different shape, further
 * down the function. Solomon's list had drifted from its parse by THREE flags — measured, not
 * assumed: `--framing-class`, `--message-kind` and `--part` all shipped their own flag token and
 * value inside the message body (`--part 2/3 real body` instead of `real body`), while `--kind`,
 * which was on the list, came through clean.
 *
 * The fix is to derive the exclusion from the flag NAMES, so the parse and the body-exclusion read
 * the same list and cannot drift. Adding `--part` to Adam by copying the index-list idiom would have
 * propagated the defect to a second sender, which is why this lives in lib/ rather than in either
 * script: the two senders now share one implementation instead of two lists that must agree.
 *
 * Lists are per-PATH, not per-file. `--eta` belongs to the status sub-command and `--part` to send;
 * a single superset would strip a legitimate `--eta` token out of a message body — the same class of
 * asymmetry in the opposite direction.
 */

/**
 * Join argv into a message body, excluding flags and the values they consume.
 *
 * @param {string[]} argv          full argv slice (argv[0] is the sub-command)
 * @param {string[]} opts.valueFlags flags that consume the FOLLOWING token
 * @param {string[]} opts.boolFlags  flags that consume nothing
 * @param {number}   opts.from       first index to treat as body (default 1, past the sub-command)
 * @returns {string} the body with no flag tokens in it
 */
function bodyFromArgv(argv, { valueFlags = [], boolFlags = [], from = 1 } = {}) {
  const drop = new Set();
  for (let i = from; i < argv.length; i++) {
    const a = String(argv[i]);
    if (valueFlags.includes(a)) { drop.add(i); drop.add(i + 1); }
    else if (boolFlags.includes(a)) { drop.add(i); }
  }
  return argv.slice(from).filter((_, i) => !drop.has(i + from)).join(' ').trim();
}

module.exports = { bodyFromArgv };
