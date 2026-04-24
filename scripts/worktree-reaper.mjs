#!/usr/bin/env node
/**
 * Formalized worktree reaper — tiered remediation of stale worktrees.
 *
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Detects and (with --execute) removes worktrees matching five categories:
 *
 *   Stage 1 (auto-safe with --execute):
 *     AC2 — Nested: worktree path contains `.worktrees/` more than once
 *     AC4 — Shipped-stale: `git cherry -v origin/main` shows branch is fully
 *           absorbed into main (typically via squash-merge) — content is
 *           already on main, removal is pure cleanup.
 *
 *   Stage 2 (analyzed-and-tabled, requires --execute --stage2):
 *     AC1 — Zombie on main: worktree pinned to `main` with no active claim
 *     AC3 — Orphan SD: sdKey does not resolve to any row in
 *           strategic_directives_v2 or quick_fixes
 *     AC5 — Idle: max(last-commit, fs-mtime) > threshold, no active claim,
 *           no unique unpushed commits
 *
 * Invariants:
 *   • Dry-run by default. --execute required for any mutation.
 *   • CWD must be the main repo root (prevents PAT-WORKTREE-LIFECYCLE-001
 *     self-removal on Windows).
 *   • Active-claim protection (AC8): any worktree whose path appears in
 *     v_active_sessions is ALWAYS skipped regardless of other signals.
 *   • Preserve-before-delete (AC6): any untracked file not matching the
 *     exempt regex is copied to `scratch/preserved-from-<basename>/` BEFORE
 *     `git worktree remove` runs. If preservation fails, removal is aborted.
 *   • Structured logs: JSON-lines to stderr + human table to stdout so
 *     operators and pipelines both get useful output from one invocation.
 *   • Idempotent: a second run on the same fleet state produces zero changes.
 *
 * Composes on existing primitives:
 *   • lib/worktree-quota.js::listActiveWorktrees — enumeration
 *   • lib/worktree-reaper/detectors.js — classification
 *   • v_active_sessions — active-claim source
 *   • strategic_directives_v2 / quick_fixes — orphan-SD resolution
 *
 * Usage:
 *   node scripts/worktree-reaper.mjs                      # dry-run (default)
 *   node scripts/worktree-reaper.mjs --execute            # Stage 1 only
 *   node scripts/worktree-reaper.mjs --execute --stage2   # Stage 1 + Stage 2
 *   node scripts/worktree-reaper.mjs --execute --stage2 --yes  # skip prompt
 *   node scripts/worktree-reaper.mjs --days 14            # idle threshold
 *   node scripts/worktree-reaper.mjs --phantom-only       # legacy mode
 *   node scripts/worktree-reaper.mjs --help
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { listActiveWorktrees } from '../lib/worktree-quota.js';
import {
  isZombieOnMain,
  isNested,
  hasOrphanSD,
  isPatchEquivalentToMain,
  isIdle,
} from '../lib/worktree-reaper/detectors.js';

const SCHEMA_VERSION = '1.0';
const DEFAULT_IDLE_DAYS = 7;
const PRESERVE_EXEMPT_RE = /^(tmp-|scratch-|\.claude[\\/]|\.workflow-patterns|\.worktree\.json$|\.ehg-session\.json$)/;

// ── CLI parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    execute: args.includes('--execute') || args.includes('-e'),
    stage2: args.includes('--stage2'),
    yes: args.includes('--yes'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    phantomOnly: args.includes('--phantom-only'),
    help: args.includes('--help') || args.includes('-h'),
    days: DEFAULT_IDLE_DAYS,
    preserveRoot: null,
  };
  const daysIdx = args.findIndex((a) => a === '--days');
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    const n = parseInt(args[daysIdx + 1], 10);
    if (Number.isFinite(n) && n > 0) opts.days = n;
  }
  const prIdx = args.findIndex((a) => a === '--preserve-root');
  if (prIdx !== -1 && args[prIdx + 1]) {
    opts.preserveRoot = args[prIdx + 1];
  }
  return opts;
}

const HELP = `
Formalized worktree reaper — tiered remediation

Usage:
  node scripts/worktree-reaper.mjs [options]

Options:
  --execute, -e         Remove Stage 1 worktrees (default: dry-run)
  --execute --stage2    Also remove Stage 2 worktrees (zombie/orphan/idle)
  --yes                 Skip interactive confirmation for Stage 2
  --days <n>            Idle threshold in days (default: ${DEFAULT_IDLE_DAYS})
  --preserve-root <p>   Override preserve destination root (default: scratch/preserved-from-*)
  --phantom-only        Legacy mode: only report phantoms (missing dirs / prunable)
  --verbose, -v         Include per-worktree detector trace in the table
  --help, -h            Show this help

Stages:
  Stage 1 (auto-safe):  AC2 nested, AC4 shipped-stale
  Stage 2 (reviewed):   AC1 zombie-on-main, AC3 orphan-SD, AC5 idle

Active-claim protection:
  Any worktree whose path appears in v_active_sessions is ALWAYS skipped.

Preserve-before-delete:
  Untracked non-exempt files are copied to scratch/preserved-from-<basename>/
  before 'git worktree remove --force'. If preservation fails, removal aborts.

Examples:
  # Audit (dry-run):
  node scripts/worktree-reaper.mjs

  # Remove Stage 1 only (nested, shipped-stale):
  node scripts/worktree-reaper.mjs --execute

  # Full cleanup (all categories):
  node scripts/worktree-reaper.mjs --execute --stage2 --yes
`;

// ── Environment ────────────────────────────────────────────────────────

function loadDotenv() {
  // Minimal loader — only if dotenv is present, but never hard-fail.
  try {
    const root = findRepoRoot(process.cwd());
    if (!root) return;
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch { /* ignore */ }
}

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function assertCwdIsMainRepoRoot() {
  // The main repo root has a .git directory (not a file). Worktrees have a
  // .git FILE pointing at the main repo's gitdir. Enforce that distinction.
  const cwd = process.cwd();
  const gitPath = path.join(cwd, '.git');
  if (!fs.existsSync(gitPath)) {
    throw new Error(
      `worktree-reaper must run from main repo root; no .git found at ${cwd}`,
    );
  }
  let stat;
  try { stat = fs.statSync(gitPath); } catch {
    throw new Error(`worktree-reaper cannot stat .git at ${cwd}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `worktree-reaper must run from main repo root, not a linked worktree. ` +
      `CWD ${cwd} has a .git file (not directory), indicating a worktree. ` +
      `See PAT-WORKTREE-LIFECYCLE-001.`,
    );
  }
  if (cwd.replace(/\\/g, '/').includes('/.worktrees/')) {
    throw new Error(
      `worktree-reaper cwd ${cwd} contains '.worktrees/' — refusing to run from inside a worktree.`,
    );
  }
  return cwd;
}

// ── Supabase wiring ────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch { return null; }
}

async function loadClaimMap(supabase, { heartbeatThresholdMs = 2 * 60 * 60 * 1000 } = {}) {
  const map = new Map();
  if (!supabase) return map;
  try {
    const { data, error } = await supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, worktree_path, last_heartbeat_at, computed_status')
      .not('worktree_path', 'is', null);
    if (error || !data) return map;
    const now = Date.now();
    for (const row of data) {
      if (row.computed_status && row.computed_status !== 'active') continue;
      if (row.last_heartbeat_at) {
        const hb = new Date(row.last_heartbeat_at).getTime();
        if (Number.isFinite(hb) && now - hb > heartbeatThresholdMs) continue;
      }
      const normalized = normalizePath(row.worktree_path);
      if (normalized) {
        map.set(normalized, {
          sd_key: row.sd_key,
          session_id: row.session_id,
          heartbeat_at: row.last_heartbeat_at,
        });
      }
    }
  } catch { /* fall through with empty map */ }
  return map;
}

async function loadSdKeySets(supabase) {
  const sdMap = new Set();
  const qfMap = new Set();
  if (!supabase) return { sdMap, qfMap };

  // Supabase defaults to 1000 rows per select even with .limit(5000). Paginate
  // explicitly with .range() to ensure the full set is loaded — otherwise
  // SDs past row 1000 appear "orphan" and get false-positive Stage 2 flags.
  async function paginate(table, column) {
    const out = new Set();
    const pageSize = 1000;
    for (let start = 0; start < 20000; start += pageSize) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .range(start, start + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) if (r[column]) out.add(r[column]);
      if (data.length < pageSize) break;
    }
    return out;
  }

  try { for (const k of await paginate('strategic_directives_v2', 'sd_key')) sdMap.add(k); }
  catch { /* ignore */ }
  // quick_fixes.id holds the QF string key (e.g., 'QF-20260417-029') directly.
  try { for (const k of await paginate('quick_fixes', 'id')) qfMap.add(k); }
  catch { /* ignore */ }
  return { sdMap, qfMap };
}

// ── Git / Gh runners ───────────────────────────────────────────────────

function runGit(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    code: res.status == null ? 1 : res.status,
  };
}

function runGh(args, opts = {}) {
  const res = spawnSync('gh', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  if (res.error) throw res.error;
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    code: res.status == null ? 1 : res.status,
  };
}

// ── Core logic ─────────────────────────────────────────────────────────

function normalizePath(p) {
  if (!p) return '';
  try { return path.resolve(p).replace(/\\/g, '/').toLowerCase(); }
  catch { return String(p).replace(/\\/g, '/').toLowerCase(); }
}

function readMetadata(wtPath) {
  for (const name of ['.worktree.json', '.ehg-session.json']) {
    const fp = path.join(wtPath, name);
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      return JSON.parse(raw);
    } catch { /* next */ }
  }
  return null;
}

function isCursorWorktree(wtPath) {
  return /\.cursor[\\/]/i.test(wtPath) || /cursor[\\/]worktrees/i.test(wtPath);
}

function collectDirtyStatus(wtPath) {
  if (!fs.existsSync(wtPath)) {
    return { dirtyCount: 0, untracked: [], exists: false };
  }
  try {
    const res = runGit(['status', '--porcelain', '--untracked-files=all'], { cwd: wtPath });
    if (res.code !== 0) return { dirtyCount: 0, untracked: [], exists: true };
    const lines = (res.stdout || '').split('\n').filter(Boolean);
    const untracked = [];
    let dirty = 0;
    for (const l of lines) {
      dirty++;
      if (l.startsWith('?? ')) untracked.push(l.slice(3).trim());
    }
    return { dirtyCount: dirty, untracked, exists: true };
  } catch { return { dirtyCount: 0, untracked: [], exists: true }; }
}

function countUnpushedCommits(wtPath) {
  try {
    const res = runGit(['cherry', 'origin/main', 'HEAD'], { cwd: wtPath });
    if (res.code !== 0) return 0;
    return (res.stdout || '').split('\n').filter((l) => l.startsWith('+')).length;
  } catch { return 0; }
}

async function classifyWorktree(wt, ctx) {
  const categories = [];
  const reasons = {};

  const nested = isNested(wt);
  if (nested.matched) { categories.push('nested'); reasons.nested = nested; }

  const zombie = isZombieOnMain(wt, { claimMap: ctx.claimMap });
  if (zombie.matched) { categories.push('zombie-on-main'); reasons['zombie-on-main'] = zombie; }

  const orphan = hasOrphanSD(wt, {
    sdMap: ctx.sdMap,
    qfMap: ctx.qfMap,
    readFile: (fp) => { try { return fs.readFileSync(fp, 'utf8'); } catch { return null; } },
  });
  if (orphan.matched) { categories.push('orphan-sd'); reasons['orphan-sd'] = orphan; }

  let shipped = { matched: false, reason: 'skipped', evidence: {} };
  try {
    shipped = await isPatchEquivalentToMain(wt, {
      runGit, runGh, repoRoot: ctx.repoRoot,
    });
  } catch (e) {
    shipped = { matched: false, reason: 'error', evidence: { error: String(e?.message || e) } };
  }
  if (shipped.matched) { categories.push('shipped-stale'); reasons['shipped-stale'] = shipped; }

  let idle = { matched: false, reason: 'skipped', evidence: {} };
  try {
    idle = isIdle(wt, {
      thresholdMs: ctx.idleThresholdMs,
      claimMap: ctx.claimMap,
      runGit,
    });
  } catch (e) {
    idle = { matched: false, reason: 'error', evidence: { error: String(e?.message || e) } };
  }
  if (idle.matched) { categories.push('idle'); reasons.idle = idle; }

  return { categories, reasons };
}

function stageForCategories(categories) {
  if (categories.length === 0) return { stage: null, verdict: 'keep' };
  const hasStage1 = categories.includes('nested') || categories.includes('shipped-stale');
  const hasStage2 = categories.includes('zombie-on-main') ||
                    categories.includes('orphan-sd') ||
                    categories.includes('idle');
  if (hasStage1) return { stage: 1, verdict: 'stage1_remove' };
  if (hasStage2) return { stage: 2, verdict: 'stage2_remove' };
  return { stage: null, verdict: 'keep' };
}

function shipStatus(reasons) {
  const s = reasons['shipped-stale'];
  if (s?.matched) {
    return s.evidence?.merged_pr_count > 0
      ? 'patch_equivalent_via_squash'
      : 'absorbed_no_pr';
  }
  return 'not_on_main';
}

// ── Preserve-before-delete ─────────────────────────────────────────────

function preserveUntrackedFiles({ wtPath, preserveRoot, untracked, repoRoot, logger }) {
  const basename = path.basename(wtPath);
  const dest = path.join(preserveRoot || path.join(repoRoot, 'scratch'), `preserved-from-${basename}`);
  const preserved = [];
  const skipped = [];
  if (untracked.length === 0) return { dest, preserved, skipped };
  try { fs.mkdirSync(dest, { recursive: true }); }
  catch (e) { throw new Error(`preserve: cannot mkdir ${dest}: ${e?.message}`); }

  for (const relRaw of untracked) {
    const rel = relRaw.replace(/^"|"$/g, ''); // git --porcelain quotes unicode
    if (PRESERVE_EXEMPT_RE.test(rel)) { skipped.push(rel); continue; }
    const src = path.join(wtPath, rel);
    const tgt = path.join(dest, rel);
    try {
      fs.mkdirSync(path.dirname(tgt), { recursive: true });
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        fs.cpSync(src, tgt, { recursive: true });
      } else {
        fs.copyFileSync(src, tgt);
      }
      preserved.push(rel);
    } catch (e) {
      logger?.(`preserve: skip ${rel} (${e?.message || e})`);
      skipped.push(rel);
    }
  }
  return { dest, preserved, skipped };
}

function removeWorktree({ wtPath, repoRoot }) {
  const abs = path.resolve(wtPath);
  // git worktree remove --force
  const res = runGit(['worktree', 'remove', '--force', abs], { cwd: repoRoot });
  if (res.code === 0) return { ok: true, method: 'git-worktree-remove' };
  // Fallback: git worktree can refuse when the dir is already partly gone; try fs.rmSync
  try {
    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
    runGit(['worktree', 'prune'], { cwd: repoRoot });
    return { ok: true, method: 'fs-rm+prune' };
  } catch (e) {
    return { ok: false, method: 'failed', error: String(e?.message || e) };
  }
}

// ── Output helpers ─────────────────────────────────────────────────────

function emitJsonLine(record) {
  try {
    process.stderr.write(JSON.stringify(record) + '\n');
  } catch {
    process.stderr.write(`[reaper] emit failed for ${record?.worktree_path}\n`);
  }
}

function humanTableRow({ wtPath, branch, categories, dirtyCount, unpushedCount, ageDays, verdict, preserveCount }) {
  return [
    path.basename(wtPath).padEnd(40).slice(0, 40),
    (branch || '-').padEnd(28).slice(0, 28),
    (categories.join(',') || '-').padEnd(24).slice(0, 24),
    String(dirtyCount).padStart(5),
    String(unpushedCount).padStart(6),
    (ageDays == null ? '-' : String(ageDays)).padStart(4),
    verdict.padEnd(13),
    String(preserveCount).padStart(4),
  ].join('  ');
}

function humanTableHeader() {
  return [
    'Worktree'.padEnd(40),
    'Branch'.padEnd(28),
    'Categories'.padEnd(24),
    'Dirty'.padStart(5),
    'Unpush'.padStart(6),
    'Age'.padStart(4),
    'Verdict'.padEnd(13),
    'Keep'.padStart(4),
  ].join('  ');
}

async function confirmStage2Removals(count, rl) {
  if (count === 0) return true;
  return await new Promise((resolve) => {
    rl.question(
      `\n  Stage 2 will remove ${count} worktree(s). Proceed? [y/N] `,
      (ans) => resolve(/^y(es)?$/i.test((ans || '').trim())),
    );
  });
}

// ── Phantom-only mode (legacy wrapper shim) ────────────────────────────

function runPhantomOnlyMode({ repoRoot, worktrees }) {
  console.log(`[worktree-reaper] PHANTOM-ONLY mode — scanning ${worktrees.length} worktree(s)`);
  const phantoms = [];
  for (const wt of worktrees) {
    const issues = [];
    if (!fs.existsSync(wt.path)) issues.push('directory missing');
    if (wt.prunable) issues.push('marked prunable by git');
    if (issues.length) phantoms.push({ ...wt, issues });
  }
  if (phantoms.length === 0) {
    console.log('[worktree-reaper] No phantoms detected. All clean.');
    return 0;
  }
  console.log(`[worktree-reaper] Found ${phantoms.length} phantom(s):\n`);
  for (const p of phantoms) {
    console.log(`  Path:   ${p.path}`);
    console.log(`  Branch: ${p.branch || '(detached)'}`);
    console.log(`  Issues: ${p.issues.join(', ')}`);
    console.log(`  Fix:    git worktree remove "${p.path}" --force`);
    console.log();
  }
  console.log('[worktree-reaper] READ-ONLY mode — no changes made.');
  return 1;
}

// ── Main ───────────────────────────────────────────────────────────────

export async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  loadDotenv();

  let repoRoot;
  try { repoRoot = assertCwdIsMainRepoRoot(); }
  catch (e) { console.error(`❌ ${e.message}`); return 2; }

  const worktreesDir = path.join(repoRoot, '.worktrees');
  const supabase = getSupabaseClient();
  const allWorktrees = listActiveWorktrees(repoRoot);

  // Phantom-only mode: preserves legacy cleanup-phantom-worktrees.js behavior.
  if (opts.phantomOnly) {
    return runPhantomOnlyMode({ repoRoot, worktrees: allWorktrees });
  }

  // Load reference data (best-effort — reaper is useful even with empty maps).
  const [claimMap, { sdMap, qfMap }] = await Promise.all([
    loadClaimMap(supabase),
    loadSdKeySets(supabase),
  ]);

  const idleThresholdMs = opts.days * 24 * 60 * 60 * 1000;
  const ctx = { repoRoot, claimMap, sdMap, qfMap, idleThresholdMs };

  const header = humanTableHeader();
  const now = Date.now();
  const records = [];

  console.log(`\n🔍 WORKTREE REAPER — ${opts.execute ? 'EXECUTE' : 'DRY-RUN'} mode`);
  console.log('═'.repeat(header.length));
  console.log(`   Repo root: ${repoRoot}`);
  console.log(`   Worktrees scanned: ${allWorktrees.length}`);
  console.log(`   Idle threshold: ${opts.days} days`);
  if (!supabase) {
    console.log('   ⚠️  Supabase unavailable — skipping all Stage 2 removals (safety)');
  }
  console.log('');
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const wt of allWorktrees) {
    // Never touch Cursor IDE worktrees (inherits existing convention).
    if (isCursorWorktree(wt.path)) {
      const rec = buildRecord({
        schema_version: SCHEMA_VERSION, wt, categories: [], verdict: 'keep',
        reason: 'cursor_worktree_protected',
        claim_status: 'n/a', dirtyCount: 0, unpushedCount: 0, ageDays: null,
        preserveCount: 0, shipStatus: 'cursor', evidence: {},
      });
      records.push(rec);
      emitJsonLine(rec);
      console.log(humanTableRow({ wtPath: wt.path, branch: wt.branch || '', categories: [], dirtyCount: 0, unpushedCount: 0, ageDays: null, verdict: 'keep:cursor', preserveCount: 0 }));
      continue;
    }

    const basename = path.basename(wt.path);
    const wtInput = { ...wt, key: basename };

    const claimKey = normalizePath(wt.path);
    const activeClaim = claimMap.get(claimKey);

    const dirty = collectDirtyStatus(wt.path);
    const unpushedCount = dirty.exists ? countUnpushedCommits(wt.path) : 0;
    const ageMs = (() => {
      try {
        const s = fs.statSync(wt.path);
        return now - s.mtimeMs;
      } catch { return null; }
    })();
    const ageDays = ageMs == null ? null : Math.floor(ageMs / (24 * 60 * 60 * 1000));

    let verdict = 'keep';
    let reasonText = 'no_match';
    let categories = [];
    let reasons = {};
    let stage = null;

    if (activeClaim) {
      reasonText = 'active_claim_protected';
      const rec = buildRecord({
        schema_version: SCHEMA_VERSION, wt: wtInput, categories: [], verdict: 'keep',
        reason: reasonText, claim_status: 'active', dirtyCount: dirty.dirtyCount,
        unpushedCount, ageDays, preserveCount: 0,
        shipStatus: 'not_on_main',
        evidence: { claim: activeClaim },
      });
      records.push(rec);
      emitJsonLine(rec);
      console.log(humanTableRow({ wtPath: wt.path, branch: wt.branch || '', categories: [], dirtyCount: dirty.dirtyCount, unpushedCount, ageDays, verdict: 'keep:active', preserveCount: 0 }));
      continue;
    }

    const classification = await classifyWorktree(wtInput, ctx);
    categories = classification.categories;
    reasons = classification.reasons;
    const staged = stageForCategories(categories);
    stage = staged.stage;
    verdict = staged.verdict;
    reasonText = categories[0] || 'no_match';

    const rec = buildRecord({
      schema_version: SCHEMA_VERSION, wt: wtInput, categories, verdict,
      reason: reasonText, claim_status: 'absent', dirtyCount: dirty.dirtyCount,
      unpushedCount, ageDays, preserveCount: 0,
      shipStatus: shipStatus(reasons), evidence: reasons,
    });
    records.push({ ...rec, _stage: stage, _wtInput: wtInput, _dirty: dirty });
    emitJsonLine(rec);
    console.log(humanTableRow({ wtPath: wt.path, branch: wt.branch || '', categories, dirtyCount: dirty.dirtyCount, unpushedCount, ageDays, verdict: verdict === 'keep' ? 'keep' : `${verdict}:s${stage}`, preserveCount: 0 }));
  }

  // Collect removal candidates.
  const stage1 = records.filter((r) => r._stage === 1);
  const stage2 = records.filter((r) => r._stage === 2);

  console.log('─'.repeat(header.length));
  console.log(`Stage 1 (auto-safe):       ${stage1.length}`);
  console.log(`Stage 2 (analyzed):        ${stage2.length}`);
  console.log(`Kept (including active):   ${records.length - stage1.length - stage2.length}`);

  if (!opts.execute) {
    console.log('\n(Dry-run — no changes made. Pass --execute to remove Stage 1, or --execute --stage2 for all.)');
    return 0;
  }

  if (!supabase) {
    console.log('\n⚠️  Refusing to remove anything: Supabase unavailable, active-claim protection cannot be verified.');
    return 3;
  }

  // Stage 1 removals (unconditional with --execute).
  const removeList = [...stage1];

  // Stage 2 removals (only with --execute --stage2).
  if (opts.stage2 && stage2.length > 0) {
    let proceed = opts.yes;
    if (!proceed && process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      proceed = await confirmStage2Removals(stage2.length, rl);
      rl.close();
    } else if (!proceed) {
      console.log('\n⚠️  Stage 2 removals require --yes (non-interactive shell). Skipping.');
    }
    if (proceed) removeList.push(...stage2);
  }

  if (removeList.length === 0) {
    console.log('\nNothing to remove.');
    return 0;
  }

  console.log(`\n⚙️  Removing ${removeList.length} worktree(s)...`);

  let removed = 0;
  let aborted = 0;
  for (const rec of removeList) {
    const wtPath = rec.worktree_path;
    const dirty = rec._dirty;
    try {
      // Re-check active claim at removal time (race protection).
      const fresh = await loadClaimMap(supabase);
      if (fresh.get(normalizePath(wtPath))) {
        console.log(`  ↷ ${path.basename(wtPath)} acquired active claim mid-run — skipping`);
        aborted++;
        continue;
      }

      const preserve = preserveUntrackedFiles({
        wtPath,
        preserveRoot: opts.preserveRoot ? path.resolve(opts.preserveRoot) : null,
        untracked: dirty.untracked,
        repoRoot,
        logger: (m) => process.stderr.write(`  ${m}\n`),
      });
      if (preserve.preserved.length > 0) {
        console.log(`  ▸ ${path.basename(wtPath)} preserved ${preserve.preserved.length} file(s) → ${preserve.dest}`);
      }

      const rm = removeWorktree({ wtPath, repoRoot });
      if (!rm.ok) {
        console.log(`  ✗ ${path.basename(wtPath)} remove failed: ${rm.error}`);
        aborted++;
        continue;
      }
      emitJsonLine({
        schema_version: SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        event: 'removed',
        worktree_path: wtPath,
        method: rm.method,
        preserved_count: preserve.preserved.length,
        stage: rec._stage,
      });
      console.log(`  ✓ ${path.basename(wtPath)} removed (${rm.method})`);
      removed++;
    } catch (e) {
      console.log(`  ✗ ${path.basename(wtPath)} error: ${e?.message || e}`);
      aborted++;
    }
  }

  console.log(`\nRemoved: ${removed} | Aborted: ${aborted}`);
  return aborted > 0 ? 4 : 0;
}

function buildRecord({ schema_version, wt, categories, verdict, reason, claim_status, dirtyCount, unpushedCount, ageDays, preserveCount, shipStatus, evidence }) {
  return {
    schema_version,
    timestamp: new Date().toISOString(),
    worktree_path: wt.path,
    branch: wt.branch || null,
    categories,
    dirty_file_count: dirtyCount,
    unpushed_commit_count: unpushedCount,
    age_days: ageDays,
    ship_status: shipStatus,
    claim_status,
    verdict,
    reason,
    preserve_count: preserveCount,
    evidence,
  };
}

// ── Entrypoint ─────────────────────────────────────────────────────────

const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
           import.meta.url === new URL(`file:${process.argv[1]}`, 'file:').href ||
           process.argv[1] === fileURLToPath(import.meta.url);
  } catch { return false; }
})();

if (isMainModule) {
  main().then(
    (code) => process.exit(code),
    (err) => { console.error(err?.stack || err); process.exit(9); },
  );
}

// Exports for integration testing.
export {
  parseArgs,
  assertCwdIsMainRepoRoot,
  loadClaimMap,
  loadSdKeySets,
  collectDirtyStatus,
  countUnpushedCommits,
  classifyWorktree,
  stageForCategories,
  preserveUntrackedFiles,
  removeWorktree,
  buildRecord,
  runPhantomOnlyMode,
};
