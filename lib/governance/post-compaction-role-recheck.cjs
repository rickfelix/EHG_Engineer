/**
 * Post-compaction role-seat re-read check. SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G.
 *
 * THE GAP THIS CLOSES. core-protocol-gate.js's protocolGate.fileReads enforcement fires only at
 * a handoff, and role seats (Solomon, Adam, coordinator) never run handoffs -- so a role seat that
 * compacts and keeps working is uncovered by construction (witnessed: drift flag ce3de628,
 * 2026-09-02, a prior Solomon seat deferred a post-compaction re-read on a hash-unchanged
 * rationale, caught by the chairman by hand).
 *
 * WHY THIS READS A DIFFERENT TRACKER THAN core-protocol-gate.js. LEAD investigation (VALIDATION
 * evidence row 21ff50fc-f5c8-4c80-b02b-a21756b8501f, Explore evidence row
 * e95179c6-e678-4d78-bc0e-72f31e2254ee) established that role registers (adam-register.cjs:345,
 * coordinator-startup-check.mjs:642, solomon-register.cjs equivalent) consult
 * state.protocolFileReadStatus[<contract file>].lastReadAt -- NOT protocolGate.fileReads, which
 * they never read. Relocating the OLD tracker to a tick would fire over state that is empty for
 * exactly the seats this SD protects. This module reads the tracker the registers actually use.
 *
 * NARROW BY DESIGN (LEAD decision Q1). QF-20260524-337 deliberately preserves protocolGate across
 * the real PreCompact hook to stop a post-compaction /sd-create false-block. That preservation is
 * NOT reversed here -- this module never touches protocolGate.fileReads or core-protocol-gate.js.
 *
 * NO NEW MACHINERY (ratification 76a3c081). Reads two already-existing, already-written signals:
 *   1. ~/.claude/flags/last-compaction.json -- written by scripts/hooks/precompact-snapshot.ps1 on
 *      EVERY real PreCompact firing (auto AND manual), the one marker context-compact-nudge.js
 *      already reads for its own cooldown logic.
 *   2. .claude/fleet-identity-<sessionId>.json -- written by writeRoleStatusIdentity()
 *      (lib/fleet/role-status-identity.cjs) at role startup for every role session, INCLUDING
 *      Solomon (which has no quiet-tick script -- this file-based read reaches it without one).
 *
 * Pure comparison core (needsRecheck) is unit-testable without any filesystem access.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readIdentityFile } = require('../fleet/role-status-identity.cjs');

/** The 3 seats this SD is scoped to (LEAD decision Q3) -- Michael is explicitly out of scope. */
const IN_SCOPE_ROLES = Object.freeze(['adam', 'coordinator', 'solomon']);

/** Mirrors adam-register.cjs / solomon-register.cjs / coordinator-startup-check.mjs CONTRACT_FILE. */
const CONTRACT_FILE_BY_ROLE = Object.freeze({
  adam: 'CLAUDE_ADAM.md',
  coordinator: 'CLAUDE_COORDINATOR.md',
  solomon: 'CLAUDE_SOLOMON.md',
});

// Same FLAG_DIR resolution as scripts/hooks/context-compact-nudge.js:104 -- one env override,
// not a second copy of the literal, so a test-isolated run and the real reader never disagree.
function flagDir(env = process.env) {
  return env.LEO_COMPACT_FLAG_DIR || path.join(os.homedir(), '.claude', 'flags');
}

/**
 * The current session's own genuine last-compaction timestamp (auto or manual PreCompact), or
 * null if there is none, the marker is unreadable, or it belongs to a DIFFERENT session.
 *
 * TR-2: ~/.claude/flags/last-compaction.json is a single file shared per machine home directory
 * across every concurrent session -- filtering on the marker's own embedded sessionId field is
 * mandatory, not optional. File mtime or bare existence is never a valid signal for THIS session.
 * @param {string} sessionId
 * @param {{ dir?: string, env?: object }} [opts]
 * @returns {string|null} ISO timestamp, or null
 */
function readLastCompactionForSession(sessionId, { dir, env } = {}) {
  if (!sessionId) return null;
  try {
    const markerPath = path.join(dir || flagDir(env), 'last-compaction.json');
    if (!fs.existsSync(markerPath)) return null;
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (!marker || marker.sessionId !== sessionId) return null;
    return typeof marker.timestamp === 'string' ? marker.timestamp : null;
  } catch {
    return null;
  }
}

/**
 * Which in-scope role (adam | coordinator | solomon) this session is, or null if it is not a
 * role session, is an out-of-scope role (e.g. michael), or the identity file is unreadable.
 * File-only (no DB, no network) so this is safe to call from a PostToolUse hook's hot path.
 * @param {string} sessionId
 * @param {string} [identityDir] injectable for tests
 * @returns {'adam'|'coordinator'|'solomon'|null}
 */
function detectInScopeRole(sessionId, identityDir) {
  if (!sessionId) return null;
  const parsed = readIdentityFile(sessionId, identityDir);
  if (!parsed || parsed.role !== true || typeof parsed.callsign !== 'string') return null;
  const role = parsed.callsign.trim().toLowerCase();
  return IN_SCOPE_ROLES.includes(role) ? role : null;
}

/**
 * Pure: does a role seat need to re-read its contract, given its own genuine compaction
 * timestamp and the last time its contract read was recorded?
 *
 * true iff there IS a genuine compaction AND (no read was ever recorded, OR that read is older
 * than the compaction). A seat with no compaction marker for this session has nothing to react
 * to -- false, not true; an unset compaction is not evidence of staleness.
 * @param {string|null} compactionAt ISO timestamp or null
 * @param {string|null} contractReadAt ISO timestamp or null
 * @returns {boolean}
 */
function needsRecheck(compactionAt, contractReadAt) {
  if (!compactionAt) return false;
  const compactionMs = Date.parse(compactionAt);
  if (!Number.isFinite(compactionMs)) return false;
  if (!contractReadAt) return true;
  const readMs = Date.parse(contractReadAt);
  if (!Number.isFinite(readMs)) return true;
  return readMs < compactionMs;
}

/**
 * Full check for one role session, given the ALREADY-LOADED session state object (the caller --
 * protocol-file-tracker.cjs -- already has this in memory on every Read call; this function
 * never re-reads it, only the two file-based signals above).
 * @param {string} sessionId
 * @param {object} state the session-state object (state.protocolFileReadStatus)
 * @param {{ dir?: string, env?: object, identityDir?: string }} [opts]
 * @returns {{ role: string|null, required: boolean, compactionAt: string|null, contractReadAt: string|null }}
 */
function checkRoleSession(sessionId, state, { dir, env, identityDir } = {}) {
  const role = detectInScopeRole(sessionId, identityDir);
  if (!role) return { role: null, required: false, compactionAt: null, contractReadAt: null };
  const compactionAt = readLastCompactionForSession(sessionId, { dir, env });
  const contractFile = CONTRACT_FILE_BY_ROLE[role];
  const status = state && state.protocolFileReadStatus && state.protocolFileReadStatus[contractFile];
  const contractReadAt = (status && typeof status.lastReadAt === 'string') ? status.lastReadAt : null;
  return { role, required: needsRecheck(compactionAt, contractReadAt), compactionAt, contractReadAt };
}

module.exports = {
  IN_SCOPE_ROLES,
  CONTRACT_FILE_BY_ROLE,
  readLastCompactionForSession,
  detectInScopeRole,
  needsRecheck,
  checkRoleSession,
};
