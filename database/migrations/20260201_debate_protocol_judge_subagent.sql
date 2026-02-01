-- SD-LEO-SELF-IMPROVE-001J: Debate Protocol - JUDGE Sub-Agent
-- Phase 5: Conflict Resolution / Debate Protocol
-- Creates JUDGE sub-agent and debate tracking tables for resolving conflicting agent recommendations

-- ============================================================================
-- Part 1: Register JUDGE sub-agent
-- ============================================================================

INSERT INTO leo_sub_agents (
  id,
  code,
  name,
  description,
  activation_type,
  priority,
  script_path,
  context_file,
  active,
  metadata,
  capabilities
) VALUES (
  gen_random_uuid(),
  'JUDGE',
  'Constitutional Judge',
  'Resolves conflicts between LEO agent recommendations using constitutional framework. Evaluates arguments, applies AEGIS rules (CONST-001 to CONST-011), and renders verdicts. Escalates low-confidence decisions to human review.',
  'automatic',
  8,  -- Higher priority than most agents (conflict resolution is critical)
  'lib/sub-agents/judge/index.js',
  '["CLAUDE_LEAD.md", "docs/reference/aegis-constitution.md", "docs/reference/debate-protocol.md"]',
  true,
  jsonb_build_object(
    'created_by', 'SD-LEO-SELF-IMPROVE-001J',
    'version', '1.0.0',
    'skill_key', 'conflict_resolution',
    'aegis_integration', true,
    'constitutional_framework', true,
    'human_escalation_threshold', 0.6,
    'circuit_breaker_enabled', true
  ),
  jsonb_build_array(
    'conflict_detection',
    'argument_evaluation',
    'constitutional_analysis',
    'verdict_generation',
    'human_escalation',
    'debate_moderation'
  )
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  script_path = EXCLUDED.script_path,
  context_file = EXCLUDED.context_file,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  capabilities = EXCLUDED.capabilities;

-- ============================================================================
-- Part 2: Add JUDGE trigger keywords
-- ============================================================================

DO $$
DECLARE
  judge_id uuid;
BEGIN
  SELECT id INTO judge_id FROM leo_sub_agents WHERE code = 'JUDGE';

  -- Primary triggers (high priority)
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (judge_id, 'conflict', 'keyword', 9, true, '{"category": "primary"}'),
    (judge_id, 'disagree', 'keyword', 9, true, '{"category": "primary"}'),
    (judge_id, 'judge', 'keyword', 8, true, '{"category": "primary"}'),
    (judge_id, 'verdict', 'keyword', 8, true, '{"category": "primary"}'),
    (judge_id, 'arbitrate', 'keyword', 8, true, '{"category": "primary"}')
  ON CONFLICT DO NOTHING;

  -- Secondary triggers (medium priority)
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (judge_id, 'conflicting recommendations', 'pattern', 7, true, '{"category": "secondary"}'),
    (judge_id, 'agents disagree', 'pattern', 7, true, '{"category": "secondary"}'),
    (judge_id, 'resolve conflict', 'pattern', 7, true, '{"category": "secondary"}'),
    (judge_id, 'constitutional review', 'pattern', 6, true, '{"category": "secondary"}'),
    (judge_id, 'debate protocol', 'pattern', 6, true, '{"category": "secondary"}')
  ON CONFLICT DO NOTHING;

  -- Context triggers (lower priority)
  INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, priority, active, metadata)
  VALUES
    (judge_id, 'multiple paths', 'pattern', 5, true, '{"category": "context"}'),
    (judge_id, 'competing solutions', 'pattern', 5, true, '{"category": "context"}'),
    (judge_id, 'which approach', 'pattern', 4, true, '{"category": "context"}')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Part 3: Create debate_sessions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Linkage to SD and context
  sd_id varchar(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  current_phase text NOT NULL CHECK (current_phase IN (
    'LEAD_APPROVAL', 'PLAN_PRD', 'EXEC', 'PLAN_VERIFICATION', 'LEAD_FINAL', 'COMPLETED'
  )),

  -- Conflict metadata
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'approach',           -- Different implementation approaches
    'architecture',       -- Architectural design conflicts
    'priority',          -- Priority/sequencing conflicts
    'scope',             -- Scope definition conflicts
    'technical_choice',  -- Technology/framework choice
    'security',          -- Security approach conflicts
    'performance',       -- Performance vs. other concerns
    'other'              -- Other conflict types
  )),
  conflict_statement text NOT NULL,  -- Human-readable conflict description

  -- Participating agents
  source_agents jsonb NOT NULL DEFAULT '[]',  -- Array of agent codes that disagreed

  -- Debate state
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',            -- Debate in progress
    'verdict_rendered',  -- JUDGE has made decision
    'escalated',         -- Escalated to human
    'resolved',          -- Conflict resolved (verdict accepted)
    'abandoned'          -- Debate abandoned/superseded
  )),

  -- Circuit breaker tracking
  round_number integer NOT NULL DEFAULT 1,
  max_rounds integer NOT NULL DEFAULT 3,

  -- Metadata
  metadata jsonb DEFAULT '{}',

  -- Audit trail
  initiated_by text NOT NULL,  -- Agent or human who triggered debate
  resolved_at timestamptz,
  resolved_by text  -- 'JUDGE', 'human', or agent code
);

-- Indexes for debate_sessions
CREATE INDEX IF NOT EXISTS idx_debate_sessions_sd_id
  ON debate_sessions(sd_id);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_status
  ON debate_sessions(status);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_conflict_type
  ON debate_sessions(conflict_type);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_created_at
  ON debate_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_active
  ON debate_sessions(status) WHERE status IN ('active', 'verdict_rendered');

-- ============================================================================
-- Part 4: Create debate_arguments table
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Linkage to debate
  debate_session_id uuid NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number >= 1),

  -- Argument source
  agent_code text NOT NULL,  -- Code of agent making argument (or 'human')
  argument_type text NOT NULL CHECK (argument_type IN (
    'initial_position',      -- Initial recommendation from agent
    'rebuttal',             -- Response to another argument
    'clarification',        -- Clarification of previous argument
    'constitution_citation', -- Constitutional rule citation
    'evidence'              -- Supporting evidence
  )),

  -- Argument content
  summary text NOT NULL,  -- Brief summary of argument
  detailed_reasoning text NOT NULL,  -- Full reasoning

  -- Constitutional references
  constitution_citations jsonb DEFAULT '[]',  -- Array of {rule_code, relevance}

  -- Evidence and supporting data
  evidence_refs jsonb DEFAULT '[]',  -- Array of {type, ref, description}

  -- Strength/confidence
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Metadata
  metadata jsonb DEFAULT '{}',

  -- Response linkage (for rebuttals)
  in_response_to_argument_id uuid REFERENCES debate_arguments(id) ON DELETE SET NULL
);

-- Indexes for debate_arguments
CREATE INDEX IF NOT EXISTS idx_debate_arguments_session
  ON debate_arguments(debate_session_id);
CREATE INDEX IF NOT EXISTS idx_debate_arguments_round
  ON debate_arguments(debate_session_id, round_number);
CREATE INDEX IF NOT EXISTS idx_debate_arguments_agent
  ON debate_arguments(agent_code);
CREATE INDEX IF NOT EXISTS idx_debate_arguments_created_at
  ON debate_arguments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_arguments_response
  ON debate_arguments(in_response_to_argument_id) WHERE in_response_to_argument_id IS NOT NULL;

-- ============================================================================
-- Part 5: Create judge_verdicts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS judge_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Linkage to debate
  debate_session_id uuid NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,

  -- Verdict outcome
  verdict_type text NOT NULL CHECK (verdict_type IN (
    'recommendation_selected',  -- One agent's recommendation chosen
    'synthesis',               -- Combined elements from multiple arguments
    'escalate',                -- Escalate to human decision
    'defer',                   -- Defer decision until more info
    'reject_all'               -- Reject all arguments, request new approach
  )),

  -- Selected recommendation (if applicable)
  selected_agent_code text,  -- Agent whose recommendation was chosen
  selected_argument_ids uuid[],  -- Array of argument IDs that formed verdict

  -- Verdict reasoning
  summary text NOT NULL,  -- Brief verdict summary
  detailed_rationale text NOT NULL,  -- Full reasoning

  -- Constitutional analysis
  constitution_citations jsonb NOT NULL DEFAULT '[]',  -- Array of {rule_code, rule_name, citation_reason}
  constitutional_score numeric(3,2) CHECK (constitutional_score >= 0 AND constitutional_score <= 1),

  -- Confidence and escalation
  confidence_score numeric(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  escalation_required boolean NOT NULL DEFAULT false,
  escalation_reason text,

  -- Human override
  human_decision text CHECK (human_decision IN (
    'confirmed',     -- Human agrees with JUDGE verdict
    'overridden',    -- Human chose different path
    'modified'       -- Human modified verdict
  )),
  human_decision_by text,
  human_decision_at timestamptz,
  human_decision_notes text,

  -- Metadata
  processing_time_ms integer,
  metadata jsonb DEFAULT '{}',

  -- Audit trail
  rendered_by text NOT NULL DEFAULT 'JUDGE'
);

-- Indexes for judge_verdicts
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_session
  ON judge_verdicts(debate_session_id);
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_verdict_type
  ON judge_verdicts(verdict_type);
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_escalation
  ON judge_verdicts(escalation_required) WHERE escalation_required = true;
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_confidence
  ON judge_verdicts(confidence_score);
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_created_at
  ON judge_verdicts(created_at DESC);

-- ============================================================================
-- Part 6: Create debate_circuit_breaker table
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_circuit_breaker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Circuit breaker scope
  sd_id varchar(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  run_id text NOT NULL,  -- Identifier for current execution run

  -- Tracking
  debate_count integer NOT NULL DEFAULT 0,
  max_debates_per_run integer NOT NULL DEFAULT 3,

  -- Cooldown tracking
  last_debate_at timestamptz,
  cooldown_hours integer NOT NULL DEFAULT 24,
  cooldown_until timestamptz,

  -- Status
  circuit_open boolean NOT NULL DEFAULT false,  -- true = circuit breaker tripped
  trip_reason text,
  trip_at timestamptz,

  -- Reset tracking
  reset_count integer NOT NULL DEFAULT 0,
  last_reset_at timestamptz,

  -- Metadata
  metadata jsonb DEFAULT '{}',

  -- Ensure one circuit breaker per SD+run combo
  UNIQUE(sd_id, run_id)
);

-- Indexes for circuit breaker
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_sd_run
  ON debate_circuit_breaker(sd_id, run_id);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_status
  ON debate_circuit_breaker(circuit_open) WHERE circuit_open = true;
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_cooldown
  ON debate_circuit_breaker(cooldown_until) WHERE cooldown_until > now();

-- ============================================================================
-- Part 7: RLS Policies
-- ============================================================================

-- debate_sessions
ALTER TABLE debate_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to debate sessions"
  ON debate_sessions FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated to insert debate sessions"
  ON debate_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role to update debate sessions"
  ON debate_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- debate_arguments
ALTER TABLE debate_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to debate arguments"
  ON debate_arguments FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated to insert debate arguments"
  ON debate_arguments FOR INSERT
  WITH CHECK (true);

-- judge_verdicts
ALTER TABLE judge_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to judge verdicts"
  ON judge_verdicts FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert verdicts"
  ON judge_verdicts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow human decision updates"
  ON judge_verdicts FOR UPDATE
  USING (true)
  WITH CHECK (
    -- Only allow updates to human_decision fields
    verdict_type = (SELECT verdict_type FROM judge_verdicts WHERE id = judge_verdicts.id)
    AND detailed_rationale = (SELECT detailed_rationale FROM judge_verdicts WHERE id = judge_verdicts.id)
    AND confidence_score = (SELECT confidence_score FROM judge_verdicts WHERE id = judge_verdicts.id)
  );

-- debate_circuit_breaker
ALTER TABLE debate_circuit_breaker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to circuit breaker"
  ON debate_circuit_breaker FOR SELECT
  USING (true);

CREATE POLICY "Allow service role full access to circuit breaker"
  ON debate_circuit_breaker FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Part 8: Helper functions
-- ============================================================================

-- Function to check if circuit breaker is tripped
CREATE OR REPLACE FUNCTION check_debate_circuit_breaker(
  p_sd_id varchar(50),
  p_run_id text
)
RETURNS TABLE (
  can_debate boolean,
  reason text,
  debates_remaining integer,
  cooldown_until timestamptz
) AS $$
DECLARE
  v_circuit RECORD;
BEGIN
  -- Get or create circuit breaker record
  INSERT INTO debate_circuit_breaker (sd_id, run_id)
  VALUES (p_sd_id, p_run_id)
  ON CONFLICT (sd_id, run_id) DO NOTHING;

  SELECT * INTO v_circuit
  FROM debate_circuit_breaker
  WHERE sd_id = p_sd_id AND run_id = p_run_id;

  -- Check if circuit is open
  IF v_circuit.circuit_open THEN
    RETURN QUERY SELECT
      false,
      v_circuit.trip_reason,
      0,
      v_circuit.cooldown_until;
    RETURN;
  END IF;

  -- Check cooldown
  IF v_circuit.cooldown_until IS NOT NULL AND v_circuit.cooldown_until > now() THEN
    RETURN QUERY SELECT
      false,
      'Cooldown period active',
      0,
      v_circuit.cooldown_until;
    RETURN;
  END IF;

  -- Check debate count
  IF v_circuit.debate_count >= v_circuit.max_debates_per_run THEN
    -- Trip circuit breaker
    UPDATE debate_circuit_breaker
    SET
      circuit_open = true,
      trip_reason = 'Max debates per run exceeded',
      trip_at = now(),
      cooldown_until = now() + (cooldown_hours || ' hours')::interval
    WHERE sd_id = p_sd_id AND run_id = p_run_id;

    RETURN QUERY SELECT
      false,
      'Max debates per run exceeded',
      0,
      now() + (v_circuit.cooldown_hours || ' hours')::interval;
    RETURN;
  END IF;

  -- Circuit is closed, debates allowed
  RETURN QUERY SELECT
    true,
    'Circuit breaker allows debate',
    v_circuit.max_debates_per_run - v_circuit.debate_count,
    v_circuit.cooldown_until;
END;
$$ LANGUAGE plpgsql;

-- Function to increment debate count
CREATE OR REPLACE FUNCTION increment_debate_count(
  p_sd_id varchar(50),
  p_run_id text
)
RETURNS void AS $$
BEGIN
  UPDATE debate_circuit_breaker
  SET
    debate_count = debate_count + 1,
    last_debate_at = now()
  WHERE sd_id = p_sd_id AND run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- Function to reset circuit breaker
CREATE OR REPLACE FUNCTION reset_debate_circuit_breaker(
  p_sd_id varchar(50),
  p_run_id text
)
RETURNS void AS $$
BEGIN
  UPDATE debate_circuit_breaker
  SET
    circuit_open = false,
    trip_reason = NULL,
    trip_at = NULL,
    cooldown_until = NULL,
    debate_count = 0,
    reset_count = reset_count + 1,
    last_reset_at = now()
  WHERE sd_id = p_sd_id AND run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_debate_circuit_breaker TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_debate_count TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reset_debate_circuit_breaker TO authenticated, service_role;

-- ============================================================================
-- Part 9: Views for debate analytics
-- ============================================================================

CREATE OR REPLACE VIEW v_debate_analytics AS
SELECT
  ds.id AS debate_session_id,
  ds.sd_id,
  ds.conflict_type,
  ds.status,
  ds.round_number,
  ds.created_at AS debate_started_at,
  ds.resolved_at AS debate_resolved_at,
  EXTRACT(EPOCH FROM (COALESCE(ds.resolved_at, now()) - ds.created_at)) / 60 AS debate_duration_minutes,

  -- Argument counts
  (SELECT COUNT(*) FROM debate_arguments WHERE debate_session_id = ds.id) AS total_arguments,
  (SELECT COUNT(DISTINCT agent_code) FROM debate_arguments WHERE debate_session_id = ds.id) AS participating_agents,

  -- Verdict info
  jv.verdict_type,
  jv.confidence_score AS verdict_confidence,
  jv.constitutional_score,
  jv.escalation_required,
  jv.human_decision,

  -- Constitutional citations
  (SELECT COUNT(*) FROM (
    SELECT DISTINCT jsonb_array_elements(constitution_citations)->>'rule_code' AS rule_code
    FROM debate_arguments WHERE debate_session_id = ds.id
  ) AS arg_citations) AS unique_constitutional_citations,

  -- Metadata
  ds.metadata AS debate_metadata,
  jv.metadata AS verdict_metadata
FROM debate_sessions ds
LEFT JOIN judge_verdicts jv ON jv.debate_session_id = ds.id
ORDER BY ds.created_at DESC;

-- ============================================================================
-- Part 10: Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_debate_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_debate_session_timestamp
  BEFORE UPDATE ON debate_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_debate_session_timestamp();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  judge_exists boolean;
  trigger_count integer;
  tables_created boolean;
BEGIN
  -- Check JUDGE sub-agent
  SELECT EXISTS(SELECT 1 FROM leo_sub_agents WHERE code = 'JUDGE') INTO judge_exists;
  IF NOT judge_exists THEN
    RAISE EXCEPTION 'JUDGE sub-agent not created';
  END IF;

  -- Check triggers
  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers t
  JOIN leo_sub_agents s ON t.sub_agent_id = s.id
  WHERE s.code = 'JUDGE';

  IF trigger_count < 13 THEN
    RAISE WARNING 'Expected at least 13 triggers for JUDGE, found %', trigger_count;
  END IF;

  -- Check tables
  SELECT
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'debate_sessions')
    AND EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'debate_arguments')
    AND EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'judge_verdicts')
    AND EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'debate_circuit_breaker')
  INTO tables_created;

  IF NOT tables_created THEN
    RAISE EXCEPTION 'One or more debate tables not created';
  END IF;

  RAISE NOTICE 'Debate Protocol setup complete: judge=%, triggers=%, tables=OK',
    judge_exists, trigger_count;
END $$;
