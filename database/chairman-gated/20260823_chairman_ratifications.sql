-- SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 (FR-1) -- chairman_ratifications: the
-- append-only ledger of chairman ratifications, with encoding-staleness tracking.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: this file creates TRIGGERS
--   (append-only guard) and REVOKE/GRANT statements -- both land it in
--   scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2), confirmed by
--   direct classifyMigration() execution during PLAN-phase VALIDATION.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS.
--
-- Chairman decision D4 (SMS 2026-08-23T02:39:33Z), ruling on consolidated evaluation packet
-- 783ac23f7f5: 7+ ratified-never-encoded specimens surfaced across three role contracts in one
-- week. The ENCODE-BEFORE-NEXT-USE rule had no enforcement mechanism and died with seat
-- rotations (specimens #1/#2 died exactly that way in the 08-22 restart) -- a ratification held
-- only in a session's own memory disappears when that session ends. This table makes a
-- ratification a durable DB row instead, and a staleness gauge (wired separately, FR-3) surfaces
-- any row left unencoded past 24h on the routine Adam/coordinator/Solomon quiet-ticks.
--
-- MODELLED ON: database/chairman-gated/20260821_solomon_ledger_attestations.sql (append-only
-- via BEFORE UPDATE/DELETE/TRUNCATE triggers naming service_role as the threat model -- RLS does
-- not bind service_role, rolbypassrls=true -- DB-clock-only timestamps at the writer layer, and
-- a behavioural, not merely existential, DO $verify$ block). DIFFERS from that precedent in one
-- load-bearing way: the append-only freeze here has exactly ONE sanctioned mutation path (the
-- NULL -> encoded transition on encoded_at/encoded_ref/marker_text), enforced by the trigger
-- function comparing every OTHER column for equality rather than rejecting all UPDATEs
-- unconditionally -- this table's whole purpose requires a row to transition state once, unlike
-- the precedent's pure attestation record which never changes after insert.
--
-- ratified_at is DB-clock DEFAULT now(), same as the precedent's computed_at -- but a DEFAULT
-- does not prevent a caller from supplying their own value at INSERT time (PLAN-phase TESTING
-- finding B2: the precedent's own "never writer-supplied" guarantee is enforced by writer
-- DISCIPLINE, not a DB constraint). The "DB-clock-only" guarantee for LIVE captures is therefore
-- enforced at the application layer (lib/chairman/ratification-writer.mjs's
-- recordChairmanRatification always omits ratified_at from its INSERT). A SEPARATE,
-- narrowly-scoped path (recordHistoricalRatification, used only by the FR-5 backfill script)
-- explicitly supplies a historical ratified_at, because backfilled specimens must carry their
-- TRUE historical dates or the ledger opens with falsified provenance.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.chairman_ratifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- DB-clock DEFAULT (see header) -- application layer enforces no-writer-supply for live
  -- captures; the FR-5 backfill path is the sole sanctioned exception.
  ratified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  quote             TEXT NOT NULL,
  source            TEXT NOT NULL,
  target_contracts  TEXT[] NOT NULL,
  scribe_seat       TEXT NOT NULL,

  -- NULL until the contract edit lands. encoded_ref and marker_text are populated TOGETHER with
  -- encoded_at by the single sanctioned encoding transition (markRatificationEncoded) -- the
  -- scribe only knows the final contract wording (marker_text) once encoding actually happens,
  -- not at ratification time.
  encoded_at        TIMESTAMPTZ,
  encoded_ref       JSONB,
  marker_text       TEXT,

  CONSTRAINT cr_quote_nonempty CHECK (btrim(quote) <> ''),
  CONSTRAINT cr_source_shape CHECK (btrim(source) <> '' AND length(btrim(source)) >= 5),
  CONSTRAINT cr_scribe_seat_nonempty CHECK (btrim(scribe_seat) <> ''),

  CONSTRAINT cr_target_contracts_valid CHECK (
    cardinality(target_contracts) > 0
    AND target_contracts <@ ARRAY['adam','coordinator','solomon','protocol']::text[]
  ),

  CONSTRAINT cr_encoded_ref_shape CHECK (
    encoded_ref IS NULL OR jsonb_typeof(encoded_ref) = 'object'
  ),

  -- The three encoding-transition columns move together, NULL or all-set -- never a partial
  -- state (e.g. encoded_at set but marker_text still NULL would make FR-4's grep assertion
  -- unrunnable for that row).
  CONSTRAINT cr_encoding_state_consistent CHECK (
    (encoded_at IS NULL AND encoded_ref IS NULL AND marker_text IS NULL)
    OR
    (encoded_at IS NOT NULL AND encoded_ref IS NOT NULL AND btrim(marker_text) <> '')
  )
);

CREATE INDEX IF NOT EXISTS chairman_ratifications_unencoded_idx
  ON public.chairman_ratifications (ratified_at)
  WHERE encoded_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY, with exactly ONE sanctioned mutation: the NULL -> encoded transition. Every other
-- column must be byte-identical between OLD and NEW for an UPDATE to be allowed to proceed.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chairman_ratifications_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  IF OLD.encoded_at IS NULL
     AND NEW.encoded_at IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.ratified_at = OLD.ratified_at
     AND NEW.quote = OLD.quote
     AND NEW.source = OLD.source
     AND NEW.target_contracts = OLD.target_contracts
     AND NEW.scribe_seat = OLD.scribe_seat
  THEN
    RETURN NEW; -- the one sanctioned mutation: NULL -> encoded
  END IF;

  RAISE EXCEPTION
    'chairman_ratifications is append-only: row % can only transition encoded_at/encoded_ref/marker_text from NULL to set, with every other column unchanged. Any other UPDATE (including a second re-encode) is rejected.',
    OLD.id;
END
$freeze$;

DROP TRIGGER IF EXISTS chairman_ratifications_no_update ON public.chairman_ratifications;
CREATE TRIGGER chairman_ratifications_no_update
  BEFORE UPDATE ON public.chairman_ratifications
  FOR EACH ROW EXECUTE FUNCTION public.chairman_ratifications_freeze();

CREATE OR REPLACE FUNCTION public.chairman_ratifications_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'chairman_ratifications is append-only: row % cannot be deleted. Without this guard, delete-and-reinsert bypasses the update freeze completely.',
    OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS chairman_ratifications_no_delete_trg ON public.chairman_ratifications;
CREATE TRIGGER chairman_ratifications_no_delete_trg
  BEFORE DELETE ON public.chairman_ratifications
  FOR EACH ROW EXECUTE FUNCTION public.chairman_ratifications_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.chairman_ratifications_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'chairman_ratifications is append-only: TRUNCATE is not permitted. It would erase the entire ratification ledger with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS chairman_ratifications_no_truncate_trg ON public.chairman_ratifications;
CREATE TRIGGER chairman_ratifications_no_truncate_trg
  BEFORE TRUNCATE ON public.chairman_ratifications
  FOR EACH STATEMENT EXECUTE FUNCTION public.chairman_ratifications_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. pg_default_acl grants anon/authenticated arwdDxtm on every new public-schema table by
-- default -- RLS-with-no-policy blocks rows, but the grant itself still exists until revoked.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.chairman_ratifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chairman_ratifications_service_role ON public.chairman_ratifications;
CREATE POLICY chairman_ratifications_service_role
  ON public.chairman_ratifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.chairman_ratifications FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.chairman_ratifications TO service_role;

COMMENT ON TABLE public.chairman_ratifications IS
  'SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001. Append-only ledger of chairman ratifications '
  'with encoding-staleness tracking. The ONLY sanctioned write path is '
  'lib/chairman/ratification-writer.mjs (recordChairmanRatification / recordHistoricalRatification '
  '/ markRatificationEncoded) -- never a hand-authored INSERT/UPDATE. Service-role only.';

COMMENT ON COLUMN public.chairman_ratifications.ratified_at IS
  'DB-clock DEFAULT for live captures (enforced at the writer layer, not by this DEFAULT alone -- '
  'a DEFAULT does not prevent caller override). The FR-5 backfill path is the sole sanctioned '
  'exception, supplying true historical dates via recordHistoricalRatification.';

COMMENT ON COLUMN public.chairman_ratifications.marker_text IS
  'The exact final contract wording, captured at ENCODING time (not ratification time) since '
  'only the scribe completing the encode knows the actual clause text. Used by FR-4 as the grep '
  'assertion target against live regenerated contract files.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof, not merely existential -- runs inside this DO block's implicit
-- subtransaction so nothing survives whether it passes or fails, and the table is append-only so
-- a row that DID land could never be cleaned up otherwise.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  truncate_was_blocked boolean := false;
  probe_id uuid;
BEGIN
  ASSERT to_regclass('public.chairman_ratifications') IS NOT NULL,
    'chairman_ratifications table did not land';

  -- Sanctioned transition + guard-rejection probes, wrapped in a nested block that deliberately
  -- aborts via a CUSTOM SQLSTATE at the end so the probe row is discarded -- the table is
  -- append-only, so a real DELETE (correctly rejected by the guard proved just below) could never
  -- clean it up; only an abort-and-rollback of this whole nested block can.
  BEGIN
    INSERT INTO public.chairman_ratifications (quote, source, target_contracts, scribe_seat)
    VALUES ('probe: verify sanctioned encode transition', 'terminal:probe-verify', ARRAY['adam'], 'probe-scribe')
    RETURNING id INTO probe_id;

    UPDATE public.chairman_ratifications
    SET encoded_at = now(), encoded_ref = '{"section_id":"probe"}'::jsonb, marker_text = 'probe marker'
    WHERE id = probe_id;

    IF NOT EXISTS (SELECT 1 FROM public.chairman_ratifications WHERE id = probe_id AND encoded_at IS NOT NULL) THEN
      RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- the sanctioned NULL->encoded transition was rejected.';
    END IF;

    -- A second re-encode attempt on the SAME row must now be rejected.
    --
    -- BUG FIX (TESTING finding D1, EXEC-phase adversarial review): a bare RAISE EXCEPTION
    -- defaults to SQLSTATE P0001 ('raise_exception') -- the SAME class the trigger's own
    -- rejection raises, and the SAME class the sibling `WHEN raise_exception THEN NULL`
    -- handler below catches. Without a distinct ERRCODE here, a broken guard (the UPDATE
    -- silently SUCCEEDS) would let this GUARD-DID-NOT-FIRE assertion fire, get caught by
    -- its own handler as if it were the expected trigger rejection, and report success.
    -- Exactly the trap this migration's header already names and the P0100 cleanup exit
    -- below already avoids -- this reapplies the same fix to the three assertions that
    -- were missed. Each assertion gets its OWN distinct code so a future failure is
    -- unambiguous about which probe tripped.
    BEGIN
      UPDATE public.chairman_ratifications
      SET encoded_at = now(), encoded_ref = '{"section_id":"probe2"}'::jsonb, marker_text = 'probe marker 2'
      WHERE id = probe_id;
      RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- a second re-encode UPDATE was ACCEPTED.' USING ERRCODE = 'P0102';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- An UPDATE touching a non-encoding column must be rejected. Same D1 fix as above.
    BEGIN
      UPDATE public.chairman_ratifications SET quote = 'tampered' WHERE id = probe_id;
      RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- a quote UPDATE was ACCEPTED.' USING ERRCODE = 'P0103';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- DELETE must be rejected. Same D1 fix as above.
    BEGIN
      DELETE FROM public.chairman_ratifications WHERE id = probe_id;
      RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- DELETE was ACCEPTED.' USING ERRCODE = 'P0104';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- Deliberate cleanup abort -- a custom SQLSTATE distinct from the generic 'raise_exception'
    -- class used above, so a genuine guard-proof failure can never be mistaken for this
    -- intentional, expected exit.
    RAISE EXCEPTION 'internal: discard verify-block probe row (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL; -- expected, deliberate cleanup -- probe row is now gone
  END;

  -- TRUNCATE gets the BEHAVIOURAL test via the boolean-flag pattern: row-level triggers don't
  -- fire for TRUNCATE at all, so this proves the statement-level trigger actually fires.
  BEGIN
    EXECUTE 'TRUNCATE public.chairman_ratifications';
  EXCEPTION
    WHEN raise_exception THEN truncate_was_blocked := true;
  END;
  IF NOT truncate_was_blocked THEN
    RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- TRUNCATE succeeded. The append-only guarantee is decorative; refusing to deploy.';
  END IF;

  -- target_contracts enum guard.
  BEGIN
    INSERT INTO public.chairman_ratifications (quote, source, target_contracts, scribe_seat)
    VALUES ('probe: invalid target', 'terminal:probe', ARRAY['not-a-real-contract'], 'probe-scribe');
    RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- an invalid target_contracts value was ACCEPTED.';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  -- Partial-encoding-state guard (encoded_at set but marker_text NULL must be impossible).
  BEGIN
    INSERT INTO public.chairman_ratifications (quote, source, target_contracts, scribe_seat, encoded_at, encoded_ref)
    VALUES ('probe: partial state', 'terminal:probe', ARRAY['adam'], 'probe-scribe', now(), '{"section_id":"x"}'::jsonb);
    RAISE EXCEPTION 'chairman_ratifications: GUARD DID NOT FIRE -- a partial encoding state (encoded_at set, marker_text NULL) was ACCEPTED.';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='chairman_ratifications'
               AND grantee IN ('anon','authenticated','PUBLIC')) THEN
    RAISE EXCEPTION 'chairman_ratifications: a non-service grant is present -- this table must not be reachable by anon or authenticated.';
  END IF;

  RAISE NOTICE 'chairman_ratifications verified: table + triggers + posture all present and correct';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260823_chairman_ratifications_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates triggers +
-- REVOKE/GRANT):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260823_chairman_ratifications.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT count(*) FROM chairman_ratifications; -- expect 0 (the verify-block probe row is
--     deliberately discarded during apply; FR-5's backfill script populates real rows separately)
-- ============================================================================
