#!/usr/bin/env node

/**
 * Create UAT Database Schema
 * Sets up comprehensive tables for tracking automated UAT testing
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeSQLFile() {
  try {
    console.log('📊 Creating UAT Database Schema...\n');

    // Read the SQL file
    const sqlPath = join(__dirname, '..', 'database', 'migrations', 'uat-tracking-schema.sql');
    const sqlContent = await readFile(sqlPath, 'utf8');

    // Split by statements (crude split, but works for our schema)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comments
      if (statement.trim().startsWith('--')) continue;

      // Extract table/object name for logging
      let objectName = 'Unknown';
      if (statement.includes('CREATE TABLE')) {
        const match = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        objectName = match ? match[1] : 'table';
      } else if (statement.includes('CREATE INDEX')) {
        const match = statement.match(/CREATE INDEX (\w+)/);
        objectName = match ? match[1] : 'index';
      } else if (statement.includes('CREATE OR REPLACE VIEW')) {
        const match = statement.match(/CREATE OR REPLACE VIEW (\w+)/);
        objectName = match ? match[1] : 'view';
      } else if (statement.includes('CREATE TRIGGER')) {
        const match = statement.match(/CREATE TRIGGER (\w+)/);
        objectName = match ? match[1] : 'trigger';
      } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
        objectName = 'function';
      } else if (statement.includes('INSERT INTO')) {
        const match = statement.match(/INSERT INTO (\w+)/);
        objectName = match ? `data for ${match[1]}` : 'data';
      } else if (statement.includes('GRANT')) {
        objectName = 'permissions';
      }

      process.stdout.write(`[${i + 1}/${statements.length}] Creating ${objectName}... `);

      // For complex DDL, we need to use raw SQL execution
      // Supabase JS client doesn't support DDL directly, so we'll track what needs to be done

      if (statement.includes('CREATE TABLE') ||
          statement.includes('CREATE INDEX') ||
          statement.includes('CREATE OR REPLACE') ||
          statement.includes('CREATE TRIGGER') ||
          statement.includes('GRANT')) {
        // These need to be executed via SQL Editor or psql
        console.log('⏳ (Requires SQL Editor execution)');
        successCount++;
      } else if (statement.includes('INSERT INTO uat_test_suites')) {
        // We can handle inserts with the JS client
        try {
          const { error } = await supabase
            .from('uat_test_suites')
            .insert([
              {
                suite_name: 'Authentication Tests',
                description: 'Comprehensive authentication and security testing',
                module: 'Authentication',
                test_type: 'functional',
                priority: 'critical'
              },
              {
                suite_name: 'Dashboard Tests',
                description: 'Dashboard functionality and performance testing',
                module: 'Dashboard',
                test_type: 'functional',
                priority: 'high'
              },
              {
                suite_name: 'Ventures Tests',
                description: 'Ventures module complete testing',
                module: 'Ventures',
                test_type: 'functional',
                priority: 'high'
              },
              {
                suite_name: 'Form Validation Tests',
                description: 'All form validation testing',
                module: 'Forms',
                test_type: 'functional',
                priority: 'high'
              },
              {
                suite_name: 'Performance Tests',
                description: 'System performance and load testing',
                module: 'Performance',
                test_type: 'performance',
                priority: 'medium'
              },
              {
                suite_name: 'Accessibility Tests',
                description: 'WCAG 2.1 AA compliance testing',
                module: 'Accessibility',
                test_type: 'accessibility',
                priority: 'high'
              },
              {
                suite_name: 'Error Handling Tests',
                description: 'Error scenarios and recovery testing',
                module: 'ErrorHandling',
                test_type: 'functional',
                priority: 'high'
              }
            ]);

          if (error) throw error;
          console.log('✅');
          successCount++;
        } catch (error) {
          console.log('⚠️  (May already exist)');
          successCount++;
        }
      } else {
        console.log('⏭️  (Skipped)');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 UAT Database Schema Status:');
    console.log('='.repeat(50));

    // Check if tables exist by trying to query them
    const tables = [
      'uat_test_suites',
      'uat_test_cases',
      'uat_test_runs',
      'uat_test_results',
      'uat_issues',
      'uat_coverage_metrics',
      'uat_performance_metrics',
      'uat_screenshots',
      'uat_test_schedules',
      'uat_audit_trail'
    ];

    console.log('\nTable Status:');
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .limit(1);

        if (error && error.code === '42P01') {
          console.log(`  ❌ ${table} - Not created`);
        } else {
          console.log(`  ✅ ${table} - Ready`);
        }
      } catch (e) {
        console.log(`  ❌ ${table} - Not created`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n⚠️  IMPORTANT: Database schema creation requires direct SQL execution.');
    console.log('\n📝 To complete schema creation:');
    console.log('\n1. Using Supabase Dashboard:');
    console.log('   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('   - Open the SQL Editor');
    console.log('   - Copy and paste the contents of: database/migrations/uat-tracking-schema.sql');
    console.log('   - Click "Run" to execute\n');

    console.log('2. Using psql (if DATABASE_URL is available):');
    console.log('   psql $DATABASE_URL -f database/migrations/uat-tracking-schema.sql\n');

    console.log('3. Verification:');
    console.log('   After executing the SQL, run this script again to verify all tables are created.\n');

    // Save execution summary
    const summary = {
      timestamp: new Date().toISOString(),
      total_statements: statements.length,
      tables_to_create: tables.length,
      status: 'pending_sql_execution',
      next_steps: [
        'Execute SQL in Supabase Dashboard',
        'Verify tables are created',
        'Generate test cases',
        'Run UAT campaign'
      ]
    };

    console.log('📄 Summary:', JSON.stringify(summary, null, 2));

    return summary;

  } catch (error) {
    console.error('❌ Error creating UAT database schema:', error.message);
    throw error;
  }
}

// Run if executed directly
executeSQLFile()
  .then((summary) => {
    console.log('\n🚀 Next steps after SQL execution:');
    console.log('1. Generate test cases: node scripts/generate-test-cases.js');
    console.log('2. Configure Playwright: node scripts/setup-playwright-config.js');
    console.log('3. Run UAT campaign: node scripts/run-uat-campaign.js');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

export { executeSQLFile };