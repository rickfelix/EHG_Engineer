// QF-20260707-875: preventive staleness WARN for routing-critical comms CLIs.
// PREVENTIVE per Alpha's RCA on QF-20260707-652 (closed as stale-code artifact): a
// routing-critical send silently re-ran pre-fix (already-fixed elsewhere) code for
// 1h43m because the checkout was 18 commits behind origin/main, with no signal.
// Deliberately: WARN only, never auto-pull (main checkout is chronically dirty —
// mutating auto-pull is unsafe) and never a hard gate (too aggressive for a warn-class
// issue).
//
// SD-LEO-INFRA-STALENESS-GUARD-THREE-DEFECTS-001 — three defects, fixed together.
//
// D1 REPO-WIDE SCOPE. The count carried no pathspec while the message claimed to be about
//    THIS SEND. Those decouple the moment anyone merges anything unrelated, i.e. constantly.
// D2 WRONG REFERENT. It measured @{u} and said "origin/main". On a pushed feature branch
//    @{u} is that branch's OWN remote, so the number described a different ref than the one
//    it named — a wrong number stated precisely.
// D3 FAIL-OPEN SILENCE. A bare `catch {}` swallowed every git failure, so "up to date" and
//    "the check crashed" were indistinguishable to the reader. With no upstream configured
//    the old command exited 128 and this guard said NOTHING — on exactly the topology where
//    staleness is most likely, since a fresh branch has no upstream until its first push and
//    workers branch constantly. THE PREVIOUS HEADER DOCUMENTED THAT AS INTENDED ("Non-fatal
//    on any git error"). It is no longer intended: non-fatal yes, silent no.
//
// *** WHY D1 AND D2 HAD TO SHIP IN ONE COMMIT — the part that is easy to get wrong. ***
// They point in OPPOSITE directions. Measured on the authoring checkout: HEAD..@{u}=0,
// HEAD..origin/main=34, and HEAD..origin/main scoped to these paths=0. Fixing only the
// referent makes the guard shout "34 commits behind" at a checkout whose send-path code is
// completely current — a false positive strictly WORSE than the silence it replaced, because
// this warning had already been demoted to noise once. Fixing only the pathspec changes
// nothing (still 0 against @{u}, still silent). Only both together are correct.
const { execFileSync } = require('child_process');

/**
 * The code whose staleness actually matters to a send.
 *
 * EXPLICIT, NOT DERIVED — a real decision, not laziness. Deriving the scope from
 * require.cache at call time was considered and rejected: all three callers invoke this at
 * the TOP of main(), BEFORE subcommand parsing, so a derived scope would only ever see the
 * statically-required modules. Any lazy require inside a subcommand body would be silently
 * omitted, narrowing coverage exactly the way D1 already did — the same defect one layer
 * down, and invisible.
 *
 * The cost of explicit is that this list can go stale. That cost is paid down by the
 * path-existence test: a listed path that no longer exists FAILS LOUDLY rather than quietly
 * shrinking what the guard watches.
 */
const SEND_PATHS = Object.freeze([
  'scripts/worker-signal.cjs',
  'scripts/adam-advisory.cjs',
  'scripts/solomon-advisory.cjs',
  'lib/coordinator',
  'lib/coordination',
  'lib/fleet/worker-status.cjs',
  'lib/shared/body-cap.cjs',
  'lib/governance/fw3-framing-router.cjs',
]);

const BASE_REF = 'origin/main';

/** Default runner: argv-array, never a shell string, so a pathspec cannot be re-parsed. */
function defaultRunner(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });
}

/**
 * Measure how far the send paths are behind origin/main.
 *
 * Returns { ok: true, behind: N } or { ok: false, reason } — NEVER a bare 0 standing in for
 * "could not tell". Every abnormal path carries its own name so the caller can report which
 * one happened. Modelled on lib/fleet/tree-currency.cjs, which already refuses to collapse
 * unknown states into a number.
 *
 * @returns {{ok: true, behind: number} | {ok: false, reason: string}}
 */
function measureBehind(execImpl, paths) {
  let raw;
  try {
    raw = execImpl(['rev-list', '--count', `HEAD..${BASE_REF}`, '--', ...paths]);
  } catch (err) {
    // The old code stopped here and returned nothing at all. Which failure occurred is
    // exactly what the reader needs, so it survives into the message.
    const msg = String(err && err.message ? err.message : err);
    if (err && (err.killed || err.signal === 'SIGTERM')) return { ok: false, reason: 'git timed out' };
    if (/unknown revision|bad revision|ambiguous argument/i.test(msg)) {
      return { ok: false, reason: `${BASE_REF} not available locally — fetch it` };
    }
    if (/ENOENT|not found/i.test(msg)) return { ok: false, reason: 'git unavailable' };
    return { ok: false, reason: `git error (${msg.split('\n')[0].slice(0, 80)})` };
  }
  const behind = Number.parseInt(String(raw).trim(), 10);
  // An unparseable count is NOT zero. Collapsing it would reintroduce D3 through the happy
  // path: the guard would fall silent on a malformed answer and read as up-to-date.
  if (!Number.isFinite(behind) || behind < 0) {
    return { ok: false, reason: 'unparseable commit count' };
  }
  return { ok: true, behind };
}

/**
 * WARN if the code this send actually depends on is behind origin/main.
 *
 * The signature is unchanged for the three production callers, which pass only a label
 * (worker-signal.cjs:598, adam-advisory.cjs:895, solomon-advisory.cjs:779).
 */
function warnIfCheckoutStale(label, execImpl = defaultRunner, paths = SEND_PATHS) {
  const result = measureBehind(execImpl, paths);

  if (!result.ok) {
    // NOT silent, and deliberately NOT dressed as a staleness warning — the honest statement
    // is that we do not know. Distinct wording so it can never be misread as a behind-by-N
    // result, and so that seeing nothing at all now means the check ran and passed.
    process.stderr.write(
      `⚠️  NOTICE: ${label} could not determine checkout staleness (${result.reason}) — this send may be running pre-fix code, unverified.\n`
    );
    return;
  }

  if (result.behind > 0) {
    process.stderr.write(
      `⚠️  WARN: ${label} send-path code is ${result.behind} commit(s) behind ${BASE_REF} — this send may run pre-fix code. Consider a git pull before continuing.\n`
    );
  }
  // behind === 0 → silent, and that silence is now EARNED: it means the send paths were
  // measured against origin/main and are current, not that the check fell over.
}

module.exports = { warnIfCheckoutStale, measureBehind, SEND_PATHS, BASE_REF };
