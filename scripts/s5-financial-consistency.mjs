#!/usr/bin/env node
/**
 * SD-LEO-INFRA-S5-FINANCIAL-SINGLE-SOURCE-001 FR-3 (invariant check) + FR-4 (backfill)
 *
 * For each venture's CURRENT S5 truth_financial_model artifact, compare its persisted verdict
 * (decision/reasons/blockProgression/remediationRoute) to a deterministic recompute over the
 * artifact's own inputs. Report divergence; with --apply, lockstep-repair the diverged artifacts
 * (targeted jsonb verdict update — no LLM regen). Service-role only (RLS).
 *
 * Usage:
 *   node scripts/s5-financial-consistency.mjs            # FR-3: check + report divergence (dry-run)
 *   node scripts/s5-financial-consistency.mjs --apply    # FR-4: backfill diverged ventures
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { evaluateS5Consistency, persistRecomputedVerdict, S5_ARTIFACT_TYPE } from '../lib/eva/s5-financial-consistency.js';
import { recomputeKillGateVerdict } from '../lib/eva/kill-gate-recompute.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: venture_artifacts grows with
  // portfolio size — is_current narrows to ~1 row/venture but is not provably <1000 long-term.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('venture_artifacts')
      .select('venture_id, lifecycle_stage, artifact_data')
      .eq('artifact_type', S5_ARTIFACT_TYPE)
      .eq('is_current', true)
      .eq('lifecycle_stage', 5)
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`venture_artifacts read failed: ${e.message}`);
  }

  console.log(`[s5-consistency] current S5 truth_financial_model artifacts: ${rows.length}`);
  const diverged = [];
  for (const r of rows) {
    const artifacts = [{ artifactType: S5_ARTIFACT_TYPE, payload: r.artifact_data }];
    const c = evaluateS5Consistency(artifacts);
    if (c.applicable && !c.consistent) {
      diverged.push(r);
      console.log(`  ✗ venture ${r.venture_id}: persisted='${c.persistedDecision}' recomputed='${c.recomputedDecision}'`);
    }
  }

  console.log(`[s5-consistency] diverged ventures: ${diverged.length}`);
  if (diverged.length === 0) { console.log('[s5-consistency] INVARIANT OK — all current S5 artifacts are consistent.'); return; }
  if (!APPLY) { console.log('[s5-consistency] DRY-RUN — re-run with --apply to lockstep-repair the diverged artifacts above.'); return; }

  let fixed = 0;
  for (const r of diverged) {
    const artifacts = [{ artifactType: S5_ARTIFACT_TYPE, payload: r.artifact_data }];
    const verdict = recomputeKillGateVerdict(5, artifacts);
    const res = await persistRecomputedVerdict(supabase, { ventureId: r.venture_id, stage: 5, payload: r.artifact_data, verdict, logger: console });
    if (res.updated) fixed++;
  }
  console.log(`[s5-consistency] BACKFILLED ${fixed} diverged artifact(s).`);
  // exit non-zero if any diverged remain unfixed (so CI can fail loud)
  if (fixed < diverged.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
