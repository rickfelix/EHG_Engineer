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
import { handleProcessCreationEvent } from '../lib/fleet/console-creation-watcher.mjs';

const TAG = '[console-creation-watcher]';
export const CONSOLE_IMAGE = 'OpenConsole.exe';
/** Between-restart backoff for the PowerShell subprocess, so a fast crash-loop doesn't spin hot. */
export const RESTART_DELAY_MS = 5000;

/**
 * The PowerShell body: a WQL-scoped Win32_ProcessStartTrace subscription, one JSON line per
 * matching creation event on stdout. Scoped WHERE ProcessName='OpenConsole.exe' at the query
 * level (not filtered client-side after receiving every process start) to keep the always-on
 * subscription cheap. ParentProcessID/ProcessID are the only fields Win32_ProcessStartTrace
 * carries directly; the image name and grandparent are resolved via a follow-up Win32_Process
 * lookup for the (short-lived, still-live-at-this-instant) parent pid.
 */
export function buildWmiListenerScript() {
  return [
    '$ErrorActionPreference = "Stop"',
    `$query = "SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName='${CONSOLE_IMAGE}'"`,
    'Register-WmiEvent -Query $query -SourceIdentifier ConsoleCreationWatch | Out-Null',
    'while ($true) {',
    '  $e = Wait-Event -SourceIdentifier ConsoleCreationWatch',
    '  $pid_ = $e.SourceEventArgs.NewEvent.ProcessID',
    '  $ppid = $e.SourceEventArgs.NewEvent.ParentProcessID',
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
 */
export async function runWatcher(deps = {}) {
  const {
    spawnFn = () => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildWmiListenerScript()], { windowsHide: true }),
    onEvent = (event) => handleProcessCreationEvent(event, { lookupFn: lookupProcess }),
    onLog = (m) => console.log(`${TAG} ${m}`),
    shouldContinue = () => true,
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = deps;

  while (shouldContinue()) {
    onLog('starting WMI subscription subprocess');
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
    onLog(`subscription subprocess exited (code ${exitCode}) — restarting in ${RESTART_DELAY_MS}ms`);
    if (shouldContinue()) await delay(RESTART_DELAY_MS);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only — WMI is a Windows API.`);
    process.exit(2);
  }
  await runWatcher();
}

if (process.argv[1]?.endsWith('run-console-creation-watcher.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
