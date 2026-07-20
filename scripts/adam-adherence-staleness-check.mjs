#!/usr/bin/env node
/**
 * adam-adherence-staleness-check.mjs — QF-20260719-997 (chairman-directed 2026-07-19;
 * companion to QF-20260719-196, parent context QF-20260719-825).
 *
 * Judgment-requiring Adam checks (8-dim self-score; solomon-health 5-point check; daily
 * plan-check forward-list snapshot) cannot run headless — but their STALENESS detection
 * can, and staleness IS the failure mode (the self-score lapsed 16 days undetected
 * 2026-07-03→19; forward-list gaps make plan-check slipped=[] read falsely clean).
 *
 * Reads three stamps and, for each overdue one, dispatches ONE directed
 * adam_action_required row through the canonical choke (insertCoordinationRow — never a
 * hand-rolled insert) to the live Adam (getActiveAdamId), falling back to the
 * 'broadcast-adam' sentinel so it QUEUES when no Adam is alive (degraded-mode pattern
 * from the SMS duty). Idempotent: an un-read pending row with the same
 * payload.staleness_key suppresses re-sends (no spam).
 *
 * Stamps (a MISSING stamp counts as overdue — bootstraps the first stamped run):
 *   self-score:      feedback.category='adam_self_assessment' latest created_at, 8h
 *   solomon-health:  feedback.category='adam_solomon_health' latest created_at, 26h
 *                    (stamp convention DEFINED here per the QF — the check tick writes
 *                    one feedback row with this category on completion; the reminder
 *                    body carries the stamping instruction)
 *   plan-check:      adam_task_ledger.source_ref LIKE 'plan-check-forward-list-%'
 *                    latest created_at, 26h
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');

const HOUR = 60 * 60 * 1000;
export const CHECKS = [
  {
    key: 'self-score',
    thresholdMs: 8 * HOUR,
    label: '8-dim rubric self-score (feedback category=adam_self_assessment)',
    remedy: 'run node scripts/adam-self-assessment-writer.cjs (re-run with --force if the flag/cadence gate blocks — chairman-directed cadence outranks ships-inert)',
  },
  {
    key: 'solomon-health',
    thresholdMs: 26 * HOUR,
    label: 'Solomon 5-point health check (stamp: feedback category=adam_solomon_health)',
    remedy: 'run the solomon-health check (heartbeat freshness + consult depth, propose-only) and STAMP completion by inserting one feedback row with category=adam_solomon_health summarizing the verdict',
  },
  {
    key: 'plan-check',
    thresholdMs: 26 * HOUR,
    label: 'daily plan-check forward-list snapshot (adam_task_ledger source_ref plan-check-forward-list-*)',
    remedy: 'run the plan-check and persist the forward list to adam_task_ledger with source_ref plan-check-forward-list-<date> — a missing snapshot makes the next plan-check slipped=[] read falsely clean',
  },
];

async function latestStamp(sb, check) {
  if (check.key === 'plan-check') {
    const { data, error } = await sb
      .from('adam_task_ledger')
      .select('created_at')
      .like('source_ref', 'plan-check-forward-list-%')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`plan-check stamp read failed: ${error.message}`);
    return data && data[0] ? Date.parse(data[0].created_at) : null;
  }
  const category = check.key === 'self-score' ? 'adam_self_assessment' : 'adam_solomon_health';
  const { data, error } = await sb
    .from('feedback')
    .select('created_at')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`${check.key} stamp read failed: ${error.message}`);
  return data && data[0] ? Date.parse(data[0].created_at) : null;
}

async function hasPendingReminder(sb, target, stalenessKey) {
  const { data, error } = await sb
    .from('session_coordination')
    .select('id')
    .eq('target_session', target)
    .eq('payload->>staleness_key', stalenessKey)
    .is('read_at', null)
    .limit(1);
  if (error) return false; // fail-open toward sending (a duplicate beats a silent lapse)
  return Array.isArray(data) && data.length > 0;
}

export async function runStalenessCheck(sb, { nowMs = Date.now(), senderSession = process.env.CLAUDE_SESSION_ID || 'adam-adherence-staleness-cron' } = {}) {
  const results = [];
  let target = null;
  try {
    target = await getActiveAdamId(sb);
  } catch { target = null; }
  if (!target) target = 'broadcast-adam'; // queue for whichever Adam next registers

  for (const check of CHECKS) {
    const r = { key: check.key, overdue: false, sent: false, ageH: null };
    try {
      const last = await latestStamp(sb, check);
      const ageMs = last == null ? Infinity : nowMs - last;
      r.ageH = Number.isFinite(ageMs) ? Math.round(ageMs / HOUR) : null; // null = never stamped
      if (ageMs <= check.thresholdMs) { results.push(r); continue; }
      r.overdue = true;
      const stalenessKey = `adherence-staleness-${check.key}`;
      if (await hasPendingReminder(sb, target, stalenessKey)) { results.push(r); continue; }
      const ageLabel = r.ageH == null ? 'NEVER stamped' : `${r.ageH}h old (threshold ${Math.round(check.thresholdMs / HOUR)}h)`;
      await insertCoordinationRow(sb, {
        sender_session: senderSession,
        target_session: target,
        message_type: 'INFO',
        subject: `Adherence staleness: ${check.key} is overdue (${ageLabel})`,
        payload: {
          kind: 'adam_action_required',
          staleness_key: stalenessKey,
          check: check.key,
          body: `OVERDUE deliberate check — ${check.label}: last stamp ${ageLabel}. ${check.remedy}. (QF-20260719-997 staleness backstop; this row suppresses duplicates until read.)`,
        },
      }, { targetRoleHint: 'adam' });
      r.sent = true;
    } catch (e) {
      r.error = e.message; // per-check fail-soft: one broken stamp read never blocks the others
    }
    results.push(r);
  }
  return { target, results };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const out = await runStalenessCheck(sb);
  console.log(`[adherence-staleness] target=${String(out.target).slice(0, 16)} ` + out.results
    .map((r) => `${r.key}:${r.error ? 'ERR' : r.overdue ? (r.sent ? 'OVERDUE+SENT' : 'OVERDUE(pending-reminder)') : 'fresh'}${r.ageH != null ? `(${r.ageH}h)` : '(never)'}`)
    .join(' '));
  process.exitCode = out.results.some((r) => r.error) ? 1 : 0;
}
