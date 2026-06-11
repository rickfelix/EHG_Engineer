#!/usr/bin/env node
/**
 * sweep-worker-scratch.mjs — prune accumulating autonomous-worker scratch from the working tree.
 *
 * WHY THIS EXISTS
 *   Autonomous /loop + Adam/coordinator sessions write throwaway DB-probe scripts
 *   (`_<topic>.mjs/.cjs` at the repo root and under `.claude/`) and timestamped backup
 *   dirs during investigations, and nothing ever pruned them. They accumulated into
 *   700+ untracked files that showed up in every `git status`. The companion `.gitignore`
 *   rules stop them being *git noise*; this script stops them piling up *on disk*.
 *
 * THE ONE SAFETY INVARIANT (do not weaken):
 *   This script NEVER deletes a git-tracked file. It loads the full tracked set from
 *   `git ls-files` and skips any candidate that is tracked (or, for a directory, that
 *   contains any tracked file). Combined with a strict pattern allowlist and a hard
 *   exclude-list for the "mixed" dirs (scripts/one-off, docs/plans, .rca, .prd-payloads,
 *   .claude/handoffs), real work cannot be destroyed even if a pattern is too broad.
 *
 * USAGE
 *   node scripts/maintenance/sweep-worker-scratch.mjs                  # dry-run (default), 12h age gate
 *   node scripts/maintenance/sweep-worker-scratch.mjs --execute        # actually delete (12h gate)
 *   node scripts/maintenance/sweep-worker-scratch.mjs --execute --older-than-hours 0   # delete all matched
 *   node scripts/maintenance/sweep-worker-scratch.mjs --auto           # hook mode: execute, throttled, silent, 24h gate
 *
 *   scripts/tmp + scripts/temp candidates (SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 FR-2)
 *   carry their own 7-day minimum age gate that --older-than-hours can NOT lower.
 *
 * Exit codes: 0 always in --auto (fail-open so it can never block a session). In manual
 * mode, 0 on success, 1 on an unexpected error (so a human notices).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Config: what is safe to sweep, and what is explicitly off-limits.
// Every entry here was verified against the live repo (forensics 2026-06-09):
// 0 tracked collisions for the allowlist; the exclude-list dirs each hold tracked
// `_`-prefixed or plan files where the naming convention does NOT distinguish junk.
// ----------------------------------------------------------------------------

const THROTTLE_HOURS = 6;          // --auto skips if it already ran within this window
const AUTO_AGE_HOURS = 24;         // --auto is conservative; manual default is 12
const MANUAL_AGE_HOURS = 12;

// Directories we must never walk into or delete from (they mix scratch with real,
// tracked, or sole-record content — triage those by hand, never by pattern).
const EXCLUDE_PREFIXES = [
  'scripts/one-off/',  // 179 tracked `_`-prefixed deliverables + live-cron scripts live here
  'docs/plans/',       // tracked per-SD design archive
  '.rca/',             // tracked `_*.mjs` collide; RCA-*.md are sole records
  '.prd-payloads/',    // SD-*.json are regenerable but treated as keep-by-default
  '.claude/handoffs/', // human SESSION-*.md handoff notes
  '.claude/commands/', // generated/maintained command defs
  '.claude/agents/',   // compiled agent defs
  'node_modules/', '.git/', '.worktrees/',
];

// Root-level singleton state files are handled by .gitignore only (they are rewritten
// in place, they do NOT accumulate, and some hold notification-dedupe state). Never
// auto-delete them here.
const NEVER_DELETE_BASENAMES = new Set([
  '.adam-chairman-decisions.json', '.adam-email-last.json',
  '.coord-email-last.json', '.coord-review-last.json',
  '.adam-scan-ledger.json', 'docmon-report.json',
]);

// Scripts scratch dirs (SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 FR-2): scripts/tmp
// and scripts/temp are throwaway-by-convention but nothing pruned them (150 + 159 files,
// ~0-1 tracked, by the 2026-06-10 sprawl scan). Swept recursively, UNTRACKED-ONLY (the
// trackedSet invariant in main() covers these candidates like any other) and with their
// own 7-DAY minimum age gate — these are bigger artifacts than session scratch, and the
// per-candidate gate cannot be lowered by --older-than-hours (Math.max in main()).
// scripts/one-off stays EXCLUDED (179+ tracked deliverables + live-cron scripts mix in).
const SCRIPTS_SCRATCH_ROOTS = ['scripts/tmp', 'scripts/temp'];
const SCRIPTS_SCRATCH_MIN_AGE_HOURS = 7 * 24;

const ROOT_SCRATCH_RE = /^_.+\.(mjs|cjs|json|diff|txt|sh|sql)$/; // root-level ad-hoc scratch
const MONITOR_PID_RE = /^\.monitor-.+\.pid$/;      // stale monitor PID files (scoped; NOT *.pid)
const BACKUP_DIR_MATCHERS = [
  (name) => /^handoff-backup-\d+$/.test(name),     // under .claude/
];
const ROOT_BACKUP_DIRS = ['.coord-sync-backup', '.pre-pull-bak'];
// Stray bug artifact: a script that wrote its output using a full Windows path as the
// filename. Matched loosely so the exact mojibake encoding doesn't matter.
const STRAY_ARTIFACT_RE = /UsersrickfProjects.*EHG_Engineer.*_inspect-retro-schema\.mjs$/;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function trackedSet(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return new Set(out.split('\0').filter(Boolean)); // forward-slash paths relative to root
}

function isExcluded(relPath) {
  return EXCLUDE_PREFIXES.some((p) => relPath === p.slice(0, -1) || relPath.startsWith(p));
}

function ageHours(absPath) {
  const { mtimeMs } = fs.statSync(absPath);
  return (Date.now() - mtimeMs) / 3_600_000;
}

function dirSizeBytes(absPath) {
  let total = 0;
  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    const child = path.join(absPath, entry.name);
    try {
      total += entry.isDirectory() ? dirSizeBytes(child) : fs.statSync(child).size;
    } catch { /* ignore races */ }
  }
  return total;
}

/**
 * Build the candidate list by walking only the roots we care about, never by trusting
 * git status (so it works whether or not the file is already gitignored).
 * Returns [{ rel, abs, bucket, isDir }].
 */
function findCandidates(root) {
  const out = [];
  const add = (rel, bucket, isDir = false, minAgeHours = 0) =>
    out.push({ rel, abs: path.join(root, rel), bucket, isDir, minAgeHours });

  // 1) repo-root files: _*.mjs/_*.cjs probes, .monitor-*.pid, the stray artifact
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (!stat.isFile()) continue;
    if (NEVER_DELETE_BASENAMES.has(name)) continue;
    if (ROOT_SCRATCH_RE.test(name)) add(name, 'root-scratch');
    else if (MONITOR_PID_RE.test(name)) add(name, 'pid');
    else if (STRAY_ARTIFACT_RE.test(name)) add(name, 'stray-artifact');
  }

  // 2) .claude/ scratch files (basename starts with _) + handoff-backup-* dirs
  const claudeDir = path.join(root, '.claude');
  if (fs.existsSync(claudeDir)) {
    for (const entry of fs.readdirSync(claudeDir, { withFileTypes: true })) {
      const rel = `.claude/${entry.name}`;
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) {
        if (BACKUP_DIR_MATCHERS.some((m) => m(entry.name))) add(rel, 'backup-dir', true);
      } else if (entry.name.startsWith('_')) {
        add(rel, 'claude-scratch');
      }
    }
  }

  // 3) root-level backup dirs
  for (const name of ROOT_BACKUP_DIRS) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) add(name, 'backup-dir', true);
  }

  // 4) scripts scratch dirs (recursive, files only — never the dirs themselves, so a
  //    tracked file deep in a subtree can never be collateral). Untracked-only via the
  //    trackedSet check in main(); 7-day per-candidate minimum age gate.
  for (const scratchRoot of SCRIPTS_SCRATCH_ROOTS) {
    const base = path.join(root, scratchRoot);
    if (!fs.existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(abs); continue; }
        const rel = path.relative(root, abs).replace(/\\/g, '/');
        add(rel, 'scripts-scratch', false, SCRIPTS_SCRATCH_MIN_AGE_HOURS);
      }
    }
  }

  return out;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { execute: false, auto: false, olderThanHours: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--execute') a.execute = true;
    else if (t === '--auto') { a.auto = true; a.execute = true; }
    else if (t === '--verbose') a.verbose = true;
    else if (t === '--older-than-hours') a.olderThanHours = Number(argv[++i]);
  }
  if (a.olderThanHours == null) a.olderThanHours = a.auto ? AUTO_AGE_HOURS : MANUAL_AGE_HOURS;
  return a;
}

function logLine(root, msg) {
  try {
    const logDir = path.join(root, '.claude', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'scratch-sweep.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never throw */ }
}

function throttled(root) {
  const marker = path.join(root, '.claude', '.scratch-sweep-last');
  try {
    if (fs.existsSync(marker)) {
      const last = Number(fs.readFileSync(marker, 'utf8').trim());
      if (Number.isFinite(last) && (Date.now() - last) / 3_600_000 < THROTTLE_HOURS) return true;
    }
  } catch { /* fall through and run */ }
  return false;
}

function stampThrottle(root) {
  try {
    fs.writeFileSync(path.join(root, '.claude', '.scratch-sweep-last'), String(Date.now()));
  } catch { /* best effort */ }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const silent = args.auto;

  if (args.auto && throttled(root)) {
    return 0; // already swept within the throttle window — no-op, no output
  }

  const tracked = trackedSet(root);
  const candidates = findCandidates(root);

  const planned = [];
  const skipped = [];
  for (const c of candidates) {
    if (isExcluded(c.rel)) { skipped.push({ ...c, why: 'excluded-dir' }); continue; }
    if (!c.isDir && tracked.has(c.rel)) { skipped.push({ ...c, why: 'tracked' }); continue; }
    if (c.isDir) {
      const prefix = c.rel + '/';
      let containsTracked = false;
      for (const t of tracked) { if (t.startsWith(prefix)) { containsTracked = true; break; } }
      if (containsTracked) { skipped.push({ ...c, why: 'tracked-in-dir' }); continue; }
    }
    let age;
    try { age = ageHours(c.abs); } catch { skipped.push({ ...c, why: 'stat-failed' }); continue; }
    // Per-candidate minimum age (scripts-scratch = 7d) can never be lowered by
    // --older-than-hours: a global "0" must not turn the scripts dirs into a hair trigger.
    const gateHours = Math.max(args.olderThanHours, c.minAgeHours || 0);
    if (age < gateHours) { skipped.push({ ...c, why: `too-new(${age.toFixed(1)}h<${gateHours}h)` }); continue; }
    let bytes = 0;
    try { bytes = c.isDir ? dirSizeBytes(c.abs) : fs.statSync(c.abs).size; } catch { /* ignore */ }
    planned.push({ ...c, ageH: age, bytes });
  }

  // Bucket tallies
  const byBucket = {};
  let totalBytes = 0;
  for (const p of planned) {
    byBucket[p.bucket] = (byBucket[p.bucket] || 0) + 1;
    totalBytes += p.bytes;
  }

  // Execute or report
  let removed = 0;
  if (args.execute) {
    for (const p of planned) {
      try {
        fs.rmSync(p.abs, { recursive: true, force: true });
        removed++;
      } catch (err) {
        logLine(root, `WARN failed to remove ${p.rel}: ${err.message}`);
      }
    }
    stampThrottle(root);
  }

  const mb = (totalBytes / 1_048_576).toFixed(2);
  const mode = args.execute ? (args.auto ? 'auto' : 'execute') : 'dry-run';
  const summary = `[${mode}] ${args.execute ? 'removed' : 'would remove'} ${args.execute ? removed : planned.length} files/dirs (${mb} MB), gate=>${args.olderThanHours}h, skipped=${skipped.length} `
    + `[${Object.entries(byBucket).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}]`;
  logLine(root, summary);

  if (!silent) {
    console.log(summary);
    if (args.verbose || !args.execute) {
      const byBucketList = {};
      for (const p of planned) (byBucketList[p.bucket] ||= []).push(`${p.rel}${p.isDir ? '/' : ''} (${p.ageH.toFixed(0)}h)`);
      for (const [bucket, items] of Object.entries(byBucketList)) {
        console.log(`\n  ${bucket} (${items.length}):`);
        for (const it of items.slice(0, args.verbose ? items.length : 12)) console.log(`    ${it}`);
        if (!args.verbose && items.length > 12) console.log(`    … and ${items.length - 12} more (use --verbose)`);
      }
      // Surface anything skipped for a tracked reason — that is the safety net working.
      const safetySkips = skipped.filter((s) => s.why === 'tracked' || s.why === 'tracked-in-dir');
      if (safetySkips.length) {
        console.log(`\n  protected (tracked, never deleted): ${safetySkips.length}`);
      }
      if (!args.execute) console.log(`\n  Dry-run only. Re-run with --execute to delete.`);
    }
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  // Fail-open: never let a sweep error block a session (auto) or crash hard.
  try { logLine(repoRoot(), `ERROR ${err.stack || err.message}`); } catch { /* ignore */ }
  if (process.argv.includes('--auto')) process.exit(0);
  console.error(`sweep-worker-scratch failed: ${err.message}`);
  process.exit(1);
}
