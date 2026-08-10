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
 * weekly budget-line reminder (per-ISO-week dedupe), fired at the currently-active
 * account's reset epoch (QF-20260720-111 — was hardcoded Monday, now Thursday to match
 * Deep Soul Sessions' actual weekly reset; account-named in the reminder so a future
 * account rotation surfaces as a visible mismatch rather than silent drift).
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
const { getAccountIdentity } = require('../lib/fleet/account-identity.cjs');

// QF-20260720-111: the weekly cron fires on the CURRENTLY-ACTIVE account's known reset day
// (Thu = Deep Soul Sessions today) — but per-account rotation means that anchor drifts
// silently if the active account changes. Naming the resolved account in the reminder
// makes a stale anchor visible instead of silent. Keyed by email (the only reliably-known
// identifier for all three rotation accounts — their accountUuid8 values are not all
// independently verified here); codestreetlabs' reset day is not yet confirmed, so it is
// deliberately absent from this map rather than guessed.
export const KNOWN_RESET_DAYS = {
  'deepsoulsessionslabel@gmail.com': 'Thursday (~3:59 AM ET)',
  'rickfelix2000@gmail.com': 'Friday (~6:59 AM ET)',
};

const DAY = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['draft', 'in_progress', 'active', 'pending_approval'];
export const VELOCITY_DELTA = 0.15;
export const SCOPE_DELTA = 0.10;

/**
 * QF-20260809-138: same-series-by-construction. The basis row embeds its own series definition
 * (metadata.scope_series_query, v17+, e.g. "strategic_directives_v2 count where status NOT IN
 * (completed,cancelled)") precisely for this consumption. Counting the live scope with the
 * hardcoded narrow OPEN_STATUSES compared 35 (draft+active+pending_approval) against a canonical
 * 59 on 2026-08-09 — a daily false-fire whose ack-and-skip consumer nearly ate a genuine +20.4%
 * canonical fire the same day. Parse the exclusion set out of the basis's own query:
 *   null      -> field absent (pre-v17 basis): caller falls back to OPEN_STATUSES
 *   undefined -> field present but unparseable: caller must SKIP the scope comparison
 *                (a cross-series compare is the defect; an explicit skip is honest)
 *   string[]  -> statuses to exclude via NOT IN (same series as the basis count)
 */
export function scopeExclusionsFromSeriesQuery(q) {
  if (typeof q !== 'string' || !q.trim()) return null;
  const m = /NOT\s+IN\s*\(([^)]+)\)/i.exec(q);
  if (!m) return undefined;
  const list = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return list.length ? list : undefined;
}

async function resolveTarget(sb) {
  try { const id = await getActiveSolomonId(sb); if (id) return id; } catch { /* fall through */ }
  return 'broadcast-solomon';
}

async function sendOnce(sb, target, { duty, stalenessKey, subject, body }, sendRow = insertCoordinationRow) {
  const { data } = await sb.from('session_coordination').select('id')
    .eq('target_session', target).eq('payload->>staleness_key', stalenessKey).is('read_at', null).limit(1);
  if (Array.isArray(data) && data.length) return false; // unread reminder pending — no spam
  await sendRow(sb, {
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

  // QF-20260809-138: derive the live scope from the basis row's OWN series definition so fires
  // and no-fires are same-series by construction; OPEN_STATUSES survives only as the pre-v17
  // fallback for basis rows that predate the embedded query.
  const exclusions = scopeExclusionsFromSeriesQuery(m.scope_series_query);
  let openScope = null;
  let scopeSeries;
  if (exclusions === null) {
    scopeSeries = 'narrow_fallback_pre_v17';
    ({ count: openScope } = await sb.from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES));
  } else if (exclusions === undefined) {
    scopeSeries = 'unparseable_query_scope_skipped';
  } else {
    scopeSeries = 'basis_canonical';
    ({ count: openScope } = await sb.from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true }).not('status', 'in', `(${exclusions.join(',')})`));
  }

  const liveVelocity = (completed7d || 0) / 7;
  const fired = [];
  if (Number(m.velocity_per_day) > 0 && Math.abs(liveVelocity - m.velocity_per_day) / m.velocity_per_day > VELOCITY_DELTA) {
    fired.push(`velocity ${m.velocity_per_day}/d -> ${liveVelocity.toFixed(1)}/d`);
  }
  if (openScope !== null && Number(m.open_scope_count) > 0 && Math.abs((openScope || 0) - m.open_scope_count) / m.open_scope_count > SCOPE_DELTA) {
    fired.push(`scope ${m.open_scope_count} -> ${openScope} (${scopeSeries})`);
  }
  if (!fired.length) return { status: 'clean', liveVelocity, openScope, scopeSeries };

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

export async function runWeeklyReminder(sb, { nowMs = Date.now(), resolveIdentity = getAccountIdentity, sendRow = insertCoordinationRow } = {}) {
  const week = (() => { const d = new Date(nowMs); const o = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${String(Math.ceil(((d - o) / DAY + o.getDay() + 1) / 7)).padStart(2, '0')}`; })();
  const target = await resolveTarget(sb);
  // QF-20260720-111: name the account this epoch is anchored to, so a rotation away from
  // the assumed account (this cron's Thursday firing day) surfaces as a visible mismatch
  // rather than a silent day-of-week drift.
  const identity = resolveIdentity();
  const acctNote = identity
    ? (KNOWN_RESET_DAYS[identity.email]
        ? `active account ${identity.email} (reset ${KNOWN_RESET_DAYS[identity.email]})`
        : `active account ${identity.email} (reset day NOT in KNOWN_RESET_DAYS — verify this firing day still matches)`)
    : 'active account identity unresolved — verify this firing day still matches the active account\'s reset';
  const sent = await sendOnce(sb, target, {
    duty: 'weekly_budget_line',
    stalenessKey: `weekly-budget-line-${week}`,
    subject: `Weekly budget reset: duties due (${week}, ${acctNote})`,
    body: `Weekly reset reminder (${week}, ${acctNote}): send the P3 budget line to Adam, set the standing program, run the accuracy review + autonomy-report rollup, P4 Fable-terms re-check, and stamp a fresh forecast basis (feedback category=solomon_forecast_basis) if you re-issue. Owed-state row — if you are a successor Solomon reading this, the duty transferred with it. QF-20260719-148 L2 / QF-20260720-111 (account-aware epoch).`,
  }, sendRow);
  return { status: sent ? 'SENT' : 'pending-reminder', week, target };
}

const isMain = process.argv[1] && import.meta.url.replace(/\\/g, '/').endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const out = process.argv.includes('--weekly') ? await runWeeklyReminder(sb) : await runDailyTriggers(sb);
  console.log(`[solomon-duty-triggers] ${JSON.stringify(out)}`);
}
