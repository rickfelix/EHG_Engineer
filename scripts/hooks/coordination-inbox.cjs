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

const THROTTLE_FILE = path.join(os.tmpdir(), 'claude-coordination-inbox-last-check.json');
const HEARTBEAT_FILE = path.join(os.tmpdir(), 'claude-heartbeat-last-update.json');
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
const CHECK_INTERVAL_MS = parseInt(process.env.COORDINATION_CHECK_INTERVAL_MS, 10) || 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000; // Update heartbeat every 30 seconds
const ACTIONABLE_TYPES = ['WORK_ASSIGNMENT', 'CLAIM_RELEASED', 'CLAIM_REMINDER'];

function shouldCheck() {
  try {
    if (!fs.existsSync(THROTTLE_FILE)) return true;
    const data = JSON.parse(fs.readFileSync(THROTTLE_FILE, 'utf8'));
    return (Date.now() - data.lastCheck) > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markChecked() {
  try {
    fs.writeFileSync(THROTTLE_FILE, JSON.stringify({ lastCheck: Date.now() }));
  } catch { /* ignore */ }
}

function shouldHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) return true;
    const data = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
    return (Date.now() - data.lastHeartbeat) > HEARTBEAT_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ lastHeartbeat: Date.now() }));
  } catch { /* ignore */ }
}

/**
 * Update heartbeat_at on claude_sessions — runs every 30s regardless of inbox check
 */
async function updateHeartbeat(supabase, sessionId) {
  if (!shouldHeartbeat()) return;
  markHeartbeat();
  try {
    await supabase
      .from('claude_sessions')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  } catch { /* fail silently */ }
}

function getCurrentSessionId() {
  try {
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

async function main() {
  let supabase;
  try {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  } catch {
    return;
  }

  const sessionId = getCurrentSessionId();
  if (!sessionId) return;

  // Always update heartbeat (30s throttle) — even when inbox check is skipped
  await updateHeartbeat(supabase, sessionId);

  if (!shouldCheck()) return;
  markChecked();

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

main().catch(() => { /* fail silently */ });
