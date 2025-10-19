-- SDIP (Strategic Directive Initiation Protocol) Schema
-- For MVP+ with full validation workflow
-- Created: 2025-09-03

-- Drop tables if they exist (for clean installation)
DROP TABLE IF EXISTS sdip_groups CASCADE;
DROP TABLE IF EXISTS sdip_submissions CASCADE;

-- SDIP Submissions table
-- Stores individual feedback submissions with full validation tracking
CREATE TABLE sdip_submissions (
  id BIGSERIAL PRIMARY KEY,
  
  -- Input (Step 1)
  submission_title TEXT,
  screenshot_url TEXT,
  chairman_input TEXT NOT NULL,
  
  -- Hidden PACER analysis (backend-only, not displayed in UI)
  pacer_analysis JSONB,
  pacer_version TEXT DEFAULT 'v1.0',
  
  -- Step 2: Intent Confirmation
  intent_summary TEXT,
  intent_original TEXT, -- Tracks if user edited the intent
  intent_confirmed BOOLEAN DEFAULT FALSE,
  intent_confirmed_at TIMESTAMPTZ,
  
  -- Step 3: Strategic/Tactical Classification
  strat_tac_system JSONB, -- System's assessment
  strat_tac_override JSONB, -- Chairman's override if any
  strat_tac_final JSONB, -- Final classification used
  strat_tac_reviewed BOOLEAN DEFAULT FALSE,
  strat_tac_reviewed_at TIMESTAMPTZ,
  
  -- Step 4: Synthesis Review
  synthesis JSONB, -- {aligned: [], required: [], recommended: []}
  change_policies JSONB, -- Policy badges for each synthesis item
  synthesis_reviewed BOOLEAN DEFAULT FALSE,
  synthesis_reviewed_at TIMESTAMPTZ,
  
  -- Step 5: Clarifying Questions
  clarifying_questions JSONB, -- Array of questions
  question_answers JSONB, -- User's answers
  questions_answered BOOLEAN DEFAULT FALSE,
  questions_answered_at TIMESTAMPTZ,
  
  -- Step 6: Client Summary
  client_summary TEXT,
  summary_confirmed BOOLEAN DEFAULT FALSE,
  summary_confirmed_at TIMESTAMPTZ,
  
  -- Validation tracking
  current_step INTEGER DEFAULT 1 CHECK (current_step BETWEEN 1 AND 6),
  validation_complete BOOLEAN DEFAULT FALSE,
  all_gates_passed BOOLEAN DEFAULT FALSE,
  gate_status JSONB DEFAULT '{"step1": false, "step2": false, "step3": false, "step4": false, "step5": false, "step6": false}'::jsonb,
  
  -- Critical mode only (no supportive mode in MVP+)
  analysis_mode TEXT DEFAULT 'CRITICAL' CHECK (analysis_mode = 'CRITICAL'),
  
  -- Grouping support for manual linking
  group_id UUID DEFAULT NULL,
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Link to resulting Strategic Directive
  resulting_sd_id TEXT
);

-- SDIP Groups table
-- For manually combining multiple submissions
CREATE TABLE sdip_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name TEXT NOT NULL,
  submission_ids BIGINT[] NOT NULL,
  
  -- Combined analysis results
  combined_intent_summary TEXT,
  combined_synthesis JSONB,
  combined_client_summary TEXT,
  
  -- Validation tracking for group
  validation_complete BOOLEAN DEFAULT FALSE,
  all_gates_passed BOOLEAN DEFAULT FALSE,
  
  -- Link to resulting SD if created
  final_sd_id TEXT,
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sdip_user_incomplete 
  ON sdip_submissions(created_by, validation_complete) 
  WHERE validation_complete = FALSE;

CREATE INDEX idx_sdip_current_step 
  ON sdip_submissions(current_step) 
  WHERE validation_complete = FALSE;

CREATE INDEX idx_sdip_group_id 
  ON sdip_submissions(group_id) 
  WHERE group_id IS NOT NULL;

CREATE INDEX idx_sdip_created_at 
  ON sdip_submissions(created_at DESC);

CREATE INDEX idx_sdip_groups_user 
  ON sdip_groups(created_by);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sdip_submissions_updated_at 
  BEFORE UPDATE ON sdip_submissions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sdip_groups_updated_at 
  BEFORE UPDATE ON sdip_groups 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE sdip_submissions IS 'Strategic Directive Initiation Protocol submissions with full validation workflow';
COMMENT ON TABLE sdip_groups IS 'Manually grouped SDIP submissions for combined analysis';
COMMENT ON COLUMN sdip_submissions.pacer_analysis IS 'PACER categorization - backend only, not displayed in UI';
COMMENT ON COLUMN sdip_submissions.analysis_mode IS 'Critical mode only in MVP+, no supportive mode';
COMMENT ON COLUMN sdip_submissions.gate_status IS 'Tracks which validation gates have been passed';