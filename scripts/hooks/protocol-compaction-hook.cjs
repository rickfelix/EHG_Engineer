/**
 * Protocol Compaction Hook - SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001
 *
 * Detects context compaction events and records them to session state.
 * This hook should be triggered by the /context-compact skill or
 * when Claude Code's automatic compaction runs.
 *
 * When compaction is detected:
 * 1. Records compaction event with timestamp
 * 2. Clears protocol file read state (requires re-read)
 * 3. Emits structured log for auditing
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

/**
 * Read session state
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (error) {
    console.error(`[protocol-compaction-hook] Could not read session state: ${error.message}`);
  }
  return {};
}

/**
 * Write session state
 */
function writeSessionState(state) {
  try {
    const dir = path.dirname(SESSION_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = SESSION_STATE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempFile, SESSION_STATE_FILE);
  } catch (error) {
    console.error(`[protocol-compaction-hook] Could not write session state: ${error.message}`);
  }
}

/**
 * Record compaction event
 */
function recordCompaction() {
  const state = readSessionState();
  const timestamp = new Date().toISOString();

  // Initialize protocolGate if needed
  if (!state.protocolGate) {
    state.protocolGate = {
      sdRunId: null,
      sessionId: null,
      lastCompactionAt: null,
      fileReads: {},
      compactionCount: 0
    };
  }

  // Record compaction
  state.protocolGate.lastCompactionAt = timestamp;
  state.protocolGate.compactionCount = (state.protocolGate.compactionCount || 0) + 1;

  // Store old reads before clearing
  state.protocolGate.fileReadsBeforeCompaction = { ...state.protocolGate.fileReads };

  // Clear file reads - must be re-read after compaction
  state.protocolGate.fileReads = {};

  // Clear legacy arrays
  state.protocolFilesRead = [];
  state.protocolFilesReadAt = {};

  // Update trigger
  state.trigger = 'compaction';

  writeSessionState(state);

  console.log(`[protocol-compaction-hook] Compaction event #${state.protocolGate.compactionCount} recorded`);
  console.log(`[protocol-compaction-hook] Protocol files cleared - re-read required`);

  // Emit structured log
  const logEntry = {
    event: 'COMPACTION_DETECTED',
    timestamp,
    compactionCount: state.protocolGate.compactionCount,
    clearedFiles: Object.keys(state.protocolGate.fileReadsBeforeCompaction || {}),
    action: 'PROTOCOL_FILES_CLEARED'
  };
  console.log(`[GATE_LOG] ${JSON.stringify(logEntry)}`);

  return {
    success: true,
    compactionCount: state.protocolGate.compactionCount,
    timestamp
  };
}

/**
 * Check if compaction recently occurred
 */
function hasRecentCompaction(withinMs = 60000) {
  const state = readSessionState();
  const lastCompaction = state.protocolGate?.lastCompactionAt;

  if (!lastCompaction) {
    return false;
  }

  const compactionTime = new Date(lastCompaction).getTime();
  const now = Date.now();
  return (now - compactionTime) < withinMs;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'record';

  switch (command) {
    case 'record':
      const result = recordCompaction();
      process.exit(result.success ? 0 : 1);
      break;

    case 'check':
      const withinMs = parseInt(args[1]) || 60000;
      const recent = hasRecentCompaction(withinMs);
      console.log(`[protocol-compaction-hook] Recent compaction (${withinMs}ms): ${recent}`);
      process.exit(recent ? 0 : 1);
      break;

    case 'status':
      const state = readSessionState();
      console.log('[protocol-compaction-hook] Status:');
      console.log(`  Last compaction: ${state.protocolGate?.lastCompactionAt || 'never'}`);
      console.log(`  Compaction count: ${state.protocolGate?.compactionCount || 0}`);
      console.log(`  Files needing re-read: ${Object.keys(state.protocolGate?.fileReadsBeforeCompaction || {}).join(', ') || 'none'}`);
      break;

    default:
      console.log('Usage: node protocol-compaction-hook.cjs [record|check|status]');
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  recordCompaction,
  hasRecentCompaction
};
