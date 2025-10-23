#!/usr/bin/env node
/**
 * Query SD Phase Handoff Details (using PostgreSQL client)
 *
 * Usage: node scripts/query-handoff-db.js SD-VWC-A11Y-001 PLAN LEAD
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function queryHandoff(sdId, fromPhase, toPhase) {
  console.log(`\n🔍 Querying handoff for ${sdId} (${fromPhase} → ${toPhase})...\n`);

  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    const result = await client.query(`
      SELECT
        id,
        sd_id,
        from_phase,
        to_phase,
        handoff_type,
        status,
        created_at,
        accepted_at,
        rejected_at,
        created_by,
        executive_summary,
        deliverables_manifest,
        key_decisions,
        known_issues,
        resource_utilization,
        action_items,
        completeness_report,
        metadata,
        rejection_reason,
        template_id,
        validation_details,
        validation_score,
        validation_passed
      FROM sd_phase_handoffs
      WHERE sd_id = $1
        AND from_phase = $2
        AND to_phase = $3
        AND status = 'pending_acceptance'
      ORDER BY created_at DESC
      LIMIT 1
    `, [sdId, fromPhase, toPhase]);

    if (result.rows.length === 0) {
      console.log('❌ No pending handoff found\n');
      process.exit(1);
    }

    const data = result.rows[0];

    // Pretty print the handoff details
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📋 HANDOFF DETAILS: ${sdId}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`🆔 Handoff ID: ${data.id}`);
    console.log(`📊 Status: ${data.status}`);
    console.log(`🏷️  Type: ${data.handoff_type || 'N/A'}`);
    console.log(`➡️  From Phase: ${data.from_phase}`);
    console.log(`⬅️  To Phase: ${data.to_phase}`);
    console.log(`👤 Created By: ${data.created_by || 'N/A'}`);
    console.log(`📅 Created: ${data.created_at}`);
    console.log(`✅ Accepted: ${data.accepted_at || 'N/A'}`);
    console.log(`❌ Rejected: ${data.rejected_at || 'N/A'}\n`);

    if (data.template_id) {
      console.log(`📝 Template: ${data.template_id}\n`);
    }

    if (data.validation_passed !== null) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log('✅ VALIDATION STATUS');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`Passed: ${data.validation_passed ? 'YES' : 'NO'}`);
      console.log(`Score: ${data.validation_score || 'N/A'}`);
      if (data.validation_details) {
        console.log(`Details: ${JSON.stringify(data.validation_details, null, 2)}`);
      }
      console.log('');
    }

    console.log('─────────────────────────────────────────────────────────────');
    console.log('📝 EXECUTIVE SUMMARY');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.executive_summary || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('📦 DELIVERABLES MANIFEST');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.deliverables_manifest || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('🎯 KEY DECISIONS');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.key_decisions || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('⚠️  KNOWN ISSUES');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.known_issues || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('📊 RESOURCE UTILIZATION');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.resource_utilization || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('✅ ACTION ITEMS');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.action_items || 'N/A');
    console.log('');

    console.log('─────────────────────────────────────────────────────────────');
    console.log('📋 COMPLETENESS REPORT');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(data.completeness_report || 'N/A');
    console.log('');

    if (data.metadata) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log('📊 METADATA');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(JSON.stringify(data.metadata, null, 2));
      console.log('');
    }

    if (data.rejection_reason) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log('❌ REJECTION REASON');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(data.rejection_reason);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Query error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Parse arguments
const sdId = process.argv[2] || 'SD-VWC-A11Y-001';
const fromPhase = process.argv[3] || 'PLAN';
const toPhase = process.argv[4] || 'LEAD';

queryHandoff(sdId, fromPhase, toPhase)
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
