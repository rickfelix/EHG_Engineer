#!/usr/bin/env node
/**
 * scripts/operator/feed-venture-operating-burn.mjs
 *
 * Fail-soft scheduled feeder for the venture-scoped operating-burn substrate
 * (SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1).
 *
 *   FR-2  INFRA BURN: pull Workers usage counts from Cloudflare GraphQL Analytics
 *         API and convert to a dollar estimate via published unit pricing.
 *   FR-3  AI BURN: attempt Cloudflare AI Gateway Logs API for a gateway scoped to
 *         the venture. No sibling SD adds LLM-calling code for every venture yet,
 *         so ai_cost_status stays unattested until a gateway exists, NEVER 0.
 *
 * FAIL-SOFT: each step is independently try/caught. A step failure (missing
 * credentials, API error, no gateway yet) leaves that input unattested and NEVER
 * writes a fabricated value.
 *
 * Disjoint from operator_cash_burn_monthly / income_capture_monthly: this script
 * never reads or writes either fleet-wide singleton table (TR-1).
 *
 * SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-G: --script-name (the venture Cloudflare
 * Worker name) is now REQUIRED for a real infra measurement. Without it, infra is
 * left honestly unattested rather than falling back to an account-wide query --
 * see lib/operator/cloudflare-cost-adapter.js docblock for why.
 *
 * Usage:
 *   node scripts/operator/feed-venture-operating-burn.mjs --venture-id UUID --source-application apex_niche_ai --script-name apexniche-ai
 *   node scripts/operator/feed-venture-operating-burn.mjs --venture-id UUID --source-application apex_niche_ai --script-name apexniche-ai --dry-run
 */

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createCloudflareCostAdapter } from '../../lib/operator/cloudflare-cost-adapter.js';
import { periodMonthOf, upsertBurnInputs } from '../../lib/operator/venture-burn-substrate.js';

const DRY_RUN = process.argv.includes('--dry-run');

function log(step, msg) { console.log(`[venture-operating-burn] ${step}: ${msg}`); }
function warn(step, msg) { console.warn(`[venture-operating-burn] ${step}: WARN ${msg}`); }

export function parseFlag(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

export function estimateInfraCostUsd(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const requests = Number(usage.requests || 0);
  const cpuMs = Number(usage.cpuMs || 0);
  const REQUEST_RATE_PER_MILLION = 0.30;
  const CPU_MS_RATE_PER_MILLION = 0.02;
  const usd = (requests / 1e6) * REQUEST_RATE_PER_MILLION + (cpuMs / 1e6) * CPU_MS_RATE_PER_MILLION;
  return Number(usd.toFixed(4));
}

export function sumWorkersUsage(graphqlData) {
  const rows = graphqlData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  if (rows.length === 0) return null;
  let requests = 0;
  for (const row of rows) {
    requests += Number(row?.sum?.requests || 0);
  }
  return { requests, cpuMs: 0 };
}

export function sumAiGatewayCost(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return null;
  let total = 0;
  let any = false;
  for (const entry of logs) {
    if (typeof entry?.cost === 'number' && Number.isFinite(entry.cost)) {
      total += entry.cost;
      any = true;
    }
  }
  return any ? Number(total.toFixed(4)) : null;
}

async function main(opts) {
  const {
    argv = process.argv,
    env = process.env,
    supabase = createSupabaseServiceClient(),
    cloudflareAdapterFactory = createCloudflareCostAdapter,
  } = opts || {};
  const ventureId = parseFlag(argv, '--venture-id');
  const sourceApplication = parseFlag(argv, '--source-application');
  const scriptName = parseFlag(argv, '--script-name');
  if (!ventureId) throw new Error('--venture-id is required');
  if (!sourceApplication) throw new Error('--source-application is required');

  const nowIso = new Date().toISOString();
  const periodMonth = periodMonthOf(Date.now());
  const endDate = nowIso.slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = { venture_id: ventureId, source_application: sourceApplication, period_month: periodMonth, dry_run: DRY_RUN, infra: null, ai: null };

  const cf = cloudflareAdapterFactory(env);
  if (!cf) {
    warn('FR-2/FR-3', 'CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID absent -- both inputs left unattested');
    result.infra = { written: false, reason: 'credentials absent' };
    result.ai = { written: false, reason: 'credentials absent', status: 'unattested' };
    console.log('[venture-operating-burn] result ' + JSON.stringify(result));
    return result;
  }

  if (!scriptName) {
    warn('FR-2', 'no --script-name configured for this venture -- infra left unattested (never account-wide)');
    result.infra = { written: false, reason: 'no script-name configured for this venture yet' };
  } else {
    try {
      const usageData = await cf.readWorkersUsage(startDate, endDate, scriptName);
      const usage = sumWorkersUsage(usageData);
      const infraCostUsd = estimateInfraCostUsd(usage);
      if (infraCostUsd == null) {
        result.infra = { written: false, reason: 'no usage data returned (left stale)' };
      } else {
        log('FR-2', `infra cost estimate = $${infraCostUsd} (${usage.requests} requests, published-rate estimate, scriptName=${scriptName})`);
        if (!DRY_RUN) {
          await upsertBurnInputs(ventureId, sourceApplication, periodMonth, { infra_cost_usd: infraCostUsd }, supabase, nowIso);
        }
        result.infra = { written: !DRY_RUN, value_usd: infraCostUsd, requests: usage.requests };
      }
    } catch (e) {
      warn('FR-2', `failed (fail-soft): ${e.message}`);
      result.infra = { written: false, error: e.message };
    }
  }

  try {
    const gatewayId = env[`CLOUDFLARE_AI_GATEWAY_ID_${sourceApplication.toUpperCase()}`] || null;
    if (!gatewayId) {
      result.ai = { written: false, reason: 'no AI Gateway configured for this venture yet', status: 'unattested' };
    } else {
      const logs = await cf.readAiGatewayCost(gatewayId, startDate, endDate);
      const aiCostUsd = sumAiGatewayCost(Array.isArray(logs) ? logs : logs?.result);
      if (aiCostUsd == null) {
        result.ai = { written: false, reason: 'gateway returned no cost-bearing logs (left unattested)', status: 'unattested' };
      } else {
        log('FR-3', `AI gateway cost = $${aiCostUsd} (gateway=${gatewayId})`);
        if (!DRY_RUN) {
          await upsertBurnInputs(ventureId, sourceApplication, periodMonth, { ai_cost_usd: aiCostUsd, ai_cost_status: 'measured' }, supabase, nowIso);
        }
        result.ai = { written: !DRY_RUN, value_usd: aiCostUsd, status: 'measured' };
      }
    }
  } catch (e) {
    warn('FR-3', `failed (fail-soft): ${e.message}`);
    result.ai = { written: false, error: e.message, status: 'unattested' };
  }

  console.log('[venture-operating-burn] result ' + JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[venture-operating-burn] FATAL', e); process.exit(1); });
}

export { main };
