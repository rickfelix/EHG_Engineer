#!/usr/bin/env node
/**
 * Apply Migration via Supabase REST API
 */
// fs import kept for potential future file operations
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function executeSql(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ sql_query: sql })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('📊 Applying Model Usage Tracking Migration via REST...\n');

  // First, check if we can use the direct SQL approach
  // Let's just create the table with individual statements via the API

  // Create table
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS model_usage_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT,
      sd_id TEXT,
      phase TEXT CHECK (phase IN ('LEAD', 'PLAN', 'EXEC', 'UNKNOWN')),
      subagent_type TEXT,
      subagent_configured_model TEXT,
      reported_model_name TEXT NOT NULL,
      reported_model_id TEXT NOT NULL,
      config_matches_reported BOOLEAN GENERATED ALWAYS AS (
        CASE
          WHEN subagent_configured_model IS NULL THEN NULL
          WHEN subagent_configured_model = 'sonnet' AND reported_model_id LIKE '%sonnet%' THEN TRUE
          WHEN subagent_configured_model = 'opus' AND reported_model_id LIKE '%opus%' THEN TRUE
          WHEN subagent_configured_model = 'haiku' AND reported_model_id LIKE '%haiku%' THEN TRUE
          ELSE FALSE
        END
      ) STORED,
      captured_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `;

  try {
    await executeSql(createTableSql);
    console.log('✅ Table created');
  } catch (err) {
    if (err.message.includes('exec_sql')) {
      console.log('❌ exec_sql RPC not available');
      console.log('\nPlease apply the migration manually via Supabase Dashboard:');
      console.log('https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
      console.log('\nSQL file: database/migrations/20251204_model_usage_tracking.sql');
      return;
    }
    console.log('Error:', err.message);
  }
}

main().catch(console.error);
