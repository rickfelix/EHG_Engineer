#!/usr/bin/env node
/**
 * Protocol File Tracker Hook
 * Part of SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001
 *
 * PostToolUse hook that tracks when CLAUDE_*.md protocol files are read.
 * Updates session state so the ProtocolFileReadGate can validate.
 *
 * Hook Type: PostToolUse (matcher: Read)
 *
 * Created: 2026-01-24
 * Fixed: 2026-01-25 - Corrected to read from stdin instead of env vars
 */

const fs = require('fs');
const path = require('path');

// Session state file path
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

// Protocol files to track
const PROTOCOL_FILES = [
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md',
  'CLAUDE_CORE.md',
  'CLAUDE.md'
];

/**
 * Read current session state
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      // Handle BOM if present
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (_error) {
    // Ignore parse errors
  }
  return {};
}

/**
 * Write session state atomically
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
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Check if file path is a protocol file
 */
function isProtocolFile(filePath) {
  if (!filePath) return null;
  const basename = path.basename(filePath);
  return PROTOCOL_FILES.find(pf => basename === pf) || null;
}

/**
 * Process hook input and track protocol file reads
 */
function processHookInput(hookInput) {
  const toolName = hookInput.tool_name || '';
  const toolInputData = hookInput.tool_input || {};

  // Only track Read tool calls
  if (toolName !== 'Read') {
    return;
  }

  // Get file path from tool input
  const filePath = toolInputData.file_path || '';

  // Check if this is a protocol file
  const protocolFile = isProtocolFile(filePath);

  if (!protocolFile) {
    return;
  }

  // Mark protocol file as read in session state
  const state = readSessionState();

  if (!state.protocolFilesRead) {
    state.protocolFilesRead = [];
  }

  if (!state.protocolFilesRead.includes(protocolFile)) {
    state.protocolFilesRead.push(protocolFile);
    state.protocolFilesReadAt = state.protocolFilesReadAt || {};
    state.protocolFilesReadAt[protocolFile] = new Date().toISOString();

    if (writeSessionState(state)) {
      console.log(`[protocol-file-tracker] Marked ${protocolFile} as read`);
    }
  }
}

/**
 * Main hook execution - reads from stdin
 */
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    try {
      if (input.trim()) {
        const hookInput = JSON.parse(input);
        processHookInput(hookInput);
      }
    } catch (e) {
      // Silently fail - don't break the user's workflow
      console.error(`[protocol-file-tracker] Error: ${e.message}`);
    }
    process.exit(0);
  });

  // Handle case where stdin is closed immediately (no data)
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Timeout after 2 seconds if stdin doesn't close
  setTimeout(() => {
    if (input.trim()) {
      try {
        const hookInput = JSON.parse(input);
        processHookInput(hookInput);
      } catch (_e) {
        // Silently fail
      }
    }
    process.exit(0);
  }, 2000);
}

main();
