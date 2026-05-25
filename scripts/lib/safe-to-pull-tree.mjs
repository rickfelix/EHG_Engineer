#!/usr/bin/env node
/**
 * safe-to-pull-tree — is it safe for leo-stack to ff-pull a primary tree?
 *
 * Follow-up to the leo-stack restart-pull work (#3939/#3940). The existing
 * Sync-Repo guards skip the pull on a feature branch or when there are uncommitted
 * tracked changes. This adds the missing case: a CLEAN primary tree (on main) that
 * another live Claude Code session is actively working in. `git merge --ff-only`
 * rewrites tracked files, and doing that under an active session mutates files
 * mid-session — the concurrent-session "internal error" class that
 * concurrent-session-worktree.cjs exists to prevent.
 *
 * "Idle" = no OTHER live session (active|idle, fresh heartbeat) is on the branch
 * being pulled (main). Sessions isolated in a git worktree sit on their own feat/*
 * branch, so they are naturally excluded — a primary-tree pull can't touch them.
 * v_active_sessions (the SSOT, read directly here) does not populate
 * codebase/worktree_path, so current_branch is the only reliable signal; this is
 * intentionally branch-centric and conservative across both repos — over-skipping
 * just serves local, the existing safe fallback. The invoking session excludes
 * itself via CLAUDE_SESSION_ID.
 *
 *   node scripts/lib/safe-to-pull-tree.mjs [branch=main]
 *
 * Output: a line starting with "BUSY" or "IDLE" — leo-stack keys on this token, so a
 * crash/error (which prints neither, or "UNKNOWN") fails OPEN to the existing
 * ff-only safety. Exit: 0 idle | 1 busy | 2 unknown. A minimal client
 * (autoRefreshToken/persistSession off) is used so the process exits cleanly with
 * the intended code instead of the libuv-teardown crash the shared client triggers.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const branch = (process.argv[2] || 'main').trim();
const self = process.env.CLAUDE_SESSION_ID || null;
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('UNKNOWN missing supabase credentials');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// v_active_sessions already excludes stale rows (computed_status drives liveness).
const { data, error } = await sb
  .from('v_active_sessions')
  .select('session_id,computed_status,current_branch')
  .in('computed_status', ['active', 'idle']);

if (error) {
  console.log(`UNKNOWN session query failed: ${error.message}`);
  process.exit(2);
}

// Other (non-self) live sessions on the branch we are about to fast-forward.
// Only count current_branch === target: a null branch is a not-yet-stamped /
// telemetry session, not a confirmed primary-tree occupant.
const occupants = (data || []).filter(
  (s) => s && s.session_id !== self && s.current_branch === branch
);

if (occupants.length > 0) {
  const who = occupants
    .map((s) => `${String(s.session_id || '?').slice(0, 8)}(${s.computed_status || '?'})`)
    .join(', ');
  console.log(`BUSY ${occupants.length} other session(s) on '${branch}': ${who}`);
  process.exit(1);
}

console.log(`IDLE no other sessions on '${branch}'`);
process.exit(0);
