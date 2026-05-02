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
const { stampBranch } = require('../../lib/session-writer.cjs');

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
  // Resolution order (5f02d3c2):
  //   1. CLAUDE_SESSION_ID env var (set by capture-session-id.cjs which runs
  //      earlier in the SessionStart chain — most reliable when present)
  //   2. .claude/session-identity/<uuid>.json — current marker scheme;
  //      pick the most-recently-modified file. capture-session-id.cjs:383
  //      writes one file per session here.
  //   3. .claude/session-id.json — legacy single-file marker (predates the
  //      session-identity dir, kept for backward compat)
  //   4. ~/.claude-sessions/*.json — even-older fallback
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }

  try {
    const markerDir = path.resolve(__dirname, '../../.claude/session-identity');
    if (fs.existsSync(markerDir)) {
      const markers = fs.readdirSync(markerDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const full = path.join(markerDir, f);
          return { name: f, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      if (markers.length > 0) {
        const latest = JSON.parse(fs.readFileSync(path.join(markerDir, markers[0].name), 'utf8'));
        if (latest.session_id) return latest.session_id;
      }
    }
  } catch { /* fall through to legacy lookups */ }

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

  // Upsert session — create if new, update heartbeat if existing.
  // stampBranch() resolves current_branch via `git rev-parse --abbrev-ref HEAD`
  // and leaves the column absent if we cannot resolve (e.g. not a git tree,
  // detached HEAD) rather than writing NULL. See lib/session-writer.cjs and
  // SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
  const payload = stampBranch({
    session_id: sessionId,
    hostname: getHostname(),
    tty: getTTY(),
    codebase: detectCurrentRepo(),
    status: 'active',
    heartbeat_at: now,
    started_at: now
  });

  const { error } = await supabase
    .from('claude_sessions')
    .upsert(payload, {
      onConflict: 'session_id',
      ignoreDuplicates: false
    });

  if (!error) {
    console.log(`session-register: registered ${sessionId.slice(0, 12)}...`);
  }

  // SD-LEO-INFRA-LOOP-STATE-SIGNAL-001: if the session was previously parked
  // in `awaiting_tick` (set by post-tool-loop-state.cjs after a ScheduleWakeup),
  // SessionStart now means the wakeup fired — flip to `active`. Conditional WHERE
  // means fresh sessions (no prior loop_state) are not touched.
  try {
    const {
      LOOP_STATE_ACTIVE,
      LOOP_STATE_AWAITING_TICK
    } = require('../lib/sessions/loop-state-tracker.cjs');
    await supabase
      .from('claude_sessions')
      .update({ loop_state: LOOP_STATE_ACTIVE })
      .eq('session_id', sessionId)
      .eq('loop_state', LOOP_STATE_AWAITING_TICK);
  } catch { /* best-effort observability; never block SessionStart */ }
}

main().catch(() => { /* fail silently */ });
