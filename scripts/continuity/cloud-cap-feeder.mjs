// @wire-check-exempt: opt-in continuity CLI (npm: continuity:cloud-cap-feeder) + unit test;
// it is the sole writer of llm_cloud_health, read by llm-degradation-detector.mjs::detectFromDb.
/**
 * Cloud-cap live feeder — SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001.
 *
 * The deferred "cloud-health feeder" named in llm-degradation-detector.mjs. It actively probes
 * the Anthropic API (cheap models.list calls — no token spend), categorizes real outcomes
 * (429 rate_limit / 5xx server / overloaded_error / timeout), and stamps the dedicated
 * `llm_cloud_health` singleton (coordinator spec-fork ruling 3e11be61: a dedicated table, NOT an
 * overload of the local-rollout llm_canary_state row) that the pure source-agnostic evaluator
 * (evaluateDegradationRung) reads via detectFromDb.
 *
 * LIFECYCLE (single UPDATE per run): a batch whose error_rate exceeds error_rate_threshold is a
 * "failure batch" -> status='rolling' (arms the evaluator's PAUSE trigger) + consecutive_failures++.
 * A healthy batch -> status='paused' (disarms PAUSE) + consecutive_failures=0. baseline_latency_p95_ms
 * is stamped once on the first healthy batch. last_quality_check_at is refreshed every run (liveness).
 *
 * SAFETY: opt-in CLI (no background spend); only writer of these columns. A STOPPED feeder cannot pin
 * a degraded rung on live workers — detectFromDb suppresses any degraded signal whose
 * last_quality_check_at is stale beyond the liveness window (feeder not actively probing -> NORMAL),
 * with the 0-live-workers guard as a second layer. probeCount is clamped (only real-spend surface).
 * Injectable client/clock/supabase => tests make ZERO live Anthropic calls or DB writes.
 *
 * @module scripts/continuity/cloud-cap-feeder
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createAnthropicClient } from '../eva-support/_internal/anthropic-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

/** Error categories that count as a cloud-cap failure (vs operator/config errors like 401/400). */
export const CAP_FAILURE_CATEGORIES = Object.freeze(new Set(['rate_limit', 'overloaded', 'server', 'timeout']));

// Rolling error-rate denominator. Raised 5 -> 10 (D2 rate-limit-health, chairman-ratified): at 5 a single
// transient blip is 1/5 = 20% > the 5% error_rate_threshold -> a false ROLLING (degraded) alert. A 10-probe
// batch halves one blip's weight to 10%, and the per-probe retry-on-transient below lets a recovering blip
// resolve to OK before it counts at all. DETECTION-TUNING ONLY: threshold/alerting unchanged.
export const DEFAULT_PROBE_COUNT = 10;
export const MAX_PROBE_COUNT = 20; // clamp the only real-spend surface against a fat-finger invocation
export const SINGLETON_ID = 'singleton';

// Jitter + exponential-backoff on the probe requests (D2). Jitter de-synchronizes the batch so the probes do
// not themselves burst into a rate limit; the transient-error retry (with exponential backoff) lets a momentary
// 429/5xx/overloaded/timeout recover instead of counting toward the rolling error rate. Sustained degradation
// still surfaces: retries are bounded, so a real cap fails every attempt and is recorded as a failure.
export const DEFAULT_MAX_RETRIES = 2;       // retries per probe on a TRANSIENT (cap) error before recording a failure
export const DEFAULT_BACKOFF_BASE_MS = 250; // exponential backoff base: attempt 0 -> 250ms, attempt 1 -> 500ms, ...
export const DEFAULT_JITTER_MS = 100;       // max randomized inter-probe delay + additive backoff jitter (ms)

/** Await ms milliseconds (injectable in tests via sleepFn so no real time passes). */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Categorize an Anthropic SDK error into a cloud-cap signal. PURE.
 * @param {any} err
 * @returns {'rate_limit'|'overloaded'|'server'|'timeout'|'other'}
 */
export function categorizeProbeError(err) {
  if (!err) return 'other';
  const status = typeof err.status === 'number' ? err.status : null;
  // The real @anthropic-ai/sdk overloaded error exposes the discriminator on err.type; err.error.type
  // reads the response ENVELOPE (not the inner error), so check both.
  const type = err.type || err.error?.type || err.error?.error?.type || null;
  const name = err.name || '';
  const ctorName = err.constructor?.name || '';
  const msg = err.message || '';
  // Real Anthropic.APIConnectionTimeoutError: name==='Error', message==='Request timed out.', no code —
  // identify by constructor name, a "timed out"/"timeout" message, or the undici cause code.
  const causeCode = err.cause?.code || '';
  const isTimeout = ctorName === 'APIConnectionTimeoutError'
    || /timed?\s*out|timeout/i.test(name) || /timed?\s*out|timeout/i.test(msg)
    || err.code === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT' || causeCode === 'ETIMEDOUT';
  if (status === 429) return 'rate_limit';
  if (status === 529 || type === 'overloaded_error') return 'overloaded';
  if (status != null && status >= 500) return 'server';
  if (isTimeout) return 'timeout';
  return 'other';
}

/** p95 of a latency array (ms). PURE. Returns null for an empty array. */
export function computeP95(latencies) {
  const arr = (latencies || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const idx = Math.min(arr.length - 1, Math.ceil(0.95 * arr.length) - 1);
  return arr[Math.max(0, idx)];
}

/**
 * Summarize a probe batch. PURE.
 * @param {Array<{ok:boolean, latencyMs?:number, category?:string}>} results
 * @returns {{total:number, capFailures:number, otherErrors:number, errorRate:number|null, p95LatencyMs:number|null}}
 */
export function summarizeBatch(results) {
  const list = Array.isArray(results) ? results : [];
  const total = list.length;
  let capFailures = 0, otherErrors = 0;
  const okLatencies = [];
  for (const r of list) {
    if (r.ok) { if (Number.isFinite(r.latencyMs)) okLatencies.push(r.latencyMs); continue; }
    if (CAP_FAILURE_CATEGORIES.has(r.category)) capFailures++;
    else otherErrors++;
  }
  return {
    total,
    capFailures,
    otherErrors,
    errorRate: total > 0 ? Number((capFailures / total).toFixed(4)) : null,
    p95LatencyMs: computeP95(okLatencies),
  };
}

/**
 * Compute the next llm_cloud_health column values from the prior row + a batch summary. PURE.
 * Failure batch (errorRate > threshold) -> status='rolling' + consecutive_failures++; else healthy ->
 * status='paused' + reset to 0. Baseline stamped once on the first healthy batch that has a p95.
 * @param {object} prev - prior row (or null)
 * @param {object} summary - from summarizeBatch
 * @returns {{status:string, consecutive_failures:number, current_error_rate:number|null, current_latency_p95_ms:number|null, baseline_latency_p95_ms:number|null}}
 */
export function computeNextHealthState(prev, summary) {
  const p = prev && typeof prev === 'object' ? prev : {};
  // null-aware: Number(null) === 0 (finite), so guard null/undefined BEFORE coercing — else a
  // null baseline reads as 0 and never gets stamped, and a null threshold reads as 0 (always-bad).
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const threshold = num(p.error_rate_threshold) ?? 0.05;
  const prevFailures = num(p.consecutive_failures) ?? 0;
  const prevBaseline = num(p.baseline_latency_p95_ms);

  const batchBad = summary.errorRate != null && summary.errorRate > threshold;
  const status = batchBad ? 'rolling' : 'paused';
  const consecutive_failures = batchBad ? prevFailures + 1 : 0;
  // Stamp baseline once, on the first healthy batch that produced a latency sample.
  const baseline_latency_p95_ms = prevBaseline != null
    ? prevBaseline
    : (!batchBad && summary.p95LatencyMs != null ? summary.p95LatencyMs : null);

  return {
    status,
    consecutive_failures,
    current_error_rate: summary.errorRate,
    current_latency_p95_ms: summary.p95LatencyMs,
    baseline_latency_p95_ms,
  };
}

/**
 * Run a batch of cheap probes against the injected Anthropic client. IO (but client is injected).
 * Uses models.list() — no token spend — as the health probe. Applies jitter between probes and retries a
 * probe that hits a TRANSIENT (cap-category) error with exponential backoff before recording it as a failure,
 * so a momentary blip does not inflate the rolling error rate (D2). All delays are injectable (sleepFn/randFn)
 * so tests pass no real time. maxRetries=0 restores the original no-retry behavior.
 * @param {object} args
 * @param {object} args.client - Anthropic SDK client (injected; fake in tests)
 * @param {number} [args.count=DEFAULT_PROBE_COUNT]
 * @param {() => number} [args.nowFn=Date.now]
 * @param {number} [args.maxRetries=DEFAULT_MAX_RETRIES]
 * @param {number} [args.backoffBaseMs=DEFAULT_BACKOFF_BASE_MS]
 * @param {number} [args.jitterMs=DEFAULT_JITTER_MS]
 * @param {(ms:number)=>Promise<void>} [args.sleepFn=sleep]
 * @param {() => number} [args.randFn=Math.random]
 * @returns {Promise<Array<{ok:boolean, latencyMs?:number, category?:string}>>}
 */
export async function runProbeBatch({
  client, count = DEFAULT_PROBE_COUNT, nowFn = Date.now,
  maxRetries = DEFAULT_MAX_RETRIES, backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
  jitterMs = DEFAULT_JITTER_MS, sleepFn = sleep, randFn = Math.random,
} = {}) {
  const results = [];
  for (let i = 0; i < count; i++) {
    // Jitter between probes so the batch is not a synchronized burst that itself trips a rate limit.
    if (i > 0 && jitterMs > 0) await sleepFn(Math.floor(randFn() * jitterMs));
    let attempt = 0;
    for (;;) {
      const t0 = nowFn();
      try {
        await client.models.list();
        results.push({ ok: true, latencyMs: Math.max(0, nowFn() - t0) });
        break;
      } catch (err) {
        const category = categorizeProbeError(err);
        // Retry only TRANSIENT (cap-category) errors — a config error (401/400 -> 'other') is not retried.
        if (CAP_FAILURE_CATEGORIES.has(category) && attempt < maxRetries) {
          const backoffMs = backoffBaseMs * (2 ** attempt) + (jitterMs > 0 ? Math.floor(randFn() * jitterMs) : 0);
          attempt++;
          await sleepFn(backoffMs);
          continue;
        }
        results.push({ ok: false, category });
        break;
      }
    }
  }
  return results;
}

/**
 * Probe the cloud + stamp the llm_cloud_health singleton. The SOLE writer of these columns.
 * @param {object} args
 * @param {object} args.supabase
 * @param {object} args.client - Anthropic SDK client (injected)
 * @param {() => number} [args.nowFn=Date.now]
 * @param {() => string} [args.nowIso] - ISO timestamp provider (inject for tests)
 * @param {number} [args.probeCount=DEFAULT_PROBE_COUNT]
 * @param {number} [args.maxRetries] - passthrough to runProbeBatch (transient-error retries)
 * @param {number} [args.backoffBaseMs] - passthrough to runProbeBatch (exponential backoff base)
 * @param {number} [args.jitterMs] - passthrough to runProbeBatch (inter-probe + backoff jitter)
 * @param {(ms:number)=>Promise<void>} [args.sleepFn] - passthrough to runProbeBatch (inject in tests)
 * @param {() => number} [args.randFn] - passthrough to runProbeBatch (inject in tests)
 * @returns {Promise<{summary:object, update:object}>}
 */
export async function feedCloudHealth({ supabase, client, nowFn = Date.now, nowIso, probeCount = DEFAULT_PROBE_COUNT, maxRetries, backoffBaseMs, jitterMs, sleepFn, randFn } = {}) {
  const isoFn = nowIso || (() => new Date(nowFn()).toISOString());
  const { data: prev, error: readErr } = await supabase
    .from('llm_cloud_health')
    .select('error_rate_threshold, consecutive_failures, baseline_latency_p95_ms')
    .eq('id', SINGLETON_ID)
    .maybeSingle();
  if (readErr) throw new Error(`[cloud-cap-feeder] read failed (fail-loud): ${readErr.message}`);

  const safeCount = Math.max(1, Math.min(MAX_PROBE_COUNT, Math.floor(Number(probeCount)) || DEFAULT_PROBE_COUNT));
  const results = await runProbeBatch({ client, count: safeCount, nowFn, maxRetries, backoffBaseMs, jitterMs, sleepFn, randFn });
  const summary = summarizeBatch(results);
  const next = computeNextHealthState(prev, summary);

  const update = { ...next, last_quality_check_at: isoFn(), updated_at: isoFn() };
  const { error: writeErr } = await supabase
    .from('llm_cloud_health')
    .update(update)
    .eq('id', SINGLETON_ID);
  if (writeErr) throw new Error(`[cloud-cap-feeder] write failed (fail-loud): ${writeErr.message}`);

  return { summary, update };
}

// CLI entry — opt-in (npm run continuity:cloud-cap-feeder). Real client + supabase; no background daemon.
if (isMainModule(import.meta.url)) {
  (async () => {
    const supabase = createSupabaseServiceClient();
    const client = createAnthropicClient();
    const { summary, update } = await feedCloudHealth({ supabase, client });
    console.log(`[cloud-cap-feeder] probes=${summary.total} cap_failures=${summary.capFailures} error_rate=${summary.errorRate} p95=${summary.p95LatencyMs}ms -> status=${update.status} consecutive_failures=${update.consecutive_failures}`);
    process.exit(0);
  })().catch((e) => {
    console.error(`[cloud-cap-feeder] ${e.message}`);
    process.exit(1);
  });
}
