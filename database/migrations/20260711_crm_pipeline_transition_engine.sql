-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (§3.1)
-- Branching pipeline-stage transition engine — a SIBLING of fn_advance_venture_stage,
-- never a generalization of it (the linear from+1 trap). Own tables, own function,
-- disjoint from ventures/venture_stage_transitions/stage_config.
--
-- Write-time guards (FR-3):
--   stranger-provenance: crm_pipeline_transitions.provenance_event_id is NOT NULL and
--     FK-enforced against crm_inbound_events — a hand-inserted row with no real inbound
--     event is rejected by the database at INSERT time, not just by app-layer checks.
--   no-stage-skipping: a BEFORE INSERT trigger validates (from_stage, to_stage, case_type)
--     against the crm_pipeline_stage_edges allow-list (a branching graph, not a linear chain).

CREATE TABLE IF NOT EXISTS crm_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stage_defs (
  stage_key TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('pipeline', 'support')),
  display_name TEXT NOT NULL,
  is_qualified BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (stage_key, case_type)
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stage_edges (
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('pipeline', 'support')),
  PRIMARY KEY (from_stage, to_stage, case_type),
  FOREIGN KEY (from_stage, case_type) REFERENCES crm_pipeline_stage_defs(stage_key, case_type),
  FOREIGN KEY (to_stage, case_type) REFERENCES crm_pipeline_stage_defs(stage_key, case_type)
);

CREATE TABLE IF NOT EXISTS crm_pipeline_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  case_type TEXT NOT NULL CHECK (case_type IN ('pipeline', 'support')),
  current_stage TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (current_stage, case_type) REFERENCES crm_pipeline_stage_defs(stage_key, case_type)
);

CREATE TABLE IF NOT EXISTS crm_pipeline_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES crm_pipeline_cases(id),
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  provenance_event_id UUID NOT NULL REFERENCES crm_inbound_events(id),
  idempotency_key UUID,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_cases_venture_id ON crm_pipeline_cases(venture_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_transitions_case_id ON crm_pipeline_transitions(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_pipeline_transitions_idempotency
  ON crm_pipeline_transitions(case_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- No-stage-skipping guard: any INSERT into crm_pipeline_transitions (direct or via the
-- function below) must correspond to an allowed edge in the branching graph.
CREATE OR REPLACE FUNCTION crm_enforce_pipeline_stage_edge() RETURNS TRIGGER AS $$
DECLARE
  v_case_type TEXT;
BEGIN
  SELECT case_type INTO v_case_type FROM crm_pipeline_cases WHERE id = NEW.case_id;
  IF NOT EXISTS (
    SELECT 1 FROM crm_pipeline_stage_edges
    WHERE from_stage = NEW.from_stage AND to_stage = NEW.to_stage AND case_type = v_case_type
  ) THEN
    RAISE EXCEPTION 'crm_pipeline_transitions: no-stage-skipping guard rejected % -> % for case_type %',
      NEW.from_stage, NEW.to_stage, v_case_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_enforce_pipeline_stage_edge ON crm_pipeline_transitions;
CREATE TRIGGER trg_crm_enforce_pipeline_stage_edge
  BEFORE INSERT ON crm_pipeline_transitions
  FOR EACH ROW EXECUTE FUNCTION crm_enforce_pipeline_stage_edge();

-- Sibling of fn_advance_venture_stage: same defensive JSONB-return / no-raise shape,
-- but its own object graph — never touches ventures, venture_stage_transitions, stage_config.
CREATE OR REPLACE FUNCTION fn_advance_pipeline_stage(
  p_case_id UUID,
  p_from_stage TEXT,
  p_to_stage TEXT,
  p_provenance_event_id UUID,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stage TEXT;
  v_existing_transition_id UUID;
BEGIN
  SELECT current_stage INTO v_current_stage FROM crm_pipeline_cases WHERE id = p_case_id FOR UPDATE;
  IF v_current_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;
  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'stage_mismatch', 'expected', v_current_stage);
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_transition_id FROM crm_pipeline_transitions
      WHERE case_id = p_case_id AND idempotency_key = p_idempotency_key;
    IF v_existing_transition_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'transition_id', v_existing_transition_id);
    END IF;
  END IF;

  INSERT INTO crm_pipeline_transitions (case_id, from_stage, to_stage, provenance_event_id, idempotency_key)
    VALUES (p_case_id, p_from_stage, p_to_stage, p_provenance_event_id, p_idempotency_key);

  UPDATE crm_pipeline_cases SET current_stage = p_to_stage, updated_at = now() WHERE id = p_case_id;

  RETURN jsonb_build_object('success', true, 'from_stage', p_from_stage, 'to_stage', p_to_stage);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Seed a minimal branching stage graph for the pipeline case type.
INSERT INTO crm_pipeline_stage_defs (stage_key, case_type, display_name, is_qualified) VALUES
  ('inbound', 'pipeline', 'Inbound', false),
  ('contacted', 'pipeline', 'Contacted', false),
  ('qualified', 'pipeline', 'Qualified', true),
  ('disqualified', 'pipeline', 'Disqualified', false),
  ('won', 'pipeline', 'Won', true),
  ('lost', 'pipeline', 'Lost', false)
ON CONFLICT DO NOTHING;

INSERT INTO crm_pipeline_stage_edges (from_stage, to_stage, case_type) VALUES
  ('inbound', 'contacted', 'pipeline'),
  ('contacted', 'qualified', 'pipeline'),
  ('contacted', 'disqualified', 'pipeline'),
  ('qualified', 'won', 'pipeline'),
  ('qualified', 'lost', 'pipeline'),
  ('qualified', 'disqualified', 'pipeline')
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION fn_advance_pipeline_stage IS 'Relationship engine satellite (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C): branching pipeline-stage transition, sibling of fn_advance_venture_stage — separate object graph, never a generalization.';
