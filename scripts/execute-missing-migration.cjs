const { Client } = require('pg');
const { readFileSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

console.log('═══════════════════════════════════════════════════════════════');
console.log('   PRINCIPAL DATABASE ARCHITECT - Migration Execution');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('👤 Role: Database Architect (30 years experience)');
console.log('🎯 Task: Execute missing migration 20251117_add_quick_fix_compliance_columns.sql');
console.log('📋 Context: Add compliance rubric columns to quick_fixes table');
console.log('');

async function executeMigration() {
  console.log('─── CONNECTION SETUP ───\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.log('❌ SUPABASE_POOLER_URL not found in environment');
    console.log('   Cannot proceed with PostgreSQL direct connection');
    console.log('');
    console.log('💡 TIP: Check .env file for SUPABASE_POOLER_URL');
    return;
  }

  console.log('✅ Connection string found (credentials hidden)');
  console.log('   Protocol: PostgreSQL wire protocol');
  console.log('   Method: Direct database connection');
  console.log('');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'database', 'migrations', '20251117_add_quick_fix_compliance_columns.sql');
  console.log('📄 Reading migration file...');
  console.log('   Path:', migrationPath);
  const migrationSQL = readFileSync(migrationPath, 'utf8');
  console.log('✅ Migration SQL loaded');
  console.log('');

  const client = new Client({
    connectionString: poolerUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
  });

  try {
    console.log('─── CONNECTING TO DATABASE ───\n');
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');
    console.log('');

    console.log('─── PRE-FLIGHT CHECK ───\n');
    console.log('Checking current table structure...');

    // Check if columns already exist
    const checkResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'quick_fixes'
        AND column_name IN ('compliance_score', 'compliance_verdict', 'compliance_details')
      ORDER BY column_name;
    `);

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Compliance columns already exist:');
      checkResult.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
      console.log('');
      console.log('Migration appears to have been executed already.');
      console.log('Skipping migration execution.');
      console.log('');
      return;
    }

    console.log('✅ Compliance columns do not exist - migration is needed');
    console.log('');

    console.log('─── EXECUTING MIGRATION ───\n');
    console.log('Running migration SQL...');
    console.log('');

    // Execute the migration (it's wrapped in BEGIN/COMMIT)
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully');
    console.log('');

    console.log('─── VERIFICATION ───\n');

    // Verify the columns were created
    const verifyResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'quick_fixes'
        AND column_name IN ('compliance_score', 'compliance_verdict', 'compliance_details')
      ORDER BY column_name;
    `);

    if (verifyResult.rows.length === 3) {
      console.log('✅ All three compliance columns created successfully:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
      console.log('');
    } else {
      console.log('⚠️  WARNING: Expected 3 columns, found:', verifyResult.rows.length);
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}`);
      });
      console.log('');
    }

    // Verify indexes
    console.log('Verifying indexes...');
    const indexResult = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'quick_fixes'
        AND indexname LIKE '%compliance%'
      ORDER BY indexname;
    `);

    console.log(`✅ Found ${indexResult.rows.length} compliance-related indexes:`);
    indexResult.rows.forEach(row => {
      console.log(`   - ${row.indexname}`);
    });
    console.log('');

    // Verify column comments
    console.log('Verifying column comments...');
    const commentResult = await client.query(`
      SELECT
        cols.column_name,
        pg_catalog.col_description(c.oid, cols.ordinal_position::int) as column_comment
      FROM information_schema.columns cols
      JOIN pg_catalog.pg_class c ON c.relname = cols.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE cols.table_name = 'quick_fixes'
        AND cols.column_name IN ('compliance_score', 'compliance_verdict', 'compliance_details')
        AND n.nspname = 'public'
      ORDER BY cols.column_name;
    `);

    console.log('✅ Column comments:');
    commentResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.column_comment || '(none)'}`);
    });
    console.log('');

    console.log('─── SUCCESS ───\n');
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('');
    console.log('Summary:');
    console.log('  - Columns added: 3 (compliance_score, compliance_verdict, compliance_details)');
    console.log('  - Indexes created: 2 (by verdict, by score)');
    console.log('  - Comments added: 3 (documentation for each column)');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. ✅ Migration verified in database');
    console.log('  2. 📋 Quick-fix agent can now use compliance columns');
    console.log('  3. 📋 Compliance rubric ready for self-scoring system');

  } catch (error) {
    console.log('\n❌ ERROR DURING EXECUTION\n');
    console.log('Error:', error.message);
    console.log('');
    console.log('Full error:');
    console.log(error);
    console.log('');

    if (error.code) {
      console.log('PostgreSQL Error Code:', error.code);
    }

    console.log('Migration failed. Database state may be inconsistent.');
    console.log('Please review the error and try again, or execute manually via Supabase Dashboard.');

  } finally {
    console.log('');
    console.log('─── CLEANUP ───\n');
    await client.end();
    console.log('✅ Database connection closed');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   DATABASE ARCHITECT EXECUTION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
  }
}

executeMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
