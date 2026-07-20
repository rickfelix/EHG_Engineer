#!/usr/bin/env node
/**
 * solomon-forecast-trigger-check.mjs — QF-20260719-148 (Solomon L2, advisory 94204a87;
 * chairman-directed session-survival requirement 2026-07-19; companion to QF-072's L1
 * registry entries and the same shape as Adam's QF-997 checker).
 *
 * The JUDGMENT halves of Solomon's forecast duties stay with a live Solomon; the
 * TRIGGERS never sleep. Daily mode evaluates the re-issue triggers with exact counts
 * against the LAST-ISSUED FORECAST BASIS (convention defined here: one feedback row,
 * category='solomon_forecast_basis', metadata { velocity_per_day, open_scope_count } —
 * Solomon stamps one whenever he issues a forecast). --weekly mode emits the
 * Monday-budget-line reminder (per-ISO-week dedupe).
 *
 * On fire: ONE typed row (kind='solomon_duty_reminder', payload.duty discriminator —
 * registered in the solomon drain set + SOLOMON_INBOX_KINDS) via the canonical
 * insertCoordinationRow choke, targeting the live role=solomon session or the
 * 'broadcast-solomon' sentinel (owed-state: a dead Solomon means the row WAITS for the
 * successor — nothing rides memory). Idempotent: an unread row with the same
 * payload.staleness_key suppresses re-sends. NO basis stamped yet → honest NO_BASIS
 * inertness (a trigger cannot fire against nothing; the weekly reminder carries the
 * stamping instruction).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');

const DAY = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['draft', 'in_progress', 'active', 'pending_approval'];
export const VELOCITY_DELTA = 0.15;
export const SCOPE_DELTA = 0.10;

async function resolveTarget(sb) {
  try { const id = await getActiveSolomonId(sb); if (id) return id; } catch { /* fall through */ }
  return 'broadcast-solomon';
}

async function sendOnce(sb, target, { duty, stalenessKey, subject, body }) {
  const { data } = await sb.from('session_coordination').select('id')
    .eq('target_session', target).eq('payload->>staleness_key', stalenessKey).is('read_at', null).limit(1);
  if (Array.isArray(data) && data.length) return false; // unread reminder pending — no spam
  await insertCoordinationRow(sb, {
    sender_session: process.env.CLAUDE_SESSION_ID || 'solomon-duty-triggers-cron',
    target_session: target,
    message_type: 'INFO',
    subject,
    payload: { kind: 'solomon_duty_reminder', duty, staleness_key: stalenessKey, body },
  }, { targetRoleHint: 'solomon' });
  return true;
}

export async function runDailyTriggers(sb, { nowMs = Date.now() } = {}) {
  const { data: basisRows, error } = await sb.from('feedback')
    .select('created_at, metadata').eq('category', 'solomon_forecast_basis')
    .order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error(`basis read failed: ${error.message}`);
  const basis = basisRows && basisRows[0];
  if (!basis) return { status: 'NO_BASIS' }; // honest inertness — nothing to compare against

  const m = basis.metadata || {};
  const since = new Date(nowMs - 7 * DAY).toISOString();
  const { count: completed7d } = await sb.from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('completion_date', since);
  const { count: openScope } = await sb.from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES);

  const liveVelocity = (completed7d || 0) / 7;
  const fired = [];
  if (Number(m.velocity_per_day) > 0 && Math.abs(liveVelocity - m.velocity_per_day) / m.velocity_per_day > VELOCITY_DELTA) {
    fired.push(`velocity ${m.velocity_per_day}/d -> ${liveVelocity.toFixed(1)}/d`);
  }
  if (Number(m.open_scope_count) > 0 && Math.abs((openScope || 0) - m.open_scope_count) / m.open_scope_count > SCOPE_DELTA) {
    fired.push(`scope ${m.open_scope_count} -> ${openScope}`);
  }
  if (!fired.length) return { status: 'clean', liveVelocity, openScope };

  const target = await resolveTarget(sb);
  // One episode per basis: keyed on the basis timestamp so a re-check of the SAME drift
  // never re-sends, while a fresh basis (re-issued forecast) re-arms the trigger.
  const sent = await sendOnce(sb, target, {
    duty: 'forecast_reissue',
    stalenessKey: `forecast-reissue-${basis.created_at}`,
    subject: `Forecast re-issue trigger fired: ${fired.join('; ')}`,
    body: `Re-issue trigger(s) vs basis ${basis.created_at}: ${fired.join('; ')} (thresholds ${VELOCITY_DELTA * 100}% velocity / ${SCOPE_DELTA * 100}% scope). Re-issue the per-wave forecast naming the trigger, and stamp a fresh basis row (feedback category=solomon_forecast_basis, metadata {velocity_per_day, open_scope_count}). QF-20260719-148 L2 trigger — judgment stays with you.`,
  });
  return { status: 'FIRED', fired, sent, target };
}

export async function runWeeklyReminder(sb, { nowMs = Date.now() } = {}) {
  const week = (() => { const d = new Date(nowMs); const o = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${String(Math.ceil(((d - o) / DAY + o.getDay() + 1) / 7)).padStart(2, '0')}`; })();
  const target = await resolveTarget(sb);
  const sent = await sendOnce(sb, target, {
    duty: 'weekly_budget_line',
    stalenessKey: `weekly-budget-line-${week}`,
    subject: `Monday budget reset: weekly program duties due (${week})`,
    body: `Monday reset reminder (${week}): send the P3 budget line to Adam, set the standing program, run the accuracy review + autonomy-report rollup, P4 Fable-terms re-check, and stamp a fresh forecast basis (feedback category=solomon_forecast_basis) if you re-issue. Owed-state row — if you are a successor Solomon reading this, the duty transferred with it. QF-20260719-148 L2.`,
  });
  return { status: sent ? 'SENT' : 'pending-reminder', week, target };
}

const isMain = process.argv[1] && import.meta.url.replace(/\\/g, '/').endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const out = process.argv.includes('--weekly') ? await runWeeklyReminder(sb) : await runDailyTriggers(sb);
  console.log(`[solomon-duty-triggers] ${JSON.stringify(out)}`);
}
