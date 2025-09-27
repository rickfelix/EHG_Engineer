import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

async function dropExecutionOrderColumn() {
  console.log('=== DROPPING EXECUTION_ORDER COLUMN ===\n');

  // Try using DATABASE_URL if available
  if (process.env.DATABASE_URL) {
    console.log('Attempting to drop column using DATABASE_URL...\n');

    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();

      // Drop the column
      await client.query(`
        ALTER TABLE strategic_directives_v2
        DROP COLUMN IF EXISTS execution_order CASCADE;
      `);

      console.log('✅ Successfully dropped execution_order column!');

      // Verify the column is gone
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'execution_order';
      `);

      if (result.rows.length === 0) {
        console.log('✅ Verified: execution_order column no longer exists');
      } else {
        console.log('⚠️ Warning: Column may still exist');
      }

      await client.end();
    } catch (error) {
      console.error('Error:', error.message);
      await client.end();

      // If direct connection fails, try alternative approach
      console.log('\nTrying alternative approach...');
      await trySupabaseServiceRole();
    }
  } else {
    console.log('DATABASE_URL not found, trying service role key...');
    await trySupabaseServiceRole();
  }
}

async function trySupabaseServiceRole() {
  // Check if we have service role key
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    try {
      // Try to use RPC if available
      const { data, error } = await supabaseAdmin.rpc('execute_sql', {
        sql: 'ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS execution_order CASCADE;'
      });

      if (error) {
        throw error;
      }

      console.log('✅ Successfully dropped execution_order column via service role!');
    } catch (error) {
      console.error('Service role attempt failed:', error.message);
      console.log('\n⚠️  Unable to drop column programmatically.');
      console.log('\nPlease run this SQL manually in Supabase Dashboard:');
      console.log('\nALTER TABLE strategic_directives_v2');
      console.log('DROP COLUMN IF EXISTS execution_order;');
    }
  } else {
    console.log('\n⚠️  No DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY found.');
    console.log('\nTo drop the column, please:');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Run: ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS execution_order;');
  }
}

dropExecutionOrderColumn().catch(console.error);