#!/usr/bin/env node

/**
 * Apply Sub-Agent Tracking Schema
 * Creates database tables for tracking sub-agent activations
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applySchema() {
  console.log('📊 Applying Sub-Agent Tracking Schema...');
  console.log('========================================');

  try {
    // Read the SQL schema
    const schemaPath = path.join(__dirname, '..', 'database', 'schema', 'sub_agent_tracking.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    console.log('📄 Schema file loaded');
    console.log('⚠️  Note: Direct SQL execution requires database admin access');
    console.log('\nTo apply this schema, you have two options:');
    console.log('\n1. Via Supabase Dashboard:');
    console.log('   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('   - Paste the following SQL:');
    console.log('\n' + '='.repeat(60));
    console.log(schema);
    console.log('='.repeat(60));
    console.log('\n2. Via psql (if DATABASE_URL is configured):');
    console.log('   psql $DATABASE_URL -f database/schema/sub_agent_tracking.sql');

    // Try to check if tables already exist
    console.log('\n🔍 Checking existing tables...');

    const { data: _activations, error: activationsError } = await supabase
      .from('sub_agent_activations')
      .select('id')
      .limit(1);

    if (!activationsError) {
      console.log('✅ sub_agent_activations table already exists');
    } else if (activationsError.message.includes('does not exist')) {
      console.log('❌ sub_agent_activations table does not exist - needs creation');
    }

    const { data: _sessions, error: sessionsError } = await supabase
      .from('leo_session_tracking')
      .select('id')
      .limit(1);

    if (!sessionsError) {
      console.log('✅ leo_session_tracking table already exists');
    } else if (sessionsError.message.includes('does not exist')) {
      console.log('❌ leo_session_tracking table does not exist - needs creation');
    }

    // Save schema to clipboard if possible (for easy pasting)
    try {
      const { execSync } = await import('child_process');
      if (process.platform === 'darwin') {
        execSync('pbcopy', { input: schema });
        console.log('\n📋 Schema copied to clipboard (macOS)');
      } else if (process.platform === 'linux') {
        execSync('xclip -selection clipboard', { input: schema });
        console.log('\n📋 Schema copied to clipboard (Linux)');
      }
    } catch {
      // Clipboard copy not available
    }

    return true;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  applySchema()
    .then(success => {
      if (success) {
        console.log('\n✅ Schema preparation complete');
        console.log('📝 Please apply the schema using one of the methods above');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export default applySchema;