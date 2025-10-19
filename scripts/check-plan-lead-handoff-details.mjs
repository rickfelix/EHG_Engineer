#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dedlbzhpgkmetvhbkyzq',
  password: process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 PLAN→LEAD Handoff Analysis for Deferred Work');
    console.log('════════════════════════════════════════════════════════════════\n');

    const handoff = await client.query(`
      SELECT 
        executive_summary,
        known_issues,
        key_decisions,
        action_items,
        completeness_report
      FROM sd_phase_handoffs
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
        AND handoff_type = 'PLAN-to-LEAD'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (handoff.rows.length > 0) {
      const h = handoff.rows[0];
      
      console.log('Executive Summary:');
      console.log(h.executive_summary);
      console.log('\n');
      
      console.log('Known Issues:');
      console.log(h.known_issues);
      console.log('\n');
      
      console.log('Key Decisions:');
      console.log(h.key_decisions);
      console.log('\n');
      
      // Check for mentions of deferred, follow-up, E2E, etc.
      const text = JSON.stringify(h).toLowerCase();
      console.log('Deferred Work Indicators:');
      if (text.includes('e2e')) console.log('   ✓ E2E tests mentioned');
      if (text.includes('defer')) console.log('   ✓ Deferred work mentioned');
      if (text.includes('follow-up')) console.log('   ✓ Follow-up SD mentioned');
      if (text.includes('infrastructure')) console.log('   ✓ Infrastructure blocker mentioned');
      console.log('');
    }

    // Also check the EXEC→PLAN handoff
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 EXEC→PLAN Handoff Analysis');
    console.log('════════════════════════════════════════════════════════════════\n');

    const execPlan = await client.query(`
      SELECT known_issues, deliverables_manifest
      FROM sd_phase_handoffs
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
        AND handoff_type = 'EXEC-to-PLAN'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (execPlan.rows.length > 0) {
      console.log('Known Issues:');
      console.log(execPlan.rows[0].known_issues);
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
