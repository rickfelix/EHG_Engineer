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
const { detectProjectDir } = require('./lib/detect-context.cjs');

// Session state file path — SD-FDBK-ENH-SESSION-STATE-SCOPING-001: resolve via the canonical
// resolver (same ~/.claude-sessions mechanism as unified-state-manager) instead of hardcoding
// the legacy shared file, so writes land in the per-session file and converge with the writer.
const { getSessionStateFilePath, resolveStateReadPath } = require('./lib/session-state-resolver.cjs');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || detectProjectDir();
const SESSION_STATE_FILE = getSessionStateFilePath(PROJECT_DIR); // scoped write/metadata path
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
  'CLAUDE_DIGEST.md',
  // Role contracts (no DIGEST variant, NOT a handoff-gate requirement — verified at
  // role activation instead: adam-register.cjs checks this read via session state)
  'CLAUDE_ADAM.md',
  // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-2, the fourth of the four surfaces the chairman's
  // A-GOVERN decision requires. Tracking a companion is NOT a read requirement — nothing gates on
  // having read them, and the manual is explicitly read at the moment of doing rather than at
  // startup. It is what makes a read OBSERVABLE: without an entry here the tracker ignores the file
  // entirely, so "was the governed procedure ever opened?" has no answer at all. Governed content
  // that no mechanism can even see being read is the demotion this SD exists to prevent.
  'CLAUDE_ADAM_MANUAL.md',
  // SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001. A read of a file absent from this list is invisible to
  // session state entirely — CLAUDE_ADAM_DIGEST.md is generated today and tracked nowhere. A new
  // companion that nothing records is a companion nobody can prove was read.
  'CLAUDE_LEAD_MANUAL.md',
  'CLAUDE_PLAN_MANUAL.md',
  'CLAUDE_ADAM_PROVENANCE.md',
  'CLAUDE_SOLOMON.md',  // role contract, not a handoff-gate requirement — verified at role activation
  // SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001. Same reason CLAUDE_LEAD_MANUAL.md is listed: a read
  // of a file absent from this list is invisible to session state entirely, so a companion nothing
  // records is a companion nobody can prove was read.
  'CLAUDE_SOLOMON_MANUAL.md',
  // SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-2 prerequisite. The coordinator was the ONLY role
  // whose contract is small enough to read in one call (CLAUDE_COORDINATOR.md is ~25.5KB, under the
  // 25k-token cap for any real tokenizer) and the ONLY role with no verifier of any kind — its
  // priming requirement terminated in a self-attestation nothing checked. Adding it here is the
  // prerequisite for checking it at all: until now a coordinator READING its contract produced no
  // session-state record, so there was nothing for a check to consult.
  'CLAUDE_COORDINATOR.md'
];

// SD-LEO-INFRA-OPTIMIZE-PROTOCOL-FILE-001: Equivalence mapping for gate compatibility
// Gates check if EITHER the digest OR full version was read — this mapping tells
// the gate which file satisfies the same requirement, WITHOUT conflating telemetry.
// The tracker now records the ACTUAL file read, and only marks the equivalent
// in the legacy protocolFilesRead array (for gate backward compatibility).
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
    // Read-fallback: scoped file if it exists, else legacy (no fresh-session regression).
    const readPath = resolveStateReadPath(PROJECT_DIR);
    if (fs.existsSync(readPath)) {
      const content = fs.readFileSync(readPath, 'utf8');
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
/**
 * Pure: decide whether a Read covered the whole file, and what range it actually covered.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 FR-0.
 *
 * Exported so the decision is unit-testable without the hook's stdin/session-state plumbing —
 * the pre-existing tracker tests drive the real hook against the REAL session state file, which
 * is both order-dependent (all four are quarantined) and a live-state write.
 *
 * @param {{tool_input?: object, tool_response?: object}} hookInput
 * @returns {{isPartialRead: boolean, truncatedByHarness: boolean, range: {offset: number, limit: number|null}}}
 */
function deriveReadCoverage(hookInput) {
  const toolInputData = (hookInput && hookInput.tool_input) || {};
  const respFile = (hookInput && hookInput.tool_response && hookInput.tool_response.file) || {};

  const hasLimit = toolInputData.limit !== undefined && toolInputData.limit !== null;
  const hasOffset = toolInputData.offset !== undefined && toolInputData.offset !== null;
  // === true, never truthiness: the harness OMITS this key on a non-truncated read, and a missing
  // value must not be read as a negative result.
  const truncatedByHarness = respFile.truncatedByTokenCap === true;

  return {
    isPartialRead: hasLimit || hasOffset || truncatedByHarness,
    truncatedByHarness,
    range: {
      offset: truncatedByHarness && typeof respFile.startLine === 'number'
        ? respFile.startLine
        : (hasOffset ? toolInputData.offset : 1),
      limit: truncatedByHarness && typeof respFile.numLines === 'number'
        ? respFile.numLines
        : (hasLimit ? toolInputData.limit : null)
    }
  };
}

function processHookInput(hookInput) {
  const toolName = hookInput.tool_name || '';
  const toolInputData = hookInput.tool_input || {};
  // SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-5. ADDITIVE ONLY — this does NOT touch
  // lastReadWasPartial, whose semantics are load-bearing for protocol-file-read-gate.js:159 and
  // therefore for all four handoff executors. A new field cannot change an existing verdict.
  //
  // WHY IT IS NEEDED: partial-ness is computed from the CALLER'S ARGUMENTS, so a no-argument Read of
  // an over-cap file — which the harness silently TRUNCATES — records lastReadWasPartial=false, i.e.
  // "confirmed full". It also never enters ranges[], because that push sits inside the isPartialRead
  // branch. So neither the boolean nor union-coverage can see it. The only thing that can is what the
  // read actually DELIVERED.
  //
  // WHETHER THE HARNESS SUPPLIES THIS IS AN OPEN QUESTION AT TIME OF WRITING: transcripts show the
  // Read result carrying {startLine, numLines, totalLines}, but that is the transcript, not proof of
  // the hook payload. Captured defensively — present when the harness sends it, absent otherwise, and
  // consumers must treat absence as "unknown" rather than as "full".
  const toolResponse = hookInput.tool_response || null;

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
  // SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 FR-0: input params alone CANNOT see harness
  // truncation. A no-offset Read of a file over the 25k-token cap returns ~36% of it and was
  // recorded here as a FULL read (contract_read=true, partial=false), while correct pagination
  // was the thing flagged partial — the gauge was inverted and already in its pass state.
  //
  // The signal is measured, not inferred: on PostToolUse the harness sets
  // tool_response.file.truncatedByTokenCap === true ONLY on a cap-truncated read (verified
  // empirically against a control read of the same file — the flag is ABSENT otherwise, so
  // compare with === true and never treat "missing" as a negative result). Deriving truncation
  // from startLine/numLines/totalLines instead would re-introduce the SAME inversion: those
  // arithmetic ALSO reports "incomplete" for a legitimate limit=5 read.
  // Single source of truth: the hook path and the unit tests must exercise the SAME derivation.
  // An inline copy here would let the tested function and the live behaviour drift apart silently.
  const respFile = (hookInput.tool_response && hookInput.tool_response.file) || {};
  const coverage = deriveReadCoverage(hookInput);
  const truncatedByHarness = coverage.truncatedByHarness;
  const isPartialRead = coverage.isPartialRead;

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
    // QF-20260506-836: also append to ranges[] so the consumer can compute union
    // coverage. The singleton lastPartialRead loses prior reads of files larger
    // than the 25k-token Read cap (RCA c45c82f9). Shape matches the consumer's
    // unionRangeCoverage() contract at sd-key-generator.js:156-194 — raw
    // {offset, limit} pairs (offset 1-indexed, omitted = line 1).
    if (!Array.isArray(fileStatus.ranges)) fileStatus.ranges = [];
    // FR-0: for a HARNESS-truncated read the input params describe a full-file request that did
    // not happen, so recording {offset:1, limit:null} would claim total coverage. Record the
    // lines actually returned instead, so unionRangeCoverage() credits real coverage and a
    // follow-on paginated read can legitimately complete the file.
    fileStatus.ranges.push({
      offset: coverage.range.offset,
      limit: coverage.range.limit,
      readAt: now,
      ...(truncatedByHarness ? { truncatedByTokenCap: true, totalLines: respFile.totalLines } : {})
    });
    // FR-0: record WHY it was partial. A harness truncation is not an operator choice — it is a
    // read that silently failed, and it previously produced no banner at all.
    fileStatus.lastReadTruncatedByHarness = truncatedByHarness;
    if (truncatedByHarness) {
      fileStatus.lastPartialRead.truncatedByTokenCap = true;
      console.log(`[protocol-file-tracker] 🚨 HARNESS-TRUNCATED read of ${normalizedPath}: returned lines ${respFile.startLine}-${(respFile.startLine || 1) + (respFile.numLines || 0) - 1} of ${respFile.totalLines}. The file exceeds the per-call token cap; this is NOT a full read. Paginate with offset/limit to cover the remainder.`);
    } else {
      console.log(`[protocol-file-tracker] ⚠️ Partial read detected for ${normalizedPath} (limit: ${toolInputData.limit}, offset: ${toolInputData.offset}; ranges: ${fileStatus.ranges.length})`);
    }
  } else {
    // Full read clears partial read flag but preserves historical metadata
    fileStatus.lastReadWasPartial = false;
    fileStatus.lastReadTruncatedByHarness = false;
    // Note: lastPartialRead preserved for audit (FR-2)
    console.log(`[protocol-file-tracker] ✅ Full read of ${normalizedPath}${fileStatus.lastPartialRead ? ' (clears partial read flag)' : ''}`);
  }

  // SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-5: record what the read actually DELIVERED,
  // independent of what the caller asked for. This is the only signal that can distinguish a genuine
  // full read from a no-argument read the harness silently truncated — the boolean above says
  // "confirmed full" for both, and ranges[] never sees the truncated one at all.
  //
  // ADDITIVE: a new field, read by the role-contract consumers only. lastReadWasPartial is untouched,
  // so the handoff gate at protocol-file-read-gate.js:159 behaves exactly as before.
  //
  // ABSENT MEANS UNKNOWN, NOT COMPLETE. If the harness does not supply tool_response, no field is
  // written and a consumer must not infer coverage from its absence — that inference is the original
  // defect in another costume.
  if (toolResponse && typeof toolResponse === 'object') {
    const total = Number(toolResponse.totalLines);
    const delivered = Number(toolResponse.numLines);
    const start = Number(toolResponse.startLine);
    if (Number.isFinite(total) && Number.isFinite(delivered)) {
      fileStatus.lastDelivered = {
        startLine: Number.isFinite(start) ? start : 1,
        numLines: delivered,
        totalLines: total,
        // The load-bearing derived fact, computed once here where both numbers are in hand.
        coveredWholeFile: delivered >= total,
        readAt: now
      };
      if (!Array.isArray(fileStatus.deliveredRanges)) fileStatus.deliveredRanges = [];
      fileStatus.deliveredRanges.push({
        offset: Number.isFinite(start) ? start : 1,
        limit: delivered,
        readAt: now
      });
      if (delivered < total) {
        console.log(`[protocol-file-tracker] ⚠️ TRUNCATED read of ${normalizedPath}: ${delivered} of ${total} lines delivered (caller passed no limit/offset, so this would otherwise record as a full read)`);
      }
    }
  }

  // Save updated status for ACTUAL file read only
  state.protocolFileReadStatus[normalizedPath] = fileStatus;

  // SD-LEO-INFRA-OPTIMIZE-PROTOCOL-FILE-001: Track escalation events
  // When a full file is read AND its digest was previously read, record escalation
  if (!state.protocolFileEscalations) {
    state.protocolFileEscalations = [];
  }
  if (normalizedEquivalent) {
    const equivalentStatus = state.protocolFileReadStatus[normalizedEquivalent];
    const isDigestFile = normalizedPath.includes('DIGEST');
    const isFullFile = !isDigestFile && normalizedEquivalent?.includes('DIGEST');
    // Escalation = reading FULL file after digest was already read
    if (isFullFile && equivalentStatus && equivalentStatus.readCount > 0) {
      state.protocolFileEscalations.push({
        from: normalizedEquivalent,
        to: normalizedPath,
        timestamp: now
      });
      console.log(`[protocol-file-tracker] ESCALATION: ${normalizedEquivalent} -> ${normalizedPath}`);
    }
  }

  // NOTE: Do NOT copy status to equivalent file — this was the telemetry conflation bug.
  // The equivalent mapping is only used for the legacy protocolFilesRead array (gate compat).

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

// Only auto-run as a hook; requiring this file (tests) must not consume stdin.
if (require.main === module) {
  main();
}

module.exports = { deriveReadCoverage, processHookInput };

