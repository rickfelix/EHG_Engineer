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
    console.log('📊 SD-BOARD-GOVERNANCE-001 Completion Analysis');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Get the SD record
    console.log('1. Strategic Directive Overview\n');
    const sd = await client.query(`
      SELECT title, scope, success_criteria, deliverables
      FROM strategic_directives_v2
      WHERE id = $1
    `, [sdId]);

    console.log(`Title: ${sd.rows[0].title}`);
    console.log(`\nScope:\n${sd.rows[0].scope}\n`);

    // Get all deliverables
    console.log('2. Deliverables Status\n');
    const deliverables = await client.query(`
      SELECT deliverable_name, completion_status, description, priority
      FROM sd_scope_deliverables
      WHERE sd_id = $1
      ORDER BY 
        CASE priority
          WHEN 'required' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `, [sdId]);

    deliverables.rows.forEach(d => {
      const icon = d.completion_status === 'completed' ? '✅' : 
                   d.completion_status === 'deferred' ? '⏸️' : '❌';
      console.log(`   ${icon} ${d.deliverable_name} [${d.priority}]`);
      console.log(`      Status: ${d.completion_status}`);
      console.log(`      ${d.description}\n`);
    });

    // Get retrospective
    console.log('3. Retrospective Findings\n');
    const retro = await client.query(`
      SELECT key_learnings, what_went_well, what_went_poorly, key_decisions
      FROM retrospectives
      WHERE sd_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [sdId]);

    if (retro.rows.length > 0) {
      console.log('Key Learnings:');
      const learnings = retro.rows[0].key_learnings;
      if (Array.isArray(learnings)) {
        learnings.slice(0, 3).forEach(l => console.log(`   - ${l}`));
      }
      console.log('');
    }

    // Check PLAN→LEAD handoff for conditional approval details
    console.log('4. PLAN→LEAD Handoff (Conditional Approval Details)\n');
    const planLead = await client.query(`
      SELECT executive_summary, known_issues, action_items
      FROM sd_phase_handoffs
      WHERE sd_id = $1 AND handoff_type = 'PLAN-to-LEAD'
      ORDER BY created_at DESC
      LIMIT 1
    `, [sdId]);

    if (planLead.rows.length > 0) {
      console.log('Known Issues:');
      console.log(planLead.rows[0].known_issues);
      console.log('');
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log('ANALYSIS SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    
    const deferredItems = deliverables.rows.filter(d => d.completion_status === 'deferred');
    
    if (deferredItems.length > 0) {
      console.log('\nDeferred Items Requiring Follow-up SD:');
      deferredItems.forEach(item => {
        console.log(`   - ${item.deliverable_name}`);
      });
    } else {
      console.log('\nNo explicitly deferred deliverables found.');
      console.log('Conditional approval suggests follow-up may still be needed.');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
