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
        // The hook's process.ppid IS the Claude Code node process (unique per conversation).
        // getTerminalId() uses findClaudeCodePid() to discover the same PID and reads
        // pid-{ccPid}.json to get the session UUID — stable, no ambiguity.
        const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
        const ccPid = process.ppid || process.pid;
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

    // Timeout after 2 seconds if stdin doesn't close
    setTimeout(resolve, 2000);
  });
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
