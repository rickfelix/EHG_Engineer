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
    console.log('🔍 Missing Elements Check: SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Check PRD
    console.log('1. PRD Check:');
    const prdCheck = await client.query(`
      SELECT id, status, approved_by, approval_date
      FROM product_requirements_v2
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
    `);
    if (prdCheck.rows.length > 0) {
      const prd = prdCheck.rows[0];
      console.log(`   ✅ PRD exists: ${prd.id}`);
      console.log(`   Status: ${prd.status}`);
      console.log(`   Approved by: ${prd.approved_by || 'NOT APPROVED'}`);
      console.log(`   Approval date: ${prd.approval_date || 'N/A'}`);
    } else {
      console.log('   ❌ No PRD found');
    }
    console.log('');

    // Check handoffs
    console.log('2. Handoffs Check:');
    const handoffCheck = await client.query(`
      SELECT from_phase, to_phase, status, created_at
      FROM sd_phase_handoffs
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at
    `);
    console.log(`   Total handoffs: ${handoffCheck.rows.length}`);
    handoffCheck.rows.forEach(h => {
      const icon = h.status === 'accepted' ? '✅' : '⚠️ ';
      console.log(`   ${icon} ${h.from_phase}→${h.to_phase}: ${h.status}`);
    });
    console.log('');

    // Check sub-agent results
    console.log('3. Sub-Agent Results:');
    const subAgentCheck = await client.query(`
      SELECT sub_agent_code, verdict, created_at
      FROM sub_agent_execution_results
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at DESC
    `);
    console.log(`   Total sub-agent executions: ${subAgentCheck.rows.length}`);
    if (subAgentCheck.rows.length > 0) {
      subAgentCheck.rows.forEach(sa => {
        console.log(`   - ${sa.sub_agent_code}: ${sa.verdict}`);
      });
    } else {
      console.log('   ⚠️  No sub-agent results recorded');
    }
    console.log('');

    // Check user stories
    console.log('4. User Stories Check:');
    const userStoryCheck = await client.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN acceptance_status = 'accepted' THEN 1 ELSE 0 END) as accepted
      FROM user_stories
      WHERE prd_id IN (
        SELECT id FROM product_requirements_v2
        WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      )
    `);
    if (userStoryCheck.rows[0].total > 0) {
      console.log(`   Total: ${userStoryCheck.rows[0].total}`);
      console.log(`   Accepted: ${userStoryCheck.rows[0].accepted}`);
      const percentAccepted = (userStoryCheck.rows[0].accepted / userStoryCheck.rows[0].total * 100).toFixed(0);
      console.log(`   Acceptance rate: ${percentAccepted}%`);
    } else {
      console.log('   ❌ No user stories found');
    }
    console.log('');

    // Check retrospective
    console.log('5. Retrospective Check:');
    const retroCheck = await client.query(`
      SELECT id, status, created_at
      FROM retrospectives
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
    `);
    if (retroCheck.rows.length > 0) {
      console.log(`   ✅ Retrospective exists: ${retroCheck.rows[0].id}`);
      console.log(`   Status: ${retroCheck.rows[0].status}`);
    } else {
      console.log('   ❌ No retrospective found');
    }
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 Summary of Required Actions');
    console.log('════════════════════════════════════════════════════════════════');

    const actions = [];

    if (prdCheck.rows.length === 0) {
      actions.push('❌ CREATE PRD in product_requirements_v2 table');
    } else if (!prdCheck.rows[0].approved_by) {
      actions.push('⚠️  APPROVE PRD (set approved_by and approval_date)');
    }

    const acceptedHandoffs = handoffCheck.rows.filter(h => h.status === 'accepted').length;
    if (acceptedHandoffs < handoffCheck.rows.length) {
      actions.push('⚠️  ACCEPT all handoffs (some still pending)');
    }

    if (subAgentCheck.rows.length === 0) {
      actions.push('⚠️  RECORD sub-agent verifications (DATABASE, QA, etc.)');
    }

    if (userStoryCheck.rows[0].total == 0) {
      actions.push('❌ CREATE user stories for PRD');
    } else if (userStoryCheck.rows[0].accepted == 0) {
      actions.push('⚠️  ACCEPT/VALIDATE user stories');
    }

    if (retroCheck.rows.length === 0) {
      actions.push('❌ CREATE retrospective for SD');
    }

    if (actions.length === 0) {
      console.log('✅ All required elements are in place!');
    } else {
      actions.forEach(action => console.log(`   ${action}`));
    }

    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
