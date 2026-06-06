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

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const SNAP = resolve('.coord-email-last.json');
const DRY_RUN = !!process.env.COORD_EMAIL_DRYRUN;
const TARGET_WORKERS = parseInt(process.env.COORD_TARGET_WORKERS || '6', 10);

const TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
const termList = '(' + TERMINAL.join(',') + ')';

// ── workable demand: SDs needing a worker (claimed in-progress + queued unclaimed, non-terminal) ──
const { data: inProgRows } = await db.from('strategic_directives_v2')
  .select('sd_key').not('claiming_session_id', 'is', null).not('status', 'in', termList);
const { data: queuedRows } = await db.from('strategic_directives_v2')
  .select('sd_key').is('claiming_session_id', null).not('status', 'in', termList);
const inProgress = (inProgRows || []).length;
const queuedN = (queuedRows || []).length;
const workable = inProgress + queuedN;

// ── active workers: live sessions (heartbeat < 15m) currently building (have a claim) ──
const { data: sessRaw } = await db.from('claude_sessions').select('session_id,heartbeat_at,sd_key').order('heartbeat_at', { ascending: false }).limit(60);
const live = (sessRaw || []).filter(s => s.session_id !== me && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < 900000);
const builders = live.filter(s => s.sd_key).length;

// ── the gauge ──
const expectedActive = Math.min(workable, TARGET_WORKERS);
const shortBy = Math.max(0, expectedActive - builders);

// ── RAG ──
const rank = { red: 1, yellow: 2, green: 3 };
let overall;
if (workable === 0) overall = 'green';                     // nothing to do — fine
else if (builders === 0) overall = 'red';                  // work exists, nobody building
else if (builders >= expectedActive) overall = 'green';    // every workable SD has a builder = full throttle
else overall = 'yellow';                                   // work waiting with no builder
const curRank = rank[overall];

// ── trend (vs the previous email) ──
let snap = {};
try { snap = JSON.parse(readFileSync(SNAP, 'utf8')); } catch { snap = {}; }
const lastRank = typeof snap.lastOverallRank === 'number' ? snap.lastOverallRank : curRank;
const trendArrow = curRank > lastRank ? '↑' : curRank < lastRank ? '↓' : '→';
const trendWord = curRank > lastRank ? 'trending better' : curRank < lastRank ? 'trending worse' : 'holding steady';

// ── render ──
const dot = { red: '🔴', yellow: '🟡', green: '🟢' }[overall];
const word = { red: 'RED', yellow: 'YELLOW', green: 'GREEN' }[overall];
const meaning = workable === 0 ? 'idle — no open work'
  : builders === 0 ? `stalled — ${workable} item${workable > 1 ? 's' : ''} and no one building`
  : builders >= expectedActive
    ? (workable >= TARGET_WORKERS ? `full throttle — all ${builders} workers building` : `all work covered — ${builders} building, spare capacity`)
    : `under capacity — ${workable} item${workable > 1 ? 's' : ''} need workers but only ${builders} active (${shortBy} unworked)`;

const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const gauge = expectedActive === 0 ? '0 active — no work' : `${builders} of ${expectedActive} expected active`;
const subject = expectedActive === 0
  ? `Fleet ${dot} ${word} ${trendArrow} · idle (no work)`
  : `Fleet ${dot} ${word} ${trendArrow} · ${builders}/${expectedActive} working`;
const html = `<p style="font-size:17px;margin:0 0 10px"><b>${dot} ${word}</b> — ${meaning} <span style="color:#777;font-size:14px">(${trendWord} ${trendArrow})</span></p>
<p style="font-size:14px;margin:0 0 6px"><b>Active workers:</b> ${gauge}${workable ? ` · ${workable} item${workable > 1 ? 's' : ''} in play` : ''}</p>
<p style="font-size:11px;color:#999;margin:14px 0 0">${when} ET</p>`;
const text = `${dot} ${word} — ${meaning} (${trendWord} ${trendArrow})\n\nActive workers: ${gauge}${workable ? ` · ${workable} item(s) in play` : ''}\n\n${when} ET`;

if (DRY_RUN) {
  console.log('=== [DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
  console.log(`overall=${overall} builders=${builders} expectedActive=${expectedActive} workable=${workable} (inProg=${inProgress} queued=${queuedN}) live=${live.length} shortBy=${shortBy}`);
} else {
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Fleet Coordinator <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('EMAIL', JSON.stringify(r));
  try { writeFileSync(SNAP, JSON.stringify({ ts: t, lastOverallRank: curRank })); } catch { /* best effort */ }
}
