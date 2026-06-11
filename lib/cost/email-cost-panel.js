/**
 * Coordinator-email LLM cost panel.
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-5) — window spend + trailing 24h vs the
 * trailing 7-day daily average, top models by cost. Pure render given fetched rows;
 * the single exported entry fetches (paginated, limit<=1000) then renders.
 *
 * Fail-soft contract: callers wrap in try/catch and omit the panel on any error.
 *
 * @module lib/cost/email-cost-panel
 */

import { rowCost, COST_CAVEAT } from './llm-pricing.js';

const DAY_MS = 86_400_000;
const PAGE = 1000; // PostgREST max-rows clamp — never request more per page

/** Fetch model_usage_log rows since a timestamp via supabase-js, paginated. */
async function fetchRows(db, sinceISO) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('model_usage_log')
      .select('reported_model_name,metadata,captured_at')
      .gte('captured_at', sinceISO)
      .order('captured_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`model_usage_log read failed: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    if (offset > 100_000) break; // safety
  }
  return all;
}

/**
 * Pure aggregation for the panel (exported for unit tests).
 * @param {Array<object>} rows rows since (now - 8d)
 * @param {{sinceTs: number|null, now: number}} opts window start (last email) + now
 */
export function computeCostPanel(rows, { sinceTs, now }) {
  let windowUsd = 0, windowCalls = 0;
  let dayUsd = 0;
  const byModel = {};
  const dailyUsd = {}; // yyyy-mm-dd -> usd, for the trailing-7d average
  const dayStart = now - DAY_MS;

  for (const r of rows) {
    const ts = new Date(r.captured_at).getTime();
    const c = rowCost(r);
    const d = String(r.captured_at || '').slice(0, 10);
    dailyUsd[d] = (dailyUsd[d] || 0) + c.usd;
    if (ts >= dayStart) {
      dayUsd += c.usd;
      const k = r.reported_model_name || 'unknown';
      if (!byModel[k]) byModel[k] = 0;
      byModel[k] += c.usd;
    }
    if (sinceTs != null && ts >= sinceTs) { windowUsd += c.usd; windowCalls++; }
  }

  // trailing 7 complete days BEFORE today
  const today = new Date(now).toISOString().slice(0, 10);
  const completeDays = Object.keys(dailyUsd).filter((d) => d < today).sort().slice(-7);
  const avgDailyUsd = completeDays.length
    ? completeDays.reduce((a, d) => a + dailyUsd[d], 0) / completeDays.length
    : 0;
  const topModels = Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const trend = avgDailyUsd > 0 ? dayUsd / avgDailyUsd : null;

  return { windowUsd, windowCalls, dayUsd, avgDailyUsd, topModels, trend };
}

/** Render html+text panel strings from the computed aggregates (exported for tests). */
export function formatCostPanel(p) {
  const usd = (n) => '$' + n.toFixed(2);
  const trendTxt = p.trend == null ? '' : p.trend > 1.5 ? ` (⚠ ${p.trend.toFixed(1)}x the 7-day avg ${usd(p.avgDailyUsd)})` : ` (7-day avg ${usd(p.avgDailyUsd)}/day)`;
  const models = p.topModels.map(([m, v]) => `${m} ${usd(v)}`).join(' · ') || 'none';
  const winTxt = p.windowCalls ? `${usd(p.windowUsd)} since last email · ` : '';
  const html = `<p style="font-size:13px;color:#777;margin:0 0 6px">💸 LLM est: ${winTxt}<b>${usd(p.dayUsd)}</b> last 24h${trendTxt}<br><span style="font-size:12px">top: ${models}</span><br><span style="font-size:11px;color:#aaa">${COST_CAVEAT}</span></p>`;
  const text = `LLM est: ${winTxt}${usd(p.dayUsd)} last 24h${trendTxt} — top: ${models}\n(${COST_CAVEAT})`;
  return { html, text };
}

/**
 * Fetch + compute + render. The one call sites use.
 * @param {object} db supabase client
 * @param {{sinceTs: number|null, now?: number}} opts
 */
export async function renderCostPanel(db, { sinceTs = null, now = Date.now() } = {}) {
  const sinceISO = new Date(now - 8 * DAY_MS).toISOString();
  const rows = await fetchRows(db, sinceISO);
  return formatCostPanel(computeCostPanel(rows, { sinceTs, now }));
}

export default { renderCostPanel, computeCostPanel, formatCostPanel };
