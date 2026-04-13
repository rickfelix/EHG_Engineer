-- Migration: Schedule Friday Meeting Notification via pg_cron
-- Purpose: Fires the friday-notification Edge Function every Friday at 8:55 AM UTC
-- Dependencies: pg_cron (enabled in Supabase dashboard), pg_net extension
-- Rollback: SELECT cron.unschedule('friday-meeting-notification');
--
-- IMPORTANT: pg_cron requires superuser privileges and is NOT accessible via the
-- Supabase pooler connection. This migration MUST be executed in the Supabase
-- Dashboard SQL Editor (https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql).
--
-- Pre-requisites (Supabase Dashboard > Database > Extensions):
--   1. pg_cron must be enabled (it is by default on paid plans)
--   2. pg_net must be enabled (confirmed working via pooler)
--
-- After execution, verify with:
--   SELECT jobid, jobname, schedule, command FROM cron.job
--     WHERE jobname = 'friday-meeting-notification';

-- Step 1: Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Step 2: Remove existing schedule if re-running (idempotent)
-- Note: This will error harmlessly if the job does not exist
SELECT cron.unschedule('friday-meeting-notification');

-- Step 3: Schedule Friday 8:55 AM UTC notification
SELECT cron.schedule(
  'friday-meeting-notification',
  '55 8 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://dedlbzhpgkmetvhbkyzq.supabase.co/functions/v1/friday-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Step 4: Verify the job was created
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'friday-meeting-notification';
