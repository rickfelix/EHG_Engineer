/**
 * PostToolUse Hook: Ship Enforcement Safety Net
 *
 * Detects when HANDOFF_POST_ACTION=ship was emitted in Bash tool output
 * and injects a reminder if /ship has not been invoked.
 *
 * SD-AUTOPROCEED-SHIP-ENFORCEMENT-ORCH-001
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', '.claude', 'post-action-state.json');

module.exports = async ({ tool, tool_input, tool_output }) => {
  // Guard: only process Bash tool results
  if (tool !== 'Bash') return;

  const output = typeof tool_output === 'string' ? tool_output : '';

  // Detect HANDOFF_POST_ACTION=ship in handoff output
  if (output.includes('HANDOFF_POST_ACTION=ship')) {
    // Write state file so we can check on next tool call
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        detected_at: new Date().toISOString(),
        action: 'ship'
      }));
    } catch (e) {
      // Non-blocking
    }
    return;
  }

  // Check if a pending ship action exists from a previous tool call
  let pending = null;
  try {
    if (fs.existsSync(STATE_FILE)) {
      pending = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {
    return;
  }

  if (!pending || pending.action !== 'ship') return;

  // Check if this tool call is /ship invocation (Skill tool with ship)
  if (tool === 'Bash' && output.includes('/ship')) {
    // Ship was invoked, clear state
    try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
    return;
  }

  // Check age — only remind within 60 seconds of detection
  const ageMs = Date.now() - new Date(pending.detected_at).getTime();
  if (ageMs > 60000) {
    // Stale, clear it
    try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
    return;
  }

  // Clear state after reminding once
  try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }

  // Inject reminder
  return {
    message: '⚠️ HANDOFF_POST_ACTION=ship was emitted but /ship has not been invoked. AUTO-PROCEED requires running /ship to complete this SD. Invoke /ship now.'
  };
};
