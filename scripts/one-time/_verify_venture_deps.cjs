require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // Check columns
  const cols = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_name = 'venture_dependencies' " +
    "ORDER BY ordinal_position"
  );
  console.log('=== COLUMNS ===');
  for (const r of cols.rows) {
    console.log('  ' + r.column_name + ': ' + r.data_type + ' (nullable=' + r.is_nullable + ', default=' + (r.column_default || 'none') + ')');
  }

  // Check constraints
  const constraints = await client.query(
    "SELECT constraint_name, constraint_type " +
    "FROM information_schema.table_constraints " +
    "WHERE table_name = 'venture_dependencies'"
  );
  console.log('\n=== CONSTRAINTS ===');
  for (const r of constraints.rows) {
    console.log('  ' + r.constraint_name + ': ' + r.constraint_type);
  }

  // Check indexes
  const indexes = await client.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'venture_dependencies'"
  );
  console.log('\n=== INDEXES ===');
  for (const r of indexes.rows) {
    console.log('  ' + r.indexname);
  }

  // Check RLS policies
  const rls = await client.query(
    "SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'venture_dependencies'"
  );
  console.log('\n=== RLS POLICIES ===');
  for (const r of rls.rows) {
    console.log('  ' + r.policyname + ': ' + r.cmd + ' -> ' + r.roles);
  }

  // Check RLS enabled
  const rlsEnabled = await client.query(
    "SELECT relrowsecurity FROM pg_class WHERE relname = 'venture_dependencies'"
  );
  console.log('\nRLS enabled: ' + (rlsEnabled.rows[0] ? rlsEnabled.rows[0].relrowsecurity : 'unknown'));

  await client.end();
  console.log('\n=== VERIFICATION COMPLETE ===');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
