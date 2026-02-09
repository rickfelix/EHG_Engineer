/**
 * Terminal Identity - Single Source of Truth
 * PAT-SESSION-IDENTITY-003 / RCA-MULTI-SESSION-CASCADE-001
 *
 * Centralized terminal identity computation for multi-session coordination.
 * ALL code that needs terminal_id MUST import from this module.
 *
 * Identity Model:
 *   Windows: Console session ID (stable across Node.js subprocesses)
 *   Unix: TTY device path (hashed for privacy)
 *   Fallback: Parent PID (unstable but functional)
 *
 * Why centralized:
 *   Previously duplicated in 3 locations (session-manager, claim-gate, BaseExecutor).
 *   When ppid→sessionId fix was applied, BaseExecutor's inline copy was missed,
 *   causing a cascade of false claim conflicts and permanently blocked handoffs.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import os from 'os';

/**
 * Get stable terminal identifier for session coordination.
 *
 * On Windows: Uses PowerShell to query the console session ID, which is
 * stable across all Node.js subprocesses spawned from the same terminal.
 *
 * On Unix: Uses the TTY device path, hashed for cleaner IDs.
 *
 * @returns {string} Terminal identifier (e.g., "win-session-1" or "tty-a4b3c2d1")
 */
export function getTerminalId() {
  try {
    if (process.platform === 'win32') {
      try {
        const cmd = `powershell -Command "(Get-Process -Id ${process.pid}).SessionId"`;
        const sessionId = execSync(cmd, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        if (sessionId && /^\d+$/.test(sessionId)) {
          return `win-session-${sessionId}`;
        }
      } catch {
        // PowerShell unavailable or failed - fall through to ppid
      }
      return `win-ppid-${process.ppid || process.pid}`;
    }
    // Unix: Use TTY device path, hashed for cleaner ID
    const tty = execSync('tty', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return `tty-${crypto.createHash('sha256').update(tty).digest('hex').substring(0, 12)}`;
  } catch {
    return `pid-${process.ppid || process.pid}`;
  }
}

/**
 * Get raw TTY identifier (for session manager backward compat).
 * On Unix: returns the TTY path. On Windows: returns win-{pid}.
 * @returns {string}
 */
export function getTTY() {
  try {
    if (process.platform === 'win32') {
      return `win-${process.pid}`;
    }
    return execSync('tty', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get machine identifier (hostname hash).
 * @returns {string} Machine ID (e.g., "923879b6d20f949c")
 */
export function getMachineId() {
  try {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const machineString = `${hostname}-${platform}-${arch}`;
    return crypto.createHash('sha256').update(machineString).digest('hex').substring(0, 16);
  } catch {
    return 'unknown';
  }
}

export default { getTerminalId, getTTY, getMachineId };
