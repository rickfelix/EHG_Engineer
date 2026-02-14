#!/usr/bin/env node
/**
 * One-time script: Add missing unique constraint on sd_claims(sd_id, session_id)
 * Handles duplicate rows that prevent unique index creation.
 */
const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function main() {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('Connected to database.');

  // Step 1: Check for duplicate (sd_id, session_id) pairs
  const dupes = await client.query(
    "SELECT sd_id, session_id, COUNT(*) as cnt " +
    "FROM sd_claims GROUP BY sd_id, session_id HAVING COUNT(*) > 1"
  );
  console.log('\nDuplicate (sd_id, session_id) pairs:', dupes.rows.length);
  dupes.rows.forEach(r => console.log('  sd_id=' + r.sd_id + ' session_id=' + r.session_id + ' count=' + r.cnt));

  if (dupes.rows.length > 0) {
    console.log('\nRemoving duplicates (keeping latest claimed_at)...');
    // Delete older duplicates, keep the one with latest claimed_at
    const deleteResult = await client.query(
      "DELETE FROM sd_claims WHERE id IN (" +
      "  SELECT id FROM (" +
      "    SELECT id, ROW_NUMBER() OVER (PARTITION BY sd_id, session_id ORDER BY claimed_at DESC) as rn" +
      "    FROM sd_claims" +
      "  ) sub WHERE rn > 1" +
      ")"
    );
    console.log('Deleted ' + deleteResult.rowCount + ' duplicate rows.');
  }

  // Step 2: Check if the constraint already exists
  const existing = await client.query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'sd_claims' AND indexname = 'idx_sd_claims_sd_session_unique'"
  );

  if (existing.rows.length > 0) {
    console.log('\nUnique index idx_sd_claims_sd_session_unique already exists.');
  } else {
    console.log('\nCreating unique index on sd_claims(sd_id, session_id)...');
    await client.query(
      "CREATE UNIQUE INDEX idx_sd_claims_sd_session_unique ON sd_claims (sd_id, session_id)"
    );
    console.log('Unique index created successfully.');
  }

  // Step 3: Verify
  const verify = await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sd_claims'"
  );
  console.log('\nAll indexes on sd_claims:');
  verify.rows.forEach(r => console.log('  ' + r.indexname + ': ' + r.indexdef));

  // Step 4: Test claim_sd with a non-existent SD (should succeed with no FK constraint on sd_id)
  console.log('\nTesting claim_sd function...');
  try {
    const testResult = await client.query(
      "SELECT claim_sd('TEST-NONEXISTENT-SD-DRY-RUN', 'test-session-dry-run', 'test-track') as result"
    );
    console.log('claim_sd result:', JSON.stringify(testResult.rows[0].result, null, 2));
    // Clean up
    await client.query("DELETE FROM sd_claims WHERE session_id = 'test-session-dry-run'");
    console.log('Test data cleaned up.');
  } catch (e) {
    console.log('claim_sd test error: ' + e.message);
    await client.query("DELETE FROM sd_claims WHERE session_id = 'test-session-dry-run'").catch(() => {});
  }

  // Step 5: Verify claim_sd and release_sd functions exist
  const funcs = await client.query(
    "SELECT routine_name FROM information_schema.routines " +
    "WHERE routine_schema = 'public' AND routine_name IN ('claim_sd', 'release_sd')"
  );
  console.log('\nFunctions verified:');
  funcs.rows.forEach(r => console.log('  ' + r.routine_name + '()'));

  console.log('\nDone.');
  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
