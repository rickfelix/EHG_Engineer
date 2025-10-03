#!/usr/bin/env node

/**
 * Create Parallel Execution Tables
 * Directly creates tables without complex migrations
 */

import dotenv from "dotenv";
dotenv.config();
import pg from 'pg';

const { Client } = pg;

async function createTables() {
  console.log('🔨 Creating Parallel Execution Tables\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in .env');
    process.exit(1);
  }

  const url = new URL(poolerUrl);
  const config = {
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
  };

  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Table 1: sub_agent_executions
    console.log('Creating sub_agent_executions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sub_agent_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sub_agent_id UUID REFERENCES leo_sub_agents(id) ON DELETE CASCADE,
        prd_id TEXT,
        strategic_directive_id TEXT,
        execution_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        results JSONB DEFAULT '{}',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ sub_agent_executions created\n');

    // Table 2: sub_agent_execution_batches
    console.log('Creating sub_agent_execution_batches table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sub_agent_execution_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        strategic_directive_id TEXT NOT NULL,
        prd_id TEXT,
        batch_mode TEXT NOT NULL,
        total_agents INTEGER NOT NULL,
        completed_agents INTEGER DEFAULT 0,
        failed_agents INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        aggregated_results JSONB DEFAULT '{}',
        confidence_score INTEGER,
        final_verdict TEXT,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER,
        performance_metrics JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ sub_agent_execution_batches created\n');

    // Create indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sub_agent_id
      ON sub_agent_executions(sub_agent_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sd_id
      ON sub_agent_executions(strategic_directive_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_batches_sd_id
      ON sub_agent_execution_batches(strategic_directive_id)
    `);
    console.log('✅ Indexes created\n');

    // Enable RLS
    console.log('Enabling RLS...');
    await client.query(`ALTER TABLE sub_agent_executions ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE sub_agent_execution_batches ENABLE ROW LEVEL SECURITY`);
    console.log('✅ RLS enabled\n');

    // Create policies
    console.log('Creating RLS policies...');
    await client.query(`
      CREATE POLICY IF NOT EXISTS "Allow all operations on sub_agent_executions"
      ON sub_agent_executions FOR ALL USING (true) WITH CHECK (true)
    `);
    await client.query(`
      CREATE POLICY IF NOT EXISTS "Allow all operations on sub_agent_execution_batches"
      ON sub_agent_execution_batches FOR ALL USING (true) WITH CHECK (true)
    `);
    console.log('✅ RLS policies created\n');

    console.log('✅ All tables created successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTables();