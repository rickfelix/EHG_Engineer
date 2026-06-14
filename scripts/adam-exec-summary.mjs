// adam-exec-summary v3 — chairman exec email, drastically simplified (chairman directive 2026-06-14).
//
// The chairman asked for TWO headline numbers + their action list, nothing else:
//   1. WORKERS — the hourly AVERAGE of 15-min active-worker pulses, rounded to a whole number
//      (a pulse job records active-vs-not every 15 min into fleet_worker_pulse; this averages the
//      last hour). Fails soft to the live instantaneous count before any pulses exist.
//   2. EHG VISION BUILD-% — the build-completeness gauge (.adam-vision-build.json) with its
//      per-layer breakdown. Honestly labelled as the v1 estimate until the live VDR gauge ships.
//   3. ACTIONS FOR YOU — chairman_pending_decisions rendered as a single copy-paste block the
//      chairman selects and pastes back into Claude Code to action them. Free-text flags are shown
//      AS RECEIVED (no LLM, chairman 2026-06-14); every line ends with the real decision_type:id
//      reference so a pasted instruction resolves to the exact row.
//
// Removed vs v2: north star, per-scope roll-up, value-delivered buckets, meta:product ratio,
// distance-to-quit, tri-party self-score, canary, and the embedded coordinator fleet card.
// No emojis anywhere (chairman directive).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { liveFleetWorkers, isFleetWorker } from '../lib/fleet/genuine-worker.mjs';
import { renderDecisionLines } from '../lib/chairman/decision-layman.mjs';

const EM = '—';
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const t = Date.now();
const me = process.env.CLAUDE_SESSION_ID;
const DRY = !!process.env.ADAM_EMAIL_DRYRUN || process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// ── ACTIONS FOR YOU: pending chairman decisions, fetched FIRST so the quiescence gate can see them ──
let rows = [];
try {
  const { data } = await db.from('chairman_pending_decisions').select('*').limit(200);
  rows = data || [];
} catch { rows = []; }
const { count: nActions, lines } = renderDecisionLines(rows, new Date(t));

// Quiescence gate (QF-20260612-437): skip the hourly send when the fleet is fully OFF — UNLESS the
// chairman has pending actions, which must surface regardless of fleet state (they are often the very
// reason the fleet is idle). Fails open to ACTIVE so a query error never drops a real email.
if (!DRY && !FORCE && nActions === 0) {
  try {
    const { createRequire } = await import('module');
    const q = createRequire(import.meta.url)('../lib/coordinator/fleet-quiescence.cjs');
    const verdict = await q.assessFleetActivity(db);
    if (verdict.quiescent) { console.log('ADAM-EMAIL skipped (fleet quiescent, no pending actions): ' + verdict.reason); process.exit(0); }
  } catch (e) { console.log('quiescence check failed open (sending): ' + (e?.message || e)); }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 1. WORKERS: hourly average of 15-min active pulses (rounded), fail-soft to live count ──
let avgActive = null, avgIdle = 0, pulseSource = 'live';
try {
  const sinceHr = new Date(t - 60 * 60 * 1000).toISOString();
  const { data: pulses, error } = await db.from('fleet_worker_pulse')
    .select('active_count,total_count,idle_count').gte('captured_at', sinceHr);
  if (!error && pulses && pulses.length) {
    const sum = (f) => pulses.reduce((a, p) => a + (Number(f(p)) || 0), 0);
    avgActive = Math.round(sum((p) => p.active_count) / pulses.length);
    avgIdle = Math.round(sum((p) => (p.idle_count != null ? p.idle_count : (p.total_count - p.active_count))) / pulses.length);
    pulseSource = 'hourly avg';
  }
} catch { /* table may not exist yet -> live fallback */ }
if (avgActive === null) {
  // Live instantaneous fallback — same genuine-worker predicate the fleet dashboard/coordinator use.
  try {
    const { data: sessRaw, error: sErr } = await db.from('claude_sessions')
      .select('session_id,heartbeat_at,sd_key,status,claimed_at,worktree_path,continuous_sds_completed,metadata')
      .order('heartbeat_at', { ascending: false }).limit(60);
    if (sErr) throw sErr; // a query error must NOT masquerade as a real "0 active"
    const live = liveFleetWorkers(sessRaw, me, t);
    const PROVISIONED_WINDOW = parseInt(process.env.COORD_PROVISIONED_WINDOW_MIN || '480', 10) * 60000;
    const recentSeen = (sessRaw || []).filter((s) => isFleetWorker(s, me) && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW);
    avgActive = live.length;
    avgIdle = Math.max(0, recentSeen.length - live.length);
  } catch (e) { console.warn('[adam-email] worker count unavailable: ' + (e?.message || e)); avgActive = null; avgIdle = 0; pulseSource = 'unavailable'; }
}
const workerText = pulseSource === 'unavailable' ? 'count unavailable (will refresh next run)' : `${avgActive} active${avgIdle ? `, ${avgIdle} idle` : ''} (${pulseSource})`;

// ── 2. EHG VISION build-% gauge (.adam-vision-build.json) ──
const LAYER_LABEL = { infrastructure: 'infrastructure', application: 'UI/UX', 'venture/income': 'venture/income', process: 'process' };
let vis = null;
try { vis = JSON.parse(readFileSync(resolve('.adam-vision-build.json'), 'utf8')); }
catch (e) { console.warn('[adam-email] vision gauge file unreadable (.adam-vision-build.json): ' + (e?.message || e)); vis = null; }
const visPct = (vis && typeof vis.overall_pct === 'number') ? vis.overall_pct : null;
const layers = (vis && Array.isArray(vis.per_layer)) ? vis.per_layer : [];
const layerLine = layers.map((l) => `${LAYER_LABEL[l.layer] || l.layer} ${l.pct == null ? '?' : l.pct}%`).join('  ·  ');
let measured = null;
if (vis && vis.measured_at) { const d = new Date(vis.measured_at + 'T00:00:00Z'); if (!Number.isNaN(d.getTime())) measured = d.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }); }
const visNote = vis ? `(v1 estimate${measured ? ' as of ' + measured : ''} ${EM} live auto-updating gauge coming)` : '';

// ── 3. ACTIONS FOR YOU: render the pending decisions (fetched above) as a copy-paste block ──
const LEAD_IN = "I have received the following executive decisions via email and I'm ready to address them:";
const numbered = lines.map((l, i) => `${i + 1}. ${l}`);
const copyBlock = nActions ? [LEAD_IN, '', ...numbered].join('\n') : null;

// ── subject + bodies (no emojis) ──
const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const visSubj = visPct != null ? `EHG ${visPct}% built` : 'EHG vision n/a';
const workerSubj = pulseSource === 'unavailable' ? 'workers n/a' : `${avgActive} active${pulseSource === 'hourly avg' ? ' (hr avg)' : ''}`;
const actionsSubj = nActions ? `${nActions} ${nActions === 1 ? 'action' : 'actions'} for you` : 'all clear';
const subject = `[Chairman] ${visSubj} · ${workerSubj} · ${actionsSubj}`;

const text = [
  `Workers: ${workerText}`,
  '',
  visPct != null ? `EHG vision: ${visPct}% built` : 'EHG vision: (gauge unavailable)',
  ...(layerLine ? ['   ' + layerLine] : []),
  ...(visNote ? ['   ' + visNote] : []),
  '',
  '──────────────────────────────────────────────',
  nActions ? `${nActions} ${nActions === 1 ? 'action' : 'actions'} for you` : 'No decisions need you right now.',
  ...(nActions ? ['   Copy everything below this line and paste it into Claude Code.', '──────────────────────────────────────────────', '', copyBlock] : ['──────────────────────────────────────────────']),
  '',
  `as of ${when} ET ${EM} Adam ${EM} LEO Fleet Advisor`,
].join('\n');

const layerHtml = layerLine ? `<div style="font-size:13px;color:#444;margin:2px 0 0">${esc(layerLine)}</div>` : '';
const noteHtml = visNote ? `<div style="font-size:12px;color:#888;margin:2px 0 0">${esc(visNote)}</div>` : '';
const actionsHtml = nActions
  ? `<p style="font-size:14px;margin:0 0 2px"><b>${nActions} ${nActions === 1 ? 'action' : 'actions'} for you</b></p>` +
    `<p style="font-size:12px;color:#888;margin:0 0 6px">Copy everything in the box below and paste it into Claude Code.</p>` +
    `<pre style="font-size:13px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:4px;padding:12px;white-space:pre-wrap;margin:0;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(copyBlock)}</pre>`
  : `<p style="font-size:14px;margin:0 0 6px"><b>No decisions need you right now.</b></p>`;
const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
  `<p style="font-size:15px;margin:0 0 12px"><b>Workers:</b> ${esc(workerText)}</p>` +
  `<p style="font-size:15px;font-weight:600;margin:0 0 0">EHG vision: ${visPct != null ? visPct + '% built' : '(gauge unavailable)'}</p>` +
  layerHtml + noteHtml +
  '<hr style="border:none;border-top:1px solid #e1e4e8;margin:14px 0">' +
  actionsHtml +
  `<p style="font-size:11px;color:#999;margin:14px 0 0">as of ${esc(when)} ET ${EM} Adam ${EM} LEO Fleet Advisor</p></div>`;

if (DRY) {
  console.log('=== [ADAM DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
  console.log(`workers active=${avgActive} idle=${avgIdle} source=${pulseSource} | visionPct=${visPct} | actions=${nActions} lines=${lines.length}`);
} else {
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Adam ' + EM + ' LEO Fleet Advisor <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('ADAM-EMAIL', JSON.stringify(r));
}
