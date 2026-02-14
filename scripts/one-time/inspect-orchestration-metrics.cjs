const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const cols = await client.query(
      'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
      ['orchestration_metrics']
    );
    console.log('orchestration_metrics columns (' + cols.rows.length + '):');
    cols.rows.forEach(c => console.log('  ' + c.column_name + ': ' + c.data_type + ' (nullable: ' + c.is_nullable + ')'));

    // Also check existing indexes
    const idx = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'orchestration_metrics' ORDER BY indexname"
    );
    console.log('\nExisting indexes:');
    idx.rows.forEach(r => console.log('  ' + r.indexname));

    // Check existing policies
    const pol = await client.query(
      "SELECT policyname FROM pg_policies WHERE tablename = 'orchestration_metrics' ORDER BY policyname"
    );
    console.log('\nExisting policies:');
    pol.rows.forEach(r => console.log('  ' + r.policyname));

    // Check if RLS is enabled
    const rls = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'orchestration_metrics'"
    );
    console.log('\nRLS enabled:', rls.rows[0]?.relrowsecurity);
  } finally {
    await client.end();
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
