#!/usr/bin/env node
/**
 * wip-reclaim-denylist-audit — one-shot READ-ONLY audit of existing origin wip/reclaim/*
 * refs for denylisted per-host identity paths (QF-20260911-567, sibling of QF-20260911-379).
 *
 * QF-20260911-379 shipped isDenylistedUntrackedPath as a FORWARD guard (blocks staging a
 * matching untracked file before a future PRESERVE push) but never checked the refs already
 * on origin before that fix landed. MEASURED by Adam 2026-09-11 10:5xZ: 449 wip/reclaim/*
 * refs; 3 confirmed carrying .account-identity-last.json were deleted on Adam's GO
 * (8de5f7e7); the rest were unaudited. This script closes that gap.
 *
 * NEVER deletes, NEVER pushes — read-only `git fetch` of one ref per distinct tree SHA (many
 * refs share an identical tree; auditing per-SHA instead of per-ref cuts a ~469-ref run to
 * ~250 fetches) followed by `git ls-tree`. Findings are for the coordinator to action under
 * the same GO-then-delete shape already used for the first three hits.
 *
 * QF-20260912-147: NEVER pass --depth to these fetches. This repo's worktrees share one .git
 * object store, so a --depth=1 fetch against `origin` from ANY worktree creates/deepens a
 * shallow boundary on the SHARED repository — confirmed live: running this script shallowed
 * the root and every other worktree, breaking every seat's `git merge --ff-only origin/main`
 * fleet-wide until the coordinator ran `git fetch --unshallow`. A depth-less fetch only pulls
 * objects not already present and never touches shallow state, so it is safe to run from any
 * worktree at any time — the only cost is a (typically small) amount of extra history fetched.
 *
 * BASELINE EXCLUSION (found live during a smoke run, not in the original spec): naively
 * applying isDenylistedUntrackedPath to a full `ls-tree -r` output floods every result with
 * ordinary, currently-tracked source files whose PATH happens to match a broad pattern —
 * e.g. lib/fleet/account-identity.cjs matches the same regex written to catch the leaked
 * per-host file .account-identity-last.json, and both are present in essentially every
 * wip/reclaim tree because each is a full repo snapshot. That guard was designed for
 * UNTRACKED files at PRESERVE time (QF-20260911-379), not for auditing an already-committed
 * tree. Here a match is only reported if the path is ALSO ABSENT from origin/main's current
 * tracked tree — the actual anomaly shape (an untracked-per-host file swept into a commit)
 * can never appear in main, whereas ordinary source code always does.
 *
 * Exits non-zero iff at least one such (denylisted AND not in main) path is found.
 */
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { isDenylistedUntrackedPath } from '../../lib/worktree-reaper/preserve-stage.js';

const REF_GLOB = 'wip/reclaim/*';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Pure: {sha, ref}[] from `git ls-remote --heads` output. Exported for fixture testing. */
export function parseLsRemoteHeads(raw) {
  return String(raw || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split('\t');
      return { sha, ref: ref?.replace(/^refs\/heads\//, '') };
    })
    .filter((r) => r.sha && r.ref);
}

/** Pure: group refs by tree SHA so an identical tree is only fetched once. */
export function groupRefsBySha(refs) {
  const bySha = new Map();
  for (const { sha, ref } of refs) {
    if (!bySha.has(sha)) bySha.set(sha, []);
    bySha.get(sha).push(ref);
  }
  return bySha;
}

/**
 * Pure: which of a tree's paths are denylisted AND not part of the baseline (currently
 * tracked in main) path set. Exported for fixture testing.
 */
export function findDenylistedPaths(paths, baselineTrackedPaths = new Set()) {
  return paths.filter((p) => isDenylistedUntrackedPath(p) && !baselineTrackedPaths.has(p));
}

export function listWipReclaimRefs(remote = 'origin') {
  return parseLsRemoteHeads(git(['ls-remote', '--heads', remote, REF_GLOB]));
}

/**
 * Single-ref fetch + tree listing — touches nothing beyond this one tree's objects.
 * NEVER pass --depth here (QF-20260912-147): this repo's worktrees share one .git, and a
 * depth-limited fetch against origin shallows the SHARED repository for every worktree.
 */
export function fetchTreePaths(ref, remote = 'origin') {
  git(['fetch', '--no-tags', remote, `refs/heads/${ref}`]);
  return git(['ls-tree', '-r', '--name-only', 'FETCH_HEAD']).split('\n').filter(Boolean);
}

/**
 * Fresh, read-only snapshot of every path currently tracked on main — the exclusion set.
 * NEVER pass --depth here (QF-20260912-147) — see fetchTreePaths.
 */
export function computeBaselineTrackedPaths(remote = 'origin', branch = 'main') {
  git(['fetch', '--no-tags', remote, branch]);
  return new Set(git(['ls-tree', '-r', '--name-only', 'FETCH_HEAD']).split('\n').filter(Boolean));
}

/** Orchestration with injectable I/O so the finding logic is testable against a fixture tree. */
export function runAudit({
  listRefs = listWipReclaimRefs,
  getTreePaths = fetchTreePaths,
  getBaseline = computeBaselineTrackedPaths,
  remote = 'origin',
} = {}) {
  const baseline = getBaseline(remote);
  const refs = listRefs(remote);
  const bySha = groupRefsBySha(refs);
  const findings = [];
  const errors = [];
  let auditedShaCount = 0;
  for (const [sha, memberRefs] of bySha) {
    try {
      const hits = findDenylistedPaths(getTreePaths(memberRefs[0], remote), baseline);
      auditedShaCount++;
      if (hits.length > 0) findings.push({ sha, refs: memberRefs, hits });
    } catch (err) {
      errors.push({ sha, refs: memberRefs, error: err.message });
    }
  }
  return { totalRefs: refs.length, distinctTrees: bySha.size, auditedShaCount, findings, errors };
}

function main() {
  const { totalRefs, distinctTrees, auditedShaCount, findings, errors } = runAudit();
  console.log(`[wip-reclaim-denylist-audit] ${totalRefs} wip/reclaim/* ref(s) on origin (${distinctTrees} distinct tree(s)); ${auditedShaCount} tree(s) audited.`);
  if (errors.length > 0) {
    console.log(`[wip-reclaim-denylist-audit] ${errors.length} tree(s) could not be audited (fetch/ls-tree failure):`);
    for (const e of errors) console.log(`  - ${e.refs[0]} (${e.sha}): ${e.error}`);
  }
  if (findings.length === 0) {
    console.log('[wip-reclaim-denylist-audit] CLEAN — no denylisted per-host identity paths found in any audited tree.');
  } else {
    const refCount = findings.reduce((n, f) => n + f.refs.length, 0);
    console.log(`[wip-reclaim-denylist-audit] ${findings.length} tree(s) carry denylisted path(s), affecting ${refCount} ref(s):`);
    for (const f of findings) {
      console.log(`  sha ${f.sha}:`);
      for (const r of f.refs) console.log(`    ref: ${r}`);
      for (const p of f.hits) console.log(`    path: ${p}`);
    }
    console.log('[wip-reclaim-denylist-audit] READ-ONLY audit — no ref deleted or modified. Route findings to the coordinator for GO-then-delete disposition (same shape as the 3 hits already resolved under QF-20260911-379).');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  try { main(); } catch (err) {
    process.stderr.write(`[wip-reclaim-denylist-audit] fatal: ${err.message}\n`);
    process.exit(1); // a fatal error here must never read as "clean"
  }
}
