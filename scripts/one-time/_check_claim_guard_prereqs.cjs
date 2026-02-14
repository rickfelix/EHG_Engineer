#!/usr/bin/env node
/**
 * One-time script: Check claim guard migration prerequisites
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
  console.log('Connected.');

  // Check indexes on sd_claims
  const indexes = await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sd_claims'"
  );
  console.log('\nIndexes on sd_claims:');
  indexes.rows.forEach(r => console.log('  ' + r.indexname + ': ' + r.indexdef));

  // Check all constraints
  const constraints = await client.query(
    "SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) as def " +
    "FROM pg_constraint con JOIN pg_class rel ON con.conrelid = rel.oid " +
    "WHERE rel.relname = 'sd_claims' ORDER BY con.contype"
  );
  console.log('\nAll constraints on sd_claims:');
  constraints.rows.forEach(r => console.log('  [' + r.contype + '] ' + r.conname + ': ' + r.def));

  // Check if unique constraint on (sd_id, session_id) exists
  const hasUnique = constraints.rows.some(r =>
    r.contype === 'u' && r.def.includes('sd_id') && r.def.includes('session_id')
  );
  console.log('\nUnique constraint on (sd_id, session_id): ' + (hasUnique ? 'EXISTS' : 'MISSING'));

  // Check claim_sd function source
  const funcSrc = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'claim_sd' LIMIT 1"
  );
  console.log('\nclaim_sd function source:');
  console.log(funcSrc.rows[0]?.prosrc || '(not found)');

  // Check release_sd function source
  const relSrc = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'release_sd' LIMIT 1"
  );
  console.log('\nrelease_sd function source:');
  console.log(relSrc.rows[0]?.prosrc || '(not found)');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
