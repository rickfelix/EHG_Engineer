/**
 * Cross-Platform Process Utilities
 *
 * Provides Windows-compatible alternatives to Linux process commands:
 * - lsof -> find-process (by port)
 * - pkill -> tree-kill
 * - ps aux | grep -> find-process (by name)
 *
 * Created: 2026-01-12 (Windows Migration)
 */

import findProcess from 'find-process';
import treeKill from 'tree-kill';
import { promisify } from 'util';

const treeKillAsync = promisify(treeKill);

/**
 * Find process(es) using a specific port
 * Cross-platform replacement for: lsof -i :PORT
 *
 * @param {number} port - Port number to check
 * @returns {Promise<Array>} Array of processes using the port
 */
export async function findByPort(port) {
  try {
    const processes = await findProcess('port', port);
    return processes;
  } catch (error) {
    console.warn(`Error finding processes on port ${port}:`, error.message);
    return [];
  }
}

/**
 * Check if a port is in use
 * Cross-platform replacement for: lsof -i :PORT (boolean check)
 *
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if port is in use
 */
export async function isPortInUse(port) {
  const processes = await findByPort(port);
  return processes.length > 0;
}

/**
 * Find process(es) by name pattern
 * Cross-platform replacement for: ps aux | grep PATTERN
 *
 * @param {string} name - Process name to search for
 * @returns {Promise<Array>} Array of matching processes
 */
export async function findByName(name) {
  try {
    const processes = await findProcess('name', name);
    return processes;
  } catch (error) {
    console.warn(`Error finding processes by name "${name}":`, error.message);
    return [];
  }
}

/**
 * Kill a process by PID (and all its children)
 * Cross-platform replacement for: kill -9 PID or pkill
 *
 * @param {number} pid - Process ID to kill
 * @param {string} signal - Signal to send (default: SIGKILL)
 * @returns {Promise<void>}
 */
export async function killProcess(pid, signal = 'SIGKILL') {
  try {
    await treeKillAsync(pid, signal);
  } catch (error) {
    // Process may already be dead
    if (!error.message?.includes('not found') && !error.message?.includes('No such process')) {
      console.warn(`Error killing process ${pid}:`, error.message);
    }
  }
}

/**
 * Kill ONE process — never its descendants — honouring graceful-vs-forced on every platform.
 *
 * WHY THIS EXISTS SEPARATELY FROM killProcess. killProcess goes through tree-kill, which on win32
 * shells out to `taskkill /pid N /T /F`. Two consequences that are wrong for a *session* kill:
 *
 *   1. `/T` terminates every DESCENDANT. A fleet seat's claude process routinely parents a dev
 *      server, a leo-stack, background shells — killing the seat took all of them with it.
 *   2. The signal argument is IGNORED on win32; `/F` is unconditional. So a documented
 *      "SIGTERM, then escalate to SIGKILL" sequence was, on the only platform this fleet runs on,
 *      two identical forced kills. The agent never got a chance to flush, which is precisely the
 *      property a module named "graceful kill" claims to provide. The escalation was decorative.
 *
 * Here, `taskkill /PID n` WITHOUT /F is the genuine Windows analogue of SIGTERM — it asks the
 * process to close and lets it run its exit path — and /F is reserved for the escalation. The
 * distinction the caller writes is therefore the distinction that actually happens.
 *
 * lib/fleet/console-reaper.mjs already reached the single-process conclusion independently; this
 * generalises it rather than adding a third spelling.
 *
 * @param {number} pid
 * @param {string} signal - 'SIGKILL' forces; anything else requests a graceful close
 * @returns {Promise<void>} resolves even when the process was already gone
 */
export async function killProcessOnly(pid, signal = 'SIGKILL') {
  const force = signal === 'SIGKILL';
  try {
    if (process.platform === 'win32') {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const args = force ? ['/PID', String(pid), '/F'] : ['/PID', String(pid)];
      await promisify(execFile)('taskkill', args);
    } else {
      process.kill(pid, signal);
    }
  } catch (error) {
    // Already gone is success, not failure — the caller wanted the process not running.
    const msg = String(error?.message || error);
    if (error?.code === 'ESRCH' || /not found|no such process|not running/i.test(msg)) return;
    console.warn(`Error killing process ${pid}:`, msg);
  }
}

/**
 * Kill all processes using a specific port
 * Cross-platform replacement for: lsof -t -i :PORT | xargs kill -9
 *
 * @param {number} port - Port number
 * @returns {Promise<number>} Number of processes killed
 */
export async function killByPort(port) {
  const processes = await findByPort(port);
  let killed = 0;

  for (const proc of processes) {
    try {
      await killProcess(proc.pid);
      killed++;
    } catch (_error) {
      // Continue killing other processes
    }
  }

  return killed;
}

/**
 * Kill all processes matching a name pattern
 * Cross-platform replacement for: pkill -f PATTERN
 *
 * @param {string} namePattern - Process name pattern to match
 * @returns {Promise<number>} Number of processes killed
 */
export async function killByName(namePattern) {
  const processes = await findByName(namePattern);
  let killed = 0;

  for (const proc of processes) {
    // Skip our own process
    if (proc.pid === process.pid) continue;

    try {
      await killProcess(proc.pid);
      killed++;
    } catch (_error) {
      // Continue killing other processes
    }
  }

  return killed;
}

/**
 * Wait for a port to become available
 *
 * @param {number} port - Port to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @param {number} interval - Check interval in milliseconds (default: 500)
 * @returns {Promise<boolean>} True if port became available
 */
export async function waitForPortAvailable(port, timeout = 30000, interval = 500) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (!(await isPortInUse(port))) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Wait for a port to become active (something listening)
 *
 * @param {number} port - Port to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @param {number} interval - Check interval in milliseconds (default: 500)
 * @returns {Promise<boolean>} True if port became active
 */
export async function waitForPortActive(port, timeout = 30000, interval = 500) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await isPortInUse(port)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

export default {
  findByPort,
  isPortInUse,
  findByName,
  killProcess,
  killByPort,
  killByName,
  waitForPortAvailable,
  waitForPortActive
};
