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
// Sync marker file for race condition prevention (PAT-ASYNC-RACE-001)
const SYNC_MARKER_FILE = path.join(PROJECT_DIR, '.claude', '.protocol-sync');

// Protocol files to track
// ⚠️ CRITICAL: Must stay in sync with core-protocol-gate.js requirements
// See: scripts/modules/handoff/gates/core-protocol-gate.js
// When adding new protocol files, update BOTH locations
// Fixed in SD-LEO-SELF-IMPROVE-002A: Added DIGEST versions for dual-mode support
const PROTOCOL_FILES = [
  // FULL versions (original)
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md',
  'CLAUDE_CORE.md',
  'CLAUDE.md',
  // DIGEST versions (added for dual-generation support)
  'CLAUDE_LEAD_DIGEST.md',
  'CLAUDE_PLAN_DIGEST.md',
  'CLAUDE_EXEC_DIGEST.md',
  'CLAUDE_CORE_DIGEST.md',
  'CLAUDE_DIGEST.md'
];

// Mapping between FULL and DIGEST equivalents
// When one is read, mark both as read for gate compatibility
const PROTOCOL_FILE_EQUIVALENTS = {
  'CLAUDE_LEAD.md': 'CLAUDE_LEAD_DIGEST.md',
  'CLAUDE_LEAD_DIGEST.md': 'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md': 'CLAUDE_PLAN_DIGEST.md',
  'CLAUDE_PLAN_DIGEST.md': 'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md': 'CLAUDE_EXEC_DIGEST.md',
  'CLAUDE_EXEC_DIGEST.md': 'CLAUDE_EXEC.md',
  'CLAUDE_CORE.md': 'CLAUDE_CORE_DIGEST.md',
  'CLAUDE_CORE_DIGEST.md': 'CLAUDE_CORE.md',
  'CLAUDE.md': 'CLAUDE_DIGEST.md',
  'CLAUDE_DIGEST.md': 'CLAUDE.md'
};

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
 * Write sync marker file to signal state update completion
 * Part of PAT-ASYNC-RACE-001 fix
 *
 * The marker file contains a timestamp that gates can use to verify
 * the state file was written after their validation started.
 */
function writeSyncMarker() {
  try {
    const dir = path.dirname(SYNC_MARKER_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const markerContent = JSON.stringify({
      timestamp: new Date().toISOString(),
      pid: process.pid,
      stateFile: SESSION_STATE_FILE
    });

    fs.writeFileSync(SYNC_MARKER_FILE, markerContent, 'utf8');
    return true;
  } catch (_error) {
    console.error('[protocol-file-tracker] Failed to write sync marker');
    return false;
  }
}

/**
 * Check if file path is a protocol file
 * Returns array of [readFile, equivalentFile] when a protocol file is read
 * This ensures both FULL and DIGEST versions are marked as read for gate compatibility
 * Part of SD-LEO-SELF-IMPROVE-002A fix for producer-consumer contract mismatch
 */
function isProtocolFile(filePath) {
  if (!filePath) return null;
  const basename = path.basename(filePath);

  // Check if this is a known protocol file
  const isKnown = PROTOCOL_FILES.includes(basename);
  if (!isKnown) return null;

  // Return array: [actualFileRead, equivalentFile] for dual tracking
  const equivalent = PROTOCOL_FILE_EQUIVALENTS[basename];
  return equivalent ? [basename, equivalent] : [basename];
}

/**
 * Normalize file path to repo-root-relative format
 * TR-1: Prevents mismatches between hook and gate
 * @param {string} filePath - Raw file path
 * @returns {string} Normalized path (just the filename for protocol files)
 */
function normalizeProtocolPath(filePath) {
  if (!filePath) return '';

  // Get basename for protocol files (they're at root)
  const basename = path.basename(filePath);

  // Return just the filename for CLAUDE_*.md files
  if (/^CLAUDE_.*\.md$/.test(basename) || basename === 'CLAUDE.md') {
    return basename;
  }

  return filePath.replace(/\\/g, '/');
}

/**
 * Process hook input and track protocol file reads
 * SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001: Enhanced to detect partial reads
 *
 * Session state schema per FR-2:
 * protocolFileReadStatus: {
 *   [normalizedPath]: {
 *     readCount: number,
 *     lastReadAt: ISO-8601,
 *     lastReadWasPartial: boolean,
 *     lastPartialRead: { limit: number|null, offset: number|null, readAt: ISO-8601 } | null
 *   }
 * }
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

  // Check if this is a protocol file (returns array of [file, equivalent] or null)
  const protocolFiles = isProtocolFile(filePath);

  if (!protocolFiles) {
    return;
  }

  // Get the actual file read and its equivalent (for dual-mode tracking)
  const [actualFile, equivalentFile] = protocolFiles;

  // Normalize path for consistent tracking (TR-1)
  const normalizedPath = normalizeProtocolPath(actualFile);
  const normalizedEquivalent = equivalentFile ? normalizeProtocolPath(equivalentFile) : null;

  // SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001: Detect partial read parameters
  // TR-3: Only flag when limit/offset explicitly used (including 0)
  const hasLimit = toolInputData.limit !== undefined && toolInputData.limit !== null;
  const hasOffset = toolInputData.offset !== undefined && toolInputData.offset !== null;
  const isPartialRead = hasLimit || hasOffset;

  const now = new Date().toISOString();

  // Mark protocol file as read in session state
  const state = readSessionState();

  // Legacy array for backward compatibility (TR-2)
  if (!state.protocolFilesRead) {
    state.protocolFilesRead = [];
  }

  // Initialize new schema-compliant tracking (FR-2)
  if (!state.protocolFileReadStatus) {
    state.protocolFileReadStatus = {};
  }

  // Get or create file status entry
  const fileStatus = state.protocolFileReadStatus[normalizedPath] || {
    readCount: 0,
    lastReadAt: null,
    lastReadWasPartial: false,
    lastPartialRead: null
  };

  // Update read count and timestamp
  fileStatus.readCount = (fileStatus.readCount || 0) + 1;
  fileStatus.lastReadAt = now;

  // Track partial reads with details (FR-1)
  if (isPartialRead) {
    fileStatus.lastReadWasPartial = true;
    fileStatus.lastPartialRead = {
      limit: hasLimit ? toolInputData.limit : null,
      offset: hasOffset ? toolInputData.offset : null,
      readAt: now
    };
    console.log(`[protocol-file-tracker] ⚠️ Partial read detected for ${normalizedPath} (limit: ${toolInputData.limit}, offset: ${toolInputData.offset})`);
  } else {
    // Full read clears partial read flag but preserves historical metadata
    fileStatus.lastReadWasPartial = false;
    // Note: lastPartialRead preserved for audit (FR-2)
    console.log(`[protocol-file-tracker] ✅ Full read of ${normalizedPath}${fileStatus.lastPartialRead ? ' (clears partial read flag)' : ''}`);
  }

  // Save updated status
  state.protocolFileReadStatus[normalizedPath] = fileStatus;

  // Also track equivalent file status (SD-LEO-SELF-IMPROVE-002A: dual-mode support)
  if (normalizedEquivalent) {
    state.protocolFileReadStatus[normalizedEquivalent] = { ...fileStatus };
  }

  // Maintain legacy array for backward compatibility (TR-2)
  // Track BOTH the actual file read AND its equivalent for gate compatibility
  if (!state.protocolFilesRead.includes(normalizedPath)) {
    state.protocolFilesRead.push(normalizedPath);
  }
  // Also track equivalent file (SD-LEO-SELF-IMPROVE-002A: dual-mode support)
  if (normalizedEquivalent && !state.protocolFilesRead.includes(normalizedEquivalent)) {
    state.protocolFilesRead.push(normalizedEquivalent);
  }
  state.protocolFilesReadAt = state.protocolFilesReadAt || {};
  state.protocolFilesReadAt[normalizedPath] = now;
  if (normalizedEquivalent) {
    state.protocolFilesReadAt[normalizedEquivalent] = now;
  }

  // Legacy partial read tracking for backward compatibility
  if (!state.protocolFilesPartiallyRead) {
    state.protocolFilesPartiallyRead = {};
  }
  if (isPartialRead) {
    state.protocolFilesPartiallyRead[normalizedPath] = {
      limit: toolInputData.limit,
      offset: toolInputData.offset,
      timestamp: now,
      wasPartial: true
    };
  } else if (state.protocolFilesPartiallyRead[normalizedPath]) {
    delete state.protocolFilesPartiallyRead[normalizedPath];
  }

  if (writeSessionState(state)) {
    // Write sync marker AFTER state file is written (PAT-ASYNC-RACE-001)
    // This signals to the gate that state is ready to be read
    writeSyncMarker();
    const equivalentMsg = normalizedEquivalent ? ` + ${normalizedEquivalent}` : '';
    console.log(`[protocol-file-tracker] Updated ${normalizedPath}${equivalentMsg} (read #${fileStatus.readCount})`);
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
