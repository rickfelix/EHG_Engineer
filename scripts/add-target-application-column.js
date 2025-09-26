#!/usr/bin/env node

/**
 * Simple script to add target_application column to strategic_directives_v2
 */

const { Pool } = require('pg');
require('dotenv').config();

async function addTargetApplicationColumn() {
  const pool = new Pool({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.dedlbzhpgkmetvhbkyzq',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🚀 Connecting to Supabase...\n');

    // Step 1: Add the column
    console.log('Step 1: Adding target_application column...');
    try {
      await pool.query(`
        ALTER TABLE strategic_directives_v2
        ADD COLUMN target_application VARCHAR(20) DEFAULT 'EHG'
      `);
      console.log('✅ Column added successfully');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ Column already exists');
      } else {
        throw err;
      }
    }

    // Step 2: Add constraint
    console.log('\nStep 2: Adding check constraint...');
    try {
      await pool.query(`
        ALTER TABLE strategic_directives_v2
        ADD CONSTRAINT check_target_application
        CHECK (target_application IN ('EHG', 'EHG_ENGINEER'))
      `);
      console.log('✅ Constraint added');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ Constraint already exists');
      } else {
        console.log('⚠️ Could not add constraint:', err.message);
      }
    }

    // Step 3: Update EHG_Engineer SDs
    console.log('\nStep 3: Marking EHG_Engineer SDs...');
    const updateResult = await pool.query(`
      UPDATE strategic_directives_v2
      SET target_application = 'EHG_ENGINEER'
      WHERE id IN (
        'SD-002',
        'SD-043',
        'SD-2025-0903-SDIP',
        'SD-2025-09-EMB',
        'SD-GOVERNANCE-UI-001',
        'SD-MONITORING-001',
        'SD-VISION-ALIGN-001',
        'SD-DASHBOARD-AUDIT-2025-08-31-A'
      )
      OR (title ILIKE '%LEO Protocol%' AND title NOT ILIKE '%Dashboard%')
      OR title ILIKE '%Development Workflow%'
    `);
    console.log(`✅ Updated ${updateResult.rowCount} SDs to EHG_ENGINEER`);

    // Step 4: Create index
    console.log('\nStep 4: Creating index...');
    try {
      await pool.query(`
        CREATE INDEX idx_strategic_directives_target_app
        ON strategic_directives_v2(target_application)
      `);
      console.log('✅ Index created');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ Index already exists');
      } else {
        console.log('⚠️ Could not create index:', err.message);
      }
    }

    // Step 5: Show results
    console.log('\nStep 5: Verifying results...');
    const countResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE target_application = 'EHG') as ehg_count,
        COUNT(*) FILTER (WHERE target_application = 'EHG_ENGINEER') as eng_count,
        COUNT(*) FILTER (WHERE target_application IS NULL) as null_count,
        COUNT(*) as total
      FROM strategic_directives_v2
    `);

    const counts = countResult.rows[0];
    console.log('\n📊 Final Classification:');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 EHG (Business App):     ${counts.ehg_count} SDs`);
    console.log(`🛠️  EHG_ENGINEER (Dev):     ${counts.eng_count} SDs`);
    console.log(`❓ Unclassified:           ${counts.null_count} SDs`);
    console.log('───────────────────────────────────────');
    console.log(`   Total:                  ${counts.total} SDs`);
    console.log('═══════════════════════════════════════');

    console.log('\n✅ Migration complete!');
    console.log('\n🎉 Next steps:');
    console.log('1. Restart the server to see UI changes');
    console.log('2. The UI will show target application badges and filters');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addTargetApplicationColumn();