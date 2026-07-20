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
import { liveFleetWorkers, isFleetWorker } from '../lib/fleet/genuine-worker.mjs';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

enforceCliSendGuard({ scriptName: 'scripts/coordinator-email-summary.mjs', flags: [] });

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const SNAP = resolve('.coord-email-last.json');
const DRY_RUN = !!process.env.COORD_EMAIL_DRYRUN;
const TARGET_WORKERS = parseInt(process.env.COORD_TARGET_WORKERS || '6', 10);

const TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
const termList = '(' + TERMINAL.join(',') + ')';

// ── all CLAIMABLE workable SDs ──
// SD-FDBK-FIX-FIX-COORDINATOR-EMAIL-001 (follow-up to QF-20260607-608): a non-terminal SD only
// "needs a worker" when it is genuinely CLAIMABLE. Exclude sd_type=orchestrator PARENTS (they
// auto-complete on their children — no worker builds them directly) and dependency-BLOCKED
// children (any dependency not yet terminal). Counting those in `remaining` over-stated the
// work-relative RAG (false-RED on a healthy surplus belt with transient parks). The claimable
// predicate is the shared single source (lib/coordinator/claimable-work.cjs) whose dependency
// resolution mirrors coordinator-audit.mjs, so email and audit cannot drift.
const claimMod = await import(pathToFileURL(resolve('lib/coordinator/claimable-work.cjs')).href);
const { isClaimableSd, dependencyKeys } = claimMod.default ?? claimMod;
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 is unbounded
// and every row here is filtered through isClaimableSd below (JS-side dependency logic, not
// expressible as a head-count) — paginate to completion; fail-open to [] mirrors the prior
// destructured-undefined-on-error behavior.
const workRows = await fetchAllPaginated(() => db.from('strategic_directives_v2')
  .select('sd_key,sd_type,dependencies').not('status', 'in', termList)
  .order('sd_key', { ascending: true })) // unique tiebreaker (FR-6)
  .catch(() => []);
// resolve the status of every referenced dependency in one query (mirrors coordinator-audit.mjs).
const depKeys = dependencyKeys(workRows || []);
const depStatus = {};
if (depKeys.length) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: bounded by design — depKeys is
  // the distinct set of /^SD-/ dependency references parsed from the workable-SD set above.
  const { data: depRows } = await db.from('strategic_directives_v2').select('sd_key,status').in('sd_key', depKeys);
  for (const r of (depRows || [])) depStatus[r.sd_key] = r.status;
}
const workableKeys = (workRows || []).filter(s => isClaimableSd(s, depStatus)).map(r => r.sd_key).filter(Boolean);
const workable = workableKeys.length;

// ── live workers + the SDs they ACTUALLY hold. claude_sessions.sd_key is the reliable build signal;
//    SDv2.claiming_session_id drifts to NULL after a claim-sweep even while the worker keeps building. ──
const { data: sessRaw } = await db.from('claude_sessions').select('session_id,heartbeat_at,sd_key,loop_state,status,claimed_at,worktree_path,continuous_sds_completed,metadata').order('heartbeat_at', { ascending: false }).limit(60);
// QF-20260607-608: identify a GENUINE worker the same way fleet-dashboard.cjs does, so the email
// and the dashboard never disagree (the email was showing "9 workers" vs the dashboard's ~6 because
// it counted every session heartbeating <15m regardless of status or whether it ever claimed):
//   1. exclude the coordinator (me), Adam, and any non_fleet role (Adam = metadata.role='adam', non_fleet=true);
//   2. exclude non-live statuses — dashboard QA treats only status in ('active','idle') as a real worker
//      (released/exited/stale are ghosts still warm in the table);
//   3. ghost-filter — only a session that has EVER held a claim (current sd_key, or claimed_at /
//      worktree_path / continuous_sds_completed history) is a worker; drops transient/churning sessions
//      that registered but never claimed.
// SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001: the genuine-worker predicate now lives in
// lib/fleet/genuine-worker.mjs (shared verbatim with coordinator-audit.mjs) so the email
// and the audit can never disagree on the worker count.
const live = liveFleetWorkers(sessRaw, me, t);
const builderKeys = new Set(live.filter(s => s.sd_key).map(s => s.sd_key));
const liveWorkers = live.length;
const builders = live.filter(s => s.sd_key).length;

// ── assigned vs remaining, computed from who's ACTUALLY building (not the drifting SDv2 claim flag) ──
const assigned = workableKeys.filter(k => builderKeys.has(k)).length;   // workable SDs held by a live builder
const remaining = Math.max(0, workable - assigned);                    // workable SDs nobody live is building

// ── remaining gauge inputs (assigned / remaining / liveWorkers computed above) ──
const idleWorkers = Math.max(0, liveWorkers - builders);    // live workers with NO claim
const expectedBuilders = Math.min(workable, liveWorkers);   // most that COULD be building right now
const shortBy = Math.max(0, expectedBuilders - builders);   // idle workers that have claimable work to take

// ── QF-20260607-608: split idle workers into HEALTHY NAP vs PARKED, reusing the shared
//    loop_state constants (scripts/lib/sessions/loop-state-tracker.cjs — single source of truth).
//    awaiting_tick = looping between ticks (a self-sustaining /loop, not a problem).
//    null/unknown/exited after dropping its claim = genuinely PARKED (needs a wake-nudge). ──
const loopMod = await import(pathToFileURL(resolve('scripts/lib/sessions/loop-state-tracker.cjs')).href);
const LOOP_STATE_AWAITING_TICK = (loopMod.default ?? loopMod).LOOP_STATE_AWAITING_TICK;
const idleLive = live.filter(s => !s.sd_key);
const napping = idleLive.filter(s => s.loop_state === LOOP_STATE_AWAITING_TICK).length;  // healthy looping nap
const parked = idleWorkers - napping;                                                    // attention signal

// ── RAG — QF-20260607-608: judged RELATIVE to REMAINING CLAIMABLE work, not an absolute idle %.
//    `remaining` = workable SDs nobody live is building (the claimable backlog). Surplus idle/parked
//    capacity is FINE during a healthy wind-down (queue nearly drained); it's only a problem when
//    significant claimable work is going unworked. Napping (looping) workers are not the attention
//    signal — only genuinely-PARKED capacity is. ──
const WINDDOWN_THRESHOLD = 1;   // remaining claimable work this small ⇒ wind-down, surplus idle is fine
const rank = { red: 1, yellow: 2, green: 3 };
let overall;
if (workable === 0) overall = 'green';                                       // nothing to do
else if (assigned === 0) overall = 'red';                                    // work exists, nobody building
else if (remaining <= WINDDOWN_THRESHOLD) overall = 'green';                 // queue nearly drained — surplus idle is a healthy wind-down
else if (remaining > builders && parked >= 1) overall = 'red';               // significant claimable backlog AND parked workers not on it
else if (remaining > 0 && parked >= 1) overall = 'yellow';                   // moderate backlog with idle capacity to redeploy
else if (remaining > liveWorkers) overall = 'yellow';                        // team maxed but backlog deeper than the team → add workers
else overall = 'green';                                                      // all available capacity on the queue, backlog manageable
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

// ── progress + liveness the operator kept asking about (push it via the email, don't make them query) ──
const { count: completedNow } = await db.from('strategic_directives_v2')
  .select('sd_key', { count: 'exact', head: true }).eq('status', 'completed');
const shippedSince = (typeof snap.completedCount === 'number') ? Math.max(0, (completedNow || 0) - snap.completedCount) : 0;
// QF-20260607-608: a worker the operator PROVISIONED must never silently age out of this email.
//   The old 45-min recentSeen ceiling let a quiet worker vanish with no trace (operator saw a
//   ~45m worker about to disappear). Use a wide window (PROVISIONED_WINDOW, default 8h) so a
//   parked/quiet provisioned worker keeps showing as "incognito" until it's genuinely gone, and
//   report TOTAL provisioned headcount (= live + incognito), not just live.
const PROVISIONED_WINDOW = parseInt(process.env.COORD_PROVISIONED_WINDOW_MIN || '480', 10) * 60000;
const recentSeen = (sessRaw || []).filter(s => isFleetWorker(s, me) && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW);
const incognito = Math.max(0, recentSeen.length - liveWorkers);   // provisioned but quiet >15m = incognito (needs a wake re-paste)
const totalWorkers = liveWorkers + incognito;                     // TRUE provisioned headcount the operator stood up

// ── cost panel (SD-LEO-INFRA-FACTORY-COST-UNIT-001 FR-5) — fail-soft: a cost query
//    failure must NEVER block the fleet email; the panel is simply omitted. ──
let costHtml = '', costText = '';
try {
  // string-literal specifier (not pathToFileURL) so wire-check can statically reach the panel lib
  const { renderCostPanel } = await import('../lib/cost/email-cost-panel.js');
  const panel = await renderCostPanel(db, { sinceTs: typeof snap.ts === 'number' ? snap.ts : null, now: t });
  costHtml = panel.html; costText = panel.text;
} catch (e) {
  console.warn('[coordinator-email] cost panel skipped:', e.message);
}

// ── relay/decision/review drop-gauge panel (SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-
//    DELIVERY-GUARANTEE-001 / FR-3) — this away-mode email is the durable instrument for
//    exactly the failure class confirmed incident #1 was: a relay-request dropped ~2h with
//    nothing surfacing it until the chairman happened to notice. Fail-soft, isolated,
//    never blocks the email. ──
let relayDropHtml = '', relayDropText = '';
try {
  const { planRelayDrops } = await import('../lib/coordinator/relay-drop-gauge.cjs');
  const gauge = await planRelayDrops(db);
  if (gauge.flagged > 0) {
    relayDropHtml = `<p style="font-size:15px;margin:0 0 10px;padding:10px 12px;background:#fdecea;border-left:4px solid #e74c3c;border-radius:3px"><b>⚠️ ${gauge.flagged} relay/decision/review row(s) unactioned past the drop window</b></p>`;
    relayDropText = `⚠️ ${gauge.flagged} relay/decision/review row(s) unactioned past the drop window\n\n`;
  }
} catch (e) {
  console.warn('[coordinator-email] relay-drop-gauge panel skipped:', e.message);
}

// ── render ──
const dot = { red: '🔴', yellow: '🟡', green: '🟢' }[overall];
const word = { red: 'RED', yellow: 'YELLOW', green: 'GREEN' }[overall];
const meaning = workable === 0 ? 'idle — no open work'
  : assigned === 0 ? `stalled — ${remaining} item${remaining > 1 ? 's' : ''} waiting, nobody building`
  : (remaining <= WINDDOWN_THRESHOLD) ? `winding down — ${assigned} building, queue nearly drained`
  : (remaining > builders && parked >= 1) ? `${parked} parked worker${parked > 1 ? 's' : ''} while ${remaining} claimable wait — wake/redeploy them`
  : (remaining > 0 && parked >= 1) ? `${parked} parked worker${parked > 1 ? 's' : ''} idle while ${remaining} wait`
  : (remaining > liveWorkers) ? `all ${assigned} building, but ${remaining} queued — backlog outpacing the team`
  : (remaining > 0 ? `keeping up — ${assigned} building, ${remaining} queued` : `all work assigned — ${assigned} building`);

const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
// QF-20260607-608: lead with TOTAL provisioned headcount (live + incognito), then the live breakdown.
//   napping (healthy loop) is surfaced separately from parked (attention signal).
const headcount = totalWorkers === 0 ? 'no workers provisioned'
  : `${totalWorkers} worker${totalWorkers > 1 ? 's' : ''}: ${liveWorkers} live${incognito ? ` · ${incognito} incognito` : ''}`;
const idleGauge = `${parked ? ` · ${parked} parked` : ''}${napping ? ` · ${napping} napping` : ''}`;
const gauge = totalWorkers === 0 ? 'no workers provisioned' : `${headcount} — ${assigned} building · ${remaining} queued${idleGauge}`;
const flag = (incognito ? '🔔 ' : '') + (qN ? `❓${qN} · ` : '');
const subjHead = totalWorkers > 0 ? ` · ${totalWorkers}w (${liveWorkers}live${incognito ? `/${incognito}incog` : ''})` : '';
const subject = flag + (workable === 0
  ? `Fleet ${dot} ${word} ${trendArrow}${subjHead} · idle (no work)`
  : `Fleet ${dot} ${word} ${trendArrow}${subjHead} · ${assigned} bld · ${remaining} queued${parked ? ` · ${parked} parked` : ''}${napping ? ` · ${napping} napping` : ''}`);
const qHtml = qN ? `<p style="font-size:15px;margin:0 0 10px;padding:10px 12px;background:#fff8e1;border-left:4px solid #f5a623;border-radius:3px"><b>❓ ${qN} question${qN > 1 ? 's' : ''} need${qN > 1 ? '' : 's'} your input</b><br>${questions.map(q => { const l = qLabel(q); return `• ${esc(l.text)} <span style="color:#999;font-size:13px">— ${esc(l.who)}${esc(l.sd)}</span>`; }).join('<br>')}</p>` : '';
const liveHtml = incognito ? `<p style="font-size:14px;margin:0 0 8px;padding:8px 10px;background:#fdecea;border-left:4px solid #d9534f;border-radius:3px"><b>🔔 Needs you:</b> ${incognito} worker${incognito > 1 ? 's' : ''} went incognito — a wake-prompt re-paste (or a relaunch for an orphaned-identity window) refills the fleet.</p>` : '';
const html = `<p style="font-size:17px;margin:0 0 10px"><b>${dot} ${word}</b> — ${meaning} <span style="color:#777;font-size:14px">(${trendWord} ${trendArrow})</span></p>
${qHtml}${liveHtml}${relayDropHtml}<p style="font-size:14px;margin:0 0 6px"><b>Active workers:</b> ${gauge}${workable ? ` · ${workable} item${workable > 1 ? 's' : ''} in play` : ''}</p>
<p style="font-size:13px;color:#777;margin:0 0 6px">📦 Since last email: <b>+${shippedSince}</b> shipped</p>
${costHtml}<p style="font-size:11px;color:#999;margin:14px 0 0">${when} ET</p>`;
const qText = qN ? `❓ ${qN} question${qN > 1 ? 's' : ''} need${qN > 1 ? '' : 's'} your input:\n${questions.map(q => { const l = qLabel(q); return `  • ${l.text} — ${l.who}${l.sd}`; }).join('\n')}\n\n` : '';
const liveText = incognito ? `🔔 Needs you: ${incognito} worker${incognito > 1 ? 's' : ''} went incognito — a wake re-paste/relaunch refills the fleet.\n\n` : '';
const text = `${dot} ${word} — ${meaning} (${trendWord} ${trendArrow})\n\n${qText}${liveText}${relayDropText}Active workers: ${gauge}${workable ? ` · ${workable} item(s) in play` : ''}\nSince last email: +${shippedSince} shipped\n${costText}\n${when} ET`;

// QF-20260609-738: skip-if-unchanged + max-staleness heartbeat. The */30 cron used to
// send EVERY run even when nothing material changed (the chairman is usually away), so the
// inbox filled with identical "all green" mail and a genuine change was easy to miss. Send
// only when a material signal changed vs the LAST SENT email, OR when the last send is older
// than the heartbeat ceiling — so prolonged silence means a dead cron, not a quiet fleet.
// Material signals: overall RAG rank, incognito count, parked count, open-question count, and
// any new ships since last email. Default-on; set COORD_EMAIL_ALWAYS_SEND=1 to restore
// send-every-run. Heartbeat window: COORD_EMAIL_HEARTBEAT_MIN (default 360 = 6h).
const SKIP_UNCHANGED = !process.env.COORD_EMAIL_ALWAYS_SEND;
const HEARTBEAT_MS = parseInt(process.env.COORD_EMAIL_HEARTBEAT_MIN || '360', 10) * 60000;
const prevTs = typeof snap.ts === 'number' ? snap.ts : 0;
const numOr = (v) => (typeof v === 'number' ? v : null);
const materialChanged =
  curRank !== numOr(snap.lastOverallRank) ||
  incognito !== numOr(snap.incognito) ||
  parked !== numOr(snap.parked) ||
  qN !== numOr(snap.qN) ||
  shippedSince > 0;
const staleHeartbeat = !prevTs || (t - prevTs) >= HEARTBEAT_MS;
const shouldSend = !SKIP_UNCHANGED || materialChanged || staleHeartbeat;
const sendReason = !SKIP_UNCHANGED ? 'always-send' : materialChanged ? 'material-change' : staleHeartbeat ? 'heartbeat' : 'unchanged-skip';
// Extended snapshot persists the material signals so the next run can diff against the
// last SENT state (was only {ts,lastOverallRank,completedCount}).
const nextSnap = JSON.stringify({ ts: t, lastOverallRank: curRank, completedCount: completedNow, incognito, parked, qN });

if (DRY_RUN) {
  console.log('=== [DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
  console.log(`shouldSend=${shouldSend} reason=${sendReason} overall=${overall} totalWorkers=${totalWorkers} liveWorkers=${liveWorkers} incognito=${incognito} assigned=${assigned} idle=${idleWorkers} napping=${napping} parked=${parked} remaining=${remaining} workable=${workable} builderKeys=${builderKeys.size} shortBy=${shortBy} questions=${qN} shipped=${shippedSince}`);
} else if (!shouldSend) {
  // Unchanged within the heartbeat window — skip the send and PRESERVE the snapshot so the
  // diff/heartbeat keep measuring against the last actually-sent email.
  console.log(`SKIP_EMAIL unchanged — no material change since last send and within heartbeat window (last send ${prevTs ? Math.round((t - prevTs) / 60000) + 'm ago' : 'never'}).`);
} else {
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Fleet Coordinator <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('EMAIL', JSON.stringify(r), 'reason=' + sendReason);
  try { writeFileSync(SNAP, nextSnap); } catch { /* best effort */ }
}
