/**
 * Terminal Identity - Single Source of Truth
 * PAT-SESSION-IDENTITY-003 / RCA-MULTI-SESSION-CASCADE-001
 *
 * Centralized terminal identity computation for multi-session coordination.
 * ALL code that needs terminal_id MUST import from this module.
 *
 * Identity Model:
 *   Windows: SSE port + Claude Code ancestor PID (unique per conversation)
 *   Unix: TTY device path (hashed for privacy)
 *   Fallback: Parent PID (unstable but functional)
 *
 * Why centralized:
 *   Previously duplicated in 3 locations (session-manager, claim-gate, BaseExecutor).
 *   When ppid→sessionId fix was applied, BaseExecutor's inline copy was missed,
 *   causing a cascade of false claim conflicts and permanently blocked handoffs.
 *
 * RCA-MULTI-SESSION-IDENTITY-COLLISION-001 (2026-02-13):
 *   CLAUDE_CODE_SSE_PORT is per-extension, NOT per-conversation. Two Claude Code
 *   conversations in the same VS Code window share the same SSE port, causing
 *   identical terminal_ids and session adoption collisions. Fix: walk the process
 *   tree to find the Claude Code node process PID (unique per conversation).
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import os from 'os';

// Cache the Claude Code ancestor PID — stable for the lifetime of this process
let _cachedCCPid = null;

/**
 * Scan all running node.exe processes for one whose command line contains
 * the CLAUDE_CODE_SSE_PORT value. This is the fallback when the ancestry
 * tree walk fails due to orphaned bash shells breaking the chain.
 *
 * SD-LEO-FIX-TERMINAL-IDENTITY-001 (FR-1, FR-4)
 *
 * @param {string} ssePort - The SSE port to match in command line args
 * @returns {string|null} The matching process PID, or null if not found
 */
function scanForClaudeCodeProcess(ssePort) {
  try {
    const script = [
      '$procs = Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" -ErrorAction SilentlyContinue',
      '$results = @()',
      'foreach ($p in $procs) {',
      `  if ($p.ProcessId -ne ${process.pid} -and $p.CommandLine -and $p.CommandLine -match '${ssePort}') {`,
      '    $results += "$($p.ProcessId)|$($p.CommandLine)"',
      '  }',
      '}',
      '$results -join ";"'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    }).trim();
    if (!raw) return null;

    // Parse results and return the first match
    const entries = raw.split(';').filter(Boolean);
    for (const entry of entries) {
      const [pid] = entry.split('|');
      if (pid && /^\d+$/.test(pid)) {
        return pid;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find the Claude Code node process PID by walking up the process tree.
 * The Claude Code process is the node.exe ancestor whose parent is cmd.exe
 * (or another non-node process). In the tree:
 *   node(us) → bash → bash → bash → node(Claude Code) → cmd → ...
 *
 * Falls back to process scan (scanForClaudeCodeProcess) when the ancestry
 * walk fails — typically due to orphaned bash shells from Bash tool breaking
 * the chain (RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001).
 *
 * @returns {string|null} The Claude Code process PID, or null if not found
 */
function findClaudeCodePid() {
  if (_cachedCCPid !== null) return _cachedCCPid;

  // Method 1: Walk the process ancestry chain
  const pidFromTreeWalk = _findClaudeCodePidViaTreeWalk();
  if (pidFromTreeWalk) {
    _cachedCCPid = pidFromTreeWalk;
    return _cachedCCPid;
  }

  // Method 2: Fallback — scan all node.exe processes for SSE port match
  // SD-LEO-FIX-TERMINAL-IDENTITY-001 (FR-1)
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (ssePort) {
    console.log(`[terminal-identity] Tree walk failed, falling back to process scan for SSE port ${ssePort}`);
    const pidFromScan = scanForClaudeCodeProcess(ssePort);
    if (pidFromScan) {
      console.log(`[terminal-identity] Process scan found Claude Code PID: ${pidFromScan}`);
      _cachedCCPid = pidFromScan;
      return _cachedCCPid;
    }
    console.log('[terminal-identity] Process scan found no matching process');
  }

  return null;
}

/**
 * Walk the process ancestry chain to find Claude Code's node PID.
 * @returns {string|null}
 */
function _findClaudeCodePidViaTreeWalk() {
  try {
    // Single PowerShell call to get full process ancestry chain.
    // Uses -EncodedCommand to avoid all shell escaping issues.
    // Note: $pid is read-only in PowerShell, so we use $p instead
    const script = [
      `$p = ${process.pid}`,
      '$chain = @()',
      'while ($p -and $p -ne 0) {',
      '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue',
      '  if (-not $proc) { break }',
      '  $chain += "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)"',
      '  $p = $proc.ParentProcessId',
      '}',
      '$chain -join ";"'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10000
    }).trim();
    if (!raw) return null;

    const chain = raw.split(';').map(entry => {
      const [pid, name, ppid] = entry.split('|');
      return { pid, name: (name || '').toLowerCase(), ppid };
    });

    // Walk from our process upward. Find the first node.exe whose parent
    // is NOT node.exe/bash/sh — that's the Claude Code process.
    // Skip index 0 (that's us).
    for (let i = 1; i < chain.length; i++) {
      const proc = chain[i];
      if (proc.name === 'node.exe' || proc.name === 'node') {
        const parent = chain[i + 1];
        // Claude Code's node parent is typically cmd.exe, powershell.exe,
        // or a terminal host — not another node or bash
        if (!parent || !['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh'].includes(parent.name)) {
          return proc.pid;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get stable terminal identifier for session coordination.
 *
 * On Windows: Uses CLAUDE_CODE_SSE_PORT + Claude Code ancestor PID to
 * uniquely identify each conversation. SSE port alone is shared across
 * conversations in the same VS Code window; the ancestor PID disambiguates.
 * Falls back to Windows console session ID if env var is unavailable.
 *
 * On Unix: Uses the TTY device path, hashed for cleaner IDs.
 *
 * @returns {string} Terminal identifier (e.g., "win-cc-55188-4468" or "tty-a4b3c2d1")
 */
export function getTerminalId() {
  try {
    if (process.platform === 'win32') {
      const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
      if (ssePort) {
        // Disambiguate with Claude Code ancestor PID (unique per conversation)
        const ccPid = findClaudeCodePid();
        if (ccPid) {
          return `win-cc-${ssePort}-${ccPid}`;
        }
        // If ancestor walk fails, fall back to SSE port only (legacy behavior)
        return `win-cc-${ssePort}`;
      }
      // Fallback: Windows console session ID (shared across all instances
      // in the same desktop session - less ideal for multi-instance)
      try {
        const cmd = `powershell -NoProfile -Command "(Get-Process -Id ${process.pid}).SessionId"`;
        const sessionId = execSync(cmd, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000
        }).trim();
        if (sessionId && /^\d+$/.test(sessionId)) {
          return `win-session-${sessionId}`;
        }
      } catch {
        // PowerShell unavailable or failed
      }
      return `win-pid-${process.pid}`;
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
