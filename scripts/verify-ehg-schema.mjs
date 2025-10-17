#!/usr/bin/env node
/**
 * Verify EHG Database Schema
 * Checks board tables and CrewAI flows tables for compatibility
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifySchema() {
  const client = await createDatabaseClient('ehg', { verbose: false });

  try {
    console.log('🔍 EHG Database Schema Verification\n');
    console.log('═'.repeat(70));

    // 1. Check crewai_flows tables
    console.log('\n📋 CrewAI Flows Tables:');
    const flowTables = ['crewai_flows', 'crewai_flow_executions', 'crewai_flow_templates'];
    for (const table of flowTables) {
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        )
      `, [table]);

      if (exists.rows[0].exists) {
        const count = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ✅ ${table}: ${count.rows[0].count} records`);
      } else {
        console.log(`   ❌ ${table}: MISSING`);
      }
    }

    // 2. Check board tables
    console.log('\n👥 Board Infrastructure Tables:');
    const boardTables = ['board_members', 'board_meetings', 'board_meeting_attendance'];
    for (const table of boardTables) {
      const count = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ✅ ${table}: ${count.rows[0].count} records`);
    }

    // 3. Get board_members columns (critical for implementation)
    console.log('\n📊 board_members Schema (key columns):');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'board_members'
      ORDER BY ordinal_position
    `);

    columns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
    });

    // 4. Get crewai_flows columns
    console.log('\n🔄 crewai_flows Schema:');
    const flowColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'crewai_flows'
      ORDER BY ordinal_position
    `);

    flowColumns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
    });

    // 5. Check workflow templates
    console.log('\n📝 Workflow Templates (seed data):');
    const templates = await client.query(`
      SELECT template_key, template_name FROM crewai_flow_templates ORDER BY template_key
    `);

    templates.rows.forEach(t => {
      console.log(`   ✅ ${t.template_key}: ${t.template_name}`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Schema verification complete\n');

  } finally {
    await client.end();
  }
}

verifySchema().catch(err => {
  console.error('❌ Schema verification failed:', err.message);
  process.exit(1);
});
