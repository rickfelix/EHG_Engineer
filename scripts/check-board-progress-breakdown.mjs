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
    console.log('📊 Progress Breakdown: SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Query progress breakdown
    const result = await client.query(`
      SELECT get_progress_breakdown('SD-BOARD-GOVERNANCE-001') as breakdown
    `);

    console.log(JSON.stringify(result.rows[0].breakdown, null, 2));
    console.log('\n');

    // Check PRD status
    const prdCheck = await client.query(`
      SELECT id, status, created_at
      FROM product_requirements_v2
      WHERE strategic_directive_id = 'SD-BOARD-GOVERNANCE-001'
    `);
    console.log('📋 PRD Status:');
    if (prdCheck.rows.length > 0) {
      console.log(`   Found: ${prdCheck.rows[0].id}`);
      console.log(`   Status: ${prdCheck.rows[0].status}`);
    } else {
      console.log('   ❌ No PRD found for this SD');
    }
    console.log('');

    // Check handoffs
    const handoffCheck = await client.query(`
      SELECT from_phase, to_phase, status, created_at
      FROM sd_phase_handoffs
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at
    `);
    console.log('🔄 Handoffs:');
    if (handoffCheck.rows.length > 0) {
      handoffCheck.rows.forEach(h => {
        console.log(`   ${h.from_phase}→${h.to_phase}: ${h.status}`);
      });
    } else {
      console.log('   ❌ No handoffs found');
    }
    console.log('');

    // Check sub-agent results
    const subAgentCheck = await client.query(`
      SELECT sub_agent_code, verdict, created_at
      FROM sub_agent_execution_results
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at DESC
    `);
    console.log('🤖 Sub-Agent Results:');
    if (subAgentCheck.rows.length > 0) {
      subAgentCheck.rows.forEach(sa => {
        console.log(`   ${sa.sub_agent_code}: ${sa.verdict}`);
      });
    } else {
      console.log('   ❌ No sub-agent results found');
    }
    console.log('');

    // Check user stories
    const userStoryCheck = await client.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN acceptance_status = 'accepted' THEN 1 ELSE 0 END) as accepted
      FROM user_stories
      WHERE prd_id IN (
        SELECT id FROM product_requirements_v2
        WHERE strategic_directive_id = 'SD-BOARD-GOVERNANCE-001'
      )
    `);
    console.log('📖 User Stories:');
    if (userStoryCheck.rows[0].total > 0) {
      console.log(`   Total: ${userStoryCheck.rows[0].total}`);
      console.log(`   Accepted: ${userStoryCheck.rows[0].accepted}`);
    } else {
      console.log('   ❌ No user stories found');
    }
    console.log('');

    // Check retrospective
    const retroCheck = await client.query(`
      SELECT id, status, created_at
      FROM retrospectives
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
    `);
    console.log('🔍 Retrospective:');
    if (retroCheck.rows.length > 0) {
      console.log(`   Found: ${retroCheck.rows[0].id}`);
      console.log(`   Status: ${retroCheck.rows[0].status}`);
    } else {
      console.log('   ❌ No retrospective found');
    }
    console.log('');

    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
