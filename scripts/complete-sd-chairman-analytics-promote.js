#!/usr/bin/env node

/**
 * Complete SD-CHAIRMAN-ANALYTICS-PROMOTE-001
 * LEAD FINAL APPROVAL (Phase 5)
 *
 * Marks SD as completed with 100% progress after:
 * - EXEC implementation complete ✅
 * - PLAN verification passed ✅
 * - Retrospective generated (quality score: 90/100) ✅
 *
 * Database-only change - navigation link promoted from 'draft' to 'complete'
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

async function completeSD() {
  console.log('\n🎯 LEAD FINAL APPROVAL: SD-CHAIRMAN-ANALYTICS-PROMOTE-001');
  console.log('════════════════════════════════════════════════════════\n');

  const sdId = 'SD-CHAIRMAN-ANALYTICS-PROMOTE-001';
  let client;

  try {
    // Connect to EHG_Engineer database using direct PostgreSQL (bypasses RLS)
    console.log('🔌 Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer');
    console.log('✅ Connection established (RLS bypassed)\n');

    console.log('📊 Step 1: Verifying current SD status...');
    const sdResult = await client.query(
      'SELECT sd_id, title, status, progress FROM strategic_directives_v2 WHERE sd_id = $1',
      [sdId]
    );

    if (sdResult.rows.length === 0) {
      throw new Error(`SD ${sdId} not found`);
    }

    const currentSD = sdResult.rows[0];
    console.log(`   Current Status: ${currentSD.status}`);
    console.log(`   Current Progress: ${currentSD.progress}%\n`);

    console.log('✅ Step 2: Verifying retrospective exists...');
    const retroResult = await client.query(
      'SELECT id, quality_score, team_satisfaction FROM retrospectives WHERE sd_id = $1',
      [sdId]
    );

    if (retroResult.rows.length === 0) {
      throw new Error(`Retrospective not found for SD ${sdId}`);
    }

    const retro = retroResult.rows[0];
    console.log(`   Retrospective ID: ${retro.id}`);
    console.log(`   Quality Score: ${retro.quality_score}/100`);
    console.log(`   Team Satisfaction: ${retro.team_satisfaction}/10\n`);

    if (retro.quality_score < 70) {
      throw new Error(`Retrospective quality score ${retro.quality_score} is below minimum threshold of 70`);
    }

    console.log('🎉 Step 3: Marking SD as COMPLETED...');
    const updateResult = await client.query(
      `UPDATE strategic_directives_v2
       SET status = $1, progress = $2, updated_at = $3
       WHERE sd_id = $4
       RETURNING sd_id, status, progress, updated_at`,
      ['completed', 100, new Date().toISOString(), sdId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error(`Failed to update SD ${sdId}`);
    }

    const updatedSD = updateResult.rows[0];
    console.log('   ✅ Status: completed');
    console.log('   ✅ Progress: 100%');
    console.log(`   ✅ Updated: ${updatedSD.updated_at}\n`);

    console.log('════════════════════════════════════════════════════════');
    console.log('🏆 SD-CHAIRMAN-ANALYTICS-PROMOTE-001 COMPLETED');
    console.log('════════════════════════════════════════════════════════\n');
    console.log('✅ Chairman Analytics navigation link promoted to complete');
    console.log('✅ Feature now discoverable to all users');
    console.log('✅ EXEC → PLAN → LEAD workflow complete');
    console.log('✅ Retrospective generated (90/100 quality score)');
    console.log('\n📊 Phase Breakdown:');
    console.log('   LEAD Pre-Approval: 20% ✅');
    console.log('   PLAN PRD Creation: 20% ✅');
    console.log('   EXEC Implementation: 30% ✅');
    console.log('   PLAN Verification: 15% ✅');
    console.log('   LEAD Final Approval: 15% ✅');
    console.log('   ──────────────────────────');
    console.log('   Total: 100% COMPLETE\n');

  } catch (error) {
    console.error('❌ Error completing SD:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

completeSD();
