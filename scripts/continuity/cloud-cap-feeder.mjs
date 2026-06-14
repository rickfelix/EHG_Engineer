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
 * SAFETY: opt-in CLI (no background spend); only writer of these columns. Stale-rolling (feeder
 * stopped mid-degradation) is contained by detectFromDb's Layer-2 quiescent-fleet guard (0 live
 * workers -> NORMAL) plus the evaluator's liveness rung. Injectable client/clock/supabase => tests
 * make ZERO live Anthropic calls or DB writes.
 *
 * @module scripts/continuity/cloud-cap-feeder
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createAnthropicClient } from '../eva-support/_internal/anthropic-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

/** Error categories that count as a cloud-cap failure (vs operator/config errors like 401/400). */
export const CAP_FAILURE_CATEGORIES = Object.freeze(new Set(['rate_limit', 'overloaded', 'server', 'timeout']));

export const DEFAULT_PROBE_COUNT = 5;
export const SINGLETON_ID = 'singleton';

/**
 * Categorize an Anthropic SDK error into a cloud-cap signal. PURE.
 * @param {any} err
 * @returns {'rate_limit'|'overloaded'|'server'|'timeout'|'other'}
 */
export function categorizeProbeError(err) {
  if (!err) return 'other';
  const status = typeof err.status === 'number' ? err.status : null;
  const type = err.error?.type || err.type || null;
  const name = err.name || '';
  const msg = err.message || '';
  if (status === 429) return 'rate_limit';
  if (status === 529 || type === 'overloaded_error') return 'overloaded';
  if (status != null && status >= 500) return 'server';
  if (/timeout/i.test(name) || /timeout/i.test(msg) || err.code === 'ETIMEDOUT') return 'timeout';
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
 * Uses models.list() — no token spend — as the health probe.
 * @param {object} args
 * @param {object} args.client - Anthropic SDK client (injected; fake in tests)
 * @param {number} [args.count=DEFAULT_PROBE_COUNT]
 * @param {() => number} [args.nowFn=Date.now]
 * @returns {Promise<Array<{ok:boolean, latencyMs?:number, category?:string}>>}
 */
export async function runProbeBatch({ client, count = DEFAULT_PROBE_COUNT, nowFn = Date.now } = {}) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const t0 = nowFn();
    try {
      await client.models.list();
      results.push({ ok: true, latencyMs: Math.max(0, nowFn() - t0) });
    } catch (err) {
      results.push({ ok: false, category: categorizeProbeError(err) });
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
 * @returns {Promise<{summary:object, update:object}>}
 */
export async function feedCloudHealth({ supabase, client, nowFn = Date.now, nowIso, probeCount = DEFAULT_PROBE_COUNT } = {}) {
  const isoFn = nowIso || (() => new Date(nowFn()).toISOString());
  const { data: prev, error: readErr } = await supabase
    .from('llm_cloud_health')
    .select('error_rate_threshold, consecutive_failures, baseline_latency_p95_ms')
    .eq('id', SINGLETON_ID)
    .maybeSingle();
  if (readErr) throw new Error(`[cloud-cap-feeder] read failed (fail-loud): ${readErr.message}`);

  const results = await runProbeBatch({ client, count: probeCount, nowFn });
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
