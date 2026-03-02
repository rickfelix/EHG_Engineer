-- =============================================================
-- GOVERNANCE GUARDRAIL ENFORCEMENT TRIGGERS
-- SD: SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001
-- Purpose: Defense-in-depth DB enforcement for 5 blocking guardrails.
-- JS guardrail-registry.js provides fast-fail UX; these triggers
-- are the tamper-proof safety net for non-CLI entry points.
-- =============================================================

-- 1. GR-GOVERNANCE-CASCADE
-- Every SD must trace to a strategic theme/OKR or be a child SD.
CREATE OR REPLACE FUNCTION enforce_gr_governance_cascade()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.strategic_objectives IS NULL
      OR jsonb_array_length(NEW.strategic_objectives) = 0)
     AND NEW.parent_sd_id IS NULL
  THEN
    RAISE EXCEPTION '[GR-GOVERNANCE-CASCADE] SD has no strategic_objectives and no parent_sd_id. Every SD must trace to a strategic theme, OKR, or parent orchestrator. Fix: Add strategic_objectives array or set parent_sd_id.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gr_governance_cascade ON strategic_directives_v2;
CREATE TRIGGER trigger_gr_governance_cascade
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gr_governance_cascade();


-- 2. GR-ORCHESTRATOR-ARCH-PLAN
-- Orchestrator SDs must have an architecture plan reference.
CREATE OR REPLACE FUNCTION enforce_gr_orchestrator_arch_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.sd_type = 'orchestrator' OR NEW.relationship_type = 'parent')
     AND (NEW.metadata IS NULL
          OR (NEW.metadata->>'architecture_plan_ref' IS NULL
              AND NEW.metadata->>'arch_plan_key' IS NULL))
  THEN
    RAISE EXCEPTION '[GR-ORCHESTRATOR-ARCH-PLAN] Orchestrator SD requires an architecture plan reference in metadata. Fix: Add metadata.architecture_plan_ref or metadata.arch_plan_key.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gr_orchestrator_arch_plan ON strategic_directives_v2;
CREATE TRIGGER trigger_gr_orchestrator_arch_plan
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gr_orchestrator_arch_plan();


-- 3. GR-OKR-HARD-STOP
-- SD creation blocked after OKR cycle day 28 unless chairman override.
CREATE OR REPLACE FUNCTION enforce_gr_okr_hard_stop()
RETURNS TRIGGER AS $$
DECLARE
  cycle_day INTEGER;
  has_override BOOLEAN;
BEGIN
  cycle_day := EXTRACT(DAY FROM CURRENT_DATE);

  IF cycle_day > 28 THEN
    has_override := (NEW.metadata IS NOT NULL
                     AND (NEW.metadata->>'chairman_override')::boolean IS TRUE);
    IF NOT has_override THEN
      RAISE EXCEPTION '[GR-OKR-HARD-STOP] OKR cycle day % exceeds hard stop threshold (28). Chairman override required for late-cycle SD creation. Fix: Add metadata.chairman_override = true.', cycle_day;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gr_okr_hard_stop ON strategic_directives_v2;
CREATE TRIGGER trigger_gr_okr_hard_stop
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gr_okr_hard_stop();


-- 4. GR-BRAINSTORM-INTENT
-- Brainstorm-sourced SDs must reference the brainstorm session ID.
CREATE OR REPLACE FUNCTION enforce_gr_brainstorm_intent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.metadata IS NOT NULL
     AND (NEW.metadata->>'source' = 'brainstorm'
          OR (NEW.metadata->>'brainstorm_origin')::boolean IS TRUE)
     AND NEW.metadata->>'brainstorm_session_id' IS NULL
  THEN
    RAISE EXCEPTION '[GR-BRAINSTORM-INTENT] SD sourced from brainstorm session but missing brainstorm_session_id in metadata. Fix: Add metadata.brainstorm_session_id.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gr_brainstorm_intent ON strategic_directives_v2;
CREATE TRIGGER trigger_gr_brainstorm_intent
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gr_brainstorm_intent();


-- 5. GR-VISION-ALIGNMENT
-- Vision score, when provided, must be >= 30.
CREATE OR REPLACE FUNCTION enforce_gr_vision_alignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vision_alignment_score IS NOT NULL
     AND NEW.vision_alignment_score < 30
  THEN
    RAISE EXCEPTION '[GR-VISION-ALIGNMENT] Vision alignment score %/100 is below minimum threshold (30). Fix: Improve strategic alignment or remove score to defer scoring.', NEW.vision_alignment_score;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gr_vision_alignment ON strategic_directives_v2;
CREATE TRIGGER trigger_gr_vision_alignment
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gr_vision_alignment();


-- Comments for documentation
COMMENT ON FUNCTION enforce_gr_governance_cascade() IS
  'GR-GOVERNANCE-CASCADE: Rejects INSERT when strategic_objectives is empty and parent_sd_id is NULL.';
COMMENT ON FUNCTION enforce_gr_orchestrator_arch_plan() IS
  'GR-ORCHESTRATOR-ARCH-PLAN: Rejects INSERT for orchestrator/parent SDs without architecture_plan_ref in metadata.';
COMMENT ON FUNCTION enforce_gr_okr_hard_stop() IS
  'GR-OKR-HARD-STOP: Rejects INSERT after OKR cycle day 28 without chairman_override in metadata.';
COMMENT ON FUNCTION enforce_gr_brainstorm_intent() IS
  'GR-BRAINSTORM-INTENT: Rejects INSERT for brainstorm-sourced SDs without brainstorm_session_id in metadata.';
COMMENT ON FUNCTION enforce_gr_vision_alignment() IS
  'GR-VISION-ALIGNMENT: Rejects INSERT when vision_alignment_score is set and below 30.';
