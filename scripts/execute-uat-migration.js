#!/usr/bin/env node

/**
 * Execute UAT Simple Tracking Migration
 * Creates UAT tables using Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeUATMigration() {
  console.log('🚀 UAT Migration - Creating database tables...\n');

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    console.log('Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/uat-simple-tracking.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Split SQL into individual statements
    // Remove comments and split by semicolons
    const statements = sqlContent
      .split(/;\s*$/m)
      .map(stmt => stmt.trim())
      .filter(stmt =>
        stmt.length > 0 &&
        !stmt.startsWith('--') &&
        !stmt.match(/^\/\*.*\*\/$/s)
      );

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Track results
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip empty statements
      if (!statement || statement.length < 10) continue;

      // Extract statement type for logging
      const statementType = statement.match(/^(CREATE|ALTER|INSERT|DROP|GRANT|UPDATE)/i)?.[1] || 'SQL';
      const tableMatch = statement.match(/(?:TABLE|VIEW|FUNCTION|POLICY|INDEX|TRIGGER)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\w+)/i);
      const targetName = tableMatch?.[1] || '';

      process.stdout.write(`Executing ${statementType} ${targetName}... `);

      try {
        // Check if execute_sql RPC exists
        let result;
        try {
          result = await supabase.rpc('execute_sql', {
            sql: statement + ';'
          });
        } catch (_rpcError) {
          // RPC doesn't exist or we don't have permission
          throw new Error('Cannot execute DDL statements with anon key - admin access required');
        }

        if (result.error) throw result.error;

        console.log('✅');
        successCount++;
      } catch (error) {
        console.log('❌');
        errorCount++;
        errors.push({
          statement: `${statementType} ${targetName}`,
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      errors.forEach(({ statement, error }) => {
        console.log(`  - ${statement}: ${error}`);
      });

      console.log('\n💡 Alternative Methods:');
      console.log('Since we only have anon key, you have 2 options:\n');

      console.log('Option 1: Use Supabase Dashboard (Recommended)');
      console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Paste the contents of: database/migrations/uat-simple-tracking.sql');
      console.log('4. Click "Run"\n');

      console.log('Option 2: Get DATABASE_URL or SERVICE_ROLE_KEY');
      console.log('1. Get credentials from Supabase dashboard > Settings > Database');
      console.log('2. Add to .env: DATABASE_URL=postgresql://...');
      console.log('3. Run: psql $DATABASE_URL -f database/migrations/uat-simple-tracking.sql\n');
    } else {
      console.log('\n✨ UAT tables created successfully!');

      // Verify tables exist
      console.log('\nVerifying tables...');
      const { data: _tables, error: verifyError } = await supabase
        .from('uat_cases')
        .select('count')
        .limit(0);

      if (!verifyError) {
        console.log('✅ Tables verified and accessible!');

        // Check if test cases are seeded
        const { count } = await supabase
          .from('uat_cases')
          .select('*', { count: 'exact', head: true });

        console.log(`📚 Test cases in database: ${count || 0}`);

        if (count === 0) {
          console.log('⚠️  No test cases found. The seed data may need to be inserted.');
        } else if (count === 61) {
          console.log('✅ All 61 test cases successfully seeded!');
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n💡 Please use the Supabase Dashboard method described above.');
  }
}

// Run the migration
executeUATMigration().catch(console.error);