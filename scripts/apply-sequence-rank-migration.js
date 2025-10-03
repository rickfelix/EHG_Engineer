import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs/promises';

dotenv.config();

const { Client } = pg;
const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
const password = process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1';

// Pooler connection (IPv4 compatible) - use aws-1 for EHG_Engineer
const client = new Client({
  host: `aws-1-us-east-1.pooler.supabase.com`,
  port: 5432,
  database: 'postgres',
  user: `postgres.${projectId}`,
  password: password,
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  console.log('🔧 Applying sequence_rank NOT NULL migration...\n');

  try {
    await client.connect();
    console.log('✅ Connected to database');

    await client.query('BEGIN');
    console.log('✅ Transaction started');

    // Read migration file
    const sql = await fs.readFile('database/migrations/make-sequence-rank-required.sql', 'utf-8');

    // Split into statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`\n📝 Executing ${statements.length} migration statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments
      if (statement.startsWith('--')) continue;

      try {
        const result = await client.query(statement + ';');

        // Extract statement type
        const statementType = statement.split(/\s+/)[0].toUpperCase();
        console.log(`✅ [${i+1}/${statements.length}] ${statementType} executed`);

        // Show notices from DO blocks
        if (result.rows && result.rows.length > 0) {
          console.log('   Result:', result.rows[0]);
        }
      } catch (err) {
        console.error(`❌ Error in statement ${i+1}:`, err.message);
        throw err;
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Transaction committed');

    // Verify the migration
    const { rows } = await client.query(`
      SELECT
        COUNT(*) as total_sds,
        COUNT(*) FILTER (WHERE sequence_rank IS NULL) as null_ranks,
        MIN(sequence_rank) as min_rank,
        MAX(sequence_rank) as max_rank
      FROM strategic_directives_v2
    `);

    console.log('\n📊 Migration Verification:');
    console.log(`- Total SDs: ${rows[0].total_sds}`);
    console.log(`- NULL sequence_ranks: ${rows[0].null_ranks}`);
    console.log(`- Min sequence_rank: ${rows[0].min_rank}`);
    console.log(`- Max sequence_rank: ${rows[0].max_rank}`);

    if (rows[0].null_ranks === '0') {
      console.log('\n✅ Migration successful! All sequence_ranks populated.');
      console.log('✅ NOT NULL constraint applied.');
      console.log('✅ Auto-assign trigger created for future inserts.');
    } else {
      console.error('\n❌ Migration verification failed!');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

applyMigration().catch(console.error);
