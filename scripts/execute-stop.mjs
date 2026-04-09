#!/usr/bin/env node
/**
 * scripts/execute-stop.mjs
 *
 * Cross-session graceful stop for /execute multi-session execution teams.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3)
 * Source: ARCH-EXECUTE-COMMAND-001 § Implementation Phases > Phase 3
 *
 * Usage:
 *   node scripts/execute-stop.mjs --all                # Stop all active teams
 *   node scripts/execute-stop.mjs --team <uuid>        # Stop a specific team
 *   node scripts/execute-stop.mjs --callsign Alpha     # Stop only one worker (advisory)
 *   node scripts/execute-stop.mjs --grace-period 90    # Override 60s default
 *   node scripts/execute-stop.mjs --force              # Skip WIP guard (dangerous)
 *
 * Behavior:
 *   1. Query execute_teams WHERE status IN (active, stopping)
 *   2. For each target team:
 *      a. Verify supervisor_pid alive (process.kill(pid, 0))
 *         If dead → mark status=crashed, skip signal
 *      b. Lookup worker worktrees via metadata.slots → claude_sessions
 *      c. Run WIP guard (unless --force)
 *      d. If WIP detected: insert SAVE_WARNING into session_coordination, defer
 *      e. Insert STOP_REQUESTED for each worker virtual session
 *      f. process.kill(supervisor_pid, "SIGTERM")
 *      g. Idempotent: if status already 'stopping', skip signal
 *
 * Cross-platform note: process.kill(pid, "SIGTERM") on Windows sends a generic
 * terminate signal. The Supervisor in scripts/execute-team.mjs has a SIGTERM
 * handler that calls halt() — that's where the actual graceful exit happens.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const wipGuard = require('../lib/execute/wip-guard.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const opts = { team: null, callsign: null, all: false, gracePeriodSec: 60, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--team' && argv[i + 1]) opts.team = argv[++i];
    else if (a === '--callsign' && argv[i + 1]) opts.callsign = argv[++i];
    else if (a === '--all') opts.all = true;
    else if (a === '--grace-period' && argv[i + 1]) opts.gracePeriodSec = parseInt(argv[++i], 10);
    else if (a === '--force') opts.force = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/execute-stop.mjs [--team <uuid>] [--callsign <NATO>] [--all] [--grace-period <sec>] [--force]');
      process.exit(0);
    }
  }
  // Default to --all if nothing specified
  if (!opts.team && !opts.callsign && !opts.all) opts.all = true;
  return opts;
}

async function loadActiveTeams(opts) {
  let query = supabase
    .from('execute_teams')
    .select('team_id, status, supervisor_pid, worker_session_ids, metadata, started_at')
    .in('status', ['active', 'stopping']);

  if (opts.team) query = query.eq('team_id', opts.team);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to query execute_teams: ${error.message}`);
  return data || [];
}

async function fetchWorkerWorktrees(workerSessionIds) {
  if (!workerSessionIds || workerSessionIds.length === 0) return {};
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, worktree_path')
    .in('session_id', workerSessionIds);
  if (error) {
    console.error(`[execute-stop] Failed to fetch worker worktrees: ${error.message}`);
    return {};
  }
  const map = {};
  for (const s of (data || [])) map[s.session_id] = s.worktree_path;
  return map;
}

async function emitCoordinationMessage(targetSession, messageType, subject, payload = {}) {
  const { error } = await supabase.from('session_coordination').insert({
    target_session: targetSession,
    message_type: messageType,
    subject,
    payload
  });
  if (error) {
    console.error(`[execute-stop] Failed to emit ${messageType} for ${targetSession}: ${error.message}`);
  }
}

async function markTeamCrashed(teamId, note) {
  const { error } = await supabase
    .from('execute_teams')
    .update({
      status: 'crashed',
      stopped_at: new Date().toISOString(),
      stop_reason: `supervisor_pid_dead: ${note}`
    })
    .eq('team_id', teamId);
  if (error) console.error(`[execute-stop] Failed to mark crashed: ${error.message}`);
}

async function markTeamStopping(teamId, reason) {
  const { error } = await supabase
    .from('execute_teams')
    .update({ status: 'stopping', stop_reason: reason })
    .eq('team_id', teamId);
  if (error) console.error(`[execute-stop] Failed to mark stopping: ${error.message}`);
}

async function processTeam(team, opts) {
  const teamId = team.team_id;
  console.log(`\n[execute-stop] Processing team ${teamId} (status=${team.status}, pid=${team.supervisor_pid})`);

  // Idempotent: skip if already stopping
  if (team.status === 'stopping') {
    console.log(`  → already stopping, skipping (idempotent)`);
    return { teamId, action: 'skipped_already_stopping' };
  }

  // Liveness check
  if (!wipGuard.isProcessAlive(team.supervisor_pid)) {
    console.log(`  → supervisor_pid ${team.supervisor_pid} is not alive, marking crashed`);
    await markTeamCrashed(teamId, `pid_not_alive`);
    return { teamId, action: 'marked_crashed' };
  }

  // Build worker list with worktree paths
  const slots = (team.metadata && team.metadata.slots) || [];
  const sidsWanted = slots.map((s) => s.virtual_session_id).filter(Boolean);
  const worktrees = await fetchWorkerWorktrees(sidsWanted);

  let workers = slots.map((s) => ({
    slot: s.slot,
    callsign: s.callsign,
    virtual_session_id: s.virtual_session_id,
    worktree_path: worktrees[s.virtual_session_id] || null
  }));

  // Optional callsign filter (advisory — actual signal still goes to supervisor)
  if (opts.callsign) {
    workers = workers.filter((w) => w.callsign && w.callsign.toLowerCase() === opts.callsign.toLowerCase());
    if (workers.length === 0) {
      console.log(`  → no worker matches callsign "${opts.callsign}" in team ${teamId}, skipping`);
      return { teamId, action: 'skipped_no_callsign_match' };
    }
  }

  // WIP guard (unless --force)
  let wipResult = { anyDirty: false, dirtyWorkers: [], cleanWorkers: [] };
  if (!opts.force) {
    wipResult = wipGuard.checkAllWorkersWIP(workers);
    if (wipResult.anyDirty) {
      console.log(`  → WIP detected on ${wipResult.dirtyWorkers.length} worker(s):`);
      for (const w of wipResult.dirtyWorkers) {
        console.log(`     ${w.callsign}: ${w.files.length} dirty file(s)`);
        await emitCoordinationMessage(
          w.virtual_session_id || `slot_${w.slot}`,
          'SAVE_WARNING',
          `Commit WIP before exit (graceful shutdown requested)`,
          { files: w.files }
        );
      }
      console.log(`  → SAVE_WARNING messages emitted; signal still sent (workers will see message between SDs)`);
    }
  } else {
    console.log(`  → --force: skipping WIP guard`);
  }

  // STOP_REQUESTED messages for each worker virtual session
  for (const w of workers) {
    if (w.virtual_session_id) {
      await emitCoordinationMessage(
        w.virtual_session_id,
        'STOP_REQUESTED',
        `Graceful shutdown requested by chairman`,
        { team_id: teamId, slot: w.slot, callsign: w.callsign, grace_period_sec: opts.gracePeriodSec }
      );
    }
  }

  // Mark stopping
  const stopReason = opts.force ? 'manual_stop_forced' : 'manual_stop';
  await markTeamStopping(teamId, stopReason);

  // Send SIGTERM to supervisor
  try {
    process.kill(team.supervisor_pid, 'SIGTERM');
    console.log(`  → SIGTERM sent to supervisor pid=${team.supervisor_pid}`);
  } catch (err) {
    console.error(`  → SIGTERM failed: ${err.message}`);
    // Don't crash — supervisor may have died between liveness check and signal
    if (err.code === 'ESRCH') {
      await markTeamCrashed(teamId, 'pid_died_between_check_and_signal');
      return { teamId, action: 'crashed_during_signal' };
    }
    return { teamId, action: 'signal_failed', error: err.message };
  }

  return {
    teamId,
    action: 'signaled',
    workersSignaled: workers.length,
    wipWorkers: wipResult.dirtyWorkers.length
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`/execute stop — opts: ${JSON.stringify(opts)}`);

  const teams = await loadActiveTeams(opts);
  if (teams.length === 0) {
    console.log('\n(no active teams to stop)');
    process.exitCode = 0;
    return;
  }

  console.log(`Found ${teams.length} active/stopping team(s)`);

  const results = [];
  for (const team of teams) {
    try {
      results.push(await processTeam(team, opts));
    } catch (err) {
      console.error(`[execute-stop] Error processing team ${team.team_id}: ${err.message}`);
      results.push({ teamId: team.team_id, action: 'error', error: err.message });
    }
  }

  console.log('\n──────────────────────────────────────');
  console.log('SUMMARY');
  for (const r of results) {
    console.log(`  ${r.teamId}: ${r.action}` + (r.workersSignaled != null ? ` (${r.workersSignaled} workers, ${r.wipWorkers} WIP)` : ''));
  }
  console.log('──────────────────────────────────────');

  // Set exit code (avoid process.exit to keep supabase keep-alive sockets from tripping libuv on Windows)
  const allOk = results.every((r) => r.action === 'signaled' || r.action === 'skipped_already_stopping' || r.action === 'marked_crashed' || r.action === 'skipped_no_callsign_match');
  process.exitCode = allOk ? 0 : 1;
}

const _entry = process.argv[1] || '';
const isMain = import.meta.url === `file://${_entry}` ||
  import.meta.url === `file:///${_entry.replace(/\\/g, '/')}`;
if (isMain) {
  main().catch((err) => {
    console.error('execute-stop fatal error:', err);
    process.exitCode = 1;
  });
}

export { parseArgs, processTeam, loadActiveTeams };
