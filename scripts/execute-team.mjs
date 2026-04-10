#!/usr/bin/env node
/**
 * execute-team.mjs
 *
 * Multi-session execution team supervisor.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-004)
 * Source: ARCH-EXECUTE-COMMAND-001 § Implementation Phases > Phase 1
 *
 * Spawns N detached `claude --print` worker children that each claim and work
 * one SD via /leo next → /sd-start → /ship → /learn → exit. The supervisor:
 *   - Runs pre-flight (node_modules, DB, claim gate RPC)
 *   - Creates execute_teams row + virtual claude_sessions per slot
 *   - Spawns workers staggered 2s apart with sanitized env (Guardrail 8)
 *   - Monitors child PIDs; on clean exit, increments counter and respawns
 *   - On dirty exit, records failure → checks circuit breaker → halts if tripped
 *
 * Usage:
 *   node scripts/execute-team.mjs --workers 1 [--track A|B|C] [--team-id <uuid>] [--dry-run]
 *
 * Phase 1 acceptance: a real 1-worker pilot must succeed on Windows 11 BEFORE
 * Children B/C/Parent build on top.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { runChecks as runPreflight } from '../lib/execute/execute-preflight.mjs';
import {
  createTeam,
  updateTeamStatus,
  persistCircuitBreaker,
  incrementCounter,
  MAX_WORKERS
} from '../lib/execute/execute-team-factory.mjs';
import { recordFailure, initState as initCircuitBreaker } from '../lib/execute/execute-circuit-breaker.mjs';
import { terminateVirtualSession } from '../lib/virtual-session-factory.mjs';
import { getOrCreateSession } from '../lib/session-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

const SPAWN_STAGGER_MS = 2000;

/**
 * Parse CLI args.
 */
function parseArgs(argv) {
  const opts = { workers: 3, track: null, teamId: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workers' && argv[i + 1]) { opts.workers = parseInt(argv[++i], 10); }
    else if (a === '--track' && argv[i + 1]) { opts.track = argv[++i]; }
    else if (a === '--team-id' && argv[i + 1]) { opts.teamId = argv[++i]; }
    else if (a === '--dry-run') { opts.dryRun = true; }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/execute-team.mjs [--workers N] [--track A|B|C] [--team-id <uuid>] [--dry-run]');
      process.exit(0);
    }
  }
  if (isNaN(opts.workers) || opts.workers < 1 || opts.workers > MAX_WORKERS) {
    console.error(`Error: --workers must be between 1 and ${MAX_WORKERS}`);
    process.exit(2);
  }
  if (opts.track && !['A', 'B', 'C', 'STANDALONE'].includes(opts.track)) {
    console.error(`Error: --track must be A, B, C, or STANDALONE`);
    process.exit(2);
  }
  return opts;
}

/**
 * GUARDRAIL 8: Build a sanitized worker env.
 * Strips SUPABASE_SERVICE_ROLE_KEY so workers can't perform service-role writes.
 */
function buildWorkerEnv(slotIndex, teamId, parentSessionId) {
  const env = { ...process.env };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  env.EXECUTE_TEAM_ID = teamId;
  env.EXECUTE_SLOT = String(slotIndex);
  env.EXECUTE_PARENT_SESSION = parentSessionId || '';
  env.EXECUTE_AGENT = 'true';
  return env;
}

/**
 * Pick the right `claude` binary for the platform.
 */
function getClaudeBinary() {
  return process.platform === 'win32' ? 'claude.cmd' : 'claude';
}

/**
 * Ensure log directory exists for a team.
 */
function ensureLogDir(teamId) {
  const dir = path.join(REPO_ROOT, 'logs', 'execute', `team-${teamId}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Supervisor state — tracks active workers per slot.
 */
class Supervisor {
  constructor({ supabase, teamId, slots, opts, parentSessionId }) {
    this.supabase = supabase;
    this.teamId = teamId;
    this.slots = slots; // [{slot, callsign, color, virtual_session_id}]
    this.opts = opts;
    this.parentSessionId = parentSessionId;
    this.activeChildren = new Map(); // slot → child process
    this.cbState = initCircuitBreaker();
    this.halted = false;
    this.logDir = ensureLogDir(teamId);
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] [supervisor] ${msg}`;
    console.log(line);
    try {
      fs.appendFileSync(path.join(this.logDir, 'supervisor.log'), line + '\n');
    } catch { /* best effort */ }
  }

  /**
   * Spawn a worker for a slot. Returns the child handle.
   */
  spawnWorker(slot) {
    const binary = getClaudeBinary();
    // QF-20260409-889: On Windows, `.cmd` files cannot be launched directly
    // via child_process.spawn (EINVAL). Use the documented workaround:
    // `cmd.exe /d /s /c claude.cmd <args>`. CreateProcess still escapes each
    // arg individually (preserving the large quoted prompt), while cmd.exe /c
    // runs the target literally. `shell:true` is NOT used because DEP0190 in
    // Node 20+ stopped escaping args in shell mode.
    const isWin = process.platform === 'win32';
    const spawnCmd = isWin ? 'cmd.exe' : binary;
    const env = buildWorkerEnv(slot.slot, this.teamId, this.parentSessionId);
    const logPath = path.join(this.logDir, `${slot.callsign.toLowerCase()}.log`);
    const out = fs.openSync(logPath, 'a');
    const err = fs.openSync(logPath, 'a');

    const claudeArgs = [
      '--print',
      '--dangerously-skip-permissions',
      '-p',
      `You are LEO Protocol worker ${slot.callsign} (slot ${slot.slot}, team ${this.teamId}). ` +
      `Pick the next workable SD from the queue via /leo next, then execute the full ` +
      `LEAD→PLAN→EXEC→SHIP→LEARN lifecycle. Never call AskUserQuestion. Never auto-approve ` +
      `pending_approval SDs. Use intelligent assumptions on ambiguity. Invoke the RCA sub-agent ` +
      `on failure. ` +
      // SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3): graceful shutdown protocol
      `BETWEEN SDs (after /learn, before /leo next): query session_coordination for STOP_REQUESTED ` +
      `messages with target_session=${slot.virtual_session_id}. If found, exit 0 cleanly without ` +
      `claiming the next SD. Also check for SAVE_WARNING messages — if present, run "git stash save ` +
      `\\"WIP from team ${this.teamId}\\"" before exit to preserve in-progress work. ` +
      `When done, exit cleanly.`
    ];

    const spawnArgs = isWin ? ['/d', '/s', '/c', binary, ...claudeArgs] : claudeArgs;
    this.log(`Slot ${slot.slot} (${slot.callsign}): spawning ${binary} → ${logPath}`);

    let child;
    try {
      child = spawn(spawnCmd, spawnArgs, {
        cwd: REPO_ROOT,
        detached: true,
        stdio: ['ignore', out, err],
        windowsHide: true,
        env
      });
    } catch (spawnErr) {
      fs.closeSync(out); fs.closeSync(err);
      this.log(`Slot ${slot.slot}: spawn failed: ${spawnErr.message}`);
      throw spawnErr;
    }

    fs.closeSync(out); fs.closeSync(err);

    child.on('exit', async (code, signal) => {
      this.activeChildren.delete(slot.slot);
      this.log(`Slot ${slot.slot} (${slot.callsign}): exited code=${code} signal=${signal}`);

      if (this.halted) return;

      if (code === 0) {
        const { value } = await incrementCounter(this.supabase, this.teamId, 'sds_completed');
        this.log(`Slot ${slot.slot}: clean exit, sds_completed=${value}`);
        // Phase 1 scope: respawn the same slot
        // (Phase 4 will add queue-empty detection to stop respawning)
        setTimeout(() => this.respawnSlot(slot).catch((e) => this.log(`Respawn error: ${e.message}`)), 500);
      } else {
        const { value } = await incrementCounter(this.supabase, this.teamId, 'sds_failed');
        this.log(`Slot ${slot.slot}: dirty exit (code=${code}), sds_failed=${value}`);
        const { state, halted } = recordFailure(this.cbState);
        this.cbState = state;
        await persistCircuitBreaker(this.supabase, this.teamId, state);

        if (halted) {
          this.log(`🔴 CIRCUIT BREAKER TRIPPED — halting team`);
          await this.halt('circuit_breaker_tripped');
        } else {
          setTimeout(() => this.respawnSlot(slot).catch((e) => this.log(`Respawn error: ${e.message}`)), 500);
        }
      }
    });

    this.activeChildren.set(slot.slot, child);
    return child;
  }

  async respawnSlot(slot) {
    if (this.halted) return;
    this.log(`Slot ${slot.slot} (${slot.callsign}): respawning`);
    this.spawnWorker(slot);
  }

  /**
   * Spawn all slots staggered.
   */
  async spawnAll() {
    for (let i = 0; i < this.slots.length; i++) {
      try {
        this.spawnWorker(this.slots[i]);
      } catch (e) {
        this.log(`Initial spawn for slot ${this.slots[i].slot} failed: ${e.message}`);
        await this.halt('initial_spawn_failed');
        return false;
      }
      if (i < this.slots.length - 1) {
        await new Promise((r) => setTimeout(r, SPAWN_STAGGER_MS));
      }
    }
    await updateTeamStatus(this.supabase, this.teamId, 'active');
    this.log(`Team active: ${this.slots.length} workers running`);
    return true;
  }

  async halt(reason, gracePeriodSec = 60) {
    if (this.halted) return;
    this.halted = true;
    this.log(`Halting team: ${reason} (grace period ${gracePeriodSec}s)`);
    await updateTeamStatus(this.supabase, this.teamId, 'stopping', { stop_reason: reason });

    // Send SIGTERM to all active children
    // QF-20260409-087: On Windows, process.kill(cmdExePid, 'SIGTERM') is
    // TerminateProcess — it kills the cmd.exe shell but leaves the claude.cmd
    // /node grandchildren as orphans. Skip the initial SIGTERM on Windows and
    // rely on workers seeing STOP_REQUESTED via session_coordination polling
    // to exit cleanly. Survivors get taskkill /T /F after the grace period.
    const isWin = process.platform === 'win32';
    const childrenAtHalt = new Map(this.activeChildren); // snapshot
    if (!isWin) {
      for (const [slot, child] of childrenAtHalt.entries()) {
        try {
          this.log(`Slot ${slot}: sending SIGTERM to PID ${child.pid}`);
          process.kill(child.pid, 'SIGTERM');
        } catch (e) {
          this.log(`Slot ${slot}: kill failed: ${e.message}`);
        }
      }
    } else {
      this.log(`Windows: skipping SIGTERM (would leak orphans); workers exit via STOP_REQUESTED polling, survivors taskkilled after grace period`);
    }

    // SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3):
    // Grace period polling — wait up to gracePeriodSec for clean child exits.
    // The 'exit' event handler in spawnWorker removes children from activeChildren on exit,
    // so we just poll until either all gone or grace period exceeded.
    const graceMs = Math.max(0, gracePeriodSec) * 1000;
    const pollIntervalMs = 1000;
    const startWait = Date.now();
    let escalated = false;

    while (this.activeChildren.size > 0 && (Date.now() - startWait) < graceMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Escalate to SIGKILL for any unresponsive children
    // QF-20260409-087: Use taskkill /T /F on Windows to kill the whole process
    // tree rooted at cmd.exe; plain SIGKILL would leak claude.cmd/node orphans.
    if (this.activeChildren.size > 0) {
      escalated = true;
      this.log(`Grace period exceeded — force-killing ${this.activeChildren.size} unresponsive child(ren)`);
      for (const [slot, child] of this.activeChildren.entries()) {
        try {
          if (isWin) {
            this.log(`Slot ${slot}: taskkill /T /F PID ${child.pid} (tree)`);
            execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
          } else {
            this.log(`Slot ${slot}: sending SIGKILL to PID ${child.pid}`);
            process.kill(child.pid, 'SIGKILL');
          }
        } catch (e) {
          this.log(`Slot ${slot}: force-kill failed: ${e.message}`);
        }
      }
    }

    // Release virtual sessions
    for (const slot of this.slots) {
      await terminateVirtualSession(slot.virtual_session_id, `team_halted_${reason}`);
    }

    // Final status update — include escalation note if applicable
    const finalReason = escalated ? `${reason}_grace_period_exceeded_kill_escalated` : reason;
    await updateTeamStatus(this.supabase, this.teamId, 'stopped', { stop_reason: finalReason });
    this.log(`Team stopped (${finalReason})`);

    // Exit non-zero only if a non-graceful path triggered halt and we had to escalate
    process.exitCode = (reason === 'sigterm' && !escalated) ? 0 : (escalated ? 1 : 0);
  }

  installSignalHandlers() {
    const handler = () => { this.halt('sigterm').catch(() => {}); };
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  }
}

/**
 * Print dry-run summary and exit.
 */
function printDryRun(opts, slots, preflight) {
  console.log('=== /execute team — DRY RUN ===');
  console.log(`workers: ${opts.workers}`);
  console.log(`track: ${opts.track || '(any)'}`);
  console.log('slots:');
  for (const s of slots) {
    console.log(`  slot ${s.slot} = ${s.callsign} (${s.color})`);
  }
  console.log('pre-flight summary:');
  for (const line of preflight.summary) console.log(line);
  console.log(`pre-flight overall: ${preflight.ok ? 'PASS' : 'FAIL'}`);
  console.log('next: would create execute_teams row, virtual sessions, then spawn workers');
  console.log('(no DB writes performed in dry-run mode)');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const supabase = createSupabaseServiceClient();

  // Run pre-flight first — even in dry-run mode
  const preflight = await runPreflight(supabase);

  // QF-20260409-889: Resolve a real chairman session row BEFORE createTeam().
  // process.env.CLAUDE_SESSION_ID is NOT auto-exported from the CC host, so
  // trusting it here caused virtual-session inserts to violate the FK
  // claude_sessions_parent_session_id_fkey (the orphan_supervisor_<pid>
  // fallback string is never inserted). Mirror the sd-drain.mjs pattern:
  // ensure a real claude_sessions row exists, use its session_id as parent.
  // Skip in dry-run to avoid touching the DB.
  let parentSessionId = null;
  if (!opts.dryRun) {
    const parentSession = await getOrCreateSession();
    parentSessionId = parentSession.session_id;
  }

  if (opts.dryRun) {
    // Build slot identities locally just for the preview
    const { buildSlotIdentities } = await import('../lib/execute/execute-team-factory.mjs');
    const slots = buildSlotIdentities(opts.workers).map((s) => ({ ...s, virtual_session_id: '<dry-run>' }));
    printDryRun(opts, slots, preflight);
    // Set exit code and return — calling process.exit() here trips libuv on Windows
    // because the supabase client still has pending HTTP keep-alive sockets.
    process.exitCode = preflight.ok ? 0 : 1;
    return;
  }

  if (!preflight.ok) {
    console.error('PRE-FLIGHT FAILED:');
    for (const line of preflight.summary) console.error(line);
    // Record a stopped team row so the failure is visible in the dashboard
    const cbInit = initCircuitBreaker();
    const { teamId, error: createErr } = await createTeam({
      supabase,
      spawnedBySession: parentSessionId,
      workerCount: opts.workers,
      trackFilter: opts.track,
      supervisorPid: process.pid,
      preflightResult: preflight,
      circuitBreakerInit: cbInit
    });
    if (!createErr && teamId) {
      await updateTeamStatus(supabase, teamId, 'stopped', { stop_reason: 'preflight_failed' });
    }
    process.exit(1);
  }

  // Real spawn path
  const cbInit = initCircuitBreaker();
  const { teamId, slots, error: createErr } = await createTeam({
    supabase,
    spawnedBySession: process.env.CLAUDE_SESSION_ID || null,
    workerCount: opts.workers,
    trackFilter: opts.track,
    supervisorPid: process.pid,
    preflightResult: preflight,
    circuitBreakerInit: cbInit
  });

  if (createErr) {
    console.error(`Team creation failed: ${createErr}`);
    process.exit(1);
  }

  console.log('=== /execute team — SPAWN ===');
  console.log(`team_id: ${teamId}`);
  console.log(`supervisor_pid: ${process.pid}`);
  console.log(`hostname: ${os.hostname()}`);
  console.log(`workers: ${opts.workers}`);
  console.log('slots:');
  for (const s of slots) {
    console.log(`  slot ${s.slot} = ${s.callsign} (${s.color}) → ${s.virtual_session_id}`);
  }
  console.log('pre-flight: PASS');
  console.log('logs: ' + path.join(REPO_ROOT, 'logs', 'execute', `team-${teamId}`));

  const supervisor = new Supervisor({
    supabase,
    teamId,
    slots,
    opts,
    parentSessionId
  });
  supervisor.installSignalHandlers();
  await supervisor.spawnAll();
  // Supervisor stays alive via the active 'exit' listeners on child processes
}

const _entry = process.argv[1] || '';
const isMain = import.meta.url === `file://${_entry}` ||
  import.meta.url === `file:///${_entry.replace(/\\/g, '/')}`;
if (isMain) {
  main().catch((err) => {
    console.error('Supervisor fatal error:', err);
    process.exit(1);
  });
}

export { Supervisor, parseArgs, buildWorkerEnv };
