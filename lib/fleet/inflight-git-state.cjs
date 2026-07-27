/**
 * Is this work item already in flight in git? — SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * THE DEFECT THIS CLOSES. Dispatch reads `claiming_session_id` and nothing else. It cannot see a
 * pushed branch or an open PR, so an item that is demonstrably being worked reads as free and gets
 * handed to a second worker. Measured incident: QF-20260726-425 was offered as an unclaimed
 * CRITICAL priority-jump while PR #6540 was open on `qf/QF-20260726-425`; the duplicate build was
 * discarded. A column-only fix does NOT close it — 23/30 (77%) of non-terminal quick-fixes have
 * BOTH `pr_url` and `branch_name` NULL while real PRs exist. The verdict must come from live state.
 *
 * THREE STATES, NOT A BOOLEAN. A boolean cannot distinguish "not in flight" from "could not tell",
 * and collapsing them is precisely how a misconfiguration becomes a silent always-claimable. So:
 *   IN_FLIGHT   -> a remote branch and/or an open PR exists for this item. Withhold it.
 *   CLEAR       -> probed successfully, nothing in flight. Dispatchable.
 *   UNAVAILABLE -> we could not tell. NEVER blocks dispatch (AC-3).
 *
 * FAIL DIRECTION IS DELIBERATE AND IS THE OPPOSITE OF lib/claim/wip-detector.cjs. That module
 * returns TRUE ("has WIP") on any subprocess error — correct when refusing to STEAL a claim, where
 * an extra refused steal costs a retry. Here the same convention would mark EVERY item in flight
 * under an unauthenticated gh and starve dispatch fleet-wide. Both directions already exist in
 * claim-eligibility.cjs by design (fail-open at :380 and :493-508; fail-closed at :473-476), chosen
 * per axis by blast radius. Ours is fail-open.
 *
 * WHY WE DO NOT CALL wip-detector's hasOpenPr DIRECTLY, beyond polarity: its `defaultRunGh` (:40)
 * sets `shell: process.platform === 'win32'` and this fleet runs on Windows, so gh is invoked
 * through a shell there. The SD asserted that module "already satisfies SR-1 (argument arrays, no
 * shell interpolation)"; that premise is false on this platform. Our runners set `shell: false`
 * EXPLICITLY (SR-1). Note a seam-injected test cannot observe this property, because the seam
 * replaces the very code that decides it — tests must assert the DEFAULT runners' options.
 *
 * BATCHED, NEVER PER-ITEM. classifyDispatchIneligibility is pure and synchronous and runs per-row
 * (lib/fleet/belt-depth.cjs:60; lib/checkin/steps/merged-pool-self-claim.cjs:193, whose comment
 * asserts "Pure/sync/DB-free tally"). Measured: a per-item probe costs ~1.4s (gh ~905ms + git
 * ~501ms) => ~28s per tick against 20 candidates. Two batched calls cover the whole fleet in
 * ~1.5s. So: collect ONE snapshot per tick, cache it briefly, and let consumers do Set lookups.
 *
 * Loadable from CJS (`require`) and ESM (`import` — default + named via cjs interop). The three QF
 * lanes span both module systems; scripts/worker-checkin.cjs:572-581 re-implements QF selection
 * inline TODAY precisely because scripts/modules/sd-next/display/quick-fixes.js is ESM.
 */

'use strict';

const IN_FLIGHT = 'IN_FLIGHT';
const CLEAR = 'CLEAR';
const UNAVAILABLE = 'UNAVAILABLE';

/** Probe budget. Tighter than wip-detector's 10s: this sits on the hot claim path. */
const PROBE_TIMEOUT_MS = 4000;
/** Snapshot lifetime. One tick's worth — long enough to serve a whole classification pass. */
const SNAPSHOT_TTL_MS = 60 * 1000;
/** Bounds the gh page. The repo carries ~33 open PRs; 200 is generous headroom, still one call. */
const PR_LIST_LIMIT = '200';

/**
 * Discriminating reason tokens. AC-3 requires that an auth/network failure be distinguishable in
 * logs from a genuine not-in-flight verdict (SR-4), and UNAVAILABLE is reachable by several
 * distinct causes — a test asserting only "UNAVAILABLE" can pass having never exercised the path
 * it meant to. These make the cause explicit.
 */
const REASON = {
  OPEN_PR: 'inflight_open_pr',
  REMOTE_BRANCH: 'inflight_remote_branch',
  NOT_IN_FLIGHT: 'not_in_flight',
  GH_EXIT_NONZERO: 'gh_exit_nonzero',
  GIT_EXIT_NONZERO: 'git_exit_nonzero',
  SPAWN_ERROR: 'spawn_error',
  PARSE_ERROR: 'parse_error',
  NO_SNAPSHOT: 'no_snapshot',
};

/**
 * Default runners. `shell: false` is EXPLICIT and load-bearing (SR-1): item ids flow from DB rows
 * into argv, and on win32 an inherited `shell: true` would hand them to cmd.exe. Argument arrays
 * only — never a command string. Read-only subcommands only (SR-3). Ambient gh auth (SR-2).
 */
function defaultRunGit(args, opts = {}) {
  return runSafe('git', args, opts);
}

function defaultRunGh(args, opts = {}) {
  return runSafe('gh', args, opts);
}

function runSafe(bin, args, opts = {}) {
  const { spawnSync } = require('child_process');
  const res = spawnSync(bin, args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false, // SR-1 — do not remove; see module docblock
    timeout: opts.timeout || PROBE_TIMEOUT_MS,
  });
  // spawnSync reports a timeout/ENOENT via res.error with status null. Distinguish that from a
  // clean non-zero exit: an unauthenticated gh exits 4 in ~127ms WITHOUT throwing, and conflating
  // the two is how a misconfiguration hides behind a generic failure.
  const timedOut = !!(res.error && res.error.code === 'ETIMEDOUT');
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    code: res.status == null ? 1 : res.status,
    spawnError: res.error ? (timedOut ? 'timeout' : String(res.error.code || 'spawn_error')) : null,
  };
}

/**
 * Branch naming convention, encoded ONCE. A wrong convention yields a false NEGATIVE — "nothing in
 * flight" — which silently re-opens the defect while appearing to work, so this is deliberately
 * not inlined at call sites.
 */
function branchForItem(itemId) {
  if (typeof itemId !== 'string' || !itemId) return null;
  return itemId.startsWith('QF-') ? `qf/${itemId}` : `feat/${itemId}`;
}

/** `git ls-remote --heads origin` -> refs/heads/<branch> per line. */
function parseRemoteHeads(stdout) {
  const out = new Set();
  for (const line of String(stdout || '').split('\n')) {
    const idx = line.indexOf('refs/heads/');
    if (idx !== -1) out.add(line.slice(idx + 'refs/heads/'.length).trim());
  }
  return out;
}

/**
 * Collect ONE snapshot of in-flight branch refs for the whole repo (FR-2).
 *
 * An explicit `repo` is passed to gh rather than inferred from cwd: a probe run from the wrong
 * repository returns a false negative, and that is the most dangerous failure mode here because it
 * looks exactly like a working guard.
 *
 * Either probe failing yields status UNAVAILABLE — we do not serve a half-snapshot, because a
 * missing half reads as CLEAR and CLEAR is the answer that lets a duplicate build start.
 *
 * @returns {{status:'OK'|'UNAVAILABLE', headRefs:Set<string>, reason:string|null, collectedAt:number}}
 */
function collectInflightSnapshot(opts = {}) {
  const runGit = opts.runGit || defaultRunGit;
  const runGh = opts.runGh || defaultRunGh;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeoutMs || PROBE_TIMEOUT_MS;
  const collectedAt = now();

  const unavailable = (reason) => ({ status: UNAVAILABLE, headRefs: new Set(), reason, collectedAt });

  let prRefs;
  try {
    const args = ['pr', 'list', '--state', 'open', '--limit', PR_LIST_LIMIT, '--json', 'headRefName'];
    if (opts.repo) args.splice(1, 0, '--repo', opts.repo);
    const res = runGh(args, { cwd, timeout });
    if (res.spawnError) return unavailable(res.spawnError);
    if (res.code !== 0) return unavailable(REASON.GH_EXIT_NONZERO);
    let parsed;
    try {
      parsed = JSON.parse(res.stdout || '[]');
    } catch {
      return unavailable(REASON.PARSE_ERROR);
    }
    if (!Array.isArray(parsed)) return unavailable(REASON.PARSE_ERROR);
    prRefs = new Set(parsed.map((p) => p && p.headRefName).filter(Boolean));
  } catch {
    return unavailable(REASON.SPAWN_ERROR);
  }

  let branchRefs;
  try {
    const res = runGit(['ls-remote', '--heads', 'origin'], { cwd, timeout });
    if (res.spawnError) return unavailable(res.spawnError);
    if (res.code !== 0) return unavailable(REASON.GIT_EXIT_NONZERO);
    branchRefs = parseRemoteHeads(res.stdout);
  } catch {
    return unavailable(REASON.SPAWN_ERROR);
  }

  // Union: EITHER signal means in flight. A branch with no PR is still someone's pushed work.
  const headRefs = new Set(branchRefs);
  for (const r of prRefs) headRefs.add(r);
  return { status: 'OK', headRefs, prRefs, branchRefs, reason: null, collectedAt };
}

/**
 * Classify one item against a snapshot. Pure and synchronous — safe to call from the axis table.
 * A missing snapshot is UNAVAILABLE, never CLEAR.
 */
function classifyItem(itemId, snapshot) {
  const branch = branchForItem(itemId);
  if (!branch) return { verdict: UNAVAILABLE, reason: REASON.NO_SNAPSHOT, branch: null };
  if (!snapshot || snapshot.status !== 'OK' || !(snapshot.headRefs instanceof Set)) {
    return { verdict: UNAVAILABLE, reason: (snapshot && snapshot.reason) || REASON.NO_SNAPSHOT, branch };
  }
  if (snapshot.headRefs.has(branch)) {
    const viaPr = snapshot.prRefs instanceof Set && snapshot.prRefs.has(branch);
    return { verdict: IN_FLIGHT, reason: viaPr ? REASON.OPEN_PR : REASON.REMOTE_BRANCH, branch };
  }
  return { verdict: CLEAR, reason: REASON.NOT_IN_FLIGHT, branch };
}

/** Module-level TTL cache. Keyed by repo so two targets never share a snapshot. */
const _cache = new Map();

/**
 * Get a snapshot, reusing a recent one. The clock is injectable so TTL EXPIRY is testable — a
 * cache that never expires passes a call-count test while permanently stranding merged items as
 * in-flight, quietly converting this guard into a work-blocker.
 */
function getInflightSnapshot(opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const ttl = opts.ttlMs == null ? SNAPSHOT_TTL_MS : opts.ttlMs;
  const key = opts.repo || opts.cwd || 'default';
  const hit = _cache.get(key);
  if (hit && now() - hit.collectedAt < ttl) return hit;
  const fresh = collectInflightSnapshot(opts);
  _cache.set(key, fresh);
  return fresh;
}

function _resetSnapshotCache() {
  _cache.clear();
}

module.exports = {
  IN_FLIGHT,
  CLEAR,
  UNAVAILABLE,
  REASON,
  PROBE_TIMEOUT_MS,
  SNAPSHOT_TTL_MS,
  branchForItem,
  parseRemoteHeads,
  collectInflightSnapshot,
  classifyItem,
  getInflightSnapshot,
  defaultRunGit,
  defaultRunGh,
  _resetSnapshotCache,
};
