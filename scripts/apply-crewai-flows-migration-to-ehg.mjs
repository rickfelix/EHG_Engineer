#!/usr/bin/env node
/**
 * Apply CrewAI Flows Migration to CORRECT Database (EHG Business App)
 * REMEDIATION: Apply to EHG database (liapbndqlqxdcgpwntbv), not EHG_Engineer
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  const client = await createDatabaseClient('ehg', { verbose: true }); // ← CORRECT database

  try {
    console.log('\n🔧 Applying CrewAI Flows Migration to EHG Database');
    console.log('═'.repeat(70));
    console.log('   Target: EHG Business Application (liapbndqlqxdcgpwntbv)');
    console.log('   Purpose: SD-BOARD-VISUAL-BUILDER-001 implementation');

    // Read migration file
    const migrationPath = join(process.cwd(), 'database/migrations/20251011_crewai_flows_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    // Split into statements using proper parser
    const statements = splitPostgreSQLStatements(migrationSQL);

    console.log(`\n   Total statements: ${statements.length}`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.startsWith('--')) {
        continue;
      }

      try {
        await client.query(statement);

        // Log meaningful operations
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`   ✅ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (\w+)/i)?.[1];
          console.log(`   ✅ Created index: ${indexName}`);
        } else if (statement.includes('CREATE POLICY')) {
          const policyName = statement.match(/CREATE POLICY "([^"]+)"/i)?.[1];
          console.log(`   ✅ Created policy: ${policyName}`);
        } else if (statement.includes('INSERT INTO')) {
          const tableName = statement.match(/INSERT INTO (\w+)/i)?.[1];
          console.log(`   ✅ Inserted seed data into: ${tableName}`);
        } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
          const funcName = statement.match(/CREATE OR REPLACE FUNCTION (\w+)/i)?.[1];
          console.log(`   ✅ Created function: ${funcName}`);
        } else if (statement.includes('CREATE TRIGGER')) {
          const triggerName = statement.match(/CREATE TRIGGER (\w+)/i)?.[1];
          console.log(`   ✅ Created trigger: ${triggerName}`);
        } else if (statement.includes('ALTER TABLE') && statement.includes('ENABLE ROW LEVEL SECURITY')) {
          const tableName = statement.match(/ALTER TABLE (\w+)/i)?.[1];
          console.log(`   ✅ Enabled RLS on: ${tableName}`);
        } else if (statement.includes('COMMENT ON')) {
          // Skip logging comments
        }

        successCount++;
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
          skipCount++;
          if (statement.includes('CREATE TABLE')) {
            const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
            console.log(`   ⏭️  Table already exists: ${tableName}`);
          } else if (statement.includes('INSERT INTO')) {
            console.log(`   ⏭️  Seed data already exists (skipped)`);
          }
        } else {
          console.error(`   ❌ Error: ${err.message.substring(0, 100)}`);
          errorCount++;
        }
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    // Verify tables exist
    console.log('\n🔍 Verifying Tables in EHG Database:');

    const tables = ['crewai_flows', 'crewai_flow_executions', 'crewai_flow_templates'];
    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      console.log(`   ${table}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }

    // Verify seed data (3 templates)
    const templateCount = await client.query(`SELECT COUNT(*) as count FROM crewai_flow_templates;`);
    console.log(`\n📋 Workflow Templates: ${templateCount.rows[0].count}`);

    if (templateCount.rows[0].count >= 3) {
      console.log('   ✅ All 3 workflow templates seeded');
      console.log('   Templates: Weekly Board Meeting, Emergency Session, Investment Approval');
      console.log('\n✅ EHG Database Ready for Visual Workflow Builder!');
    } else {
      console.log(`   ⚠️  Only ${templateCount.rows[0].count} templates (expected 3)`);
    }

  } finally {
    await client.end();
  }
}

applyMigration().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
