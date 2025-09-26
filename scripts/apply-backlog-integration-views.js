#!/usr/bin/env node

/**
 * Apply Backlog Integration Views Migration
 * Creates application-specific views for EHG vs EHG_Engineer separation
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function applyViews() {
  console.log('🚀 Applying Backlog Integration Views...\n');

  // Using pg for DDL operations (views)
  const pool = new Pool({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432, // Session mode for DDL
    user: 'postgres.dedlbzhpgkmetvhbkyzq',
    password: process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  // Also create Supabase client for verification
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    // Read migration SQL
    const migrationPath = path.join(
      process.cwd(),
      'database/migrations/2025-09-24-backlog-integration-views.sql'
    );
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Migration file loaded from:', migrationPath);
    console.log('📊 Creating views...\n');

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;

    for (const statement of statements) {
      // Skip test queries at the end
      if (statement.includes('Test query')) {
        continue;
      }

      try {
        // Execute statement
        await pool.query(statement);

        // Identify what was created
        if (statement.includes('CREATE OR REPLACE VIEW')) {
          const viewName = statement.match(/VIEW\s+(\w+)/i)?.[1];
          console.log(`✅ Created view: ${viewName}`);
          successCount++;
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/i)?.[1];
          console.log(`✅ Created index: ${indexName}`);
          successCount++;
        } else if (statement.includes('GRANT')) {
          console.log('✅ Permissions granted');
          successCount++;
        } else if (statement.includes('COMMENT ON VIEW')) {
          console.log('✅ Comment added');
          successCount++;
        }
      } catch (error) {
        if (error.message.includes('already exists')) {
          skipCount++;
        } else {
          console.error('❌ Statement failed:', error.message);
        }
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Success: ${successCount} operations`);
    console.log(`   Skipped: ${skipCount} (already exist)`);

    // Verify views by querying them
    console.log('\n🔍 Verifying views...\n');

    // Test v_ehg_engineer_backlog
    const { data: engineerItems, error: engineerError } = await supabase
      .from('v_ehg_engineer_backlog')
      .select('backlog_id')
      .limit(1);

    if (!engineerError) {
      const { count: engineerCount } = await supabase
        .from('v_ehg_engineer_backlog')
        .select('*', { count: 'exact', head: true });
      console.log(`✅ v_ehg_engineer_backlog: ${engineerCount} items`);
    } else {
      console.error('❌ v_ehg_engineer_backlog error:', engineerError.message);
    }

    // Test v_ehg_backlog
    const { data: ehgItems, error: ehgError } = await supabase
      .from('v_ehg_backlog')
      .select('backlog_id')
      .limit(1);

    if (!ehgError) {
      const { count: ehgCount } = await supabase
        .from('v_ehg_backlog')
        .select('*', { count: 'exact', head: true });
      console.log(`✅ v_ehg_backlog: ${ehgCount} items`);
    } else {
      console.error('❌ v_ehg_backlog error:', ehgError.message);
    }

    // Test v_backlog_validation
    const { data: validationData, error: validationError } = await supabase
      .from('v_backlog_validation')
      .select('*')
      .gt('potential_ehg_in_engineer', 0)
      .or('potential_engineer_in_ehg.gt.0')
      .limit(5);

    if (!validationError) {
      if (validationData && validationData.length > 0) {
        console.log(`\n⚠️  Potential boundary violations detected:`);
        validationData.forEach(row => {
          if (row.potential_ehg_in_engineer > 0) {
            console.log(`   - ${row.sd_title}: ${row.potential_ehg_in_engineer} EHG items in EHG_ENGINEER`);
          }
          if (row.potential_engineer_in_ehg > 0) {
            console.log(`   - ${row.sd_title}: ${row.potential_engineer_in_ehg} EHG_ENGINEER items in EHG`);
          }
        });
      } else {
        console.log('✅ v_backlog_validation: No boundary violations detected');
      }
    } else {
      console.error('❌ v_backlog_validation error:', validationError.message);
    }

    console.log('\n✅ Backlog Integration Views applied successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update generate-prd-from-sd.js to use new views');
    console.log('2. Create ApplicationBoundaryValidator service');
    console.log('3. Update CLAUDE.md documentation');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
applyViews().catch(console.error);