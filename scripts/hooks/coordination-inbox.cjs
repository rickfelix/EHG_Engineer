/**
 * Coordination Inbox Hook — Surfaces cross-session messages
 *
 * Hook: PostToolUse (no matcher — fires on every tool call)
 * Throttled: Only checks DB every 60 seconds via temp file timestamp
 *
 * Reads from session_coordination table for this session.
 * When messages are found, outputs them and marks as read/acknowledged.
 *
 * Falls back to metadata.coordination_message if table doesn't exist yet.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const THROTTLE_FILE = path.join(os.tmpdir(), 'claude-coordination-inbox-last-check.json');
const CHECK_INTERVAL_MS = 60_000; // Only check DB every 60 seconds

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

async function main() {
  if (!shouldCheck()) return;
  markChecked();

  let supabase;
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch {
    return;
  }

  const sessionId = getCurrentSessionId();
  if (!sessionId) return;

  // Try session_coordination table first
  const { data: messages, error: tableErr } = await supabase
    .from('session_coordination')
    .select('id, message_type, subject, body, payload, sender_type, created_at')
    .eq('target_session', sessionId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(5);

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
        'INFO': 'INFO'
      }[msg.message_type] || msg.message_type;

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
      console.log('');

      // Mark as read and acknowledged
      await supabase
        .from('session_coordination')
        .update({
          read_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', msg.id);
    }
    return;
  }

  // Fallback: check metadata.coordination_message (legacy)
  if (tableErr && tableErr.code === '42P01') {
    // Table doesn't exist yet — use metadata fallback
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
    console.log('');

    const updatedMeta = { ...session.metadata };
    updatedMeta.coordination_message.acknowledged = true;
    updatedMeta.coordination_message.acknowledged_at = new Date().toISOString();
    await supabase
      .from('claude_sessions')
      .update({ metadata: updatedMeta })
      .eq('session_id', sessionId);
  }
}

main().catch(() => { /* fail silently */ });
