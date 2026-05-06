-- QF-20260506-552 — Defang create_postmortem_on_venture_failure via ::text cast
-- Origin: RCA-AGENT report on SD-LEO-FEAT-STAGE-REJECT-KILL-001 EXEC blocker
--
-- Trigger compared NEW.status (venture_status_enum) against literal 'failed',
-- which the enum doesn't contain — Postgres raised 22P02 on every UPDATE OF
-- ventures.status. Defensive ::text cast preserves trigger semantics (branch
-- never fires while 'failed' is absent) without crashing. See
-- issue_pattern PAT-DB-TRIG-ENUM-001 for the prevention checklist.

CREATE OR REPLACE FUNCTION public.create_postmortem_on_venture_failure()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status::text = 'failed'
     AND (OLD.status IS NULL OR OLD.status::text != 'failed') THEN
    INSERT INTO public.venture_postmortems (
      venture_id, venture_name, venture_start_date,
      failure_date, status, created_by
    ) VALUES (
      NEW.id, NEW.name, NEW.created_at, NOW(), 'draft', 'TRIGGER'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
