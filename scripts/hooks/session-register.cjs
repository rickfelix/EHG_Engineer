/**
 * Session Register Hook — Ensures session appears in claude_sessions on boot
 *
 * Hook: SessionStart
 * Purpose: Upsert this session into claude_sessions with a fresh heartbeat_at
 *          so the coordinator dashboard sees workers immediately, even before
 *          they claim an SD.
 *
 * Without this, idle workers are invisible to the fleet dashboard until they
 * run sd:next and claim work.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Detect the current repo context from CWD or CLAUDE_PROJECT_DIR.
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-H
 */
function detectCurrentRepo() {
  try {
    const cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').toLowerCase();
    const registryPath = path.resolve(__dirname, '../../applications/registry.json');
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const apps = Object.values(registry.applications || {}).filter(a => a.local_path);
      // Sort by path length descending so more specific paths match first
      apps.sort((a, b) => (b.local_path || '').length - (a.local_path || '').length);
      for (const app of apps) {
        const appPath = app.local_path.replace(/\\/g, '/').toLowerCase();
        if (cwd === appPath || cwd.startsWith(appPath + '/')) return app.name;
      }
    }
  } catch { /* fallback */ }
  return 'EHG_Engineer';
}

function getCurrentSessionId() {
  try {
    const sessionFile = path.resolve(__dirname, '../../.claude/session-id.json');
    if (fs.existsSync(sessionFile)) {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (data.session_id) return data.session_id;
    }

    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid || data.session_id?.includes('win' + pid)) {
          return data.session_id;
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}

function getHostname() {
  try {
    return os.hostname();
  } catch {
    return 'unknown';
  }
}

function getTTY() {
  // Derive terminal identifier from PID (matches fleet-dashboard pattern)
  const pid = process.ppid || process.pid;
  return `win-${pid}`;
}

async function main() {
  let supabase;
  try {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  } catch {
    return; // Supabase not available
  }

  const sessionId = getCurrentSessionId();
  if (!sessionId) return;

  const now = new Date().toISOString();

  // Upsert session — create if new, update heartbeat if existing
  const { error } = await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      hostname: getHostname(),
      tty: getTTY(),
      codebase: detectCurrentRepo(),
      status: 'active',
      heartbeat_at: now,
      started_at: now
    }, {
      onConflict: 'session_id',
      ignoreDuplicates: false
    });

  if (!error) {
    console.log(`session-register: registered ${sessionId.slice(0, 12)}...`);
  }
}

main().catch(() => { /* fail silently */ });
