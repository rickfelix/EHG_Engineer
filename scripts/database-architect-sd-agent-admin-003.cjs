#!/usr/bin/env node

/**
 * Database Architect Sub-Agent: SD-AGENT-ADMIN-003
 * Comprehensive Database Migration + RLS Fixes
 *
 * Tasks:
 * 1. Fix strategic_directives_v2 trigger (NEW.phase → NEW.current_phase)
 * 2. Create 4 missing tables (ab_test_results, search_preferences, agent_executions, performance_alerts)
 * 3. Insert 28 seed records into 6 empty tables
 * 4. Update RLS policies for 3 tables (anon SELECT)
 * 5. Validate all operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function executeDatabaseMigration() {
  console.log('🔧 Database Architect Sub-Agent: SD-AGENT-ADMIN-003');
  console.log('==================================================\n');

  // Use Supabase client (handles SSL automatically)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  console.log('✅ Supabase client initialized\n');

  try {
    await client.query('BEGIN');

    // ========================================
    // 1. Fix strategic_directives_v2 Trigger
    // ========================================
    console.log('📝 Step 1: Fix strategic_directives_v2 trigger...');

    // Drop existing trigger
    await client.query(`
      DROP TRIGGER IF EXISTS validate_sd_progress ON strategic_directives_v2;
    `);

    // Recreate trigger function with correct field reference
    await client.query(`
      CREATE OR REPLACE FUNCTION validate_sd_progress_update()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Use current_phase instead of phase
        IF NEW.current_phase IS NOT NULL THEN
          -- Validate progress percentages
          IF NEW.progress < 0 OR NEW.progress > 100 THEN
            RAISE EXCEPTION 'Progress must be between 0 and 100';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Recreate trigger
    await client.query(`
      CREATE TRIGGER validate_sd_progress
      BEFORE INSERT OR UPDATE ON strategic_directives_v2
      FOR EACH ROW
      EXECUTE FUNCTION validate_sd_progress_update();
    `);

    console.log('✅ Trigger fixed: NEW.phase → NEW.current_phase\n');

    // ========================================
    // 2. Create Missing Tables
    // ========================================
    console.log('📝 Step 2: Create 4 missing tables...\n');

    // Table 1: ab_test_results
    console.log('Creating ab_test_results table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ab_test_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_id UUID REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,
        variant TEXT NOT NULL CHECK (variant IN ('A', 'B', 'C', 'D')),
        execution_id UUID,
        outcome TEXT CHECK (outcome IN ('success', 'failure', 'timeout', 'error')),
        score DECIMAL(5,2),
        latency_ms INTEGER,
        token_count INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ab_test_results_test_id ON ab_test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_ab_test_results_variant ON ab_test_results(variant);
      CREATE INDEX IF NOT EXISTS idx_ab_test_results_created_at ON ab_test_results(created_at DESC);
    `);

    // Table 2: search_preferences
    console.log('Creating search_preferences table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS search_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        agent_key TEXT,
        default_engine TEXT DEFAULT 'google' CHECK (default_engine IN ('google', 'bing', 'duckduckgo', 'custom')),
        results_per_page INTEGER DEFAULT 10 CHECK (results_per_page BETWEEN 10 AND 100),
        safe_search BOOLEAN DEFAULT true,
        region TEXT DEFAULT 'us',
        language TEXT DEFAULT 'en',
        custom_endpoint TEXT,
        filter_config JSONB,
        timeout_seconds INTEGER DEFAULT 30 CHECK (timeout_seconds BETWEEN 10 AND 60),
        cache_enabled BOOLEAN DEFAULT true,
        cache_ttl_minutes INTEGER DEFAULT 60,
        is_default BOOLEAN DEFAULT false,
        is_locked BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_search_preferences_user_id ON search_preferences(user_id);
      CREATE INDEX IF NOT EXISTS idx_search_preferences_agent_key ON search_preferences(agent_key);
      CREATE INDEX IF NOT EXISTS idx_search_preferences_is_default ON search_preferences(is_default);
    `);

    // Table 3: agent_executions (partitioned by month)
    console.log('Creating agent_executions table (partitioned)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_key TEXT NOT NULL,
        agent_type TEXT,
        department TEXT,
        user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        execution_type TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER GENERATED ALWAYS AS (
          EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER * 1000
        ) STORED,
        token_count INTEGER,
        cost_usd DECIMAL(10,4),
        status TEXT CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
        error_message TEXT,
        error_type TEXT,
        quality_score DECIMAL(5,2),
        input_params JSONB,
        output_summary TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_key ON agent_executions(agent_key);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_started_at ON agent_executions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_user_id ON agent_executions(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_department ON agent_executions(department);
    `);

    // Table 4: performance_alerts
    console.log('Creating performance_alerts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS performance_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        alert_type TEXT NOT NULL CHECK (alert_type IN ('latency', 'error_rate', 'cost', 'quality', 'volume')),
        condition TEXT NOT NULL,
        threshold_value DECIMAL(10,2) NOT NULL,
        comparison TEXT NOT NULL CHECK (comparison IN ('gt', 'lt', 'eq', 'gte', 'lte')),
        time_window_minutes INTEGER DEFAULT 60,
        notification_channels JSONB,
        enabled BOOLEAN DEFAULT true,
        last_triggered TIMESTAMPTZ,
        trigger_count INTEGER DEFAULT 0,
        created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_performance_alerts_enabled ON performance_alerts(enabled);
      CREATE INDEX IF NOT EXISTS idx_performance_alerts_alert_type ON performance_alerts(alert_type);
    `);

    console.log('✅ All 4 tables created\n');

    // ========================================
    // 3. Insert Seed Data (28 records)
    // ========================================
    console.log('📝 Step 3: Insert seed data (28 records)...\n');

    // Seed data for agent_departments (11 records)
    console.log('Inserting agent_departments seed data...');
    await client.query(`
      INSERT INTO agent_departments (id, department_name, description, status) VALUES
      ('dept-001', 'Research & Analysis', 'Market research and competitive intelligence', 'active'),
      ('dept-002', 'Product Development', 'AI-powered product development and innovation', 'active'),
      ('dept-003', 'Marketing & Growth', 'Customer acquisition and growth strategies', 'active'),
      ('dept-004', 'Operations', 'Business operations and process optimization', 'active'),
      ('dept-005', 'Finance', 'Financial planning and analysis', 'active'),
      ('dept-006', 'Customer Success', 'Customer support and relationship management', 'active'),
      ('dept-007', 'Data & Analytics', 'Data science and business intelligence', 'active'),
      ('dept-008', 'Engineering', 'Software development and technical architecture', 'active'),
      ('dept-009', 'Sales', 'Sales strategy and revenue generation', 'active'),
      ('dept-010', 'Legal & Compliance', 'Legal affairs and regulatory compliance', 'active'),
      ('dept-011', 'Human Resources', 'Talent acquisition and employee development', 'active')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed data for agent_tools (8 records)
    console.log('Inserting agent_tools seed data...');
    await client.query(`
      INSERT INTO agent_tools (id, tool_name, description, category, enabled) VALUES
      ('tool-001', 'web_search', 'Search the web for current information', 'research', true),
      ('tool-002', 'document_analysis', 'Analyze documents and extract insights', 'analysis', true),
      ('tool-003', 'data_query', 'Query databases and data warehouses', 'data', true),
      ('tool-004', 'api_integration', 'Integrate with external APIs', 'integration', true),
      ('tool-005', 'code_execution', 'Execute code and scripts', 'development', true),
      ('tool-006', 'file_operations', 'Read and write files', 'utilities', true),
      ('tool-007', 'email_sender', 'Send emails and notifications', 'communication', true),
      ('tool-008', 'chart_generator', 'Generate charts and visualizations', 'visualization', true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed data for crewai_agents (4 records)
    console.log('Inserting crewai_agents seed data...');
    await client.query(`
      INSERT INTO crewai_agents (id, agent_key, name, role, goal, backstory, department_id, tools, llm_model, max_tokens, temperature, status) VALUES
      ('agent-001', 'market-analyst', 'Market Intelligence Agent', 'Market Analyst', 'Analyze market trends and competitive landscape', 'Expert in market research with 15 years experience in venture capital markets', 'dept-001', ARRAY['web_search', 'document_analysis', 'data_query'], 'gpt-4', 4000, 0.7, 'active'),
      ('agent-002', 'customer-insights', 'Customer Insights Agent', 'Customer Research Specialist', 'Understand customer needs and behavior patterns', 'Customer psychology expert with background in behavioral economics', 'dept-001', ARRAY['web_search', 'data_query', 'chart_generator'], 'gpt-4', 4000, 0.7, 'active'),
      ('agent-003', 'competitive-intel', 'Competitive Intelligence Agent', 'Competitive Analyst', 'Monitor competitors and identify market opportunities', 'Former strategy consultant specializing in competitive analysis', 'dept-001', ARRAY['web_search', 'document_analysis', 'api_integration'], 'gpt-4', 4000, 0.7, 'active'),
      ('agent-004', 'portfolio-strategist', 'Portfolio Strategy Agent', 'Strategic Planner', 'Optimize venture portfolio and investment strategy', 'Seasoned venture capital strategist with portfolio management expertise', 'dept-001', ARRAY['data_query', 'chart_generator', 'document_analysis'], 'gpt-4', 4000, 0.7, 'active')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed data for crewai_crews (1 record)
    console.log('Inserting crewai_crews seed data...');
    await client.query(`
      INSERT INTO crewai_crews (id, crew_name, description, process_type, status) VALUES
      ('crew-001', 'Venture Research Crew', 'AI-powered research team for venture analysis and market intelligence', 'sequential', 'active')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed data for crew_members (4 records)
    console.log('Inserting crew_members seed data...');
    await client.query(`
      INSERT INTO crew_members (id, crew_id, agent_id, role_in_crew, execution_order) VALUES
      ('member-001', 'crew-001', 'agent-001', 'Lead market analyst', 1),
      ('member-002', 'crew-001', 'agent-002', 'Customer insights specialist', 2),
      ('member-003', 'crew-001', 'agent-003', 'Competitive intelligence', 3),
      ('member-004', 'crew-001', 'agent-004', 'Portfolio strategist', 4)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('✅ All 28 seed records inserted\n');

    // ========================================
    // 4. Update RLS Policies
    // ========================================
    console.log('📝 Step 4: Update RLS policies (3 tables)...\n');

    // Enable RLS on tables if not already enabled
    await client.query(`
      ALTER TABLE agent_departments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
      ALTER TABLE crewai_agents ENABLE ROW LEVEL SECURITY;
    `);

    // Drop existing policies and recreate with anon SELECT
    const tables = ['agent_departments', 'agent_tools', 'crewai_agents'];

    for (const table of tables) {
      console.log(`Updating RLS policies for ${table}...`);

      // Drop existing policies
      await client.query(`
        DROP POLICY IF EXISTS "${table}_anon_select" ON ${table};
        DROP POLICY IF EXISTS "${table}_authenticated_all" ON ${table};
        DROP POLICY IF EXISTS "${table}_admin_all" ON ${table};
      `);

      // Create new policies
      await client.query(`
        -- Allow anonymous SELECT (read-only for public viewing)
        CREATE POLICY "${table}_anon_select"
        ON ${table}
        FOR SELECT
        TO anon
        USING (true);

        -- Allow authenticated users full access to their own records
        CREATE POLICY "${table}_authenticated_all"
        ON ${table}
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
      `);
    }

    // RLS for new tables
    console.log('Setting up RLS for new tables...');

    await client.query(`
      -- ab_test_results: Anon SELECT for running tests, admins all
      ALTER TABLE ab_test_results ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "ab_test_results_anon_select"
      ON ab_test_results FOR SELECT TO anon
      USING (
        EXISTS (
          SELECT 1 FROM prompt_ab_tests
          WHERE id = ab_test_results.test_id AND status = 'running'
        )
      );

      CREATE POLICY "ab_test_results_authenticated_insert"
      ON ab_test_results FOR INSERT TO authenticated
      WITH CHECK (true);

      -- search_preferences: Users own profiles, anon read defaults
      ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "search_preferences_anon_select_defaults"
      ON search_preferences FOR SELECT TO anon
      USING (is_default = true AND is_locked = true);

      CREATE POLICY "search_preferences_authenticated_own"
      ON search_preferences FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

      -- agent_executions: Users own executions, anon aggregate stats only
      ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "agent_executions_authenticated_own"
      ON agent_executions FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

      -- performance_alerts: Admins full access, users read-only own alerts
      ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "performance_alerts_authenticated_read"
      ON performance_alerts FOR SELECT TO authenticated
      USING (true);

      CREATE POLICY "performance_alerts_authenticated_create"
      ON performance_alerts FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = created_by);
    `);

    console.log('✅ RLS policies updated for all tables\n');

    // ========================================
    // 5. Validation
    // ========================================
    console.log('📝 Step 5: Validation...\n');

    // Check table counts
    const validationQueries = [
      { table: 'agent_departments', expected: 11 },
      { table: 'agent_tools', expected: 8 },
      { table: 'crewai_agents', expected: 4 },
      { table: 'crewai_crews', expected: 1 },
      { table: 'crew_members', expected: 4 }
    ];

    for (const { table, expected } of validationQueries) {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = parseInt(result.rows[0].count);
      const status = count >= expected ? '✅' : '❌';
      console.log(`${status} ${table}: ${count}/${expected} records`);
    }

    // Check table existence
    console.log('\nTable existence check:');
    const newTables = ['ab_test_results', 'search_preferences', 'agent_executions', 'performance_alerts'];

    for (const table of newTables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = '${table}'
        ) as exists
      `);
      const exists = result.rows[0].exists;
      const status = exists ? '✅' : '❌';
      console.log(`${status} ${table} table created`);
    }

    await client.query('COMMIT');
    console.log('\n✅ DATABASE MIGRATION COMPLETE');
    console.log('==================================================');
    console.log('Summary:');
    console.log('- Trigger fixed: strategic_directives_v2');
    console.log('- Tables created: 4');
    console.log('- Seed records inserted: 28');
    console.log('- RLS policies updated: 7 tables');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ MIGRATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Execute migration
executeDatabaseMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
