-- @approved-by: codestreetlabs@gmail.com
-- SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001
-- Add gate_label to the venture_stages_audit trigger
--
-- Bug: fn_venture_stages_audit_trigger() audits every business column of
-- venture_stages EXCEPT gate_label — a chairman-gate-control column added by
-- 20260529_childD_venture_stages_app_fields.sql and set by the S21/S22 chairman
-- gate migrations (which UPDATE review_mode AND gate_label together). The other
-- two chairman-gate-control columns (gate_type, review_mode) are already audited,
-- so chairman gate-label changes were silently leaving no audit trail.
--
-- Fix: CREATE OR REPLACE the trigger function with its existing 16-column body
-- PLUS a per-column gate_label check, mirroring the existing pattern. No schema
-- change (venture_stages_audit.old_value/new_value are already TEXT) and no
-- trigger re-creation needed — CREATE OR REPLACE atomically swaps the body and
-- the existing trg_venture_stages_audit keeps pointing at it. Idempotent.

CREATE OR REPLACE FUNCTION public.fn_venture_stages_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.stage_name IS DISTINCT FROM NEW.stage_name THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'stage_name', OLD.stage_name, NEW.stage_name);
  END IF;
  IF OLD.stage_key IS DISTINCT FROM NEW.stage_key THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'stage_key', OLD.stage_key, NEW.stage_key);
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'description', OLD.description, NEW.description);
  END IF;
  IF OLD.phase_number IS DISTINCT FROM NEW.phase_number THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'phase_number', OLD.phase_number::text, NEW.phase_number::text);
  END IF;
  IF OLD.phase_name IS DISTINCT FROM NEW.phase_name THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'phase_name', OLD.phase_name, NEW.phase_name);
  END IF;
  IF OLD.chunk IS DISTINCT FROM NEW.chunk THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'chunk', OLD.chunk, NEW.chunk);
  END IF;
  IF OLD.gate_type IS DISTINCT FROM NEW.gate_type THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'gate_type', OLD.gate_type, NEW.gate_type);
  END IF;
  IF OLD.review_mode IS DISTINCT FROM NEW.review_mode THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'review_mode', OLD.review_mode, NEW.review_mode);
  END IF;
  IF OLD.work_type IS DISTINCT FROM NEW.work_type THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'work_type', OLD.work_type, NEW.work_type);
  END IF;
  IF OLD.sd_required IS DISTINCT FROM NEW.sd_required THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'sd_required', OLD.sd_required::text, NEW.sd_required::text);
  END IF;
  IF OLD.sd_suffix IS DISTINCT FROM NEW.sd_suffix THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'sd_suffix', OLD.sd_suffix, NEW.sd_suffix);
  END IF;
  IF OLD.advisory_enabled IS DISTINCT FROM NEW.advisory_enabled THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'advisory_enabled', OLD.advisory_enabled::text, NEW.advisory_enabled::text);
  END IF;
  IF OLD.depends_on IS DISTINCT FROM NEW.depends_on THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'depends_on', OLD.depends_on::text, NEW.depends_on::text);
  END IF;
  IF OLD.required_artifacts IS DISTINCT FROM NEW.required_artifacts THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'required_artifacts', OLD.required_artifacts::text, NEW.required_artifacts::text);
  END IF;
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'metadata', OLD.metadata::text, NEW.metadata::text);
  END IF;
  IF OLD.component_path IS DISTINCT FROM NEW.component_path THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'component_path', OLD.component_path, NEW.component_path);
  END IF;
  -- SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001: audit chairman gate-label changes.
  IF OLD.gate_label IS DISTINCT FROM NEW.gate_label THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'gate_label', OLD.gate_label, NEW.gate_label);
  END IF;
  RETURN NEW;
END;
$$;
