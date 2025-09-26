#!/usr/bin/env node

/**
 * Database Connection Helper for Strategic Directives
 *
 * CRITICAL: This helper ensures proper database separation based on target_application
 * - EHG target → liapbndqlqxdcgpwntbv database (business app)
 * - EHG_ENGINEER target → dedlbzhpgkmetvhbkyzq database (engineering platform)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get the correct Supabase client based on SD target application
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<{client: object, database: string, targetApp: string}>}
 */
export async function getDatabaseForSD(sdId) {
  // First, check the SD's target_application using EHG_ENGINEER database
  const engineerSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: sd, error } = await engineerSupabase
    .from('strategic_directives_v2')
    .select('id, title, target_application')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    throw new Error(`SD ${sdId} not found: ${error?.message}`);
  }

  console.log(`\n📋 SD-${sdId}: ${sd.title}`);
  console.log(`🎯 Target Application: ${sd.target_application || 'NOT SET'}`);

  // Determine which database to use
  if (sd.target_application === 'EHG') {
    // Business application features
    if (!process.env.EHG_SUPABASE_URL || !process.env.EHG_SUPABASE_ANON_KEY) {
      throw new Error('EHG database credentials not configured in .env');
    }

    const ehgClient = createClient(
      process.env.EHG_SUPABASE_URL,
      process.env.EHG_SUPABASE_ANON_KEY
    );

    console.log(`✅ Using EHG database: liapbndqlqxdcgpwntbv`);
    console.log(`📍 Location: /mnt/c/_EHG/ehg`);

    return {
      client: ehgClient,
      database: 'EHG',
      databaseId: 'liapbndqlqxdcgpwntbv',
      targetApp: 'EHG'
    };

  } else if (sd.target_application === 'EHG_ENGINEER') {
    // Engineering platform features
    console.log(`✅ Using EHG_ENGINEER database: dedlbzhpgkmetvhbkyzq`);
    console.log(`📍 Location: /mnt/c/_EHG/EHG_Engineer`);

    return {
      client: engineerSupabase,
      database: 'EHG_ENGINEER',
      databaseId: 'dedlbzhpgkmetvhbkyzq',
      targetApp: 'EHG_ENGINEER'
    };

  } else {
    console.warn(`⚠️  WARNING: target_application not set for SD-${sdId}`);
    console.warn(`   This SD needs classification before implementation`);
    throw new Error(`SD ${sdId} has no target_application set`);
  }
}

/**
 * Test database connection
 */
async function testConnection(client, databaseName) {
  try {
    // Test with a simple RPC call or auth check
    const { data, error } = await client.auth.getSession();

    if (error && error.message !== 'Auth session missing!') {
      console.error(`❌ Failed to connect to ${databaseName}: ${error.message}`);
      return false;
    }

    console.log(`✅ Successfully connected to ${databaseName} database`);
    return true;
  } catch (err) {
    console.error(`❌ Connection error: ${err.message}`);
    return false;
  }
}

// If run directly, test with provided SD
if (import.meta.url === `file://${process.argv[1]}`) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node get-database-for-sd.js <SD-ID>');
    console.error('Example: node get-database-for-sd.js SD-001');
    process.exit(1);
  }

  try {
    const { client, database, databaseId, targetApp } = await getDatabaseForSD(sdId);

    console.log('\n🔍 Testing connection...');
    const connected = await testConnection(client, database);

    if (connected) {
      console.log('\n✅ Database Helper Summary:');
      console.log(`   SD: ${sdId}`);
      console.log(`   Target App: ${targetApp}`);
      console.log(`   Database: ${database} (${databaseId})`);
      console.log(`   Status: CONNECTED`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

export default getDatabaseForSD;