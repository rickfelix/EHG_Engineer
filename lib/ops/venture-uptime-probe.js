/**
 * Venture Uptime Probe
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-4
 *
 * External reachability probe for deployed venture URLs. Writes results into
 * venture_deployments.metadata.probe (2-consecutive-failure threshold before surfacing
 * unreachable, per SD risk mitigation — avoids false alarms on transient network blips)
 * and, once unreachable is CONFIRMED, drags today's ops_product_health.uptime_pct down
 * to reflect the outage regardless of what internal service_telemetry reported.
 *
 * GROUND-TRUTH CORRECTION (documented, not silently patched): the SD scope names
 * `venture_deployments.url` as the probe target, but venture_deployments is an empty,
 * never-populated table (0 rows, live-verified 2026-07-11) — the real live URLs (e.g.
 * MarketLens) live in `ventures.deployment_url`. `ensureDeploymentRows()` below seeds
 * venture_deployments from ventures.deployment_url (idempotent upsert on venture_id+url)
 * so the probe target table matches the SD's literal wording AND the actual data.
 * `ventures.status` is NOT used to filter "live" — both known deployment_url rows
 * (MarketLens, CronGenius) currently carry status='cancelled' post-pivot (2026-07-08),
 * so a status filter would silently probe nothing and contradict the SD's own smoke
 * test ("point the probe at the live MarketLens URL").
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: ensureDeploymentRows iterates every
// venture with a deployment_url to seed venture_deployments — a silent 1000-row cap would drop
// ventures as the factory scales, exactly the silent-green-pass the docstring warns against.
// Paginate (fail-closed: ventures query error still throws).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const CONSECUTIVE_FAILURE_THRESHOLD = 2;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Perform a single reachability check against a URL.
 * @param {string} url
 * @param {{ fetchFn?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<{ reachable: boolean, statusCode: number|null, error: string|null }>}
 */
export async function checkReachability(url, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!fetchFn) {
    return { reachable: false, statusCode: null, error: 'no_fetch_implementation' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { method: 'GET', signal: controller.signal });
    const statusCode = res.status;
    return { reachable: statusCode >= 200 && statusCode < 500, statusCode, error: null };
  } catch (err) {
    return { reachable: false, statusCode: null, error: (err && err.message) || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PURE: compute the next probe state given prior metadata.probe state + this check's result.
 * Exported for unit testing without any network/DB dependency.
 *
 * @param {{ consecutive_failures?: number }|null} priorProbe - prior metadata.probe (or null/undefined for first check)
 * @param {{ reachable: boolean, statusCode: number|null, error: string|null }} checkResult
 * @param {string} nowIso
 * @returns {{ probe: object, justSurfacedUnreachable: boolean }}
 *   justSurfacedUnreachable is true only on the exact check that crosses the threshold
 *   (i.e. the transition into "surfaced", not every check while already surfaced) —
 *   callers use this to decide whether to escalate/log, not just to persist state.
 */
export function computeNextProbeState(priorProbe, checkResult, nowIso) {
  const priorConsecutiveFailures = Number.isFinite(priorProbe?.consecutive_failures) ? priorProbe.consecutive_failures : 0;
  const wasSurfaced = priorConsecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;

  const consecutive_failures = checkResult.reachable ? 0 : priorConsecutiveFailures + 1;
  const surfaced = consecutive_failures >= CONSECUTIVE_FAILURE_THRESHOLD;

  return {
    probe: {
      reachable: checkResult.reachable,
      status_code: checkResult.statusCode,
      last_error: checkResult.error,
      consecutive_failures,
      surfaced,
      last_checked_at: nowIso,
    },
    justSurfacedUnreachable: surfaced && !wasSurfaced,
  };
}

/**
 * Ensure a venture_deployments row exists for every venture with a deployment_url.
 * Idempotent: upserts on (venture_id, url) so a re-run never duplicates rows.
 * Adversarial-review fix: lookup/insert failures used to be console.warn'd and silently
 * dropped — a venture whose seed row could never be created was indistinguishable from a
 * venture that legitimately has no deployment_url, which would let runVentureUptimeProbe
 * report checked=0/errors=[] (a silent green pass) even when every venture failed to seed.
 * Errors are now returned alongside rows so the caller can fold them into its own summary.
 *
 * @returns {Promise<{ rows: Array<{ id: string, venture_id: string, url: string, metadata: object }>, errors: string[] }>}
 */
export async function ensureDeploymentRows(supabase) {
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, deployment_url')
      .not('deployment_url', 'is', null)
      .neq('deployment_url', '')
      .order('id', { ascending: true })); // id tiebreaker: stable page boundaries (FR-6)
  } catch (vErr) {
    throw new Error(`ensureDeploymentRows: ventures query failed: ${vErr.message}`);
  }

  const rows = [];
  const errors = [];
  for (const v of ventures || []) {
    const { data: existing, error: findErr } = await supabase
      .from('venture_deployments')
      .select('id, venture_id, url, metadata')
      .eq('venture_id', v.id)
      .eq('url', v.deployment_url)
      .maybeSingle();
    if (findErr) {
      const msg = `${v.id}: lookup failed: ${findErr.message}`;
      console.warn(`[uptime-probe] ${msg}`);
      errors.push(msg);
      continue;
    }

    if (existing) {
      rows.push(existing);
      continue;
    }

    // QF-20260711-772: sha is NOT NULL with no column default (inherited from the
    // table's original deploy-log schema); these seed rows aren't real deploy events,
    // so 'unknown' documents that honestly rather than fabricating a fake commit hash.
    // status has a CHECK constraint (planned|deployed_no_traffic|routed|failed|rolled_back)
    // -- 'seeded' isn't a member. 'routed' is the accurate value: we only seed a row for a
    // venture that already has ventures.deployment_url set, i.e. a URL presumed to be
    // receiving traffic (the exact thing this probe verifies).
    const { data: created, error: insErr } = await supabase
      .from('venture_deployments')
      .insert({ venture_id: v.id, url: v.deployment_url, sha: 'unknown', actor: 'venture-ops-actuals-sweep', status: 'routed', metadata: {} })
      .select('id, venture_id, url, metadata')
      .single();
    if (insErr) {
      const msg = `${v.id}: seed insert failed: ${insErr.message}`;
      console.warn(`[uptime-probe] ${msg}`);
      errors.push(msg);
      continue;
    }
    rows.push(created);
  }
  return { rows, errors };
}

/**
 * Merge a confirmed-unreachable probe result into today's ops_product_health row.
 * Never inflates uptime (takes the min of any existing value and 0); never touches
 * error_rate/p95/request-count fields owned by the telemetry-derived collector.
 */
export async function surfaceUnreachableToProductHealth(supabase, ventureId, metricDate) {
  const { data: existing } = await supabase
    .from('ops_product_health')
    .select('uptime_pct')
    .eq('venture_id', ventureId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  const nextUptime = existing?.uptime_pct != null ? Math.min(existing.uptime_pct, 0) : 0;

  const { error } = await supabase
    .from('ops_product_health')
    .upsert(
      { venture_id: ventureId, metric_date: metricDate, uptime_pct: nextUptime, computed_at: new Date().toISOString() },
      { onConflict: 'venture_id,metric_date' }
    );
  if (error) console.warn(`[uptime-probe] failed to surface unreachable to ops_product_health for ${ventureId}: ${error.message}`);
}

/**
 * Run one probe cycle across all deployed ventures.
 * @param {{ supabase: object, fetchFn?: typeof fetch, timeoutMs?: number, nowIso?: string }} params
 * @returns {Promise<{ ventures_seedable: number, checked: number, reachable: number, unreachable: number, newly_surfaced: number, errors: string[] }>}
 */
export async function runVentureUptimeProbe({ supabase, fetchFn, timeoutMs, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  const metricDate = now.split('T')[0];
  const summary = { ventures_seedable: 0, checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: [] };

  const { rows, errors: seedErrors } = await ensureDeploymentRows(supabase);
  summary.ventures_seedable = rows.length + seedErrors.length;
  summary.errors.push(...seedErrors);

  for (const row of rows) {
    summary.checked++;
    const checkResult = await checkReachability(row.url, { fetchFn, timeoutMs });
    const { probe, justSurfacedUnreachable } = computeNextProbeState(row.metadata?.probe, checkResult, now);

    if (probe.reachable) summary.reachable++; else summary.unreachable++;
    if (justSurfacedUnreachable) summary.newly_surfaced++;

    const { error } = await supabase
      .from('venture_deployments')
      .update({ metadata: { ...(row.metadata || {}), probe } })
      .eq('id', row.id);
    if (error) summary.errors.push(`${row.venture_id}: ${error.message}`);

    if (probe.surfaced) {
      await surfaceUnreachableToProductHealth(supabase, row.venture_id, metricDate);
    }
  }

  return summary;
}

export const CONSTANTS = { CONSECUTIVE_FAILURE_THRESHOLD, DEFAULT_TIMEOUT_MS };
