#!/usr/bin/env node
/**
 * Cost/token GOVERNOR CLI — the enforcing/consumer layer over the report-only
 * cost instruments. SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-2)
 *
 * Wires the pure decision core (lib/cost/governor.js) to real data (model_usage_log)
 * and durable logging (cost_governor_log via lib/cost/governor-log.js). This is the
 * alarm→ENFORCE path the two report-only scripts never had.
 *
 * MODE: default is OBSERVE-ONLY (decisions are logged, NOT enforced). Pass --enforce
 * to actually block/throttle. FAIL-OPEN throughout: any read/eval error logs and
 * ALLOWS rather than blocking — a mis-firing governor must never stall the fleet.
 *
 * USAGE
 *   node scripts/cost-governor.mjs --simulate-storm --target <key> --count <n> [--enforce]
 *   node scripts/cost-governor.mjs --decide-tier --purpose <p> [--model <m>]
 *   node scripts/cost-governor.mjs --check [--max-daily-usd 12] [--max-daily-calls 3000] [--spike 2.0]
 *   node scripts/cost-governor.mjs --tune            # tune thresholds from recent outcomes
 *   [--json]                                          # machine-readable on any command
 *
 * EXIT: 0 healthy/allowed, 1 anomaly-or-throttle-enforced (LOUD), 2 misconfig.
 *
 * NOTE: commands set process.exitCode and RETURN rather than calling process.exit()
 * — an abrupt process.exit() while the supabase/undici socket is mid-close aborts
 * with a libuv assertion (UV_HANDLE_CLOSING) on Windows. Letting the loop drain
 * exits cleanly with the intended code.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_THRESHOLDS, evaluateRegen, decideTier, classifyAnomaly, tuneThresholds,
} from '../lib/cost/governor.js';
import { writeGovernorDecision } from '../lib/cost/governor-log.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

function parseArgs(argv) {
  const a = {
    simulateStorm: false, decideTier: false, check: false, tune: false,
    json: false, enforce: false,
    target: null, count: 0, purpose: null, model: 'claude-opus',
    maxDailyUsd: DEFAULT_THRESHOLDS.anomaly.maxDailyUsd,
    maxDailyCalls: DEFAULT_THRESHOLDS.anomaly.maxDailyCalls,
    spike: DEFAULT_THRESHOLDS.anomaly.spike,
    days: 14,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--simulate-storm') a.simulateStorm = true;
    else if (k === '--decide-tier') a.decideTier = true;
    else if (k === '--check') a.check = true;
    else if (k === '--tune') a.tune = true;
    else if (k === '--json') a.json = true;
    else if (k === '--enforce') a.enforce = true;
    else if (k === '--target') a.target = argv[++i];
    else if (k === '--count') a.count = parseInt(argv[++i], 10);
    else if (k === '--purpose') a.purpose = argv[++i];
    else if (k === '--model') a.model = argv[++i];
    else if (k === '--max-daily-usd') a.maxDailyUsd = parseFloat(argv[++i]);
    else if (k === '--max-daily-calls') a.maxDailyCalls = parseInt(argv[++i], 10);
    else if (k === '--spike') a.spike = parseFloat(argv[++i]);
    else if (k === '--days') a.days = parseInt(argv[++i], 10);
  }
  return a;
}

function loadEnv() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(resolve(here, '..', '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if ((m[1] === 'SUPABASE_URL' || m[1] === 'NEXT_PUBLIC_SUPABASE_URL')) url = url || v;
      if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') key = key || v;
    }
  } catch { /* ignore */ }
  return { url, key };
}

/**
 * STABLE SEAM for the eval decision rule (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001).
 * The rule module is not live yet — this loader returns null when it is absent so
 * decideTier fails OPEN (no down-tier). When the eval SD ships a module exporting a
 * { clears(cheaperTier, usageStats) } rule at the path below, routing activates with
 * zero further change here.
 */
async function loadEvalDecisionRule() {
  try {
    const mod = await import('../lib/eva/model-tier-decision-rule.js');
    const rule = mod?.decisionRule || mod?.default || null;
    return rule && typeof rule.clears === 'function' ? rule : null;
  } catch {
    return null; // dependency not live — fail open
  }
}

async function pullUsageRows(supabase, sinceISO) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 (bug fix): .limit(50000) does NOT
  // override the PostgREST server-side max-rows cap (1000) — a requested limit above the cap is
  // still clamped, so cost/anomaly evaluation was silently working off at most 1000 rows of usage
  // history regardless of the intended window. Paginate to completion, keeping 50000 as the same
  // DECLARED sampling cap (fetchAllPaginated's maxRows) the original .limit(50000) intended.
  try {
    return await fetchAllPaginated(() => supabase
      .from('model_usage_log')
      .select('reported_model_name,subagent_type,phase,sd_id,metadata,captured_at')
      .gte('captured_at', sinceISO)
      .order('captured_at', { ascending: true })
      .order('id', { ascending: true }), // unique tiebreaker (FR-6)
      { maxRows: 50000 });
  } catch (e) {
    throw new Error(e.message);
  }
}

function out(json, obj, humanLines) {
  if (json) console.log(JSON.stringify(obj, null, 2));
  else humanLines.forEach((l) => console.log(l));
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.enforce ? 'enforce' : 'observe';
  const { url, key } = loadEnv();
  const supabase = (url && key && !key.startsWith('encrypted:')) ? createClient(url, key) : null;

  // --- FR-2a: regen-storm throttle (simulate) -----------------------------
  if (args.simulateStorm) {
    if (!args.target || !Number.isFinite(args.count) || args.count <= 0) {
      console.error('[cost-governor] --simulate-storm requires --target <key> --count <n>');
      process.exitCode = 2; return;
    }
    const now = Date.now();
    const events = Array.from({ length: args.count }, (_, i) => ({ at: now - i * 1000, targetKey: args.target }));
    const decision = evaluateRegen(args.target, events, DEFAULT_THRESHOLDS.regen, now);
    await writeGovernorDecision(supabase, {
      decisionType: 'regen', action: decision.action, targetKey: args.target,
      mode, measured: decision.measured, reason: decision.reason, thresholds: DEFAULT_THRESHOLDS.regen,
    });
    const throttled = decision.action === 'throttle';
    const enforced = throttled && mode === 'enforce';
    out(args.json, { command: 'simulate-storm', mode, decision, enforced }, [
      `${throttled ? '🚫 THROTTLE' : '✅ ALLOW'} [${mode}] ${decision.reason}`,
      enforced ? '   ENFORCED — further regens on this target are blocked.' :
        (throttled ? '   observe-only — logged, NOT blocked (pass --enforce to block).' : ''),
    ].filter(Boolean));
    process.exitCode = enforced ? 1 : 0; return;
  }

  // --- FR-2b: down-tier routing -------------------------------------------
  if (args.decideTier) {
    const evalRule = await loadEvalDecisionRule();
    let usageStats = {};
    if (supabase) {
      try {
        const sinceISO = new Date(Date.now() - args.days * 86400_000).toISOString();
        const rows = await pullUsageRows(supabase, sinceISO);
        const forPurpose = args.purpose ? rows.filter((r) => r.subagent_type === args.purpose) : rows;
        usageStats = { calls: forPurpose.length, purpose: args.purpose || 'all', model: args.model };
      } catch (e) {
        console.warn('[cost-governor] usage read failed (fail-open):', e.message);
      }
    }
    const decision = decideTier(args.model, usageStats, evalRule);
    await writeGovernorDecision(supabase, {
      decisionType: 'tier', action: decision.downTiered ? `down-tier→${decision.tier}` : 'hold',
      targetKey: args.purpose || args.model, mode, measured: usageStats, reason: decision.reason,
    });
    out(args.json, { command: 'decide-tier', mode, decision, evalRuleLive: !!evalRule }, [
      `${decision.downTiered ? '⬇️  DOWN-TIER' : '➡️  HOLD'} ${decision.reason}`,
      evalRule ? '' : '   (eval decision rule not live — fail-open, no down-tier)',
    ].filter(Boolean));
    return;
  }

  // --- FR-2c: anomaly check (fail-LOUD) -----------------------------------
  if (args.check) {
    if (!supabase) { console.error('[cost-governor] --check needs SUPABASE_URL/SERVICE_ROLE_KEY'); process.exitCode = 2; return; }
    let daySeries = [];
    try {
      const sinceISO = new Date(Date.now() - args.days * 86400_000).toISOString();
      const rows = await pullUsageRows(supabase, sinceISO);
      const { rowCost } = await import('../lib/cost/llm-pricing.js');
      const byDay = {};
      for (const r of rows) {
        const d = (r.captured_at || '').slice(0, 10);
        if (!d) continue;
        if (!byDay[d]) byDay[d] = { day: d, usd: 0, calls: 0 };
        byDay[d].usd += rowCost(r).usd; byDay[d].calls++;
      }
      const today = new Date().toISOString().slice(0, 10);
      daySeries = Object.values(byDay).filter((d) => d.day < today).sort((a, b) => a.day.localeCompare(b.day));
    } catch (e) {
      console.warn('[cost-governor] --check read failed (fail-open, no anomaly asserted):', e.message);
    }
    const cfg = { maxDailyUsd: args.maxDailyUsd, maxDailyCalls: args.maxDailyCalls, spike: args.spike };
    const result = classifyAnomaly(daySeries, cfg);
    await writeGovernorDecision(supabase, {
      decisionType: 'anomaly', action: result.anomaly ? `anomaly:${result.severity}` : 'healthy',
      targetKey: result.day, mode, measured: { breaches: result.breaches, day: result.day }, reason: result.breaches.join('; ') || 'healthy', thresholds: cfg,
    });
    if (result.anomaly) {
      out(args.json, { command: 'check', mode, result }, [
        `🚨 [cost-governor] ${result.day} COST ANOMALY (${result.severity}): ${result.breaches.join('; ')}`,
      ]);
      process.exitCode = 1; return; // LOUD — never silent
    }
    out(args.json, { command: 'check', mode, result }, [
      `✅ [cost-governor] ${result.day || 'no complete-day data'} healthy`,
    ]);
    return;
  }

  // --- FR-2d: self-tune thresholds ----------------------------------------
  if (args.tune) {
    let outcomes = { regenReduced: null, gateRateHeld: null };
    if (supabase) {
      try {
        const { data } = await supabase.from('cost_governor_log')
          .select('decision_type,action,created_at')
          .eq('decision_type', 'regen')
          .order('created_at', { ascending: false })
          .limit(200);
        const throttles = (data || []).filter((r) => r.action === 'throttle').length;
        // Heuristic v1: fewer throttles in the recent window than the prior window ⇒ regen reduced.
        const recent = (data || []).slice(0, 100).filter((r) => r.action === 'throttle').length;
        const prior = (data || []).slice(100, 200).filter((r) => r.action === 'throttle').length;
        outcomes = { regenReduced: recent <= prior, gateRateHeld: true, recentThrottles: recent, priorThrottles: prior, total: throttles };
      } catch (e) {
        console.warn('[cost-governor] --tune read failed (fail-open, hold thresholds):', e.message);
      }
    }
    const next = tuneThresholds(DEFAULT_THRESHOLDS, outcomes);
    await writeGovernorDecision(supabase, {
      decisionType: 'tune', action: next._tune_note, targetKey: 'regen.maxPerWindow',
      mode, measured: outcomes, reason: next._tune_note, thresholds: next,
    });
    out(args.json, { command: 'tune', mode, outcomes, next }, [
      `🔧 [cost-governor] ${next._tune_note}`,
      `   regen.maxPerWindow: ${DEFAULT_THRESHOLDS.regen.maxPerWindow} → ${next.regen.maxPerWindow}`,
    ]);
    return;
  }

  console.error('[cost-governor] no command. Use --simulate-storm | --decide-tier | --check | --tune (see --help in source).');
  process.exitCode = 2;
}

main().catch((e) => { console.error('[cost-governor] FATAL (fail-open):', e?.message || e); process.exitCode = 2; });
