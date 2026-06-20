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
import { liveFleetWorkers, isFleetWorker } from '../lib/fleet/genuine-worker.mjs';
import { renderDecisionLines, prepareDecisions, DEAD_VENTURE_STATUSES } from '../lib/chairman/decision-layman.mjs';
// SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-4): the LIVE VDR build-% gauge, replacing the
// static .adam-vision-build.json number.
import { computeBuildGauge, formatGaugeForSummary } from '../lib/vision/vdr-registry.js';
// SD-LEO-INFRA-VDR-GREP-SEAM-CROSSREPO-001: the shared code-grep seam so the 5 code_grep probes resolve
// (the chairman-visible gauge measures all 11 capabilities, not just the 6 DB/KR-backed ones).
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';
// SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001: honest sparse-pulse worker-count source.
import { resolveWorkerCount, SPARSE_THRESHOLD } from '../lib/fleet/worker-count-source.mjs';
// SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001 (FR-4): missing-run watchdog seam.
import { assessAdamSourceWatchdog } from '../lib/fleet/adam-source-watchdog.mjs';
// SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001: the plain "Done in the last hour" section (FR-2/3) +
// the once-per-hour send marker (FR-1). Replaces the stale Distance-to-quit block below.
import { shouldSendNow, recordSent } from '../lib/fleet/exec-email-send-guard.js';
import { resolveWindow, loadRecentWork, renderRecentWork } from '../lib/fleet/exec-email-recent-work.js';

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
// FR-4 (SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001): drop stale chairman_approvals for DEAD ventures
// (the view never joins venture status) and collapse the auto-generated "Corrective:" gap findings
// into one advisory line — so the chairman's action count is real, not inflated by resolved/noise
// items. Fail-soft: a venture-status lookup error simply skips the dead-venture filter (show all).
let deadVentureIds = new Set();
try {
  const vids = [...new Set(rows.filter((r) => r.decision_type === 'chairman_approval' && r.venture_id).map((r) => r.venture_id))];
  if (vids.length) {
    const { data: vrows, error: vErr } = await db.from('ventures').select('id, status').in('id', vids);
    if (!vErr) {
      const found = new Set((vrows || []).map((v) => v.id));
      // dead = terminal status OR the venture row is GONE (hard-deleted) — both make a pending approval stale
      deadVentureIds = new Set(vids.filter((id) => !found.has(id) || (vrows || []).some((v) => v.id === id && DEAD_VENTURE_STATUSES.has(String(v.status || '').toLowerCase()))));
    }
  }
} catch (e) { console.warn('[adam-email] venture-status filter skipped (fail-soft): ' + (e?.message || e)); }
const preparedRows = prepareDecisions(rows, { deadVentureIds });
const { count: nActions, lines } = renderDecisionLines(preparedRows, new Date(t));

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

// ── 1. WORKERS: hourly average of 15-min active pulses, HONEST under sparse/missing pulses ──
// SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001: a single stale pulse must never be presented
// as a confident "hourly avg". resolveWorkerCount() decides the source: >= SPARSE_THRESHOLD pulses
// in the 1h window => confident hourly avg; sparse => widen to a 3h window or prefer the live
// instantaneous count, labeled honestly. Wider-window + live queries fire LAZILY (only when sparse).
const WIDE_HOURS = parseInt(process.env.ADAM_WORKER_WIDE_HOURS || '3', 10);
const fetchPulses = async (hours) => {
  try {
    const since = new Date(t - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.from('fleet_worker_pulse')
      .select('active_count,total_count,idle_count').gte('captured_at', since);
    if (error) return [];
    return data || [];
  } catch { return []; } // table may not exist yet -> empty -> live fallback in the helper
};
// Live instantaneous count — same genuine-worker predicate the fleet dashboard/coordinator use.
// Returns null on a query error so a failure NEVER masquerades as a real "0 active".
const computeLive = async () => {
  try {
    const { data: sessRaw, error: sErr } = await db.from('claude_sessions')
      .select('session_id,heartbeat_at,sd_key,status,claimed_at,worktree_path,continuous_sds_completed,metadata')
      .order('heartbeat_at', { ascending: false }).limit(60);
    if (sErr) throw sErr;
    const live = liveFleetWorkers(sessRaw, me, t);
    const PROVISIONED_WINDOW = parseInt(process.env.COORD_PROVISIONED_WINDOW_MIN || '480', 10) * 60000;
    const recentSeen = (sessRaw || []).filter((s) => isFleetWorker(s, me) && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW);
    return { active: live.length, idle: Math.max(0, recentSeen.length - live.length) };
  } catch (e) { console.warn('[adam-email] live worker count unavailable: ' + (e?.message || e)); return null; }
};
const primaryPulses = await fetchPulses(1);
// Healthy primary window -> no extra queries. Sparse -> fetch the wider window + live, then decide.
const sparse = primaryPulses.length < SPARSE_THRESHOLD;
const widePulses = sparse ? await fetchPulses(WIDE_HOURS) : [];
const live = sparse ? await computeLive() : null;
const wc = resolveWorkerCount({ primaryPulses, widePulses, live, threshold: SPARSE_THRESHOLD, wideHours: WIDE_HOURS });
const avgActive = wc.active, avgIdle = wc.idle, pulseSource = wc.source;
const workerText = pulseSource === 'unavailable' ? 'count unavailable (will refresh next run)' : `${avgActive} active${avgIdle ? `, ${avgIdle} idle` : ''} (${wc.label})`;

// ── 2. EHG VISION build-% gauge (LIVE VDR — SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 FR-4) ──
// Replaces the static .adam-vision-build.json estimate with the auto-computed Vision Denominator
// Registry gauge (deterministic typed probes over EHG-VISION.md's REQUIRED capabilities; no LLM).
// Fail-soft: a gauge error or an unavailable vision doc degrades to "(gauge unavailable)".
let visPct = null;
let layerLine = '';
let visNote = '';
// SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001 (FR-3): lead with fleet-build %, show rung-% + operational separately
let buildLine = '';
let rungLine = '';
let operationalLine = '';
let rungNatureLine = ''; // SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-5): per-rung + per-nature
try {
  // SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-5): source the denominator from the ACTIVE vision rung
  // (visionSource:true → the re-anchorable ladder pointer), so the gauge re-points automatically when
  // the chairman promotes the next rung — no code edit, no dependency on a missing EHG-VISION.md file.
  // Still fail-soft: an unavailable ladder/DB degrades to "(gauge unavailable)", never a false 0%.
  // SD-LEO-INFRA-VDR-GREP-SEAM-CROSSREPO-001: inject the shared code-grep seam so the 5 code_grep probes
  // resolve (present⇒'partial', absent checkout⇒'unknown'/excluded — never a guessed/inflated number).
  const grep = makeDefaultGrepSeam();
  const gauge = await computeBuildGauge({ io: { supabase: db, grep }, visionSource: true });
  const fmt = formatGaugeForSummary(gauge, { em: EM }); // single-source display mapping (shared with the Chairman-UI tile)
  visPct = fmt.pct;
  layerLine = fmt.layerLine;
  visNote = fmt.note;
  buildLine = fmt.buildLine;
  rungLine = fmt.rungLine;
  operationalLine = fmt.operationalLine;
  rungNatureLine = fmt.rungNatureLine; // FR-5
} catch (e) {
  console.warn('[adam-email] live VDR gauge failed (fail-soft): ' + (e?.message || e));
  visPct = null;
  visNote = `(gauge unavailable ${EM} compute error)`;
}

// FR-4 (SD-LEO-INFRA-ADAM-SELF-AUDIT-RESOLVERS-001): write a DURABLE 'Adam read the vision gauge'
// marker so the self-adherence audit can measure the vision-monitoring duty. Best-effort + fail-soft:
// a write failure NEVER blocks the email, and a SKIP in dry-run keeps dry-runs side-effect-free. Only
// record once the gauge actually produced a number (visPct != null) — a failed gauge isn't a "read".
if (!DRY && visPct != null) {
  try {
    const { recordVisionGaugeRead } = await import('./adam-self-adherence-review.mjs');
    await recordVisionGaugeRead(db, { sessionId: me || null, pct: visPct });
  } catch (e) { console.warn('[adam-email] vision_gauge_read marker skipped (fail-soft): ' + (e?.message || e)); }
}

// ── 2a. VISION BUILD-% TREND (SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001 FR-3) ──
// Read the last N persisted snapshots from vision_build_gauge and render the overall_pct trend
// (compact sparkline + signed delta vs the prior run) and a short prior-analysis line, so the chairman
// sees whether the build-% is MOVING, not just the live number. Fail-soft on EVERY branch: a DB/read
// error degrades to an honest "(unavailable this run)" note and NEVER blocks the email; <2 snapshots
// degrade to "trend: building history" (the pure helper owns the honest fallbacks).
let trendLine = null, trendAnalysis = null;
try {
  const { data: snaps } = await db.from('vision_build_gauge') // schema-lint-disable-line — real table, missing from the stale 2026-06-14 snapshot (pre-existing read; harness flag 6cc2757f)
    .select('overall_pct, available, measured_at')
    .order('measured_at', { ascending: false })
    .limit(24);
  const { computeGaugeTrend } = await import('../lib/vision/gauge-trend.js');
  const trend = computeGaugeTrend(snaps || []);
  trendLine = trend.trendLine;
  trendAnalysis = trend.analysisLine;
} catch (e) {
  console.warn('[adam-email] vision trend unavailable (fail-soft): ' + (e?.message || e));
  trendLine = 'EHG vision trend: (unavailable this run)';
  trendAnalysis = null;
}

// ── 2b. DONE IN THE LAST HOUR (SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 FR-2/FR-3) ──
// Replaces the stale "Distance-to-quit" roadmap prose (chairman-directed 2026-06-16). A couple of
// plain-language sentences about what shipped since the previous email — readable by a non-technical
// chairman. Window boundary = the FR-1 send marker's window_end (half-open, contiguous across runs);
// cold-start looks back 1h. recentWindow.startIso/nowIso are also used by recordSent after a send.
// Fail-soft on EVERY branch: a DB/marker error degrades to the honest empty-state, never blocks.
let recentText = null, recentHtml = '', recentWindow = null, recentSdCount = 0;
try {
  const prior = await shouldSendNow(db, { nowMs: t }); // we only need prior windowEnd here (send-gating is done in the workflow CLI)
  recentWindow = resolveWindow({ windowEndIso: prior.windowEnd, nowMs: t });
  const recent = await loadRecentWork(db, recentWindow);
  recentSdCount = recent.completed.length;
  const rendered = renderRecentWork(recent);
  recentText = rendered.text;
  recentHtml = rendered.html;
} catch (e) {
  console.warn('[adam-email] done-in-the-last-hour unavailable (fail-soft): ' + (e?.message || e));
  recentText = 'Done in the last hour: (unavailable this run)';
  recentHtml = `<p style="font-size:13px;color:#888;margin:8px 0 0">Done in the last hour: (unavailable this run)</p>`;
  recentWindow = recentWindow || { startIso: null, nowIso: new Date(t).toISOString() };
}

// ── 2c. chairman_decisions CONSUMED counter (SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 FR-4) ──
// How many chairman_decisions the Adam preference model consumed as a weak soft
// prior this run. Fail-soft on EVERY branch: a query/import error degrades to a
// graceful "(unavailable)" line and NEVER crashes the summary.
let decisionsLine = null;
try {
  const { data: decisions } = await db.from('chairman_decisions').select('id, decision, status');
  const rows = decisions || [];
  const { deriveDecisionsPrior } = await import('../lib/adam/preference-model.js');
  const { consumed } = deriveDecisionsPrior(rows);
  decisionsLine = `chairman_decisions consumed: ${consumed} of ${rows.length}`;
} catch (e) {
  console.warn('[adam-email] chairman_decisions-consumed counter unavailable (fail-soft): ' + (e?.message || e));
  decisionsLine = 'chairman_decisions consumed: (unavailable)';
}

// ── 3. ACTIONS FOR YOU: render the pending decisions (fetched above) as a copy-paste block ──
const LEAD_IN = "I have received the following executive decisions via email and I'm ready to address them:";
const numbered = lines.map((l, i) => `${i + 1}. ${l}`);
const copyBlock = nActions ? [LEAD_IN, '', ...numbered].join('\n') : null;

// ── subject + bodies (no emojis) ──
const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const visSubj = visPct != null ? `EHG ${visPct}% built` : 'EHG vision n/a';
// '(hr avg)' tag only for a CONFIDENT (non-sparse) hourly average — keep the subject honest too.
const workerSubj = pulseSource === 'unavailable' ? 'workers n/a' : `${avgActive} active${(pulseSource === 'hourly avg' && !wc.sparse) ? ' (hr avg)' : ''}`;
const actionsSubj = nActions ? `${nActions} ${nActions === 1 ? 'action' : 'actions'} for you` : 'all clear';
const subject = `[Chairman] ${visSubj} · ${workerSubj} · ${actionsSubj}`;

// FR-4 (SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001): missing-run watchdog. Catches a DROPPED
// vision-gauge run — no row gets written at all, which the HISTORIZE available=false fail-soft
// cannot see (it only records when a run actually executes). FAIL-SOFT throughout: the still-gated
// vision_build_gauge table being ABSENT yields 'unprovisioned' (no line), any query error yields no
// line, and only a genuine MISSING run renders a degraded line — the watchdog never blocks the email.
let watchdogLine = null;
try {
  const { data: lastGauge, error: gErr } = await db.from('vision_build_gauge').select('measured_at').order('measured_at', { ascending: false }).limit(1); // schema-lint-disable-line — real table, missing from the stale 2026-06-14 snapshot (pre-existing read; harness flag 6cc2757f)
  const tableProvisioned = !(gErr && /relation|does not exist|find the table|schema cache/i.test(gErr.message || ''));
  const lastGaugeAtMs = (!gErr && lastGauge && lastGauge[0] && lastGauge[0].measured_at) ? new Date(lastGauge[0].measured_at).getTime() : null;
  // Source arm omitted (lastSourceAtMs undefined) until a durable DB Adam-source-event signal is defined,
  // so an unavailable source signal cannot false-alarm; the pure seam supports it and is unit-tested.
  const wd = assessAdamSourceWatchdog({ tableProvisioned, lastGaugeAtMs, nowMs: t });
  if (wd.verdict === 'missing' && wd.label) watchdogLine = 'Watchdog: ' + wd.label;
} catch { /* fail-soft: the watchdog never blocks the email */ }

const text = [
  `Workers: ${workerText}`,
  '',
  // FR-3: lead with the fleet-build % (the honest 'built' number); fall back to the rung-% if the
  // segregated number is unavailable; then show V1 rung-completion + operational proofs separately.
  buildLine || (visPct != null ? `EHG vision: ${visPct}% built` : 'EHG vision: (gauge unavailable)'),
  ...(rungNatureLine ? ['   ' + rungNatureLine] : []),
  ...(rungLine ? ['   ' + rungLine] : []),
  ...(operationalLine ? ['   ' + operationalLine] : []),
  ...(layerLine ? ['   ' + layerLine] : []),
  ...(visNote ? ['   ' + visNote] : []),
  ...(trendLine ? ['   ' + trendLine] : []),
  ...(trendAnalysis ? ['   ' + trendAnalysis] : []),
  ...(watchdogLine ? ['   ' + watchdogLine] : []),
  ...(recentText ? ['', recentText] : []),
  ...(decisionsLine ? [decisionsLine] : []),
  '',
  '──────────────────────────────────────────────',
  nActions ? `${nActions} ${nActions === 1 ? 'action' : 'actions'} for you` : 'No decisions need you right now.',
  ...(nActions ? ['   Press and hold the text below, Select All, Copy — then paste it into Claude Code.', '──────────────────────────────────────────────', '', copyBlock] : ['──────────────────────────────────────────────']),
  '',
  `as of ${when} ET ${EM} Adam ${EM} LEO Fleet Advisor`,
].join('\n');

const layerHtml = layerLine ? `<div style="font-size:13px;color:#444;margin:2px 0 0">${esc(layerLine)}</div>` : '';
const noteHtml = visNote ? `<div style="font-size:12px;color:#888;margin:2px 0 0">${esc(visNote)}</div>` : '';
const trendHtml = trendLine ? `<div style="font-size:13px;color:#444;margin:4px 0 0;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(trendLine)}</div>` : '';
const trendAnalysisHtml = trendAnalysis ? `<div style="font-size:12px;color:#888;margin:2px 0 0">${esc(trendAnalysis)}</div>` : '';
const decisionsHtml = decisionsLine ? `<p style="font-size:12px;color:#888;margin:4px 0 0">${esc(decisionsLine)}</p>` : '';
const actionsHtml = nActions
  ? `<p style="font-size:14px;margin:0 0 2px"><b>${nActions} ${nActions === 1 ? 'action' : 'actions'} for you</b></p>` +
    `<p style="font-size:12px;color:#888;margin:0 0 6px">On your phone, press and hold the box below, tap "Select All", then "Copy" — then paste it into Claude Code.</p>` +
    `<pre style="font-size:13px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:4px;padding:12px;white-space:pre-wrap;margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;-webkit-user-select:all;user-select:all">${esc(copyBlock)}</pre>`
  : `<p style="font-size:14px;margin:0 0 6px"><b>No decisions need you right now.</b></p>`;
const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
  `<p style="font-size:15px;margin:0 0 12px"><b>Workers:</b> ${esc(workerText)}</p>` +
  `<p style="font-size:15px;font-weight:600;margin:0 0 0">EHG vision: ${visPct != null ? visPct + '% built' : '(gauge unavailable)'}</p>` +
  (rungNatureLine ? `<div style="font-size:13px;color:#444;margin:2px 0 0">${esc(rungNatureLine)}</div>` : '') +
  layerHtml + noteHtml + trendHtml + trendAnalysisHtml +
  (watchdogLine ? `<div style="font-size:12px;color:#b54708;margin:2px 0 0">${esc(watchdogLine)}</div>` : '') +
  recentHtml + decisionsHtml +
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
  // FR-1: record the once-per-hour send marker ONLY after a successful send. The marker's window_end
  // (=this run's nowIso) becomes the next email's completion-window start. Fail-soft: a marker-write
  // error never throws (a bounded single duplicate next run is acceptable; a storm is not).
  if (r && r.success) {
    const mk = await recordSent(db, { sentIso: recentWindow.nowIso, windowStartIso: recentWindow.startIso, windowEndIso: recentWindow.nowIso, sdCount: recentSdCount });
    console.log('ADAM-EMAIL-MARKER', JSON.stringify(mk));
    // LOUD on failure: a missed marker re-opens the duplicate-send path (the next run won't see this send).
    if (!mk.ok) console.error('[adam-email] CRITICAL: send marker NOT recorded — next run may duplicate this email: ' + mk.error);
  }
}
