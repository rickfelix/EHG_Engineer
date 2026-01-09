#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

/**
 * Add success_metrics to all 7 child SDs of SD-GENESIS-COMPLETE-001
 *
 * These were created without success_metrics, which is required for LEAD-TO-PLAN handoff.
 */

const SUCCESS_METRICS = {
  'SD-GENESIS-RESEARCH-001': [
    'Genesis-LEO integration map documented',
    'Field mapping for auto-population completed',
    'Integration points documented with API contracts'
  ],

  'SD-GENESIS-DATAMODEL-001': [
    'Missing columns added (updated_at, ratified_at)',
    'epistemic_status enum expanded',
    'simulation_sessions FK to strategic_directives_v2 established',
    'Migration passes in staging environment'
  ],

  'SD-GENESIS-PRD-001': [
    'Claude API integration operational',
    'PRD generation produces valid product_requirements_v2 records',
    'SD created before PRD (proper linkage enforced)'
  ],

  'SD-GENESIS-STAGE16-17-001': [
    'Soul extraction wired to orchestrator',
    'Production generation methods implemented',
    'Stage vocabulary documented (Genesis vs Venture stages)'
  ],

  'SD-GENESIS-UI-001': [
    'SimulationWizard component functional',
    'PatternSelector displays scaffold_patterns',
    'Genesis dashboard accessible at /genesis route'
  ],

  'SD-GENESIS-UI-002': [
    'SimulationResults component displays simulation data',
    'RatificationDialog allows one-click ratification',
    'Ratify endpoint protected by authentication'
  ],

  'SD-GENESIS-E2E-001': [
    'Full simulation lifecycle E2E test passes',
    'Ratification flow E2E test passes',
    'LLM call performance within acceptable bounds (<5s)'
  ]
};

async function updateSuccessMetrics() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🎯 Updating success_metrics for 7 Genesis child SDs...\n');

    const sdIds = Object.keys(SUCCESS_METRICS);
    const results = [];

    for (const sdId of sdIds) {
      const metrics = SUCCESS_METRICS[sdId];

      console.log(`📝 Updating ${sdId}...`);
      console.log(`   Metrics (${metrics.length}):`);
      metrics.forEach((m, i) => console.log(`     ${i + 1}. ${m}`));

      const result = await client.query(`
        UPDATE strategic_directives_v2
        SET success_metrics = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, title, success_metrics
      `, [JSON.stringify(metrics), sdId]);

      if (result.rowCount === 0) {
        console.log(`   ❌ SD not found: ${sdId}`);
        results.push({ sdId, status: 'NOT_FOUND' });
      } else {
        console.log('   ✅ Updated successfully');
        results.push({ sdId, status: 'SUCCESS', data: result.rows[0] });
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    const successful = results.filter(r => r.status === 'SUCCESS').length;
    const notFound = results.filter(r => r.status === 'NOT_FOUND').length;

    console.log(`✅ Successfully updated: ${successful}/${sdIds.length}`);
    if (notFound > 0) {
      console.log(`❌ Not found: ${notFound}`);
      results.filter(r => r.status === 'NOT_FOUND').forEach(r => {
        console.log(`   - ${r.sdId}`);
      });
    }

    // Verify all SDs now have success_metrics
    console.log('\n🔍 Verification: Checking all child SDs...');
    const verifyResult = await client.query(`
      SELECT
        id,
        title,
        jsonb_array_length(success_metrics) as metric_count,
        success_metrics
      FROM strategic_directives_v2
      WHERE parent_sd_id = 'SD-GENESIS-COMPLETE-001'
      ORDER BY id
    `);

    console.log(`\nFound ${verifyResult.rows.length} child SDs:`);
    verifyResult.rows.forEach(row => {
      const hasMetrics = row.metric_count > 0;
      const status = hasMetrics ? '✅' : '❌';
      console.log(`${status} ${row.id}: ${row.metric_count || 0} metrics`);
      if (hasMetrics && row.success_metrics) {
        // PostgreSQL JSONB is already parsed as an object/array
        const metrics = Array.isArray(row.success_metrics)
          ? row.success_metrics
          : JSON.parse(row.success_metrics);
        metrics.forEach((m, i) => {
          console.log(`     ${i + 1}. ${m}`);
        });
      }
    });

    const allHaveMetrics = verifyResult.rows.every(r => r.metric_count > 0);
    if (allHaveMetrics) {
      console.log('\n🎉 SUCCESS: All child SDs now have success_metrics!');
    } else {
      console.log('\n⚠️  WARNING: Some child SDs still missing success_metrics');
    }

  } catch (error) {
    console.error('❌ Error updating success_metrics:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the update
updateSuccessMetrics().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
