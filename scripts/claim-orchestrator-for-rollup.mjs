#!/usr/bin/env node
/**
 * claim-orchestrator-for-rollup.mjs — SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001
 *
 * Sanctioned, audited replacement for the ad-hoc inline UPDATE workaround used when an
 * orchestrator CHILD finalizes (LEAD-FINAL-APPROVAL) and must write a PARENT rollup
 * PLAN-TO-LEAD handoff. sd-start routes orchestrators to leaf children, so it cannot claim
 * the parent directly; the rollup handoff then fails with "Cannot create handoff for SD
 * without active session claim".
 *
 * This helper TRANSIENTLY claims the orchestrator parent for the rollup, and releases it.
 * It does NOT modify sd-start core claim-routing or the heartbeat machinery (those are owned
 * by the completed SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 / heartbeat SDs).
 *
 * Usage:
 *   CLAUDE_SESSION_ID=<sid> node scripts/claim-orchestrator-for-rollup.mjs <parent-sd-key-or-uuid>
 *   CLAUDE_SESSION_ID=<sid> node scripts/claim-orchestrator-for-rollup.mjs <parent-sd-key-or-uuid> --release
 *
 * Sequence: claim → (caller) run the orchestrator completion / rollup handoff → --release.
 */

const LIVE_SESSION_THRESHOLD_MS = 15 * 60 * 1000; // mirrors the claim TTL

/**
 * Core logic, decoupled from the CLI + the supabase client for testability.
 *
 * @param {object} supabase - Supabase client (or a mock with from().select().eq()/update().eq()).
 * @param {object} opts
 * @param {string} opts.sdKey - parent sd_key or uuid
 * @param {string} opts.sessionId - resolved current session id
 * @param {boolean} [opts.release] - release instead of claim
 * @param {number} [opts.now] - epoch ms (injectable for tests)
 * @returns {Promise<{ok:boolean, action:string, reason?:string, sdKey?:string}>}
 */
export async function claimOrchestratorForRollup(supabase, { sdKey, sessionId, release = false, now = Date.now() }) {
  if (!sdKey) return { ok: false, action: 'error', reason: 'missing sd key/uuid argument' };
  if (!sessionId) return { ok: false, action: 'error', reason: 'no session id (set CLAUDE_SESSION_ID)' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdKey);
  const col = isUuid ? 'id' : 'sd_key';
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, is_working_on, claiming_session_id')
    .eq(col, sdKey)
    .maybeSingle();
  if (sdErr) return { ok: false, action: 'error', reason: `lookup failed: ${sdErr.message}` };
  if (!sd) return { ok: false, action: 'error', reason: `SD not found: ${sdKey}` };

  // Confirm it is an orchestrator (sd_type or has children) — guards against claiming a leaf.
  let isOrchestrator = sd.sd_type === 'orchestrator';
  if (!isOrchestrator) {
    const { data: kids } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('parent_sd_id', sd.id)
      .limit(1);
    isOrchestrator = Array.isArray(kids) && kids.length > 0;
  }
  if (!isOrchestrator) {
    return { ok: false, action: 'error', reason: `${sd.sd_key} is not an orchestrator (no sd_type='orchestrator' and no children). Use sd-start for leaf SDs.` };
  }

  if (release) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ is_working_on: false, claiming_session_id: null })
      .eq('id', sd.id);
    if (error) return { ok: false, action: 'error', reason: `release failed: ${error.message}` };
    return { ok: true, action: 'released', sdKey: sd.sd_key };
  }

  // Refuse if claimed by a DIFFERENT live session (heartbeat within the TTL).
  if (sd.claiming_session_id && sd.claiming_session_id !== sessionId) {
    const { data: other } = await supabase
      .from('claude_sessions')
      .select('session_id, status, heartbeat_at')
      .eq('session_id', sd.claiming_session_id)
      .maybeSingle();
    if (other) {
      const hbMs = other.heartbeat_at ? new Date(other.heartbeat_at).getTime() : 0;
      const live = other.status === 'active' && (now - hbMs) < LIVE_SESSION_THRESHOLD_MS;
      if (live) {
        return { ok: false, action: 'refused', reason: `parent ${sd.sd_key} is claimed by a different LIVE session ${sd.claiming_session_id.slice(0, 8)} (heartbeat ${Math.round((now - hbMs) / 1000)}s ago)`, sdKey: sd.sd_key };
      }
    }
  }

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ is_working_on: true, claiming_session_id: sessionId })
    .eq('id', sd.id);
  if (error) return { ok: false, action: 'error', reason: `claim failed: ${error.message}` };
  return { ok: true, action: 'claimed', sdKey: sd.sd_key };
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = (() => {
  try { return import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')); }
  catch { return false; }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const sdKey = args.find((a) => !a.startsWith('--'));
  const sessionId = process.env.CLAUDE_SESSION_ID;
  const { createSupabaseServiceClient } = await import('./lib/supabase-connection.js');
  const supabase = await createSupabaseServiceClient('engineer');
  const result = await claimOrchestratorForRollup(supabase, { sdKey, sessionId, release });
  if (result.ok) {
    if (result.action === 'claimed') {
      console.log(`✓ Claimed orchestrator parent ${result.sdKey} for rollup (session ${sessionId.slice(0, 8)}).`);
      console.log(`  Now run the completion/rollup handoff, then RELEASE:`);
      console.log(`  CLAUDE_SESSION_ID=${sessionId} node scripts/claim-orchestrator-for-rollup.mjs ${result.sdKey} --release`);
    } else {
      console.log(`✓ Released orchestrator parent ${result.sdKey}.`);
    }
    process.exit(0);
  } else {
    console.error(`✗ ${result.action.toUpperCase()}: ${result.reason}`);
    process.exit(1);
  }
}
