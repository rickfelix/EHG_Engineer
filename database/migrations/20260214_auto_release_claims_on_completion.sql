-- Migration: Auto-release claims when SD status transitions to 'completed'
-- Extends existing enforce_completed_phase_alignment() trigger function
-- to also clear claiming_session_id, active_session_id, and sd_claims rows.
--
-- Safety net: If release_sd() already ran (normal LEAD-FINAL-APPROVAL path),
-- fields are already NULL and sd_claims row already gone — this is idempotent.

CREATE OR REPLACE FUNCTION enforce_completed_phase_alignment()
RETURNS TRIGGER AS $$
BEGIN
    -- When status transitions to 'completed', ensure full cleanup
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.current_phase := 'COMPLETED';
        NEW.is_working_on := false;
        NEW.claiming_session_id := NULL;
        NEW.active_session_id := NULL;

        -- Clean up sd_claims table
        DELETE FROM sd_claims WHERE sd_key = NEW.sd_key;

        RAISE NOTICE 'Auto-released claims on completion for SD: %', NEW.id;
    END IF;

    -- Existing: phase/status alignment (for cases where phase is set directly)
    IF NEW.status = 'completed' AND NEW.current_phase != 'COMPLETED' THEN
        NEW.current_phase := 'COMPLETED';
        NEW.is_working_on := false;
    END IF;

    IF NEW.current_phase = 'COMPLETED' AND NEW.status != 'completed' THEN
        NEW.status := 'completed';
        NEW.is_working_on := false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
