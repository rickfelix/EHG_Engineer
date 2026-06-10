/**
 * Pre-park "durable WIP" — before a /loop worker parks (turn-ending
 * ScheduleWakeup), make any partial commit recoverable independent of the local
 * worktree by committing WIP on the claim-bound branch and pushing it. Without
 * this, a sweep-driven claim release + peer re-route into a FRESH worktree
 * orphans the unpushed commit (the worktree itself is already protected by the
 * reaper; this closes the COMMIT-VISIBILITY gap).
 *
 * SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-1).
 *
 * The DECISION is a pure function (decidePrepark) so it is unit-testable without
 * git. The IO wrapper (runPreparkWip) reuses lib/execute/wip-guard.cjs
 * checkWorktreeWIP for the dirty signal and lib/fleet/branch-ahead.cjs for the
 * ahead signal, and is fully fail-open: any error degrades to today's behavior
 * and NEVER throws / NEVER blocks the park.
 */
'use strict';

const { execSync } = require('child_process');
const { checkWorktreeWIP } = require('../execute/wip-guard.cjs');
const { countAhead } = require('./branch-ahead.cjs');

const PROTECTED_BRANCHES = new Set(['main', 'master', 'HEAD', '']);

/**
 * Pure normalization of the two independent "needs push" triggers.
 * @param {{ dirty: boolean, aheadCount: number }} o
 * @returns {{ dirty: boolean, ahead: boolean, needsPush: boolean }}
 */
function resolveNeedsPush({ dirty, aheadCount }) {
  const d = dirty === true;
  const ahead = Number.isFinite(aheadCount) && aheadCount > 0;
  return { dirty: d, ahead, needsPush: d || ahead };
}

/**
 * Pure pre-park decision.
 *   - branch is main/master/detached/empty  -> 'noop'   (never auto-commit there)
 *   - clean + not ahead                      -> 'noop'   (zero-cost common park)
 *   - dirty + has remote                     -> 'commit_and_push'
 *   - dirty + no remote                      -> 'commit_only' (durable locally; reaper protects it)
 *   - clean + ahead + has remote             -> 'push_only'   (the literal orphan-commit case)
 *   - clean + ahead + no remote              -> 'noop'        (already committed locally, nothing to do)
 * @param {{ dirty:boolean, aheadCount:number, branch:string, hasRemote:boolean }} o
 * @returns {{ action: 'noop'|'commit_only'|'commit_and_push'|'push_only', reason: string }}
 */
function decidePrepark({ dirty, aheadCount, branch, hasRemote }) {
  if (PROTECTED_BRANCHES.has(branch)) {
    return { action: 'noop', reason: `protected/unresolved branch '${branch || '(none)'}' — never auto-commit` };
  }
  const { dirty: d, ahead, needsPush } = resolveNeedsPush({ dirty, aheadCount });
  if (!needsPush) return { action: 'noop', reason: 'clean working tree and nothing ahead of upstream' };
  if (d) return hasRemote
    ? { action: 'commit_and_push', reason: 'uncommitted WIP — commit then push to make it recoverable' }
    : { action: 'commit_only', reason: 'uncommitted WIP but no remote — commit locally (reaper protects it)' };
  // clean but ahead
  return hasRemote
    ? { action: 'push_only', reason: 'committed-but-unpushed work — push to make it recoverable after re-route' }
    : { action: 'noop', reason: 'committed-but-unpushed work and no remote — already durable locally' };
}

function git(worktreePath, cmd, timeout = 15000) {
  return execSync(`git ${cmd}`, { cwd: worktreePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
}

function tryGit(worktreePath, cmd, timeout = 15000) {
  try { return { ok: true, out: git(worktreePath, cmd, timeout) }; }
  catch (e) { return { ok: false, err: (e && (e.stderr || e.message) || String(e)).toString().trim() }; }
}

/**
 * Fail-open IO wrapper: resolve branch + dirty + ahead, decide, then commit/push
 * as needed. Returns a small result object; NEVER throws.
 * @param {{ worktreePath: string, sdKey?: string }} o
 * @returns {{ action: string, branch: string|null, pushed: boolean, committed: boolean, note?: string }}
 */
function runPreparkWip({ worktreePath, sdKey }) {
  const result = { action: 'noop', branch: null, pushed: false, committed: false };
  try {
    if (!worktreePath) { result.note = 'no_worktree_path'; return result; }

    // Resolve the claim-bound branch from the worktree HEAD (NOT process.cwd).
    let branch = '';
    const b = tryGit(worktreePath, 'rev-parse --abbrev-ref HEAD');
    if (b.ok) branch = (b.out || '').trim();
    result.branch = branch || null;

    const hasRemote = tryGit(worktreePath, 'remote get-url origin').ok;
    const dirty = checkWorktreeWIP(worktreePath).dirty === true;

    // ahead-of-upstream: prefer the tracking ref, else origin/<branch>, else origin/main as the floor.
    let upstream = null;
    const u = tryGit(worktreePath, 'rev-parse --abbrev-ref --symbolic-full-name @{u}');
    if (u.ok && u.out.trim() && !/no upstream/i.test(u.out)) upstream = u.out.trim();
    if (!upstream && branch && tryGit(worktreePath, `ls-remote --exit-code --heads origin ${branch}`).ok) {
      upstream = `origin/${branch}`;
    }
    if (!upstream) upstream = 'origin/main';
    const aheadCount = countAhead(worktreePath, `${upstream}..HEAD`);

    const decision = decidePrepark({ dirty, aheadCount, branch, hasRemote });
    result.action = decision.action;
    result.note = decision.reason;
    if (decision.action === 'noop') return result;

    if (decision.action === 'commit_only' || decision.action === 'commit_and_push') {
      tryGit(worktreePath, 'add -A');
      const msg = `wip(${sdKey || branch}): durable park snapshot`;
      const c = tryGit(worktreePath, `commit -m "${msg}"`);
      // An empty-index race (tree went clean between probe and commit) is benign.
      result.committed = c.ok;
    }

    if (decision.action === 'commit_and_push' || decision.action === 'push_only') {
      const p = tryGit(worktreePath, `push -u origin ${branch}`, 30000);
      result.pushed = p.ok;
      if (!p.ok) result.note = `push failed (fail-open; commit is durable locally): ${p.err}`;
    }
    return result;
  } catch (e) {
    result.note = `prepark fail-open: ${e && e.message ? e.message : String(e)}`;
    return result;
  }
}

module.exports = { decidePrepark, resolveNeedsPush, runPreparkWip, PROTECTED_BRANCHES };
