#!/usr/bin/env node
/**
 * Apply RLS policies to nav_routes table
 * Fixes 406 error when updating navigation routes in Settings page
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function applyRLSPolicies() {
  console.log('=== Applying RLS Policies to nav_routes ===\n');

  const client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  try {
    // Check current RLS status
    const rlsCheck = await client.query(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'nav_routes';
    `);
    console.log('\nCurrent RLS enabled:', rlsCheck.rows[0]?.relrowsecurity);

    // Check existing policies
    const existingPolicies = await client.query(`
      SELECT policyname
      FROM pg_policies
      WHERE tablename = 'nav_routes';
    `);
    console.log('Existing policies:', existingPolicies.rows.map(r => r.policyname));

    // Enable RLS
    await client.query('ALTER TABLE nav_routes ENABLE ROW LEVEL SECURITY;');
    console.log('\n[OK] RLS enabled on nav_routes');

    // Drop existing policies
    const policiesToDrop = [
      'Allow authenticated users to read nav_routes',
      'Allow authenticated users to update nav_routes',
      'Allow authenticated users to insert nav_routes',
      'Allow authenticated users to delete nav_routes'
    ];

    for (const policy of policiesToDrop) {
      await client.query(`DROP POLICY IF EXISTS "${policy}" ON nav_routes;`);
      console.log(`[OK] Dropped policy (if existed): ${policy}`);
    }

    // Create SELECT policy
    await client.query(`
      CREATE POLICY "Allow authenticated users to read nav_routes"
      ON nav_routes FOR SELECT
      TO authenticated
      USING (true);
    `);
    console.log('[OK] Created SELECT policy');

    // Create UPDATE policy
    await client.query(`
      CREATE POLICY "Allow authenticated users to update nav_routes"
      ON nav_routes FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    `);
    console.log('[OK] Created UPDATE policy');

    // Create INSERT policy
    await client.query(`
      CREATE POLICY "Allow authenticated users to insert nav_routes"
      ON nav_routes FOR INSERT
      TO authenticated
      WITH CHECK (true);
    `);
    console.log('[OK] Created INSERT policy');

    // Create DELETE policy
    await client.query(`
      CREATE POLICY "Allow authenticated users to delete nav_routes"
      ON nav_routes FOR DELETE
      TO authenticated
      USING (true);
    `);
    console.log('[OK] Created DELETE policy');

    // Verify policies were created
    const finalPolicies = await client.query(`
      SELECT policyname, cmd, roles, qual, with_check
      FROM pg_policies
      WHERE tablename = 'nav_routes';
    `);
    console.log('\n=== FINAL POLICIES ===');
    finalPolicies.rows.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd}) for ${p.roles}`);
    });

    // Verify RLS is enabled
    const finalRLS = await client.query(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'nav_routes';
    `);
    console.log('\nRLS enabled:', finalRLS.rows[0]?.relrowsecurity);

    console.log('\n=== SUCCESS: RLS policies applied ===');

  } catch (error) {
    console.error('\n[ERROR]', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

applyRLSPolicies().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
