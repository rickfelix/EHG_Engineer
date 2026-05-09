#!/usr/bin/env node
/**
 * Session Concurrency Check
 *
 * Detects other active Claude Code sessions on the same repo and reports
 * whether working-tree contention is likely. Run at any time during a
 * session (not only at start) to verify isolation before multi-file
 * Write/Edit work.
 *
 * Exit codes:
 *   0 - isolated (no concurrent sessions on same branch)
 *   1 - concurrent session(s) detected on same or ambiguous branch
 *   2 - could not determine state (missing credentials, query error)
 *
 * Usage:
 *   node scripts/session-check-concurrency.js
 *   npm run session:check-concurrency
 *
 * Complements the SessionStart auto-worktree hook
 * (scripts/hooks/concurrent-session-worktree.cjs) which only fires once
 * at session start based on point-in-time data. This CLI gives any
 * session a way to re-check mid-run.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR4): use the canonical
// getActiveSessions helper from session-manager.mjs instead of a local
// inline query. Both `sd:next` (via its session-manager usage) and this
// CLI now read from the same SSOT, satisfying the AC4 requirement that
// both report the same active-session list within 1-second skew.
import { getActiveSessions } from '../lib/session-manager.mjs';
// SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-7): drift detection requires
// reading the active SD claim for the current branch.
import { createClient } from '@supabase/supabase-js';

/**
 * Categorize a session row for the concurrency report (SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001).
 *
 * Replaces the old single `computed_status === 'active'` post-filter that excluded
 * idle/stale-cleanup peers — even when those peers held UNCOMMITTED writes that would
 * collide with the local session. The 2026-05-09 incident in feedback row e805894f
 * showed 2 of 3 writers were already STALE_CLEANUP at the moment of detection but
 * still actively writing files; the old filter dropped them silently.
 *
 * @param {Object} session
 * @returns {'active'|'idle_uncommitted'|'stale_uncommitted'|'inactive'}
 */
export function categorizeSessionForContention(session) {
  if (!session) return 'inactive';
  const status = session.computed_status;
  const dirty = session.has_uncommitted_changes === true;
  if (status === 'active') return 'active';
  if (status === 'idle' && dirty) return 'idle_uncommitted';
  if ((status === 'stale' || status === 'stale_cleanup') && dirty) return 'stale_uncommitted';
  return 'inactive';
}

/**
 * Detect sd_key drift for a peer session on the same branch as my active claim.
 * Returns 'drift' when the peer's sd_key is null OR differs from the active claim's
 * sd_key, indicating the peer might write files that belong to a different SD context.
 *
 * @param {Object} session - peer session row
 * @param {string|null} activeClaimSdKey - sd_key of the active claim on this branch
 * @returns {'drift'|'aligned'|'unknown'}
 */
export function detectSdKeyDrift(session, activeClaimSdKey) {
  if (!activeClaimSdKey) return 'unknown';
  if (!session) return 'unknown';
  if (!session.sd_key) return 'drift';
  if (session.sd_key !== activeClaimSdKey) return 'drift';
  return 'aligned';
}

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function getMySessionId() {
  return process.env.CLAUDE_SESSION_ID || null;
}

async function main() {
  const branch = getCurrentBranch();
  const mySid = getMySessionId();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[session:check-concurrency] missing SUPABASE_URL/SERVICE_ROLE_KEY — cannot query sessions');
    process.exit(2);
  }

  // SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-1 rescoped): widen the contention
  // filter to include idle/stale_cleanup peers IF they hold uncommitted writes.
  // Validation-agent at PLAN-PRD prospective (row e9ec8e72) confirmed the source
  // incident was NOT cross-host — 2 of 3 writers were already STALE_CLEANUP at
  // moment of detection but had uncommitted Growth Playbook UI writes; the old
  // active-only post-filter excluded them. Now: active surfaces always; idle/stale
  // surfaces only with has_uncommitted_changes=true.
  let allSessions;
  try {
    allSessions = await getActiveSessions();
  } catch (err) {
    console.error('[session:check-concurrency] query failed:', err.message);
    process.exit(2);
  }

  const data = (allSessions || []).filter(s => categorizeSessionForContention(s) !== 'inactive');
  const others = (data || []).filter(s => s.session_id !== mySid);

  // SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-7): sd_key drift detection.
  // Read the active SD claim for the current branch, compare each peer's sd_key.
  let activeClaimSdKey = null;
  if (branch && url && key) {
    try {
      const sb = createClient(url, key);
      const { data: claim } = await sb
        .from('strategic_directives_v2')
        .select('sd_key')
        .not('claiming_session_id', 'is', null)
        .or(`metadata->>branch.eq.${branch},sd_key.like.%${branch.replace(/^feat\//, '')}%`)
        .limit(1)
        .maybeSingle();
      activeClaimSdKey = claim?.sd_key ?? null;
    } catch {
      // Drift detection is best-effort — failure does not abort contention check.
    }
  }

  // Same-branch contention: branch match, or either side is on main, or
  // the other session's branch is unknown (null).
  const onSameOrAmbiguousBranch = others.filter(s => {
    if (!s.current_branch) return true;
    if (!branch) return true;
    if (s.current_branch === branch) return true;
    if (s.current_branch === 'main' || branch === 'main') return true;
    return false;
  });

  if (onSameOrAmbiguousBranch.length === 0) {
    console.log('[ISOLATED] No contention detected.');
    console.log(`  Branch: ${branch || '(unknown)'}`);
    console.log(`  My session: ${mySid || '(CLAUDE_SESSION_ID not set)'}`);
    if (others.length > 0) {
      console.log(`  (${others.length} active session(s) on other branches — no contention)`);
    }
    process.exit(0);
  }

  console.log('');
  console.log('[CONCURRENT SESSIONS DETECTED]');
  console.log('='.repeat(60));
  console.log(`  My branch:  ${branch || '(unknown)'}`);
  console.log(`  My session: ${mySid || '(CLAUDE_SESSION_ID not set)'}`);
  console.log('');
  console.log('  Other sessions on this branch (incl. idle/stale with uncommitted writes):');
  for (const s of onSameOrAmbiguousBranch) {
    const cat = categorizeSessionForContention(s);
    const drift = detectSdKeyDrift(s, activeClaimSdKey);
    console.log(`    - ${s.session_id}`);
    console.log(`        sd_key:    ${s.sd_key || '(none)'}${drift === 'drift' ? '  [DRIFT]' : ''}`);
    console.log(`        branch:    ${s.current_branch || '(unknown)'}`);
    console.log(`        category:  ${cat}`);
    console.log(`        heartbeat: ${s.heartbeat_age_human || '(unknown)'}`);
    console.log(`        host:      ${s.hostname || '(unknown)'}`);
  }
  console.log('');
  console.log('  Working-tree contention risk. Options:');
  console.log('    1. Create a worktree for this session:   npm run session:worktree');
  console.log('    2. Coordinate writes with the other session(s)');
  console.log('    3. If the other session is dead but its heartbeat is recent,');
  console.log('       release via the LEO claim CLI before proceeding');
  console.log('');
  process.exit(1);
}

main().catch(e => {
  console.error('[session:check-concurrency] error:', e.message);
  process.exit(2);
});
