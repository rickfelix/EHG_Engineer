import { createDatabaseClient } from '../lib/supabase-connection.js';

console.log('=== Applying Research Results Migration ===');
console.log('Target: EHG Application Database (venture_drafts table)');
console.log('');

(async () => {
  let client;
  try {
    console.log('1. Connecting to EHG application database...');
    client = await createDatabaseClient('app', { verify: false });
    console.log('   ✅ Connected successfully');
    console.log('');

    console.log('2. Applying migration to make research_results nullable...');
    const migrationSQL = `
      ALTER TABLE public.venture_drafts
      ALTER COLUMN research_results DROP NOT NULL;
    `;

    await client.query(migrationSQL);
    console.log('   ✅ Migration applied successfully');
    console.log('');

    console.log('3. Adding column comment...');
    const commentSQL = `
      COMMENT ON COLUMN public.venture_drafts.research_results IS
        'Stores AI research results from 4 agents (market_sizing, pain_point, competitive, strategic_fit). NULL indicates research has not yet started. Populated after Stage 2 research completion.';
    `;

    await client.query(commentSQL);
    console.log('   ✅ Comment added successfully');
    console.log('');

    console.log('4. Verifying the constraint was removed...');
    const verifySQL = `
      SELECT
        column_name,
        is_nullable,
        data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `;

    const result = await client.query(verifySQL);

    if (result.rows.length > 0) {
      const col = result.rows[0];
      console.log('   Column:', col.column_name);
      console.log('   Type:', col.data_type);
      console.log('   Nullable:', col.is_nullable === 'YES' ? '✅ YES' : '❌ NO');

      if (col.is_nullable === 'YES') {
        console.log('');
        console.log('✅ Migration complete! Venture drafts can now be saved before research starts.');
      } else {
        console.log('');
        console.log('⚠️  Warning: Column still shows as NOT NULL. Please verify manually.');
      }
    } else {
      console.log('   ⚠️  Could not verify - column not found');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('If this is a permissions error, please apply the migration manually:');
    console.error('1. Go to Supabase Dashboard → SQL Editor');
    console.error('2. Execute: ALTER TABLE public.venture_drafts ALTER COLUMN research_results DROP NOT NULL;');
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
})();
