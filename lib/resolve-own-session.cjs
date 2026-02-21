/**
 * Resolve Own Session - CJS version for hooks and CommonJS scripts
 *
 * Mirror of lib/resolve-own-session.js for use in CJS contexts.
 *
 * Identity formats in the system:
 *   - claude_sessions.session_id: "session_{uuid8}_{tty}_{pid}" (from session-manager)
 *   - claude_sessions.terminal_id: "win-cc-{ssePort}-{ccPid}" (from getTerminalId)
 *   - Marker file session_id: Claude Code conversation UUID (from SessionStart stdin)
 *   - CLAUDE_SESSION_ID env var: Same as marker file UUID
 *
 * @see lib/resolve-own-session.js - ESM version (primary)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Cache the Claude Code PID (undefined = not searched, null = not found)
let _cachedCCPid = undefined;

/**
 * Find the Claude Code node.exe PID by walking process ancestry.
 * @returns {string|null}
 */
function findClaudeCodePid() {
  if (_cachedCCPid !== undefined) return _cachedCCPid;
  if (process.platform !== 'win32') { _cachedCCPid = null; return null; }

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
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000
    }).trim();

    if (raw) {
      const chain = raw.split(';').map(entry => {
        const [pid, name, ppid] = entry.split('|');
        return { pid, name: (name || '').toLowerCase(), ppid };
      });
      for (let i = 1; i < chain.length; i++) {
        const proc = chain[i];
        if (proc.name === 'node.exe' || proc.name === 'node') {
          const parent = chain[i + 1];
          if (!parent || !['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh', 'powershell.exe', 'pwsh.exe'].includes(parent.name)) {
            _cachedCCPid = proc.pid;
            return _cachedCCPid;
          }
        }
      }
    }
  } catch { /* fall through */ }

  // Method 2: Scan for SSE port match
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (ssePort) {
    try {
      const script = [
        'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" -ErrorAction SilentlyContinue |',
        `  Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match '${ssePort}' } |`,
        '  ForEach-Object { $_.ProcessId } |',
        '  Select-Object -First 1'
      ].join('\n');
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000
      }).trim();
      if (raw && /^\d+$/.test(raw)) { _cachedCCPid = raw; return _cachedCCPid; }
    } catch { /* give up */ }
  }

  _cachedCCPid = null;
  return null;
}

/**
 * Get all identity candidates for the current session.
 * @returns {{envId: string|null, markerId: string|null, terminalId: string|null}}
 */
function getIdentityCandidates() {
  const envId = process.env.CLAUDE_SESSION_ID || null;

  // Try marker file for conversation UUID
  let markerId = null;
  try {
    const ccPid = findClaudeCodePid();
    if (ccPid) {
      const markerPath = path.resolve(__dirname, '../.claude/session-identity', `pid-${ccPid}.json`);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      if (marker.session_id && marker.session_id !== envId) {
        markerId = marker.session_id;
      }
    }
  } catch { /* no marker file */ }

  // Compute terminal_id format: "win-cc-{port}-{pid}"
  let terminalId = null;
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (ssePort) {
    const ccPid = findClaudeCodePid();
    terminalId = ccPid ? `win-cc-${ssePort}-${ccPid}` : `win-cc-${ssePort}`;
  }

  return { envId, markerId, terminalId };
}

/**
 * Get session ID from env var, marker file, or terminal identity.
 * @returns {string|null}
 */
function getOwnSessionId() {
  const { envId, markerId, terminalId } = getIdentityCandidates();
  return envId || markerId || terminalId || null;
}

/**
 * Resolve the current session from claude_sessions deterministically.
 * @param {object} supabase - Supabase client
 * @param {object} [options]
 * @param {string} [options.select] - Columns to select
 * @param {boolean} [options.warnOnFallback] - Warn on heartbeat fallback
 * @returns {Promise<{data: object|null, source: string, sessionId: string|null}>}
 */
async function resolveOwnSession(supabase, options = {}) {
  const {
    select = 'session_id, sd_id, metadata, status, heartbeat_at, track, claimed_at',
    warnOnFallback = true
  } = options;

  const { envId, markerId, terminalId } = getIdentityCandidates();

  // Strategy 1: Direct lookup by session_id using env var
  if (envId) {
    const { data } = await supabase
      .from('claude_sessions')
      .select(select)
      .eq('session_id', envId)
      .in('status', ['active', 'idle'])
      .maybeSingle();

    if (data) return { data, source: 'env_var', sessionId: envId };
  }

  // Strategy 2: Lookup by session_id using marker file UUID
  if (markerId) {
    const { data } = await supabase
      .from('claude_sessions')
      .select(select)
      .eq('session_id', markerId)
      .in('status', ['active', 'idle'])
      .maybeSingle();

    if (data) return { data, source: 'marker_file', sessionId: markerId };
  }

  // Strategy 3: Lookup by terminal_id column
  // Include SSE-port-only format for backward compat with older sessions
  const ssePortOnly = process.env.CLAUDE_CODE_SSE_PORT
    ? `win-cc-${process.env.CLAUDE_CODE_SSE_PORT}` : null;
  const candidates = [envId, markerId, terminalId, ssePortOnly]
    .filter((v, i, a) => v && a.indexOf(v) === i); // unique, non-null
  for (const candidate of candidates) {
    const { data } = await supabase
      .from('claude_sessions')
      .select(select)
      .eq('terminal_id', candidate)
      .in('status', ['active', 'idle'])
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) return { data, source: 'terminal_id', sessionId: data.session_id };
  }

  // Strategy 4: Fallback to heartbeat-based lookup
  if (warnOnFallback) {
    const attempted = candidates.join(', ') || '(none)';
    console.warn(`[resolve-own-session] WARNING: Falling back to heartbeat. Tried: ${attempted}`);
  }

  const { data, error } = await supabase
    .from('claude_sessions')
    .select(select)
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, source: 'error', sessionId: null };
  return { data: data || null, source: 'heartbeat_fallback', sessionId: data?.session_id || null };
}

module.exports = { getOwnSessionId, resolveOwnSession, findClaudeCodePid };
