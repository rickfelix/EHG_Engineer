-- SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-1 — rollback for
-- 20260906_retrospectives_published_guard.sql.
--
-- @approved-by: <PENDING -- rollback carries the same ceremony as the UP migration>
--
-- Restores trg_retrospectives_audit() to its EXACT pre-this-migration body (captured live via
-- pg_get_functiondef('trg_retrospectives_audit'::regproc) before the UP migration was authored),
-- drops the new trigger and its function, drops the registry function, and drops the
-- retro_write_token column.

DROP TRIGGER IF EXISTS zzz_retrospectives_published_guard ON public.retrospectives;
DROP FUNCTION IF EXISTS public.enforce_retrospectives_published_guard();
DROP FUNCTION IF EXISTS public.retro_canonical_writer_policy(text);

CREATE OR REPLACE FUNCTION public.trg_retrospectives_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, new_data)
          VALUES (NEW.id, 'INSERT', to_jsonb(NEW));
        ELSIF TG_OP = 'UPDATE' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, old_data, new_data)
          VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        ELSIF TG_OP = 'DELETE' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, old_data)
          VALUES (OLD.id, 'DELETE', to_jsonb(OLD));
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $function$;

REVOKE EXECUTE ON FUNCTION public.trg_retrospectives_audit() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.retrospectives
  DROP COLUMN IF EXISTS retro_write_token;
