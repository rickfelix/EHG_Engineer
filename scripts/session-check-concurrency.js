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
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

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

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id,sd_key,current_branch,heartbeat_age_human,computed_status,hostname')
    .eq('computed_status', 'active');

  if (error) {
    console.error('[session:check-concurrency] query failed:', error.message);
    process.exit(2);
  }

  const others = (data || []).filter(s => s.session_id !== mySid);

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
  console.log(`  Other active sessions (same or ambiguous branch):`);
  for (const s of onSameOrAmbiguousBranch) {
    console.log(`    - ${s.session_id}`);
    console.log(`        sd_key:    ${s.sd_key || '(none)'}`);
    console.log(`        branch:    ${s.current_branch || '(unknown)'}`);
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
