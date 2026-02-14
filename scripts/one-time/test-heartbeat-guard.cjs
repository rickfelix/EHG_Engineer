require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

async function test() {
  const client = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
  await client.connect();

  // Deploy the migration
  const sql = fs.readFileSync('database/migrations/20260213_session_creation_heartbeat_guard.sql', 'utf8');
  await client.query(sql);
  console.log('Function deployed (INSERT-first pattern)');

  const term = 'test_v3_' + Date.now();
  const termIdentity = 'm:' + term;

  // Test 1: New terminal - should succeed
  const r1 = await client.query(
    'SELECT create_or_replace_session($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    ['first_' + Date.now(), 'm', term, 't', 1, 'h', 'c', '{}']
  );
  const d1 = r1.rows[0].create_or_replace_session;
  console.log('\nTest 1 (new terminal):', d1.success ? 'SUCCESS' : 'FAIL', '| conflict:', d1.conflict || false);

  // Test 2: Same terminal, different session_id - should get CONFLICT
  const r2 = await client.query(
    'SELECT create_or_replace_session($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    ['second_' + Date.now(), 'm', term, 't', 2, 'h', 'c', '{}']
  );
  const d2 = r2.rows[0].create_or_replace_session;
  console.log('Test 2 (same terminal, fresh heartbeat):', d2.success ? 'SUCCESS' : 'FAIL', '| conflict:', d2.conflict || false);
  if (d2.conflict) {
    console.log('  conflict_session_id:', d2.conflict_session_id);
    console.log('  conflict_heartbeat_age_seconds:', d2.conflict_heartbeat_age_seconds);
  }

  // Test 3: Make old session stale, then try again - should auto-release
  console.log('\nMaking first session stale...');
  await client.query(
    "UPDATE claude_sessions SET heartbeat_at = NOW() - interval '10 minutes' WHERE terminal_identity = $1 AND status IN ('active', 'idle')",
    [termIdentity]
  );

  const r3 = await client.query(
    'SELECT create_or_replace_session($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    ['third_' + Date.now(), 'm', term, 't', 3, 'h', 'c', '{}']
  );
  const d3 = r3.rows[0].create_or_replace_session;
  console.log('Test 3 (same terminal, stale heartbeat):', d3.success ? 'SUCCESS' : 'FAIL', '| auto_released:', d3.auto_released || false);

  // Cleanup
  await client.query('DELETE FROM claude_sessions WHERE terminal_identity = $1', [termIdentity]);
  console.log('\nAll tests complete. Cleaned up.');
  await client.end();
}

test().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
