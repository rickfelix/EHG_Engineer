-- SD-LEO-REFAC-GATE-STATUS-AUTHORITY-001 FR-4
-- Adds venture_stage_work to supabase_realtime publication so the UI's
-- useStageWorkForStage hook can invalidate React Query cache instantly when
-- the worker writes stage_status changes — instead of relying on the 60s TTL.
--
-- Verification at PLAN time showed venture_stage_work was NOT in the publication
-- despite useVentureWorkflow.ts:82-94 subscribing to a channel (the channel
-- subscription works but receives no events).
--
-- Pattern: same as DB-8 of SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 for
-- chairman_dashboard_config.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'venture_stage_work'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.venture_stage_work';
  END IF;
END $$;

ALTER TABLE venture_stage_work REPLICA IDENTITY DEFAULT;
