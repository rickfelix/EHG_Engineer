-- ============================================================================
-- Migration: Create security_audit_events (Tier-3 Append-Only Audit Log)
-- SD: SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
-- Phase: PLAN-validated, EXEC-applied
-- Author: database-agent (PLAN retrospective on LEAD security-agent design)
-- ============================================================================
-- DESIGN NOTES:
--   * PG version: 17.4. pgcrypto + gen_random_uuid available; pg_partman NOT
--     installed -> vanilla monthly partitioning (RANGE on occurred_at).
--   * FK targets validated against actual schema:
--       ventures(id)                       = uuid
--       strategic_directives_v2(id)        = varchar(50)   (NOT uuid)
--       issue_patterns(pattern_id)         = varchar(50)   (NOT varchar(20))
--   * Immutability: dedicated trigger function modeled on
--     fn_stage_config_audit_immutable() (RAISE EXCEPTION). Service_role can
--     bypass via session GUC (audit.allow_purge=on) for retention purges only.
--   * RLS roles confirmed present: authenticated, service_role, anon.
--   * Idempotent: every CREATE uses IF NOT EXISTS or DO-block guard. Safe to
--     re-run.
-- ROLLBACK PLAN (manual, run with explicit ack):
--   BEGIN;
--     SET LOCAL "audit.allow_purge" = 'on';
--     DROP TABLE IF EXISTS public.security_audit_events CASCADE;
--     DROP FUNCTION IF EXISTS public.security_audit_events_immutable();
--     DROP FUNCTION IF EXISTS public.security_audit_events_create_partition(date);
--   COMMIT;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PARENT (PARTITIONED) TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid(),
  event_type               varchar(64)   NOT NULL,
  severity                 varchar(16)   NOT NULL,
  taxonomy_class           varchar(32)   NULL,
  venture_id               uuid          NULL,
  venture_name_input       text          NULL,
  venture_name_normalized  text          NULL,
  colliding_with_venture_id uuid         NULL,
  source_agent             varchar(64)   NOT NULL,
  source_module_path       text          NULL,
  correlation_id           uuid          NULL,
  session_id               uuid          NULL,
  sd_id                    varchar(50)   NULL,
  occurred_at              timestamptz   NOT NULL,
  detected_at              timestamptz   NOT NULL DEFAULT now(),
  event_payload            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  integrity_hash           text          NOT NULL,
  pat_pattern_id           varchar(50)   NULL,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  -- Composite PK includes partition key (PG requirement for partitioned tables)
  CONSTRAINT pk_security_audit_events PRIMARY KEY (id, occurred_at),
  CONSTRAINT chk_sae_event_type CHECK (event_type IN (
    'nfkd_collision',
    'port_isol_violation',
    'capability_suppression',
    'fail_closed_error'
  )),
  CONSTRAINT chk_sae_severity CHECK (severity IN ('info','warning','critical','tier3')),
  CONSTRAINT chk_sae_taxonomy CHECK (
    (event_type <> 'fail_closed_error') OR
    (taxonomy_class IN ('permanent','transient'))
  ),
  CONSTRAINT chk_sae_integrity_hash CHECK (length(integrity_hash) = 64)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE public.security_audit_events IS
  'Tier-3 append-only security audit log. Append-only via immutability trigger; '
  'service_role purges only via session GUC audit.allow_purge=on. Monthly partitions '
  '(vanilla RANGE; pg_partman not installed). RLS: service_role INSERT, authenticated SELECT, anon DENY.';

COMMENT ON COLUMN public.security_audit_events.venture_name_normalized IS
  'NFKD-normalized form of venture_name_input (NOT NFKC). Drives homoglyph collision detection.';
COMMENT ON COLUMN public.security_audit_events.taxonomy_class IS
  'Required iff event_type=fail_closed_error: permanent (NotRegistered) | transient (Unavailable).';
COMMENT ON COLUMN public.security_audit_events.sd_id IS
  'FK by value to strategic_directives_v2(id) [varchar(50)]. NOT enforced by FK constraint '
  'to allow inserts during SD lifecycle bursts; enforced by app-layer check + nightly audit.';
COMMENT ON COLUMN public.security_audit_events.pat_pattern_id IS
  'FK by value to issue_patterns(pattern_id) [varchar(50)]. e.g. PAT-PORT-ISOL-001.';
COMMENT ON COLUMN public.security_audit_events.integrity_hash IS
  'SHA-256 hex (64 chars) over canonical event tuple: '
  '(event_type, severity, occurred_at, source_agent, venture_id, sd_id, event_payload).';

-- ----------------------------------------------------------------------------
-- 2. FOREIGN KEYS
-- ----------------------------------------------------------------------------
-- ventures(id) FK is enforced (uuid -> uuid, ON DELETE SET NULL).
-- sd_id and pat_pattern_id are by-value (no FK enforcement, app-layer + audit).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sae_venture_id'
  ) THEN
    ALTER TABLE public.security_audit_events
      ADD CONSTRAINT fk_sae_venture_id
      FOREIGN KEY (venture_id)
      REFERENCES public.ventures(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. INDEXES (created on parent => propagate to all partitions)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sae_type_severity
  ON public.security_audit_events (event_type, severity);

CREATE INDEX IF NOT EXISTS idx_sae_occurred_at_desc
  ON public.security_audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_sae_venture_id
  ON public.security_audit_events (venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sae_correlation_id
  ON public.security_audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sae_pat_pattern_id
  ON public.security_audit_events (pat_pattern_id)
  WHERE pat_pattern_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. PARTITION CREATION HELPER (vanilla; replaces pg_partman)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_audit_events_create_partition(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    date := date_trunc('month', p_month)::date;
  v_end      date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_partname text := format('security_audit_events_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.security_audit_events ' ||
    'FOR VALUES FROM (%L) TO (%L);',
    v_partname, v_start::timestamptz, v_end::timestamptz
  );
END $$;

COMMENT ON FUNCTION public.security_audit_events_create_partition(date) IS
  'Creates a monthly partition. Idempotent. Run from cron (pg_cron or app scheduler) '
  'monthly to provision the next 3 months ahead.';

-- ----------------------------------------------------------------------------
-- 5. SEED PARTITIONS (current + next 12 months) - 13 months of capacity
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  i int;
  m date;
BEGIN
  FOR i IN 0..12 LOOP
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    PERFORM public.security_audit_events_create_partition(m);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. IMMUTABILITY TRIGGER (append-only enforcement)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service_role can bypass for retention purges by setting:
  --   SET LOCAL "audit.allow_purge" = 'on';
  IF current_setting('audit.allow_purge', true) = 'on'
     AND current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'security_audit_events is append-only. % is prohibited. '
    'Service_role retention purges require: SET LOCAL "audit.allow_purge" = ''on''.',
    TG_OP
    USING ERRCODE = '42501';
END $$;

-- Drop-and-recreate triggers (CREATE TRIGGER has no IF NOT EXISTS in PG 17)
DROP TRIGGER IF EXISTS trg_sae_immutable_update ON public.security_audit_events;
CREATE TRIGGER trg_sae_immutable_update
  BEFORE UPDATE ON public.security_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.security_audit_events_immutable();

DROP TRIGGER IF EXISTS trg_sae_immutable_delete ON public.security_audit_events;
CREATE TRIGGER trg_sae_immutable_delete
  BEFORE DELETE ON public.security_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.security_audit_events_immutable();

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sae_service_role_insert ON public.security_audit_events;
CREATE POLICY sae_service_role_insert
  ON public.security_audit_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS sae_service_role_all ON public.security_audit_events;
CREATE POLICY sae_service_role_all
  ON public.security_audit_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sae_authenticated_select ON public.security_audit_events;
CREATE POLICY sae_authenticated_select
  ON public.security_audit_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Explicit DENY for anon (defense-in-depth; no policy = deny by default with RLS on,
-- but stating it makes the contract reviewable).
DROP POLICY IF EXISTS sae_anon_deny ON public.security_audit_events;
CREATE POLICY sae_anon_deny
  ON public.security_audit_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.security_audit_events FROM PUBLIC, anon;
GRANT  SELECT ON public.security_audit_events TO authenticated;
GRANT  ALL    ON public.security_audit_events TO service_role;

COMMIT;

-- ============================================================================
-- POST-DEPLOY VERIFICATION (run separately):
--   SELECT count(*) FROM pg_policies WHERE tablename='security_audit_events'; -- expect 4
--   SELECT count(*) FROM pg_indexes  WHERE tablename='security_audit_events'; -- expect >=5
--   SELECT relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
--    WHERE i.inhparent='public.security_audit_events'::regclass; -- expect 13 partitions
-- ============================================================================
