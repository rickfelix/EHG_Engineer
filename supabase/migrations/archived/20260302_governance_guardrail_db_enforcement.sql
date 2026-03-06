-- SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001
-- Database-level enforcement of governance guardrails on strategic_directives_v2.
-- These triggers make guardrails un-bypassable regardless of entry point
-- (CLI, direct INSERT, Supabase dashboard, RPC, etc.)
--
-- JS guardrail-registry.js remains as a fast-fail UX layer with friendly messages.
-- These DB triggers are the authoritative enforcement layer.

-- ============================================================================
-- 1. GR-GOVERNANCE-CASCADE: Every SD must trace to strategic governance
--    Requires: strategic_objectives (non-empty array) OR parent_sd_id
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_governance_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow completed/deferred/archived SDs to remain unchanged
  IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'deferred', 'archived') THEN
    RETURN NEW;
  END IF;

  -- Check: must have strategic_objectives (non-empty) OR parent_sd_id
  IF (
    NEW.parent_sd_id IS NULL
    AND (
      NEW.strategic_objectives IS NULL
      OR jsonb_array_length(NEW.strategic_objectives) = 0
    )
  ) THEN
    RAISE EXCEPTION 'GR-GOVERNANCE-CASCADE: SD must have strategic_objectives (non-empty array) or parent_sd_id. Every SD must trace to a strategic theme, OKR, or parent orchestrator.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_governance_cascade ON strategic_directives_v2;
CREATE TRIGGER trg_governance_cascade
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_governance_cascade();


-- ============================================================================
-- 2. GR-ORCHESTRATOR-ARCH-PLAN: Orchestrator SDs require architecture plan
--    Requires: metadata->>'architecture_plan_ref' OR metadata->>'arch_plan_key'
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_orchestrator_arch_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sd_type = 'orchestrator' THEN
    IF (
      (NEW.metadata->>'architecture_plan_ref') IS NULL
      AND (NEW.metadata->>'arch_plan_key') IS NULL
    ) THEN
      RAISE EXCEPTION 'GR-ORCHESTRATOR-ARCH-PLAN: Orchestrator SD requires an architecture plan reference. Set metadata.architecture_plan_ref or metadata.arch_plan_key.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orchestrator_arch_plan ON strategic_directives_v2;
CREATE TRIGGER trg_orchestrator_arch_plan
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_orchestrator_arch_plan();


-- ============================================================================
-- 3. GR-VISION-ALIGNMENT: Vision score minimum threshold
--    If vision_score is set, it must be >= 30
-- ============================================================================
-- Using a simple CHECK constraint (most efficient for scalar checks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_vision_alignment_minimum'
    AND conrelid = 'strategic_directives_v2'::regclass
  ) THEN
    ALTER TABLE strategic_directives_v2
      ADD CONSTRAINT chk_vision_alignment_minimum
      CHECK (vision_score IS NULL OR vision_score >= 30);
  END IF;
END $$;


-- ============================================================================
-- 4. GR-DELETION-SAFEGUARD: Destructive scope requires backup plan
--    If scope contains destructive keywords, metadata must have backup_plan
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_deletion_safeguard()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on INSERT (existing SDs are grandfathered)
  IF NEW.scope IS NOT NULL
    AND NEW.scope ~* '\m(drop\s+table|delete\s+(all|from|records|data)|truncate|purge|destroy|remove\s+(all|data|records))\M'
  THEN
    IF (
      (NEW.metadata->>'backup_plan')::boolean IS NOT TRUE
      AND (NEW.metadata->>'deletion_approved')::boolean IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'GR-DELETION-SAFEGUARD: SD involves destructive operations. Set metadata.backup_plan=true or metadata.deletion_approved=true.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deletion_safeguard ON strategic_directives_v2;
CREATE TRIGGER trg_deletion_safeguard
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_deletion_safeguard();


-- ============================================================================
-- 5. GR-MIGRATION-REVIEW: Migration scope requires review
--    If scope mentions migration/schema changes, metadata must confirm review
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_migration_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scope IS NOT NULL
    AND NEW.scope ~* '\m(migration|alter\s+table|add\s+column|drop\s+column|schema\s+change|database\s+migration)\M'
  THEN
    IF (
      (NEW.metadata->>'migration_reviewed')::boolean IS NOT TRUE
      AND (NEW.metadata->>'migration_plan')::boolean IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'GR-MIGRATION-REVIEW: SD involves database migration. Set metadata.migration_reviewed=true or metadata.migration_plan=true.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_migration_review ON strategic_directives_v2;
CREATE TRIGGER trg_migration_review
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_migration_review();


-- ============================================================================
-- 6. GR-SECURITY-BASELINE: Security scope requires assessment
--    If scope mentions auth/RLS/credentials, metadata must confirm review
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_security_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scope IS NOT NULL
    AND NEW.scope ~* '\m(auth|authentication|authorization|rls|row.level.security|credential|secret|token|api.key|oauth|jwt|password|encryption)\M'
  THEN
    IF (
      (NEW.metadata->>'security_reviewed')::boolean IS NOT TRUE
      AND (NEW.metadata->>'threat_model')::boolean IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'GR-SECURITY-BASELINE: SD touches security-sensitive scope. Set metadata.security_reviewed=true or metadata.threat_model=true.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_baseline ON strategic_directives_v2;
CREATE TRIGGER trg_security_baseline
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_security_baseline();


-- ============================================================================
-- Audit table for guardrail enforcement events (DB-level)
-- ============================================================================
CREATE TABLE IF NOT EXISTS guardrail_enforcement_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guardrail_id text NOT NULL,
  sd_key text,
  sd_id uuid,
  action text NOT NULL DEFAULT 'blocked',  -- 'blocked' or 'allowed'
  message text,
  created_at timestamptz DEFAULT now()
);

-- Index for querying enforcement events by guardrail
CREATE INDEX IF NOT EXISTS idx_guardrail_enforcement_log_guardrail
  ON guardrail_enforcement_log (guardrail_id, created_at DESC);

COMMENT ON TABLE guardrail_enforcement_log IS 'Audit trail for database-level guardrail enforcement (SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001)';


-- ============================================================================
-- Summary of enforcement
-- ============================================================================
-- | Guardrail                | Enforcement Type   | Applies To    |
-- |--------------------------|--------------------|---------------|
-- | GR-GOVERNANCE-CASCADE    | BEFORE INSERT trigger | All SDs      |
-- | GR-ORCHESTRATOR-ARCH-PLAN| BEFORE INSERT trigger | orchestrator |
-- | GR-VISION-ALIGNMENT      | CHECK constraint   | All SDs       |
-- | GR-DELETION-SAFEGUARD    | BEFORE INSERT trigger | Scope-based  |
-- | GR-MIGRATION-REVIEW      | BEFORE INSERT trigger | Scope-based  |
-- | GR-SECURITY-BASELINE     | BEFORE INSERT trigger | Scope-based  |
--
-- JS guardrail-registry.js remains for:
-- - Fast-fail with friendly error messages before DB round-trip
-- - Advisory guardrails (GR-RISK-ASSESSMENT, GR-COMMS-BLAST-GUARD, etc.)
-- - GR-BULK-SD-BLOCK (session-scoped, not enforceable at DB level)
-- - GR-OKR-HARD-STOP (requires OKR cycle lookup, complex calendar logic)
-- - GR-SCOPE-BOUNDARY (complex regex on type+scope combination)
