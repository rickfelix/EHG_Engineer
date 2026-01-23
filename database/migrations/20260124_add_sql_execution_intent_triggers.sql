-- Migration: Add SQL Execution Intent Triggers
-- SD: SD-LEO-INFRA-DATABASE-SUB-AGENT-001
-- Purpose: Add intent-based trigger patterns for SQL execution detection
-- This migration adds 30+ triggers that detect when users want SQL executed (not just discussed)

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- Get the DATABASE sub-agent ID
DO $$
DECLARE
    db_agent_id UUID;
BEGIN
    -- Get DATABASE sub-agent ID
    SELECT id INTO db_agent_id FROM leo_sub_agents WHERE code = 'DATABASE';

    IF db_agent_id IS NULL THEN
        RAISE EXCEPTION 'DATABASE sub-agent not found in leo_sub_agents';
    END IF;

    -- ========================================================================
    -- CATEGORY 1: Direct SQL Execution Commands (Priority 9 - highest)
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'run this sql', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'execute this sql', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'run the query', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'execute the query', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'run this migration', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'execute the migration', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'run that migration', 'pattern', 9, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "direct_command", "confidence_boost": 0.2, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- CATEGORY 2: Imperative Phrasing (Priority 8)
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'execute the following', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'run the following', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'please run', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'please execute', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'can you run', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'can you execute', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'apply this migration', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'apply the migration', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "imperative", "confidence_boost": 0.15, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- CATEGORY 3: Operational Phrasing (Priority 7)
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'insert this into', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'update the database', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'update the table', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'delete from the table', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'create the table', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'alter the table', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'drop the table', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'add this column', 'pattern', 7, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "operational", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- CATEGORY 4: Result-Oriented Requests (Priority 6)
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'make this change in the database', 'pattern', 6, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "result_oriented", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'update this in supabase', 'pattern', 6, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "result_oriented", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'fix this in the database', 'pattern', 6, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "result_oriented", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'modify the schema', 'pattern', 6, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "result_oriented", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'add this to the database', 'pattern', 6, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "result_oriented", "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- CATEGORY 5: Sub-Agent Delegation Phrases (Priority 8)
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'use the database sub-agent', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "delegation", "confidence_boost": 0.25, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'use database sub-agent', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "delegation", "confidence_boost": 0.25, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'database agent should run', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "delegation", "confidence_boost": 0.25, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'have the database agent', 'pattern', 8, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "delegation", "confidence_boost": 0.25, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- CATEGORY 6: Contextual SQL Execution (Priority 5)
    -- These require SQL to be present in context to trigger
    -- ========================================================================

    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, trigger_context, metadata)
    VALUES
        (db_agent_id, 'run it', 'pattern', 5, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "contextual", "requires_sql_context": true, "confidence_boost": 0.05, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'execute it', 'pattern', 5, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "contextual", "requires_sql_context": true, "confidence_boost": 0.05, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'go ahead and run', 'pattern', 5, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "contextual", "requires_sql_context": true, "confidence_boost": 0.05, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'yes, run it', 'pattern', 5, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "contextual", "requires_sql_context": true, "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb),
        (db_agent_id, 'yes, execute', 'pattern', 5, true, 'SQL_EXECUTION_INTENT',
         '{"intent": "SQL_EXECUTION", "category": "contextual", "requires_sql_context": true, "confidence_boost": 0.1, "created_by": "migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001"}'::jsonb)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully inserted SQL execution intent triggers for DATABASE sub-agent';
END $$;

-- ============================================================================
-- Create config table for runtime tuning (FR-4)
-- ============================================================================

CREATE TABLE IF NOT EXISTS db_agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configuration values
INSERT INTO db_agent_config (key, value, description)
VALUES
    ('MIN_CONFIDENCE_TO_INVOKE', '0.80'::jsonb, 'Minimum confidence score (0-1) required to auto-invoke database sub-agent'),
    ('MAX_TRIGGERS_EVALUATED', '200'::jsonb, 'Maximum number of triggers to evaluate per request'),
    ('DB_AGENT_ENABLED', 'true'::jsonb, 'Master switch to enable/disable database sub-agent auto-invocation'),
    ('DENYLIST_PHRASES', '["do not execute", "for reference only", "example query", "sample sql", "here is an example", "you could run", "would look like"]'::jsonb, 'Phrases that force NO_EXECUTION intent regardless of trigger matches')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Create audit table for invocation tracking (FR-3, FR-5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS db_agent_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    conversation_id TEXT,
    message_id TEXT,
    intent VARCHAR(50) NOT NULL,
    confidence DECIMAL(4,3) NOT NULL,
    matched_trigger_ids UUID[],
    decision VARCHAR(50) NOT NULL, -- 'invoke_db_agent', 'blocked_policy', 'blocked_confidence', 'no_execution'
    block_reason TEXT,
    environment VARCHAR(50),
    db_agent_enabled BOOLEAN,
    execution_result JSONB,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by correlation_id and time-based analytics
CREATE INDEX IF NOT EXISTS idx_db_agent_invocations_correlation ON db_agent_invocations(correlation_id);
CREATE INDEX IF NOT EXISTS idx_db_agent_invocations_created_at ON db_agent_invocations(created_at);
CREATE INDEX IF NOT EXISTS idx_db_agent_invocations_intent ON db_agent_invocations(intent);
CREATE INDEX IF NOT EXISTS idx_db_agent_invocations_decision ON db_agent_invocations(decision);

-- ============================================================================
-- DOWN MIGRATION (Rollback)
-- ============================================================================

-- To rollback, run:
-- DELETE FROM leo_sub_agent_triggers WHERE metadata->>'created_by' = 'migration:SD-LEO-INFRA-DATABASE-SUB-AGENT-001';
-- DROP TABLE IF EXISTS db_agent_invocations;
-- DROP TABLE IF EXISTS db_agent_config;

COMMENT ON TABLE db_agent_config IS 'Runtime configuration for database sub-agent auto-invocation (SD-LEO-INFRA-DATABASE-SUB-AGENT-001)';
COMMENT ON TABLE db_agent_invocations IS 'Audit trail for database sub-agent invocation decisions (SD-LEO-INFRA-DATABASE-SUB-AGENT-001)';
