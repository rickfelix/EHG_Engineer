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
