#!/usr/bin/env node
/**
 * Drain dead-letter session_coordination inbound — QF-20260721-737.
 * Retarget role-to-role high-value orphans to the live successor; stamp everything else drained.
 * READ-ONLY unless --apply. Paginates past the PostgREST 1000-row cap (count-integrity).
 *
 * Usage: node scripts/drain-dead-letter-coordination.mjs [--apply]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyDeadLetterRow, summarizeDrain } from '../lib/coordination/dead-letter-drain.js';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;
const LIVE_COORDINATOR = process.env.LIVE_COORDINATOR_SESSION || '185c0ecf-5467-4354-a14a-83ce0ceae33c';

async function all(table, cols, filter) {
  let out = [], from = 0;
  for (;;) {
    let q = db.from(table).select(cols).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < PAGE) return out;
    from += PAGE;
  }
}

async function main() {
  const sessions = await all('claude_sessions', 'session_id,status');
  const byId = new Map(sessions.map((s) => [s.session_id, s]));
  const isLive = (sid) => { const s = byId.get(sid); return !!s && (s.status === 'active' || s.status === 'idle'); };
  const successors = { coordinator: LIVE_COORDINATOR }; // solomon/adam resolved only if role-orphans exist (none in the verified set)

  const unacked = await all('session_coordination', 'id,target_session,payload,message_type,subject', (q) => q.is('acknowledged_at', null));
  const dead = unacked.filter((r) => { const t = r.target_session; return !t || !byId.has(t) || !isLive(t); });
  console.log(`unacked=${unacked.length} live-backlog(excluded)=${unacked.length - dead.length} dead-letter=${dead.length}`);

  const classified = dead.map((r) => {
    const kind = (r.payload && r.payload.kind) || r.message_type || '(none)';
    return { id: r.id, kind, target_session: r.target_session, payload: r.payload, ...classifyDeadLetterRow(r, { successors }) };
  });
  const sum = summarizeDrain(classified);
  console.log(`plan: retarget=${sum.retarget} stamp=${sum.stamp}`);
  console.log('by kind (retarget/stamp):');
  for (const [k, v] of Object.entries(sum.byKind).sort((a, b) => (b[1].retarget + b[1].stamp) - (a[1].retarget + a[1].stamp)))
    console.log(`  ${k}: retarget=${v.retarget} stamp=${v.stamp}`);

  if (!APPLY) { console.log('\nDRY-RUN (no writes). Re-run with --apply to execute.'); return; }

  const now = new Date().toISOString();
  let retargeted = 0, stamped = 0;
  for (const c of classified) {
    const p = { ...(c.payload || {}) };
    if (c.action === 'retarget') {
      p.dead_letter_retargeted = { from: c.target_session, to: c.successor, role: c.role, at: now, qf: 'QF-20260721-737' };
      const { error } = await db.from('session_coordination').update({ target_session: c.successor, payload: p }).eq('id', c.id);
      if (error) { console.log(`  retarget ERR ${c.id}: ${error.message}`); continue; }
      retargeted++;
    } else {
      p.dead_letter_drained = { orig_target: c.target_session, reason: c.reason, at: now, qf: 'QF-20260721-737' };
      const { error } = await db.from('session_coordination').update({ acknowledged_at: now, read_at: now, payload: p }).eq('id', c.id);
      if (error) { console.log(`  stamp ERR ${c.id}: ${error.message}`); continue; }
      stamped++;
    }
  }
  console.log(`\nAPPLIED: retargeted=${retargeted} stamped=${stamped}`);

  // count-integrity: re-verify zero unacked high-value dead-letter remains
  const recheck = await all('session_coordination', 'id,target_session,payload,message_type', (q) => q.is('acknowledged_at', null));
  const stillDead = recheck.filter((r) => { const t = r.target_session; return (!t || !byId.has(t) || !isLive(t)); })
    .filter((r) => classifyDeadLetterRow(r, { successors }).action === 'retarget' || ['adam_advisory', 'directive', 'chairman_directive', 'solomon_consult'].includes((r.payload && r.payload.kind) || r.message_type));
  console.log(`post-check: unacked high-value-kind rows still targeting a non-live session = ${stillDead.length} (acceptance: 0)`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
