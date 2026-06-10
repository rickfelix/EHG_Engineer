#!/usr/bin/env node
/**
 * Adam role register/verify
 * SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-A
 *
 * Idempotently tags the CURRENT session in claude_sessions.metadata with
 * role=adam and non_fleet=true, so the coordinator's fleet accounting (worker
 * counts, ETA math, revival requests, claim-sweep targeting) excludes this
 * heartbeating-but-non-fleet advisory/analysis session.
 *
 * VERIFY-FIRST: the live Adam session already carried the tag set ad-hoc, so a
 * blind write would be wrong — we read current metadata and only update on diff,
 * otherwise report "verified" (no-op). JSONB merge preserves existing keys
 * (callsign, fleet_identity, etc.). No migration — metadata is free-form JSONB.
 *
 * Self-env-loading (reuses lib/supabase-client.cjs ancestor .env walk) so /adam
 * works without `node --env-file=.env`.
 *
 * Usage: node scripts/adam-register.cjs            (CLAUDE_SESSION_ID from env)
 *        npm run adam:register
 * Output: one JSON object { ok, action: tagged|verified|error, ... }.
 */

const fs = require('fs');
const path = require('path');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { resolveStateReadPath } = require('./hooks/lib/session-state-resolver.cjs');

const ADAM_ROLE = 'adam';
const CONTRACT_FILE = 'CLAUDE_ADAM.md';

/**
 * Pure: given current metadata, decide whether a write is needed and produce the
 * merged metadata. Exported for unit testing (no DB).
 * @param {object|null} current - existing claude_sessions.metadata
 * @returns {{ alreadyTagged: boolean, merged: object }}
 */
function computeAdamTag(current) {
  const meta = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
  const alreadyTagged = meta.role === ADAM_ROLE && meta.non_fleet === true;
  const merged = { ...meta, role: ADAM_ROLE, non_fleet: true };
  return { alreadyTagged, merged };
}

/**
 * Register/verify the Adam tag for a session. Injectable supabase for tests.
 * Never throws — returns a structured result object.
 */
async function registerAdam(supabase, sessionId) {
  if (!sessionId) {
    return { ok: false, action: 'error', error: 'CLAUDE_SESSION_ID env var required (set by the SessionStart hook).' };
  }
  let row;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) return { ok: false, action: 'error', error: error.message };
    row = data;
  } catch (e) {
    return { ok: false, action: 'error', error: e.message };
  }
  if (!row) {
    return { ok: false, action: 'error', error: `session ${sessionId} not found in claude_sessions (is the SessionStart register hook run?).` };
  }

  const { alreadyTagged, merged } = computeAdamTag(row.metadata);
  if (alreadyTagged) {
    return { ok: true, action: 'verified', session_id: sessionId, role: ADAM_ROLE, non_fleet: true, message: 'Session already tagged role=adam, non_fleet=true (verified, no change).' };
  }
  try {
    const { error } = await supabase.from('claude_sessions').update({ metadata: merged }).eq('session_id', sessionId);
    if (error) return { ok: false, action: 'error', error: error.message };
  } catch (e) {
    return { ok: false, action: 'error', error: e.message };
  }
  return { ok: true, action: 'tagged', session_id: sessionId, role: ADAM_ROLE, non_fleet: true, message: 'Session tagged role=adam, non_fleet=true (excluded from fleet accounting).' };
}

/**
 * Contract-read verification (chairman directive 2026-06-10): confirm CLAUDE_ADAM.md
 * was read THIS session, via the same session-state the protocol-file-tracker hook
 * writes for CLAUDE_LEAD/PLAN/EXEC (CLAUDE_ADAM.md is in its PROTOCOL_FILES list).
 * NEVER blocks the tag write — an untagged Adam re-enters fleet accounting (worker
 * counts, revival pings, claim-sweep targeting), which is the worse failure mode.
 * The verdict rides the JSON output; the banner makes the obligation loud.
 * Pure file-reads, never throws. Exported for tests.
 * @param {string} [projectDir]
 * @returns {{ contract_file: string, contract_exists: boolean, contract_read: boolean,
 *             contract_read_partial: boolean, contract_last_read_at: string|null }}
 */
function checkContractRead(projectDir) {
  const result = {
    contract_file: CONTRACT_FILE,
    contract_exists: false,
    contract_read: false,
    contract_read_partial: false,
    contract_last_read_at: null,
  };
  try {
    const root = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    result.contract_exists = fs.existsSync(path.join(root, CONTRACT_FILE));
    const statePath = resolveStateReadPath(root);
    if (!fs.existsSync(statePath)) return result;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
    const status = state.protocolFileReadStatus && state.protocolFileReadStatus[CONTRACT_FILE];
    if (status && status.readCount > 0) {
      result.contract_read = true;
      result.contract_read_partial = status.lastReadWasPartial === true;
      result.contract_last_read_at = status.lastReadAt || null;
    } else if (Array.isArray(state.protocolFilesRead) && state.protocolFilesRead.includes(CONTRACT_FILE)) {
      result.contract_read = true; // legacy-array fallback (pre-FR-2 state shape)
    }
  } catch { /* fail-open: tracking unavailable must never break role activation */ }
  return result;
}

/**
 * Pure: the stderr banner for a missing/partial contract read, or null when satisfied.
 * @param {ReturnType<typeof checkContractRead>} check
 * @returns {string|null}
 */
function contractReadBanner(check) {
  if (check.contract_read && !check.contract_read_partial) return null;
  const lines = ['═══ ADAM ROLE CONTRACT — READ REQUIRED ═══'];
  if (!check.contract_exists) {
    lines.push(`  ✗ ${CONTRACT_FILE} not found — regenerate: node scripts/generate-claude-md-from-db.js`);
  } else if (!check.contract_read) {
    lines.push(`  ✗ No record of ${CONTRACT_FILE} being read this session.`);
  } else {
    lines.push(`  ⚠ Last read of ${CONTRACT_FILE} was PARTIAL (offset/limit used).`);
  }
  lines.push(`  → Read ${CONTRACT_FILE} IN FULL (Read tool, no offset/limit) BEFORE any Adam work.`);
  lines.push('  (Registration is not blocked — the tag must always land — but the contract read is mandatory.)');
  return lines.join('\n');
}

// FR-7 (SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001): the consume-reply mirror printed on
// /adam startup so Adam discovers the durable reply path without reverse-engineering the
// channel. Mirrors the coordinator-side renderAdamLane() in coordinator-startup-check.mjs.
// Printed to STDERR so the stdout JSON contract stays pure. Pure + exported for tests.
function adamReplyMirror() {
  return [
    '═══ ADAM ↔ COORDINATOR COMMS (consume-reply path) ═══',
    '  • SEND advisory (fire-and-forget, replyable):  node scripts/adam-advisory.cjs send "<body>"',
    '  • REQUEST (await a sync reply):  node scripts/adam-advisory.cjs request "<question>" [--timeout <ms>]',
    '  • DRAIN replies that arrived after a timeout:  node scripts/adam-advisory.cjs replies',
    '  (canonical doc: docs/protocol/coordinator-adam-comms.md)',
  ].join('\n');
}

// ── Clean shutdown — Windows libuv UV_HANDLE_CLOSING avoidance ────────────────
// registerAdam opens an undici/fetch keep-alive socket (Supabase). Calling
// process.exit() afterward aborts on Windows ("Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING), src\win\async.c:76") — empirically even after a deferred
// exit or dispatcher.close() followed by exit(). The only reliable avoidance is to
// NOT call process.exit(): set process.exitCode, close undici's sockets, and let
// the event loop drain. Same contract as the Stop hooks (see
// scripts/hooks/__tests__/stop-hook-uv-handle-closing.test.js).
let _shuttingDown = false;
async function shutdown(code) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  process.exitCode = code;
  // Backstop only: unref'd so it never delays a clean natural exit.
  setTimeout(() => process.exit(code), 8000).unref();
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* undici absent/already closed */ }
  // Deliberately NO process.exit() — returning lets Node exit once the loop drains.
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: `supabase client unavailable: ${e.message}` }, null, 2));
    return shutdown(1);
  }
  const result = await registerAdam(supabase, sessionId);
  const contractCheck = checkContractRead();
  console.log(JSON.stringify({ ...result, ...contractCheck }, null, 2));
  const banner = contractReadBanner(contractCheck);
  if (banner) console.error(banner);
  console.error(adamReplyMirror());
  return shutdown(result.ok ? 0 : 1);
}

module.exports = { computeAdamTag, registerAdam, adamReplyMirror, checkContractRead, contractReadBanner, ADAM_ROLE, CONTRACT_FILE };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    shutdown(1);
  });
}
