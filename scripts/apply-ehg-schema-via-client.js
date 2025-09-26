#!/usr/bin/env node

/**
 * Apply EHG Business Agents Schema via Supabase Client
 * Uses RPC or direct client methods to execute DDL
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applyEHGSchema() {
  console.log('🚀 Applying EHG Business Agents Schema via Client');
  console.log('=' .repeat(60));

  // Connect to EHG database
  const ehgClient = createClient(
    process.env.EHG_SUPABASE_URL,
    process.env.EHG_SUPABASE_ANON_KEY
  );

  console.log('📊 Target Database: EHG (liapbndqlqxdcgpwntbv)');

  try {
    // Read the schema SQL
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-ehg-business-agents.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    let successCount = 0;
    let errors = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.length < 10) continue;

      try {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);

        // Try to execute the statement using rpc
        const { error } = await ehgClient.rpc('exec_sql', {
          sql_query: statement + ';'
        });

        if (error) {
          // If rpc doesn't work, try other approaches
          if (error.code === 'PGRST202' || error.message?.includes('function exec_sql')) {
            console.log('  RPC method not available, trying alternative...');

            // For CREATE TABLE statements, try to create a dummy record to trigger table creation
            if (statement.toLowerCase().includes('create table if not exists business_agents')) {
              // Test if table exists by querying it
              const { error: testError } = await ehgClient
                .from('business_agents')
                .select('id')
                .limit(1);

              if (testError && testError.code === 'PGRST116') {
                console.log('  ⚠️  Table does not exist and cannot be created via client');
                errors.push(`Cannot create business_agents table: ${testError.message}`);
              } else {
                console.log('  ✅ business_agents table already exists');
                successCount++;
              }
              continue;
            }

            // For other tables, do similar checks
            const tableMatch = statement.match(/create table if not exists (\w+)/i);
            if (tableMatch) {
              const tableName = tableMatch[1];
              const { error: testError } = await ehgClient
                .from(tableName)
                .select('id')
                .limit(1);

              if (testError && testError.code === 'PGRST116') {
                console.log(`  ⚠️  Table ${tableName} does not exist and cannot be created via client`);
                errors.push(`Cannot create ${tableName} table: ${testError.message}`);
              } else {
                console.log(`  ✅ ${tableName} table already exists`);
                successCount++;
              }
              continue;
            }

            // Skip DDL statements that can't be executed via client
            console.log('  ⚠️  Skipping DDL statement (requires direct database access)');
            continue;
          } else {
            throw error;
          }
        } else {
          console.log('  ✅ Success');
          successCount++;
        }

      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        errors.push(`Statement ${i + 1}: ${err.message}`);
      }
    }

    console.log('\n📊 Execution Summary:');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Some statements could not be executed:');
      errors.slice(0, 5).forEach(error => console.log(`  • ${error}`));
      if (errors.length > 5) {
        console.log(`  ... and ${errors.length - 5} more errors`);
      }
    }

    // Test if we can query the main table
    console.log('\n🔍 Testing table access...');
    try {
      const { data, error } = await ehgClient
        .from('business_agents')
        .select('id')
        .limit(1);

      if (!error) {
        console.log('✅ business_agents table is accessible');

        // Count existing agents
        const { count } = await ehgClient
          .from('business_agents')
          .select('*', { count: 'exact', head: true });

        console.log(`📊 Current agents: ${count || 0}`);
      } else if (error.code === 'PGRST116') {
        console.log('⚠️  business_agents table does not exist');
        console.log('   Manual schema application required via Supabase dashboard');
      } else {
        console.log(`⚠️  Table access error: ${error.message}`);
      }
    } catch (err) {
      console.log(`⚠️  Table test failed: ${err.message}`);
    }

  } catch (error) {
    console.error('❌ Schema application failed:', error);
  }
}

applyEHGSchema().catch(console.error);