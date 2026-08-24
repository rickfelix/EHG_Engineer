-- @chairman-gated
-- @approved-by: Chairman, verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting presented by Adam 0549d739; scribe branch ceremony/20260824-sitting)
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: this file creates TRIGGERS on a live,
--   heavily-written table (leo_protocol_sections) plus REVOKE/GRANT statements -- both land it
--   in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2).
-- SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 (FR-1) -- leo_protocol_sections_history: a
-- LOG-ONLY (Phase A) audit trail for the entire live LEO protocol ruleset table.
--
-- ============================================================================
-- WHY THIS EXISTS.
--
-- leo_protocol_sections (the entire live LEO protocol ruleset, 286 rows) has no created_at,
-- no updated_at, and no wired audit trail -- the one table shaped like an audit log for this
-- ruleset, leo_protocol_changes, has 6 hand-scripted rows total across its entire history, none
-- triggered by an actual section write. An existing trigger, trg_doctrine_constraint_sections,
-- is confirmed BLIND for this table: it reads an actor-role session GUC (app.current_actor_role)
-- that no supabase-js/PostgREST caller can ever set, so its veto never fires. 18+ live writers
-- reach this table today -- one-off scripts (2 of which DELETE rows), raw migration SQL, and an
-- automated fleet-wide writer (scripts/modules/learning/improvement-appliers.js, which
-- auto-approves model-authored edits at a score threshold on every SD completion, with zero
-- human review) -- with zero attribution.
--
-- PHASE A ONLY: THIS MIGRATION NEVER BLOCKS A WRITE. LEAD-phase validation-agent/risk-agent
-- review found the original charter's plan to ship immediate BLOCKING enforcement (freeze/rate-
-- cap/self-approval) on day one would itself commit 2-3 new blind-guard defects and brick a
-- live, recurring chairman ceremony script (scripts/protocol/adam-contract-land.mjs, 0/286 rows
-- carry a provenance key today). Blocking enforcement (Phase B) is staged separately as a
-- chairman-decision proposal (FR-3), gated on a measured 14-day/100%-provenance-coverage
-- precondition read off THIS table -- it is not executed by this migration.
--
-- THREE TRIGGERS, NOT ONE, SHARING ONE FUNCTION. A change-scoped WHEN clause necessarily
-- references OLD (to compare against NEW), and OLD does not exist on INSERT -- just as NEW does
-- not exist on DELETE. Confirmed live via a Postgres 17.4 probe during EXEC (prospective
-- testing-agent evidence 1dec171a): a two-trigger split (INSERT-OR-UPDATE-with-WHEN + separate
-- DELETE) still throws 42P17 on the INSERT side. The only working shape is three trigger
-- DEFINITIONS -- AFTER INSERT (no WHEN), AFTER UPDATE (WHEN scoped to the 7 governed columns),
-- AFTER DELETE (no WHEN, OLD.* only) -- served by one shared function branching on TG_OP.
--
-- THE WHEN CLAUSE IS THE LOAD-BEARING PART OF THIS MIGRATION (same principle as
-- 20260802_sd_mutation_audit_trigger.sql). leo_protocol_sections has no retention machinery;
-- every row landed here is permanent. Scoped to content/title/section_type/order_index/
-- target_file/context_tier/priority -- the columns that decide WHAT a section says and WHERE it
-- governs -- and deliberately excludes metadata-only and scoring_*-only churn, so this table does
-- not fill with noise from sibling SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001's bulk
-- dedup/reclassification pass (same table, same day).
--
-- CHANNEL IS DERIVED, NEVER TRUSTED FROM THE CALLER. The trigger reads current_setting('role',
-- true) / current_user itself -- a PostgREST/service-role write presents role='service_role'; a
-- direct pooler/psql write presents current_user='postgres'. This mirrors FR-2's fix to the
-- SAME self-attestation risk in the application-layer sanitizer: metadata.provenance is
-- read-only evidence here, never a source of truth for WHO wrote the row.
--
-- PROVENANCE IS A SENTINEL, NOT A GUESS. 0/286 existing rows carry a provenance key. This
-- history table records provenance_status='present'/'missing' explicitly -- a write with no
-- metadata.provenance is HONESTLY logged as missing, not silently coerced into a fabricated
-- value (the same failure mode a naive Phase-B rate-cap or self-approval check would have
-- committed if built directly, per LEAD/EXEC-phase review).
--
-- METADATA KEY-DELTA closes a separate, real bug found mid-EXEC: scripts/protocol/
-- adam-contract-land.mjs's landCompanions() used to overwrite a row's entire metadata object on
-- every UPDATE with no spread/merge (fixed at the application layer in FR-2's companion
-- commit) -- recording which metadata keys were added/removed/changed on every UPDATE makes a
-- FUTURE instance of that same class of bug visible in the audit trail even if a writer
-- reintroduces it, rather than relying solely on code review to catch it again.
--
-- THIS HISTORY TABLE IS ITSELF APPEND-ONLY (mirrors 20260823_chairman_ratifications.sql's
-- ENABLE-ALWAYS-TRIGGER pattern, and its SECURITY finding M1: default ORIGIN-mode triggers are
-- suppressed by SET LOCAL session_replication_role='replica', measured live as allowed for the
-- postgres role this harness connects as -- an audit trigger a migration can disable in-band is
-- not an audit trigger). Unlike chairman_ratifications, this table has NO sanctioned mutation at
-- all after insert -- pure append-only, no encoding-transition exception.
--
-- Rollback: see 20260824_leo_protocol_sections_history_DOWN.sql
-- ============================================================================

BEGIN;

-- CREATE TRIGGER on leo_protocol_sections takes ACCESS EXCLUSIVE for the duration of this
-- statement. The fleet-wide /learn applier (scripts/modules/learning/improvement-appliers.js)
-- writes to this table on every SD completion -- fail fast rather than block an unbounded time
-- if a write is in flight when this migration applies.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.leo_protocol_sections_history (
  id                  BIGSERIAL PRIMARY KEY,
  section_id          INTEGER,        -- no FK: history must outlive a deleted section row
  operation           TEXT NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel             TEXT NOT NULL,
  provenance_status   TEXT NOT NULL,
  provenance          JSONB,
  section_type        TEXT,
  title               TEXT,
  old_value           JSONB,
  new_value           JSONB,
  metadata_key_delta  JSONB,

  CONSTRAINT lpsh_operation_valid CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  CONSTRAINT lpsh_channel_valid CHECK (channel IN ('service_role', 'postgres', 'unknown_channel')),
  CONSTRAINT lpsh_provenance_status_valid CHECK (provenance_status IN ('present', 'missing')),
  -- provenance_status and provenance move together: 'missing' <=> NULL, 'present' <=> NOT NULL.
  -- A 'present' row with NULL provenance (or vice versa) would be the same class of drift the
  -- history table exists to make visible elsewhere -- guard it structurally here too.
  CONSTRAINT lpsh_provenance_status_consistent CHECK (
    (provenance_status = 'missing' AND provenance IS NULL)
    OR (provenance_status = 'present' AND provenance IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS leo_protocol_sections_history_section_id_idx
  ON public.leo_protocol_sections_history (section_id, occurred_at);

CREATE INDEX IF NOT EXISTS leo_protocol_sections_history_provenance_status_idx
  ON public.leo_protocol_sections_history (provenance_status, occurred_at)
  WHERE provenance_status = 'missing';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER + pinned search_path on all 4 functions below (EXEC-phase security-agent
-- finding S-4): with the default SECURITY INVOKER, any future role granted write on
-- leo_protocol_sections without a matching grant on leo_protocol_sections_history would turn
-- "Phase A never blocks a write" into a hard 42501 block the moment that role fires the trigger.
-- Pinning search_path closes the classic mutable-search_path privilege-escalation risk that
-- SECURITY DEFINER would otherwise reopen.
--
-- THE SHARED TRIGGER FUNCTION. Branches on TG_OP before touching NEW (INSERT/UPDATE) vs OLD
-- (DELETE) to avoid the null-dereference each event's absent record would otherwise cause.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_leo_protocol_sections_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $hist$
DECLARE
  v_channel            TEXT;
  v_provenance         JSONB;
  v_provenance_status  TEXT;
  v_old_meta_keys      TEXT[];
  v_new_meta_keys      TEXT[];
  v_added              TEXT[];
  v_removed            TEXT[];
  v_common             TEXT[];
  v_changed            TEXT[] := ARRAY[]::TEXT[];
  k                    TEXT;
BEGIN
  -- Channel derivation: never trust caller-supplied metadata for WHO wrote this row (the exact
  -- self-attestation risk this SD's FR-2 also closes at the application layer).
  IF current_setting('role', true) = 'service_role' THEN
    v_channel := 'service_role';
  ELSIF current_user = 'postgres' THEN
    v_channel := 'postgres';
  ELSE
    v_channel := 'unknown_channel';
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.leo_protocol_sections_history
      (section_id, operation, channel, provenance_status, provenance, section_type, title, old_value, new_value, metadata_key_delta)
    VALUES (
      OLD.id, 'DELETE', v_channel, 'missing', NULL, OLD.section_type, OLD.title,
      jsonb_build_object(
        'content', OLD.content, 'title', OLD.title, 'section_type', OLD.section_type,
        'order_index', OLD.order_index, 'target_file', OLD.target_file,
        'context_tier', OLD.context_tier, 'priority', OLD.priority
      ),
      NULL, NULL
    );
    RETURN OLD;
  END IF;

  -- INSERT and UPDATE both have NEW; provenance is read from it identically in both branches.
  -- A JSONB SQL-null (`{"provenance": null}`) or a bare scalar is NOT "present" -- `x -> 'k'`
  -- returns the SQL value 'null'::jsonb (which IS NOT NULL by Postgres's own rules) for an
  -- explicit null, so both a NULLIF against 'null'::jsonb and a jsonb_typeof='object' check are
  -- required, or a caller could satisfy provenance_status='present' with no real provenance
  -- (PLAN_VERIFICATION validation-agent finding V-2 -- caught before this migration was ever
  -- applied, live-measured on Postgres 17.4: '{"provenance": null}'::jsonb -> 'provenance' IS
  -- NOT NULL evaluates true).
  v_provenance := NULLIF(NEW.metadata -> 'provenance', 'null'::jsonb);
  IF v_provenance IS NOT NULL AND jsonb_typeof(v_provenance) <> 'object' THEN
    v_provenance := NULL;
  END IF;
  v_provenance_status := CASE WHEN v_provenance IS NOT NULL THEN 'present' ELSE 'missing' END;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(array_agg(kk), ARRAY[]::TEXT[]) INTO v_new_meta_keys
      FROM jsonb_object_keys(COALESCE(NEW.metadata, '{}'::jsonb)) kk;

    INSERT INTO public.leo_protocol_sections_history
      (section_id, operation, channel, provenance_status, provenance, section_type, title, old_value, new_value, metadata_key_delta)
    VALUES (
      NEW.id, 'INSERT', v_channel, v_provenance_status, v_provenance, NEW.section_type, NEW.title,
      NULL,
      jsonb_build_object(
        'content', NEW.content, 'title', NEW.title, 'section_type', NEW.section_type,
        'order_index', NEW.order_index, 'target_file', NEW.target_file,
        'context_tier', NEW.context_tier, 'priority', NEW.priority
      ),
      jsonb_build_object('added', to_jsonb(v_new_meta_keys), 'removed', '[]'::jsonb, 'changed', '[]'::jsonb)
    );
    RETURN NEW;
  END IF;

  -- UPDATE: metadata key-delta between OLD.metadata and NEW.metadata.
  SELECT COALESCE(array_agg(kk), ARRAY[]::TEXT[]) INTO v_old_meta_keys
    FROM jsonb_object_keys(COALESCE(OLD.metadata, '{}'::jsonb)) kk;
  SELECT COALESCE(array_agg(kk), ARRAY[]::TEXT[]) INTO v_new_meta_keys
    FROM jsonb_object_keys(COALESCE(NEW.metadata, '{}'::jsonb)) kk;

  v_added   := ARRAY(SELECT unnest(v_new_meta_keys) EXCEPT SELECT unnest(v_old_meta_keys));
  v_removed := ARRAY(SELECT unnest(v_old_meta_keys) EXCEPT SELECT unnest(v_new_meta_keys));
  v_common  := ARRAY(SELECT unnest(v_new_meta_keys) INTERSECT SELECT unnest(v_old_meta_keys));

  FOREACH k IN ARRAY v_common LOOP
    IF (OLD.metadata -> k) IS DISTINCT FROM (NEW.metadata -> k) THEN
      v_changed := v_changed || k;
    END IF;
  END LOOP;

  INSERT INTO public.leo_protocol_sections_history
    (section_id, operation, channel, provenance_status, provenance, section_type, title, old_value, new_value, metadata_key_delta)
  VALUES (
    NEW.id, 'UPDATE', v_channel, v_provenance_status, v_provenance, NEW.section_type, NEW.title,
    jsonb_build_object(
      'content', OLD.content, 'title', OLD.title, 'section_type', OLD.section_type,
      'order_index', OLD.order_index, 'target_file', OLD.target_file,
      'context_tier', OLD.context_tier, 'priority', OLD.priority
    ),
    jsonb_build_object(
      'content', NEW.content, 'title', NEW.title, 'section_type', NEW.section_type,
      'order_index', NEW.order_index, 'target_file', NEW.target_file,
      'context_tier', NEW.context_tier, 'priority', NEW.priority
    ),
    jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'changed', to_jsonb(v_changed))
  );
  RETURN NEW;
END
$hist$;

COMMENT ON FUNCTION public.log_leo_protocol_sections_history() IS
  'SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 FR-1: Phase-A LOG-ONLY audit trail for '
  'leo_protocol_sections. Never blocks a write. Derives channel/provenance itself rather than '
  'trusting caller input; Phase-B blocking enforcement is a separate, later chairman decision '
  '(FR-3), not implemented here.';

-- CI's secdef-execute-revoke-lint requires an explicit REVOKE for every SECURITY DEFINER
-- function -- PUBLIC's default EXECUTE grant on a new function is otherwise inherited silently
-- by anon/authenticated. This function is invoked ONLY as a trigger (Postgres does not check the
-- EXECUTE permission for trigger firing), so no role needs a direct-call grant back.
REVOKE EXECUTE ON FUNCTION public.log_leo_protocol_sections_history() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THREE TRIGGER DEFINITIONS, ONE FUNCTION. See header for why a two-trigger split is rejected by
-- Postgres (42P17).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_insert ON public.leo_protocol_sections;
CREATE TRIGGER trg_leo_protocol_sections_history_insert
  AFTER INSERT ON public.leo_protocol_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_leo_protocol_sections_history();

DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_update ON public.leo_protocol_sections;
CREATE TRIGGER trg_leo_protocol_sections_history_update
  AFTER UPDATE ON public.leo_protocol_sections
  FOR EACH ROW
  WHEN (
    OLD.content IS DISTINCT FROM NEW.content
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.section_type IS DISTINCT FROM NEW.section_type
    OR OLD.order_index IS DISTINCT FROM NEW.order_index
    OR OLD.target_file IS DISTINCT FROM NEW.target_file
    OR OLD.context_tier IS DISTINCT FROM NEW.context_tier
    OR OLD.priority IS DISTINCT FROM NEW.priority
  )
  EXECUTE FUNCTION public.log_leo_protocol_sections_history();

DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_delete ON public.leo_protocol_sections;
CREATE TRIGGER trg_leo_protocol_sections_history_delete
  AFTER DELETE ON public.leo_protocol_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_leo_protocol_sections_history();

-- Same SECURITY finding M1 rationale as chairman_ratifications: ALWAYS-mode fires under
-- session_replication_role='replica' too, closing the in-band-disable gap ORIGIN-mode leaves.
ALTER TABLE public.leo_protocol_sections ENABLE ALWAYS TRIGGER trg_leo_protocol_sections_history_insert;
ALTER TABLE public.leo_protocol_sections ENABLE ALWAYS TRIGGER trg_leo_protocol_sections_history_update;
ALTER TABLE public.leo_protocol_sections ENABLE ALWAYS TRIGGER trg_leo_protocol_sections_history_delete;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE HISTORY TABLE ITSELF IS APPEND-ONLY. No sanctioned mutation at all (unlike
-- chairman_ratifications' one NULL->encoded exception) -- once a history row lands, it is final.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leo_protocol_sections_history_no_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $nu$
BEGIN
  RAISE EXCEPTION 'leo_protocol_sections_history is append-only: row % cannot be updated.', OLD.id;
END
$nu$;
REVOKE EXECUTE ON FUNCTION public.leo_protocol_sections_history_no_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_update_trg ON public.leo_protocol_sections_history;
CREATE TRIGGER leo_protocol_sections_history_no_update_trg
  BEFORE UPDATE ON public.leo_protocol_sections_history
  FOR EACH ROW EXECUTE FUNCTION public.leo_protocol_sections_history_no_update();

CREATE OR REPLACE FUNCTION public.leo_protocol_sections_history_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $nd$
BEGIN
  RAISE EXCEPTION 'leo_protocol_sections_history is append-only: row % cannot be deleted.', OLD.id;
END
$nd$;
REVOKE EXECUTE ON FUNCTION public.leo_protocol_sections_history_no_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_delete_trg ON public.leo_protocol_sections_history;
CREATE TRIGGER leo_protocol_sections_history_no_delete_trg
  BEFORE DELETE ON public.leo_protocol_sections_history
  FOR EACH ROW EXECUTE FUNCTION public.leo_protocol_sections_history_no_delete();

CREATE OR REPLACE FUNCTION public.leo_protocol_sections_history_no_truncate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $nt$
BEGIN
  RAISE EXCEPTION 'leo_protocol_sections_history is append-only: TRUNCATE is not permitted.';
END
$nt$;
REVOKE EXECUTE ON FUNCTION public.leo_protocol_sections_history_no_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_truncate_trg ON public.leo_protocol_sections_history;
CREATE TRIGGER leo_protocol_sections_history_no_truncate_trg
  BEFORE TRUNCATE ON public.leo_protocol_sections_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.leo_protocol_sections_history_no_truncate();

ALTER TABLE public.leo_protocol_sections_history ENABLE ALWAYS TRIGGER leo_protocol_sections_history_no_update_trg;
ALTER TABLE public.leo_protocol_sections_history ENABLE ALWAYS TRIGGER leo_protocol_sections_history_no_delete_trg;
ALTER TABLE public.leo_protocol_sections_history ENABLE ALWAYS TRIGGER leo_protocol_sections_history_no_truncate_trg;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. Same rationale as chairman_ratifications: pg_default_acl grants anon/authenticated
-- arwdDxtm on every new public-schema table by default.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leo_protocol_sections_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leo_protocol_sections_history_service_role ON public.leo_protocol_sections_history;
CREATE POLICY leo_protocol_sections_history_service_role
  ON public.leo_protocol_sections_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.leo_protocol_sections_history FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.leo_protocol_sections_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.leo_protocol_sections_history_id_seq TO service_role;

COMMENT ON TABLE public.leo_protocol_sections_history IS
  'SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 FR-1. Phase-A LOG-ONLY audit trail for '
  'leo_protocol_sections, written exclusively by the trg_leo_protocol_sections_history_* '
  'triggers -- never a hand-authored INSERT. Append-only (no UPDATE/DELETE/TRUNCATE). '
  'provenance_status=''missing'' is the honest, expected state for most rows today (0/286 '
  'pre-existing writers carry a provenance key); Phase B (blocking enforcement) is a separate, '
  'later chairman decision (FR-3), not implemented by this migration.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof of the 'postgres'-channel branch (this DO block itself runs as the
-- direct connection the migration applies through). The 'service_role'/PostgREST channel branch
-- is proven separately by 20260824_leo_protocol_sections_history_dry_run.mjs, which cannot share
-- a transaction with this DO block (a REST call is a different connection and auto-commits).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  probe_protocol_id TEXT;
  probe_section_id  INTEGER;
  history_count     INTEGER;
  h                 RECORD;
BEGIN
  ASSERT to_regclass('public.leo_protocol_sections_history') IS NOT NULL,
    'leo_protocol_sections_history table did not land';

  SELECT protocol_id INTO probe_protocol_id FROM public.leo_protocol_sections LIMIT 1;
  IF probe_protocol_id IS NULL THEN
    RAISE EXCEPTION 'verify: could not find any existing protocol_id to attach a probe section to';
  END IF;

  BEGIN
    -- INSERT (no provenance) -- expect provenance_status='missing', channel='postgres'.
    INSERT INTO public.leo_protocol_sections
      (protocol_id, section_type, title, content, order_index, metadata)
    VALUES (probe_protocol_id, 'verify_probe', 'FR-1 verify probe', 'probe content', 999999, '{}'::jsonb)
    RETURNING id INTO probe_section_id;

    SELECT * INTO h FROM public.leo_protocol_sections_history
      WHERE section_id = probe_section_id AND operation = 'INSERT' ORDER BY id DESC LIMIT 1;
    IF h.id IS NULL THEN
      RAISE EXCEPTION 'GUARD DID NOT FIRE -- no history row for the probe INSERT.' USING ERRCODE = 'P0101';
    END IF;
    IF h.channel <> 'postgres' OR h.provenance_status <> 'missing' OR h.provenance IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT history row has wrong shape: channel=%, provenance_status=%, provenance=%',
        h.channel, h.provenance_status, h.provenance USING ERRCODE = 'P0102';
    END IF;

    -- UPDATE a governed column WITH provenance -- expect provenance_status='present', a
    -- metadata_key_delta showing 'provenance' added, and Phase A still does not block.
    UPDATE public.leo_protocol_sections
      SET content = 'probe content v2', metadata = jsonb_build_object('provenance', jsonb_build_object('sd_key', 'SD-VERIFY-PROBE', 'actor_type', 'sd', 'actor_id', 'SD-VERIFY-PROBE'))
      WHERE id = probe_section_id;

    SELECT * INTO h FROM public.leo_protocol_sections_history
      WHERE section_id = probe_section_id AND operation = 'UPDATE' ORDER BY id DESC LIMIT 1;
    IF h.id IS NULL THEN
      RAISE EXCEPTION 'GUARD DID NOT FIRE -- no history row for the probe content UPDATE.' USING ERRCODE = 'P0103';
    END IF;
    IF h.provenance_status <> 'present' OR h.provenance ->> 'sd_key' <> 'SD-VERIFY-PROBE' THEN
      RAISE EXCEPTION 'UPDATE history row did not record provenance correctly: status=%, provenance=%',
        h.provenance_status, h.provenance USING ERRCODE = 'P0104';
    END IF;
    IF NOT (h.metadata_key_delta -> 'added' ? 'provenance') THEN
      RAISE EXCEPTION 'UPDATE history row metadata_key_delta did not record the added provenance key: %',
        h.metadata_key_delta USING ERRCODE = 'P0105';
    END IF;

    -- UPDATE a governed column, OVERWRITING that real provenance with a JSONB-null -- expect
    -- provenance_status to revert to 'missing' (validation-agent finding V-2:
    -- `metadata->'provenance'` on an explicit JSON null returns 'null'::jsonb, which IS NOT NULL
    -- by Postgres's own rules -- a naive `IS NOT NULL` check would have let this count as
    -- 'present' with no real provenance, silently defeating the honest-sentinel design).
    UPDATE public.leo_protocol_sections
      SET content = 'probe content v3', metadata = jsonb_build_object('provenance', 'null'::jsonb)
      WHERE id = probe_section_id;

    SELECT * INTO h FROM public.leo_protocol_sections_history
      WHERE section_id = probe_section_id AND operation = 'UPDATE' ORDER BY id DESC LIMIT 1;
    IF h.provenance_status <> 'missing' OR h.provenance IS NOT NULL THEN
      RAISE EXCEPTION 'JSONB-null provenance was not treated as missing: status=%, provenance=%',
        h.provenance_status, h.provenance USING ERRCODE = 'P0110';
    END IF;

    -- Metadata-ONLY UPDATE (no governed-column change) -- expect NO new history row (the WHEN
    -- clause's suppression, the exact property this SD's own charter requires).
    SELECT count(*) INTO history_count FROM public.leo_protocol_sections_history WHERE section_id = probe_section_id;
    UPDATE public.leo_protocol_sections
      SET metadata = jsonb_build_object('unrelated_key', 'noise')
      WHERE id = probe_section_id;
    PERFORM 1 FROM public.leo_protocol_sections_history WHERE section_id = probe_section_id;
    IF (SELECT count(*) FROM public.leo_protocol_sections_history WHERE section_id = probe_section_id) <> history_count THEN
      RAISE EXCEPTION 'GUARD FIRED ON A METADATA-ONLY UPDATE -- the WHEN clause suppression is broken.'
        USING ERRCODE = 'P0106';
    END IF;

    -- DELETE -- expect a history row via the separate DELETE trigger, using OLD.* only.
    DELETE FROM public.leo_protocol_sections WHERE id = probe_section_id;
    SELECT * INTO h FROM public.leo_protocol_sections_history
      WHERE section_id = probe_section_id AND operation = 'DELETE' ORDER BY id DESC LIMIT 1;
    IF h.id IS NULL THEN
      RAISE EXCEPTION 'GUARD DID NOT FIRE -- no history row for the probe DELETE.' USING ERRCODE = 'P0107';
    END IF;

    -- Append-only guard on the history table itself.
    BEGIN
      UPDATE public.leo_protocol_sections_history SET channel = 'tampered' WHERE id = h.id;
      RAISE EXCEPTION 'GUARD DID NOT FIRE -- an UPDATE to leo_protocol_sections_history was ACCEPTED.' USING ERRCODE = 'P0108';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the append-only trigger's own P0001 rejection)
    END;

    BEGIN
      DELETE FROM public.leo_protocol_sections_history WHERE id = h.id;
      RAISE EXCEPTION 'GUARD DID NOT FIRE -- a DELETE against leo_protocol_sections_history was ACCEPTED.' USING ERRCODE = 'P0109';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected
    END;

    -- Deliberate cleanup abort: discards the probe row's history entirely (the history table is
    -- append-only, so nothing short of rolling back this nested block could remove it).
    RAISE EXCEPTION 'internal: discard verify-block probe rows (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL; -- expected, deliberate cleanup
  END;

  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema = 'public' AND table_name = 'leo_protocol_sections_history'
               AND grantee IN ('anon', 'authenticated', 'PUBLIC')) THEN
    RAISE EXCEPTION 'a non-service grant is present on leo_protocol_sections_history -- must not be reachable by anon or authenticated.';
  END IF;

  RAISE NOTICE 'leo_protocol_sections_history verified: table + 3 triggers + append-only guards + posture all present and correct';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260824_leo_protocol_sections_history_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates triggers on a
-- live table plus REVOKE/GRANT):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_leo_protocol_sections_history.sql" \
--     --prod-deploy --allow-any-path
--   RECOMMENDED: apply during a quiet window relative to the /learn applier's write cadence,
--   given CREATE TRIGGER's ACCESS EXCLUSIVE lock and the SET LOCAL lock_timeout='5s' above.
--
-- VERIFY (run after apply):
--   node database/chairman-gated/20260824_leo_protocol_sections_history_dry_run.mjs
--   -- proves the service_role/PostgREST channel branch, which the in-migration DO $verify$
--   -- block above cannot exercise (a REST call is a separate connection).
-- ============================================================================
