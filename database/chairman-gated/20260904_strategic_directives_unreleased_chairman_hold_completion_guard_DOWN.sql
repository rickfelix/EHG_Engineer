-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2 -- ROLLBACK
--
-- Restores enforce_canonical_lifecycle_write() to its pre-this-migration body -- the exact
-- text from 20260824_strategic_directives_canonical_writer_choke.sql lines 466-511 (verbatim,
-- re-captured here) -- then drops the three new helper functions this migration added.
--
-- SAFE TO RE-APPLY THE UP FILE AFTER THIS ROLLBACK: unlike the R5-style stamp/column
-- migrations elsewhere in this directory, nothing here is a NULL-at-rest / accumulation
-- concern -- this migration touches no column and no at-rest state, only function bodies.
-- CREATE OR REPLACE FUNCTION is idempotent.
--
-- No trigger DROP/CREATE here, deliberately: aaa_/zzz_ are untouched by both the UP and this
-- DOWN file -- they already point at enforce_canonical_lifecycle_write() by name and pick up
-- whichever body is live.

CREATE OR REPLACE FUNCTION public.enforce_canonical_lifecycle_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected_changed boolean;
BEGIN
  v_protected_changed :=
        NEW.status          IS DISTINCT FROM OLD.status
     OR NEW.current_phase   IS DISTINCT FROM OLD.current_phase
     OR NEW.completion_date IS DISTINCT FROM OLD.completion_date;

  IF v_protected_changed THEN
    IF NEW.lifecycle_write_token IS NULL THEN
      RAISE EXCEPTION 'missing canonical-writer stamp on protected-column write'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format(
                'guard=%s sd=%s status:%s->%s current_phase:%s->%s completion_date:%s->%s',
                TG_NAME, NEW.id,
                OLD.status, NEW.status,
                OLD.current_phase, NEW.current_phase,
                OLD.completion_date, NEW.completion_date),
              HINT    = 'Set lifecycle_write_token to your registry identity in the SAME UPDATE statement. Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.sd_canonical_writer_policy(NEW.lifecycle_write_token)
    ) THEN
      RAISE EXCEPTION 'stamp value not present in canonical-writer registry'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format('guard=%s sd=%s rejected_identity=%L', TG_NAME, NEW.id, NEW.lifecycle_write_token),
              HINT    = 'Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;
  END IF;

  -- NULL-at-rest cleanup (FR-3). UNCONDITIONAL, deliberately: it must run even when no protected
  -- column changed, because otherwise a coordination-only write that happened to carry a stamp
  -- would leave a valid value at rest for the NEXT unstamped write to inherit.
  IF TG_ARGV[0] = 'final' THEN
    NEW.lifecycle_write_token := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.sd_metadata_has_unreleased_chairman_hold(jsonb);
DROP FUNCTION IF EXISTS public.sd_metadata_hold_released(jsonb, text);
DROP FUNCTION IF EXISTS public.sd_safe_parse_timestamptz(text);
