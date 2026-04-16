/**
 * Stale Session Sweep — Automated Conflict Resolution & Coordination
 *
 * Designed to run on a recurring loop: /loop 5m node scripts/stale-session-sweep.cjs
 *
 * What it does:
 * 1. Scans all sessions with active SD claims
 * 2. Detects stale sessions (heartbeat > threshold)
 * 2b. IDENTITY COLLISION DETECTION — reads .claude/session-identity/ marker files
 *     to detect multiple live Claude Code PIDs sharing one session_id. Splits
 *     colliding sessions into separate DB records with unique terminal_ids.
 * 2c. NPM INSTALL LOCK — checks/cleans stale npm install locks to prevent
 *     concurrent installs from corrupting node_modules.
 * 3. Checks PID liveness for same-host sessions
 * 4. Auto-releases dead claims (stale + PID dead)
 * 5. Detects and AUTO-RESOLVES duplicate claims on the same SD
 * 6. Writes coordination messages for active sessions
 * 7. Outputs a summary to stdout
 *
 * Safe to run repeatedly — fully idempotent.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

// SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): MC gating constants.
// Feature-flag MC consultation at sweep independently from dashboard so that
// roll-out can be staged (dashboard first → sweep later after calibration).
const FLEET_MC_SWEEP_GATE = (process.env.FLEET_MC_SWEEP_GATE ?? 'true').toLowerCase() !== 'false';
const FLEET_MC_PALIVE_HOLD_THRESHOLD = Number(process.env.FLEET_MC_PALIVE_HOLD_THRESHOLD) || 0.3;
const FLEET_MC_HARD_CAP_SEC = Number(process.env.FLEET_MC_HARD_CAP_SEC) || 1200; // 20 minutes
const FLEET_MC_ESTIMATE_STALENESS_SEC = Number(process.env.FLEET_MC_ESTIMATE_STALENESS_SEC) || 300; // 5m

const supabase = createSupabaseServiceClient();

const STALE_THRESHOLD_SECONDS = parseInt(process.env.STALE_SESSION_THRESHOLD_SECONDS, 10) || 300;
const LOCAL_HOSTNAME = os.hostname();

/**
 * SD-LEO-INFRA-FLEET-COORDINATION-RESILIENCE-001 (FR-001):
 * Reset SD current_phase to the last safe phase boundary when releasing a stale claim.
 * Prevents SDs from being left in mid-phase limbo with no active claimer.
 *
 * Phase reset map: mid-phase states → safe boundary
 */
const PHASE_RESET_MAP = {
  'EXEC': 'PLAN_PRD',
  'EXEC_COMPLETE': 'PLAN_PRD',
  'PLAN_VERIFICATION': 'PLAN_PRD',
  'LEAD_APPROVAL': 'LEAD',
  'LEAD_FINAL_APPROVAL': 'LEAD_FINAL',
};

async function resetSdPhaseOnRelease(sdKey, reason) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, current_phase, status')
    .eq('sd_key', sdKey)
    .single();

  if (!sd) return;

  const resetTo = PHASE_RESET_MAP[sd.current_phase];
  if (resetTo) {
    await supabase
      .from('strategic_directives_v2')
      .update({ current_phase: resetTo })
      .eq('sd_key', sdKey);
    console.log('  PHASE_RESET: ' + sdKey + ' ' + sd.current_phase + ' → ' + resetTo + ' (' + reason + ')');
  }
}

function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true; // exists but no permission
    return false;
  }
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// --- Layer 1: Terminal Identity Collision Detection ---
// Reads .claude/session-identity/ marker files to detect when multiple
// live Claude Code processes share the same session_id (identity collision).
// Supports both pid-*.json (CLI sessions) and fallback-*.json (Desktop sessions).
// Returns: [{ pid, session_id, marker_path, cc_pid, sse_port }]
function detectIdentityCollisions() {
  const markerDir = path.resolve(__dirname, '../.claude/session-identity');
  if (!fs.existsSync(markerDir)) return { collisions: [], aliveMarkers: [] };

  const markers = fs.readdirSync(markerDir)
    .filter(f => /^pid-\d+\.json$/.test(f) || /^fallback-\d+-\d+\.json$/.test(f))
    .map(f => {
      const filePath = path.resolve(markerDir, f);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // pid-*.json: PID is in the filename; fallback-*.json: PID is in the JSON body
        const pidMatch = f.match(/^pid-(\d+)\.json$/);
        const pid = pidMatch ? Number(pidMatch[1]) : Number(data.pid);
        if (!pid || isNaN(pid)) return null;
        return { pid, session_id: data.session_id, claude_session_id: data.claude_session_id || null, cc_pid: data.cc_pid || pid, sse_port: data.sse_port, marker_path: filePath, mtime: fs.statSync(filePath).mtimeMs };
      } catch { return null; }
    })
    .filter(Boolean);

  // Check which PIDs are alive.
  // For CLI markers (pid-*.json), check the specific PID.
  // For Desktop markers (fallback-*.json), the recorded PID is ephemeral —
  // the actual CC Desktop process runs as claude.exe with a different PID.
  // Detect if ANY claude.exe is running; if so, recent fallback markers are alive.
  let hasClaudeDesktop = false;
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq claude.exe" /NH 2>nul', { encoding: 'utf8', timeout: 5000 });
    hasClaudeDesktop = out.includes('claude.exe');
  } catch { /* tasklist unavailable or timed out — fall back to PID check only */ }

  const FALLBACK_MARKER_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour — fallback markers older than this are stale
  const aliveMarkers = markers.filter(m => {
    // CLI sessions: direct PID liveness check
    if (isProcessRunning(m.pid)) return true;
    // Desktop sessions: if claude.exe is running and marker is recent, consider alive
    const isFallbackMarker = path.basename(m.marker_path).startsWith('fallback-');
    if (isFallbackMarker && hasClaudeDesktop && (Date.now() - m.mtime) < FALLBACK_MARKER_MAX_AGE_MS) return true;
    return false;
  });

  // Group alive markers by session_id
  const bySession = {};
  for (const m of aliveMarkers) {
    if (!m.session_id) continue;
    if (!bySession[m.session_id]) bySession[m.session_id] = [];
    bySession[m.session_id].push(m);
  }

  // Collisions: same session_id claimed by multiple live PIDs
  // Enhanced: also detect when markers share session_id but have different CLAUDE_SESSION_IDs
  const collisions = Object.entries(bySession)
    .filter(([, arr]) => {
      if (arr.length > 1) return true;
      // Single marker but CLAUDE_SESSION_ID differs from session_id — potential upstream mismatch
      return false;
    })
    .map(([sessionId, markers]) => {
      const sorted = markers.sort((a, b) => a.mtime - b.mtime); // oldest first
      // Use CLAUDE_SESSION_ID for split decisions when available
      const uniqueCsids = new Set(sorted.map(m => m.claude_session_id).filter(Boolean));
      return {
        session_id: sessionId,
        markers: sorted,
        has_csid_divergence: uniqueCsids.size > 1
      };
    });

  return { collisions, aliveMarkers };
}

// --- Layer 2: Session Splitting ---
// When identity collision is detected, create new DB sessions for duplicate PIDs
// so each Claude Code process has its own identity.
async function splitCollidingSessions(supabase, collisions, actions, warnings) {
  for (const collision of collisions) {
    const keeper = collision.markers[0]; // oldest marker keeps the session
    const extras = collision.markers.slice(1); // newer markers get split

    const csidNote = collision.has_csid_divergence ? ' (CLAUDE_SESSION_IDs diverge — using CSID for split)' : '';
    actions.push('IDENTITY_COLLISION: session ' + collision.session_id.substring(0, 12) + '... shared by PIDs ' +
      collision.markers.map(m => m.pid).join(', ') + ' — keeper PID=' + keeper.pid + csidNote);

    for (const extra of extras) {
      // Use marker-based UUID if available, fall back to PID-based format
      const newTerminalId = extra.session_id || ('win-' + extra.pid);
      const newSessionId = 'session_' + randomUUID().substring(0, 8) + '_' + extra.pid;

      // Check if a session with this terminal_id already exists (idempotent)
      const { data: existing } = await supabase
        .from('claude_sessions')
        .select('session_id')
        .eq('terminal_id', newTerminalId)
        .in('status', ['active', 'idle'])
        .limit(1);

      if (existing && existing.length > 0) {
        actions.push('IDENTITY_SPLIT: PID ' + extra.pid + ' already has session ' + existing[0].session_id.substring(0, 20) + ' — skipped');
        continue;
      }

      // Create a new session record for this PID
      const { error: insertErr } = await supabase
        .from('claude_sessions')
        .insert({
          session_id: newSessionId,
          terminal_id: newTerminalId,
          tty: newTerminalId,
          pid: extra.pid,
          hostname: LOCAL_HOSTNAME,
          codebase: path.resolve(__dirname, '..'),
          status: 'idle',
          heartbeat_at: new Date().toISOString(),
          metadata: { split_from: collision.session_id, split_reason: 'IDENTITY_COLLISION', original_pid: extra.pid, claude_session_id: extra.claude_session_id || null }
        });

      if (insertErr) {
        warnings.push('IDENTITY_SPLIT: failed to create session for PID ' + extra.pid + ' — ' + insertErr.message);
        continue;
      }

      // Update the marker file to point to the new session
      try {
        const markerData = JSON.parse(fs.readFileSync(extra.marker_path, 'utf8'));
        markerData.session_id = newSessionId;
        markerData.split_from = collision.session_id;
        markerData.split_at = new Date().toISOString();
        fs.writeFileSync(extra.marker_path, JSON.stringify(markerData, null, 2));
      } catch (e) {
        warnings.push('IDENTITY_SPLIT: failed to update marker for PID ' + extra.pid + ' — ' + e.message);
      }

      // Send IDENTITY_COLLISION coordination message to the original session
      // so the affected process knows to re-register on next heartbeat
      await supabase.from('session_coordination').insert({
        target_session: collision.session_id,
        message_type: 'IDENTITY_COLLISION',
        subject: 'Session identity collision detected — PID ' + extra.pid + ' split off',
        body: 'Multiple Claude Code processes were sharing session ' + collision.session_id.substring(0, 12) + '...\n\n' +
          'PID ' + extra.pid + ' has been assigned new session: ' + newSessionId + '\n' +
          'PID ' + keeper.pid + ' keeps the original session.\n\n' +
          'If you have an active SD claim, run /claim to verify your claim is intact.\n' +
          'If your claim was lost, run /claim to re-claim your SD.',
        payload: {
          collision_pids: collision.markers.map(m => m.pid),
          keeper_pid: keeper.pid,
          split_pid: extra.pid,
          new_session_id: newSessionId,
          original_session_id: collision.session_id
        },
        sender_type: 'sweep'
      }).catch(() => {});

      actions.push('IDENTITY_SPLIT: PID ' + extra.pid + ' → new session ' + newSessionId.substring(0, 20) + ' (terminal_id=' + newTerminalId + ')');
    }
  }
}

// --- Layer 3: npm Install Mutex ---
// File-based lock to prevent concurrent npm install from corrupting node_modules.
const NPM_LOCK_PATH = path.resolve(__dirname, '../node_modules/.npm-install.lock');
const NPM_LOCK_MAX_AGE_MS = 5 * 60 * 1000; // 5min max lock age (auto-expire stale locks)

function checkNpmInstallLock() {
  if (!fs.existsSync(NPM_LOCK_PATH)) return { locked: false };
  try {
    const data = JSON.parse(fs.readFileSync(NPM_LOCK_PATH, 'utf8'));
    const age = Date.now() - data.timestamp;
    if (age > NPM_LOCK_MAX_AGE_MS) {
      // Stale lock — remove it
      fs.unlinkSync(NPM_LOCK_PATH);
      return { locked: false, stale_removed: true, stale_pid: data.pid };
    }
    // Check if lock holder is still alive
    if (data.pid && !isProcessRunning(data.pid)) {
      fs.unlinkSync(NPM_LOCK_PATH);
      return { locked: false, dead_removed: true, dead_pid: data.pid };
    }
    return { locked: true, holder_pid: data.pid, age_seconds: Math.round(age / 1000) };
  } catch {
    // Corrupt lock file — remove
    try { fs.unlinkSync(NPM_LOCK_PATH); } catch {}
    return { locked: false };
  }
}

async function main() {
  const now = new Date();
  const actions = [];
  const warnings = [];
  const conflictEvicted = [];

  // 1. Get all sessions with SD claims
  const { data: sessions, error: sessErr } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, tty, pid, track, is_virtual, parent_session_id, terminal_id')
    .not('sd_key', 'is', null)
    .order('heartbeat_age_seconds', { ascending: true });

  if (sessErr) {
    console.log('ERROR: Failed to query sessions — ' + sessErr.message);
    process.exit(1);
  }

  if (!sessions || sessions.length === 0) {
    console.log('[' + now.toLocaleTimeString() + '] SWEEP: No sessions with claims. All clear.');
    return;
  }

  // 2a. Identity collision detection (Layer 1) — run BEFORE classification
  // so aliveMarkers are available for PID-based liveness cross-referencing.
  const { collisions, aliveMarkers } = detectIdentityCollisions();

  // Build a set of alive CC PIDs from marker files (pid-*.json + fallback-*.json).
  // DB terminal_id formats: "win-cc-{port}-{ccPid}" (CLI) or "win-{PID}" (Desktop).
  // Match by extracting the last segment from terminal_id and checking the alive set.
  const aliveCcPids = new Set(aliveMarkers.map(m => String(m.pid)));

  // 2. Classify each session
  // Primary signal: heartbeat age. Secondary signal: PID marker liveness.
  // A session with a stale heartbeat but a living PID is likely loading context
  // or between tool calls (heartbeat fires on PostToolUse only).
  const VERY_STALE_SECONDS = STALE_THRESHOLD_SECONDS * 3; // 15min = definitely dead
  // SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001: Virtual drain sessions use shorter thresholds
  const VIRTUAL_STALE_THRESHOLD = 180; // 3 minutes for virtual drain agents
  const VIRTUAL_VERY_STALE = VIRTUAL_STALE_THRESHOLD * 2; // 6 minutes = definitely dead
  const classified = sessions.map(s => {
    const threshold = s.is_virtual ? VIRTUAL_STALE_THRESHOLD : STALE_THRESHOLD_SECONDS;
    const veryStaleThreshold = s.is_virtual ? VIRTUAL_VERY_STALE : VERY_STALE_SECONDS;
    const isStale = s.heartbeat_age_seconds > threshold;
    const isVeryStale = s.heartbeat_age_seconds > veryStaleThreshold;

    // Cross-reference with PID marker files: if the CC process is alive on this
    // machine, the session is running even without recent heartbeats.
    // terminal_id formats: "win-cc-{port}-{ccPid}" (CLI) or "win-{PID}" (Desktop).
    // Extract the last segment as the PID to check against alive markers.
    let hasPidAlive = false;
    if (s.terminal_id) {
      const parts = s.terminal_id.split('-');
      const ccPid = parts[parts.length - 1]; // last segment is the ccPid
      hasPidAlive = aliveCcPids.has(ccPid);
    }

    // Desktop sessions use heuristic liveness (claude.exe running + recent marker).
    // Cap the protection: if heartbeat is >30 min stale, treat as dead even with
    // a "live" marker — the specific session has likely exited while claude.exe
    // continues running for other sessions.
    const DESKTOP_DEAD_CAP_SECONDS = 1800; // 30 minutes
    const isDesktopSession = s.terminal_id && /^win-\d+$/.test(s.terminal_id);
    const exceedsDesktopCap = isDesktopSession && s.heartbeat_age_seconds > DESKTOP_DEAD_CAP_SECONDS;

    let status;
    if (!isStale) {
      status = 'ACTIVE';
    } else if (hasPidAlive && !exceedsDesktopCap) {
      // PID is alive but heartbeat is stale — session is loading context,
      // compacting, or between tool calls. NOT stale.
      status = 'ALIVE_NO_HEARTBEAT';
    } else if (isVeryStale || exceedsDesktopCap) {
      status = 'DEAD'; // No heartbeat for 15min+ (CLI) or 30min+ (Desktop) AND no living PID
    } else {
      status = 'STALE_UNKNOWN'; // Between 5-15min, no PID match = might be on another host
    }

    return { ...s, isStale: isStale && !hasPidAlive, status };
  });
  if (collisions.length > 0) {
    await splitCollidingSessions(supabase, collisions, actions, warnings);
  }

  // 2c. npm install lock cleanup (Layer 3)
  const npmLock = checkNpmInstallLock();
  if (npmLock.stale_removed) {
    actions.push('NPM_LOCK: removed stale install lock (PID ' + npmLock.stale_pid + ' — expired)');
  }
  if (npmLock.dead_removed) {
    actions.push('NPM_LOCK: removed dead install lock (PID ' + npmLock.dead_pid + ' — process gone)');
  }
  if (npmLock.locked) {
    warnings.push('NPM_LOCK: active install lock held by PID ' + npmLock.holder_pid + ' (' + npmLock.age_seconds + 's)');
  }

  // 3. Detect conflicts (multiple sessions claiming same SD)
  const bySD = {};
  classified.forEach(s => {
    if (!bySD[s.sd_key]) bySD[s.sd_key] = [];
    bySD[s.sd_key].push(s);
  });

  const conflicts = Object.entries(bySD).filter(([, arr]) => arr.length > 1);

  // 3b. QA — detect sessions working on completed SDs
  const claimedSdKeys = [...new Set(classified.map(s => s.sd_key).filter(Boolean))];
  const { data: claimedSdStatus } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, completion_date')
    .in('sd_key', claimedSdKeys);

  const sdStatusMap = {};
  (claimedSdStatus || []).forEach(sd => { sdStatusMap[sd.sd_key] = sd; });

  const workingOnCompleted = classified.filter(s => {
    const sd = sdStatusMap[s.sd_key];
    return sd && sd.status === 'completed';
  });

  for (const s of workingOnCompleted) {
    // Use 'released' not 'idle' — stale sessions can't become 'idle' due to
    // idx_claude_sessions_unique_terminal_active (one active/idle per terminal).
    // Using 'idle' silently fails when another session on the same terminal exists.
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: 'SWEEP_SD_ALREADY_COMPLETED',
        worktree_path: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (!error) {
      // Also clear claiming_session_id on the SD to break the churn loop
      await supabase
        .from('strategic_directives_v2')
        .update({ claiming_session_id: null, is_working_on: false })
        .eq('sd_key', s.sd_key);
      await resetSdPhaseOnRelease(s.sd_key, 'SWEEP_SD_ALREADY_COMPLETED');
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — ' + s.sd_key + ' already completed');
    }
  }

  // 3c. QA — detect sessions claiming SDs that don't exist
  const orphanedClaims = classified.filter(s => !sdStatusMap[s.sd_key]);
  for (const s of orphanedClaims) {
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: 'SWEEP_ORPHANED_CLAIM',
        worktree_path: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (!error) {
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — SD ' + s.sd_key + ' not found in DB');
    }
  }

  // 3d. QA — detect SDs stuck in pending_approval with no claiming session
  const pendingApproval = (claimedSdStatus || []).filter(sd => sd.status === 'pending_approval');
  // Also check standalone SDs not already in claimedSdStatus
  const claimedKeys = new Set((claimedSdStatus || []).map(sd => sd.sd_key));
  const { data: allPendingApproval } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, current_phase, progress_percentage, completion_date')
    .eq('status', 'pending_approval');

  const activeClaimSdIds = new Set(classified.filter(s => s.status === 'ACTIVE').map(s => s.sd_key));
  const stuckApproval = (allPendingApproval || []).filter(sd => !activeClaimSdIds.has(sd.sd_key));

  for (const sd of stuckApproval) {
    // FIX #1: STUCK_100 — if at 100% with completion_date, mark completed instead of resetting
    if (sd.progress_percentage >= 100 && sd.completion_date) {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          claiming_session_id: null,
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key)
        .select();

      if (!error) {
        actions.push('QA: completed ' + sd.sd_key + ' — was stuck at 100%/pending_approval with completion_date');
      }
    } else {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'draft',
          current_phase: 'LEAD',
          progress_percentage: 0,
          claiming_session_id: null,
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key);

      if (!error) {
        actions.push('QA: reset ' + sd.sd_key + ' from pending_approval → draft/LEAD/0% (no session working on it)');
      }
    }
  }

  // FIX #2: Proactively clear stale claiming_session_id on completed SDs to prevent churn
  const { data: completedWithClaims } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, claiming_session_id, is_working_on')
    .eq('status', 'completed')
    .not('claiming_session_id', 'is', null);

  for (const sd of (completedWithClaims || [])) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ claiming_session_id: null, is_working_on: false })
      .eq('sd_key', sd.sd_key)
      .select();

    if (!error) {
      actions.push('QA: cleared stale claiming_session_id on completed ' + sd.sd_key);
    }
  }

  // 3e. QA — detect and auto-enrich bare-shell SDs (FIX #6)
  const { data: pendingSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, description, scope')
    .in('status', ['draft', 'ready'])
    .not('sd_key', 'like', '%ORCH-STAGE-VENTURE-WORKFLOW-001-%');
  const bareShellSDs = (pendingSDs || []).filter(sd => {
    if (sd.description && sd.description.startsWith('Child SD of')) return false;
    return !sd.description || sd.description === sd.title || (sd.description.length < 100 && sd.scope === sd.title);
  });
  if (bareShellSDs.length > 0) {
    const repoRoot = path.resolve(__dirname, '..');
    const searchDirs = ['docs/audits', 'docs/plans', 'brainstorm'].map(d => path.join(repoRoot, d));

    for (const sd of bareShellSDs) {
      // Try to find matching content in docs/audits, docs/plans, brainstorm
      const keywords = sd.title.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3);
      let bestMatch = null;
      let bestScore = 0;

      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const nameLower = file.toLowerCase();
          const score = keywords.filter(kw => nameLower.includes(kw)).length;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = path.join(dir, file);
          }
        }
      }

      if (bestMatch && bestScore >= 2) {
        // Read up to 2000 chars from the matching file for description enrichment
        const content = fs.readFileSync(bestMatch, 'utf8').substring(0, 2000);
        // Extract first paragraph or summary section
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const summary = lines.slice(0, 10).join('\n').substring(0, 500);

        if (summary.length > 50) {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .update({
              description: sd.title + '\n\n' + summary + '\n\n[Auto-enriched by sweep from ' + path.basename(bestMatch) + ']'
            })
            .eq('sd_key', sd.sd_key)
            .select();

          if (!error) {
            actions.push('ENRICH: ' + sd.sd_key + ' — description populated from ' + path.basename(bestMatch));
          } else {
            warnings.push('BARE_SHELL: ' + sd.sd_key + ' — enrichment failed: ' + error.message);
          }
        } else {
          warnings.push('BARE_SHELL: ' + sd.sd_key + ' — found ' + path.basename(bestMatch) + ' but content too short');
        }
      } else {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' has no real description — no matching docs found');
      }
    }
  }

  // 4. Auto-release dead sessions (with WIP guard + MC liveness gate)
  const dead = classified.filter(s => s.status === 'DEAD');

  // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): Pre-fetch the latest MC
  // estimate per dead-classified session (single query, then index). An
  // estimate older than FLEET_MC_ESTIMATE_STALENESS_SEC is treated as
  // unavailable — we fall through to pre-MC behavior rather than trusting
  // a stale probability.
  const mcBySession = new Map();
  if (FLEET_MC_SWEEP_GATE && dead.length > 0) {
    const sinceIso = new Date(Date.now() - FLEET_MC_ESTIMATE_STALENESS_SEC * 1000).toISOString();
    const { data: mcRows, error: mcErr } = await supabase
      .from('fleet_liveness_estimates')
      .select('session_id, observed_at, p_alive, p_alive_ci_low, p_alive_ci_high, mc_samples')
      .in('session_id', dead.map(d => d.session_id))
      .gte('observed_at', sinceIso)
      .order('observed_at', { ascending: false });
    if (mcErr) {
      warnings.push('MC_GATE: lookup failed: ' + mcErr.message + ' — falling back to pre-MC sweep');
    } else {
      for (const row of mcRows || []) {
        if (!mcBySession.has(row.session_id)) mcBySession.set(row.session_id, row);
      }
    }
  }

  for (const s of dead) {
    // SD-MAN-INFRA-WORKER-WORKTREE-SELF-001: WIP release guard
    // Sessions with uncommitted changes are protected from automatic release.
    // This check fires BEFORE MC consultation per AC-3: existing WIP_GUARD
    // must fire independently regardless of MC state.
    if (s.has_uncommitted_changes === true) {
      warnings.push('WIP_GUARD: ' + s.session_id + ' has uncommitted changes — NOT releasing (SD: ' + s.sd_key + ')');
      continue;
    }

    // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): MC liveness gate.
    // Rules:
    //   - heartbeat >= 20m → force release (SWEEP_HARD_CAP_20M). MC ignored.
    //   - heartbeat <  20m AND P(alive) > 0.3 → HOLD (WIP_GUARD_MC), do not release.
    //   - otherwise → proceed with existing SWEEP_PID_DEAD release.
    const hbSec = s.heartbeat_age_seconds || 0;
    let releaseReason = 'SWEEP_PID_DEAD';
    if (FLEET_MC_SWEEP_GATE) {
      if (hbSec >= FLEET_MC_HARD_CAP_SEC) {
        releaseReason = 'SWEEP_HARD_CAP_20M';
      } else {
        const mc = mcBySession.get(s.session_id);
        if (mc && Number(mc.p_alive) > FLEET_MC_PALIVE_HOLD_THRESHOLD) {
          warnings.push(
            'WIP_GUARD_MC: ' + s.session_id + ' P(alive)=' + Number(mc.p_alive).toFixed(2) +
            ' > ' + FLEET_MC_PALIVE_HOLD_THRESHOLD + ' threshold, hb=' + Math.round(hbSec) + 's — HOLDING (SD: ' + s.sd_key + ')'
          );
          continue;
        }
      }
    }

    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-1, FR-2): Atomically set is_alive=false
    // and clear dirty fields when releasing dead session claims. Prevents successor sessions
    // from inheriting stale worktree_path, has_uncommitted_changes, and current_branch.
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: 'released',
        released_at: now.toISOString(),
        released_reason: releaseReason,
        is_alive: false,
        worktree_path: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (error) {
      actions.push('FAILED to release ' + s.session_id + ' (' + s.sd_key + '): ' + error.message);
    } else {
      if (s.sd_key) {
        await resetSdPhaseOnRelease(s.sd_key, releaseReason);
        // Clear claiming_session_id on the SD so the next worker can claim it
        // without hitting foreign_claim in the claim validity gate.
        await supabase
          .from('strategic_directives_v2')
          .update({ claiming_session_id: null, is_working_on: false })
          .eq('claiming_session_id', s.session_id);
      }
      actions.push('RELEASED ' + s.session_id + ' — reason=' + releaseReason + ' — freed ' + s.sd_key);
    }
  }

  // 4a. Worktree conflict detection (SD-MAN-INFRA-WORKER-WORKTREE-SELF-001)
  // Detect multiple active sessions on the same feature branch (excludes main/QF)
  const branchSessions = new Map();
  for (const s of classified.filter(c => c.status === 'ACTIVE' && c.current_branch && c.current_branch !== 'main')) {
    if (!branchSessions.has(s.current_branch)) branchSessions.set(s.current_branch, []);
    branchSessions.get(s.current_branch).push(s);
  }
  for (const [branch, sessions] of branchSessions) {
    if (sessions.length > 1) {
      const ids = sessions.map(s => s.session_id).join(', ');
      warnings.push('WORKTREE_CONFLICT: branch ' + branch + ' claimed by ' + sessions.length + ' sessions: ' + ids);
    }
  }

  // 4b. Struggling worker detection (SD-MAN-INFRA-WORKER-WORKTREE-SELF-001)
  // Flag workers with repeated handoff failures
  for (const s of classified.filter(c => c.status === 'ACTIVE' && (c.handoff_fail_count || 0) > 3)) {
    const tier = s.handoff_fail_count >= 7 ? 'REASSIGN' : s.handoff_fail_count >= 5 ? 'RCA' : 'WARN';
    warnings.push('WORKER_STRUGGLING: ' + s.session_id + ' has ' + s.handoff_fail_count + ' handoff failures (tier: ' + tier + ', SD: ' + s.sd_key + ')');
  }

  // 5. Resolve conflicts — keep freshest, release ALL others (including active)
  for (const [sdId, claimants] of conflicts) {
    const sorted = claimants.sort((a, b) => a.heartbeat_age_seconds - b.heartbeat_age_seconds);
    const keeper = sorted[0];
    const evictees = sorted.slice(1);

    for (const evict of evictees) {
      // Skip if already released in step 4
      if (dead.find(d => d.session_id === evict.session_id)) continue;

      const targetStatus = evict.status === 'ACTIVE' ? 'idle' : 'released';
      // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
      const { error } = await supabase
        .from('claude_sessions')
        .update({
          sd_key: null,
          status: targetStatus,
          released_at: now.toISOString(),
          released_reason: 'SWEEP_CONFLICT_RESOLUTION',
          worktree_path: null,
          has_uncommitted_changes: false,
          current_branch: null
        })
        .eq('session_id', evict.session_id);

      if (!error) {
        const tag = evict.status === 'ACTIVE' ? ' (was active)' : '';
        await resetSdPhaseOnRelease(sdId, 'SWEEP_CONFLICT_RESOLUTION');
        actions.push('CONFLICT on ' + sdId + ': released ' + evict.session_id + tag + ' (kept ' + keeper.session_id + ')');

        // Send coordination message to the evicted session so it picks up other work
        conflictEvicted.push(evict);
      }
    }
  }

  // 6. Send coordination messages to active sessions
  // Load BOTH orchestrator children AND all pending standalone SDs
  const [childRes, standaloneRes] = await Promise.all([
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies')
      .like('sd_key', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      .order('sd_key', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies, priority')
      .in('status', ['draft', 'in_progress', 'ready', 'pending_approval'])
      .not('sd_key', 'like', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001%')
      .limit(20)
  ]);

  const children = childRes.data || [];
  const standaloneSDs = standaloneRes.data || [];
  const allSDs = [...children, ...standaloneSDs];

  // Dependency-aware availability: only suggest SDs whose deps are all completed
  const completedKeys = new Set(allSDs.filter(c => c.status === 'completed').map(c => c.sd_key));
  const claimedByActive = new Set(classified.filter(s => s.status === 'ACTIVE').map(s => s.sd_key));

  const available = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      if (claimedByActive.has(c.sd_key)) return false;
      // Check dependencies are satisfied
      if (c.dependencies && Array.isArray(c.dependencies) && c.dependencies.length > 0) {
        const allDepsMet = c.dependencies.every(dep => completedKeys.has(dep));
        if (!allDepsMet) return false;
      }
      return true;
    })
    .map(c => c.sd_key);

  const blocked = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      if (!c.dependencies || !Array.isArray(c.dependencies) || c.dependencies.length === 0) return false;
      return !c.dependencies.every(dep => completedKeys.has(dep));
    })
    .map(c => c.sd_key);

  const activeSessions = classified.filter(s => s.status === 'ACTIVE' || s.status === 'ALIVE_NO_HEARTBEAT');

  // 6b. QA — Claim Integrity: detect idle sessions with no SD claim and nudge them
  const { data: idleSessions } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, heartbeat_age_seconds, heartbeat_age_human, computed_status, tty')
    .is('sd_key', null)
    .order('heartbeat_age_seconds', { ascending: true });

  const aliveIdle = (idleSessions || []).filter(s => s.heartbeat_age_seconds < STALE_THRESHOLD_SECONDS);
  const claimIntegrityIssues = [];

  for (const s of aliveIdle) {
    // Only nudge if idle for >5min (give time for post-completion transitions: /learn, protocol reads, context compaction)
    if (s.heartbeat_age_seconds < 300) continue;

    // Check if we already sent a CLAIM_REMINDER recently (avoid spam)
    const { data: existingReminder } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'CLAIM_REMINDER')
      .is('acknowledged_at', null)
      .limit(1);

    if (existingReminder && existingReminder.length > 0) continue;

    // Send CLAIM_REMINDER (includes worktree reminder)
    const topSD = available.length > 0 ? available[0] : null;
    const suggestion = topSD ? 'Suggested: ' + topSD + ' (highest priority unclaimed)' : 'Run /leo next for the SD queue.';
    const worktreeReminder = '\n\nIMPORTANT: Before starting work, ensure you are in your own isolated worktree. ' +
      'Run: node scripts/resolve-sd-workdir.js <SD-ID> — this creates a dedicated worktree so parallel workers ' +
      'do not corrupt each other\'s node_modules or git state.';
    await supabase.from('session_coordination').insert({
      target_session: s.session_id,
      message_type: 'CLAIM_REMINDER',
      subject: 'No SD claimed — ' + available.length + ' SDs available for work',
      body: 'You have been idle for ' + s.heartbeat_age_human + ' with no SD claim. ' + suggestion + worktreeReminder + '\n\nRun: /claim or /leo next',
      payload: { available_sds: available, idle_seconds: s.heartbeat_age_seconds },
      sender_type: 'sweep'
    }).then(() => {}).catch(() => {});

    claimIntegrityIssues.push(s.session_id.substring(0, 20) + ' (' + s.tty + ')');
  }

  // Also check: sessions with sd_id but SD's claiming_session_id doesn't match (broken claim)
  for (const s of classified.filter(c => c.status === 'ACTIVE' && c.sd_key)) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, is_working_on')
      .eq('sd_key', s.sd_key)
      .single();

    if (!sd) continue;

    // Fix broken claim: session thinks it owns SD but SD doesn't know
    if (sd.claiming_session_id !== s.session_id) {
      await supabase
        .from('strategic_directives_v2')
        .update({ claiming_session_id: s.session_id, is_working_on: true })
        .eq('sd_key', s.sd_key)
        .select();
      actions.push('CLAIM_FIX: set claiming_session_id on ' + s.sd_key + ' → ' + s.session_id.substring(0, 20));
    } else if (!sd.is_working_on) {
      // Fix incomplete claim: claiming_session_id matches but is_working_on is false
      await supabase
        .from('strategic_directives_v2')
        .update({ is_working_on: true })
        .eq('sd_key', s.sd_key)
        .select();
      actions.push('CLAIM_FIX: set is_working_on=true on ' + s.sd_key);
    }
  }

  if (claimIntegrityIssues.length > 0) {
    actions.push('CLAIM_REMINDER: nudged ' + claimIntegrityIssues.length + ' idle session(s) — ' + claimIntegrityIssues.join(', '));
  }

  // Clean up expired messages first
  try { await supabase.rpc('cleanup_expired_coordination'); } catch { /* ignore */ }

  // FIX #3: Clean up coordination messages targeting dead/stale sessions
  // These accumulate because target sessions exit without reading them
  const allSessionIds = new Set(classified.map(s => s.session_id));
  const { data: unreadMsgs } = await supabase
    .from('session_coordination')
    .select('id, target_session')
    .is('acknowledged_at', null)
    .is('read_at', null);

  const deadMsgIds = (unreadMsgs || [])
    .filter(m => !allSessionIds.has(m.target_session))
    .map(m => m.id);

  // Also include messages targeting sessions classified as DEAD or stale
  const deadOrStaleIds = new Set(classified.filter(s => s.status !== 'ACTIVE').map(s => s.session_id));
  const staleMsgIds = (unreadMsgs || [])
    .filter(m => deadOrStaleIds.has(m.target_session))
    .map(m => m.id);

  const allDeadMsgIds = [...new Set([...deadMsgIds, ...staleMsgIds])];
  if (allDeadMsgIds.length > 0) {
    // Delete in batches of 50
    for (let i = 0; i < allDeadMsgIds.length; i += 50) {
      const batch = allDeadMsgIds.slice(i, i + 50);
      await supabase.from('session_coordination').delete().in('id', batch);
    }
    actions.push('CLEANUP: deleted ' + allDeadMsgIds.length + ' unread coordination messages targeting dead/gone sessions');
  }

  for (const s of activeSessions) {
    // Check if we already have an unacknowledged message for this session
    const { data: existing } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'WORK_ASSIGNMENT')
      .is('acknowledged_at', null)
      .limit(1);

    if (existing && existing.length > 0) continue; // Don't spam

    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_key,
        message_type: 'WORK_ASSIGNMENT',
        subject: 'Next work available when ' + s.sd_key.split('-').pop() + ' completes',
        body: 'When you complete ' + s.sd_key + ', pick up the next unclaimed child.\n\nREMINDER: Ensure you are in your own isolated worktree before starting new work. Run: node scripts/resolve-sd-workdir.js <SD-ID>',
        payload: { available_sds: available, current_sd: s.sd_key },
        sender_type: 'sweep'
      });
  }

  // Also send CLAIM_RELEASED messages for any sessions we evicted (dead)
  for (const d of dead) {
    await supabase
      .from('session_coordination')
      .insert({
        target_session: d.session_id,
        target_sd: d.sd_key,
        message_type: 'CLAIM_RELEASED',
        subject: 'Claim on ' + (d.sd_key || 'unknown') + ' was released (PID dead)',
        body: 'Your session was detected as dead (PID ' + d.pid + '). Claim released. Available: ' + available.join(', '),
        payload: { released_sd: d.sd_key, reason: 'PID_DEAD', available_sds: available },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for conflict-evicted active sessions
  for (const evict of conflictEvicted) {
    const otherAvailable = available.filter(sd => sd !== evict.sd_id);
    await supabase
      .from('session_coordination')
      .insert({
        target_session: evict.session_id,
        target_sd: evict.sd_id,
        message_type: 'CLAIM_RELEASED',
        subject: 'Duplicate claim on ' + (evict.sd_key || '').split('-').pop() + ' resolved — pick next SD',
        body: 'Another session is already working on ' + evict.sd_key + '. Your claim was released to avoid duplicate work. Please claim one of: ' + (otherAvailable.length > 0 ? otherAvailable.join(', ') : 'run /leo next for available SDs') + '\n\nREMINDER: Ensure you are in your own isolated worktree before starting new work. Run: node scripts/resolve-sd-workdir.js <SD-ID>',
        payload: { released_sd: evict.sd_key, reason: 'CONFLICT_RESOLUTION', available_sds: otherAvailable },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for QA-released sessions (completed SD or orphan)
  for (const s of [...workingOnCompleted, ...orphanedClaims]) {
    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_key,
        message_type: 'CLAIM_RELEASED',
        subject: 'SD ' + s.sd_key.split('-').pop() + ' already completed — pick next SD',
        body: 'Your SD ' + s.sd_key + ' is already completed. Your claim was released. Please pick up one of: ' + (available.length > 0 ? available.join(', ') : 'run /leo next for available SDs'),
        payload: { released_sd: s.sd_key, reason: 'SD_ALREADY_COMPLETED', available_sds: available },
        sender_type: 'sweep'
      });
  }

  // 7. Get orchestrator progress for summary
  const completed = (children || []).filter(c => c.status === 'completed').length;
  const total = (children || []).length;
  const orchPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // 8. Output summary
  console.log('');
  console.log('=== STALE SESSION SWEEP [' + now.toLocaleTimeString() + '] ===');
  console.log('');

  // Active workers
  console.log('ACTIVE WORKERS (' + activeSessions.length + '):');
  activeSessions.forEach(s => {
    const child = (children || []).find(c => c.sd_key === s.sd_key);
    const pct = child ? child.progress_percentage : '?';
    const tag = s.status === 'ALIVE_NO_HEARTBEAT' ? ' (PID alive, loading)' : '';
    console.log('  ' + (s.tty || '?').padEnd(12) + (s.sd_key || '?').padEnd(50) + bar(pct) + ' ' + pct + '%' + tag);
  });
  console.log('');

  // Stale sessions (exclude ALIVE_NO_HEARTBEAT — shown above with active workers)
  const stale = classified.filter(s => s.status !== 'ACTIVE' && s.status !== 'ALIVE_NO_HEARTBEAT');
  if (stale.length > 0) {
    console.log('STALE/DEAD (' + stale.length + '):');
    stale.forEach(s => {
      const tag = s.status === 'DEAD' ? 'RELEASED' : s.status;
      console.log('  ' + (s.tty || '?').padEnd(12) + (s.sd_key || '?').padEnd(50) + tag + ' (' + s.heartbeat_age_human + ')');
    });
    console.log('');
  }

  // Actions taken
  if (actions.length > 0) {
    console.log('ACTIONS TAKEN (' + actions.length + '):');
    actions.forEach(a => console.log('  > ' + a));
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('WARNINGS (' + warnings.length + '):');
    warnings.forEach(w => console.log('  ! ' + w));
    console.log('');
  }

  // Conflicts
  if (conflicts.length > 0) {
    console.log('CONFLICTS DETECTED: ' + conflicts.length);
    conflicts.forEach(([sdId, arr]) => {
      console.log('  ' + sdId + ': ' + arr.map(s => s.session_id.substring(0, 20) + '(' + s.status + ')').join(' vs '));
    });
    console.log('');
  } else {
    console.log('CONFLICTS: None');
    console.log('');
  }

  // QA summary
  const stuckCompleted = stuckApproval.filter(sd => sd.progress_percentage >= 100 && sd.completion_date);
  const stuckReset = stuckApproval.filter(sd => !(sd.progress_percentage >= 100 && sd.completion_date));
  const qaIssues = workingOnCompleted.length + orphanedClaims.length + stuckApproval.length + (completedWithClaims || []).length;
  if (qaIssues > 0) {
    console.log('QA FIXES (' + qaIssues + '):');
    if (workingOnCompleted.length > 0) console.log('  Released ' + workingOnCompleted.length + ' session(s) working on completed SDs');
    if (orphanedClaims.length > 0) console.log('  Released ' + orphanedClaims.length + ' session(s) with orphaned claims');
    if (stuckCompleted.length > 0) console.log('  Completed ' + stuckCompleted.length + ' SD(s) stuck at 100%/pending_approval');
    if (stuckReset.length > 0) console.log('  Reset ' + stuckReset.length + ' SD(s) from pending_approval → draft (no session working on them)');
    if ((completedWithClaims || []).length > 0) console.log('  Cleared ' + (completedWithClaims || []).length + ' stale claiming_session_id on completed SDs');
    if (claimIntegrityIssues.length > 0) console.log('  Nudged ' + claimIntegrityIssues.length + ' idle session(s) with CLAIM_REMINDER');
    console.log('');
  }

  // Identity collision summary
  if (collisions.length > 0) {
    console.log('IDENTITY COLLISIONS (' + collisions.length + '):');
    for (const c of collisions) {
      console.log('  Session ' + c.session_id.substring(0, 12) + '... shared by PIDs: ' + c.markers.map(m => m.pid).join(', '));
    }
    console.log('');
  }

  // Alive markers summary (useful for debugging)
  if (aliveMarkers.length > 0) {
    console.log('MARKER FILES (' + aliveMarkers.length + ' alive):');
    for (const m of aliveMarkers) {
      console.log('  PID=' + String(m.pid).padEnd(8) + 'session=' + (m.session_id || '?').substring(0, 12) + '...' + '  port=' + (m.sse_port || '?'));
    }
    console.log('');
  }

  // npm lock status
  if (npmLock.locked || npmLock.stale_removed || npmLock.dead_removed) {
    console.log('NPM INSTALL LOCK:');
    if (npmLock.locked) console.log('  ACTIVE — held by PID ' + npmLock.holder_pid + ' for ' + npmLock.age_seconds + 's');
    if (npmLock.stale_removed) console.log('  CLEARED — stale lock from PID ' + npmLock.stale_pid + ' (expired)');
    if (npmLock.dead_removed) console.log('  CLEARED — dead lock from PID ' + npmLock.dead_pid + ' (process gone)');
    console.log('');
  }

  // Orchestrator progress
  console.log('ORCHESTRATOR: ' + bar(orchPct, 30) + ' ' + completed + '/' + total + ' children (' + orchPct + '%)');
  console.log('AVAILABLE FOR CLAIM: ' + (available.length > 0 ? available.join(', ') : 'None — all assigned'));
  if (blocked.length > 0) {
    console.log('BLOCKED (deps unmet): ' + blocked.join(', '));
  }
  console.log('COORDINATION MSGS: Sent to ' + activeSessions.length + ' active sessions');
  console.log('');
  console.log('=== SWEEP COMPLETE ===');
}

main().catch(err => {
  console.error('SWEEP FATAL:', err.message);
  process.exit(1);
});
