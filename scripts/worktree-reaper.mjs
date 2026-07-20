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
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

import { listActiveWorktrees, countActiveWorktrees, MAX_WORKTREE_COUNT } from '../lib/worktree-quota.js';
import { safeRecursiveRm, safeRecursiveCp, removeWorktreeViaGit } from '../lib/worktree-manager.js';
// SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 (FR-1/FR-4): reclaim unregistered .worktrees/ dirs.
import { runOrphanSweep } from '../lib/worktree-reaper/orphan-sweep.js';
// QF-20260710-432: last-line live-claim guard — a live-claimed worktree is never
// reaped regardless of commit count (Alpha-2 incident: zero-commit mid-PLAN reap).
import { liveClaimBlocksRemoval } from '../lib/worktree-reaper/live-claim-guard.js';
import { heartbeatResidencyBlocksRemoval } from '../lib/worktree-reaper/residency-guard.js';
import { hasReapEligibleMarker, readReapEligibleMarker } from '../lib/worktree-reaper/reap-eligible-marker.js';
// SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001: single-source reapability helpers.
// These three used to be defined locally below; the canonical home is now
// lib/worktree-reapability.js so every removal path shares one implementation.
import { normalizePath, collectDirtyStatus, countUnpushedCommits } from '../lib/worktree-reapability.js';
import {
  isZombieOnMain,
  isNested,
  hasOrphanSD,
  isPatchEquivalentToMain,
  isIdle,
} from '../lib/worktree-reaper/detectors.js';
// SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001: resolve every registered worktree pool (EHG_Engineer +
// ehg + any other registered app) and compute per-pool cap status, so --all-pools reaps each pool.
import { resolveRegisteredPools, computePoolCapStatus } from '../lib/worktree-reaper/pools.js';

const SCHEMA_VERSION = '1.0';
const DEFAULT_IDLE_DAYS = 7;

// SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001: terminal SD statuses whose worktrees
// are pure cleanup. A worktree whose basename sd_key resolves to one of these is
// reclaimable regardless of the 7-day idle gate (Stage-0, age-agnostic) — but ONLY
// when it has no active claim and is NOT in activeSdSet.
const TERMINAL_SD_STATUSES = ['completed', 'cancelled', 'archived'];
// SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001: status sets for quick_fixes, parallel to the SD sets.
// QF worktrees live at .worktrees/qf/<qf_id>; their basename (the qf_id) starts with 'QF-' and is
// NEVER present in activeSdSet/terminalSdSet (those hold sd_keys only). Without these sets a QF
// worktree was reaped by mere EXISTENCE: an open/in_progress QF could be flagged shipped-stale and
// auto-removed under --execute (data loss of unpushed work). ACTIVE_QF protects open/in_progress
// QFs (mirrors activeSdSet); TERMINAL_QF lets Stage-0 reclaim completed/cancelled QFs age-agnostically
// (mirrors terminalSdSet). 'escalated' is intentionally in NEITHER set (the work moved to an SD), so
// such a worktree falls through to the normal claim/age handling.
const ACTIVE_QF_STATUSES = ['open', 'in_progress'];
const TERMINAL_QF_STATUSES = ['completed', 'cancelled'];
// Pool-utilization threshold at/above which the watchdog proactively runs Stage-0.
const DEFAULT_POOL_THRESHOLD = 0.8;
const PRESERVE_EXEMPT_RE = /^(tmp-|scratch-|\.claude[\\/]|\.workflow-patterns|\.worktree\.json$|\.ehg-session\.json$)/;

// ── CLI parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    execute: args.includes('--execute') || args.includes('-e'),
    stage0: args.includes('--stage0'),
    stage2: args.includes('--stage2'),
    yes: args.includes('--yes'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    phantomOnly: args.includes('--phantom-only'),
    // SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001: --orphan-sweep = run ONLY the orphan sweep
    // (standalone, for manual inspection); --no-orphan-sweep = skip the sweep that is
    // otherwise folded into the normal flow (so the hourly tick includes it).
    orphanSweep: args.includes('--orphan-sweep'),
    noOrphanSweep: args.includes('--no-orphan-sweep'),
    // SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001: reap EVERY registered pool (spawns a per-pool
    // --repo child so each pool keeps the full single-repo safety), not just the current repo.
    allPools: args.includes('--all-pools'),
    help: args.includes('--help') || args.includes('-h'),
    days: DEFAULT_IDLE_DAYS,
    threshold: DEFAULT_POOL_THRESHOLD,
    preserveRoot: null,
    repo: null,
  };
  const daysIdx = args.findIndex((a) => a === '--days');
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    const n = parseInt(args[daysIdx + 1], 10);
    if (Number.isFinite(n) && n > 0) opts.days = n;
  }
  const thrIdx = args.findIndex((a) => a === '--threshold');
  if (thrIdx !== -1 && args[thrIdx + 1]) {
    const n = parseFloat(args[thrIdx + 1]);
    if (Number.isFinite(n) && n > 0 && n <= 1) opts.threshold = n;
  }
  const prIdx = args.findIndex((a) => a === '--preserve-root');
  if (prIdx !== -1 && args[prIdx + 1]) {
    opts.preserveRoot = args[prIdx + 1];
  }
  const repoIdx = args.findIndex((a) => a === '--repo');
  if (repoIdx !== -1 && args[repoIdx + 1]) {
    opts.repo = args[repoIdx + 1];
  }
  return opts;
}

const HELP = `
Formalized worktree reaper — tiered remediation

Usage:
  node scripts/worktree-reaper.mjs [options]

Options:
  --execute, -e         Remove Stage 1 worktrees (default: dry-run)
  --stage0              Stage-0 mode: also reclaim worktrees whose SD is TERMINAL
                        (completed/cancelled/archived) regardless of idle age.
                        Combine with --execute to actually remove them.
  --execute --stage2    Also remove Stage 2 worktrees (zombie/orphan/idle)
  --threshold <0..1>    Pool-utilization threshold for the watchdog (default: ${DEFAULT_POOL_THRESHOLD})
  --yes                 Skip interactive confirmation for Stage 2
  --days <n>            Idle threshold in days (default: ${DEFAULT_IDLE_DAYS})
  --preserve-root <p>   Override preserve destination root (default: scratch/preserved-from-*)
  --repo <path>         Run against a different repo (chdir before scanning); useful when
                        the target repo's quota is full but you can't easily cd into it
  --all-pools           Reap EVERY registered worktree pool (EHG_Engineer + ehg + any other
                        registered app) by spawning a per-pool --repo child; loudly warns when
                        any pool is at/above the cap threshold. Passes through the other flags.
  --phantom-only        Legacy mode: only report phantoms (missing dirs / prunable)
  --orphan-sweep        Standalone: ONLY reclaim ORPHANED .worktrees/ dirs (on disk but
                        NOT in 'git worktree list'). Dry-run unless --execute. Junction-safe.
  --no-orphan-sweep     Skip the orphan sweep that is otherwise folded into a normal run.
  --verbose, -v         Include per-worktree detector trace in the table
  --help, -h            Show this help

Stages:
  Stage 0 (terminal-SD): worktree sd_key resolves to completed/cancelled/archived
                         SD — reclaimed age-agnostically (opt-in via --stage0).
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

function loadDotenvFromDir(startDir) {
  // Minimal loader — only if dotenv is present, but never hard-fail.
  // Existing process.env values win (first-loader-wins), so callers can layer
  // multiple .env sources by calling this in priority order.
  try {
    const root = findRepoRoot(startDir);
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

function loadDotenv() {
  loadDotenvFromDir(process.cwd());
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

// QF-20260510-WT-CLAIM-PROTECT-001: v_active_sessions does NOT expose a
// worktree_path column; the prior query referenced it and silently swallowed
// the PostgrestError, leaving the claim map empty so every active session was
// classified claim_status=absent and eligible for stage1_remove. Anyone
// running --execute would have destroyed actively-claimed worktrees with
// dirty files. Now we (a) select only schema-correct columns, (b) FAIL-LOUD
// on supabase errors so silent corruption is impossible, and (c) derive the
// worktree path from the .worktrees/<sd_key> | .worktrees/qf/<qf_id>
// convention plus a current_branch fallback (handles stale-claim rows where
// the session moved branches without releasing). Pattern witness:
// PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (17th).
async function loadClaimMap(supabase, { heartbeatThresholdMs = 2 * 60 * 60 * 1000, repoRoot = process.cwd() } = {}) {
  const map = new Map();
  if (!supabase) return map;
  // SD-FDBK-FIX-WORKTREE-REAPER-DESTROYED-001 (FR-4, DATABASE 302bb2c7): do NOT gate on
  // computed_status='active'. computed_status flips to 'idle' the instant a live session's
  // sd_key reads NULL (a claim clear→reset window) and to 'stale' at heartbeat>600s — both
  // would DROP a still-live session's row from the claim map, un-protecting its worktree.
  // Select every non-released session (the view already excludes released) and filter for
  // liveness by the heartbeat threshold in the loop below.
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, qf_id, current_branch, heartbeat_at, computed_status')
    .or('sd_key.not.is.null,qf_id.not.is.null');
  if (error) {
    throw new Error(
      `[reaper] loadClaimMap query failed: ${error.message}` +
      (error.code ? ` (code=${error.code})` : '') +
      ' — refusing to proceed; silent failure here causes active-claim destruction.'
    );
  }
  if (!data) return map;
  const worktreesDir = path.join(repoRoot, '.worktrees');
  const now = Date.now();
  function addCandidate(wtPath, info) {
    const normalized = normalizePath(wtPath);
    if (normalized) map.set(normalized, info);
  }
  function branchToBasename(branch) {
    if (!branch) return null;
    const m = String(branch).match(/^(?:refs\/heads\/)?(?:feat|qf|fix|chore|hotfix)\/(.+)$/);
    return m ? m[1] : null;
  }
  for (const row of data) {
    // FR-4: liveness is decided by heartbeat freshness ONLY (not computed_status), so a
    // churning-but-live session (momentarily 'idle'/'stale') is retained and protected.
    if (row.heartbeat_at) {
      const hb = new Date(row.heartbeat_at).getTime();
      if (Number.isFinite(hb) && now - hb > heartbeatThresholdMs) continue;
    }
    const info = {
      sd_key: row.sd_key,
      qf_id: row.qf_id,
      session_id: row.session_id,
      heartbeat_at: row.heartbeat_at,
    };
    if (row.sd_key) {
      // FR-2: a self-claimed QF lives in sd_key (qf_id NULL). Derive BOTH the flat
      // .worktrees/<key> AND, for a QF-shaped key, the real typed .worktrees/qf/<key>.
      addCandidate(path.join(worktreesDir, row.sd_key), info);
      if (/^QF-/i.test(row.sd_key)) addCandidate(path.join(worktreesDir, 'qf', row.sd_key), info);
    }
    if (row.qf_id) addCandidate(path.join(worktreesDir, 'qf', row.qf_id), info);
    const branchBase = branchToBasename(row.current_branch);
    if (branchBase) {
      if (/^QF-/.test(branchBase)) addCandidate(path.join(worktreesDir, 'qf', branchBase), info);
      else addCandidate(path.join(worktreesDir, branchBase), info);
    }
  }
  return map;
}

// ── SD-FDBK-FIX-WORKTREE-REAPER-LIVE-001: live-claim guard helpers ─────
//
// Incident (2026-06-12 ~19:45Z, pid 12704): stage1 removed TWO live worktrees.
// (1) path.basename(wt.path) is NOT the sd_key for custom-path worktrees
//     (wt-*, ../EHG_Engineer-*), so the active-SD suppress guard missed them
//     and loadClaimMap's path-keyed map read claim_status=absent.
// (2) the suppress allowlist (draft/active/in_progress) missed
//     pending_approval — an SD mid-LEAD-FINAL-APPROVAL was reaped, producing a
//     ghost completion.
// keyFromWorktree resolves the SD/QF key from the BRANCH first (path-shape-
// agnostic); loadClaimedKeySet collects claim-held keys from BOTH claim sides.

/** Resolve the SD/QF key for a worktree: branch name first, basename fallback. */
function keyFromWorktree(wt) {
  const m = String(wt?.branch || '').match(/^(?:refs\/heads\/)?(?:feat|qf|fix|chore|hotfix)\/(.+)$/);
  if (m && m[1]) return m[1];
  return path.basename(wt?.path || '');
}

/**
 * Claim-held SD/QF keys from BOTH claim sides:
 *   - claude_sessions (via v_active_sessions): sd_key + qf_id of active sessions
 *   - strategic_directives_v2.claiming_session_id IS NOT NULL (the SD-side claim)
 * Fail-safe per TR-2: on any error the set stays partial/empty — an empty set
 * never WIDENS removal because the non-terminal guard still protects known SDs.
 */
async function loadClaimedKeySet(supabase) {
  const set = new Set();
  if (!supabase) return set;
  try {
    // FR-4: identity + non-released, not computed_status='active' (which drops a
    // churning-but-live session whose sd_key momentarily reads NULL → 'idle').
    const { data } = await supabase
      .from('v_active_sessions')
      .select('sd_key, qf_id, computed_status')
      .or('sd_key.not.is.null,qf_id.not.is.null');
    for (const r of data || []) {
      if (r.sd_key) set.add(r.sd_key);
      if (r.qf_id) set.add(r.qf_id);
    }
  } catch { /* fail-safe */ }
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: was .limit(2000), above the
    // PostgREST 1000-row cap (silently clamped anyway). This is a live-claim guard set — an
    // undercounted claimedKeySet could wrongly leave a claimed SD's worktree unprotected.
    const data = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id')
      .not('claiming_session_id', 'is', null)
      .order('sd_key', { ascending: true }));
    for (const r of data) if (r.sd_key) set.add(r.sd_key);
  } catch { /* fail-safe */ }
  return set;
}

/**
 * Pure stage1 protection decision for a shipped-stale match (exported for
 * regression tests — both 2026-06-12 incident shapes pin through this).
 * Returns { protect, advisory, reason, key }.
 */
function decideShippedStaleAction(wt, shipped, ctx) {
  const key = keyFromWorktree(wt);
  const isQf = key.startsWith('QF-');
  const claimHeld = Boolean(ctx.claimedKeySet && ctx.claimedKeySet.has(key));
  const knownNonTerminal = isQf
    ? Boolean(ctx.qfMap && ctx.qfMap.has(key) && !(ctx.terminalQfSet && ctx.terminalQfSet.has(key)))
    : Boolean(ctx.sdMap && ctx.sdMap.has(key) && !(ctx.terminalSdSet && ctx.terminalSdSet.has(key)));
  const legacyActive = isQf
    ? Boolean(ctx.activeQfSet && ctx.activeQfSet.has(key))
    : Boolean(ctx.activeSdSet && ctx.activeSdSet.has(key));
  if (claimHeld || knownNonTerminal || legacyActive) {
    return {
      protect: true, advisory: false, key,
      reason: claimHeld ? 'claim-held' : (knownNonTerminal ? 'non-terminal-status' : (isQf ? 'active-qf-protected' : 'active-sd-protected')),
    };
  }
  // git cherry "absorbed" with zero merged PRs is known-unreliable under
  // squash merges — advisory-only, never stage1 authority on its own…
  if ((shipped?.evidence?.merged_pr_count ?? 0) === 0) {
    // …EXCEPT when the SD/QF is TERMINAL in the DB (completed/cancelled/archived). That is
    // AUTHORITATIVE ship-evidence — in LEO, status=completed implies the PR merged — so it overrides
    // the unreliable cherry heuristic. Without this, squash-merged completed worktrees were kept
    // advisory-only and ACCUMULATED toward the DUTY-1 pool stall (live 2026-06-15: 16/20 with 4
    // completed SDs held as keep/no_match). The claim-held / non-terminal / active guards above ran
    // first (terminalSet ⟂ activeSet), so a terminal key reaching here holds NO active claim.
    // SD-REFILL-00RMNAS7.
    const isTerminalShipped = isQf
      ? Boolean(ctx.terminalQfSet && ctx.terminalQfSet.has(key))
      : Boolean(ctx.terminalSdSet && ctx.terminalSdSet.has(key));
    if (isTerminalShipped) {
      return { protect: false, advisory: false, key, reason: 'terminal-status authoritative ship-evidence (completion implies merge; cherry-heuristic overridden)' };
    }
    return { protect: false, advisory: true, key, reason: 'absorbed_no_pr cherry heuristic is advisory-only (unreliable under squash merges)' };
  }
  return { protect: false, advisory: false, key, reason: 'merged-pr-backed' };
}

async function loadSdKeySets(supabase) {
  const sdMap = new Set();
  const qfMap = new Set();
  // SD-FDBK-ENH-WORKTREE-REAPER-MJS-001: always return activeSdSet (empty when no supabase)
  // so callers/ctx never see it undefined.
  // SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001: also return terminalSdSet (sd_keys whose
  // status IN completed/cancelled/archived) so Stage-0 can reclaim them age-agnostically.
  if (!supabase) return { sdMap, qfMap, activeSdSet: new Set(), terminalSdSet: new Set(), activeQfSet: new Set(), terminalQfSet: new Set() };

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

  // SD-FDBK-ENH-WORKTREE-REAPER-MJS-001: sd_keys of SDs still being ACTIVELY worked. The
  // shipped-stale reaper must never git-remove a live SD's worktree: a freshly sd-start-created
  // branch has no commits yet so it reads as patch-equivalent-to-main (shipped-stale), and a
  // heartbeat-stale claim-guard false-negative (Task/Agent sub-agents emit no heartbeat) would
  // otherwise let the reaper remove an in-flight worktree mid-build. Best-effort: on error the
  // set is empty and the claim-guard remains the primary defense (no over-reap, no crash).
  const activeSdSet = new Set();
  try {
    const pageSize = 1000;
    for (let start = 0; start < 20000; start += pageSize) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, status')
        .in('status', ['draft', 'active', 'in_progress'])
        .range(start, start + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) if (r.sd_key) activeSdSet.add(r.sd_key);
      if (data.length < pageSize) break;
    }
  } catch { /* best-effort */ }

  // SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001: sd_keys of SDs in a TERMINAL state
  // (completed/cancelled/archived). Their worktrees are pure cleanup and Stage-0 may
  // reclaim them regardless of idle age. Best-effort: empty on error → Stage-0 simply
  // finds nothing to reclaim (no over-reap).
  const terminalSdSet = new Set();
  try {
    const pageSize = 1000;
    for (let start = 0; start < 20000; start += pageSize) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, status')
        .in('status', TERMINAL_SD_STATUSES)
        .range(start, start + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) if (r.sd_key) terminalSdSet.add(r.sd_key);
      if (data.length < pageSize) break;
    }
  } catch { /* best-effort */ }

  // SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001: QF status sets, loaded parallel to the SD sets so QF
  // worktree reaping is STATUS-AWARE (not by mere existence). quick_fixes.id holds the QF string
  // key. Best-effort: empty on error → the claim-guard remains the primary defense (no over-reap,
  // no crash).
  const activeQfSet = new Set();
  const terminalQfSet = new Set();
  async function loadQfStatusSet(statuses, target) {
    try {
      const pageSize = 1000;
      for (let start = 0; start < 20000; start += pageSize) {
        const { data, error } = await supabase
          .from('quick_fixes')
          .select('id, status')
          .in('status', statuses)
          .range(start, start + pageSize - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data) if (r.id) target.add(r.id);
        if (data.length < pageSize) break;
      }
    } catch { /* best-effort */ }
  }
  await loadQfStatusSet(ACTIVE_QF_STATUSES, activeQfSet);
  await loadQfStatusSet(TERMINAL_QF_STATUSES, terminalQfSet);

  return { sdMap, qfMap, activeSdSet, terminalSdSet, activeQfSet, terminalQfSet };
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

// normalizePath, collectDirtyStatus, countUnpushedCommits now imported from
// ../lib/worktree-reapability.js (SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001).

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

async function classifyWorktree(wt, ctx) {
  const categories = [];
  const reasons = {};

  // SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 (FR-4): a .reap-eligible.json
  // marker is the out-of-band handoff from a post-merge flow that refused to
  // self-delete — collect it promptly, ahead of age-based classification. The
  // removal gate (live-claim + residency guards) still decides WHEN it is safe.
  if (hasReapEligibleMarker(wt.path)) {
    categories.push('reap-eligible');
    reasons['reap-eligible'] = { matched: true, reason: 'marker', evidence: readReapEligibleMarker(wt.path) || {} };
  }

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
  if (shipped.matched) {
    // SD-FDBK-FIX-WORKTREE-REAPER-LIVE-001 (supersedes the basename-keyed
    // SD-FDBK-ENH-WORKTREE-REAPER-MJS-001 / SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001
    // guards): key resolves from the BRANCH (path-shape-agnostic), protection
    // covers claim-held (either claim side) and ALL non-terminal statuses
    // (pending_approval included), and an absorbed-no-PR cherry verdict is
    // advisory-only — never stage1 authority on its own.
    const action = decideShippedStaleAction(wt, shipped, ctx);
    if (action.protect) {
      reasons['shipped-stale-suppressed'] = { ...shipped, suppressed: true, reason: action.reason, sd_key: action.key };
    } else if (action.advisory) {
      reasons['shipped-stale-advisory'] = { ...shipped, advisory: true, reason: action.reason, sd_key: action.key };
    } else {
      categories.push('shipped-stale');
      reasons['shipped-stale'] = shipped;
    }
  }

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
  const hasStage1 = categories.includes('nested') || categories.includes('shipped-stale') ||
                    categories.includes('reap-eligible');
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

// ── Stage-0 terminal-SD reclaim (SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001) ──

/**
 * Pure Stage-0 classifier for a single worktree. A worktree is a Stage-0
 * reclaim candidate when its basename sd_key resolves to a TERMINAL SD status
 * (completed/cancelled/archived) AND it is not protected. This is age-agnostic:
 * it intentionally ignores the 7-day idle gate (the whole point of the
 * watchdog is to reclaim terminal-SD worktrees fast at high utilization).
 *
 * ALL existing guards are preserved here, in priority order:
 *   1. active claim (v_active_sessions) → ALWAYS keep
 *   2. activeSdSet (draft/active/in_progress) → ALWAYS keep (suppresses even
 *      a stale terminal-status row; never reap a still-worked SD)
 *   3. terminalSdSet membership → reclaim
 *
 * Pure + dependency-injected: takes the worktree, the claim map, and the two
 * SD-status sets. No git, no DB, no fs. The injected `statusResolver` (optional)
 * lets tests supply a function instead of sets; when present it wins.
 *
 * @param {{ path: string, branch?: string }} wt
 * @param {{
 *   claimMap?: Map<string, object>,
 *   activeSdSet?: Set<string>,
 *   terminalSdSet?: Set<string>,
 *   statusResolver?: (sdKey: string) => ('terminal'|'active'|'unknown')
 * }} ctx
 * @returns {{ reclaim: boolean, reason: string, sd_key: string }}
 */
export function classifyStage0(wt, ctx = {}) {
  const sdKey = path.basename(wt.path || '');

  // Guard 1: active claim protection (AC8) — never touch a live-claimed worktree.
  const claim = ctx.claimMap?.get(normalizePath(wt.path));
  if (claim) {
    return { reclaim: false, reason: 'active_claim_protected', sd_key: sdKey };
  }

  // Guard 2: active item (SD: draft/active/in_progress; QF: open/in_progress) — never reap a
  // still-worked item, even if a stale terminal row exists for the same key.
  // SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001: QF worktrees carry the qf_id (starts with 'QF-') as
  // their basename and are never in the SD sets, so they get their own status-aware guard +
  // terminal-reclaim resolution parallel to the SD path.
  const isQf = sdKey.startsWith('QF-');
  if (isQf) {
    if (ctx.activeQfSet && ctx.activeQfSet.has(sdKey)) {
      return { reclaim: false, reason: 'active_qf_protected', sd_key: sdKey };
    }
  } else if (ctx.activeSdSet && ctx.activeSdSet.has(sdKey)) {
    return { reclaim: false, reason: 'active_sd_protected', sd_key: sdKey };
  }

  // Resolve terminal status. statusResolver (if injected) is authoritative.
  let isTerminal;
  if (typeof ctx.statusResolver === 'function') {
    const verdict = ctx.statusResolver(sdKey);
    if (verdict === 'active') {
      return { reclaim: false, reason: isQf ? 'active_qf_protected' : 'active_sd_protected', sd_key: sdKey };
    }
    isTerminal = verdict === 'terminal';
  } else if (isQf) {
    isTerminal = !!(ctx.terminalQfSet && ctx.terminalQfSet.has(sdKey));
  } else {
    isTerminal = !!(ctx.terminalSdSet && ctx.terminalSdSet.has(sdKey));
  }

  if (isTerminal) {
    return { reclaim: true, reason: isQf ? 'terminal_qf_reclaim' : 'terminal_sd_reclaim', sd_key: sdKey };
  }
  return { reclaim: false, reason: isQf ? 'not_terminal_qf' : 'not_terminal_sd', sd_key: sdKey };
}

/**
 * Pure selection over an injected worktree listing. Returns the subset of
 * worktrees that Stage-0 would reclaim, each tagged with its classification.
 * No I/O — callers pass in the already-enumerated worktrees, claim map, and
 * status sets. This is the unit the watchdog and the CLI both drive.
 *
 * @param {Array<{ path: string, branch?: string }>} worktrees
 * @param {object} ctx - same shape as classifyStage0's ctx
 * @returns {Array<{ path: string, branch?: string, sd_key: string, reason: string }>}
 */
export function selectStage0Reclaim(worktrees, ctx = {}) {
  const out = [];
  for (const wt of worktrees || []) {
    if (isCursorWorktree(wt.path)) continue; // inherit cursor-protection convention
    const v = classifyStage0(wt, ctx);
    if (v.reclaim) out.push({ path: wt.path, branch: wt.branch, sd_key: v.sd_key, reason: v.reason });
  }
  return out;
}

/**
 * Compute pool utilization as a fraction in [0,1].
 *
 * @param {number} used - active worktree count
 * @param {number} [cap=MAX_WORKTREE_COUNT]
 * @returns {{ used: number, cap: number, utilization: number, percent: number }}
 */
export function computePoolUtilization(used, cap = MAX_WORKTREE_COUNT) {
  const safeCap = cap > 0 ? cap : MAX_WORKTREE_COUNT;
  const utilization = used / safeCap;
  return { used, cap: safeCap, utilization, percent: Math.round(utilization * 100) };
}

/**
 * Pool watchdog (FR-002). Computes utilization from the injected used/cap and,
 * when at/above the threshold, selects the Stage-0 reclaim set. PURE by default:
 * it does NOT remove anything — it returns the decision + candidate list so the
 * caller (the tick / CLI) performs the claim-guarded, preserve-before-delete
 * removal through the existing removeWorktree path. Idempotent: a second call on
 * the same state returns the same (or empty, once reclaimed) candidate set.
 *
 * An optional `reclaim` callback may be supplied to actually act on the
 * candidates (used by the tick); it is invoked only when triggered.
 *
 * @param {{
 *   worktrees: Array<{path:string, branch?:string}>,
 *   used?: number,
 *   cap?: number,
 *   threshold?: number,
 *   claimMap?: Map<string, object>,
 *   activeSdSet?: Set<string>,
 *   terminalSdSet?: Set<string>,
 *   statusResolver?: Function,
 *   reclaim?: (candidates: Array) => any
 * }} ctx
 * @returns {{ triggered: boolean, used: number, cap: number, utilization: number,
 *             percent: number, threshold: number, candidates: Array, acted: boolean }}
 */
export function poolWatchdog(ctx = {}) {
  const worktrees = ctx.worktrees || [];
  const cap = ctx.cap > 0 ? ctx.cap : MAX_WORKTREE_COUNT;
  const used = Number.isFinite(ctx.used) ? ctx.used : worktrees.length;
  const threshold = Number.isFinite(ctx.threshold) && ctx.threshold > 0 ? ctx.threshold : DEFAULT_POOL_THRESHOLD;
  const { utilization, percent } = computePoolUtilization(used, cap);
  const triggered = utilization >= threshold;

  let candidates = [];
  let acted = false;
  if (triggered) {
    candidates = selectStage0Reclaim(worktrees, ctx);
    if (typeof ctx.reclaim === 'function' && candidates.length > 0) {
      ctx.reclaim(candidates);
      acted = true;
    }
  }
  return { triggered, used, cap, utilization, percent, threshold, candidates, acted };
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
      // QF-20260509-NESTED-JUNCTION: lstat (not stat) to detect symlinks/junctions
      // without following them. safeRecursiveCp recreates links at destination
      // instead of duplicating junction-target contents.
      const st = fs.lstatSync(src);
      if (st.isDirectory()) {
        safeRecursiveCp(src, tgt);
      } else if (st.isSymbolicLink()) {
        try {
          const target = fs.readlinkSync(src);
          const linkType = process.platform === 'win32' ? 'junction' : 'file';
          fs.symlinkSync(target, tgt, linkType);
        } catch (e) {
          logger?.(`preserve: symlink-recreate failed for ${rel} (${e?.message || e})`);
          skipped.push(rel);
          continue;
        }
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
  // QF-20260512-347: route through removeWorktreeViaGit so node_modules symlinks
  // (Windows junctions / MSYS bash symlinks) are pre-unlinked before `git worktree
  // remove --force` follows them and wipes the main repo's node_modules. QF-446
  // (PR #3724) shipped this helper across 3 shipping sites; the reaper was the
  // missed 4th site (witness 2026-05-11T23:33Z destroyed main repo node_modules
  // across 4 parallel sessions).
  const primary = removeWorktreeViaGit(abs, repoRoot, { allowFail: true });
  if (primary.ok) return { ok: true, method: 'git-worktree-remove' };
  // Fallback: git worktree can refuse when the dir is already partly gone; try junction-safe rm.
  // QF-20260508-102: raw fs.rmSync({recursive:true,force:true}) on Windows follows the worktree's
  // node_modules junction and wipes the main repo's node_modules — bricks every parallel session.
  // safeRecursiveRm unlinks symlinks/junctions FIRST, then recursively removes the rest.
  try {
    if (fs.existsSync(abs)) safeRecursiveRm(abs);
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

/**
 * SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 (FR-1/FR-2/FR-4): run + report one orphan sweep.
 * Reclaims unregistered `.worktrees/` dirs via the junction-safe path. Conservative:
 * EXECUTE removal is forced to dry-run when Supabase is unavailable, because without it
 * the live-owner (active-claim) guard cannot be verified — mirroring the reaper's own
 * "refuse to remove without active-claim verification" stance (main():~1096). Fail-soft.
 *
 * @param {{repoRoot: string, worktreesDir: string, supabase: object|null, execute: boolean}} p
 * @returns {Promise<object>} the runOrphanSweep result
 */
async function runAndReportOrphanSweep({ repoRoot, worktreesDir, supabase, execute }) {
  // SD-FDBK-FIX-WORKTREE-REAPER-DESTROYED-001 (FR-3, RCA 7c61d78f): loadClaimMap was
  // hardened to THROW on query error (QF-20260510-WT-CLAIM-PROTECT-001), but the prior
  // `.catch(() => new Map())` here swallowed that throw back into an EMPTY owner set —
  // resurrecting the exact silent fail-open, so the sweep would reclaim EVERYTHING. Fail
  // CLOSED: if the claim map cannot be built, force DRY-RUN (reclaim nothing), mirroring
  // the Supabase-unavailable branch below. An unverifiable owner set must never widen removal.
  let owners = new Map();
  let claimMapFailed = false;
  if (supabase) {
    try {
      owners = await loadClaimMap(supabase);
    } catch (e) {
      claimMapFailed = true;
      console.log(`🧹 Orphan sweep: claim-map build FAILED (${e?.message || e}) — forcing DRY-RUN (cannot verify active-claim ownership; refusing to reclaim).`);
    }
  }
  const liveOwners = new Set([...owners.keys()]);
  const effectiveExecute = execute && !!supabase && !claimMapFailed;
  if (execute && !supabase) {
    console.log('🧹 Orphan sweep: Supabase unavailable — running DRY-RUN (cannot verify active-claim ownership).');
  }
  const sweep = runOrphanSweep({
    repoRoot,
    worktreesDir,
    execute: effectiveExecute,
    liveOwners,
    emit: emitJsonLine,
    logger: (m) => process.stderr.write(m + '\n'),
  });
  const s = sweep.summary || {};
  console.log(
    `🧹 Orphan sweep: scanned=${s.scanned ?? '?'} reapable=${s.reapable ?? '?'} ` +
    `reclaimed=${s.reclaimed_count ?? 0} bytes=${s.reclaimed_bytes ?? 0} ` +
    `excluded=${s.excluded_count ?? 0} failed=${s.failed_count ?? 0}${s.dry_run ? ' (dry-run)' : ''}`
  );
  // FR-4 durable summary: best-effort audit_log row when an EXECUTE run actually acted. Fail-soft.
  if (sweep.ok && supabase && effectiveExecute && ((s.reclaimed_count || 0) > 0 || (s.failed_count || 0) > 0)) {
    try {
      await supabase.from('audit_log').insert({
        event_type: 'worktree_orphan_sweep',
        entity_type: 'worktree',
        entity_id: 'orphan_sweep',
        severity: (s.failed_count || 0) > 0 ? 'warning' : 'info',
        created_by: 'worktree-reaper',
        metadata: s,
      });
    } catch { /* fail-soft: the stderr JSON line is the primary durable signal */ }
  }
  return sweep;
}

// ── Multi-pool orchestration (SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001) ──

/** Rebuild the per-pool child's flag list from opts (everything EXCEPT --all-pools and --repo, which
 *  the orchestrator sets itself). Keeps every pool's run identical to a manual single-repo invocation. */
export function buildPassthroughFlags(opts) {
  const f = [];
  if (opts.execute) f.push('--execute');
  if (opts.stage0) f.push('--stage0');
  if (opts.stage2) f.push('--stage2');
  if (opts.yes) f.push('--yes');
  if (opts.verbose) f.push('--verbose');
  if (opts.phantomOnly) f.push('--phantom-only');
  if (opts.orphanSweep) f.push('--orphan-sweep');
  if (opts.noOrphanSweep) f.push('--no-orphan-sweep');
  if (opts.days && opts.days !== DEFAULT_IDLE_DAYS) f.push('--days', String(opts.days));
  if (opts.threshold && opts.threshold !== DEFAULT_POOL_THRESHOLD) f.push('--threshold', String(opts.threshold));
  if (opts.preserveRoot) f.push('--preserve-root', opts.preserveRoot);
  return f;
}

/**
 * Reap EVERY registered worktree pool. Spawns a per-pool `--repo <root>` child so each pool keeps the
 * full single-repo safety (active-claim protection, preserve-before-delete, dry-run default) — the
 * decision logic is already repo-agnostic, so only the iteration is new here. Emits a loud warning for
 * any pool at/above the cap threshold (FR-2) and returns the worst child exit code.
 */
export async function runAllPools(opts, { repoRoot, repoName, supabase }, deps = {}) {
  // Dependency injection (defaults wire the real runtime; tests inject fakes so the orchestration
  // glue — pool fan-out, per-pool child argv, worst-exit selection — is unit-testable without git/DB).
  const existsSync = deps.existsSync || ((p) => fs.existsSync(p));
  const hasGit = deps.hasGit || ((root) => fs.existsSync(path.join(root, '.git')));
  const usedCounter = deps.listUsed || ((root) => { try { return listActiveWorktrees(root).length; } catch { return 0; } });
  const spawn = deps.spawn || ((cmd, argv) => spawnSync(cmd, argv, { stdio: 'inherit', windowsHide: true }));
  const thisFile = deps.selfPath || fileURLToPath(import.meta.url);

  let applications = [];
  if (supabase) {
    try {
      const { data } = await supabase.from('applications').select('name, local_path');
      applications = data || [];
    } catch { /* fail-soft: still reap the current pool below */ }
  }
  const pools = resolveRegisteredPools({
    applications,
    currentRepoRoot: repoRoot,
    currentRepoName: repoName,
    existsSync,
    hasGit,
  });

  console.log(`\n🌐 MULTI-POOL REAPER — ${pools.length} registered pool(s), ${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);
  const passthrough = buildPassthroughFlags(opts);
  let worst = 0;
  for (const pool of pools) {
    const used = usedCounter(pool.root);
    const cap = computePoolCapStatus(used, MAX_WORKTREE_COUNT, opts.threshold);
    const tag = `${pool.name} (${pool.root})`;
    if (cap.warn) {
      console.warn(
        `\n⚠️  POOL ${cap.atCap ? 'AT' : 'NEAR'} CAP: ${tag} — ${cap.used}/${cap.cap} (${cap.percent}%) ` +
        `>= ${Math.round((opts.threshold || DEFAULT_POOL_THRESHOLD) * 100)}% threshold`,
      );
    }
    console.log(`\n──▶ Pool: ${tag} — ${cap.used}/${cap.cap} worktrees (${cap.percent}%)`);
    const res = spawn('node', [thisFile, '--repo', pool.root, ...passthrough]);
    const code = res && res.status != null ? res.status : 9;
    if (code > worst) worst = code;
    console.log(`◀── Pool ${pool.name} reaper exited ${code}`);
  }
  console.log(`\n🌐 Multi-pool reaper done — ${pools.length} pool(s), worst exit ${worst}`);
  return worst;
}

export async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  if (opts.repo) {
    // Load this script's own repo .env BEFORE chdir, so SUPABASE_* creds are
    // available even when --repo points at a target without its own .env.
    // First-loader-wins in loadDotenvFromDir, so any keys already set by the
    // shell or by the target repo's later loadDotenv() call take precedence.
    // Closes QF-20260511-866 / feedback 04db6c20.
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    loadDotenvFromDir(scriptDir);

    const target = path.resolve(opts.repo);
    if (!fs.existsSync(target)) {
      console.error(`❌ --repo path does not exist: ${target}`);
      return 2;
    }
    try { process.chdir(target); }
    catch (e) { console.error(`❌ Cannot chdir to --repo ${target}: ${e.message}`); return 2; }
  }

  loadDotenv();

  let repoRoot;
  try { repoRoot = assertCwdIsMainRepoRoot(); }
  catch (e) { console.error(`❌ ${e.message}`); return 2; }

  const worktreesDir = path.join(repoRoot, '.worktrees');
  const supabase = getSupabaseClient();

  // SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001: --all-pools fans out one --repo child per registered
  // pool (the current repo included), so a single invocation reaps EHG_Engineer AND ehg AND any other
  // registered app. Each child keeps the full single-repo safety; this returns the worst child exit.
  if (opts.allPools) {
    return await runAllPools(opts, { repoRoot, repoName: path.basename(repoRoot), supabase });
  }

  const allWorktrees = listActiveWorktrees(repoRoot);

  // Phantom-only mode: preserves legacy cleanup-phantom-worktrees.js behavior.
  if (opts.phantomOnly) {
    return runPhantomOnlyMode({ repoRoot, worktrees: allWorktrees });
  }

  // SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001: standalone orphan-sweep mode (manual /
  // `npm run worktree:orphan-sweep[:execute]`). Reclaims ONLY unregistered .worktrees/ dirs.
  if (opts.orphanSweep) {
    await runAndReportOrphanSweep({ repoRoot, worktreesDir, supabase, execute: opts.execute });
    return 0; // fail-soft: the sweep never produces a non-zero reaper exit
  }

  // FR-4 durability: fold the orphan sweep into the NORMAL reaper flow so the hourly
  // worktree-reaper-tick.cjs spawn includes it with NO separate cron. Runs BEFORE the
  // registered-worktree stage scan (and its early returns), is dry-run unless --execute,
  // and is fully fail-soft so it can never abort the reaper. Opt out with --no-orphan-sweep.
  if (!opts.noOrphanSweep) {
    await runAndReportOrphanSweep({ repoRoot, worktreesDir, supabase, execute: opts.execute });
  }

  // Load reference data (best-effort — reaper is useful even with empty maps).
  const [claimMap, claimedKeySet, { sdMap, qfMap, activeSdSet, terminalSdSet, activeQfSet, terminalQfSet }] = await Promise.all([
    loadClaimMap(supabase),
    loadClaimedKeySet(supabase),
    loadSdKeySets(supabase),
  ]);

  const idleThresholdMs = opts.days * 24 * 60 * 60 * 1000;
  const ctx = { repoRoot, claimMap, claimedKeySet, sdMap, qfMap, activeSdSet, terminalSdSet, activeQfSet, terminalQfSet, idleThresholdMs };

  const header = humanTableHeader();
  const now = Date.now();
  const records = [];

  console.log(`\n🔍 WORKTREE REAPER — ${opts.execute ? 'EXECUTE' : 'DRY-RUN'} mode${opts.stage0 ? ' (+Stage-0 terminal-SD)' : ''}`);
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

    // SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (FR-001): opt-in Stage-0.
    // When --stage0 is set and a worktree's SD is TERMINAL (completed/cancelled/
    // archived), reclaim it age-agnostically — even if no other category matched.
    // All earlier guards still hold: active-claimed worktrees never reach here
    // (early continue above), and classifyStage0 re-checks activeSdSet so a
    // still-worked SD is never reaped.
    if (opts.stage0 && stage == null) {
      const s0 = classifyStage0(wtInput, ctx);
      if (s0.reclaim) {
        stage = 0;
        verdict = 'stage0_remove';
        reasonText = s0.reason;
        categories = [...categories, 'terminal-sd'];
        reasons = { ...reasons, 'terminal-sd': { matched: true, reason: s0.reason, sd_key: s0.sd_key } };
      }
    }

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
  const stage0 = records.filter((r) => r._stage === 0);
  const stage1 = records.filter((r) => r._stage === 1);
  const stage2 = records.filter((r) => r._stage === 2);

  console.log('─'.repeat(header.length));
  if (opts.stage0) console.log(`Stage 0 (terminal-SD):     ${stage0.length}`);
  console.log(`Stage 1 (auto-safe):       ${stage1.length}`);
  console.log(`Stage 2 (analyzed):        ${stage2.length}`);
  console.log(`Kept (including active):   ${records.length - stage0.length - stage1.length - stage2.length}`);

  if (!opts.execute) {
    console.log('\n(Dry-run — no changes made. Pass --execute to remove Stage 1, --stage0 for terminal-SD, or --execute --stage2 for all.)');
    return 0;
  }

  if (!supabase) {
    console.log('\n⚠️  Refusing to remove anything: Supabase unavailable, active-claim protection cannot be verified.');
    return 3;
  }

  // Stage 0 (terminal-SD) + Stage 1 removals (unconditional with --execute).
  // Stage-0 is auto-safe: the SD is already terminal and the active-claim /
  // activeSdSet guards have both been applied during classification.
  const removeList = [...stage0, ...stage1];

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
      const freshKeys = await loadClaimedKeySet(supabase);
      const recKey = keyFromWorktree({ path: wtPath, branch: rec.branch });
      if (fresh.get(normalizePath(wtPath)) || freshKeys.has(recKey)) {
        console.log(`  ↷ ${path.basename(wtPath)} acquired active claim mid-run — skipping`);
        aborted++;
        continue;
      }

      // QF-20260710-432 last-line guard: ask the authoritative claim question directly
      // (claiming_session_id + isSessionAlive) — fail-CLOSED on any lookup error. The
      // Alpha-2 incident reaped a live-claimed ZERO-COMMIT worktree mid-PLAN; commit
      // presence/age is never sufficient evidence of abandonment.
      const claimGuard = await liveClaimBlocksRemoval(supabase, wtPath, {
        logger: (m) => process.stderr.write(`  ${m}
`),
      });
      if (claimGuard.blocked) {
        console.log(`  ⛔ ${path.basename(wtPath)} live-claim guard: ${claimGuard.reason} — skipping`);
        emitJsonLine({
          schema_version: SCHEMA_VERSION,
          timestamp: new Date().toISOString(),
          event: 'removal_blocked_live_claim',
          worktree_path: wtPath,
          reason: claimGuard.reason,
          detail: claimGuard.detail || null,
        });
        aborted++;
        continue;
      }

      // SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 (FR-4): residency guard —
      // a FRESH-heartbeat session whose worktree_path references this target
      // is standing in it (claim-independent: idle/parked sessions hold no
      // claim yet still resident). Fail-closed, same as the claim guard.
      const residency = await heartbeatResidencyBlocksRemoval(supabase, wtPath, {
        logger: (m) => process.stderr.write(`  ${m}\n`),
      });
      if (residency.blocked) {
        console.log(`  ⛔ ${path.basename(wtPath)} residency guard: ${residency.reason} — skipping`);
        emitJsonLine({
          schema_version: SCHEMA_VERSION,
          timestamp: new Date().toISOString(),
          event: 'removal_blocked_resident',
          worktree_path: wtPath,
          reason: residency.reason,
          detail: residency.detail || null,
        });
        aborted++;
        continue;
      }

      // SD-LEO-FEAT-DATA-LOSS-HIGH-001 (FR-2): preserve BOTH untracked AND modified-tracked files
      // before the force-remove. Uncommitted edits to tracked files (the ~56-LOC data-loss class)
      // were previously destroyed because only `untracked` was copied. Dedupe defensively. The
      // preserve-before-delete contract is intact: if preservation throws, removal aborts.
      const toPreserve = [...new Set([...(dirty.untracked || []), ...(dirty.modified || [])])];
      const preserve = preserveUntrackedFiles({
        wtPath,
        preserveRoot: opts.preserveRoot ? path.resolve(opts.preserveRoot) : null,
        untracked: toPreserve,
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
  loadDotenvFromDir,
  loadClaimMap,
  loadClaimedKeySet,
  keyFromWorktree,
  decideShippedStaleAction,
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
