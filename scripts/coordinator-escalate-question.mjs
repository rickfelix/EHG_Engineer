// coordinator-escalate-question.mjs — escalate a worker question the coordinator could NOT resolve
// itself UP TO THE OPERATOR. Design goal: ZERO babysitting — workers never call AskUserQuestion (it
// hangs their /loop); they /signal the coordinator, which answers, or — for the rare genuinely-human
// question — escalates here.
//
// CHANNEL (operator's model 2026-06-06): escalation rides along in the 15-minute EXECUTIVE EMAIL the
// operator already watches (one channel, less noise), NOT a separate email. This script writes a
// durable feedback row (category='operator_question', status='new'); coordinator-email-summary.mjs
// surfaces all open ones (with a ❓N flag in the subject). When the operator answers, the coordinator
// replies to the worker AND marks the row status='resolved'.
//
// Env: COORD_ESCALATE_QUESTION (required), COORD_ESCALATE_WORKER, COORD_ESCALATE_SD,
//      COORD_ESCALATE_SESSION (worker session_id), COORD_ESCALATE_URGENT=1 (also send an immediate email).
//      COORD_ESCALATE_RECOMMENDED (the coordinator's recommended default option — enables the
//        pending-question timer to auto-proceed if the operator is away; SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001),
//      COORD_ESCALATE_CATEGORY (question category, e.g. budget_exceed/security_concern — a CRITICAL
//        category hard-waits and is NEVER auto-proceeded).
// See memory feedback-worker-never-askuserquestion-route-via-coordinator + docs/protocol/fleet-coordinator-and-worker-behavior.md.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const worker = process.env.COORD_ESCALATE_WORKER || 'a worker';
const sd = process.env.COORD_ESCALATE_SD || '';
const session = process.env.COORD_ESCALATE_SESSION || '';
const q = process.env.COORD_ESCALATE_QUESTION;
// SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001: persist the coordinator's recommended default + the
// question category so the pending-question timer (stale-session-sweep tick) can auto-proceed a stale,
// non-critical, unanswered question on the recommendation (and hard-wait critical ones).
const recommended = (process.env.COORD_ESCALATE_RECOMMENDED || '').trim() || null;
const questionCategory = (process.env.COORD_ESCALATE_CATEGORY || '').trim() || null;
if (!q) { console.log('NO_QUESTION — set COORD_ESCALATE_QUESTION'); process.exit(0); }

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── dedup: don't re-escalate an identical still-open question (workers may retry the signal) ──
const { data: dup } = await db.from('feedback')
  .select('id').eq('category', 'operator_question').eq('status', 'new').eq('description', q).limit(1);
if (dup && dup.length) {
  console.log('ALREADY_OPEN id=' + dup[0].id + ' — surfaced in the next executive email');
} else {
  const { data, error } = await db.from('feedback').insert({
    type: 'issue', source_application: 'EHG_Engineer', source_type: 'auto_capture',
    category: 'operator_question', status: 'new', severity: 'medium',
    title: 'Worker question — ' + worker, description: q,
    metadata: { worker, sd_key: sd || null, sender_session: session || null, escalated_at: new Date().toISOString(), recommended_option: recommended, question_category: questionCategory }
  }).select('id');
  if (error) { console.log('ESCALATE_ERR ' + error.message); process.exit(1); }
  console.log('ESCALATED id=' + (data && data[0] && data[0].id) + ' — will appear (❓) in the next executive email');
}

// ── optional: ALSO fire an immediate email for a genuinely time-sensitive question ──
if (process.env.COORD_ESCALATE_URGENT) {
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  const subject = 'Fleet ❓ URGENT worker question' + (sd ? ' — ' + sd : '');
  const html = `<p style="font-size:15px;margin:0 0 10px"><b>A fleet worker is blocked on a question the coordinator could not resolve.</b></p>
<p style="font-size:14px;margin:0 0 6px"><b>Worker:</b> ${worker}${sd ? ` &nbsp;·&nbsp; <b>SD:</b> ${sd}` : ''}</p>
<p style="font-size:14px;margin:0 0 6px"><b>Question:</b> ${q}</p>
<p style="font-size:12px;color:#888;margin:12px 0 0">Reply to the coordinator session with your answer and it will route it back to the worker. ${when} ET</p>`;
  const text = `A fleet worker is blocked on a question the coordinator could not resolve.\n\nWorker: ${worker}${sd ? `\nSD: ${sd}` : ''}\nQuestion: ${q}\n\nReply to the coordinator with your answer; it routes back to the worker.\n${when} ET`;
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Fleet Coordinator <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('ESCALATION_EMAIL', JSON.stringify(r));
}
