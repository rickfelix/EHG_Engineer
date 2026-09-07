#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 / FR-2 — the live WMI event-source adapter.
 *
 * Wires lib/fleet/console-creation-watcher.mjs's injectable decision core (FR-1) to a REAL,
 * always-on WMI Win32_ProcessStartTrace subscription, scoped at the WQL level to OpenConsole.exe
 * so the listener is not paying attention (or CPU) to every process start on the host. Node has
 * no native WMI event binding, so the subscription itself runs inside a long-lived PowerShell
 * subprocess; each event line on its stdout is parsed and handed to handleProcessCreationEvent().
 *
 * SUPERVISION HAS TWO INDEPENDENT LAYERS, deliberately: this script restarts the PowerShell
 * subprocess if IT dies (subprocess-level, handled here); scripts/setup-console-creation-watcher-task.mjs
 * registers a Windows Scheduled Task that restarts THIS SCRIPT if the whole Node process dies
 * (OS-level, FR-3). Neither layer substitutes for the other.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { handleProcessCreationEvent } from '../lib/fleet/console-creation-watcher.mjs';
import { getRepoRoot } from '../lib/repo-paths.js';

const TAG = '[console-creation-watcher]';
export const CONSOLE_IMAGE = 'OpenConsole.exe';
/** Between-restart backoff for the PowerShell subprocess, so a fast crash-loop doesn't spin hot. */
export const RESTART_DELAY_MS = 5000;
/** QF-20260905-766: fail LOUD, not hot — after this many subprocess exits inside FAST_FAILURE_WINDOW_MS
 *  each, stop restarting instead of looping forever on an unfixable error (e.g. an elevation refusal). */
export const CONSECUTIVE_FAILURE_CEILING = 3;
export const FAST_FAILURE_WINDOW_MS = 60_000;
/** Singleton pid-file lock — QF-20260905-766: neither this script nor the scheduled task guarded
 *  against an orphaned instance (window closed / session change) plus a fresh 5-minute re-fire,
 *  which accumulated three live trees on the chairman's host. */
export const PID_LOCK_PATH = path.join(getRepoRoot(), '.claude', 'console-creation-watcher.pid');

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Returns the lock path on success, or null if a live instance already holds it. */
export function acquireSingletonLock(lockPath = PID_LOCK_PATH) {
  if (existsSync(lockPath)) {
    const existingPid = parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
    if (Number.isFinite(existingPid) && isPidAlive(existingPid)) return null;
  }
  writeFileSync(lockPath, String(process.pid));
  return lockPath;
}

export function releaseSingletonLock(lockPath = PID_LOCK_PATH) {
  try { unlinkSync(lockPath); } catch { /* already gone — fine */ }
}

/**
 * The PowerShell body: one JSON line per matching console-creation event on stdout.
 *
 * QF-20260905-766 (root cause): Win32_ProcessStartTrace requires elevation, and the shell on the
 * chairman's host is not elevated — every subscription attempt exited 1, restarted forever (5s
 * backoff, no ceiling) and the scheduled task (Interactive logon, so the failing loop opened a
 * VISIBLE console) re-fired every 5 minutes on top of the orphaned instances. DEFAULT is now the
 * intrinsic __InstanceCreationEvent source, which standard (non-elevated) users can subscribe to
 * on root\cimv2 — verified live, unelevated, on this host: registers with zero error and fires
 * within ~1s of a real process creation. elevated=true keeps the lower-latency ProcessStartTrace
 * source available as an opt-in for hosts that already run this elevated.
 */
export function buildWmiListenerScript({ elevated = false } = {}) {
  const query = elevated
    ? `SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName='${CONSOLE_IMAGE}'`
    : `SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_Process' AND TargetInstance.Name='${CONSOLE_IMAGE}'`;
  return [
    '$ErrorActionPreference = "Stop"',
    `$query = "${query}"`,
    'Register-WmiEvent -Query $query -SourceIdentifier ConsoleCreationWatch | Out-Null',
    'while ($true) {',
    '  $e = Wait-Event -SourceIdentifier ConsoleCreationWatch',
    elevated ? '  $pid_ = $e.SourceEventArgs.NewEvent.ProcessID' : '  $pid_ = $e.SourceEventArgs.NewEvent.TargetInstance.ProcessId',
    elevated ? '  $ppid = $e.SourceEventArgs.NewEvent.ParentProcessID' : '  $ppid = $e.SourceEventArgs.NewEvent.TargetInstance.ParentProcessId',
    '  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$ppid" -ErrorAction SilentlyContinue',
    '  $obj = [ordered]@{',
    '    pid = $pid_',
    '    image = "' + CONSOLE_IMAGE + '"',
    '    parentPid = $ppid',
    '    parentImage = $(if ($parent) { $parent.Name } else { $null })',
    '    parentCommandLine = $(if ($parent) { $parent.CommandLine } else { $null })',
    '    observedAt = (Get-Date).ToUniversalTime().ToString("o")',
    '  }',
    '  Write-Output ($obj | ConvertTo-Json -Compress)',
    '  Remove-Event -SourceIdentifier ConsoleCreationWatch',
    '}',
  ].join('\n');
}

/** Parse one line of the subprocess's stdout into an event object, or null if not a valid event line. */
export function parseEventLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.pid !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * A pid -> process-record lookup for the grandparent walk (FR-1's resolveParentage). One-shot
 * Get-CimInstance query per call — infrequent (only on a console creation, not per-tick).
 */
export async function lookupProcess(pid, { exec } = {}) {
  const run = exec || defaultExec;
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    if (!out || !out.trim()) return null;
    const row = JSON.parse(out);
    return { pid: row.ProcessId, parentPid: row.ParentProcessId ?? null, image: row.Name ?? null };
  } catch {
    return null;
  }
}

function defaultExec(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`))));
  });
}

/**
 * Run the listener: spawn the PowerShell subscription, handle each event, and restart the
 * subprocess (after RESTART_DELAY_MS) if it exits — for any reason, including a clean exit,
 * since this subscription is meant to run forever. Injectable spawnFn/onEvent/onLog so this is
 * unit-testable without a live subprocess or a live WMI dependency.
 *
 * @param {object} deps
 * @param {() => import('node:child_process').ChildProcess} [deps.spawnFn]
 * @param {(event: object) => Promise<any>} [deps.onEvent] - defaults to handleProcessCreationEvent wired to lookupProcess
 * @param {(msg: string) => void} [deps.onLog]
 * @param {() => boolean} [deps.shouldContinue] - injected so a test can stop the restart loop; defaults to "forever"
 * @param {(ms: number) => Promise<void>} [deps.delay]
 * @returns {Promise<{stopped: 'shouldContinue'|'consecutive_failures'}>}
 */
export async function runWatcher(deps = {}) {
  const {
    spawnFn = () => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildWmiListenerScript()], { windowsHide: true }),
    onEvent = (event) => handleProcessCreationEvent(event, { lookupFn: lookupProcess }),
    onLog = (m) => console.log(`${TAG} ${m}`),
    shouldContinue = () => true,
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = deps;

  let consecutiveFastFailures = 0;
  while (shouldContinue()) {
    onLog('starting WMI subscription subprocess');
    const startedAt = Date.now();
    const exitCode = await new Promise((resolve) => {
      const child = spawnFn();
      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const event = parseEventLine(line);
          if (event) onEvent(event).catch((err) => onLog(`event handling error: ${err.message}`));
        }
      });
      child.stderr?.on('data', (chunk) => onLog(`subprocess stderr: ${chunk.toString().trim()}`));
      child.on('error', (err) => { onLog(`subprocess spawn error: ${err.message}`); resolve(-1); });
      child.on('close', (code) => resolve(code));
    });
    const fastFailure = exitCode !== 0 && (Date.now() - startedAt) < FAST_FAILURE_WINDOW_MS;
    consecutiveFastFailures = fastFailure ? consecutiveFastFailures + 1 : 0;
    if (consecutiveFastFailures >= CONSECUTIVE_FAILURE_CEILING) {
      onLog(`${consecutiveFastFailures} consecutive fast failures (exit ${exitCode}) — stopping instead of restarting forever (fail loud, not hot)`);
      return { stopped: 'consecutive_failures' };
    }
    onLog(`subscription subprocess exited (code ${exitCode}) — restarting in ${RESTART_DELAY_MS}ms`);
    if (shouldContinue()) await delay(RESTART_DELAY_MS);
  }
  return { stopped: 'shouldContinue' };
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only — WMI is a Windows API.`);
    process.exit(2);
  }
  if (!acquireSingletonLock()) {
    console.log(`${TAG} another live instance already holds the lock (${PID_LOCK_PATH}) — exiting`);
    return;
  }
  process.on('exit', () => releaseSingletonLock());
  const elevated = process.env.CONSOLE_WATCHER_ELEVATED === '1';
  const result = await runWatcher(elevated ? {
    spawnFn: () => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildWmiListenerScript({ elevated: true })], { windowsHide: true }),
  } : {});
  if (result.stopped === 'consecutive_failures') process.exitCode = 1;
}

if (process.argv[1]?.endsWith('run-console-creation-watcher.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
