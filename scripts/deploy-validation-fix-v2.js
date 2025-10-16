#!/usr/bin/env node
/**
 * Deploy User Story Validation Fix Migration
 */

import { createDatabaseClient, executeSQLFile } from '../lib/supabase-connection.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function deployFix() {
  console.log('🚀 Deploying User Story Validation Fix\n');

  const migrationFile = path.join(__dirname, '../database/migrations/20251016_fix_user_story_validation_check.sql');
  let client;

  try {
    // Read migration file
    const sqlContent = await fs.readFile(migrationFile, 'utf8');
    console.log(`📄 File: ${path.basename(migrationFile)}`);
    console.log(`   Size: ${(sqlContent.length / 1024).toFixed(1)} KB\n`);

    // Connect to database
    console.log('⏳ Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connected\n');

    // Execute migration
    console.log('⏳ Executing migration...');
    const startTime = Date.now();
    const result = await executeSQLFile(client, sqlContent, { transaction: false });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result.success) {
      console.error('❌ Migration failed:', result.error);
      process.exit(1);
    }

    console.log(`✅ Migration completed in ${duration}s`);
    console.log(`   Statements executed: ${result.totalStatements}\n`);

    // Verify fix using Supabase client
    console.log('🔍 Verifying fix for SD-RETRO-ENHANCE-001...');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: breakdown } = await supabase.rpc('get_progress_breakdown', {
      sd_id_param: 'SD-RETRO-ENHANCE-001'
    });

    if (breakdown) {
      const planVerification = breakdown.phases.PLAN_verification;
      const totalProgress = breakdown.total_progress;

      console.log('\n📊 Progress Breakdown:');
      console.log(`   Total Progress: ${totalProgress}%`);
      console.log(`   PLAN_verification:`);
      console.log(`     - user_stories_validated: ${planVerification.user_stories_validated}`);
      console.log(`     - sub_agents_verified: ${planVerification.sub_agents_verified}`);
      console.log(`     - progress: ${planVerification.progress}/${planVerification.weight}`);

      if (totalProgress === 100) {
        console.log('\n✅ SUCCESS: SD-RETRO-ENHANCE-001 now at 100%!');
        console.log('   Bug fix verified - validation_status check working correctly');
      } else {
        console.log(`\n⚠️  Progress is ${totalProgress}%, expected 100%`);
      }
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

deployFix();
