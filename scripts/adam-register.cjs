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

const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const ADAM_ROLE = 'adam';

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

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: `supabase client unavailable: ${e.message}` }, null, 2));
    process.exit(1);
  }
  const result = await registerAdam(supabase, sessionId);
  console.log(JSON.stringify(result, null, 2));
  console.error(adamReplyMirror());
  process.exit(result.ok ? 0 : 1);
}

module.exports = { computeAdamTag, registerAdam, adamReplyMirror, ADAM_ROLE };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    process.exit(1);
  });
}
