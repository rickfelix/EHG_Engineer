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
import { classifyDeadLetterRow, summarizeDrain, HIGH_VALUE_KINDS, isSessionLive } from '../lib/coordination/dead-letter-drain.js';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, third site).
const { PROMOTION_ACK_KEY } = require_('../lib/coordinator/promotion-ack.cjs');
// SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1b: resolve successors from LIVE role identity,
// for every role KIND_TARGET_ROLE can name — not a coordinator-only map with a hardcoded UUID.
const { getActiveCoordinatorId } = require_('../lib/coordinator/resolve.cjs');
const { getActiveAdamId } = require_('../lib/coordinator/adam-identity.cjs');
const { getActiveSolomonId } = require_('../lib/coordinator/solomon-identity.cjs');

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

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
  // FR-1c: liveness by HEARTBEAT RECENCY. The previous oracle was status IN ('active','idle'),
  // and status/is_alive were measured wrong in BOTH directions — the dominant dead target held
  // 91.6% of the backlog while reporting status='active'/is_alive=true with a 45h-stale heartbeat,
  // so the drain skipped nine-tenths of its own problem as "live backlog". Selecting the heartbeat
  // columns is load-bearing: a column you never SELECT reads as undefined, which this oracle
  // fails closed on, so an omission here would silently mark the whole fleet dead.
  const sessions = await all('claude_sessions', 'session_id,status,heartbeat_at,last_tool_at');
  const byId = new Map(sessions.map((s) => [s.session_id, s]));
  const nowMs = Date.now();
  const isLive = (sid) => isSessionLive(byId.get(sid), { nowMs });

  // FR-1b: resolve EVERY role KIND_TARGET_ROLE can name, from live identity. The prior map was
  // coordinator-only with a hardcoded fallback ('185c0ecf...') that was itself released on
  // 2026-07-25 with a 13.4-day-stale heartbeat — and because LIVE_COORDINATOR_SESSION is unset in
  // practice, that dead id was the LIVE path, so retargets moved rows to a two-week-dead session
  // and instantly re-created the dead-letter they were meant to fix. A role with no live holder
  // now resolves to undefined, which classifyDeadLetterRow already treats as "no successor ->
  // stamp" — no retarget to a corpse, and no invented fallback.
  const successors = {};
  for (const [role, resolve] of [
    ['coordinator', getActiveCoordinatorId],
    ['adam', getActiveAdamId],
    ['solomon', getActiveSolomonId]
  ]) {
    try {
      const id = await resolve(db);
      if (id && isLive(id)) successors[role] = id;
      else if (id) console.log(`  WARN ${role} resolver returned ${id} but its heartbeat is stale — treating as no successor`);
    } catch (e) {
      console.log(`  WARN ${role} identity unresolved (${e.message}) — no successor for this role`);
    }
  }
  console.log(`live successors: ${Object.keys(successors).length ? Object.entries(successors).map(([r, s]) => `${r}=${String(s).slice(0, 8)}`).join(' ') : '(none)'}`);

  // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, THIRD site) — and the worst of the three.
  //
  // The STUCK-drain and the TTL convergence pass both stamp acknowledged_at; this one stamps
  // acknowledged_at AND read_at together, so a single write blinds four surfaces at once: the
  // coordinator inbox, the sender's outstanding view, isRouterSwallowed (which requires
  // !read_at), and REPLY_STARVATION — the last because no auto_acked marker is written either,
  // so isGenuinelyAcknowledged reads it as a HUMAN answer rather than a machine stamp.
  //
  // Newly reachable BECAUSE of this SD: pre-fix, promoted rows carried acknowledged_at and never
  // entered this selector at all. Measured during review, the real 9 promoted rows classify
  // 9/9 as action='stamp' here. It is manual-only and dry-run by default, which is why it is not
  // the emergency the STUCK-drain was — but "requires a human to run it" is not a guard.
  const unacked = await all('session_coordination', 'id,target_session,payload,message_type,subject', (q) => q
    .is('acknowledged_at', null)
    .is(`payload->>${PROMOTION_ACK_KEY}`, null));
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
      // SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1(a): stamp acknowledged_at ALONE, and mark
      // the stamp as machine-authored. The prior write set read_at in the same patch and wrote no
      // auto_acked marker, which blinded four surfaces at once (coordinator inbox, sender
      // outstanding view, isRouterSwallowed which requires !read_at, and REPLY_STARVATION — that
      // last because isGenuinelyAcknowledged read an unmarked stamp as a HUMAN answer). Harmless
      // while this stayed manual and dry-run by default; this SD puts it on a cron, which is what
      // makes it load-bearing. auto_acked mirrors the retention convergeAckTTL convention.
      p.auto_acked = true;
      const { error } = await db.from('session_coordination').update({ acknowledged_at: now, payload: p }).eq('id', c.id);
      if (error) { console.log(`  stamp ERR ${c.id}: ${error.message}`); continue; }
      stamped++;
    }
  }
  console.log(`\nAPPLIED: retargeted=${retargeted} stamped=${stamped}`);

  // count-integrity: re-verify zero unacked high-value dead-letter remains
  const recheck = await all('session_coordination', 'id,target_session,payload,message_type', (q) => q.is('acknowledged_at', null));
  const stillDead = recheck.filter((r) => { const t = r.target_session; return (!t || !byId.has(t) || !isLive(t)); })
    .filter((r) => classifyDeadLetterRow(r, { successors }).action === 'retarget' || HIGH_VALUE_KINDS.includes((r.payload && r.payload.kind) || r.message_type));
  console.log(`post-check: unacked high-value-kind rows still targeting a non-live session = ${stillDead.length} (acceptance: 0)`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
