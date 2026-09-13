require('dotenv').config();
const fs = require('fs');
const { createDatabaseClient } = require('../scripts/lib/supabase-connection.js');

const TEST_FN = 'claim_sd_test_fceeb001';

async function run() {
  const mig = fs.readFileSync('database/migrations/20260913_claim_sd_quickfix_evict_reset_refuse.sql', 'utf8');
  const startIdx = mig.indexOf('CREATE OR REPLACE FUNCTION');
  const endMarker = '$function$;';
  const endIdx = mig.indexOf(endMarker, startIdx) + endMarker.length;
  let funcSql = mig.slice(startIdx, endIdx);
  funcSql = funcSql.replace('public.claim_sd(', `public.${TEST_FN}(`);

  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    console.log('Creating scratch function', TEST_FN, '...');
    await client.query(funcSql);
    console.log('COMPILE OK — scratch function created successfully (Postgres parsed and validated the plpgsql body at CREATE time).');
  } catch (e) {
    console.error('COMPILE FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    try {
      await client.query(`DROP FUNCTION IF EXISTS public.${TEST_FN}(text, text, text, boolean, integer);`);
      console.log('Scratch function dropped. Live claim_sd untouched throughout.');
    } catch (e2) {
      console.error('WARN: drop failed (manual cleanup needed):', e2.message);
    }
    await client.end();
  }
}

run();
