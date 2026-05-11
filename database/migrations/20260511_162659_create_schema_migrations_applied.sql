-- =============================================================================
-- Migration: create public.schema_migrations_applied + audit RPC
-- SD: SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001
-- FR: FR-6 (bootstrap audit table for canonical apply-migration.js)
-- Generated: 2026-05-11
--
-- Purpose: Audit table written to by the canonical apply-migration.js. Records
--   migration applies AND token issuances (one-time-use confirmation tokens for
--   prod_deploy=true applies). Append-only (BEFORE UPDATE/DELETE trigger),
--   service_role only on the raw table, with a redacted public-read SECURITY
--   DEFINER function for authenticated read access.
--
-- All DDL is idempotent: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS+CREATE.
-- Applied as a SINGLE client.query(sql) call — no statement splitter.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations_applied (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_path     text,
  migration_sha256   text,
  applied_by         text NOT NULL,
  applied_at         timestamptz NOT NULL DEFAULT now(),
  prod_deploy        boolean,
  dry_run            boolean,
  statement_count    int,
  object_diffs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  success            boolean,
  error              text,
  token_hash         text UNIQUE,
  token_issued_at    timestamptz,
  token_consumed_at  timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- 2. Row-shape CHECK constraint
--    Two valid shapes:
--      (a) Token-issuance row: path/sha256/prod_deploy/dry_run/success all NULL,
--          token_hash + token_issued_at both NOT NULL.
--      (b) Apply row: path/sha256/prod_deploy/dry_run/success all NOT NULL.
--    Add idempotently (drop-if-exists then add).
-- -----------------------------------------------------------------------------
ALTER TABLE public.schema_migrations_applied
  DROP CONSTRAINT IF EXISTS schema_migrations_applied_row_shape_chk;

ALTER TABLE public.schema_migrations_applied
  ADD CONSTRAINT schema_migrations_applied_row_shape_chk
  CHECK (
    (
      -- Token-issuance row
      migration_path   IS NULL
      AND migration_sha256 IS NULL
      AND prod_deploy      IS NULL
      AND dry_run          IS NULL
      AND success          IS NULL
      AND token_hash       IS NOT NULL
      AND token_issued_at  IS NOT NULL
    )
    OR
    (
      -- Apply row
      migration_path   IS NOT NULL
      AND migration_sha256 IS NOT NULL
      AND prod_deploy      IS NOT NULL
      AND dry_run          IS NOT NULL
      AND success          IS NOT NULL
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Indexes (3 explicit; PK index from PRIMARY KEY makes 4 total in pg_indexes)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS schema_migrations_applied_path_success_at_idx
  ON public.schema_migrations_applied (migration_path, success, applied_at DESC);

CREATE INDEX IF NOT EXISTS schema_migrations_applied_applied_at_idx
  ON public.schema_migrations_applied (applied_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_applied_sha256_success_uidx
  ON public.schema_migrations_applied (migration_sha256)
  WHERE success = true;

-- -----------------------------------------------------------------------------
-- 4. RLS — service_role only on raw table
-- -----------------------------------------------------------------------------
ALTER TABLE public.schema_migrations_applied ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON public.schema_migrations_applied;

CREATE POLICY schema_migrations_applied_service_role_only
  ON public.schema_migrations_applied
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated / anon get NOTHING on the raw table (no policy = no rows).

-- -----------------------------------------------------------------------------
-- 5. Append-only trigger function
--    - DELETE always raises 42501.
--    - UPDATE allowed ONLY when:
--        * OLD.token_consumed_at IS NULL
--        * NEW.token_consumed_at IS NOT NULL
--        * every other column is unchanged (ROW(...) IS NOT DISTINCT FROM ROW(...))
--    SECURITY DEFINER + SET search_path = '' (empty) per spec.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schema_migrations_applied_append_only_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'schema_migrations_applied is append-only; DELETE not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Reject if the row's token has already been consumed.
    IF OLD.token_consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'schema_migrations_applied row already has token_consumed_at set; further UPDATE not permitted'
        USING ERRCODE = '42501';
    END IF;

    -- Reject if NEW.token_consumed_at is NULL (no valid transition / reverting consumption).
    IF NEW.token_consumed_at IS NULL THEN
      RAISE EXCEPTION 'schema_migrations_applied UPDATE must set token_consumed_at to a non-NULL value'
        USING ERRCODE = '42501';
    END IF;

    -- Reject if ANY other column changed. Only token_consumed_at NULL->non-NULL is permitted.
    IF ROW(
         NEW.id, NEW.migration_path, NEW.migration_sha256, NEW.applied_by, NEW.applied_at,
         NEW.prod_deploy, NEW.dry_run, NEW.statement_count, NEW.object_diffs, NEW.success,
         NEW.error, NEW.token_hash, NEW.token_issued_at, NEW.metadata
       )
       IS DISTINCT FROM
       ROW(
         OLD.id, OLD.migration_path, OLD.migration_sha256, OLD.applied_by, OLD.applied_at,
         OLD.prod_deploy, OLD.dry_run, OLD.statement_count, OLD.object_diffs, OLD.success,
         OLD.error, OLD.token_hash, OLD.token_issued_at, OLD.metadata
       )
    THEN
      RAISE EXCEPTION 'schema_migrations_applied is append-only; only token_consumed_at NULL->non-NULL transition is permitted'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- Defensive: should not be reached given BEFORE UPDATE OR DELETE trigger.
  RETURN NEW;
END;
$$;

-- Trigger: BEFORE UPDATE OR DELETE, idempotent.
DROP TRIGGER IF EXISTS schema_migrations_applied_append_only_trigger
  ON public.schema_migrations_applied;

CREATE TRIGGER schema_migrations_applied_append_only_trigger
  BEFORE UPDATE OR DELETE
  ON public.schema_migrations_applied
  FOR EACH ROW
  EXECUTE FUNCTION public.schema_migrations_applied_append_only_fn();

-- -----------------------------------------------------------------------------
-- 6. Public read SECURITY DEFINER function (redacted view of apply rows)
--    Redacted: excludes applied_by (email), object_diffs (DDL), token_hash,
--    token_issued_at, token_consumed_at. Error truncated to 200 chars.
--    Filters out token-issuance rows (WHERE migration_path IS NOT NULL).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migration_audit_public_read(
  p_since   timestamptz,
  p_path    text,
  p_success boolean,
  p_limit   int
)
RETURNS TABLE (
  id               uuid,
  migration_path   text,
  migration_sha256 text,
  applied_at       timestamptz,
  prod_deploy      boolean,
  dry_run          boolean,
  statement_count  int,
  success          boolean,
  error_truncated  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.id,
    m.migration_path,
    m.migration_sha256,
    m.applied_at,
    m.prod_deploy,
    m.dry_run,
    m.statement_count,
    m.success,
    LEFT(m.error, 200) AS error_truncated
  FROM public.schema_migrations_applied m
  WHERE m.migration_path IS NOT NULL  -- exclude token-issuance rows
    AND (p_since   IS NULL OR m.applied_at     >= p_since)
    AND (p_path    IS NULL OR m.migration_path  = p_path)
    AND (p_success IS NULL OR m.success         = p_success)
  ORDER BY m.applied_at DESC
  LIMIT LEAST(COALESCE(p_limit, 1000), 1000);
$$;

REVOKE ALL ON FUNCTION public.migration_audit_public_read(timestamptz, text, boolean, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migration_audit_public_read(timestamptz, text, boolean, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Comments (hygiene)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.schema_migrations_applied IS
  'Append-only audit log for canonical apply-migration.js. Holds both apply rows (migration_path NOT NULL) and token-issuance rows (token_hash NOT NULL, all apply fields NULL). Service_role only on raw table; use migration_audit_public_read() for redacted public access. See SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 FR-6.';

COMMENT ON COLUMN public.schema_migrations_applied.token_hash IS
  'SHA-256 hash of a one-time-use confirmation token issued for prod_deploy=true applies. UNIQUE. NOT NULL on token-issuance rows; NULL on apply rows.';

COMMENT ON COLUMN public.schema_migrations_applied.object_diffs IS
  'JSONB array of object-level diffs (tables/functions/triggers/policies) the migration produced. Sensitive DDL — not exposed via migration_audit_public_read().';

COMMENT ON CONSTRAINT schema_migrations_applied_row_shape_chk
  ON public.schema_migrations_applied IS
  'Enforces two valid row shapes: token-issuance (token_hash+token_issued_at NOT NULL, all apply fields NULL) OR apply (path/sha256/prod_deploy/dry_run/success NOT NULL).';

COMMENT ON FUNCTION public.migration_audit_public_read(timestamptz, text, boolean, int) IS
  'Redacted public-read accessor for schema_migrations_applied. Excludes applied_by (email PII), object_diffs (potentially sensitive DDL), token_hash, token_issued_at, token_consumed_at. Error truncated to 200 chars. Filters out token-issuance rows. Capped at 1000 rows. SECURITY DEFINER with empty search_path; granted to authenticated + service_role only.';
