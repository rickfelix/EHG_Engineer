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

// SD-LEO-INFRA-SESSION-PID-MARKER-001: timeouts sized so max internal work
// (tree_walk + scan) stays under the registered hook timeout in settings.json.
// Hook timeout = 15s; internal budget = tree_walk(6s) + scan(3s) = 9s → 6s margin.
const TREE_WALK_TIMEOUT_MS = 6000;
const SCAN_TIMEOUT_MS = 3000;

function logDiscoveryEvent(fields) {
  // Structured JSON log on stderr (hook stdout is reserved for env-file exports).
  // Always-on at INFO per PRD FR-3.
  const entry = { event: 'capture-session-id.discovery', timestamp: new Date().toISOString(), ...fields };
  try { console.error(JSON.stringify(entry)); } catch { /* best effort */ }
}

// ── SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-4, FR-5, TR-1) ──
// Inline helpers so this hook stays dependency-free per the file header contract.
// These mirror lib/session-identity-sot.js but cannot import it (ESM from CJS hook).

/** Returns true when the SOT feature flag is enabled. */
function sotIsEnabled() {
  const v = process.env.SESSION_IDENTITY_SOT_ENABLED;
  if (!v) return false;
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes' || v === 'on';
}

/**
 * Atomic write: tmp + fsync + rename. Crash-safe per TR-1.
 * Tmp file is cleaned up on any error so partial state never surfaces.
 */
function sotAtomicWrite(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Select the long-lived Claude Code ancestor from a parsed process chain.
 * Pure function: takes [{pid, name, ppid}, ...] (chain[0] is current process),
 * returns the chosen entry or null. Exported for unit tests.
 *
 * SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-1, FR-3):
 *   Pass 1 — outermost claude.exe wins (claude.exe is the modern long-lived
 *            Claude Code process on Windows; node.exe is often a transient
 *            subprocess that dies within seconds).
 *   Pass 2 — original "first node.exe with non-shell parent" rule, with broadened
 *            skip-set including cmd.exe / pwsh.exe / powershell.exe, preserving
 *            backward compatibility for environments without claude.exe.
 *   Pass 3 — defensive fallback: outermost node.exe in chain.
 */
function selectAncestorFromChain(chain) {
  if (!Array.isArray(chain) || chain.length < 2) return null;
  const skipParents = ['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh', 'cmd.exe', 'pwsh.exe', 'powershell.exe'];

  // Pass 1: outermost claude.exe wins.
  for (let i = chain.length - 1; i >= 1; i--) {
    if (chain[i].name === 'claude.exe') return chain[i];
  }

  // Pass 2: original semantics with broadened skip-set.
  for (let i = 1; i < chain.length; i++) {
    const proc = chain[i];
    if (proc.name === 'node.exe' || proc.name === 'node') {
      const parent = chain[i + 1];
      if (!parent || !skipParents.includes(parent.name)) return proc;
    }
  }

  // Pass 3: outermost node.exe defensive fallback.
  for (let i = chain.length - 1; i >= 1; i--) {
    if (chain[i].name === 'node.exe' || chain[i].name === 'node') return chain[i];
  }

  return null;
}

/**
 * Find the Claude Code node.exe PID by walking the process ancestry chain.
 * Mirrors the logic in lib/terminal-identity.js findClaudeCodePid(), but in CJS
 * for use in this hook. Falls back to process scan if tree walk fails.
 *
 * @param {string} entryPath - SessionStart source from Claude Code (startup|resume|compact|reconnect|unknown)
 * @returns {string|null} Claude Code process PID
 */
function findClaudeCodePid(entryPath = 'unknown') {
  if (process.platform !== 'win32') {
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'none', outcome: 'skipped_non_windows', platform: process.platform });
    return null;
  }

  // Method 1: Walk process ancestry
  const walkStart = process.hrtime.bigint();
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
      timeout: TREE_WALK_TIMEOUT_MS
    }).trim();

    if (raw) {
      const chain = raw.split(';').map(entry => {
        const [pid, name, ppid] = entry.split('|');
        return { pid, name: (name || '').toLowerCase(), ppid };
      });

      const selected = selectAncestorFromChain(chain);
      if (selected) {
        const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
        logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'success', duration_ms: dur, chain_depth: chain.length, resolved_name: selected.name });
        return selected.pid;
      }
    }
    const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'no_match', duration_ms: dur });
  } catch (err) {
    const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'error', duration_ms: dur, error: err && err.message ? String(err.message).slice(0, 200) : 'unknown' });
    /* fall through to scan */
  }

  // Method 2: Scan all node.exe / claude.exe processes for SSE port match.
  // SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-2): single CIM round-trip with WQL OR-filter so the
  // fallback path also discovers claude.exe and stays within SCAN_TIMEOUT_MS.
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (!ssePort) {
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'skipped_no_sse_port' });
    return null;
  }
  const scanStart = process.hrtime.bigint();
  try {
    const script = [
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' OR Name=\'claude.exe\'" -ErrorAction SilentlyContinue |',
      `  Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match '${ssePort}' } |`,
      '  ForEach-Object { $_.ProcessId } |',
      '  Select-Object -First 1'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: SCAN_TIMEOUT_MS
    }).trim();
    const dur = Number((process.hrtime.bigint() - scanStart) / 1000000n);
    if (raw && /^\d+$/.test(raw)) {
      logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'success', duration_ms: dur, sse_port: ssePort });
      return raw;
    }
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'no_match', duration_ms: dur, sse_port: ssePort });
  } catch (err) {
    const dur = Number((process.hrtime.bigint() - scanStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'error', duration_ms: dur, error: err && err.message ? String(err.message).slice(0, 200) : 'unknown' });
    /* give up */
  }

  return null;
}

/**
 * QF-20260424-143: Insert-if-not-exists claude_sessions row for this UUID.
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR2): retry-hardened.
 *
 * Mirrors session-tick.cjs PostgREST pattern (no supabase-js dep) so cold-start
 * latency stays negligible. `Prefer: resolution=merge-duplicates` makes POST act
 * as an upsert on the session_id unique key — safe for resume/compact where the
 * row may already exist. Heartbeat is refreshed either way.
 *
 * **Retry policy** (SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 FR2): each attempt
 * has a 3s timeout; on failure we retry with exponential backoff (0ms, 500ms,
 * 1500ms) for up to 3 attempts total. This closes the fire-and-forget gap
 * observed 2026-04-24 (session 4b15d2aa missed claude_sessions entirely despite
 * hook running). The prior "session-tick will retry" comment was misleading —
 * session-tick.cjs only UPDATEs heartbeat, it does NOT CREATE the row; a
 * missing row stays missing until the next manual claim reaches sd-start.
 *
 * Still fail-soft after max retries: any final error is swallowed (or logged
 * with LEO_TELEMETRY_DEBUG=1). SessionStart never blocks on telemetry.
 */
async function upsertSessionRow(sessionId, ccPid, source) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/claude_sessions`;
  const now = new Date().toISOString();
  const pidNum = Number(ccPid);
  const body = JSON.stringify({
    session_id: sessionId,
    status: 'active',
    heartbeat_at: now,
    pid: Number.isFinite(pidNum) ? pidNum : null,
    hostname: require('os').hostname(),
    metadata: { cc_pid: ccPid, source: source || 'unknown' },
  });

  const MAX_ATTEMPTS = 3;
  const PER_ATTEMPT_TIMEOUT_MS = 3000;
  // Exponential backoff with 0 base delay for the first attempt so happy-path
  // latency is unchanged (~200ms typical).
  const BACKOFFS_MS = [0, 500, 1500];
  const debug = process.env.LEO_TELEMETRY_DEBUG === '1';

  let lastStatus = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFFS_MS[attempt - 1] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt - 1]));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body,
        signal: controller.signal,
      });
      // Success: 2xx. Return immediately — no further attempts.
      if (res.ok) {
        clearTimeout(timer);
        if (debug && attempt > 1) {
          console.error(`SessionStart:capture-session-id: upsert OK on attempt ${attempt}/${MAX_ATTEMPTS}`);
        }
        return;
      }
      lastStatus = res.status;
      if (debug) {
        console.error(`SessionStart:capture-session-id: upsert status=${res.status} attempt=${attempt}/${MAX_ATTEMPTS}`);
      }
      // 4xx (not 408/429) is a client-side error — no point retrying. Bail.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        clearTimeout(timer);
        return;
      }
    } catch (err) {
      lastError = err;
      if (debug) {
        console.error(`SessionStart:capture-session-id: upsert failed attempt=${attempt}/${MAX_ATTEMPTS}: ${err?.message || err}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (debug) {
    console.error(`SessionStart:capture-session-id: upsert exhausted ${MAX_ATTEMPTS} attempts (last_status=${lastStatus}, last_error=${lastError?.message || 'n/a'})`);
  }
}

function main() {
  return new Promise((resolve) => {
    let input = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      input += chunk;
    });

    process.stdin.on('end', async () => {
      try {
        const data = JSON.parse(input);
        const sessionId = data.session_id;

        if (!sessionId) {
          resolve();
          return;
        }

        // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-4):
        // When the SOT feature flag is on, the canonical <sid>.json marker MUST be
        // written (and fsync'd) BEFORE CLAUDE_ENV_FILE receives the export. This
        // ordering guarantees that any tool observing the env var can always read
        // the canonical marker back. When the flag is off we preserve the legacy
        // order (env var first) to avoid perturbing sessions that haven't opted in.
        const sotOrdering = sotIsEnabled();

        const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
        const entryPath = data.source || 'unknown';
        const discoveredPid = findClaudeCodePid(entryPath);
        const ccPid = discoveredPid || process.ppid || process.pid;
        if (!discoveredPid) {
          logDiscoveryEvent({ entry_path: entryPath, method_used: 'fallback_ppid', outcome: 'degraded', fallback_ppid: ccPid });
        }
        const markerDir = path.resolve(__dirname, '../../.claude/session-identity');
        const envFile = process.env.CLAUDE_ENV_FILE;

        const writeEnvFile = () => {
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
        };

        // Strategy 1 (legacy order): write env var first when SOT flag is off.
        if (!sotOrdering) writeEnvFile();

        // Strategy 2: Write session marker files keyed by Claude Code PID.
        // Walk the process tree to find the actual Claude Code node.exe ancestor
        // (process.ppid is often cmd.exe, not Claude Code). This PID matches what
        // getTerminalId() → findClaudeCodePid() discovers at Bash tool runtime.
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

          // Write PID-keyed marker (primary lookup for getTerminalId).
          // Use atomic write under SOT ordering so the marker lands crash-safe.
          const pidFile = path.join(markerDir, `pid-${ccPid}.json`);
          if (sotOrdering) {
            sotAtomicWrite(pidFile, JSON.stringify(marker, null, 2));
          } else {
            fs.writeFileSync(pidFile, JSON.stringify(marker, null, 2));
          }

          // Write per-session marker (for audit/debugging — this is the canonical SOT marker).
          const markerFile = path.join(markerDir, `${sessionId}.json`);
          if (sotOrdering) {
            sotAtomicWrite(markerFile, JSON.stringify(marker, null, 2));
          } else {
            fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2));
          }

          // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-1):
          // When SOT is enabled, atomically update the /current pointer to match.
          // This is the third identity source — once it's written, claim-validity-gate
          // sees all three in agreement.
          if (sotOrdering) {
            const currentPointer = path.join(markerDir, 'current');
            sotAtomicWrite(currentPointer, sessionId);
          }

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

        // Strategy 1 (SOT order): write env var AFTER marker + pointer.
        // Guarantees FR-4 — env var is never set to a session id whose canonical
        // file doesn't exist yet.
        if (sotOrdering) writeEnvFile();

        // Machine-readable line for downstream parsing (SD-MAN-INFRA-SESSION-IDENTITY-BIRTH-001)
        console.log(`CLAUDE_SESSION_ID=${sessionId}`);
        console.log(`SessionStart:capture-session-id: ${sessionId}`);

        // ── QF-20260424-143: upsert claude_sessions row for captured UUID ──
        // session-tick.cjs uses PATCH (update-only); if no row exists, every tick
        // silently no-ops and the identity chain between env var, markers, and DB
        // breaks. Insert-if-not-exists here so tick has a target. Uses PostgREST
        // directly (no supabase-js dep) to match session-tick.cjs pattern.
        await upsertSessionRow(sessionId, ccPid, data.source);

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

    // Timeout must exceed the internal PowerShell budget (tree_walk + scan = 9s).
    // Registered hook timeout in .claude/settings.json is 15s; 12s leaves 3s margin
    // for marker write + cleanup before Claude Code kills the process.
    setTimeout(resolve, 12000);
  });
}

// SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-5): expose pure helpers for unit tests.
module.exports = { selectAncestorFromChain, findClaudeCodePid, upsertSessionRow };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => process.exit(0));
}
