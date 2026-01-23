#!/usr/bin/env node
/**
 * Verify RLS policies on protocol_constitution table
 * SD: SD-LEO-SELF-IMPROVE-FOUND-001
 */

const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');
require('dotenv').config();

async function verifyRLS() {
  // Use direct PostgreSQL connection to check pg_policies
  const connectionString = `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${process.env.SUPABASE_DB_PASSWORD}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Check if RLS policies exist
    const policies = await client.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE tablename = 'protocol_constitution'
      ORDER BY policyname
    `);

    console.log('🔒 RLS Policies on protocol_constitution table:');
    console.log(`   Found ${policies.rows.length} policies\n`);

    policies.rows.forEach(p => {
      console.log(`   - ${p.policyname} (${p.cmd}) - Roles: ${p.roles.join(', ')}`);
    });

    // Check RLS is enabled
    const rlsEnabled = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE tablename = 'protocol_constitution'
    `);

    console.log(`\n   RLS Enabled: ${rlsEnabled.rows[0]?.rowsecurity || false}`);

    // Count constitution rules
    const count = await client.query('SELECT COUNT(*) as count FROM protocol_constitution');
    console.log(`   Constitution rules count: ${count.rows[0].count}`);

    if (policies.rows.length === 4 && rlsEnabled.rows[0]?.rowsecurity) {
      console.log('\n✅ RLS policies verified successfully');
      console.log('   Note: SERVICE_ROLE connections bypass RLS (expected behavior)');
    } else {
      console.log('\n⚠️  RLS verification incomplete');
    }

  } finally {
    await client.end();
  }
}

verifyRLS().catch(console.error);
