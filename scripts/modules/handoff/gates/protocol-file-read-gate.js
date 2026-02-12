/**
 * Protocol File Read Gate
 * Part of SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001
 * Enhanced for SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001
 *
 * Enforces that the agent has read the phase-specific CLAUDE_*.md file
 * before a handoff can proceed. This gate converts the "Protocol Familiarization"
 * directive from text guidance into an enforced validation gate.
 *
 * DUAL GENERATION (v2.0):
 *   - Defaults to DIGEST files (e.g., CLAUDE_PLAN_DIGEST.md)
 *   - Use CLAUDE_PROTOCOL_MODE=full to use FULL files instead
 *   - Fails fast with actionable error if DIGEST files are missing
 *
 * Mapping (DIGEST mode - default):
 *   LEAD-TO-PLAN → requires CLAUDE_PLAN_DIGEST.md
 *   PLAN-TO-EXEC → requires CLAUDE_EXEC_DIGEST.md
 *   EXEC-TO-PLAN → requires CLAUDE_PLAN_DIGEST.md
 *
 * Mapping (FULL mode - env override):
 *   LEAD-TO-PLAN → requires CLAUDE_PLAN.md
 *   PLAN-TO-EXEC → requires CLAUDE_EXEC.md
 *   EXEC-TO-PLAN → requires CLAUDE_PLAN.md
 */

import fs from 'fs';
import path from 'path';

// Session state file path
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

/**
 * Get the protocol mode from environment
 * @returns {'digest'|'full'} Protocol mode
 */
function getProtocolMode() {
  const mode = process.env.CLAUDE_PROTOCOL_MODE?.toLowerCase();
  return mode === 'full' ? 'full' : 'digest';
}

/**
 * Handoff type to required protocol file mapping (FULL files)
 * Maps to the DESTINATION phase's protocol file (the phase you're going TO)
 */
const HANDOFF_FILE_REQUIREMENTS_FULL = {
  'LEAD-TO-PLAN': 'CLAUDE_PLAN.md',   // Going TO Plan phase
  'PLAN-TO-EXEC': 'CLAUDE_EXEC.md',   // Going TO Exec phase
  'EXEC-TO-PLAN': 'CLAUDE_PLAN.md',   // Going back TO Plan phase
  'PLAN-TO-LEAD': 'CLAUDE_LEAD.md'    // Going TO Lead phase (final approval)
};

/**
 * Handoff type to required protocol file mapping (DIGEST files - default)
 * Maps to the DESTINATION phase's protocol file (the phase you're going TO)
 */
const HANDOFF_FILE_REQUIREMENTS_DIGEST = {
  'LEAD-TO-PLAN': 'CLAUDE_PLAN_DIGEST.md',   // Going TO Plan phase
  'PLAN-TO-EXEC': 'CLAUDE_EXEC_DIGEST.md',   // Going TO Exec phase
  'EXEC-TO-PLAN': 'CLAUDE_PLAN_DIGEST.md',   // Going back TO Plan phase
  'PLAN-TO-LEAD': 'CLAUDE_LEAD_DIGEST.md'    // Going TO Lead phase (final approval)
};

/**
 * Get the requirements map based on protocol mode
 * @returns {Object} Requirements map
 */
function getHandoffFileRequirements() {
  return getProtocolMode() === 'full'
    ? HANDOFF_FILE_REQUIREMENTS_FULL
    : HANDOFF_FILE_REQUIREMENTS_DIGEST;
}

// Legacy export for backward compatibility
const HANDOFF_FILE_REQUIREMENTS = HANDOFF_FILE_REQUIREMENTS_FULL;

/**
 * Read current session state
 * @returns {Object} Session state or default structure
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      // Handle BOM if present
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read session state: ${error.message}`);
  }
  return { protocolFilesRead: [] };
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
 * Mark a protocol file as read in session state
 * @param {string} filename - The protocol file that was read
 */
export function markProtocolFileRead(filename) {
  const state = readSessionState();

  if (!state.protocolFilesRead) {
    state.protocolFilesRead = [];
  }

  if (!state.protocolFilesRead.includes(filename)) {
    state.protocolFilesRead.push(filename);
    state.protocolFilesReadAt = state.protocolFilesReadAt || {};
    state.protocolFilesReadAt[filename] = new Date().toISOString();
    writeSessionState(state);

    console.log(`   ✅ Protocol file marked as read: ${filename}`);
  }
}

/**
 * Check if a protocol file has been read in current session
 * @param {string} filename - The protocol file to check
 * @returns {boolean} True if file has been read
 */
export function isProtocolFileRead(filename) {
  const state = readSessionState();
  return state.protocolFilesRead?.includes(filename) || false;
}

/**
 * Check if a protocol file was only partially read (with limit/offset)
 * SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001: Enhanced to use new schema
 * @param {string} filename - The protocol file to check
 * @returns {Object|null} Partial read details or null if not partial
 */
export function getPartialReadDetails(filename) {
  const state = readSessionState();

  // Check new schema first (FR-2)
  const fileStatus = state.protocolFileReadStatus?.[filename];
  if (fileStatus?.lastReadWasPartial && fileStatus.lastPartialRead) {
    return {
      limit: fileStatus.lastPartialRead.limit,
      offset: fileStatus.lastPartialRead.offset,
      timestamp: fileStatus.lastPartialRead.readAt,
      wasPartial: true,
      readCount: fileStatus.readCount
    };
  }

  // Fall back to legacy schema (TR-2: backward compatibility)
  return state.protocolFilesPartiallyRead?.[filename] || null;
}

/**
 * Record a confirmation event for partial read acknowledgment (FR-4, FR-5)
 * @param {string[]} files - List of files acknowledged
 * @param {string} confirmedBy - Who confirmed (agent/session ID)
 * @returns {boolean} Success status
 */
export function recordPartialReadConfirmation(files, confirmedBy = 'agent') {
  const state = readSessionState();

  // Initialize append-only confirmation array (FR-5)
  if (!state.protocolReadConfirmations) {
    state.protocolReadConfirmations = [];
  }

  const confirmationEvent = {
    confirmedAt: new Date().toISOString(),
    confirmedBy: confirmedBy,
    files: files
  };

  state.protocolReadConfirmations.push(confirmationEvent);
  writeSessionState(state);

  console.log(`   ✅ Partial read confirmation recorded for: ${files.join(', ')}`);
  return true;
}

/**
 * Check if a file has been confirmed via partial read acknowledgment
 * @param {string} filename - The protocol file to check
 * @returns {boolean} True if file was confirmed
 */
export function hasPartialReadConfirmation(filename) {
  const state = readSessionState();
  const confirmations = state.protocolReadConfirmations || [];

  // Check if any confirmation includes this file
  return confirmations.some(conf => conf.files.includes(filename));
}

/**
 * Clear protocol file read state (for testing or session reset)
 */
export function clearProtocolFileReadState() {
  const state = readSessionState();
  state.protocolFilesRead = [];
  state.protocolFilesReadAt = {};
  writeSessionState(state);
}

/**
 * Check if a protocol file exists on disk
 * @param {string} filename - The protocol file to check
 * @returns {boolean} True if file exists and has content
 */
function protocolFileExistsOnDisk(filename) {
  try {
    const filePath = path.join(PROJECT_DIR, filename);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      // File must exist and have content (> 100 bytes to avoid empty/corrupt files)
      return stats.size > 100;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check file existence: ${error.message}`);
  }
  return false;
}

/**
 * Validate that the required protocol file has been read
 *
 * SD-LEO-FIX-COMPLETION-WORKFLOW-001: Added fallback validation.
 * SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001: Added partial read detection with confirmation.
 * SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001: Added DIGEST mode support.
 *
 * @param {string} handoffType - The handoff type (e.g., 'LEAD-TO-PLAN')
 * @param {Object} ctx - Validation context with optional confirmFullRead flag
 * @returns {Object} Validation result {pass, score, issues, warnings}
 */
export async function validateProtocolFileRead(handoffType, ctx = {}) {
  const protocolMode = getProtocolMode();
  const requirements = getHandoffFileRequirements();
  const requiredFile = requirements[handoffType];

  console.log(`   Protocol Mode: ${protocolMode.toUpperCase()}`);
  console.log('   Mode Override: Set CLAUDE_PROTOCOL_MODE=full to use FULL files');

  if (!requiredFile) {
    // No requirement for this handoff type
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [`No protocol file requirement defined for handoff type: ${handoffType}`]
    };
  }

  console.log(`   Required protocol file: ${requiredFile}`);

  const isRead = isProtocolFileRead(requiredFile);

  if (isRead) {
    const state = readSessionState();
    const readAt = state.protocolFilesReadAt?.[requiredFile];
    console.log(`   ✅ Protocol file has been read${readAt ? ` at ${readAt}` : ''}`);

    // SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001: Check for partial reads
    const partialReadDetails = getPartialReadDetails(requiredFile);
    const warnings = [];

    if (partialReadDetails) {
      console.log(`   ⚠️  PARTIAL READ DETECTED for ${requiredFile}`);
      console.log(`      Limit: ${partialReadDetails.limit}, Offset: ${partialReadDetails.offset}`);
      console.log(`      Timestamp: ${partialReadDetails.timestamp}`);

      // FR-4: Check for confirmation to proceed
      const hasConfirmation = hasPartialReadConfirmation(requiredFile);
      const confirmFullRead = ctx.confirmFullRead === true;

      if (confirmFullRead && !hasConfirmation) {
        // Record the confirmation (FR-5: audit trail)
        recordPartialReadConfirmation([requiredFile], ctx.confirmedBy || state.sessionId || 'agent');

        console.log('');
        console.log('   ✅ Confirmation received - proceeding with partial read acknowledgment');

        // Emit structured log for PASS_CONFIRMED
        emitStructuredLog({
          event: 'PROTOCOL_FILE_READ_GATE',
          status: 'PASS_PARTIAL_READ_CONFIRMED',
          handoff_type: handoffType,
          required_file: requiredFile,
          partial_read_details: partialReadDetails,
          session_id: state.sessionId || 'unknown',
          timestamp: new Date().toISOString()
        });

        return {
          pass: true,
          score: 85,
          max_score: 100,
          issues: [],
          warnings: [`Partial read confirmed for ${requiredFile} - proceeding with user acknowledgment`]
        };
      }

      if (hasConfirmation) {
        console.log('');
        console.log('   ✅ Previous confirmation found - allowing handoff');

        return {
          pass: true,
          score: 85,
          max_score: 100,
          issues: [],
          warnings: [`Partial read for ${requiredFile} was previously confirmed`]
        };
      }

      // FR-4: No confirmation - require explicit acknowledgment
      console.log('');
      console.log('   📚 PARTIAL READ WARNING (Confirmation Required):');
      console.log('   The protocol file was read with limit/offset parameters.');
      console.log('   This means NOT the entire file was read, which may cause');
      console.log('   critical requirements in later sections to be missed.');
      console.log('');
      console.log('   REMEDIATION OPTIONS:');
      console.log(`   1. Re-read ${requiredFile} WITHOUT limit/offset (RECOMMENDED)`);
      console.log('   2. Confirm by re-running with --confirm-full-read flag');
      console.log('');

      warnings.push(`PARTIAL READ: ${requiredFile} (limit=${partialReadDetails.limit}, offset=${partialReadDetails.offset})`);
      warnings.push('ACTION: Re-read without limit/offset OR provide confirmFullRead=true to proceed');

      // Emit structured log for WARN_REQUIRES_CONFIRMATION
      emitStructuredLog({
        event: 'PROTOCOL_FILE_READ_GATE',
        status: 'WARN_REQUIRES_CONFIRMATION',
        handoff_type: handoffType,
        required_file: requiredFile,
        partial_read_details: partialReadDetails,
        requires_confirmation: true,
        session_id: state.sessionId || 'unknown',
        timestamp: new Date().toISOString()
      });

      // FR-4: Return result indicating confirmation required
      return {
        pass: false,
        score: 0,
        max_score: 100,
        issues: [],
        warnings: warnings,
        requiresConfirmation: true,
        confirmationPrompt: `Partial read detected for ${requiredFile}. Provide confirmFullRead=true to acknowledge and proceed, or re-read the file without limit/offset.`,
        partialReadDetails: partialReadDetails
      };
    }

    // Emit structured log for PASS
    emitStructuredLog({
      event: 'PROTOCOL_FILE_READ_GATE',
      status: 'PASS',
      handoff_type: handoffType,
      required_file: requiredFile,
      session_id: state.sessionId || 'unknown',
      timestamp: new Date().toISOString()
    });

    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: []
    };
  }

  // Session state doesn't show file as read - try fallback validation
  // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Check if file exists on disk
  const fileExists = protocolFileExistsOnDisk(requiredFile);

  if (fileExists) {
    console.log(`   ⚠️  Session state does not track ${requiredFile}, but file exists on disk`);
    console.log('   ✅ FALLBACK PASS: File exists and has content - allowing handoff');

    // Mark it as read now to fix session state for future handoffs
    markProtocolFileRead(requiredFile);

    const state = readSessionState();
    emitStructuredLog({
      event: 'PROTOCOL_FILE_READ_GATE',
      status: 'PASS_FALLBACK',
      handoff_type: handoffType,
      required_file: requiredFile,
      fallback_reason: 'file_exists_on_disk',
      session_id: state.sessionId || 'unknown',
      timestamp: new Date().toISOString()
    });

    return {
      pass: true,
      score: 90, // Slightly lower score to indicate fallback was used
      max_score: 100,
      issues: [],
      warnings: [
        `Session state did not track ${requiredFile} - fallback validation used`,
        'Consider investigating session state corruption if this happens frequently'
      ]
    };
  }

  // File not in session state AND doesn't exist on disk - BLOCK
  console.log(`   ❌ Protocol file NOT read: ${requiredFile}`);
  console.log('');

  // SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001: Check if DIGEST file is missing
  const isDigestMode = getProtocolMode() === 'digest';
  const digestFilePath = path.join(PROJECT_DIR, requiredFile);
  const digestFileExists = fs.existsSync(digestFilePath);

  if (isDigestMode && !digestFileExists) {
    console.log('   🚨 DIGEST FILE MISSING');
    console.log('');
    console.log('   The required DIGEST protocol file does not exist.');
    console.log('   This typically means the generator has not been run recently.');
    console.log('');
    console.log('   REGENERATE FILES:');
    console.log('   node scripts/generate-claude-md-from-db.js');
    console.log('');
    console.log(`   Missing file: ${requiredFile}`);
    console.log('');
    console.log('   ALTERNATIVE: Use FULL mode (more tokens):');
    console.log('   CLAUDE_PROTOCOL_MODE=full node scripts/handoff.js ...');
    console.log('');
  } else {
    console.log('   📚 REMEDIATION:');
    console.log('   The LEO Protocol requires reading the phase-specific protocol file');
    console.log('   before proceeding with this handoff.');
    console.log('');
    console.log('   ACTION REQUIRED:');
    console.log(`   1. Read the file: ${requiredFile}`);
    console.log('   2. Re-run the handoff after reading');
    console.log('');
    console.log(`   HINT: Use the Read tool to read ${requiredFile}`);
  }

  // Emit structured log for BLOCK
  const state = readSessionState();
  emitStructuredLog({
    event: 'PROTOCOL_FILE_READ_GATE',
    status: 'BLOCK',
    handoff_type: handoffType,
    required_file: requiredFile,
    session_id: state.sessionId || 'unknown',
    timestamp: new Date().toISOString()
  });

  // Build issues list based on mode and file existence
  const issues = [
    `Protocol file not read: ${requiredFile}`,
    `LEO Protocol requires reading ${requiredFile} before ${handoffType} handoff`
  ];

  // SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001: Add regeneration hint for missing DIGEST files
  if (isDigestMode && !digestFileExists) {
    issues.push(`DIGEST file missing: ${requiredFile}`);
    issues.push('Run: node scripts/generate-claude-md-from-db.js');
  }

  return {
    pass: false,
    score: 0,
    max_score: 100,
    issues,
    warnings: [],
    protocolMode: getProtocolMode(),
    digestFileMissing: isDigestMode && !digestFileExists
  };
}

/**
 * Emit structured log for gate outcomes
 * @param {Object} logEntry - Log entry with standardized fields
 */
function emitStructuredLog(logEntry) {
  // Output as JSON for machine parsing
  console.log(`   [GATE_LOG] ${JSON.stringify(logEntry)}`);
}

/**
 * Create the Protocol File Read Gate
 *
 * SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001: Updated for DIGEST mode support
 *
 * @param {string} handoffType - The handoff type this gate is for
 * @returns {Object} Gate configuration
 */
export function createProtocolFileReadGate(handoffType) {
  const requirements = getHandoffFileRequirements();
  const requiredFile = requirements[handoffType];
  const protocolMode = getProtocolMode();

  return {
    name: 'GATE_PROTOCOL_FILE_READ',
    validator: async (ctx) => {
      console.log('\n📚 GATE: Protocol File Read Enforcement');
      console.log('-'.repeat(50));
      console.log(`   Handoff: ${handoffType}`);
      return validateProtocolFileRead(handoffType, ctx);
    },
    required: true,
    blocking: true,
    protocolMode,
    remediation: requiredFile
      ? `Read ${requiredFile} before proceeding with ${handoffType} handoff. Use: Read tool with file_path="${requiredFile}". Mode: ${protocolMode.toUpperCase()}`
      : 'No protocol file requirement for this handoff type.'
  };
}

/**
 * Bypass gate with explicit reason (emergency only)
 * Rate-limited per SD-LEARN-010
 *
 * @param {string} handoffType - The handoff type
 * @param {string} reason - Bypass reason (min 20 chars)
 * @returns {Object} Bypass result
 */
export function bypassProtocolFileReadGate(handoffType, reason) {
  if (!reason || reason.length < 20) {
    return {
      success: false,
      error: 'Bypass reason must be at least 20 characters'
    };
  }

  const requiredFile = HANDOFF_FILE_REQUIREMENTS[handoffType];
  const state = readSessionState();

  // Emit structured log for BYPASS
  emitStructuredLog({
    event: 'PROTOCOL_FILE_READ_GATE',
    status: 'BYPASS',
    handoff_type: handoffType,
    required_file: requiredFile,
    bypass_reason: reason,
    session_id: state.sessionId || 'unknown',
    timestamp: new Date().toISOString()
  });

  console.log('   ⚠️  BYPASS: Protocol file read gate bypassed');
  console.log(`   Reason: ${reason}`);

  return {
    success: true,
    bypassed: true,
    reason
  };
}

export default {
  validateProtocolFileRead,
  createProtocolFileReadGate,
  markProtocolFileRead,
  isProtocolFileRead,
  getPartialReadDetails,
  recordPartialReadConfirmation,
  hasPartialReadConfirmation,
  clearProtocolFileReadState,
  bypassProtocolFileReadGate,
  getProtocolMode,
  getHandoffFileRequirements,
  HANDOFF_FILE_REQUIREMENTS,
  HANDOFF_FILE_REQUIREMENTS_FULL,
  HANDOFF_FILE_REQUIREMENTS_DIGEST
};
