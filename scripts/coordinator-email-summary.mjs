// coordinator-email-summary.mjs — SIMPLE fleet health card via Resend.
//
// ONE gauge (operator's model 2026-06-06): ACTIVE WORKERS vs how many SHOULD be active given the work.
//   workable      = SDs needing a worker (in-progress + queued, non-terminal)
//   expectedActive = min(workable, fleet target)   // can't use more workers than there's work for
//   If active >= expectedActive → every SD that can be worked HAS a worker = full throttle (GREEN).
//   If active <  expectedActive → work is waiting with no builder (YELLOW), or nobody building (RED).
//   (So "3 of 6 active" is FINE when there are only 3 SDs, but a problem when there are 7.)
// DYNAMIC scope (no hardcoded campaign). Shows trend vs the previous email.
// Env: COORD_EMAIL_DRYRUN=1; COORD_TARGET_WORKERS (6); CLAUDE_NOTIFY_EMAIL.
// See memory feedback-coordinator-email-summary-dynamic-scope.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { fetchAgedPendingFlags, renderAgedPendingHtml, renderAgedPendingText } from '../lib/pending-enablement-registry.js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const SNAP = resolve('.coord-email-last.json');
const DRY_RUN = !!process.env.COORD_EMAIL_DRYRUN;
const TARGET_WORKERS = parseInt(process.env.COORD_TARGET_WORKERS || '6', 10);

const TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
const termList = '(' + TERMINAL.join(',') + ')';

// ── all workable SDs (non-terminal) ──
const { data: workRows } = await db.from('strategic_directives_v2')
  .select('sd_key').not('status', 'in', termList);
const workableKeys = (workRows || []).map(r => r.sd_key).filter(Boolean);
const workable = workableKeys.length;

// ── live workers + the SDs they ACTUALLY hold. claude_sessions.sd_key is the reliable build signal;
//    SDv2.claiming_session_id drifts to NULL after a claim-sweep even while the worker keeps building. ──
const { data: sessRaw } = await db.from('claude_sessions').select('session_id,heartbeat_at,sd_key').order('heartbeat_at', { ascending: false }).limit(60);
const live = (sessRaw || []).filter(s => s.session_id !== me && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < 900000);
const builderKeys = new Set(live.filter(s => s.sd_key).map(s => s.sd_key));
const liveWorkers = live.length;
const builders = live.filter(s => s.sd_key).length;

// ── assigned vs remaining, computed from who's ACTUALLY building (not the drifting SDv2 claim flag) ──
const assigned = workableKeys.filter(k => builderKeys.has(k)).length;   // workable SDs held by a live builder
const remaining = Math.max(0, workable - assigned);                    // workable SDs nobody live is building

// ── remaining gauge inputs (assigned / remaining / liveWorkers computed above) ──
const idleWorkers = Math.max(0, liveWorkers - builders);    // live workers with NO claim (includes stalled loops)
const expectedBuilders = Math.min(workable, liveWorkers);   // most that COULD be building right now
const shortBy = Math.max(0, expectedBuilders - builders);   // idle workers that have claimable work to take

// ── RAG — thresholds scale with REMAINING work and how many are ASSIGNED ──
const rank = { red: 1, yellow: 2, green: 3 };
let overall;
if (workable === 0) overall = 'green';                                      // nothing to do
else if (assigned === 0) overall = 'red';                                   // work exists, nobody building
else if (remaining > 0 && idleWorkers > builders) overall = 'red';          // more workers idle than building, while work waits
else if (remaining > 0 && idleWorkers >= 1) overall = 'yellow';             // some idle capacity while work waits
else if (remaining > liveWorkers && idleWorkers === 0) overall = 'yellow';  // team maxed but backlog deeper than the team → add workers
else overall = 'green';                                                     // all available workers on the queue, backlog manageable
const curRank = rank[overall];

// ── trend (vs the previous email) ──
let snap = {};
try { snap = JSON.parse(readFileSync(SNAP, 'utf8')); } catch { snap = {}; }
const lastRank = typeof snap.lastOverallRank === 'number' ? snap.lastOverallRank : curRank;
const trendArrow = curRank > lastRank ? '↑' : curRank < lastRank ? '↓' : '→';
const trendWord = curRank > lastRank ? 'trending better' : curRank < lastRank ? 'trending worse' : 'holding steady';

// ── pending operator questions: worker questions the coordinator could NOT resolve and escalated to the human ──
//    (written as feedback rows category='operator_question' status='new'; cleared to 'resolved' once answered)
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const { data: qRows } = await db.from('feedback')
  .select('title,description,created_at,metadata')
  .eq('category', 'operator_question').eq('status', 'new')
  .order('created_at', { ascending: true }).limit(10);
const questions = qRows || [];
const qN = questions.length;
const qLabel = (q) => {
  const m = q.metadata || {};
  const who = m.worker || (m.sender_session ? String(m.sender_session).slice(0, 8) : 'worker');
  const sd = m.sd_key ? ` on ${m.sd_key}` : '';
  return { text: String(q.description || q.title || '').replace(/\s+/g, ' ').trim(), who, sd };
};

// ── pending-enablement registry: default-OFF rollouts aged past the review threshold ──
//    (SD-LEO-INFRA-POLICY-GATED-AUTO-001A) — fail-open: a registry hiccup must never break the email.
const pending = await fetchAgedPendingFlags(db, { now: t });
const pN = pending.length;
const pendingHtml = renderAgedPendingHtml(pending, { now: t });
const pendingText = renderAgedPendingText(pending, { now: t });

// ── render ──
const dot = { red: '🔴', yellow: '🟡', green: '🟢' }[overall];
const word = { red: 'RED', yellow: 'YELLOW', green: 'GREEN' }[overall];
const meaning = workable === 0 ? 'idle — no open work'
  : assigned === 0 ? `stalled — ${remaining} item${remaining > 1 ? 's' : ''} waiting, nobody building`
  : (remaining > 0 && idleWorkers > builders) ? `${idleWorkers} of ${liveWorkers} workers idle while ${remaining} wait — wake/unblock them`
  : (remaining > 0 && idleWorkers >= 1) ? `${idleWorkers} worker${idleWorkers > 1 ? 's' : ''} idle while ${remaining} wait`
  : (remaining > liveWorkers && idleWorkers === 0) ? `all ${assigned} building, but ${remaining} queued — backlog outpacing the team`
  : (remaining > 0 ? `keeping up — ${assigned} building, ${remaining} queued` : `all work assigned — ${assigned} building`);

const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const gauge = liveWorkers === 0 ? 'no live workers' : `${assigned} building · ${remaining} queued${idleWorkers ? ` · ${idleWorkers} idle` : ''}`;
const qFlag = qN ? `❓${qN} · ` : '';
const pFlag = pN ? `⏳${pN} · ` : '';
const subject = qFlag + pFlag + (workable === 0
  ? `Fleet ${dot} ${word} ${trendArrow} · idle (no work)`
  : `Fleet ${dot} ${word} ${trendArrow} · ${assigned} bld · ${remaining} queued${idleWorkers ? ` · ${idleWorkers} idle` : ''}`);
const qHtml = qN ? `<p style="font-size:15px;margin:0 0 10px;padding:10px 12px;background:#fff8e1;border-left:4px solid #f5a623;border-radius:3px"><b>❓ ${qN} question${qN > 1 ? 's' : ''} need${qN > 1 ? '' : 's'} your input</b><br>${questions.map(q => { const l = qLabel(q); return `• ${esc(l.text)} <span style="color:#999;font-size:13px">— ${esc(l.who)}${esc(l.sd)}</span>`; }).join('<br>')}</p>` : '';
const html = `<p style="font-size:17px;margin:0 0 10px"><b>${dot} ${word}</b> — ${meaning} <span style="color:#777;font-size:14px">(${trendWord} ${trendArrow})</span></p>
${qHtml}${pendingHtml}<p style="font-size:14px;margin:0 0 6px"><b>Active workers:</b> ${gauge}${workable ? ` · ${workable} item${workable > 1 ? 's' : ''} in play` : ''}</p>
<p style="font-size:11px;color:#999;margin:14px 0 0">${when} ET</p>`;
const qText = qN ? `❓ ${qN} question${qN > 1 ? 's' : ''} need${qN > 1 ? '' : 's'} your input:\n${questions.map(q => { const l = qLabel(q); return `  • ${l.text} — ${l.who}${l.sd}`; }).join('\n')}\n\n` : '';
const text = `${dot} ${word} — ${meaning} (${trendWord} ${trendArrow})\n\n${qText}${pendingText}Active workers: ${gauge}${workable ? ` · ${workable} item(s) in play` : ''}\n\n${when} ET`;

if (DRY_RUN) {
  console.log('=== [DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
  console.log(`overall=${overall} assigned=${assigned} idle=${idleWorkers} remaining=${remaining} liveWorkers=${liveWorkers} workable=${workable} builderKeys=${builderKeys.size} shortBy=${shortBy} questions=${qN} pending=${pN}`);
} else {
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Fleet Coordinator <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('EMAIL', JSON.stringify(r));
  try { writeFileSync(SNAP, JSON.stringify({ ts: t, lastOverallRank: curRank })); } catch { /* best effort */ }
}
