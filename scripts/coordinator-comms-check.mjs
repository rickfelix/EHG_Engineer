// coordinator-comms-check.mjs — fleet "radio check" (NASA-style two-way link verification).
//
// Best practice at coordinator startup AND any time you need to TRUST the worker<->coordinator
// channel (e.g. before relying on overnight signal delivery): PROVE both legs, don't assume them.
//   - worker -> coordinator leg: proven when the worker's startup `/signal feedback "online"` is received.
//   - coordinator -> worker leg: this script sends a `comms_check` COACHING ping; the worker reads its
//     inbox and replies `/signal feedback "comms-check ack ..."`. NO ack => the worker loop isn't polling
//     its inbox (a SILENT break) — which is exactly what a radio check is supposed to surface.
//
// Per live worker each run:  ✓ VERIFIED (ack since last ping) · ⏳ AWAITING (ping sent, give it a loop) ·
//   ⚠ NO-ACK (ping older than ACK_TIMEOUT, unacked — fix the worker prompt). (Re)sends a ping where needed.
//
// Env: COMMS_CHECK_TARGET (one session_id prefix), COMMS_CHECK_ACK_TIMEOUT_MIN (default 12),
//      COMMS_CHECK_LIVE_MIN (worker heartbeat freshness, default 10).
// See docs/protocol/fleet-coordinator-and-worker-behavior.md ("Comms check").

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
// SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001: route coordinator dispatch through
// the validated guard (refuses non-full-UUID / dead targets before insert).
const { insertCoordinationRow } = createRequire(import.meta.url)('../lib/coordinator/dispatch.cjs');

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const ACK_TIMEOUT = parseInt(process.env.COMMS_CHECK_ACK_TIMEOUT_MIN || '12', 10) * 60000;
const LIVE = parseInt(process.env.COMMS_CHECK_LIVE_MIN || '10', 10) * 60000;
const TARGET = process.env.COMMS_CHECK_TARGET || null;
const ACK_RE = /comms.?check ack|read you/i;

(async () => {
  if (!me) { console.log('[COMMS-CHECK] no CLAUDE_SESSION_ID — cannot identify coordinator'); return; }
  const since = new Date(t - LIVE).toISOString();
  const { data: liveRows } = await db.from('claude_sessions').select('session_id,sd_key,heartbeat_at,metadata').gte('heartbeat_at', since);
  let workers = (liveRows || []).filter(w => !(w.metadata || {}).is_coordinator && w.session_id !== me);
  if (TARGET) workers = workers.filter(w => String(w.session_id).startsWith(TARGET));
  if (!workers.length) { console.log('[COMMS-CHECK] no live workers to check'); return; }

  console.log('[COMMS-CHECK] radio check — ' + workers.length + ' live worker(s):');
  for (const w of workers) {
    const wid = w.session_id;
    const { data: acks } = await db.from('session_coordination')
      .select('payload,created_at').eq('target_session', me).eq('sender_session', wid)
      .gte('created_at', new Date(t - 30 * 60000).toISOString()).order('created_at', { ascending: false }).limit(10);
    const ack = (acks || []).find(a => ACK_RE.test(String((a.payload || {}).body || (a.payload || {}).message || '')));
    const { data: pings } = await db.from('session_coordination')
      .select('id,created_at,read_at,payload').eq('sender_session', me).eq('target_session', wid)
      .order('created_at', { ascending: false }).limit(10);
    const lastPing = (pings || []).find(p => (p.payload || {}).kind === 'comms_check');
    const cs = w.sd_key ? w.sd_key.slice(0, 22) : 'idle';

    if (ack && (!lastPing || new Date(ack.created_at) >= new Date(lastPing.created_at))) {
      console.log('  ✓ VERIFIED ' + String(wid).slice(0, 8) + '  (' + cs + ')  two-way link good'); continue;
    }
    if (lastPing && (t - new Date(lastPing.created_at).getTime()) < ACK_TIMEOUT) {
      const age = Math.round((t - new Date(lastPing.created_at).getTime()) / 60000);
      console.log('  ⏳ AWAITING ' + String(wid).slice(0, 8) + '  (' + cs + ')  ping ' + age + 'm ago, read=' + (lastPing.read_at ? 'yes' : 'no') + ' — give it a loop iteration'); continue;
    }
    if (lastPing) {
      const age = Math.round((t - new Date(lastPing.created_at).getTime()) / 60000);
      console.log('  ⚠ NO-ACK   ' + String(wid).slice(0, 8) + '  (' + cs + ')  ping ' + age + 'm unacked' + (lastPing.read_at ? ' (read, no reply)' : ' (never read → worker not polling inbox)') + ' — re-send + fix prompt');
    }
    const body = '📡 COMMS CHECK (radio check) from coordinator ' + String(me).slice(0, 8) + '. Confirm the two-way link: reply ONCE with  /signal feedback "comms-check ack — read you"  then continue your work. One-line ack only.';
    await insertCoordinationRow(db, { sender_session: me, target_session: wid, message_type: 'COACHING', subject: 'COMMS CHECK', payload: { body, kind: 'comms_check', sent_at: new Date().toISOString() }, created_at: new Date().toISOString() });
    if (!lastPing) console.log('  📨 SENT     ' + String(wid).slice(0, 8) + '  (' + cs + ')  comms-check ping — awaiting ack');
  }
  console.log('[ACTION] ✓=link good · ⏳=wait a tick · ⚠=worker not reading inbox (add an inbox-poll + ack step to its loop prompt).');
})();
