#!/usr/bin/env node
/**
 * Factory waste ledger — retroactive quantification of known waste classes.
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-4)
 *
 * Report-first v1 (no DB table until a consumer exists). Quantifies each known
 * waste class from existing data where attribution holds; classes that cannot be
 * honestly quantified are listed UNQUANTIFIABLE with the reason — never guessed.
 *
 * USAGE
 *   node scripts/cost-waste-ledger.mjs            # human report
 *   node scripts/cost-waste-ledger.mjs --json     # machine-readable
 *
 * METHOD (storm class): the 2026-06-10 venture_artifacts purge quarantined 2,684
 * duplicate-regeneration rows into venture_artifacts_storm_quarantine_20260610
 * (SD-LEO-FIX-REMEDIATE-ARRESTED-VENTURE-001; root cause fixed 2026-06-07 by
 * d624465baf). Each quarantined row was one LLM regeneration of an artifact that
 * already existed. Token estimate: content chars / 4 ≈ output tokens (standard
 * heuristic), input assumed >= output for generation prompts (conservative 1:1).
 * Priced at the gemini-2.5-flash tier (EVA artifact writers run the flash family).
 * These are lower-bound ESTIMATES — thinking tokens and orchestration overhead
 * are not modeled.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PRICING, COST_CAVEAT } from '../lib/cost/llm-pricing.js';

const STORM_QUARANTINE = 'venture_artifacts_storm_quarantine_20260610';
const PAGE = 1000; // PostgREST max-rows clamp

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Estimate tokens/USD for one storm row (pure; exported shape for tests via --json). */
export function stormRowEstimate(contentLen) {
  const outT = Math.round((contentLen || 0) / 4);
  const inT = outT; // conservative 1:1 prompt assumption, stated in METHOD
  const p = PRICING['gemini-2.5-flash'];
  return { inT, outT, usd: (inT / 1e6) * p.in + (outT / 1e6) * p.out };
}

async function quantifyStormClass() {
  const byType = {};
  let rows = 0, inT = 0, outT = 0, usd = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from(STORM_QUARANTINE)
      .select('artifact_type,content')
      .range(offset, offset + PAGE - 1);
    if (error) return { error: error.message };
    for (const r of data || []) {
      const e = stormRowEstimate((r.content || '').length);
      rows++; inT += e.inT; outT += e.outT; usd += e.usd;
      const k = r.artifact_type || 'unknown';
      if (!byType[k]) byType[k] = { rows: 0, usd: 0 };
      byType[k].rows++; byType[k].usd += e.usd;
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows, inT, outT, usd, byType };
}

async function main() {
  const json = process.argv.includes('--json');
  const storm = await quantifyStormClass();

  const ledger = {
    generated_at: new Date().toISOString(),
    caveat: COST_CAVEAT,
    classes: [
      storm.error
        ? { class: 'venture_artifacts_storm', status: 'UNQUANTIFIABLE', reason: `quarantine table read failed: ${storm.error} (table may have been dropped after the reversibility window)` }
        : {
            class: 'venture_artifacts_storm',
            status: 'QUANTIFIED',
            method: 'quarantined duplicate-regeneration rows (2026-06-10 purge); content chars/4 ≈ output tokens, 1:1 input assumption, gemini-2.5-flash pricing; lower bound (thinking/orchestration overhead unmodeled)',
            rows: storm.rows,
            est_input_tokens: storm.inT,
            est_output_tokens: storm.outT,
            est_usd: Number(storm.usd.toFixed(2)),
            by_artifact_type: Object.fromEntries(Object.entries(storm.byType || {}).map(([k, v]) => [k, { rows: v.rows, est_usd: Number(v.usd.toFixed(2)) }])),
            root_cause_fix: 'eva-orchestrator generic fallback re-persist — fixed d624465baf 2026-06-07 (SD-LEO-FIX-FIX-STAGE-SKIP-001)',
          },
      {
        class: 'retry_threshold_hits',
        status: 'UNQUANTIFIABLE',
        reason: 'retry-state-manager stores per-session counters in ephemeral .claude/retry-state-*.json files (deleted with sessions); no durable record of how many retries reached the gate, and retried tool calls are not LLM-token events in model_usage_log',
      },
      {
        class: 'exit_hang_duplicate_runs',
        status: 'UNQUANTIFIABLE',
        reason: 'UV-abort/exit-hang reruns are indistinguishable from legitimate runs in model_usage_log (no rerun marker); quantification would require a dedup fingerprint the logger does not record',
      },
      {
        class: 'main_session_tokens',
        status: 'UNQUANTIFIABLE',
        reason: 'Claude Code main-session tokens (the dominant factory cost) are not captured in model_usage_log at all — out of scope for v1 (LEAD decision); revisit if a harness-level usage export becomes available',
      },
    ],
  };

  if (json) {
    console.log(JSON.stringify(ledger, null, 2));
    return;
  }

  console.log('\n=== FACTORY WASTE LEDGER ===');
  console.log(ledger.caveat + '\n');
  for (const c of ledger.classes) {
    console.log(`— ${c.class}: ${c.status}`);
    if (c.status === 'QUANTIFIED') {
      console.log(`   rows=${c.rows}  est tokens in/out=${c.est_input_tokens}/${c.est_output_tokens}  est $${c.est_usd}`);
      for (const [k, v] of Object.entries(c.by_artifact_type)) console.log(`     ${k}: ${v.rows} rows ≈ $${v.est_usd}`);
      console.log(`   method: ${c.method}`);
      console.log(`   root cause fix: ${c.root_cause_fix}`);
    } else {
      console.log(`   reason: ${c.reason}`);
    }
    console.log('');
  }
}

main().catch((e) => { console.error('[cost-waste-ledger] ERROR', e.message); process.exit(1); });
