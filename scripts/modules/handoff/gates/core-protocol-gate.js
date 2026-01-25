/**
 * Core Protocol Gate - SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001
 *
 * Enhanced protocol file enforcement for long-running AUTO-PROCEED sessions.
 *
 * This module extends the existing protocol-file-read-gate.js with:
 * 1. SD Start Gate - Enforces CLAUDE_CORE.md read at SD boundaries
 * 2. Post-Compaction Gate - Re-reads protocol files after context compaction
 * 3. File hashing for idempotent enforcement
 * 4. Queryable gate state for auditing
 *
 * Trigger Points:
 *   - SD_START: Before any SD work begins
 *   - POST_COMPACTION: After context compaction event
 *   - HANDOFF: At phase transitions (existing behavior)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Configuration
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

/**
 * Required protocol files by trigger type
 */
const CORE_PROTOCOL_REQUIREMENTS = {
  SD_START: ['CLAUDE_CORE.md'],
  POST_COMPACTION: ['CLAUDE_CORE.md'],  // Phase file added dynamically based on current phase
  SESSION_START: ['CLAUDE_CORE.md']
};

/**
 * Phase-specific files to re-read after compaction
 */
const PHASE_PROTOCOL_FILES = {
  LEAD: 'CLAUDE_LEAD.md',
  PLAN: 'CLAUDE_PLAN.md',
  EXEC: 'CLAUDE_EXEC.md'
};

/**
 * Calculate SHA-256 hash of a file
 * @param {string} filePath - Path to file
 * @returns {string|null} Hash or null if file doesn't exist
 */
function calculateFileHash(filePath) {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  } catch (error) {
    console.log(`   ⚠️  Could not hash file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Read session state with protocol gate tracking
 * @returns {Object} Session state with protocolGate section
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, '');
      const state = JSON.parse(cleanContent);

      // Ensure protocolGate section exists
      if (!state.protocolGate) {
        state.protocolGate = {
          sdRunId: null,
          sessionId: null,
          lastCompactionAt: null,
          fileReads: {},
          compactionCount: 0
        };
      }

      return state;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read session state: ${error.message}`);
  }

  return {
    protocolGate: {
      sdRunId: null,
      sessionId: null,
      lastCompactionAt: null,
      fileReads: {},
      compactionCount: 0
    },
    protocolFilesRead: []
  };
}

/**
 * Write session state atomically
 * @param {Object} state - Session state to write
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
    console.log(`   ⚠️  Could not write session state: ${error.message}`);
  }
}

/**
 * Generate a unique SD run ID
 * @param {string} sdId - Strategic Directive ID
 * @returns {string} Unique run ID
 */
function generateSdRunId(sdId) {
  return `${sdId}-run-${Date.now()}`;
}

/**
 * Record a protocol file read event
 * @param {string} filename - The protocol file that was read
 * @param {string} trigger - The trigger type (SD_START, POST_COMPACTION, HANDOFF)
 * @param {string} sdRunId - The current SD run ID
 * @param {string} sessionId - The current session ID
 */
export function recordProtocolFileRead(filename, trigger, sdRunId, sessionId) {
  const state = readSessionState();
  const fileHash = calculateFileHash(filename);
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

  // Update current run context
  if (sdRunId) state.protocolGate.sdRunId = sdRunId;
  if (sessionId) state.protocolGate.sessionId = sessionId;

  // Record the file read
  state.protocolGate.fileReads[filename] = {
    trigger,
    timestamp,
    fileHash,
    sdRunId: sdRunId || state.protocolGate.sdRunId,
    sessionId: sessionId || state.protocolGate.sessionId
  };

  // Also update legacy protocolFilesRead for backward compatibility
  if (!state.protocolFilesRead) {
    state.protocolFilesRead = [];
  }
  if (!state.protocolFilesRead.includes(filename)) {
    state.protocolFilesRead.push(filename);
  }
  if (!state.protocolFilesReadAt) {
    state.protocolFilesReadAt = {};
  }
  state.protocolFilesReadAt[filename] = timestamp;

  writeSessionState(state);

  console.log(`   ✅ Protocol file recorded: ${filename}`);
  console.log(`      Trigger: ${trigger}, Hash: ${fileHash?.substring(0, 8)}...`);

  // Emit structured log
  emitStructuredLog({
    event: 'CORE_PROTOCOL_FILE_READ',
    status: 'RECORDED',
    filename,
    trigger,
    fileHash,
    sdRunId: state.protocolGate.sdRunId,
    sessionId: state.protocolGate.sessionId,
    timestamp
  });
}

/**
 * Record a compaction event
 * @param {string} sessionId - Session ID
 */
export function recordCompactionEvent(sessionId) {
  const state = readSessionState();

  if (!state.protocolGate) {
    state.protocolGate = {
      sdRunId: null,
      sessionId: null,
      lastCompactionAt: null,
      fileReads: {},
      compactionCount: 0
    };
  }

  state.protocolGate.lastCompactionAt = new Date().toISOString();
  state.protocolGate.compactionCount = (state.protocolGate.compactionCount || 0) + 1;
  if (sessionId) state.protocolGate.sessionId = sessionId;

  // Clear file reads after compaction - they need to be re-read
  state.protocolGate.fileReadsBeforeCompaction = { ...state.protocolGate.fileReads };
  state.protocolGate.fileReads = {};

  // Clear legacy arrays too
  state.protocolFilesRead = [];
  state.protocolFilesReadAt = {};

  writeSessionState(state);

  console.log(`   📦 Compaction event recorded (#${state.protocolGate.compactionCount})`);
  console.log(`   ⚠️  Protocol file reads cleared - re-read required`);

  emitStructuredLog({
    event: 'COMPACTION_EVENT',
    status: 'RECORDED',
    compactionCount: state.protocolGate.compactionCount,
    clearedFiles: Object.keys(state.protocolGate.fileReadsBeforeCompaction || {}),
    timestamp: state.protocolGate.lastCompactionAt
  });
}

/**
 * Check if a file needs to be read for a given trigger
 * @param {string} filename - File to check
 * @param {string} trigger - Trigger type
 * @param {string} sdRunId - Current SD run ID (for SD_START checks)
 * @returns {Object} { needsRead, reason, lastRead }
 */
export function checkFileNeedsRead(filename, trigger, sdRunId = null) {
  const state = readSessionState();
  const currentHash = calculateFileHash(filename);

  // Check both the new protocolGate.fileReads structure AND the legacy protocolFilesRead array
  // The PostToolUse hook writes to protocolFilesRead, while recordProtocolFileRead() writes to both
  const fileRead = state.protocolGate?.fileReads?.[filename];
  const legacyFileRead = state.protocolFilesRead?.includes(filename);
  const legacyTimestamp = state.protocolFilesReadAt?.[filename];

  // File doesn't exist
  if (!currentHash) {
    return {
      needsRead: true,
      reason: 'FILE_NOT_FOUND',
      lastRead: null
    };
  }

  // Check if file was read via either mechanism
  const wasRead = fileRead || legacyFileRead;

  // Never read in this session (not in either tracking mechanism)
  if (!wasRead) {
    return {
      needsRead: true,
      reason: 'NEVER_READ',
      lastRead: null
    };
  }

  // If only in legacy array (from PostToolUse hook), construct a compatible lastRead object
  const effectiveFileRead = fileRead || (legacyFileRead ? {
    timestamp: legacyTimestamp || new Date().toISOString(),
    trigger: 'READ_TOOL',
    fileHash: null  // Legacy tracking doesn't capture hash
  } : null);

  // For SD_START, check if file was read in the current session
  // Note: We no longer require re-reading for each handoff run - session-based is sufficient
  // The file was already read in this session, and hash hasn't changed, so it's valid
  // Only re-require reading if:
  // 1. File was never read (caught above)
  // 2. File content changed (caught below)
  // 3. Compaction occurred (caught below)

  // Check if file has changed since last read (idempotent check)
  // Only enforce hash check if we have a recorded hash (legacy tracking doesn't capture hash)
  if (effectiveFileRead.fileHash && effectiveFileRead.fileHash !== currentHash) {
    return {
      needsRead: true,
      reason: 'FILE_CHANGED',
      lastRead: effectiveFileRead
    };
  }

  // Post-compaction check
  if (trigger === 'POST_COMPACTION') {
    const lastCompaction = state.protocolGate?.lastCompactionAt;
    if (lastCompaction && effectiveFileRead.timestamp < lastCompaction) {
      return {
        needsRead: true,
        reason: 'POST_COMPACTION_REQUIRED',
        lastRead: effectiveFileRead
      };
    }
  }

  // File already read with same hash (or via legacy tracking)
  return {
    needsRead: false,
    reason: 'ALREADY_READ',
    lastRead: effectiveFileRead
  };
}

/**
 * Validate SD Start Gate - enforces CLAUDE_CORE.md before SD work
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} ctx - Validation context
 * @returns {Object} Validation result
 */
export async function validateSdStartGate(sdId, ctx = {}) {
  console.log('\n📚 GATE: SD Start Protocol Enforcement');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdId}`);

  const requiredFiles = CORE_PROTOCOL_REQUIREMENTS.SD_START;
  const sdRunId = generateSdRunId(sdId);
  const issues = [];
  const warnings = [];

  for (const filename of requiredFiles) {
    const check = checkFileNeedsRead(filename, 'SD_START', sdRunId);

    if (check.needsRead) {
      console.log(`   ❌ ${filename} needs to be read (${check.reason})`);
      issues.push(`Protocol file not read for this SD: ${filename} (${check.reason})`);
    } else {
      console.log(`   ✅ ${filename} already read (hash: ${check.lastRead?.fileHash?.substring(0, 8)}...)`);
    }
  }

  if (issues.length > 0) {
    console.log('');
    console.log('   📚 REMEDIATION:');
    console.log('   The LEO Protocol requires reading CLAUDE_CORE.md before starting SD work.');
    console.log('');
    console.log('   ACTION REQUIRED:');
    requiredFiles.forEach(f => console.log(`   1. Read the file: ${f}`));
    console.log('   2. Re-run the SD start operation');

    emitStructuredLog({
      event: 'SD_START_GATE',
      status: 'BLOCK',
      sdId,
      sdRunId,
      requiredFiles,
      issues,
      timestamp: new Date().toISOString()
    });

    return {
      pass: false,
      score: 0,
      max_score: 100,
      issues,
      warnings,
      sdRunId
    };
  }

  // Update session state with new SD run
  const state = readSessionState();
  state.protocolGate.sdRunId = sdRunId;
  writeSessionState(state);

  emitStructuredLog({
    event: 'SD_START_GATE',
    status: 'PASS',
    sdId,
    sdRunId,
    requiredFiles,
    timestamp: new Date().toISOString()
  });

  return {
    pass: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings,
    sdRunId
  };
}

/**
 * Validate Post-Compaction Gate - enforces re-read after compaction
 * @param {string} currentPhase - Current SD phase (LEAD, PLAN, EXEC)
 * @param {Object} ctx - Validation context
 * @returns {Object} Validation result
 */
export async function validatePostCompactionGate(currentPhase, ctx = {}) {
  console.log('\n📚 GATE: Post-Compaction Protocol Enforcement');
  console.log('-'.repeat(50));
  console.log(`   Current Phase: ${currentPhase || 'unknown'}`);

  const state = readSessionState();
  const lastCompaction = state.protocolGate?.lastCompactionAt;

  if (!lastCompaction) {
    console.log('   ℹ️  No compaction events recorded - gate not applicable');
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: ['No compaction events in session - post-compaction gate not enforced']
    };
  }

  console.log(`   Last compaction: ${lastCompaction}`);
  console.log(`   Compaction count: ${state.protocolGate?.compactionCount || 0}`);

  // Determine required files
  const requiredFiles = [...CORE_PROTOCOL_REQUIREMENTS.POST_COMPACTION];
  if (currentPhase && PHASE_PROTOCOL_FILES[currentPhase]) {
    requiredFiles.push(PHASE_PROTOCOL_FILES[currentPhase]);
  }

  const issues = [];
  const warnings = [];

  for (const filename of requiredFiles) {
    const check = checkFileNeedsRead(filename, 'POST_COMPACTION');

    if (check.needsRead) {
      console.log(`   ❌ ${filename} needs re-read after compaction (${check.reason})`);
      issues.push(`Protocol file needs re-read after compaction: ${filename}`);
    } else {
      console.log(`   ✅ ${filename} read after compaction`);
    }
  }

  if (issues.length > 0) {
    console.log('');
    console.log('   📚 REMEDIATION:');
    console.log('   Context compaction occurred - protocol files need re-reading.');
    console.log('');
    console.log('   ACTION REQUIRED:');
    requiredFiles.forEach((f, i) => console.log(`   ${i + 1}. Read the file: ${f}`));

    emitStructuredLog({
      event: 'POST_COMPACTION_GATE',
      status: 'BLOCK',
      currentPhase,
      lastCompaction,
      requiredFiles,
      issues,
      timestamp: new Date().toISOString()
    });

    return {
      pass: false,
      score: 0,
      max_score: 100,
      issues,
      warnings
    };
  }

  emitStructuredLog({
    event: 'POST_COMPACTION_GATE',
    status: 'PASS',
    currentPhase,
    lastCompaction,
    requiredFiles,
    timestamp: new Date().toISOString()
  });

  return {
    pass: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings
  };
}

/**
 * Get current protocol gate state for auditing
 * @returns {Object} Current gate state
 */
export function getProtocolGateState() {
  const state = readSessionState();
  return {
    sdRunId: state.protocolGate?.sdRunId,
    sessionId: state.protocolGate?.sessionId,
    lastCompactionAt: state.protocolGate?.lastCompactionAt,
    compactionCount: state.protocolGate?.compactionCount || 0,
    fileReads: state.protocolGate?.fileReads || {},
    legacyFilesRead: state.protocolFilesRead || []
  };
}

/**
 * Create SD Start Gate for handoff integration
 * @param {string} sdId - SD ID
 * @returns {Object} Gate configuration
 */
export function createSdStartGate(sdId) {
  return {
    name: 'GATE_SD_START_PROTOCOL',
    validator: async (ctx) => {
      return validateSdStartGate(sdId, ctx);
    },
    required: true,
    blocking: true,
    remediation: `Read CLAUDE_CORE.md before starting work on ${sdId}. Use: Read tool with file_path="CLAUDE_CORE.md"`
  };
}

/**
 * Create Post-Compaction Gate for handoff integration
 * @param {string} currentPhase - Current phase
 * @returns {Object} Gate configuration
 */
export function createPostCompactionGate(currentPhase) {
  return {
    name: 'GATE_POST_COMPACTION_PROTOCOL',
    validator: async (ctx) => {
      return validatePostCompactionGate(currentPhase, ctx);
    },
    required: true,
    blocking: true,
    remediation: `Re-read CLAUDE_CORE.md and phase file after context compaction. Use: Read tool with file_path="CLAUDE_CORE.md"`
  };
}

/**
 * Validate Session Start Gate - enforces CLAUDE_CORE.md at session initialization
 * This gate runs BEFORE any SD work, at the earliest point of LEO session initialization.
 *
 * @param {string} sessionId - Session identifier
 * @param {Object} ctx - Validation context
 * @returns {Object} Validation result
 */
export async function validateSessionStartGate(sessionId, ctx = {}) {
  console.log('\n📚 GATE: Session Start Protocol Enforcement');
  console.log('-'.repeat(50));
  console.log(`   Session: ${sessionId || 'unknown'}`);

  const requiredFiles = CORE_PROTOCOL_REQUIREMENTS.SESSION_START;
  const issues = [];
  const warnings = [];

  for (const filename of requiredFiles) {
    const check = checkFileNeedsRead(filename, 'SESSION_START');

    if (check.needsRead) {
      console.log(`   ❌ ${filename} needs to be read (${check.reason})`);
      issues.push(`Protocol file not read for session: ${filename} (${check.reason})`);
    } else {
      console.log(`   ✅ ${filename} already read`);
      if (check.lastRead?.fileHash) {
        console.log(`      Hash: ${check.lastRead.fileHash.substring(0, 8)}...`);
      }
    }
  }

  if (issues.length > 0) {
    console.log('');
    console.log('   📚 REMEDIATION:');
    console.log('   The LEO Protocol requires reading CLAUDE_CORE.md at session start.');
    console.log('');
    console.log('   ACTION REQUIRED:');
    requiredFiles.forEach(f => console.log(`   1. Read the file: ${f}`));
    console.log('   2. Re-run the session initialization');

    emitStructuredLog({
      event: 'SESSION_START_GATE',
      status: 'BLOCK',
      sessionId,
      requiredFiles,
      issues,
      timestamp: new Date().toISOString()
    });

    return {
      pass: false,
      score: 0,
      max_score: 100,
      issues,
      warnings,
      errorCode: 'PROTOCOL_GATE_BLOCKED',
      gateName: 'SESSION_START',
      requiredArtifacts: requiredFiles,
      remediation: 'Read CLAUDE_CORE.md using the Read tool before proceeding with LEO session initialization.'
    };
  }

  // Update session state
  const state = readSessionState();
  if (!state.protocolGate) {
    state.protocolGate = {
      sdRunId: null,
      sessionId: null,
      lastCompactionAt: null,
      fileReads: {},
      compactionCount: 0
    };
  }
  state.protocolGate.sessionId = sessionId;
  state.protocolGate.sessionStartValidatedAt = new Date().toISOString();
  writeSessionState(state);

  emitStructuredLog({
    event: 'SESSION_START_GATE',
    status: 'PASS',
    sessionId,
    requiredFiles,
    timestamp: new Date().toISOString()
  });

  console.log('   ✅ Session Start Gate PASSED');

  return {
    pass: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings
  };
}

/**
 * Create Session Start Gate for LEO session initialization
 * @param {string} sessionId - Session identifier
 * @returns {Object} Gate configuration
 */
export function createSessionStartGate(sessionId) {
  return {
    name: 'GATE_SESSION_START_PROTOCOL',
    validator: async (ctx) => {
      return validateSessionStartGate(sessionId, ctx);
    },
    required: true,
    blocking: true,
    remediation: `Read CLAUDE_CORE.md at session start. Use: Read tool with file_path="CLAUDE_CORE.md"`
  };
}

/**
 * Emit structured log for gate events
 * @param {Object} logEntry - Log entry
 */
function emitStructuredLog(logEntry) {
  console.log(`   [GATE_LOG] ${JSON.stringify(logEntry)}`);
}

export default {
  recordProtocolFileRead,
  recordCompactionEvent,
  checkFileNeedsRead,
  validateSdStartGate,
  validatePostCompactionGate,
  validateSessionStartGate,
  getProtocolGateState,
  createSdStartGate,
  createPostCompactionGate,
  createSessionStartGate,
  CORE_PROTOCOL_REQUIREMENTS,
  PHASE_PROTOCOL_FILES
};
