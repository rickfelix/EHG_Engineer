#!/usr/bin/env node
/**
 * Safe worktree removal entrypoint — SD-FDBK-ENH-GIT-WORKTREE-REMOVE-001.
 *
 * Routes MANUAL/AGENT worktree teardown through lib/worktree-manager.js
 * removeWorktreeViaGit, which pre-unlinks a worktree's node_modules
 * symlink/junction (via fs.lstat().isSymbolicLink()) BEFORE `git worktree
 * remove`. This is the safe alternative to a raw `git worktree remove --force`
 * or `rm -rf <worktree>` — both of which follow the node_modules junction and
 * GUT the main repo's shared node_modules (0 packages -> ERR_MODULE_NOT_FOUND
 * @supabase/supabase-js from lib/supabase-client.js), breaking node tooling for
 * every session sharing the main repo.
 *
 * Usage:
 *   npm run worktree:remove <SD-KEY>            # resolve via git worktree list
 *   npm run worktree:remove <path/to/worktree>  # explicit path
 *   npm run worktree:remove <SD-KEY> --force     # remove even if live/dirty
 *
 * Default is GUARDED (isReapable): a worktree owned by a live session OR holding
 * uncommitted/unpushed work is SKIPPED, not removed. --force overrides the guard
 * but STILL pre-unlinks node_modules — the gut-prevention is unconditional.
 *
 * QF-20260903-419: the guard above previously never checked LIVE CLAIM state — it
 * only ever passed the isReapable default liveOwner:false, so a git-clean worktree
 * (content-only check) was always removable even when another seat had re-claimed
 * the SD/QF since. Two live-claimed trees were destroyed this way. resolveLiveClaim
 * below queries the actual claim row for the worktree's SD/QF key before removal;
 * a query failure fails CLOSED (treated as live) since content alone can never
 * prove absence of a claim.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { removeWorktreeViaGit, getRepoRoot, safeRecursiveRm } from '../lib/worktree-manager.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { isKnownWedged, FREEZE_CUT_MINUTES } from '../lib/fleet/genuine-worker.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { markerDirs: defaultMarkerDirs, getMarkerSessionIds: defaultGetMarkerSessionIds } = require('../lib/fleet/cc-pid-liveness.cjs');

const WORKTREES_DIR = '.worktrees';

/** Branch → SD/QF key, matching the convention scripts/worktree-reaper.mjs already reaps by. */
export function keyFromBranch(branch) {
  const m = String(branch || '').match(/^(?:refs\/heads\/)?(?:feat|qf|fix|chore|hotfix)\/(.+)$/);
  return m ? m[1] : null;
}

/**
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-1b (VALIDATION finding B): claim-ROW
 * PRESENCE alone is not proof of liveness — a session that died without releasing its
 * claim pins the row as "live" forever, with no liveness probe at all. This is checked
 * ONLY when a claiming_session_id already exists (an ADDITIVE narrowing, never a
 * widening): a claiming session we cannot positively prove dead still reads live,
 * preserving resolveLiveClaim's existing fail-closed contract for every other caller.
 * "Proven dead" = no resident PID by the marker-dir UNION (a live process anywhere
 * always wins) AND (released_at set OR the tool clock is frozen past RECLAIM's
 * freeze-cut) — never heartbeat alone, per FR-1b.
 * @returns {Promise<boolean>} true iff positively proven dead
 */
async function isClaimingSessionProvenDead(sessionId, { supabase, markerDirsFn, getMarkerSessionIdsFn, nowMs }) {
  try {
    for (const dir of markerDirsFn()) {
      if (getMarkerSessionIdsFn(dir)[sessionId]?.alive) return false; // resident PID — definitely live
    }
    const { data: row, error } = await supabase
      .from('claude_sessions')
      .select('session_id, released_at, last_tool_at, loop_state, heartbeat_at')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error || !row) return false; // cannot verify — not proven dead, fail closed
    if (row.released_at) return true; // released AND no resident PID
    return isKnownWedged(row, nowMs, FREEZE_CUT_MINUTES); // frozen past cut, never heartbeat alone
  } catch { return false; } // cannot verify — not proven dead
}

/**
 * Is the SD/QF this worktree belongs to CURRENTLY claimed by any session? Checked
 * against the live DB row, never inferred from worktree content. Fail-CLOSED: a
 * lookup that cannot run (no key, no client, query error) reports liveOwner:true —
 * an unverifiable claim must never look like "safe to remove".
 * @returns {Promise<boolean>}
 */
export async function resolveLiveClaim(key, { supabaseClient, markerDirsFn = defaultMarkerDirs, getMarkerSessionIdsFn = defaultGetMarkerSessionIds, nowMs = Date.now() } = {}) {
  if (!key) return false; // no resolvable SD/QF key — nothing this check can protect
  let supabase = supabaseClient;
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !apiKey) return true; // cannot verify — fail closed
    try { supabase = createClient(url, apiKey, { auth: { persistSession: false } }); }
    catch { return true; }
  }
  try {
    const table = /^QF-/i.test(key) ? 'quick_fixes' : 'strategic_directives_v2';
    const idColumn = table === 'quick_fixes' ? 'id' : 'sd_key';
    const { data, error } = await supabase
      .from(table).select('claiming_session_id').eq(idColumn, key).maybeSingle();
    if (error) return true; // query failed — fail closed, cannot verify absence of a claim
    const claimingSessionId = data?.claiming_session_id;
    if (!claimingSessionId) return false;
    const provenDead = await isClaimingSessionProvenDead(claimingSessionId, { supabase, markerDirsFn, getMarkerSessionIdsFn, nowMs });
    return !provenDead;
  } catch { return true; } // fail closed
}

function listWorktrees(repoRoot) {
  try {
    const out = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
    const entries = [];
    let cur = {};
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) { if (cur.path) entries.push(cur); cur = { path: line.slice(9).trim() }; }
      else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '');
    }
    if (cur.path) entries.push(cur);
    return entries;
  } catch { return []; }
}

/** Resolve an SD-KEY or explicit path to an absolute worktree path. */
export function resolveWorktreePath(arg, repoRoot) {
  if (arg.includes('/') || arg.includes('\\') || fs.existsSync(arg)) return path.resolve(arg);
  const norm = (p) => path.resolve(p).replace(/\\/g, '/');
  const wts = listWorktrees(repoRoot);
  const byBranch = wts.find((w) => w.branch === `feat/${arg}`);
  if (byBranch) return norm(byBranch.path);
  const byBase = wts.find((w) => path.basename(norm(w.path)) === arg);
  if (byBase) return norm(byBase.path);
  return path.join(repoRoot, WORKTREES_DIR, arg); // conventional fallback
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const target = args.find((a) => !a.startsWith('-'));
  if (!target) {
    console.error('Usage: npm run worktree:remove <SD-KEY | path> [--force]');
    process.exit(2);
  }
  const repoRoot = getRepoRoot();
  const wtPath = resolveWorktreePath(target, repoRoot);

  if (path.resolve(wtPath) === path.resolve(repoRoot)) {
    console.error(`Refusing to remove the main repo root: ${wtPath}`);
    process.exit(2);
  }

  // QF-20260903-419: content (git status/log) cannot see a LIVE CLAIM another
  // seat took after this one released — resolve the actual DB claim state
  // before removal rather than trusting the caller's memory of having released.
  const wtEntry = listWorktrees(repoRoot).find((w) => path.resolve(w.path) === path.resolve(wtPath));
  const key = keyFromBranch(wtEntry?.branch) || target;
  const liveOwner = !force && await resolveLiveClaim(key);

  // removeWorktreeViaGit pre-unlinks node_modules FIRST, then `git worktree
  // remove --force`. guard:!force skips a live/dirty worktree (protective).
  const res = removeWorktreeViaGit(wtPath, repoRoot, {
    guard: !force,
    liveOwner,
    allowFail: true,
    logger: (m) => console.warn(m),
  });

  if (res.ok) {
    console.log(`✓ Safely removed worktree (node_modules pre-unlinked): ${wtPath}`);
    process.exit(0);
  }
  if (res.skipped) {
    console.warn(`⏭️  Skipped (${res.reason}) — owned by a live session or has uncommitted/unpushed work.`);
    console.warn('   Re-run with --force to remove anyway (node_modules is still pre-unlinked).');
    process.exit(0);
  }

  // git worktree remove failed (e.g. orphan / unregistered path). The junction
  // was already pre-unlinked above, so a recursive remove can no longer follow
  // it into the shared store. Defensive: re-check node_modules isn't still a link.
  try { execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' }); } catch { /* best-effort */ }
  if (fs.existsSync(wtPath)) {
    // SD-LEO-INFRA-WORKTREE-REMOVE-CHOKEPOINT-001: route the orphan/fallback delete
    // through the canonical junction-safe chokepoint instead of a top-level-only
    // node_modules check + raw fs.rmSync. The prior code only tested whether
    // wtPath/node_modules was ITSELF a symlink — it missed NESTED junctions and any
    // junction OUTSIDE node_modules, so the raw fs.rmSync followed one into the shared
    // store and wiped it (the recurring node_modules wipe). safeRecursiveRm does a
    // WHOLE-TREE _unlinkLinksRecursive before fs.rmSync — the same routine the reaper
    // (worktree-reaper.mjs) and orphan-sweep already use.
    try {
      safeRecursiveRm(wtPath, { force: true });
      console.log(`✓ Removed orphan worktree dir (whole-tree junction-safe via safeRecursiveRm + pruned): ${wtPath}`);
      process.exit(0);
    } catch (e) {
      console.error(`✗ Failed to remove ${wtPath}: ${e.message}`);
      process.exit(1);
    }
  }
  console.error(`✗ git worktree remove failed: ${res.error}`);
  process.exit(1);
}

// Only run when invoked directly (keep resolveWorktreePath importable for tests).
if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
