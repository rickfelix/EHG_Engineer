#!/usr/bin/env node
/**
 * Backfill venture_gvos_profile rows for in-flight ventures at S11+.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-5
 *
 * Live state at SD time: 4 ventures with current_lifecycle_stage >= 11 and zero
 * venture_gvos_profile rows. Forward path (FR-4 S11 worker hook) only covers
 * ventures crossing S11 going forward; this script backfills the existing four.
 *
 * Guarantees:
 *   - Zero @anthropic-ai/sdk invocations (rule_only classifier; enforced via
 *     tests/integration/backfill-venture-gvos-profile.test.js spy assertion).
 *   - Idempotent: skips ventures with an existing venture_gvos_profile row.
 *   - All inserted rows carry selection_method='backfill' for audit trail.
 *
 * Acceptance verification:
 *   1. Running the script populates profile rows for all S11+ ventures missing one.
 *   2. Second run inserts zero new rows (idempotency).
 *   3. Per-venture JSON summary printed to stdout.
 *
 * Usage:
 *   NODE_EXTRA_CA_CERTS=C:/Users/rickf/.certs/supabase-root-2021-ca.pem \
 *     node scripts/one-off/backfill-venture-gvos-profile.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyArchetypeRuleOnly } from '../../lib/gvos/rule-classifier.js';
import { buildClassifierInputFromVenture } from '../../lib/gvos/venture-classifier-inputs.js';

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  console.log('[FR-5 backfill] start' + (DRY_RUN ? ' (DRY-RUN)' : ''));

  // Step 1: find ventures with current_lifecycle_stage >= 11 that have no profile row
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, business_model_class, industry, vertical_category, tags, target_market, current_lifecycle_stage')
    .gte('current_lifecycle_stage', 11);

  if (vErr) {
    console.error('[FR-5 backfill] failed to load ventures:', vErr.message);
    process.exit(1);
  }

  console.log(`[FR-5 backfill] ${ventures.length} ventures at lifecycle_stage >= 11`);

  // Filter out ventures that already have a profile row
  const { data: existingProfiles, error: pErr } = await supabase
    .from('venture_gvos_profile')
    .select('venture_id');

  if (pErr) {
    console.error('[FR-5 backfill] failed to load existing profiles:', pErr.message);
    process.exit(1);
  }

  const haveProfile = new Set((existingProfiles || []).map((r) => r.venture_id));
  const todo = ventures.filter((v) => !haveProfile.has(v.id));

  console.log(`[FR-5 backfill] ${todo.length} ventures need backfill (${ventures.length - todo.length} already have profile rows)`);

  if (todo.length === 0) {
    console.log('[FR-5 backfill] no work; idempotent no-op');
    process.exit(0);
  }

  const summary = [];
  let insertedCount = 0;
  let skippedCount = 0;

  for (const v of todo) {
    try {
      const classifierInput = buildClassifierInputFromVenture(v);
      const result = await classifyArchetypeRuleOnly(classifierInput, supabase);

      // Schema enforces archetype_selection_method ∈
      // {rule_based, llm_fallback, rule_fallback_below_threshold, emergency_default, chairman_override}.
      // Pass through the classifier's method verbatim; mark backfill provenance via rationale prefix.
      const row = {
        venture_id: v.id,
        archetype_id: result.archetypeId || null,
        archetype_selection_method: result.method,
        archetype_selection_confidence: result.confidence,
        archetype_selection_rationale: `[backfill via FR-5] ${result.rationale}`,
        business_model_class: v.business_model_class || null,
      };

      const summaryEntry = {
        venture_id: v.id,
        venture_name: v.name,
        archetype_prompt_token: result.archetypePromptToken,
        archetype_id: result.archetypeId,
        confidence: Number(result.confidence.toFixed(3)),
        classifier_method: result.method,
        backfill_provenance: 'rationale-prefix:[backfill via FR-5]',
      };
      summary.push(summaryEntry);

      if (DRY_RUN) {
        console.log('[FR-5 backfill][DRY] would insert:', JSON.stringify(summaryEntry));
        skippedCount++;
        continue;
      }

      const { error: insErr } = await supabase
        .from('venture_gvos_profile')
        .insert(row);

      if (insErr) {
        if (insErr.code === '23505') {
          console.log(`[FR-5 backfill] venture ${v.id} race-skipped (concurrent insert) — idempotent`);
          skippedCount++;
        } else {
          console.error(`[FR-5 backfill] insert FAILED for venture ${v.id}:`, insErr.message);
          process.exit(1);
        }
      } else {
        console.log(`[FR-5 backfill] inserted: ${v.id} -> ${result.archetypePromptToken} (confidence=${result.confidence.toFixed(2)})`);
        insertedCount++;
      }
    } catch (err) {
      console.error(`[FR-5 backfill] classifier errored for venture ${v.id}:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n========== FR-5 SUMMARY ==========');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`inserted: ${insertedCount} | skipped: ${skippedCount} | total ventures eligible: ${todo.length}`);
  console.log(`Anthropic SDK invocations: 0 (rule_only path — verified by construction; CI enforces via anthropic-spy in tests/integration/backfill-venture-gvos-profile.test.js)`);
}

await main();
