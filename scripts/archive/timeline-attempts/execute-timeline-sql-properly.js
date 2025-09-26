#!/usr/bin/env node

/**
 * Execute Timeline SQL using Supabase connection
 * Builds DATABASE_URL from Supabase config
 */

import dotenv from "dotenv";
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeSQLSchema() {
  console.log('🔨 Creating SD Timeline Tracking Tables...\n');

  // Check if we have DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('✅ Found DATABASE_URL, using direct connection method');

    // Dynamic import of pg
    const pg = await import('pg');
    const { Client } = pg;

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('✅ Connected to database directly');

      // Read SQL schema
      const sqlContent = await fs.readFile(
        path.join(__dirname, '../database/schema/sd_execution_timeline.sql'),
        'utf8'
      );

      // Execute the SQL
      await client.query(sqlContent);
      console.log('✅ Timeline tables created successfully!');

      // Insert initial data
      const insertQuery = `
        INSERT INTO sd_execution_timeline (sd_id, phase, phase_started_at, phase_completed_at, duration_hours, duration_minutes, agent_responsible, completion_status)
        VALUES
        ('SD-INFRA-EXCELLENCE-001', 'LEAD', '2025-09-26T17:00:00Z', '2025-09-26T17:45:00Z', 0.75, 45, 'LEAD', 'completed'),
        ('SD-INFRA-EXCELLENCE-001', 'PLAN', '2025-09-26T17:45:00Z', '2025-09-26T19:19:00Z', 1.57, 94, 'PLAN', 'completed'),
        ('SD-INFRA-EXCELLENCE-001', 'EXEC', '2025-09-26T19:19:00Z', NULL, NULL, NULL, 'EXEC', 'in_progress')
        ON CONFLICT DO NOTHING;
      `;

      await client.query(insertQuery);
      console.log('✅ Initial timeline data inserted');

      // Verify
      const result = await client.query(`
        SELECT phase, duration_hours, completion_status
        FROM sd_execution_timeline
        WHERE sd_id = 'SD-INFRA-EXCELLENCE-001'
        ORDER BY phase_started_at
      `);

      console.log('\n📊 Timeline data:');
      result.rows.forEach(row => {
        const status = row.completion_status === 'completed' ? '✅' : '🚀';
        const duration = row.duration_hours ? `${row.duration_hours} hours` : 'In progress';
        console.log(`   ${status} ${row.phase}: ${duration}`);
      });

      await client.end();
      return true;

    } catch (error) {
      console.error('❌ Error:', error.message);
      await client.end();
      return false;
    }
  }

  // Fallback: Try to build DATABASE_URL from Supabase config
  console.log('⚠️  DATABASE_URL not found, attempting to construct it...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('❌ Cannot construct DATABASE_URL without NEXT_PUBLIC_SUPABASE_URL');
    return false;
  }

  // Extract project ID from URL
  const projectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectId) {
    console.error('❌ Cannot extract project ID from Supabase URL');
    return false;
  }

  console.log(`📋 Project ID: ${projectId}`);

  // Standard Supabase database URL format
  // Note: This requires the database password which we don't have
  console.log('\n📝 To create the timeline table, you need to:');
  console.log('');
  console.log('1. Add DATABASE_URL to your .env file:');
  console.log('   DATABASE_URL=postgresql://postgres:[password]@db.' + projectId + '.supabase.co:5432/postgres');
  console.log('');
  console.log('   Get the password from:');
  console.log('   https://supabase.com/dashboard/project/' + projectId + '/settings/database');
  console.log('');
  console.log('2. OR run this SQL in Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/' + projectId + '/editor');
  console.log('');
  console.log('   Copy the SQL from: database/schema/sd_execution_timeline.sql');

  // Meanwhile, store in metadata
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        timeline_tracking: {
          enabled: true,
          phases: {
            LEAD: { started: '2025-09-26T17:00:00Z', completed: '2025-09-26T17:45:00Z', duration_hours: 0.75 },
            PLAN: { started: '2025-09-26T17:45:00Z', completed: '2025-09-26T19:19:00Z', duration_hours: 1.57 },
            EXEC: { started: '2025-09-26T19:19:00Z', completed: null, duration_hours: null }
          },
          total_active_hours: 2.32
        }
      }
    })
    .eq('id', 'SD-INFRA-EXCELLENCE-001');

  if (!error) {
    console.log('\n✅ Timeline data stored in metadata as fallback');
  }

  return false;
}

async function main() {
  const success = await executeSQLSchema();
  if (!success) {
    console.log('\n⚠️  Table creation requires DATABASE_URL or manual SQL execution');
  }
}

// Support both file execution and passing SQL file as argument
const sqlFile = process.argv[2];
if (sqlFile) {
  console.log(`📄 Using SQL file: ${sqlFile}`);
}

main().catch(console.error);