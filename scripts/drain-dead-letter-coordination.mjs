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
import { classifyDeadLetterRow, summarizeDrain, HIGH_VALUE_KINDS, isSessionLive, buildStampPatch } from '../lib/coordination/dead-letter-drain.js';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, third site).
// KEPT IN THE DIRECT createRequire(...)(...) FORM ON PURPOSE. tests/unit/coordinator/
// promotion-ack-guards.test.js asserts this exact binding shape to prove PROMOTION_ACK_KEY comes
// from the real module and is not another export ALIASED into that name. Hoisting the require
// through the `require_` helper below (which this SD briefly did) is semantically identical and
// still broke that guard — correctly, because the guard cannot see through an indirection to
// confirm what it is checking. Do not "tidy" this into require_(...); the strictness is the point.
const { PROMOTION_ACK_KEY } = createRequire(import.meta.url)('../lib/coordinator/promotion-ack.cjs');
// SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1b: resolve successors from LIVE role identity,
// for every role KIND_TARGET_ROLE can name — not a coordinator-only map with a hardcoded UUID.
const { getActiveCoordinatorId } = require_('../lib/coordinator/resolve.cjs');
const { getActiveAdamId } = require_('../lib/coordinator/adam-identity.cjs');
const { getActiveSolomonId } = require_('../lib/coordinator/solomon-identity.cjs');

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

/**
 * Paginated fetch. `orderBy` is REQUIRED and must be a stable, unique column.
 *
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1e (adversarial security review finding).
 * This previously paginated with .range() and NO .order(). Unordered LIMIT/OFFSET has no row-order
 * guarantee, and claude_sessions carries ~13,000 rows fetched over ~14 pages while heartbeat
 * UPDATEs continuously rewrite them — so a row can shift across a page boundary and be dropped
 * from the result entirely. The sessions most likely to move are the LIVE, actively-heartbeating
 * ones, which are exactly the ones whose mail must never be redirected.
 *
 * The consequence was worse than a miscount: a dropped session fails the `byId.has(t)` test below
 * and is judged dead WITHOUT the heartbeat threshold ever being consulted — so the careful
 * liveness oracle FR-1c added would be bypassed silently, by an absence rather than a verdict.
 * Harmless while this was a hand-run dry-run tool; this SD puts it on an unattended hourly cron
 * and lets it redirect mail, which is what makes an ordering guarantee load-bearing.
 *
 * The STEP 0 snapshot script already got this right and wrote down why
 * (scripts/one-off/snapshot-dead-letter-population-lane-drain-001.mjs) — this brings the drain
 * into line with it and with lib/coordinator/resolve.cjs:195.
 */
async function all(table, cols, filter, orderBy) {
  if (!orderBy) throw new Error(`all(${table}): orderBy is required — unordered .range() pagination silently drops rows`);
  let out = [], from = 0;
  for (;;) {
    let q = db.from(table).select(cols).order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
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
  const sessions = await all('claude_sessions', 'session_id,status,heartbeat_at,last_tool_at', null, 'session_id');
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

  // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, THIRD site).
  //
  // HISTORY, kept because the reasoning is load-bearing and the fix is easy to undo by accident.
  // This drain USED TO stamp acknowledged_at AND read_at together, blinding four surfaces in one
  // write: the coordinator inbox, the sender's outstanding view, isRouterSwallowed (which requires
  // !read_at), and REPLY_STARVATION (isGenuinelyAcknowledged read an unmarked stamp as a HUMAN
  // answer). SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 removed that in two steps: FR-1a dropped
  // read_at, and FR-1d dropped acknowledged_at as well — see the stamp branch below for why
  // dropping read_at alone was not enough.
  //
  // Newly reachable BECAUSE of this SD: pre-fix, promoted rows carried acknowledged_at and never
  // entered this selector at all. Measured during review, the real 9 promoted rows classify
  // 9/9 as action='stamp' here. It is manual-only and dry-run by default, which is why it was not
  // the emergency the STUCK-drain was — but "requires a human to run it" is not a guard, and this
  // SD exists to put it on a cron, at which point every one of these properties becomes load-bearing.
  const unacked = await all('session_coordination', 'id,target_session,payload,message_type,subject', (q) => q
    .is('acknowledged_at', null)
    .is(`payload->>${PROMOTION_ACK_KEY}`, null), 'id');
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
      // SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1d: the stamp writes NO timestamp column.
      // FR-1a removed read_at from this patch because setting both blinded four surfaces at once —
      // correct, but it kept the arm with NO grace. acknowledged_at arms
      // cleanup_expired_coordination() INSTANTLY, and ~96% of these rows already have expires_at in
      // the past, so the "remedy" deleted the row on the next 5-minute tick. Fixing the liveness
      // oracle then grew the visible population and took that from ~589 rows to ~3,010.
      // The drain's job is to record that it CONSIDERED a row and found it moot — not to delete it.
      // Retention already owns the lifecycle (and the dead-letter PLANNING pass owns the read_at
      // clock), so disposition goes in the payload and the row dies on the schedule it already had.
      const { error } = await db.from('session_coordination')
        .update(buildStampPatch({ ...c, payload: p }, { nowMs: Date.parse(now), reason: c.reason }))
        .eq('id', c.id);
      if (error) { console.log(`  stamp ERR ${c.id}: ${error.message}`); continue; }
      stamped++;
    }
  }
  console.log(`\nAPPLIED: retargeted=${retargeted} stamped=${stamped}`);

  // count-integrity: re-verify zero unacked high-value dead-letter remains
  const recheck = await all('session_coordination', 'id,target_session,payload,message_type', (q) => q.is('acknowledged_at', null), 'id');
  const stillDead = recheck.filter((r) => { const t = r.target_session; return (!t || !byId.has(t) || !isLive(t)); })
    .filter((r) => classifyDeadLetterRow(r, { successors }).action === 'retarget' || HIGH_VALUE_KINDS.includes((r.payload && r.payload.kind) || r.message_type));
  console.log(`post-check: unacked high-value-kind rows still targeting a non-live session = ${stillDead.length} (acceptance: 0)`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
