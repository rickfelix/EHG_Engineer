#!/usr/bin/env node

/**
 * Apply business agent schema to EHG database
 * For SD-001: CrewAI-Style Agents Dashboard
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applyEHGSchema() {
  console.log('🚀 Applying Business Agent Schema to EHG Database');
  console.log('=' .repeat(60));

  // Verify EHG database credentials
  if (!process.env.EHG_SUPABASE_URL || !process.env.EHG_SUPABASE_ANON_KEY) {
    console.error('❌ EHG database credentials not found in .env');
    console.error('   Required: EHG_SUPABASE_URL and EHG_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  // Connect to EHG database
  const ehgClient = createClient(
    process.env.EHG_SUPABASE_URL,
    process.env.EHG_SUPABASE_ANON_KEY
  );

  console.log('📊 Target Database: EHG (liapbndqlqxdcgpwntbv)');
  console.log('🎯 Purpose: Business application agent monitoring');
  console.log('');

  // Read the migration SQL
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-ehg-business-agents.sql');
  const sql = await fs.readFile(sqlPath, 'utf-8');

  // Since we can't execute DDL directly via Supabase client,
  // we'll provide instructions for manual execution
  console.log('⚠️  Note: DDL operations require direct database access');
  console.log('');
  console.log('📝 To apply the schema, use one of these methods:');
  console.log('');
  console.log('Option 1: Supabase Dashboard SQL Editor');
  console.log('=========================================');
  console.log('1. Go to: https://supabase.com/dashboard/project/liapbndqlqxdcgpwntbv/sql/new');
  console.log('2. Copy the SQL from: database/migrations/2025-09-24-ehg-business-agents.sql');
  console.log('3. Paste and execute in the SQL editor');
  console.log('');
  console.log('Option 2: If you have EHG database password');
  console.log('==========================================');
  console.log('export EHG_DB_PASSWORD="your-password"');
  console.log('psql "postgresql://postgres.liapbndqlqxdcgpwntbv:$EHG_DB_PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" -f database/migrations/2025-09-24-ehg-business-agents.sql');
  console.log('');

  // Test if tables exist (to check if already applied)
  try {
    const { data, error } = await ehgClient
      .from('business_agents')
      .select('id')
      .limit(1);

    if (!error) {
      console.log('✅ Schema already applied! Business agents table exists.');
      console.log('');

      // Count existing agents
      const { count } = await ehgClient
        .from('business_agents')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 Current state: ${count || 0} business agents configured`);
    } else if (error.code === 'PGRST204' || error.code === '42P01') {
      console.log('⏳ Schema not yet applied. Please execute the migration SQL.');
    }
  } catch (err) {
    console.log('⏳ Schema check inconclusive. Please verify manually.');
  }

  console.log('');
  console.log('📋 Tables to be created:');
  console.log('  • business_agents - Agent definitions');
  console.log('  • agent_tasks - Task queue and history');
  console.log('  • agent_metrics - Performance data');
  console.log('  • agent_logs - Execution logs');
  console.log('  • agent_controls - Control commands');
  console.log('');
  console.log('✨ Once applied, the agent dashboard can connect and display data!');
}

applyEHGSchema().catch(console.error);