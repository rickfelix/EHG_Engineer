-- ROLLBACK for 20260822_sms_outbound_obligations_owed_escalate_column_drift.sql
-- SD-LEO-FIX-SMS-OUTBOUND-WORKER-002
--
-- ONE-WAY IN PRACTICE: safe to run ONLY while no row has status='owed_escalate' or a non-empty
-- prior_provider_message_ids -- narrowing the CHECK back or dropping the column while such a row
-- exists is destructive (the CHECK-narrow will simply fail with a constraint-violation on
-- COMMIT; the DROP COLUMN would silently discard prior_provider_message_ids data). The pre-flight
-- guard below refuses to proceed rather than let either happen silently.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sms_outbound_obligations WHERE status = 'owed_escalate') THEN
    RAISE EXCEPTION 'REFUSING ROLLBACK: at least one row has status=owed_escalate -- narrowing the CHECK would make that row unrepresentable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sms_outbound_obligations WHERE array_length(prior_provider_message_ids, 1) > 0) THEN
    RAISE EXCEPTION 'REFUSING ROLLBACK: at least one row has a non-empty prior_provider_message_ids -- dropping the column would discard that data';
  END IF;
END
$preflight$;

ALTER TABLE public.sms_outbound_obligations
  DROP CONSTRAINT sms_outbound_obligations_status_check;

ALTER TABLE public.sms_outbound_obligations
  ADD CONSTRAINT sms_outbound_obligations_status_check
  CHECK (status IN ('owed','sending','sent','delivered','undelivered','failed','canceled'));

ALTER TABLE public.sms_outbound_obligations
  DROP COLUMN prior_provider_message_ids;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_outbound_obligations' AND column_name = 'prior_provider_message_ids'
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: prior_provider_message_ids still exists after DOWN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sms_outbound_obligations'::regclass
      AND conname = 'sms_outbound_obligations_status_check'
      AND pg_get_constraintdef(oid) LIKE '%owed_escalate%'
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: sms_outbound_obligations_status_check still admits owed_escalate after DOWN';
  END IF;

  RAISE NOTICE 'sms_outbound_obligations owed_escalate/prior_provider_message_ids DOWN verified';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
