#!/usr/bin/env node

/**
 * Create the retrospective_learning_links table
 * This links retrospectives to cross-agent intelligence
 */

const { Pool } = require('pg');
require('dotenv').config();

async function createTable() {
  console.log('🔄 Creating retrospective_learning_links table...\n');

  const pool = new Pool({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: {
      rejectUnauthorized: false,
      require: true
    }
  });

  try {
    const client = await pool.connect();

    // First check if agent_learning_outcomes exists
    const checkResult = await client.query(`
      SELECT COUNT(*)
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'agent_learning_outcomes'
    `);

    if (checkResult.rows[0].count === '0') {
      console.log('⚠️ agent_learning_outcomes table does not exist');
      console.log('Creating a simplified version without foreign key constraint...\n');

      // Create without foreign key to agent_learning_outcomes
      await client.query(`
        CREATE TABLE IF NOT EXISTS retrospective_learning_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          retrospective_id UUID NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
          learning_outcome_id UUID, -- No foreign key constraint for now

          -- Correlation strength
          correlation_type TEXT CHECK (correlation_type IN ('DIRECT', 'INDIRECT', 'POTENTIAL')),
          correlation_strength DECIMAL CHECK (correlation_strength >= 0 AND correlation_strength <= 1),

          -- What was learned
          learning_summary TEXT,
          impacts_agent TEXT CHECK (impacts_agent IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),

          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      console.log('✅ Created retrospective_learning_links table (without foreign key)');

    } else {
      console.log('✅ agent_learning_outcomes table exists');

      // Create with foreign key
      await client.query(`
        CREATE TABLE IF NOT EXISTS retrospective_learning_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          retrospective_id UUID NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
          learning_outcome_id UUID REFERENCES agent_learning_outcomes(id) ON DELETE CASCADE,

          -- Correlation strength
          correlation_type TEXT CHECK (correlation_type IN ('DIRECT', 'INDIRECT', 'POTENTIAL')),
          correlation_strength DECIMAL CHECK (correlation_strength >= 0 AND correlation_strength <= 1),

          -- What was learned
          learning_summary TEXT,
          impacts_agent TEXT CHECK (impacts_agent IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),

          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      console.log('✅ Created retrospective_learning_links table (with foreign key)');
    }

    // Verify creation
    const verifyResult = await client.query(`
      SELECT COUNT(*)
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'retrospective_learning_links'
    `);

    if (verifyResult.rows[0].count === '1') {
      console.log('\n✨ Table successfully created and verified!');
    }

    client.release();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute
createTable();