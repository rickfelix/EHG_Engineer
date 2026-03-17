#!/usr/bin/env node

/**
 * PLAN Agent - Accept EXEC→PLAN Handoff for SD-AGENT-ADMIN-003 Sprint 3
 *
 * Updates handoff status from 'pending_acceptance' to 'accepted'
 * Triggers PLAN supervisor verification
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function acceptHandoff() {
  console.log('🔄 PLAN AGENT: Accepting EXEC→PLAN Handoff');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Update handoff status to accepted
    const updateSQL = `
      UPDATE sd_phase_handoffs
      SET status = 'accepted'
      WHERE sd_id = $1
        AND handoff_type = 'EXEC-to-PLAN'
        AND status = 'pending_acceptance'
      RETURNING *;
    `;

    const result = await client.query(updateSQL, ['SD-AGENT-ADMIN-003']);

    if (result.rows.length === 0) {
      console.error('❌ No pending handoff found for SD-AGENT-ADMIN-003');
      process.exit(1);
    }

    const handoff = result.rows[0];
    const metadata = typeof handoff.metadata === 'string'
      ? JSON.parse(handoff.metadata)
      : handoff.metadata;

    console.log('✅ HANDOFF ACCEPTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Handoff ID:', handoff.id);
    console.log('   SD:', handoff.sd_id);
    console.log('   Type:', handoff.handoff_type);
    console.log('   Status:', handoff.status);
    console.log('   Accepted By: PLAN_AGENT');
    console.log('');
    console.log('📋 SPRINT 3 SUMMARY:');
    console.log('   Sprint:', metadata.sprint);
    console.log('   Features:', metadata.feature_completeness_pct + '% complete');
    console.log('   E2E Tests:', metadata.e2e_coverage_pct + '% (14/26 passing)');
    console.log('   QA Verdict:', metadata.qa_verdict);
    console.log('   SD Progress:', metadata.sd_progress_pct + '%');
    console.log('');
    console.log('🎯 NEXT: PLAN Supervisor Verification');
    console.log('   - Review all sub-agent results');
    console.log('   - Validate Sprint 3 completion');
    console.log('   - Decision on sprint-based vs full SD approach');

  } catch (err) {
    console.error('❌ Error accepting handoff:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

acceptHandoff();
