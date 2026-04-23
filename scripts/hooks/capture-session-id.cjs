/**
 * Capture Session ID Hook
 *
 * Reads session_id from Claude Code's SessionStart stdin JSON and persists it
 * via CLAUDE_ENV_FILE so all subsequent Bash tool invocations have
 * CLAUDE_SESSION_ID in their environment.
 *
 * This eliminates the need for fragile process tree walking to identify
 * which Claude Code conversation spawned a subprocess.
 *
 * Trigger: SessionStart (must be first hook to run)
 * Input: JSON via stdin with { session_id, ... }
 * Output: Writes CLAUDE_SESSION_ID to CLAUDE_ENV_FILE
 *
 * See: GitHub Issue #17188 (Expose Session Metadata via Environment Variables)
 * See: RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: spawn telemetry.
// Writes errors to .claude/pids/spawn-errors.log (NDJSON) and stderr.
// Rotates at SPAWN_LOG_MAX_BYTES, keeps SPAWN_LOG_KEEP_FILES most recent.
const SPAWN_LOG_MAX_BYTES = 1024 * 1024; // 1 MB
const SPAWN_LOG_KEEP_FILES = 3;

function getSpawnLogPath() {
  return path.resolve(__dirname, '../../.claude/pids/spawn-errors.log');
}

function rotateSpawnLogIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const size = fs.statSync(logPath).size;
    if (size < SPAWN_LOG_MAX_BYTES) return;
    // Shift .log → .log.1 → .log.2 → .log.3; drop oldest.
    for (let i = SPAWN_LOG_KEEP_FILES; i >= 1; i--) {
      const src = i === 1 ? logPath : `${logPath}.${i - 1}`;
      const dst = `${logPath}.${i}`;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch { /* best effort */ }
      }
    }
  } catch { /* rotation failures must not block */ }
}

function logSpawnError(sessionId, ccPid, err, code) {
  const entry = {
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    cc_parent_pid: ccPid,
    error_message: err && err.message ? String(err.message) : String(err),
    error_code: code || (err && err.code) || 'UNKNOWN',
    platform: process.platform,
    node_version: process.version,
  };
  const logPath = getSpawnLogPath();
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    rotateSpawnLogIfNeeded(logPath);
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch { /* last resort: stderr still runs below */ }
  // Errors always surface to stderr regardless of LEO_TELEMETRY_DEBUG.
  console.error(`SessionStart:session-tick: spawn failed: ${entry.error_message} (code=${entry.error_code} platform=${entry.platform})`);
}

/**
 * Find the Claude Code node.exe PID by walking the process ancestry chain.
 * Mirrors the logic in lib/terminal-identity.js findClaudeCodePid(), but in CJS
 * for use in this hook. Falls back to process scan if tree walk fails.
 *
 * @returns {string|null} Claude Code process PID
 */
function findClaudeCodePid() {
  if (process.platform !== 'win32') return null;

  // Method 1: Walk process ancestry
  try {
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

    if (raw) {
      const chain = raw.split(';').map(entry => {
        const [pid, name, ppid] = entry.split('|');
        return { pid, name: (name || '').toLowerCase(), ppid };
      });

      // Find the first node.exe whose parent is NOT node/bash/sh
      for (let i = 1; i < chain.length; i++) {
        const proc = chain[i];
        if (proc.name === 'node.exe' || proc.name === 'node') {
          const parent = chain[i + 1];
          if (!parent || !['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh'].includes(parent.name)) {
            return proc.pid;
          }
        }
      }
    }
  } catch { /* fall through to scan */ }

  // Method 2: Scan all node.exe processes for SSE port match
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (!ssePort) return null;
  try {
    const script = [
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" -ErrorAction SilentlyContinue |',
      `  Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match '${ssePort}' } |`,
      '  ForEach-Object { $_.ProcessId } |',
      '  Select-Object -First 1'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    }).trim();
    if (raw && /^\d+$/.test(raw)) return raw;
  } catch { /* give up */ }

  return null;
}

function main() {
  return new Promise((resolve) => {
    let input = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      input += chunk;
    });

    process.stdin.on('end', () => {
      try {
        const data = JSON.parse(input);
        const sessionId = data.session_id;

        if (!sessionId) {
          resolve();
          return;
        }

        // Strategy 1: Write to CLAUDE_ENV_FILE (makes env var available to Bash tool)
        const envFile = process.env.CLAUDE_ENV_FILE;
        if (envFile) {
          try {
            // Use export syntax per Claude Code docs; append to preserve other hooks' vars
            fs.appendFileSync(envFile, `export CLAUDE_SESSION_ID=${sessionId}\n`);
          } catch (e) {
            console.error(`SessionStart:capture-session-id: CLAUDE_ENV_FILE write failed: ${e.message}`);
          }
        } else {
          // Diagnostic: log which env vars Claude Code provides to hooks
          const claudeVars = Object.keys(process.env)
            .filter(k => k.startsWith('CLAUDE'))
            .join(', ');
          console.error(`SessionStart:capture-session-id: CLAUDE_ENV_FILE not set. Claude vars: [${claudeVars}]`);
        }

        // Strategy 2: Write session marker files keyed by Claude Code PID.
        // Walk the process tree to find the actual Claude Code node.exe ancestor
        // (process.ppid is often cmd.exe, not Claude Code). This PID matches what
        // getTerminalId() → findClaudeCodePid() discovers at Bash tool runtime.
        const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
        const ccPid = findClaudeCodePid() || process.ppid || process.pid;
        const markerDir = path.resolve(__dirname, '../../.claude/session-identity');
        try {
          if (!fs.existsSync(markerDir)) {
            fs.mkdirSync(markerDir, { recursive: true });
          }

          const marker = {
            session_id: sessionId,
            sse_port: ssePort || null,
            cc_pid: ccPid,
            source: data.source || 'unknown',
            model: data.model || null,
            captured_at: new Date().toISOString()
          };

          // Write PID-keyed marker (primary lookup for getTerminalId)
          const pidFile = path.join(markerDir, `pid-${ccPid}.json`);
          fs.writeFileSync(pidFile, JSON.stringify(marker, null, 2));

          // Write per-session marker (for audit/debugging)
          const markerFile = path.join(markerDir, `${sessionId}.json`);
          fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2));

          // Cleanup old markers — preserve markers for alive PIDs, only delete dead ones
          // Fix: previous "keep last 3" logic deleted the current conversation's marker
          // when 4+ concurrent conversations existed, causing terminal identity divergence.
          const cleanup = (prefix) => {
            const files = fs.readdirSync(markerDir)
              .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
              .map(f => {
                const pidMatch = f.match(/^pid-(\d+)\.json$/);
                const pid = pidMatch ? Number(pidMatch[1]) : null;
                let alive = false;
                if (pid) { try { process.kill(pid, 0); alive = true; } catch { /* dead */ } }
                return { name: f, pid, alive, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs };
              })
              .sort((a, b) => b.mtime - a.mtime);
            // Keep ALL markers for alive PIDs; for dead PIDs, keep last 3
            const dead = files.filter(f => !f.alive);
            for (const old of dead.slice(3)) {
              try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
            }
          };
          cleanup('pid-');
          // Clean non-prefixed session markers — same alive-PID-aware logic
          const sessionMarkers = fs.readdirSync(markerDir)
            .filter(f => !f.startsWith('pid-') && !f.startsWith('port-') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          for (const old of sessionMarkers.slice(5)) {
            try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
          }
        } catch {
          // Non-fatal
        }

        // Machine-readable line for downstream parsing (SD-MAN-INFRA-SESSION-IDENTITY-BIRTH-001)
        console.log(`CLAUDE_SESSION_ID=${sessionId}`);
        console.log(`SessionStart:capture-session-id: ${sessionId}`);

        // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: spawn detached session-tick ──
        // Writes process_alive_at every 30s until the parent CC exits.
        // Fire-and-forget — never blocks SessionStart.
        // SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: spawn errors are default-on logged
        // to .claude/pids/spawn-errors.log + stderr so silent failures surface.
        try {
          const { spawn } = require('child_process');
          const tickScript = path.resolve(__dirname, '../session-tick.cjs');
          if (!fs.existsSync(tickScript)) {
            logSpawnError(sessionId, ccPid, new Error(`tick script not found at ${tickScript}`), 'ENOENT');
          } else {
            const child = spawn(process.execPath, [tickScript], {
              detached: true,
              stdio: 'ignore',
              env: {
                ...process.env,
                CLAUDE_SESSION_ID: sessionId,
                CC_PARENT_PID: String(ccPid),
              },
              windowsHide: true,
            });
            if (child && typeof child.unref === 'function') child.unref();
            // child.on('error', ...) captures post-spawn errors (ENOENT/EACCES on
            // execPath) that the outer try/catch never sees because spawn is async.
            if (child && typeof child.on === 'function') {
              child.on('error', (err) => {
                logSpawnError(sessionId, ccPid, err, err.code || 'SPAWN_ERROR');
              });
            }
            if (process.env.LEO_TELEMETRY_DEBUG === '1') {
              console.error(`SessionStart:session-tick: spawned tick_pid=${child.pid}`);
            }
          }
        } catch (tickErr) {
          logSpawnError(sessionId, ccPid, tickErr, tickErr.code || 'SYNC_THROW');
        }
      } catch {
        // Invalid JSON or other error — don't block session start
      }

      resolve();
    });

    process.stdin.on('error', () => {
      resolve();
    });

    // Timeout after 8 seconds if stdin doesn't close.
    // Increased from 2s to accommodate PowerShell process tree walk on Windows.
    setTimeout(resolve, 8000);
  });
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
