#!/usr/bin/env node
/**
 * RLS Policy Audit Script
 * SD-SEC-RLS-POLICIES-001
 *
 * Audits database for:
 * - Tables without RLS enabled
 * - Policies using USING(true)
 * - Policies using WITH CHECK(true)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false }
});

async function audit() {
  await client.connect();
  console.log('RLS Security Audit');
  console.log('==================\n');

  // 1. Tables without RLS
  const noRls = await client.query(`
    SELECT c.relname as table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
    ORDER BY c.relname
  `);

  console.log(`CRITICAL: ${noRls.rows.length} tables WITHOUT RLS`);
  noRls.rows.forEach(r => console.log(`  - ${r.table_name}`));

  // 2. Permissive USING(true) policies
  const usingTrue = await client.query(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual::text ILIKE '%true%'
      AND qual::text NOT ILIKE '%auth.uid()%'
    ORDER BY tablename
  `);

  console.log(`\nHIGH: ${usingTrue.rows.length} policies with USING(true)`);

  // 3. Permissive WITH CHECK(true) policies
  const withCheckTrue = await client.query(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND with_check::text ILIKE '%true%'
      AND with_check::text NOT ILIKE '%auth.uid()%'
    ORDER BY tablename
  `);

  console.log(`HIGH: ${withCheckTrue.rows.length} policies with WITH CHECK(true)`);

  // 4. Summary
  console.log('\n==================');
  console.log('SUMMARY:');
  console.log(`  Tables without RLS: ${noRls.rows.length}`);
  console.log(`  USING(true) policies: ${usingTrue.rows.length}`);
  console.log(`  WITH CHECK(true) policies: ${withCheckTrue.rows.length}`);

  const coverage = 100 - (noRls.rows.length / (noRls.rows.length + 100) * 100);
  console.log(`  Estimated RLS coverage: ~${coverage.toFixed(0)}%`);

  await client.end();

  return {
    tablesWithoutRls: noRls.rows.length,
    usingTruePolicies: usingTrue.rows.length,
    withCheckTruePolicies: withCheckTrue.rows.length
  };
}

audit()
  .then(results => {
    if (results.tablesWithoutRls > 0) {
      process.exit(1); // Fail if tables without RLS
    }
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
