#!/usr/bin/env node
/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — the reaper runner.
 *
 * Wires the pure decisions (console-reaper.mjs, console-parentage.mjs) to real Win32 process
 * enumeration. This is the file setup-console-reaper-task.mjs refuses to register until it exists.
 *
 * CHAIRMAN OVERRIDE 2026-07-27 — the reaper SHIPS rather than observing for a week. Behind its own
 * default-off flag all the same (FLEET_CONSOLE_REAPER_ENABLED), because "authorised" and "armed on
 * every host by default" are different things.
 *
 * WHAT IT REAPS: OpenConsole processes with ZERO descendants. The safety argument is the
 * ASYMMETRY — the test is "contains no process", so a false positive cannot destroy work. It does
 * NOT reason about which seat owns which console, because seat-to-window binding is impossible
 * post-hoc and a Cursor pane has no window at all.
 *
 * THE PROBE IS FAIL-CLOSED. Every enumeration returns {ok}. A failed WMIC/PowerShell call yields
 * ok:false and the run does NOTHING — it never degrades into "saw zero consoles", which is the
 * FR-5a defect that made a timed-out enumeration indistinguishable from an empty desktop.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reapEmptyConsoles } from '../lib/fleet/console-reaper.mjs';
import { buildParentageRecord } from '../lib/fleet/console-parentage.mjs';

const execFileAsync = promisify(execFile);
const TAG = '[console-reaper]';
export const CONSOLE_IMAGE = 'OpenConsole.exe';
/** Generous: the FR-5a lesson is that a tight margin on a ~5s enumeration fails 2 runs in 3. */
export const PROBE_TIMEOUT_MS = 20000;

export function isConsoleReaperEnabled(env = process.env) {
  return env.FLEET_CONSOLE_REAPER_ENABLED === 'on';
}

/**
 * One PowerShell round-trip returning every process as {pid, ppid, name, cmd}. Parsed from CSV
 * rather than JSON because a single-row result serialises as an object, not an array — a shape
 * difference that silently yields "one process" or a crash depending on the host's load.
 */
export async function snapshotProcesses({ exec = execFileAsync } = {}) {
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Csv -NoTypeInformation';
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: PROBE_TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, processes: parseProcessCsv(stdout), error: null };
  } catch (err) {
    const timedOut = Boolean(err && (err.killed || err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM'));
    return {
      ok: false,
      processes: null, // NOT [] — there is no observation to report
      error: { code: 'GUARD_UNAVAILABLE', timedOut, message: (err && err.message) || String(err) },
    };
  }
}

/** Minimal CSV reader for the four fixed columns above (CommandLine may contain commas/quotes). */
export function parseProcessCsv(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length <= 1) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    const pid = Number(cells[0]);
    if (!Number.isFinite(pid)) continue;
    out.push({ pid, ppid: Number(cells[1]), name: cells[2] || '', cmd: cells[3] || '' });
  }
  return out;
}

/** Descendant count for a pid, from a snapshot. Direct children are sufficient: a console with a
 *  child is occupied regardless of how deep the tree goes below it. */
export function descendantCountOf(pid, processes) {
  return processes.filter((p) => p.ppid === pid).length;
}

export function findConsoles(processes) {
  return processes.filter((p) => String(p.name).toLowerCase() === CONSOLE_IMAGE.toLowerCase());
}

/** Parentage for a console, resolved from the SAME snapshot that found it. */
export function parentageFor(consoleProc, processes, nowIso) {
  const parent = processes.find((p) => p.pid === consoleProc.ppid) || null;
  const grand = parent ? processes.find((p) => p.pid === parent.ppid) || null : null;
  return buildParentageRecord({
    consolePid: consoleProc.pid,
    observedAt: nowIso,
    parentPid: parent ? parent.pid : null,
    parentImage: parent ? parent.name : null,
    parentCommandLine: parent ? parent.cmd : null,
    grandparentPid: grand ? grand.pid : null,
    grandparentImage: grand ? grand.name : null,
  });
}

export async function runReaperOnce(deps = {}) {
  const {
    env = process.env,
    snapshot = snapshotProcesses,
    kill = async (pid) => { await execFileAsync('taskkill', ['/PID', String(pid), '/F'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true }); },
    onLog = (m) => console.log(`${TAG} ${m}`),
    nowIso = new Date().toISOString(),
    dryRun = false,
  } = deps;

  if (!isConsoleReaperEnabled(env)) {
    return { ran: false, reason: 'FLEET_CONSOLE_REAPER_ENABLED is not on' };
  }

  const snap = await snapshot();
  if (!snap.ok) {
    // FAIL-CLOSED. "I could not look" must never become "there was nothing to see".
    onLog(`ABORT: ${snap.error.message} — the process table was NOT observed; doing nothing`);
    return { ran: false, reason: snap.error.code, timedOut: snap.error.timedOut };
  }

  const consoles = findConsoles(snap.processes);
  // Parentage is captured for EVERY console seen, not only the ones reaped: the creator is still
  // unidentified, and a console that is occupied now is exactly the one worth attributing.
  const parentage = consoles.map((c) => parentageFor(c, snap.processes, nowIso));
  const attributed = parentage.filter((p) => p.ok).length;
  onLog(`observed ${consoles.length} console(s); parentage attributed for ${attributed}/${consoles.length}`);

  const candidates = consoles
    .filter((c) => descendantCountOf(c.pid, snap.processes) === 0)
    .map((c) => ({ pid: c.pid }));

  if (dryRun) {
    onLog(`DRY RUN — would reap ${candidates.length} empty console(s): ${candidates.map((c) => c.pid).join(', ') || 'none'}`);
    return { ran: true, dryRun: true, observed: consoles.length, candidates: candidates.length, parentage };
  }

  const result = await reapEmptyConsoles(candidates, {
    // Re-observe RIGHT BEFORE each kill, from a FRESH snapshot — the whole point is that the scan
    // above is already stale by the time we act on it.
    recheckDescendants: async (pid) => {
      const fresh = await snapshot();
      if (!fresh.ok) return { observed: false };
      return { descendantCount: descendantCountOf(pid, fresh.processes), observed: true };
    },
    kill,
    onLog,
  });

  return { ran: true, observed: consoles.length, parentage, ...result };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only — the reaper reads the Windows process table.`);
    process.exit(2);
  }
  const out = await runReaperOnce({ dryRun });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ran ? 0 : 1);
}

if (process.argv[1]?.endsWith('run-console-reaper.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
