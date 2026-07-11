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
 * @returns {Promise<Array<{ id: string, venture_id: string, url: string, metadata: object }>>}
 */
export async function ensureDeploymentRows(supabase) {
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, deployment_url')
    .not('deployment_url', 'is', null)
    .neq('deployment_url', '');
  if (vErr) throw new Error(`ensureDeploymentRows: ventures query failed: ${vErr.message}`);

  const rows = [];
  for (const v of ventures || []) {
    const { data: existing, error: findErr } = await supabase
      .from('venture_deployments')
      .select('id, venture_id, url, metadata')
      .eq('venture_id', v.id)
      .eq('url', v.deployment_url)
      .maybeSingle();
    if (findErr) { console.warn(`[uptime-probe] lookup failed for venture ${v.id}: ${findErr.message}`); continue; }

    if (existing) {
      rows.push(existing);
      continue;
    }

    const { data: created, error: insErr } = await supabase
      .from('venture_deployments')
      .insert({ venture_id: v.id, url: v.deployment_url, actor: 'venture-ops-actuals-sweep', status: 'seeded', metadata: {} })
      .select('id, venture_id, url, metadata')
      .single();
    if (insErr) { console.warn(`[uptime-probe] seed insert failed for venture ${v.id}: ${insErr.message}`); continue; }
    rows.push(created);
  }
  return rows;
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
 * @returns {Promise<{ checked: number, reachable: number, unreachable: number, newly_surfaced: number, errors: string[] }>}
 */
export async function runVentureUptimeProbe({ supabase, fetchFn, timeoutMs, nowIso } = {}) {
  const now = nowIso || new Date().toISOString();
  const metricDate = now.split('T')[0];
  const summary = { checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: [] };

  const rows = await ensureDeploymentRows(supabase);

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
