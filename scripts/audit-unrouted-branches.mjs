#!/usr/bin/env node
/**
 * audit-unrouted-branches — list branches carrying FINISHED work that no PR routes.
 *
 * QF-20260725-085. Sibling of audit-orphan-prs.mjs, which covers the inverse case
 * (open PRs whose parent SD/QF is already completed).
 *
 * THE GAP THIS CLOSES: every existing surface tracks work that is CLAIMED, IN
 * FLIGHT, or FAILING. Finished-but-unrouted work is none of those — it is invisible
 * precisely BECAUSE it succeeded. Measured cost, twice in one day: branch
 * fix/spawn-inherits-child-session-marker carried one pushed commit from 09:21 with
 * zero conflicts against origin/main and no PR. It sat until 16:20 while being THE
 * root blocker of the entire LEO chain, and every board looked clean throughout.
 *
 * MERGED-BY-ANY-ROUTE IS TWO CHECKS, NOT ONE. The QF says verify by ancestry rather
 * than by branch name — correct, but ancestry ALONE is insufficient here: a SQUASH
 * merge rewrites the commit, so the branch tip is not an ancestor of main even though
 * the work landed. This repo squash-merges routinely, and the effect is dramatic —
 * measured at authoring: 5050 branches total, 3418 of them "not merged" by ancestry,
 * the vast majority of which DID land via squash. So we apply both:
 *   1. ancestry — `git for-each-ref --no-merged=origin/main` (one call, free)
 *   2. patch-equivalence — `git cherry origin/main <ref>` compares patch-ids and marks
 *      '-' for commits already upstream, catching squash and rebase
 * A branch is unrouted only if it fails BOTH. Branch names are never consulted.
 *
 * WHY AN AGE WINDOW IS LOAD-BEARING, NOT A SHORTCUT. Running the patch-equivalence
 * check across all 3418 ancestry-unmerged refs takes many minutes (one git process
 * each) and buries the signal in years of abandoned branches — branch cleanup is a
 * different job with its own scripts. The failure mode this detector exists for is
 * RECENT finished work falling through a gap between owners (the live case sat 7
 * hours). So we bound by newest-commit age (default 14 days, --max-age-days) and
 * report the age of every hit, which the QF asks for anyway so a fresh mid-work
 * branch does not alarm.
 */

import { execFileSync } from 'node:child_process';

const BASE = 'origin/main';
const PROTECTED = new Set(['main', 'master', 'HEAD']);
/**
 * Default window, chosen from measurement rather than taste:
 *   3d  ->  6 hits,  ~5s   (fast enough to surface inline anywhere)
 *  14d  -> 36 hits, ~116s  (useful as a periodic sweep, too slow for a render)
 * The cost is one `git cherry` per surviving ref, so runtime scales with the window.
 * 3d also matches the failure mode: the live incident sat 7 HOURS, not weeks.
 * Widen with --max-age-days for an occasional deeper audit.
 */
const DEFAULT_MAX_AGE_DAYS = 3;
/** Below this, a branch is presumed still being worked and is not reported. */
const DEFAULT_MIN_AGE_HOURS = 1;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Ancestry-unmerged refs with their commit dates, in ONE git call.
 * De-duplicated by short branch name so a local/origin pair counts once.
 */
export function listUnmergedRefs(cwd) {
  const raw = git(['for-each-ref', `--no-merged=${BASE}`, '--format=%(refname:short)\t%(committerdate:iso-strict)',
    'refs/heads', 'refs/remotes/origin'], cwd);
  const byBranch = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [ref, date] = line.split('\t');
    const branch = ref.replace(/^origin\//, '');
    if (PROTECTED.has(branch)) continue;
    if (!byBranch.has(branch)) byBranch.set(branch, { branch, ref, newestCommitISO: date || null });
  }
  return [...byBranch.values()];
}

/**
 * Pure: is this ref inside the age window worth checking?
 * Exported for testing without git.
 */
export function withinAgeWindow(newestCommitISO, { maxAgeDays = DEFAULT_MAX_AGE_DAYS, minAgeHours = DEFAULT_MIN_AGE_HOURS } = {}, now = Date.now()) {
  const ts = newestCommitISO ? Date.parse(newestCommitISO) : NaN;
  if (!Number.isFinite(ts)) return false;
  const ageHours = (now - ts) / 3_600_000;
  return ageHours >= minAgeHours && ageHours <= maxAgeDays * 24;
}

/**
 * Pure: decide whether a branch holds unrouted work, given gathered facts.
 * Exported so the merged-by-any-route logic is testable without git or gh.
 */
export function classifyBranch({ branch, ref, unmergedPatchCount, hasOpenPR, newestCommitISO }, now = Date.now()) {
  if (unmergedPatchCount === 0) return null; // landed via squash or rebase
  if (hasOpenPR) return null;                // already routed for review
  const ts = newestCommitISO ? Date.parse(newestCommitISO) : null;
  const ageHours = ts ? (now - ts) / 3_600_000 : null;
  return {
    branch,
    ref,
    unmerged_commits: unmergedPatchCount,
    newest_commit: newestCommitISO || null,
    age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
  };
}

function openPRBranches(repo) {
  try {
    const raw = execFileSync('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '1000', '--json', 'headRefName'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return { set: new Set(JSON.parse(raw).map((p) => p.headRefName)), ok: true };
  } catch (err) {
    // Fail LOUD rather than silently reporting every branch as unrouted.
    process.stderr.write(`[audit-unrouted-branches] gh pr list failed (${err.message}); cannot distinguish routed branches — aborting to avoid false positives\n`);
    return { set: new Set(), ok: false };
  }
}

/** Count commits with no patch-equivalent upstream ('+' rows from git cherry). */
export function countUnmergedPatches(ref, cwd) {
  try {
    return git(['cherry', BASE, ref], cwd).split('\n').filter((l) => l.startsWith('+')).length;
  } catch {
    return 1; // conservative: assume unmerged so it surfaces rather than hides
  }
}

export function findUnroutedBranches(cwd, repo, opts = {}) {
  const { set: openPRs, ok } = openPRBranches(repo);
  if (!ok) return null;
  const found = [];
  for (const cand of listUnmergedRefs(cwd)) {
    if (!withinAgeWindow(cand.newestCommitISO, opts)) continue;
    try {
      const hit = classifyBranch({
        ...cand,
        unmergedPatchCount: countUnmergedPatches(cand.ref, cwd),
        hasOpenPR: openPRs.has(cand.branch),
      });
      if (hit) found.push(hit);
    } catch (err) {
      process.stderr.write(`[audit-unrouted-branches] skipped ${cand.ref}: ${err.message}\n`);
    }
  }
  return found.sort((a, b) => (b.age_hours ?? 0) - (a.age_hours ?? 0)); // oldest first
}

function fmtAge(h) {
  if (h === null) return '?';
  return h >= 24 ? `${Math.round(h / 24)}d` : `${h}h`;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const json = flag('--format') === 'json';
  const repo = flag('--repo') || 'rickfelix/EHG_Engineer';
  const maxAgeDays = Number(flag('--max-age-days') ?? DEFAULT_MAX_AGE_DAYS);

  const rows = findUnroutedBranches(process.cwd(), repo, { maxAgeDays });
  if (rows === null) { process.exit(0); return; } // gh unavailable; already warned

  if (json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else if (rows.length === 0) {
    console.log(`[audit-unrouted-branches] No unrouted branches in the last ${maxAgeDays}d — everything ahead of ${BASE} is merged or has an open PR.`);
  } else {
    console.log(`[audit-unrouted-branches] ${rows.length} branch(es) with FINISHED work and NO open PR (last ${maxAgeDays}d):`);
    for (const r of rows) {
      console.log(`  - ${r.branch}  +${r.unmerged_commits} unmerged commit(s)  newest ${fmtAge(r.age_hours)} old`);
    }
    console.log('  → open a PR, or delete the branch if the work is abandoned.');
  }
  process.exit(0); // informational only; never block a caller
}

if (process.argv[1] && process.argv[1].endsWith('audit-unrouted-branches.mjs')) {
  try { main(); } catch (err) {
    process.stderr.write(`[audit-unrouted-branches] fatal: ${err.message}\n`);
    process.exit(0);
  }
}
