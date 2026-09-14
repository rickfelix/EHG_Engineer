#!/usr/bin/env node

/**
 * ARCHIVED -- DO NOT RUN. Retained for historical reference only.
 *
 * Backfill integration_operationalization for PRDs with NULL values.
 *
 * Usage (historical, disabled below):
 *   node scripts/backfill-prd-integration.js              # Execute backfill
 *   node scripts/backfill-prd-integration.js --dry-run     # Preview only
 *   node scripts/backfill-prd-integration.js --batch-size 50  # Custom batch size
 *
 * GUARDED -- SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-4).
 *
 * This script's `while (offset < nullCount)` loop (below) re-queries the shrinking
 * `integration_operationalization IS NULL` predicate at a FIXED offset per batch while its
 * own writes shrink that same predicate -- each subsequent page silently skips roughly half
 * of what remains, with no error. It ran to completion believing it had processed every NULL
 * row; in fact it touched only 707 of them, and generateIntegrationContent() below writes
 * FABRICATED boilerplate prose (not real per-PRD content) into a column a downstream gate
 * (GATE_INTEGRATION_SECTION_VALIDATION) reads as a completeness signal -- those 707 rows
 * scored 100%/complete despite carrying no genuine content until corrected by
 * scripts/one-off/backfill-707-fabricated-integration.mjs (SD-LEO-FIX-REPLACE-707-
 * FABRICATED-001). Re-running this script today would both re-introduce that fabricated
 * content on any row whose integration_operationalization is NULL again, and repeat the
 * same pagination defect. It exits immediately below rather than being deleted, so this
 * history and root-cause note remain in-repo.
 */

if (true) {
  console.error(
    '\nARCHIVED SCRIPT -- REFUSING TO RUN.\n' +
    'scripts/archive/one-time/backfill-prd-integration.js has a pagination bug (see header\n' +
    'comment) that fabricates non-informative content and silently skips rows. It has been\n' +
    'guarded per SD-LEO-FIX-REPLACE-707-FABRICATED-001 and must not be re-run.\n' +
    'If a NULL-backfill is genuinely needed, use the corrected, keyset-paginated approach in\n' +
    'scripts/one-off/backfill-integration-operationalization-v2.mjs instead.\n'
  );
  process.exit(1);
}

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(args.find((_, i, a) => a[i - 1] === '--batch-size') || '100', 10);

/**
 * Generate integration_operationalization content based on SD type and PRD context.
 */
function generateIntegrationContent(prd, sdType) {
  sdType = sdType || 'general';

  // Base template - all PRDs get this structure
  const content = {
    consumers: [
      {
        name: 'LEO Protocol Engine',
        frequency: 'on-demand',
        interaction: `Reads PRD data during ${sdType} workflow execution`
      }
    ],
    dependencies: [
      {
        name: 'product_requirements_v2',
        type: 'upstream',
        contract: 'JSONB schema with required fields per SD type',
        failure_handling: 'Validation gate rejects incomplete PRDs'
      }
    ],
    data_contracts: [
      {
        contract_name: 'PRD Schema Contract',
        schema: 'product_requirements_v2 table schema',
        validation: 'Gate validation at PLAN-TO-EXEC handoff',
        versioning: 'Schema version tracked in migrations'
      }
    ],
    runtime_config: {
      feature_flags: [],
      environment_variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      deployment_considerations: 'Database-backed PRD storage, no additional deployment needed'
    },
    observability_rollout: {
      monitoring: ['PRD quality scores tracked in handoff results'],
      alerts: [],
      rollout_strategy: 'Immediate - database records updated in place',
      rollback_trigger: 'PRD quality score drops below gate threshold',
      rollback_procedure: 'Restore from sd_phase_handoffs audit trail'
    }
  };

  // Enrich based on SD type
  if (sdType === 'feature') {
    content.consumers.push({
      name: 'Frontend Application (EHG)',
      frequency: 'runtime',
      interaction: 'Feature implementation driven by PRD requirements'
    });
    content.dependencies.push({
      name: 'strategic_directives_v2',
      type: 'upstream',
      contract: 'SD metadata provides scope and priority',
      failure_handling: 'SD must exist before PRD creation'
    });
  } else if (sdType === 'infrastructure') {
    content.consumers.push({
      name: 'CI/CD Pipeline',
      frequency: 'on-deploy',
      interaction: 'Infrastructure changes validated against PRD specs'
    });
  } else if (sdType === 'fix') {
    content.consumers.push({
      name: 'QA Validation Pipeline',
      frequency: 'on-merge',
      interaction: 'Fix verification against PRD acceptance criteria'
    });
  }

  return content;
}

async function main() {
  console.log('');
  console.log('============================================================');
  console.log('  PRD integration_operationalization Backfill');
  console.log('============================================================');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`  Batch Size: ${BATCH_SIZE}`);
  console.log('');

  // Count total and NULL records
  const { count: totalCount } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true });

  const { count: nullCount } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true })
    .is('integration_operationalization', null);

  const { count: populatedCount } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true })
    .not('integration_operationalization', 'is', null);

  console.log(`  Total PRDs: ${totalCount}`);
  console.log(`  Already populated: ${populatedCount}`);
  console.log(`  NULL (need backfill): ${nullCount}`);
  console.log('');

  if (nullCount === 0) {
    console.log('  ✅ All PRDs already have integration_operationalization');
    console.log('============================================================');
    return;
  }

  // Fetch NULL records in batches
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let offset = 0;

  while (offset < nullCount) {
    const { data: prds, error } = await supabase
      .from('product_requirements_v2')
      .select('id, sd_id, title, status')
      .is('integration_operationalization', null)
      .range(offset, offset + BATCH_SIZE - 1)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`  ❌ Query error at offset ${offset}:`, error.message);
      errors++;
      break;
    }

    if (!prds || prds.length === 0) break;

    // Batch lookup sd_types from strategic_directives_v2
    const sdIds = [...new Set(prds.map(p => p.sd_id).filter(Boolean))];
    const sdTypeMap = {};
    if (sdIds.length > 0) {
      // Some sd_id values are sd_key format, others are UUIDs
      const sdKeys = sdIds.filter(id => id.startsWith('SD-'));
      const uuids = sdIds.filter(id => !id.startsWith('SD-'));

      if (sdKeys.length > 0) {
        const { data: sds } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, sd_type')
          .in('sd_key', sdKeys);
        if (sds) sds.forEach(sd => { sdTypeMap[sd.sd_key] = sd.sd_type; });
      }
      if (uuids.length > 0) {
        const { data: sds } = await supabase
          .from('strategic_directives_v2')
          .select('uuid_id, sd_type')
          .in('uuid_id', uuids);
        if (sds) sds.forEach(sd => { sdTypeMap[sd.uuid_id] = sd.sd_type; });
      }
    }

    for (const prd of prds) {
      processed++;
      const sdType = sdTypeMap[prd.sd_id] || 'general';
      const content = generateIntegrationContent(prd, sdType);

      if (DRY_RUN) {
        if (processed <= 3) {
          console.log(`  [DRY RUN] Would update: ${prd.id} (${prd.sd_type || 'unknown'})`);
        }
      } else {
        const { error: updateError } = await supabase
          .from('product_requirements_v2')
          .update({ integration_operationalization: content })
          .eq('id', prd.id);

        if (updateError) {
          console.error(`  ❌ Update failed for ${prd.id}:`, updateError.message);
          errors++;
        } else {
          updated++;
        }
      }
    }

    offset += BATCH_SIZE;

    // Progress indicator every batch
    if (!DRY_RUN) {
      console.log(`  Batch complete: ${processed}/${nullCount} processed, ${updated} updated`);
    }
  }

  // Final verification
  if (!DRY_RUN) {
    const { count: remainingNull } = await supabase
      .from('product_requirements_v2')
      .select('*', { count: 'exact', head: true })
      .is('integration_operationalization', null);

    console.log('');
    console.log('  RESULTS');
    console.log('  ────────────────────────────────');
    console.log(`  Processed: ${processed}`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Errors:    ${errors}`);
    console.log(`  Remaining NULL: ${remainingNull}`);
    console.log('');

    if (remainingNull === 0) {
      console.log('  ✅ SUCCESS: All PRDs now have integration_operationalization');
    } else {
      console.log(`  ⚠️  ${remainingNull} PRDs still have NULL values`);
    }
  } else {
    console.log('');
    console.log(`  [DRY RUN] Would update ${processed} PRDs`);
    console.log('  Run without --dry-run to execute');
  }

  console.log('============================================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
