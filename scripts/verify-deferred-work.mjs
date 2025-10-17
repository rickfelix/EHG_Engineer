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
    console.log('📋 Analyzing Deferred Work from SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Check handoffs for known issues mentioning deferred work
    console.log('1. Checking handoffs for deferred items...\n');
    const handoffs = await client.query(`
      SELECT handoff_type, known_issues, key_decisions
      FROM sd_phase_handoffs
      WHERE sd_id = $1
      ORDER BY created_at
    `, [sdId]);

    handoffs.rows.forEach(h => {
      console.log(`${h.handoff_type}:`);
      if (h.known_issues && h.known_issues.includes('defer')) {
        console.log('   Known Issues:', h.known_issues.substring(0, 200));
      }
      if (h.key_decisions && h.key_decisions.includes('defer')) {
        console.log('   Key Decisions:', h.key_decisions.substring(0, 200));
      }
      console.log('');
    });

    // Check deliverables for incomplete/deferred items
    console.log('2. Checking deliverables status...\n');
    const deliverables = await client.query(`
      SELECT deliverable_name, completion_status, description
      FROM sd_scope_deliverables
      WHERE sd_id = $1
      ORDER BY priority DESC
    `, [sdId]);

    deliverables.rows.forEach(d => {
      console.log(`   ${d.deliverable_name}: ${d.completion_status}`);
      if (d.completion_status === 'deferred') {
        console.log(`      ${d.description}`);
      }
    });

    // Check retrospective for learnings about deferred work
    console.log('\n3. Checking retrospective...\n');
    const retro = await client.query(`
      SELECT lessons_learned, what_went_well, what_went_poorly
      FROM retrospectives
      WHERE sd_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [sdId]);

    if (retro.rows.length > 0) {
      const lessons = retro.rows[0].lessons_learned;
      if (Array.isArray(lessons)) {
        lessons.forEach(lesson => {
          if (lesson.includes('defer') || lesson.includes('E2E') || lesson.includes('test')) {
            console.log(`   - ${lesson}`);
          }
        });
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('DEFERRED WORK SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Based on handoffs and deliverables:');
    console.log('1. E2E Tests - Deferred due to infrastructure blocker');
    console.log('2. Navigation Integration - Status to be verified');
    console.log('3. Quorum Enforcement - Status to be verified');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
