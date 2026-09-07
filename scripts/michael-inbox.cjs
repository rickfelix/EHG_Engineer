#!/usr/bin/env node
/**
 * Michael inbox drain — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G (spec §1.2, §1.4).
 *
 * Mirrors scripts/solomon-advisory.cjs's structural shape (drainInbox + drainSolomonOutbound), cut
 * down to what Michael's lane actually needs: Michael's seat SENDS NOTHING through this path
 * (michael-register.cjs:407) — this file is inbox-only, no send/request surface.
 *
 * Drains DRAIN_SETS.michael-recognized rows (coordinator directives, michael_handoff rows, the
 * comms_check canary, worker_signal), resolved live via lib/fleet/drain-set-registry.js (falls
 * open to the JS-floor DRAIN_SETS.michael while role_drain_sets remains unapplied). An unrecognized/
 * untyped row directed at Michael is SURFACED, never silently consumed — a partial registration
 * elsewhere in the fleet must stay visible here, not vanish.
 *
 * Exports drainMichaelOutbound to satisfy scripts/michael-register.cjs's existing lazy-require
 * (michael-register.cjs:297) — re-targets a retired Michael session's unread inbound to the new
 * session on (re)register, mirroring drainSolomonOutbound exactly.
 *
 * Usage:
 *   node scripts/michael-inbox.cjs [--quiet] [--json]
 */
const { getActiveMichaelId } = require('../lib/coordinator/michael-identity.cjs');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

/**
 * A Michael-inbox row: any kind DRAIN_SETS.michael recognizes, directed at Michael. Comms_check is
 * included (Michael's own canary reply path is the standard worker one — no dedicated first-class
 * branch is needed the way Solomon's oracle-cost lane requires one).
 * @param {object} r @param {string[]} recognizedKinds
 */
function isMichaelInboxRow(r, recognizedKinds) {
  const k = r && r.payload && r.payload.kind;
  return k != null && recognizedKinds.includes(k);
}

/** An unrecognized/untyped row directed at Michael — surface, never silently drop or consume. */
function isOrphanedMichaelRow(r, recognizedKinds) {
  if (!r) return false;
  if (isMichaelInboxRow(r, recognizedKinds)) return false;
  return true;
}

/**
 * Read and print unread rows directed at the live Michael session (or the 'broadcast-michael'
 * sentinel). Never throws; a query failure is reported and treated as zero rows so a seat startup
 * check never hard-fails on a transient DB blip.
 */
async function drainInbox(supabase, sessionId, { quiet = false, asJson = false } = {}) {
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, message_type, subject, body, payload, created_at')
    .in('target_session', [sessionId, 'broadcast-michael'])
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    if (asJson) { console.log(JSON.stringify({ ok: false, error: error.message, rows: [] })); return { rows: [], orphaned: [] }; }
    console.error('ERROR: michael inbox query failed:', error.message);
    return { rows: [], orphaned: [] };
  }

  const { resolveRecognizedKinds } = await import('../lib/fleet/drain-set-registry.js');
  const recognizedKinds = await resolveRecognizedKinds({ supabase, role: 'michael' });

  const rows = (allRows || []).filter((r) => isMichaelInboxRow(r, recognizedKinds));
  const orphaned = (allRows || []).filter((r) => isOrphanedMichaelRow(r, recognizedKinds));

  if (asJson) {
    console.log(JSON.stringify({ ok: true, rows: rows.length, orphaned: orphaned.length }));
    return { rows, orphaned };
  }

  if (orphaned.length > 0) {
    console.warn(`⚠ ${orphaned.length} unread Michael-directed row${orphaned.length === 1 ? '' : 's'} with unrecognized/untyped kind NOT auto-drained (visibility — NOT consumed):`);
    for (const r of orphaned) {
      const kind = (r.payload && r.payload.kind) || '(untyped)';
      const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      console.warn(`  ⚠ [orphan/${kind}] id=${r.id} (${ageMin}m) ${text}`);
    }
  }

  if (rows.length === 0) { if (!quiet) console.log('(no unread directed Michael inbox rows)'); return { rows, orphaned }; }

  console.log(`${rows.length} Michael inbox row${rows.length === 1 ? '' : 's'}:`);
  for (const r of rows) {
    const kind = (r.payload && r.payload.kind) || '(untyped)';
    const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    console.log(`  📥 [${kind}] id=${r.id} (${ageMin}m) ${text}`);
  }
  return { rows, orphaned };
}

/**
 * On a Michael (re)register/restart, re-target UNREAD rows destined for an OLD Michael session to
 * the NEW one (comms survive the handoff). Mirrors drainSolomonOutbound exactly: idempotent
 * (read_at IS NULL gate), fail-open (never throws). Required by michael-register.cjs's
 * lazy-require. Exported.
 */
async function drainMichaelOutbound(supabase, { newSessionId, oldSessionIds } = {}) {
  if (!supabase || !newSessionId || !Array.isArray(oldSessionIds)) return { moved: 0 };
  const olds = oldSessionIds.filter((s) => typeof s === 'string' && s && s !== newSessionId);
  if (!olds.length) return { moved: 0 };
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: newSessionId })
      .in('target_session', olds)
      .is('read_at', null)
      .gte('created_at', cutoff)
      .select('id');
    if (error) return { moved: 0, error: error.message };
    return { moved: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { moved: 0, error: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.includes('--quiet');
  const asJson = argv.includes('--json');
  const supabase = createSupabaseServiceClient();
  const sessionId = await getActiveMichaelId(supabase, {}).catch(() => null);
  if (!sessionId) {
    if (asJson) { console.log(JSON.stringify({ ok: false, error: 'no active michael session' })); }
    else if (!quiet) { console.log('(no active Michael session — nothing to drain)'); }
    return;
  }
  await drainInbox(supabase, sessionId, { quiet, asJson });
}

module.exports = { isMichaelInboxRow, isOrphanedMichaelRow, drainInbox, drainMichaelOutbound };

if (require.main === module) {
  main().catch((e) => { console.error(`[michael-inbox] fatal: ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
