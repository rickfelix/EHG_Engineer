-- Context Distillation System for LEO Protocol Sub-Agents
-- Implements focused communication and knowledge sharing between agents

-- 1. Sub-Agent Handoff Summaries Table
-- Stores distilled summaries passed between agents
CREATE TABLE IF NOT EXISTS leo_subagent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  sd_id TEXT REFERENCES strategic_directives_v2(id),
  prd_id TEXT REFERENCES product_requirements_v2(id),
  phase TEXT,

  -- Distilled summary content
  summary JSONB NOT NULL, -- Top findings only
  critical_flags TEXT[], -- Critical issues requiring attention
  warnings TEXT[], -- Non-critical warnings
  recommendations TEXT[], -- Specific recommendations for next agent
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Metadata
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP -- Some summaries become stale
);

-- Create indexes for handoffs table
CREATE INDEX IF NOT EXISTS idx_handoffs_sd_id ON leo_subagent_handoffs(sd_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_prd_id ON leo_subagent_handoffs(prd_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_from_agent ON leo_subagent_handoffs(from_agent);
CREATE INDEX IF NOT EXISTS idx_handoffs_to_agent ON leo_subagent_handoffs(to_agent);
CREATE INDEX IF NOT EXISTS idx_handoffs_created_at ON leo_subagent_handoffs(created_at);

-- 2. Agent Knowledge Base Table
-- Shared repository of reusable findings and patterns
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code TEXT NOT NULL,
  knowledge_type TEXT CHECK (knowledge_type IN ('finding', 'rule', 'pattern', 'insight')),

  -- Content
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  tags TEXT[], -- For categorization and search

  -- Relevance and quality
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER DEFAULT 0, -- Track how often it's referenced
  last_used TIMESTAMP,

  -- Relationships
  related_sd_ids TEXT[], -- Strategic directives this applies to
  related_prd_ids TEXT[], -- PRDs this applies to
  related_knowledge_ids UUID[], -- Links to other knowledge entries

  -- Lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- Some knowledge becomes outdated
  is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for knowledge base table
CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON agent_knowledge_base(agent_code);
CREATE INDEX IF NOT EXISTS idx_knowledge_type ON agent_knowledge_base(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON agent_knowledge_base USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON agent_knowledge_base(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_usage ON agent_knowledge_base(usage_count DESC);

-- 3. Agent Events Table
-- Event-driven coordination system
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL, -- e.g., 'evt_123'
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Event source
  agent_code TEXT NOT NULL,
  phase TEXT,
  sd_id TEXT,
  prd_id TEXT,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ANALYSIS_START',
    'ANALYSIS_COMPLETE',
    'FINDING_DETECTED',
    'VALIDATION_PASSED',
    'VALIDATION_FAILED',
    'HANDOFF_CREATED',
    'CONSENSUS_REQUIRED',
    'HUMAN_REVIEW_REQUIRED',
    'ERROR',
    'WARNING'
  )),

  action TEXT NOT NULL,
  payload JSONB NOT NULL, -- Event-specific data

  -- Coordination
  target_agents TEXT[], -- Agents that should respond to this event
  priority TEXT CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  requires_acknowledgment BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT[], -- Agents that have acknowledged

  -- Results
  responses JSONB, -- Responses from other agents
  outcome TEXT
);

-- Create indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_code);
CREATE INDEX IF NOT EXISTS idx_events_type ON agent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_sd_id ON agent_events(sd_id);
CREATE INDEX IF NOT EXISTS idx_events_prd_id ON agent_events(prd_id);
CREATE INDEX IF NOT EXISTS idx_events_priority ON agent_events(priority);

-- 4. Agent Coordination State Table
-- Tracks current state of multi-agent coordination
CREATE TABLE IF NOT EXISTS agent_coordination_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordination_id TEXT UNIQUE NOT NULL, -- Unique ID for this coordination session
  sd_id TEXT,
  prd_id TEXT,
  phase TEXT,

  -- State
  current_state TEXT NOT NULL CHECK (current_state IN (
    'INITIALIZING',
    'IN_PROGRESS',
    'WAITING_CONSENSUS',
    'WAITING_HUMAN',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  )),

  -- Participating agents
  active_agents TEXT[],
  completed_agents TEXT[],
  pending_agents TEXT[],
  failed_agents TEXT[],

  -- Consensus tracking
  consensus_required BOOLEAN DEFAULT FALSE,
  consensus_threshold FLOAT DEFAULT 0.8,
  votes JSONB, -- {agent: vote} mapping
  consensus_reached BOOLEAN,

  -- Checkpoint data
  checkpoint_data JSONB, -- For recovery
  last_checkpoint TIMESTAMP,

  -- Metadata
  started_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Create indexes for coordination state table
CREATE INDEX IF NOT EXISTS idx_coordination_state ON agent_coordination_state(current_state);
CREATE INDEX IF NOT EXISTS idx_coordination_sd_id ON agent_coordination_state(sd_id);
CREATE INDEX IF NOT EXISTS idx_coordination_prd_id ON agent_coordination_state(prd_id);

-- 5. Agent Execution Cache Table
-- Caches expensive analysis results
CREATE TABLE IF NOT EXISTS agent_execution_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL, -- Deterministic key for the operation
  agent_code TEXT NOT NULL,
  operation_type TEXT NOT NULL,

  -- Cached data
  result JSONB NOT NULL,
  metadata JSONB, -- Additional context about the cached result

  -- Cache management
  ttl_seconds INTEGER NOT NULL, -- Time to live
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- Will be computed via trigger
  hit_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT NOW(),

  -- Invalidation
  invalidated BOOLEAN DEFAULT FALSE,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT
);

-- Create indexes for cache table
CREATE INDEX IF NOT EXISTS idx_cache_key ON agent_execution_cache(cache_key) WHERE NOT invalidated;
CREATE INDEX IF NOT EXISTS idx_cache_agent ON agent_execution_cache(agent_code);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON agent_execution_cache(expires_at) WHERE NOT invalidated;
CREATE INDEX IF NOT EXISTS idx_cache_operation ON agent_execution_cache(operation_type);

-- Trigger function to compute expires_at
CREATE OR REPLACE FUNCTION compute_cache_expiry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at := NEW.created_at + (NEW.ttl_seconds || ' seconds')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cache expiry computation
CREATE TRIGGER compute_cache_expiry_trigger
BEFORE INSERT OR UPDATE ON agent_execution_cache
FOR EACH ROW
EXECUTE FUNCTION compute_cache_expiry();

-- Helper function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM agent_execution_cache
  WHERE expires_at < NOW() OR invalidated = TRUE;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get relevant knowledge for an agent
CREATE OR REPLACE FUNCTION get_agent_knowledge(
  p_agent_code TEXT,
  p_sd_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content JSONB,
  confidence FLOAT,
  knowledge_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.title,
    k.content,
    k.confidence,
    k.knowledge_type
  FROM agent_knowledge_base k
  WHERE k.agent_code = p_agent_code
    AND k.is_active = TRUE
    AND (k.expires_at IS NULL OR k.expires_at > NOW())
    AND (p_sd_id IS NULL OR p_sd_id = ANY(k.related_sd_ids))
  ORDER BY
    k.confidence DESC,
    k.usage_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Helper function to broadcast an event to agents
CREATE OR REPLACE FUNCTION broadcast_agent_event(
  p_agent_code TEXT,
  p_event_type TEXT,
  p_action TEXT,
  p_payload JSONB,
  p_target_agents TEXT[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO agent_events (
    event_id,
    agent_code,
    event_type,
    action,
    payload,
    target_agents
  ) VALUES (
    'evt_' || gen_random_uuid()::TEXT,
    p_agent_code,
    p_event_type,
    p_action,
    p_payload,
    COALESCE(p_target_agents, ARRAY[]::TEXT[])
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Sample data for knowledge base
INSERT INTO agent_knowledge_base (agent_code, knowledge_type, title, content, confidence, tags)
VALUES
  ('VALIDATION', 'pattern', 'Dashboard Component Pattern',
   '{"pattern": "src/client/src/components/Dashboard", "description": "Standard dashboard component location"}',
   0.95, ARRAY['ui', 'dashboard', 'components']),

  ('SECURITY', 'rule', 'API Authentication Required',
   '{"rule": "All API endpoints must have authentication", "exceptions": ["health", "status"]}',
   1.0, ARRAY['api', 'authentication', 'security']),

  ('DATABASE', 'pattern', 'Migration File Pattern',
   '{"pattern": "database/migrations/*.sql", "description": "Database migration file location"}',
   0.9, ARRAY['database', 'migration', 'schema'])
ON CONFLICT DO NOTHING;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON leo_subagent_handoffs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_knowledge_base TO authenticated;
GRANT SELECT, INSERT ON agent_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_coordination_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_execution_cache TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE leo_subagent_handoffs IS 'Stores distilled summaries passed between sub-agents';
COMMENT ON TABLE agent_knowledge_base IS 'Shared repository of reusable findings and patterns';
COMMENT ON TABLE agent_events IS 'Event-driven coordination system for sub-agents';
COMMENT ON TABLE agent_coordination_state IS 'Tracks current state of multi-agent coordination';
COMMENT ON TABLE agent_execution_cache IS 'Caches expensive analysis results for performance';