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
    console.log('📊 Progress Requirements Analysis: SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Check 1: sd_phase_tracking table
    console.log('1. Checking sd_phase_tracking table...');
    try {
      const phaseTracking = await client.query(`
        SELECT * FROM sd_phase_tracking WHERE sd_id = $1
      `, [sdId]);
      console.log(`   Rows found: ${phaseTracking.rows.length}`);
      if (phaseTracking.rows.length > 0) {
        phaseTracking.rows.forEach(row => {
          console.log(`   - Phase: ${row.phase_name}, Progress: ${row.progress}%, Complete: ${row.is_complete}`);
        });
      } else {
        console.log('   ❌ No phase tracking data (trigger uses this table!)');
      }
    } catch (err) {
      console.log(`   ❌ Table doesn't exist: ${err.message}`);
    }
    console.log('');

    // Check 2: PRD with directive_id
    console.log('2. Checking PRD with directive_id...');
    const prdDirective = await client.query(`
      SELECT id, directive_id, sd_id FROM product_requirements_v2
      WHERE directive_id = $1 OR sd_id = $1
    `, [sdId]);
    console.log(`   PRDs found: ${prdDirective.rows.length}`);
    if (prdDirective.rows.length > 0) {
      prdDirective.rows.forEach(row => {
        console.log(`   - ID: ${row.id}`);
        console.log(`     directive_id: ${row.directive_id || 'NULL'}`);
        console.log(`     sd_id: ${row.sd_id || 'NULL'}`);
      });
      if (!prdDirective.rows[0].directive_id) {
        console.log('   ⚠️  PRD exists but directive_id is NULL (trigger checks directive_id!)');
      }
    }
    console.log('');

    // Check 3: sd_scope_deliverables
    console.log('3. Checking sd_scope_deliverables...');
    try {
      const deliverables = await client.query(`
        SELECT * FROM sd_scope_deliverables WHERE sd_id = $1
      `, [sdId]);
      console.log(`   Deliverables found: ${deliverables.rows.length}`);
      if (deliverables.rows.length > 0) {
        const completed = deliverables.rows.filter(d => d.completion_status === 'completed').length;
        console.log(`   - Completed: ${completed}/${deliverables.rows.length}`);
      } else {
        console.log('   ❌ No deliverables tracked (trigger needs this!)');
      }
    } catch (err) {
      console.log(`   ❌ Table doesn't exist: ${err.message}`);
    }
    console.log('');

    // Check 4: User stories validation
    console.log('4. Checking user_stories validation...');
    const userStories = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
             COUNT(*) FILTER (WHERE e2e_test_status = 'passing') as e2e_passing
      FROM user_stories
      WHERE sd_id = $1
    `, [sdId]);
    console.log(`   Total stories: ${userStories.rows[0].total}`);
    console.log(`   Validated: ${userStories.rows[0].validated}`);
    console.log(`   E2E passing: ${userStories.rows[0].e2e_passing}`);
    if (userStories.rows[0].total === '0') {
      console.log('   ⚠️  No user stories (trigger needs validation_status + e2e_test_status)');
    }
    console.log('');

    // Check 5: Sub-agent verification
    console.log('5. Checking sub-agent verification...');
    try {
      const subAgentCheck = await client.query(`
        SELECT check_required_sub_agents($1) as result
      `, [sdId]);
      console.log(`   Result:`, subAgentCheck.rows[0].result);
    } catch (err) {
      console.log(`   ⚠️  Function failed: ${err.message}`);
    }
    console.log('');

    // Check 6: Retrospective with quality_score
    console.log('6. Checking retrospective quality_score...');
    const retro = await client.query(`
      SELECT id, quality_score FROM retrospectives WHERE sd_id = $1
    `, [sdId]);
    if (retro.rows.length > 0) {
      console.log(`   Found: ${retro.rows.length} retrospective(s)`);
      retro.rows.forEach(r => {
        console.log(`   - ID: ${r.id}, Quality Score: ${r.quality_score || 'NULL'}`);
      });
      if (!retro.rows[0].quality_score) {
        console.log('   ⚠️  Retrospective exists but quality_score is NULL (needs ≥70)');
      }
    } else {
      console.log('   ❌ No retrospective found');
    }
    console.log('');

    // Check 7: Handoffs
    console.log('7. Checking handoffs (needs 3 distinct types, accepted)...');
    const handoffs = await client.query(`
      SELECT handoff_type, status FROM sd_phase_handoffs WHERE sd_id = $1
    `, [sdId]);
    console.log(`   Total handoffs: ${handoffs.rows.length}`);
    const acceptedTypes = new Set(handoffs.rows.filter(h => h.status === 'accepted').map(h => h.handoff_type));
    console.log(`   Distinct accepted types: ${acceptedTypes.size}`);
    handoffs.rows.forEach(h => {
      console.log(`   - ${h.handoff_type}: ${h.status}`);
    });
    if (acceptedTypes.size < 3) {
      console.log(`   ⚠️  Need 3 distinct accepted handoff types, have ${acceptedTypes.size}`);
    }
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 MISSING REQUIREMENTS SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('To achieve 100% progress, we need:');
    console.log('1. ❌ sd_phase_tracking rows (calculate_sd_progress uses this)');
    console.log('2. ⚠️  PRD.directive_id populated (currently NULL)');
    console.log('3. ❌ sd_scope_deliverables rows');
    console.log('4. ⚠️  User stories with validation_status + e2e_test_status');
    console.log('5. ⚠️  Retrospective.quality_score ≥ 70');
    console.log('6. ⚠️  3+ distinct accepted handoff types');
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
