#!/usr/bin/env node
/**
 * Chairman morning-review sweep — the DURABLE 5:45 AM ET daily-review runner.
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-B (child B: text-only floor).
 *
 * Mirrors scripts/cron/sms-outbound-reconcile-sweep.mjs: a --once runner holding NO
 * session-local setTimeout/setInterval work-timer, so a fresh cold GitHub Actions process
 * does exactly one pass and exits. It builds a SHORT, segment-aware status body (a completion
 * forecast line + a roadmap build/wave line + a "what moved yesterday" line) and enqueues it
 * as a TEXT-only 'morning_review' obligation via the hardened owed-state bridge
 * (enqueueChairmanSms). The actual provider send + delivery-truth is owned by the pre-existing
 * claim-serialized worker (lib/chairman/sms-outbound-worker.js) — this sweep NEVER calls
 * twilioProvider.send (that would re-open the F1 201-as-success defect).
 *
 * DST: GitHub cron is UTC/no-DST. The workflow fires at BOTH 09:45 and 10:45 UTC; this sweep
 * gates real work on an America/New_York wall-clock check (proceed only when the ET local hour
 * is 5), so exactly one of the two fires maps to 05:45 ET per season and does work — the other
 * exits inert. The per-ET-date dedupeKey is the idempotency backstop against a double-fire.
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations table is unapplied, enqueueChairmanSms
 * returns {enqueued:false, reason:'table_absent...'} without throwing and this sweep logs inert
 * + exits 0 (no crash, no direct provider.send fallback).
 *
 * Usage:
 *   node scripts/cron/chairman-morning-review-sweep.mjs --once
 *   node scripts/cron/chairman-morning-review-sweep.mjs --once --dry-run
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
 *      CHAIRMAN_PHONE (recipient — inert if unset).
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { enqueueChairmanSms } from '../../lib/chairman/sms-bridge.js';
import { computeForecast, formatForecastLine } from '../../lib/vision/build-completion-forecast.mjs';
import { etLocalHour, etDateStr, et6amIso, etPrior545Iso } from '../../lib/time/chairman-et-wall-clock.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { buildRoadmapStatusDoc } from '../../lib/chairman/daily-review/roadmap-status-doc.js';
import { renderGanttPng } from '../../lib/chairman/daily-review/gantt-renderer.js';
import { uploadPrivateAndSign } from '../../lib/storage/private-signed-upload.js';

export const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-B';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-morning-review-cron.yml';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_IN_TERMINAL = '("completed","cancelled","deferred")';
// ~2 GSM segments (153 chars/segment concatenated). The built body is capped here so a long
// forecast note can never balloon past the segment budget.
export const BODY_CEILING = 306;

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ET wall-clock helpers (etLocalHour, etDateStr, et6amIso, etPrior545Iso) now live in
// lib/time/chairman-et-wall-clock.js (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A consolidation) —
// re-exported here so this script's own CLI/importers are unaffected by the move.
export { etLocalHour, etDateStr, et6amIso, etPrior545Iso };

// ── body data (DB-only, fail-soft; surgical — no git-grep VDR gauge / CLI refactor) ──
async function gatherForecastInputs(supabase, nowMs, windowDays = 14) {
  const sinceIso = new Date(nowMs - windowDays * DAY_MS).toISOString();
  let velocityPerDay = 0, sourcingPerDay = 0, queueDepth = 0, buildableRemaining = 0;
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — only the count is used;
    // exact head-count avoids the rows.length-capped-at-1000 gauge bug.
    const { count } = await supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', sinceIso);
    velocityPerDay = (count || 0) / windowDays;
  } catch { /* fail-soft */ }
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — rows are filtered by
    // sd_type/created_at/claiming_session_id below to derive three metrics, so the full set
    // (not just a count) is needed; strategic_directives_v2 grows, so paginate to completion.
    const rowsAll = await fetchAllPaginated(() => supabase.from('strategic_directives_v2').select('id, sd_key, created_at, claiming_session_id, sd_type').not('status', 'in', NOT_IN_TERMINAL).order('id', { ascending: true }));
    const rows = rowsAll.filter((d) => d.sd_type !== 'orchestrator');
    buildableRemaining = rows.length;
    sourcingPerDay = rows.filter((d) => d.created_at && d.created_at >= sinceIso).length / windowDays;
    queueDepth = rows.filter((d) => !d.claiming_session_id).length;
  } catch { /* fail-soft */ }
  return { buildPct: null, buildableRemaining, velocityPerDay, sourcingPerDay, queueDepth };
}

async function gatherWaves(supabase) {
  try {
    const { data: roadmaps } = await supabase.from('strategic_roadmaps').select('id, status, created_at').order('created_at', { ascending: false }).limit(1);
    const rm = roadmaps?.[0];
    if (!rm) return { waveCount: 0, doneWaves: 0, avgPct: null };
    const { data: waves } = await supabase.from('roadmap_waves').select('status, progress_pct').eq('roadmap_id', rm.id);
    const ws = waves || [];
    const waveCount = ws.length;
    const doneWaves = ws.filter((w) => Number(w.progress_pct || 0) >= 100 || w.status === 'completed').length;
    const avgPct = waveCount ? Math.round(ws.reduce((s, w) => s + Number(w.progress_pct || 0), 0) / waveCount) : null;
    return { waveCount, doneWaves, avgPct };
  } catch { return { waveCount: 0, doneWaves: 0, avgPct: null }; }
}

async function gatherYesterday(supabase, priorMorningIso) {
  let shipped = 0, inFlight = 0;
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — only the counts are used;
  // exact head-count avoids the rows.length-capped-at-1000 gauge bug.
  try {
    const { count } = await supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', priorMorningIso);
    shipped = count || 0;
  } catch { /* fail-soft */ }
  try {
    const { count } = await supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true }).not('status', 'in', NOT_IN_TERMINAL);
    inFlight = count || 0;
  } catch { /* fail-soft */ }
  return { shipped, inFlight };
}

/** Build the SHORT, PII-free morning-review body. Login-gated summary data only. */
export async function buildMorningReviewBody(supabase, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const inputs = await gatherForecastInputs(supabase, nowMs);
  const forecastLine = formatForecastLine(computeForecast({ ...inputs, nowMs }), null);

  const waves = await gatherWaves(supabase);
  const roadmapLine = waves.waveCount
    ? `Roadmap: ${waves.avgPct == null ? '?' : waves.avgPct}% build, waves ${waves.doneWaves}/${waves.waveCount} done`
    : 'Roadmap: (no active roadmap)';

  const { shipped, inFlight } = await gatherYesterday(supabase, etPrior545Iso(now));
  const yesterdayLine = `Yesterday: ${shipped} shipped, ${inFlight} in-flight`;

  let body = [forecastLine, roadmapLine, yesterdayLine].join('\n');
  if (body.length > BODY_CEILING) body = `${body.slice(0, BODY_CEILING - 1)}…`;
  return body;
}

// SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001 FR-2: feature flag gating the composed (text + MMS
// Gantt) brief path. Read PER-INVOCATION inside main() (never captured at module-load) so
// flipping it requires only an env var change, no redeploy, and the OFF path stays byte-
// identical to the pre-existing text-only behavior at all times (TS-11).
export const COMPOSED_FLAG_ENV = 'DAILY_BRIEF_COMPOSED_ENABLED';
// Long TTL: a brief signed at ~05:30 ET may not be fetched by Twilio until the last self-healing
// retry at ~11:45 ET (chairman-morning-brief-sweep.mjs's window) -- roughly a 7h span. 12h gives
// margin (TS-16).
export const GANTT_SIGNED_URL_TTL_SECONDS = 12 * 60 * 60;
const GANTT_BUCKET = 'chairman-daily-review';

/**
 * FR-2 composer: buildRoadmapStatusDoc (Solomon-calibrated text, FR-1) + renderGanttPng +
 * uploadPrivateAndSign -> {body, mediaUrl}. The Gantt/upload leg is independently try/caught
 * so a render or upload failure degrades to a text-only body (mediaUrl: null) rather than
 * throwing -- the caller never needs its own try/catch around this beyond the outer
 * text-build fallback already in main().
 */
export async function buildComposedBody(supabase, { now = new Date(), buildDoc = buildRoadmapStatusDoc, renderPng = renderGanttPng, uploadSign = uploadPrivateAndSign } = {}) {
  const doc = await buildDoc(supabase);
  let body = doc.plainTextBody;
  if (body.length > BODY_CEILING) body = `${body.slice(0, BODY_CEILING - 1)}…`;

  let mediaUrl = null;
  try {
    const waves = doc.sections?.[0]?.data?.waves;
    if (Array.isArray(waves) && waves.length > 0) {
      const png = await renderPng(waves);
      const path = `${GANTT_BUCKET}/${etDateStr(now)}.png`;
      const { signedUrl } = await uploadSign(supabase, {
        bucket: GANTT_BUCKET,
        path,
        buffer: png,
        contentType: 'image/png',
        expiresInSeconds: GANTT_SIGNED_URL_TTL_SECONDS,
      });
      mediaUrl = signedUrl;
    }
  } catch {
    // Fail-soft: text-only send, never crash the composer (FR-2).
    mediaUrl = null;
  }

  return { body, mediaUrl };
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const now = deps.now instanceof Date ? deps.now : (Number.isFinite(deps.now) ? new Date(deps.now) : new Date());
  const enqueue = deps.enqueue || enqueueChairmanSms;
  const log = (obj) => logger.log?.(`[morning-review] ${JSON.stringify(obj)}`);

  if (args.help) { logger.log?.('chairman-morning-review-sweep --once [--dry-run]'); return { exitCode: 0, action: 'help' }; }

  // FR-2 ET wall-clock gate: only the season-correct UTC fire (05:XX ET) does work.
  const etHour = etLocalHour(now);
  if (etHour !== 5) {
    log({ action: 'inert', reason: 'outside_et_window', et_hour: etHour });
    return { exitCode: 0, action: 'inert', reason: 'outside_et_window' };
  }

  const recipientPhone = env.CHAIRMAN_PHONE;
  if (!recipientPhone) {
    log({ action: 'inert', reason: 'chairman_phone_unset' });
    return { exitCode: 0, action: 'inert', reason: 'chairman_phone_unset' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[morning-review] supabase client unavailable: ${err.message}`); return { exitCode: 2, action: 'no_supabase' }; }

  // SAME dedupe key regardless of composed path -- guarantees at most one 'morning_review'
  // obligation/day whether the send ends up text-only or text+media (FR-2 idempotency; also
  // the same key a degraded-to-text-only composer fallback reuses, so a partial media failure
  // can never double-send under a different key).
  const dedupeKey = `morning_review:${etDateStr(now)}`;
  const notBefore = et6amIso(now); // defer an overnight/early enqueue to the 6AM batch (sleep-window)

  // Read the composed-path flag PER-INVOCATION (never at module load) so flipping it is a
  // pure env var change with an instant revert to the byte-identical text-only path (TS-11).
  const composedEnabled = String(env[COMPOSED_FLAG_ENV] || '').toLowerCase() === 'true';

  let body, mediaUrl = null;
  if (composedEnabled) {
    try {
      const composed = await (deps.buildComposedBody || buildComposedBody)(supabase, { now });
      body = composed.body;
      mediaUrl = composed.mediaUrl;
    } catch (err) {
      // Whole composer failed (not just the Gantt leg) -- degrade fully to the proven
      // text-only path rather than lose the brief (FR-2).
      logger.warn?.(`[morning-review] composed body failed, falling back to text-only (${err.message})`);
      try { body = await (deps.buildBody || buildMorningReviewBody)(supabase, { now }); }
      catch (err2) { logger.warn?.(`[morning-review] fallback body build degraded (${err2.message})`); body = 'Morning review: status unavailable this run.'; }
    }
  } else {
    try { body = await (deps.buildBody || buildMorningReviewBody)(supabase, { now }); }
    catch (err) { logger.warn?.(`[morning-review] body build degraded (${err.message})`); body = 'Morning review: status unavailable this run.'; }
  }

  if (args.dryRun) {
    log({ action: 'dry_run', dedupe_key: dedupeKey, not_before: notBefore, body_len: body.length, media: !!mediaUrl });
    return { exitCode: 0, action: 'dry_run', summary: { dedupeKey, notBefore, bodyLength: body.length, mediaUrl } };
  }

  // Owed-state enqueue ONLY — the worker owns the provider send + delivery-truth. Same
  // direct-enqueue pattern the text-only path already used (never routes through
  // lib/comms/adam-outbound/chairman-sms-gate, which is confirmed (harness_backlog ca9941ee)
  // to console.warn-drop quiet-hours-blocked sends instead of durably deferring them — FR-3).
  const enq = await enqueue(supabase, { recipientPhone, kind: 'morning_review', body, decisionId: null, dedupeKey, notBefore, mediaUrl });
  const action = enq.enqueued ? 'enqueued' : (enq.deduped ? 'deduped' : 'inert');
  // PII-safe: log counts/ids/reason only — never the recipient phone or the body text.
  log({ action, obligation_id: enq.obligationId || null, reason: enq.reason || null, dedupe_key: dedupeKey, not_before: notBefore, body_len: body.length, media: !!mediaUrl });
  return {
    exitCode: 0,
    action,
    summary: { enqueued: !!enq.enqueued, deduped: !!enq.deduped, reason: enq.reason || null, dedupeKey, notBefore, bodyLength: body.length, mediaUrl, obligationId: enq.obligationId || null },
  };
}

/** Windows-safe termination (mirrors scripts/cron/sms-outbound-reconcile-sweep.mjs::gracefulExit). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('chairman-morning-review-sweep fatal:', err.message); return gracefulExit(2); });
}
