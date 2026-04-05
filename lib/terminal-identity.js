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
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the main repo root, even when running from a git worktree.
 * Worktrees have a different __dirname but share the .git directory.
 * SD-LEO-FIX-TERMINAL-IDENTITY-CWD-001: Fixes false claim conflicts
 * caused by marker file lookups resolving to worktree paths.
 * @returns {string} Absolute path to the main repo root
 */
function resolveRepoRoot() {
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: __dirname,
      timeout: 3000
    }).trim();
    // git-common-dir returns the .git dir (or relative path to it)
    // Resolve it relative to __dirname, then go up one level from .git
    const absGitDir = resolve(__dirname, gitCommonDir);
    return resolve(absGitDir, '..');
  } catch {
    // Fallback: assume __dirname is inside lib/ of the repo
    return resolve(__dirname, '..');
  }
}

const _repoRoot = resolveRepoRoot();

// Cache the Claude Code ancestor PID — stable for the lifetime of this process
// Uses undefined as "not yet searched", null as "searched but not found" (negative cache)
let _cachedCCPid = undefined;

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
  if (_cachedCCPid !== undefined) return _cachedCCPid;

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

  // Method 3 REMOVED (SD-LEO-FIX-DETERMINISTIC-FLEET-SESSION-001):
  // Marker file fallback picked the newest alive PID — the same file for all
  // sessions on the same machine — causing terminal_id collisions. Removed so
  // sessions fall through to unique-per-process identifiers (win-pid-N).

  // Negative cache: remember that lookup failed so we don't retry expensive scans
  _cachedCCPid = null;
  return null;
}

/**
 * Collect all ancestor PIDs of the current process via PowerShell.
 * Unlike findClaudeCodePid(), this doesn't try to identify WHICH ancestor
 * is Claude Code — it just returns the full set for marker file matching.
 *
 * @returns {Set<string>} Set of ancestor PID strings
 */
function _getAncestorPids() {
  const pids = new Set();
  try {
    const script = [
      `$p = ${process.pid}`,
      '$pids = @()',
      'while ($p -and $p -ne 0) {',
      '  $pids += $p',
      '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue',
      '  if (-not $proc) { break }',
      '  $p = $proc.ParentProcessId',
      '}',
      '$pids -join ","'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    }).trim();
    if (raw) {
      raw.split(',').forEach(pid => {
        const trimmed = pid.trim();
        if (trimmed && /^\d+$/.test(trimmed)) pids.add(trimmed);
      });
    }
  } catch { /* empty set on failure */ }
  return pids;
}

/**
 * Scan marker files in .claude/session-identity/ and match by process ancestry.
 * When findClaudeCodePid() fails (tree walk can't identify which node.exe is
 * Claude Code), this fallback collects ALL ancestor PIDs and checks if any
 * match a pid-*.json marker file written by the SessionStart hook.
 *
 * This breaks the collision where multiple sessions share win-cc-{port} because
 * each session's Claude Code PID is a different ancestor, mapping to a different
 * marker file with a unique session_id.
 *
 * @param {string} [ssePort] - Optional SSE port to filter markers
 * @returns {string|null} The session_id from the matching marker, or null
 */
function _scanMarkersByAncestry(ssePort) {
  try {
    const markerDir = resolve(_repoRoot, '.claude/session-identity');
    const ancestorPids = _getAncestorPids();
    if (ancestorPids.size === 0) return null;

    const files = readdirSync(markerDir).filter(f => f.startsWith('pid-') && f.endsWith('.json'));
    for (const file of files) {
      const pidMatch = file.match(/^pid-(\d+)\.json$/);
      if (!pidMatch) continue;
      if (ancestorPids.has(pidMatch[1])) {
        const marker = JSON.parse(readFileSync(resolve(markerDir, file), 'utf8'));
        // If SSE port is available, verify it matches (avoids cross-window confusion)
        if (ssePort && marker.sse_port && marker.sse_port !== ssePort) continue;
        if (marker.session_id) {
          return marker.session_id;
        }
      }
    }
  } catch { /* fall through */ }
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
        if (!parent || !['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh', 'powershell.exe', 'pwsh.exe'].includes(parent.name)) {
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
    // Priority 1: CLAUDE_SESSION_ID from SessionStart hook (unique per conversation)
    // Bypasses all process tree walking. Set via CLAUDE_ENV_FILE by
    // scripts/hooks/capture-session-id.cjs at session start.
    const claudeSessionId = process.env.CLAUDE_SESSION_ID;
    if (claudeSessionId) {
      return claudeSessionId;
    }

    // Priority 2: Match marker file by SSE port (no PowerShell needed).
    // The SessionStart hook writes pid-{ccPid}.json with sse_port inside.
    // Instead of discovering the ancestor PID (which requires PowerShell),
    // scan all marker files and match by CLAUDE_CODE_SSE_PORT — unique per conversation.
    // With 1-5 concurrent sessions, SSE port is an unambiguous identifier.
    const ssePortForMarker = process.env.CLAUDE_CODE_SSE_PORT;
    if (ssePortForMarker) {
      try {
        const markerDir = resolve(_repoRoot, '.claude/session-identity');
        const files = readdirSync(markerDir).filter(f => f.startsWith('pid-') && f.endsWith('.json'));
        // Sort by mtime descending — most recent first
        const sorted = files
          .map(f => ({ name: f, mtime: statSync(resolve(markerDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        for (const { name } of sorted) {
          const marker = JSON.parse(readFileSync(resolve(markerDir, name), 'utf8'));
          if (marker.sse_port === ssePortForMarker && marker.session_id) {
            return marker.session_id;
          }
        }
      } catch {
        // Marker scan failed — fall through
      }
    }

    // Priority 2b (legacy): Read by exact PID match if findClaudeCodePid succeeds.
    // This path still uses PowerShell but is no longer the primary mechanism.
    try {
      const ccPid = findClaudeCodePid();
      if (ccPid) {
        const markerPath = resolve(__dirname, '../.claude/session-identity', `pid-${ccPid}.json`);
        const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
        if (marker.session_id) {
          return marker.session_id;
        }
      }
    } catch {
      // Marker file missing or unreadable — fall through to process tree walk
    }

    if (process.platform === 'win32') {
      const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
      if (ssePort) {
        // Disambiguate with Claude Code ancestor PID (unique per conversation)
        const ccPid = findClaudeCodePid();
        if (ccPid) {
          return `win-cc-${ssePort}-${ccPid}`;
        }
        // Priority 3: Scan marker files by ancestry match.
        // When findClaudeCodePid() fails (exclusion list mismatch, broken chain),
        // collect ALL ancestor PIDs and match against pid-*.json markers written
        // by the SessionStart hook. Each session has a unique marker because
        // each Claude Code instance has a unique PID in a different ancestry chain.
        const markerSessionId = _scanMarkersByAncestry(ssePort);
        if (markerSessionId) {
          return markerSessionId;
        }
        // SD-MAN-INFRA-FIX-SESSION-UNIQUENESS-001: Write per-PID fallback marker.
        // Previous implementation used fallback-{ssePort}.json shared across all
        // sessions on the same SSE port, causing terminal_id collisions. Now each
        // process writes its own marker keyed by PID, and reuses only its own.
        const fallbackId = `win-fallback-${ssePort}-${process.pid}-${crypto.randomUUID().substring(0, 8)}`;
        try {
          const markerDir = resolve(_repoRoot, '.claude/session-identity');
          if (!existsSync(markerDir)) mkdirSync(markerDir, { recursive: true });
          const fallbackMarker = resolve(markerDir, `fallback-${ssePort}-${process.pid}.json`);
          // Check if a fallback marker already exists for this specific process
          if (existsSync(fallbackMarker)) {
            const existing = JSON.parse(readFileSync(fallbackMarker, 'utf8'));
            if (existing.sse_port === ssePort && existing.pid === process.pid && existing.session_id) {
              return existing.session_id;
            }
          }
          writeFileSync(fallbackMarker, JSON.stringify({
            session_id: fallbackId,
            sse_port: ssePort,
            pid: process.pid,
            created_at: new Date().toISOString(),
            source: 'pid-fallback-stabilizer'
          }));
          console.error(`[terminal-identity] WARNING: All stable methods failed. Wrote fallback marker: ${fallbackId}`);
          return fallbackId;
        } catch {
          // Marker write failed — fall through to unstable PID
          return `win-pid-${process.pid}`;
        }
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
