/**
 * Coordination Inbox Hook — Surfaces cross-session messages + auto-claim for idle workers
 *
 * Hook: PostToolUse (no matcher — fires on every tool call)
 * Throttled: Only checks DB every 60 seconds via temp file timestamp
 *
 * Reads from session_coordination table for this session.
 * When messages are found, outputs them and marks as read/acknowledged.
 *
 * AUTO-CLAIM: When session is idle (no SD claimed) and work is available,
 * emits AUTO_PROCEED_ACTION directive so Claude auto-starts the next SD.
 *
 * Falls back to metadata.coordination_message if table doesn't exist yet.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// QF-20260504-912: per-session throttle/heartbeat paths. Pre-fix these were
// host-shared, causing 5/6 sessions to be starved for up to 60s after any one
// session marked the throttle. Mirror the friction-counters pattern (validated
// regex + per-session filename) at lines ~96-125 below.
function getThrottleFile(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  return path.join(os.tmpdir(), `claude-coordination-inbox-throttle-${sessionId}.json`);
}
function getHeartbeatFile(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  return path.join(os.tmpdir(), `claude-coordination-inbox-heartbeat-${sessionId}.json`);
}

// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-5c — friction-detection counter file.
// Per-session counter of recurring failures; emits proactive /signal nudge when
// thresholds cross. Path is in .claude/tmp/ (gitignored). Security M4: validate
// session_id with regex /^[a-zA-Z0-9_-]{1,128}$/ before path.join.
const FRICTION_COUNTERS_DIR = path.resolve(__dirname, '../../.claude/tmp');
const FRICTION_TRIGGERS = {
  GATE_FAILURE_3X: 3,    // same gate failed 3+ times same session
  TOOL_FAILURE_3X: 3     // same tool error 3+ times same session
};
const IDENTITY_DIR = path.resolve(__dirname, '../../.claude');
// Per-session identity file keyed by session ID (birth certificate UUID or resolved).
// Falls back to shared file for sessions without a resolvable ID.
function getIdentityFile(resolvedSessionId) {
  const csid = resolvedSessionId || process.env.CLAUDE_SESSION_ID;
  if (csid) return path.join(IDENTITY_DIR, `fleet-identity-${csid}.json`);
  return path.join(IDENTITY_DIR, 'fleet-identity.json');
}
// SD-LEO-INFRA-FLEET-COORDINATION-RESILIENCE-001 (FR-003):
// Reduced from 300s to 60s for faster coordination message delivery.
// Configurable via env var for tuning under high DB load.
// QF-20260504-912: default reduced 60_000 → 15_000 — safe now that throttle is
// per-session (no peer interference). Per-session DB load: 4 queries/min × 6
// sessions = 24/min, well below capacity.
const CHECK_INTERVAL_MS = parseInt(process.env.COORDINATION_CHECK_INTERVAL_MS, 10) || 15_000;
const HEARTBEAT_INTERVAL_MS = 30_000; // Update heartbeat every 30 seconds
const ACTIONABLE_TYPES = ['WORK_ASSIGNMENT', 'CLAIM_RELEASED', 'CLAIM_REMINDER'];

function shouldCheck(sessionId) {
  const file = getThrottleFile(sessionId);
  if (!file) return true;
  try {
    if (!fs.existsSync(file)) return true;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Date.now() - data.lastCheck) > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markChecked(sessionId) {
  const file = getThrottleFile(sessionId);
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify({ lastCheck: Date.now() }));
  } catch { /* ignore */ }
}

function shouldHeartbeat(sessionId) {
  const file = getHeartbeatFile(sessionId);
  if (!file) return true;
  try {
    if (!fs.existsSync(file)) return true;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Date.now() - data.lastHeartbeat) > HEARTBEAT_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markHeartbeat(sessionId) {
  const file = getHeartbeatFile(sessionId);
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify({ lastHeartbeat: Date.now() }));
  } catch { /* ignore */ }
}

/**
 * Update heartbeat_at on claude_sessions — runs every 30s regardless of inbox check
 */
async function updateHeartbeat(supabase, sessionId) {
  if (!shouldHeartbeat(sessionId)) return;
  markHeartbeat(sessionId);
  try {
    // stampBranch keeps current_branch fresh on inbox-hook heartbeats — see
    // lib/session-writer.cjs and SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
    const { stampBranch } = require('../../lib/session-writer.cjs');
    await supabase
      .from('claude_sessions')
      .update(stampBranch({ heartbeat_at: new Date().toISOString() }))
      .eq('session_id', sessionId);
  } catch { /* fail silently */ }
}

// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-5c — friction-detection helpers.
// Security M4: validate session_id pattern before path.join.
function isValidSessionId(sid) {
  return typeof sid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(sid);
}

function getFrictionCounterFile(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  return path.join(FRICTION_COUNTERS_DIR, `friction-counters-${sessionId}.json`);
}

function readFrictionCounters(sessionId) {
  const file = getFrictionCounterFile(sessionId);
  if (!file) return {};
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeFrictionCounters(sessionId, counters) {
  const file = getFrictionCounterFile(sessionId);
  if (!file) return;
  try {
    fs.mkdirSync(FRICTION_COUNTERS_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(counters));
  } catch { /* fail silently */ }
}

// Note: this hook does NOT auto-detect failures from tool outputs (PostToolUse runs
// AFTER each call but does not see error counts). Counter increments must come from
// other hooks/scripts that detect domain failures (e.g., gate failure handler in
// handoff.js). The proactive-prompt fires when ANY counter crosses threshold.
function emitFrictionPrompt(counters, triggerKey) {
  const count = counters[triggerKey] || 0;
  console.log('');
  console.log('================================================================');
  console.log('  💡 PROACTIVE FRICTION PROMPT (SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-5c)');
  console.log('  Trigger: ' + triggerKey + ' = ' + count + ' (threshold: ' + FRICTION_TRIGGERS[triggerKey] + ')');
  console.log('  This recurring friction looks aggregatable across sessions.');
  console.log('  Consider: /signal stuck "<one-line summary of friction>"');
  console.log('  Decision rule: see /signal --help, FR-6 in CLAUDE_CORE.md "Signaling friction" section.');
  console.log('================================================================');
  console.log('');
}

function checkFrictionThresholds(sessionId) {
  const counters = readFrictionCounters(sessionId);
  if (!counters._sd_key_at_check) return; // not yet stamped — first check
  let fired = false;
  for (const [key, threshold] of Object.entries(FRICTION_TRIGGERS)) {
    if ((counters[key] || 0) >= threshold && !counters['_fired_' + key]) {
      emitFrictionPrompt(counters, key);
      counters['_fired_' + key] = new Date().toISOString();
      fired = true;
    }
  }
  if (fired) writeFrictionCounters(sessionId, counters);
}

function resetFrictionCountersIfSdChanged(sessionId, currentSdKey) {
  if (!isValidSessionId(sessionId)) return;
  const counters = readFrictionCounters(sessionId);
  if (counters._sd_key_at_check && counters._sd_key_at_check !== currentSdKey) {
    // SD changed — reset counters but keep history sticky for telemetry.
    const fresh = { _sd_key_at_check: currentSdKey, _reset_at: new Date().toISOString() };
    writeFrictionCounters(sessionId, fresh);
  } else if (!counters._sd_key_at_check) {
    counters._sd_key_at_check = currentSdKey;
    writeFrictionCounters(sessionId, counters);
  }
}

function getCurrentSessionId() {
  try {
    // QF-20260504-964 FIX 1: env var is canonical post-2026-04-08 session-stability rules.
    // Without this, the hook silently exits when .claude/session-id.json is absent and
    // PID-scan fails (Windows PPID=1) — coordinator→worker delivery dies fleet-wide.
    if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;

    // Check .claude/session-id.json first (most reliable)
    const sessionFile = path.resolve(__dirname, '../../.claude/session-id.json');
    if (fs.existsSync(sessionFile)) {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (data.session_id) return data.session_id;
    }

    // Fallback: scan session directory
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

/**
 * Emit action directive for idle workers to pick up available work
 */
function emitAutoClaimDirective(suggestedSd, availableSds) {
  const sdId = suggestedSd || (availableSds && availableSds[0]);

  if (sdId) {
    // Structured action line (same pattern as sd-next.js AUTO_PROCEED_ACTION)
    console.log('AUTO_PROCEED_ACTION:' + JSON.stringify({
      action: 'start',
      sd_key: sdId,
      reason: 'Coordination inbox: idle session with available work'
    }));
  }

  console.log('');
  console.log('================================================================');
  console.log('  ACTION REQUIRED: You are IDLE with no SD claimed.');
  if (sdId) {
    console.log('  Work is available. Run this command NOW:');
    console.log('');
    console.log('    npm run sd:next');
    console.log('');
    console.log('  Recommended SD: ' + sdId);
  } else if (availableSds && availableSds.length > 0) {
    console.log('  ' + availableSds.length + ' SD(s) available for work.');
    console.log('  Run: npm run sd:next');
  }
  console.log('  AUTO-PROCEED is ON — execute immediately, do not ask.');
  console.log('================================================================');
  console.log('');
}

// QF-20260504-007: Claude Code passes hook payload as JSON on stdin per its
// PostToolUse protocol. The session_id field is the only reliable identifier of
// the calling session — env vars (CLAUDE_SESSION_ID) are NOT propagated to hook
// subprocesses, and per-worktree session-id files don't exist in the parent
// worktree where the hook actually runs from. Without this read, every auto-fire
// of this hook returned null at getCurrentSessionId() and exited silently
// (closes feedback bdc65df3).
async function readSessionIdFromStdin(timeoutMs = 250) {
  return new Promise((resolve) => {
    let buf = '';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', c => { buf += c; });
      process.stdin.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(buf)?.session_id || null); } catch { resolve(null); }
      });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(null); });
    } catch { clearTimeout(timer); resolve(null); }
  });
}

async function main() {
  let supabase;
  try {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  } catch {
    return;
  }

  // QF-20260504-007: stdin is the canonical source for PostToolUse session_id.
  // Falls back to env/file/PID-scan resolution for non-PostToolUse invocations.
  const sessionId = (await readSessionIdFromStdin()) || getCurrentSessionId();
  if (!sessionId) return;

  // Always update heartbeat (30s throttle) — even when inbox check is skipped
  await updateHeartbeat(supabase, sessionId);

  if (!shouldCheck(sessionId)) return;
  markChecked(sessionId);

  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-5c — check friction counters and
  // reset if SD changed. Counters are populated by external hooks (gate failures,
  // tool retries) — this hook only reacts when thresholds cross.
  try {
    const { data: sdRow } = await supabase
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', sessionId)
      .maybeSingle();
    resetFrictionCountersIfSdChanged(sessionId, sdRow?.sd_key || null);
    checkFrictionThresholds(sessionId);
  } catch { /* fail silently — friction nudge is best-effort */ }

  // Check if this session is idle (no SD claimed)
  let isIdle = false;
  try {
    const { data: sessionData } = await supabase
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', sessionId)
      .single();
    isIdle = !sessionData?.sd_id;
  } catch { /* assume not idle if query fails */ }

  // Read unread coordination messages for this session
  const { data: messages, error: tableErr } = await supabase
    .from('session_coordination')
    .select('id, message_type, subject, body, payload, sender_type, created_at')
    .eq('target_session', sessionId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(5);

  let emittedDirective = false;

  if (!tableErr && messages && messages.length > 0) {
    // Output each message
    for (const msg of messages) {
      const typeLabel = {
        'CLAIM_RELEASED': 'CLAIM RELEASED',
        'WORK_ASSIGNMENT': 'WORK ASSIGNMENT',
        'SD_BLOCKED': 'SD BLOCKED',
        'SD_COMPLETED_NEARBY': 'NEARBY SD COMPLETED',
        'PRIORITY_CHANGE': 'PRIORITY CHANGE',
        'COACHING': 'COACHING' + (msg.payload?.coaching_type ? ': ' + msg.payload.coaching_type : ''),
        'IDENTITY_COLLISION': 'IDENTITY COLLISION',
        'CLAIM_REMINDER': 'CLAIM REMINDER',
        'STALE_WARNING': 'STALE WARNING',
        'SET_IDENTITY': 'IDENTITY ASSIGNMENT',
        'INFO': 'INFO'
      }[msg.message_type] || msg.message_type;

      // Handle SET_IDENTITY: write per-session identity file for statusline integration
      if (msg.message_type === 'SET_IDENTITY' && msg.payload) {
        try {
          fs.writeFileSync(getIdentityFile(sessionId), JSON.stringify({
            color: msg.payload.color,
            callsign: msg.payload.callsign,
            display_name: msg.payload.display_name,
            assigned_at: new Date().toISOString()
          }));
        } catch { /* ignore write errors */ }
      }

      console.log('');
      console.log('=== COORDINATION: ' + typeLabel + ' ===');
      console.log('From: ' + (msg.sender_type || 'orchestrator'));
      console.log('Subject: ' + msg.subject);
      if (msg.body) console.log('Details: ' + msg.body);
      if (msg.payload?.suggested_sd) {
        console.log('Suggested next SD: ' + msg.payload.suggested_sd);
      }
      if (msg.payload?.available_sds && msg.payload.available_sds.length > 0) {
        console.log('Available SDs: ' + msg.payload.available_sds.join(', '));
      }
      console.log('===');

      // Emit auto-claim directive for idle sessions receiving actionable messages
      if (isIdle && !emittedDirective && ACTIONABLE_TYPES.includes(msg.message_type)) {
        emitAutoClaimDirective(msg.payload?.suggested_sd, msg.payload?.available_sds);
        emittedDirective = true;
      }

      // Mark as read; only acknowledge if not an actionable idle message
      const isActionable = isIdle && ACTIONABLE_TYPES.includes(msg.message_type);
      await supabase
        .from('session_coordination')
        .update({
          read_at: new Date().toISOString(),
          acknowledged_at: isActionable ? null : new Date().toISOString()
        })
        .eq('id', msg.id);
    }
  }

  // Fallback: check metadata.coordination_message (legacy)
  if (tableErr && tableErr.code === '42P01') {
    const { data: session } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .single();

    if (!session?.metadata?.coordination_message) return;
    const msg = session.metadata.coordination_message;
    if (msg.acknowledged) return;

    console.log('');
    console.log('=== COORDINATION MESSAGE ===');
    console.log('From: ' + (msg.from || 'orchestrator'));
    console.log('Message: ' + (msg.message || ''));
    if (msg.suggested_sd) console.log('Suggested next SD: ' + msg.suggested_sd);
    if (msg.available_sds?.length > 0) console.log('Available SDs: ' + msg.available_sds.join(', '));
    console.log('===');

    if (isIdle && !emittedDirective) {
      emitAutoClaimDirective(msg.suggested_sd, msg.available_sds);
      emittedDirective = true;
    }

    const updatedMeta = { ...session.metadata };
    updatedMeta.coordination_message.acknowledged = true;
    updatedMeta.coordination_message.acknowledged_at = new Date().toISOString();
    await supabase
      .from('claude_sessions')
      .update({ metadata: updatedMeta })
      .eq('session_id', sessionId);
    return;
  }

  // PROACTIVE CHECK: If idle with no messages, check for available SDs directly
  if (isIdle && !emittedDirective) {
    try {
      const { data: availableSDs } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key')
        .in('status', ['draft', 'ready', 'in_progress'])
        .is('claiming_session_id', null)
        .not('current_phase', 'eq', 'COMPLETED')
        .order('priority_score', { ascending: false })
        .limit(3);

      if (availableSDs && availableSDs.length > 0) {
        emitAutoClaimDirective(
          availableSDs[0].sd_key,
          availableSDs.map(sd => sd.sd_key)
        );
      }
    } catch { /* fail silently */ }
  }
}

if (require.main === module) {
  main().catch(() => { /* fail silently */ });
}

module.exports = {
  getCurrentSessionId,
  readSessionIdFromStdin,
  // QF-20260504-912 — exposed for per-session throttle/heartbeat tests
  shouldCheck,
  markChecked,
  shouldHeartbeat,
  markHeartbeat,
  getThrottleFile,
  getHeartbeatFile
};
