#!/usr/bin/env node
/**
 * Apply Sub-Agent Validation Migration
 *
 * Applies the 20251218_subagent_validation_results.sql migration
 * using the Supabase service client.
 *
 * Part of LEO Protocol v4.4 - PATCH 005 Sub-Agent Output Validation
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
// fs import kept for potential future file operations
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('========================================');
  console.log('LEO v4.4 PATCH-005: Validation Results Migration');
  console.log('========================================');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Execute individual statements
  const statements = [
    // Create table
    `CREATE TABLE IF NOT EXISTS subagent_validation_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_id UUID REFERENCES sub_agent_execution_results(id) ON DELETE CASCADE,
      sd_id TEXT NOT NULL,
      sub_agent_code TEXT NOT NULL,
      validation_passed BOOLEAN NOT NULL,
      validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
      levels_checked TEXT[],
      file_references JSONB DEFAULT '{}'::jsonb,
      symbol_references JSONB DEFAULT '{}'::jsonb,
      table_references JSONB DEFAULT '{}'::jsonb,
      code_snippets JSONB DEFAULT '{}'::jsonb,
      issues JSONB DEFAULT '[]'::jsonb,
      warnings JSONB DEFAULT '[]'::jsonb,
      retry_count INTEGER DEFAULT 0,
      retry_reason TEXT,
      previous_validation_id UUID,
      validation_duration_ms INTEGER,
      tables_loaded_count INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Create indexes
    'CREATE INDEX IF NOT EXISTS idx_validation_sd_id ON subagent_validation_results(sd_id)',
    'CREATE INDEX IF NOT EXISTS idx_validation_passed ON subagent_validation_results(validation_passed)',
    'CREATE INDEX IF NOT EXISTS idx_validation_execution_id ON subagent_validation_results(execution_id)',
    'CREATE INDEX IF NOT EXISTS idx_validation_sub_agent_code ON subagent_validation_results(sub_agent_code)',
    'CREATE INDEX IF NOT EXISTS idx_validation_created_at ON subagent_validation_results(created_at DESC)',
  ];

  for (const sql of statements) {
    const preview = sql.slice(0, 60).replace(/\s+/g, ' ') + '...';
    console.log('Executing:', preview);

    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
      if (error.message.includes('already exists')) {
        console.log('  Already exists, skipping');
      } else {
        console.log('  Error:', error.message);
      }
    } else {
      console.log('  Success');
    }
  }

  // Create summary view
  console.log('\nCreating summary view...');
  const viewSql = `
    CREATE OR REPLACE VIEW v_validation_summary AS
    SELECT
      sub_agent_code,
      COUNT(*) as total_validations,
      SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) as passed_count,
      SUM(CASE WHEN NOT validation_passed THEN 1 ELSE 0 END) as failed_count,
      ROUND(AVG(validation_score)::numeric, 2) as avg_score,
      ROUND(100.0 * SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_rate,
      SUM(retry_count) as total_retries,
      MAX(created_at) as last_validation
    FROM subagent_validation_results
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY sub_agent_code
    ORDER BY pass_rate ASC, total_validations DESC
  `;

  const { error: viewError } = await supabase.rpc('exec_sql', { sql_text: viewSql });
  if (viewError) {
    console.log('View error:', viewError.message);
  } else {
    console.log('View created: v_validation_summary');
  }

  console.log('\n========================================');
  console.log('Migration complete');
  console.log('========================================');
}

applyMigration().catch(console.error);
