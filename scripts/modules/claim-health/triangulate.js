/**
 * Claim Health Triangulation Module
 * SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001
 * SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 — added FR1 (4 new evidence-of-life signals) + FR3 (PID liveness hardening)
 *
 * Cross-references multiple signal sources to detect claim discrepancies and protect against
 * hostile reclaim of active CC conversations whose session_id rotated across claude.exe restart.
 *
 * Original signals (1-4):
 * 1. claude_sessions (DB) — what sessions think they own
 * 2. strategic_directives_v2.is_working_on — what SDs think is active
 * 3. .worktrees/ directory — physical evidence of in-progress work
 * 4. OS process table — PID liveness check (process.kill(pid, 0))
 *
 * Added signals (5-8) — evidence-of-life that protects against premature reclaim:
 * 5. Branch presence — local or remote feat/SD-* branch matching the SD key
 * 6. Plan-file indirection — .claude/plans/* file referencing the SD key
 * 7. Recent sub-agent activity — sub_agent_execution_results.created_at within last 5 min for the SD
 * 8. Sibling-session-branch — another active session with worktree_branch matching the SD
 *
 * Hardened PID liveness (FR3):
 * PID_DEAD requires BOTH (a) process.kill(pid, 0) raises ESRCH AND (b) process_alive_at tick
 * recency older than 90s. Either alone is insufficient because cross-shell processes can
 * fail process.kill while their tick daemon is still writing heartbeats.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKTREES_DIR = path.join(PROJECT_ROOT, '.worktrees');
const PLANS_DIR = path.join(PROJECT_ROOT, '.claude', 'plans');

// FR3: Tick recency threshold — process_alive_at must be at most this stale to be considered alive.
// Aligned with claude_sessions.process_alive_at docs ("if < 90s old, worker is alive").
export const TICK_RECENT_SECONDS = 90;

// FR1.c / FR1.d: Sub-agent activity / sibling-session lookback window.
export const ACTIVITY_LOOKBACK_SECONDS = 5 * 60;

/**
 * Check if a process is running by PID.
 * EPERM means process exists but caller lacks permission — still alive.
 * ESRCH or other errors mean dead/unknown.
 */
function isProcessRunning(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * FR3: Tick recency — was process_alive_at updated recently enough that we believe the
 * tick daemon (and therefore the parent CC process) is still alive?
 */
function hasRecentTick(processAliveAt) {
  if (!processAliveAt) return false;
  const ageSec = (Date.now() - new Date(processAliveAt).getTime()) / 1000;
  return ageSec <= TICK_RECENT_SECONDS;
}

/**
 * Get active worktrees with SD keys.
 */
function getActiveWorktrees() {
  const result = new Map();
  if (!fs.existsSync(WORKTREES_DIR)) return result;

  const entries = fs.readdirSync(WORKTREES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('SD-')) continue;

    const wtPath = path.join(WORKTREES_DIR, entry.name);
    let hasChanges = false;
    let mtime = new Date(0);

    try {
      const stat = fs.statSync(wtPath);
      mtime = stat.mtime;

      const gitDir = path.join(wtPath, '.git');
      if (fs.existsSync(gitDir)) {
        const indexPath = typeof gitDir === 'string' && fs.statSync(gitDir).isFile()
          ? path.join(fs.readFileSync(gitDir, 'utf8').replace('gitdir: ', '').trim(), 'index')
          : path.join(gitDir, 'index');
        if (fs.existsSync(indexPath)) {
          const indexStat = fs.statSync(indexPath);
          hasChanges = (Date.now() - indexStat.mtimeMs) < 3600000;
        }
      }
    } catch {
      // Skip problematic worktrees
    }

    result.set(entry.name, { path: wtPath, hasChanges, mtime });
  }

  return result;
}

/**
 * Extract PID from session_id string (format: session_{hash}_{platform}{winPid}_{ccPid})
 */
function extractPidFromSessionId(sessionId) {
  if (!sessionId) return null;
  const match = sessionId.match(/_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

// ─── FR1.a: Branch presence ──────────────────────────────────────────────────
/**
 * Build the set of feat/SD-* branch names present locally OR on origin.
 * Cached per triangulate() invocation via the caller passing in a precomputed Set.
 */
function listFeatSdBranches() {
  try {
    const out = execSync(
      'git for-each-ref --format=%(refname:short) refs/heads/feat/SD- refs/remotes/origin/feat/SD-',
      { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const branches = new Set();
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Strip leading "origin/" so callers can match on logical branch name
      const logical = trimmed.replace(/^origin\//, '');
      branches.add(logical);
    }
    return branches;
  } catch {
    return new Set();
  }
}

function hasBranchForSd(branchSet, sdKey) {
  if (!branchSet || !sdKey) return false;
  // feat/<sdKey> exact match OR any branch containing the sdKey segment
  if (branchSet.has(`feat/${sdKey}`)) return true;
  for (const b of branchSet) {
    if (b.includes(sdKey)) return true;
  }
  return false;
}

// ─── FR1.b: Plan-file indirection ────────────────────────────────────────────
/**
 * Build the set of plan-file basenames under .claude/plans/.
 * Returns empty set if the directory doesn't exist.
 */
function listPlanFiles() {
  try {
    if (!fs.existsSync(PLANS_DIR)) return new Set();
    const entries = fs.readdirSync(PLANS_DIR, { withFileTypes: true });
    const files = new Set();
    for (const e of entries) {
      if (e.isFile()) files.add(e.name);
    }
    return files;
  } catch {
    return new Set();
  }
}

function hasPlanFileForSd(planSet, sdKey) {
  if (!planSet || !sdKey) return false;
  for (const f of planSet) {
    if (f.includes(sdKey)) return true;
  }
  return false;
}

// ─── FR1.c: Recent sub-agent activity ────────────────────────────────────────
/**
 * Build a Set of sd_id (UUID) values that have sub_agent_execution_results
 * within the last ACTIVITY_LOOKBACK_SECONDS. Single bulk query, then in-memory lookup.
 */
async function buildRecentActivitySet(supabase) {
  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_SECONDS * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('sd_id')
      .gte('created_at', since)
      .not('sd_id', 'is', null);
    if (error) return new Set();
    const set = new Set();
    for (const row of (data || [])) {
      if (row.sd_id) set.add(row.sd_id);
    }
    return set;
  } catch {
    return new Set();
  }
}

// ─── FR1.d: Sibling-session-branch ───────────────────────────────────────────
/**
 * Build a Map<sdKey, Set<sessionId>> of sessions whose worktree_branch references
 * a feat/SD-* branch and whose heartbeat is recent.
 *
 * The map key is the inferred sdKey extracted from worktree_branch. Caller
 * supplies their own session_id so they can exclude themselves from the result.
 */
async function buildSiblingSessionMap(supabase) {
  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_SECONDS * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, worktree_branch, status, heartbeat_at')
      .gte('heartbeat_at', since)
      .not('worktree_branch', 'is', null);
    if (error) return new Map();
    const map = new Map();
    for (const row of (data || [])) {
      const branch = row.worktree_branch || '';
      const m = branch.match(/(?:^feat\/|\/feat\/)?(SD-[A-Z0-9-]+)/);
      if (!m) continue;
      const key = m[1];
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(row.session_id);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Triangulate claim health across all signal sources.
 *
 * @param {object} supabase - Supabase client
 * @param {string} [sdKey] - Optional specific SD key to check (null = all)
 * @param {object} [opts] - Optional knobs
 * @param {string} [opts.mySessionId] - Current session_id, excluded from sibling-session-branch detection
 * @returns {Promise<{healthy: Array, orphaned: Array, ghost: Array, discrepancies: Array}>}
 */
export async function triangulate(supabase, sdKey = null, opts = {}) {
  const mySessionId = opts.mySessionId || process.env.CLAUDE_SESSION_ID || null;
  const healthy = [];
  const orphaned = [];
  const ghost = [];
  const discrepancies = [];

  // Signal 1: Get all active/idle session claims from DB (includes process_alive_at for FR3)
  let sessionQuery = supabase
    .from('claude_sessions')
    .select('session_id, sd_key, status, heartbeat_at, process_alive_at, terminal_id, pid, hostname')
    .in('status', ['active', 'idle'])
    .not('sd_key', 'is', null);

  if (sdKey) {
    sessionQuery = sessionQuery.eq('sd_key', sdKey);
  }

  const { data: sessions } = await sessionQuery;

  // Signal 2: Get all SDs with is_working_on = true (need id for FR1.c sub-agent activity lookup)
  let sdQuery = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, is_working_on, claiming_session_id, status')
    .eq('is_working_on', true);

  if (sdKey) {
    sdQuery = sdQuery.eq('sd_key', sdKey);
  }

  const { data: workingSDs } = await sdQuery;

  // Signal 3: Get active worktrees
  const worktrees = getActiveWorktrees();

  // FR1.a: Build branch set (1 git call, cached per invocation)
  const branchSet = listFeatSdBranches();

  // FR1.b: Build plan-file set (1 fs scan)
  const planSet = listPlanFiles();

  // FR1.c: Build recent sub-agent activity set (1 DB query, 5-min window)
  const activitySdIdSet = await buildRecentActivitySet(supabase);

  // FR1.d: Build sibling-session map (1 DB query, 5-min window)
  const siblingMap = await buildSiblingSessionMap(supabase);

  // Build claim map from sessions
  const sessionClaims = new Map();
  for (const s of (sessions || [])) {
    sessionClaims.set(s.sd_key, s);
  }

  // Build working-on map from SDs (sdKey -> sd row, includes id for activity lookup)
  const sdWorkingOn = new Map();
  for (const sd of (workingSDs || [])) {
    sdWorkingOn.set(sd.sd_key, sd);
  }

  // Collect all unique SD keys from all sources
  const allSdKeys = new Set([
    ...sessionClaims.keys(),
    ...sdWorkingOn.keys(),
    ...worktrees.keys(),
    ...siblingMap.keys()
  ]);

  // If sdKey filter is set, narrow the iteration
  const iterKeys = sdKey ? new Set([sdKey]) : allSdKeys;

  for (const key of iterKeys) {
    const sessionClaim = sessionClaims.get(key);
    const sdRecord = sdWorkingOn.get(key);
    const worktree = worktrees.get(key);

    // FR3: Hardened PID liveness — require BOTH process.kill failure AND tick recency failure for PID_DEAD
    let pidAlive = false;
    let tickRecent = false;
    if (sessionClaim) {
      const pid = sessionClaim.pid || extractPidFromSessionId(sessionClaim.session_id);
      pidAlive = pid ? isProcessRunning(pid) : false;
      tickRecent = hasRecentTick(sessionClaim.process_alive_at);
    }
    const pidDead = sessionClaim ? (!pidAlive && !tickRecent) : false;

    // FR1: Evidence-of-life signals
    const branchPresent = hasBranchForSd(branchSet, key);
    const planFilePresent = hasPlanFileForSd(planSet, key);
    const sdUuid = sdRecord?.id || null;
    const recentSubAgentActivity = sdUuid ? activitySdIdSet.has(sdUuid) : false;
    const siblings = siblingMap.get(key) || new Set();
    // Exclude my own session — siblings means OTHER live sessions on the same branch
    const otherSiblings = mySessionId
      ? new Set([...siblings].filter(s => s !== mySessionId))
      : siblings;
    const siblingSessionOnBranch = otherSiblings.size > 0;

    const signals = {
      hasSessionClaim: !!sessionClaim,
      hasIsWorkingOn: !!sdRecord,
      hasWorktree: !!worktree,
      pidAlive,
      tickRecent,                      // FR3
      heartbeatStale: false,
      branchPresent,                   // FR1.a
      planFilePresent,                 // FR1.b
      recentSubAgentActivity,          // FR1.c
      siblingSessionOnBranch           // FR1.d
    };

    if (sessionClaim) {
      const heartbeatAge = sessionClaim.heartbeat_at
        ? (Date.now() - new Date(sessionClaim.heartbeat_at).getTime()) / 1000
        : Infinity;
      signals.heartbeatStale = heartbeatAge > 300; // 5 minutes
    }

    // Aggregate evidence-of-life. Used by reclaim-protection and ghost classification.
    const evidenceOfLifeSignals = [];
    if (signals.branchPresent) evidenceOfLifeSignals.push('branch_present');
    if (signals.planFilePresent) evidenceOfLifeSignals.push('plan_file_present');
    if (signals.recentSubAgentActivity) evidenceOfLifeSignals.push('recent_sub_agent_activity');
    if (signals.siblingSessionOnBranch) evidenceOfLifeSignals.push('sibling_session_on_branch');
    if (signals.tickRecent) evidenceOfLifeSignals.push('tick_recent');
    if (signals.pidAlive) evidenceOfLifeSignals.push('pid_alive');
    const hasEvidenceOfLife = evidenceOfLifeSignals.length > 0;

    const entry = {
      sdKey: key,
      signals,
      sessionId: sessionClaim?.session_id || null,
      heartbeatAge: sessionClaim?.heartbeat_at
        ? Math.round((Date.now() - new Date(sessionClaim.heartbeat_at).getTime()) / 1000)
        : null,
      processAliveAge: sessionClaim?.process_alive_at
        ? Math.round((Date.now() - new Date(sessionClaim.process_alive_at).getTime()) / 1000)
        : null,
      worktreePath: worktree?.path || null,
      worktreeHasChanges: worktree?.hasChanges || false,
      evidenceOfLifeSignals,           // FR1: surfaces which signals fired
      siblingSessionIds: [...otherSiblings]
    };

    // ── Classification ──────────────────────────────────────────────────────
    if (signals.hasSessionClaim && (signals.pidAlive || signals.tickRecent) && !signals.heartbeatStale) {
      // Healthy: alive by either PID or tick, recent heartbeat
      healthy.push({ ...entry, category: 'healthy', action: null });
    } else if (signals.hasSessionClaim && pidDead && !hasEvidenceOfLife) {
      // FR3 hardened ghost: BOTH PID dead AND tick stale AND no other evidence of life
      ghost.push({
        ...entry,
        category: 'ghost',
        action: `Safe to release: PID dead AND tick stale AND no evidence of life. Heartbeat ${entry.heartbeatAge}s.`,
        autoReleasable: true
      });
    } else if (signals.hasSessionClaim && pidDead && hasEvidenceOfLife) {
      // FR3 + FR1: PID/tick dead but other evidence of life present — DO NOT auto-release
      discrepancies.push({
        ...entry,
        category: 'evidence_of_life_no_pid',
        action: `BLOCK reclaim: PID dead and tick stale but evidence of life present (${evidenceOfLifeSignals.join(', ')}). Likely cross-shell or restarted CC conversation.`,
        autoReleasable: false
      });
    } else if (signals.hasSessionClaim && signals.heartbeatStale && (signals.pidAlive || signals.tickRecent)) {
      // Stale heartbeat but alive — may be under heavy load
      discrepancies.push({
        ...entry,
        category: 'stale_alive',
        action: `Heartbeat stale (${entry.heartbeatAge}s) but ${signals.pidAlive ? 'PID alive' : 'tick recent'} — may be busy`,
        autoReleasable: false
      });
    } else if (!signals.hasSessionClaim && (signals.hasIsWorkingOn || signals.hasWorktree || hasEvidenceOfLife)) {
      // Orphan: no session claim but evidence (is_working_on, worktree, branch, plan, activity, sibling)
      const evidence = [];
      if (signals.hasIsWorkingOn) evidence.push('is_working_on=true');
      if (signals.hasWorktree) evidence.push(`worktree exists at ${worktree.path}`);
      for (const sig of evidenceOfLifeSignals) evidence.push(sig);
      const reclaimSafe = !hasEvidenceOfLife;
      orphaned.push({
        ...entry,
        category: 'orphaned',
        action: reclaimSafe
          ? `Re-claim with: npm run sd:start ${key}`
          : `BLOCK reclaim without --force-reclaim: evidence of life present (${evidenceOfLifeSignals.join(', ')})`,
        evidence,
        reclaimSafe,
        autoReleasable: reclaimSafe
      });
    } else if (signals.hasSessionClaim && !signals.hasWorktree && !signals.hasIsWorkingOn) {
      // Session claims it but nothing else agrees
      discrepancies.push({
        ...entry,
        category: 'session_only',
        action: 'Session claims SD but no worktree or is_working_on flag — possible stale claim'
      });
    }
  }

  return { healthy, orphaned, ghost, discrepancies };
}

/**
 * Convenience: pre-claim gate. Returns { allowReclaim, evidence, classification } so callers
 * (sd-start.js) can fail closed when evidence of life is detected without --force-reclaim.
 *
 * @param {object} supabase
 * @param {string} sdKey - SD to attempt claim on
 * @param {object} [opts]
 * @param {string} [opts.mySessionId]
 * @returns {Promise<{allowReclaim: boolean, evidence: string[], classification: string|null, entry: object|null}>}
 */
export async function checkPreClaimEvidence(supabase, sdKey, opts = {}) {
  const result = await triangulate(supabase, sdKey, opts);
  // Look for the SD in any classification bucket
  const buckets = ['healthy', 'discrepancies', 'orphaned', 'ghost'];
  for (const b of buckets) {
    const entry = result[b].find(e => e.sdKey === sdKey);
    if (!entry) continue;
    const evidence = entry.evidenceOfLifeSignals || [];
    // Allow reclaim only if classified as ghost OR orphaned-with-no-evidence
    let allow;
    if (entry.category === 'ghost') allow = true;
    else if (entry.category === 'orphaned' && entry.reclaimSafe === true) allow = true;
    else allow = false;
    return {
      allowReclaim: allow,
      evidence,
      classification: entry.category,
      entry
    };
  }
  // No record found anywhere — SD is unclaimed and clean. Reclaim is allowed.
  return {
    allowReclaim: true,
    evidence: [],
    classification: null,
    entry: null
  };
}

/**
 * Format triangulation results as human-readable report.
 */
export function formatHealthReport(results) {
  const { healthy, orphaned, ghost, discrepancies } = results;
  const lines = [];

  lines.push('');
  lines.push('  \x1b[1mClaim Health Report\x1b[0m');
  lines.push('  ' + '='.repeat(60));

  if (healthy.length > 0) {
    lines.push('');
    lines.push('  \x1b[32m✅ HEALTHY (' + healthy.length + ')\x1b[0m');
    for (const h of healthy) {
      lines.push('    ' + h.sdKey);
      lines.push('      Session: ' + h.sessionId + ' | Heartbeat: ' + h.heartbeatAge + 's | tick: ' + (h.processAliveAge ?? 'n/a') + 's');
      if (h.worktreePath) lines.push('      Worktree: ✓');
    }
  }

  if (orphaned.length > 0) {
    lines.push('');
    lines.push('  \x1b[33m⚠️  ORPHANED (' + orphaned.length + ')\x1b[0m');
    for (const o of orphaned) {
      lines.push('    ' + o.sdKey + (o.reclaimSafe ? '' : ' [evidence-of-life]'));
      lines.push('      Evidence: ' + o.evidence.join(', '));
      lines.push('      → ACTION: ' + o.action);
    }
  }

  if (ghost.length > 0) {
    lines.push('');
    lines.push('  \x1b[31m👻 GHOST (' + ghost.length + ')\x1b[0m');
    for (const g of ghost) {
      lines.push('    ' + g.sdKey);
      lines.push('      Session: ' + g.sessionId + ' | Heartbeat: ' + g.heartbeatAge + 's | tick: ' + (g.processAliveAge ?? 'n/a') + 's');
      lines.push('      → ' + g.action);
    }
  }

  if (discrepancies.length > 0) {
    lines.push('');
    lines.push('  \x1b[35m🔍 DISCREPANCIES (' + discrepancies.length + ')\x1b[0m');
    for (const d of discrepancies) {
      lines.push('    ' + d.sdKey + ' [' + d.category + ']');
      if (d.evidenceOfLifeSignals?.length) {
        lines.push('      Evidence-of-life: ' + d.evidenceOfLifeSignals.join(', '));
      }
      lines.push('      → ' + d.action);
    }
  }

  if (healthy.length === 0 && orphaned.length === 0 && ghost.length === 0 && discrepancies.length === 0) {
    lines.push('');
    lines.push('  No active claims found.');
  }

  const total = healthy.length + orphaned.length + ghost.length + discrepancies.length;
  lines.push('');
  lines.push('  \x1b[2mSummary: ' + total + ' SD(s) | ' + healthy.length + ' healthy | ' + orphaned.length + ' orphaned | ' + ghost.length + ' ghost | ' + discrepancies.length + ' discrepancies\x1b[0m');
  lines.push('');

  return lines.join('\n');
}
