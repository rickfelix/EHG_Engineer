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

          // Cleanup old markers (keep last 10 of each type)
          const cleanup = (prefix) => {
            const files = fs.readdirSync(markerDir)
              .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
              .map(f => ({ name: f, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime);
            for (const old of files.slice(10)) {
              try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
            }
          };
          cleanup('pid-');
          // Clean non-prefixed session markers too
          const sessionMarkers = fs.readdirSync(markerDir)
            .filter(f => !f.startsWith('pid-') && !f.startsWith('port-') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          for (const old of sessionMarkers.slice(10)) {
            try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
          }
        } catch {
          // Non-fatal
        }

        console.log(`SessionStart:capture-session-id: ${sessionId}`);
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
