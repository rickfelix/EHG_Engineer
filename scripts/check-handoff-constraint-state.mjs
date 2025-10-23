#!/usr/bin/env node
/**
 * Check Current State of sd_phase_handoffs Table and Constraint
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkCurrentState() {
  console.log('🔍 Checking current state of sd_phase_handoffs...\n');

  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });

  // Check existing records
  const { rows: records } = await client.query(`
    SELECT id, sd_id, handoff_type, status
    FROM sd_phase_handoffs
    ORDER BY created_at DESC
    LIMIT 10;
  `);

  console.log(`\n📋 Existing Records (${records.length} found):`);
  records.forEach(r => {
    console.log(`   - ${r.sd_id}: ${r.handoff_type} (${r.status})`);
  });

  // Check current constraint
  const { rows: constraints } = await client.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'sd_phase_handoffs'
      AND con.conname = 'sd_phase_handoffs_handoff_type_check';
  `);

  console.log(`\n🔧 Current Constraint:`);
  if (constraints.length > 0) {
    console.log(`   Name: ${constraints[0].conname}`);
    console.log(`   Definition: ${constraints[0].definition}`);
  } else {
    console.log(`   ⚠️  No constraint found`);
  }

  await client.end();
}

checkCurrentState().catch(console.error);
