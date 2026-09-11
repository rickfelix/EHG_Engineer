-- database/chairman-gated/20260911_chairman_ratification_verifications.sql
-- @chairman-gated
-- @approved-by: PENDING -- chairman must replace this with their git config user.email + issue a
--   token before apply. The ENFORCED gate is the absence of a line matching
--   scripts/lib/migration-guards.js APPROVED_BY_RE; the '@chairman-gated' tag is the ceremony
--   marker the README reads. TIER-2 by measurement, not assumption: scripts/lib/
--   migration-tier-classifier.mjs FORBIDDEN_TOPLEVEL = /(DROP|TRUNCATE|DELETE|UPDATE|RENAME|
--   GRANT|REVOKE|CLUSTER|REINDEX|REFRESH|VACUUM|ANALYZE|COPY|CALL|LISTEN|NOTIFY|IMPORT|MERGE|
--   LOCK|DO)/i -- this file hits DROP (DROP TRIGGER IF EXISTS), GRANT and REVOKE. TIER-2 on
--   those alone; there is deliberately NO inline DO $verify$ block in this file (SECURITY finding
--   S1, EXEC-TO-PLAN evidence f4ae9adf, corrected here) -- migration-shape tests assert the SQL
--   text only (existential, not behavioural). A behavioural proof of the four guards (INSERT
--   accepted, UPDATE/DELETE/TRUNCATE rejected, the backfill idempotency index enforced, a second
--   live_encode row for the same target accepted) has NOT been run against a live database as of
--   this commit and should be done once, by hand or via a short throwaway script, immediately
--   after the chairman's apply ceremony and before the FR-4 backfill is run --apply.
-- SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3)
--
-- MODELLED ON: database/chairman-gated/20260821_solomon_ledger_attestations.sql (the pure
-- INSERT-ONLY precedent: unconditional-raise freeze trigger + no-delete + no-truncate, RLS with a
-- single service_role policy, REVOKE ALL from anon/authenticated/PUBLIC, and a UNIQUE business key
-- so a re-run insert cannot duplicate) and on its sibling 20260823_chairman_ratifications.sql
-- (ENABLE ALWAYS on every guard -- SECURITY finding M1: default ORIGIN-mode triggers are
-- suppressed by `SET LOCAL session_replication_role='replica'`, measured ALLOWED for the
-- `postgres` role this harness connects as).
--
-- WHY TRIGGERS AND NOT GRANTS ALONE. The threat model named in the precedent's own header is
-- service_role (rolbypassrls = true, so RLS does not bind it) and the `postgres` role the harness
-- connects as (table owner -- grants are not usefully revocable against the owner). Privilege
-- grants therefore CANNOT make a table insert-only in this codebase; only triggers can.
--
-- THIS TABLE WILL NOT EXIST UNTIL THE CHAIRMAN APPLIES IT. Every reader/writer in this SD (see
-- lib/chairman/ratification-verification-store.mjs) degrades gracefully on 42P01/PGRST205 --
-- recording a verdict is advisory infrastructure and must never block or falsify the encode
-- decision it merely describes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.chairman_ratification_verifications (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE RESTRICT, NOT CASCADE (deliberate departure from the house child-table default).
  -- The parent's no-delete trigger already blocks deletion, so cascade behaviour is unreachable
  -- today -- but an FK action and a BEFORE DELETE trigger are DIFFERENT machinery, and the
  -- parent's _DOWN.sql drops those triggers. RESTRICT makes these audit rows a second,
  -- independent obstacle instead of collateral damage. RESTRICT rather than the NO ACTION default
  -- because NO ACTION is deferrable to end-of-transaction while RESTRICT is checked immediately.
  -- The FK also independently blocks `TRUNCATE chairman_ratifications` (a referenced table cannot
  -- be truncated without CASCADE) -- a second guard on the same operation the parent's
  -- statement-level trigger covers.
  target_ratification_id  UUID NOT NULL
    REFERENCES public.chairman_ratifications(id) ON DELETE RESTRICT ON UPDATE RESTRICT,

  -- WHAT PRODUCED THIS ROW. Kept orthogonal to `outcome` so a reader never has to parse a fused
  -- enum: (attempt_kind, outcome, encoded_at_persisted) is the full state space.
  attempt_kind            TEXT NOT NULL
    CHECK (attempt_kind IN ('live_encode', 'legacy_backfill_audit')),

  -- THE VERDICT.
  --   verified                    marker found at the pinned commit in every named contract
  --   marker_absent               checked and WRONG -- absent marker, stale render, or a
  --                               cross-target/multi-contract disagreement (the writer throws;
  --                               this is the durable record of what it threw about)
  --   no_commit_pin               no commit derivable -> this SD's refusal (encode NOT persisted)
  --   unverifiable_infrastructure could not check (no manifest / unreadable file / probe down /
  --                               nothing readable at the pin). Inherited FAIL-OPEN, see below.
  --   not_applicable              the encoded_ref shape has no rendered file at all
  --                               (sd_row / venture_metadata / memory_marker)
  outcome                 TEXT NOT NULL
    CHECK (outcome IN ('verified', 'marker_absent', 'no_commit_pin',
                       'unverifiable_infrastructure', 'not_applicable')),

  -- Did chairman_ratifications.encoded_at actually get written on this attempt? A FACT, not a
  -- derivation of `outcome` -- see the crv_* invariants for the only two cases it is constrained.
  encoded_at_persisted    BOOLEAN NOT NULL,

  -- Literal TIER values from lib/chairman/pinned-contract-read.mjs TIER (lines 60-64). NULL only
  -- for outcome='not_applicable', where no tier question was asked -- writing 'db_section_content'
  -- there would be a correct-looking field answering a different question.
  pin_tier                TEXT
    CHECK (pin_tier IS NULL OR pin_tier IN
           ('exact_commit_pin', 'approximate_encoded_at_pin', 'db_section_content')),

  commit_sha              TEXT,     -- the pin actually read at; NULL iff tier 3 / not_applicable
  target_file             TEXT,     -- repo-relative path the marker was sought in
  file_sha256             TEXT,     -- sha256(utf8) of the content actually read
  -- JS String.prototype.indexOf index into that content: a UTF-16 CODE-UNIT offset, NOT a byte
  -- offset and NOT a line number. Named here because a future non-JS reader would otherwise
  -- silently mis-slice multibyte content.
  marker_offset           INTEGER,

  -- WHAT WAS BEING CLAIMED. On a refusal the parent row keeps encoded_ref/marker_text NULL
  -- forever, so this attempt row is the ONLY record of what the encode was going to assert.
  attempted_encoded_ref   JSONB NOT NULL,
  attempted_marker_text   TEXT NOT NULL,
  marker_sha256           TEXT NOT NULL,  -- sha256(utf8) of the trimmed attempted_marker_text

  -- Non-verified rows must say why, in a queryable column rather than only inside `detail`.
  reason                  TEXT,

  -- GATE-EVIDENCE PROVENANCE (chairman ratification 6c263823): producer, run identifier, content
  -- hash. producer is a CODE PATH, so the solomon_ledger_attestations identity DENYLIST is
  -- deliberately NOT copied here -- it bans 'script', 'process', 'claude', 'service_role', which
  -- are exactly the honest values for a code-path producer. It exists there to stop an
  -- unidentified HUMAN attester; there is no human attester on this table.
  producer                TEXT NOT NULL,
  run_id                  TEXT NOT NULL,
  detail                  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- full verifier verdict object

  -- DB-clock only, and unlike the precedent this is ENFORCED (crv_stamp_verified_at below), not
  -- merely defaulted: this table has no historical-date use case (even a legacy-row audit verdict
  -- is produced NOW), so the backdating hole the base migration documents as TESTING finding B2
  -- is closeable here at no cost.
  verified_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- SHAPE ------------------------------------------------------------------------------------
  CONSTRAINT crv_commit_sha_shape CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'),
  CONSTRAINT crv_file_sha256_shape CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT crv_marker_sha256_shape CHECK (marker_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT crv_marker_offset_nonneg CHECK (marker_offset IS NULL OR marker_offset >= 0),
  CONSTRAINT crv_attempted_encoded_ref_is_object
    CHECK (jsonb_typeof(attempted_encoded_ref) = 'object'),
  CONSTRAINT crv_detail_is_object CHECK (jsonb_typeof(detail) = 'object'),
  CONSTRAINT crv_attempted_marker_text_nonempty CHECK (btrim(attempted_marker_text) <> ''),
  CONSTRAINT crv_target_file_is_repo_relative CHECK (
    target_file IS NULL OR (
      btrim(target_file) <> ''
      AND target_file !~ '^([A-Za-z]:)?[\\/]'       -- no absolute path, no drive letter
      AND position('..' in target_file) = 0         -- no traversal
    )
  ),
  CONSTRAINT crv_producer_shape CHECK (btrim(producer) <> '' AND length(btrim(producer)) >= 8),
  CONSTRAINT crv_run_id_shape CHECK (btrim(run_id) <> '' AND length(btrim(run_id)) >= 6),

  -- INTERNAL AGREEMENT -----------------------------------------------------------------------
  -- tier 3 <-> no commit, both directions, so a row can never claim a tier it did not read at.
  CONSTRAINT crv_commit_sha_tier_agreement CHECK (
    (pin_tier IS NULL AND commit_sha IS NULL)
    OR (pin_tier IS NOT NULL AND ((pin_tier = 'db_section_content') = (commit_sha IS NULL)))
  ),
  -- NULL pin_tier is legitimate for TWO outcomes, not just one: 'not_applicable' (an encoded_ref
  -- shape with no rendered file -- no tier question was ever asked) AND
  -- 'unverifiable_infrastructure' when the writer never got as far as resolving a pin at all (no
  -- manifest, or the section is unknown to it) -- pin resolution needs a target_file, which these
  -- two cases never obtain. TESTING (EXEC-TO-PLAN, evidence f3c383cf) measured that requiring
  -- pin_tier non-null for every 'unverifiable_infrastructure' row rejects a real, reachable writer
  -- output (178 of 288 manifest sections carry target_file:null) with a 23514 the recorder then
  -- silently swallows as a degrade -- the opposite of this table's purpose. verified/marker_absent/
  -- no_commit_pin still REQUIRE a resolved tier (pin resolution always ran before any of those
  -- three outcomes could be reached).
  CONSTRAINT crv_tier_null_only_for_uncheckable_outcomes CHECK (
    pin_tier IS NOT NULL OR outcome IN ('not_applicable', 'unverifiable_infrastructure')
  ),
  CONSTRAINT crv_no_commit_pin_is_tier3
    CHECK (outcome <> 'no_commit_pin' OR pin_tier = 'db_section_content'),
  CONSTRAINT crv_marker_offset_requires_a_read CHECK (
    marker_offset IS NULL
    OR (commit_sha IS NOT NULL AND target_file IS NOT NULL AND file_sha256 IS NOT NULL)
  ),
  -- A 'verified' verdict must carry the four things that make it re-checkable by a third party.
  CONSTRAINT crv_verified_requires_pin_evidence CHECK (
    outcome <> 'verified'
    OR (commit_sha IS NOT NULL AND target_file IS NOT NULL
        AND file_sha256 IS NOT NULL AND marker_offset IS NOT NULL)
  ),
  CONSTRAINT crv_nonverified_has_reason CHECK (
    outcome = 'verified' OR btrim(coalesce(reason, '')) <> ''
  ),

  -- THE TWO REFUSAL INVARIANTS (this SD's actual fix, made DB-enforced) ----------------------
  -- NOTE what is deliberately NOT constrained: 'verified' does NOT imply encoded_at_persisted.
  -- markRatificationEncoded's UPDATE carries `.is('encoded_at', null)`, so a concurrent session
  -- that encoded first makes affected=0 -- "verified but not persisted" is a REAL state and
  -- forcing true would make the writer lie. 'unverifiable_infrastructure' is likewise
  -- unconstrained: the fail-open on infra trouble is inherited, deliberate and documented
  -- (QF-20260901-107 / ratification-writer.mjs) -- it can legitimately persist.
  CONSTRAINT crv_no_commit_pin_never_persisted CHECK (
    attempt_kind <> 'live_encode' OR outcome <> 'no_commit_pin' OR encoded_at_persisted = false
  ),
  CONSTRAINT crv_marker_absent_never_persisted CHECK (
    attempt_kind <> 'live_encode' OR outcome <> 'marker_absent' OR encoded_at_persisted = false
  ),
  -- The backfill only ever audits ALREADY-encoded rows; its own premise, enforced.
  CONSTRAINT crv_backfill_audits_encoded_rows_only CHECK (
    attempt_kind <> 'legacy_backfill_audit' OR encoded_at_persisted = true
  )
);

-- IDEMPOTENCY KEY FOR THE ONE-TIME BACKFILL ---------------------------------------------------
-- NATURAL key, no synthetic dedup column: ONE audit verdict per legacy ratification, by
-- construction. live_encode rows are DELIBERATELY NOT covered: each attempt is an EVENT, and a
-- uniqueness constraint over attempts would re-create the exact undercount this SD exists to close.
CREATE UNIQUE INDEX IF NOT EXISTS crv_one_backfill_audit_per_ratification
  ON public.chairman_ratification_verifications (target_ratification_id)
  WHERE attempt_kind = 'legacy_backfill_audit';

-- Primary read (latest verdict for a ratification) + the index the RESTRICT FK check needs
-- (Postgres does not index FK columns automatically).
CREATE INDEX IF NOT EXISTS crv_target_ratification_idx
  ON public.chairman_ratification_verifications (target_ratification_id, verified_at DESC);

-- Triage read: everything that is not a clean verified encode.
CREATE INDEX IF NOT EXISTS crv_not_verified_idx
  ON public.chairman_ratification_verifications (verified_at DESC)
  WHERE outcome <> 'verified';

-- INSERT-ONLY GUARDS (unconditional: there is NO sanctioned mutation on this table) -----------
CREATE OR REPLACE FUNCTION public.chairman_ratification_verifications_freeze()
RETURNS TRIGGER LANGUAGE plpgsql AS $freeze$
BEGIN
  RAISE EXCEPTION
    'chairman_ratification_verifications is INSERT-only: row % cannot be updated. A verification verdict records what was measured at one instant; editing it would make the audit trail unfalsifiable. Insert a new attempt row instead.',
    OLD.id;
END
$freeze$;

DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_update
  ON public.chairman_ratification_verifications;
CREATE TRIGGER chairman_ratification_verifications_no_update
  BEFORE UPDATE ON public.chairman_ratification_verifications
  FOR EACH ROW EXECUTE FUNCTION public.chairman_ratification_verifications_freeze();

CREATE OR REPLACE FUNCTION public.chairman_ratification_verifications_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'chairman_ratification_verifications is INSERT-only: row % cannot be deleted. Without this guard, delete-and-reinsert bypasses the update freeze entirely, and a second backfill pass could rewrite history as if it were new.',
    OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_delete_trg
  ON public.chairman_ratification_verifications;
CREATE TRIGGER chairman_ratification_verifications_no_delete_trg
  BEFORE DELETE ON public.chairman_ratification_verifications
  FOR EACH ROW EXECUTE FUNCTION public.chairman_ratification_verifications_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.chairman_ratification_verifications_no_truncate()
RETURNS TRIGGER LANGUAGE plpgsql AS $notrunc$
BEGIN
  RAISE EXCEPTION 'chairman_ratification_verifications is INSERT-only: TRUNCATE is not permitted. It would erase every encode-verification verdict with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_truncate_trg
  ON public.chairman_ratification_verifications;
CREATE TRIGGER chairman_ratification_verifications_no_truncate_trg
  BEFORE TRUNCATE ON public.chairman_ratification_verifications
  FOR EACH STATEMENT EXECUTE FUNCTION public.chairman_ratification_verifications_no_truncate();

-- DB-CLOCK STAMP, not a reject: closes the backdating hole the base migration documents as an
-- unenforced writer-discipline guarantee (TESTING finding B2). Overwrite rather than refuse, so no
-- honest caller is broken by supplying the field.
CREATE OR REPLACE FUNCTION public.chairman_ratification_verifications_stamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $stamp$
BEGIN
  NEW.verified_at := now();
  RETURN NEW;
END
$stamp$;

DROP TRIGGER IF EXISTS crv_stamp_verified_at ON public.chairman_ratification_verifications;
CREATE TRIGGER crv_stamp_verified_at
  BEFORE INSERT ON public.chairman_ratification_verifications
  FOR EACH ROW EXECUTE FUNCTION public.chairman_ratification_verifications_stamp();

-- ALWAYS-mode: ORIGIN-mode triggers are silently suppressed under
-- `SET LOCAL session_replication_role='replica'`, measured ALLOWED for the `postgres` role this
-- harness connects as (SECURITY finding M1 on the base migration). No logical-replication or
-- bulk-load case on this table needs that suppression.
ALTER TABLE public.chairman_ratification_verifications
  ENABLE ALWAYS TRIGGER chairman_ratification_verifications_no_update;
ALTER TABLE public.chairman_ratification_verifications
  ENABLE ALWAYS TRIGGER chairman_ratification_verifications_no_delete_trg;
ALTER TABLE public.chairman_ratification_verifications
  ENABLE ALWAYS TRIGGER chairman_ratification_verifications_no_truncate_trg;
ALTER TABLE public.chairman_ratification_verifications
  ENABLE ALWAYS TRIGGER crv_stamp_verified_at;

-- POSTURE (mirrors 20260823_chairman_ratifications.sql exactly) -------------------------------
-- pg_default_acl grants anon/authenticated arwdDxtm on every new public-schema table; RLS with no
-- policy blocks rows but the GRANT itself persists until revoked. No UI reads this table (DESIGN
-- sub-agent pass, PLAN phase) -- backend/service_role only.
ALTER TABLE public.chairman_ratification_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chairman_ratification_verifications_service_role
  ON public.chairman_ratification_verifications;
CREATE POLICY chairman_ratification_verifications_service_role
  ON public.chairman_ratification_verifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.chairman_ratification_verifications FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.chairman_ratification_verifications TO service_role;
-- No sequence grants needed: UUID PK (gen_random_uuid), not BIGSERIAL.

COMMENT ON TABLE public.chairman_ratification_verifications IS
  'SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001. INSERT-only sibling of '
  'chairman_ratifications: one row per ENCODE ATTEMPT (verified encode, refused no-pin attempt, '
  'a checked-and-wrong disagreement, or a legacy-row audit), carrying the commit pin actually '
  'read at, the content hash of what was read, the marker offset within it, and the pin_tier from '
  'lib/chairman/pinned-contract-read.mjs. The ONLY sanctioned write path is '
  'lib/chairman/ratification-verification-store.mjs -- never a hand-authored INSERT. '
  'Service-role only; no UI reads it.';

COMMENT ON COLUMN public.chairman_ratification_verifications.pin_tier IS
  'Literal TIER value from lib/chairman/pinned-contract-read.mjs (exact_commit_pin | '
  'approximate_encoded_at_pin | db_section_content). Tier 2 and 3 are materially WEAKER evidence '
  'than tier 1 and a reader cannot otherwise tell them apart. NULL only when outcome is '
  '''not_applicable'' (an encoded_ref shape with no rendered file), where no tier was resolved.';

COMMENT ON COLUMN public.chairman_ratification_verifications.marker_offset IS
  'UTF-16 code-unit index from JS String.prototype.indexOf into the content hashed as '
  'file_sha256. NOT a byte offset and NOT a line number.';

COMMENT ON COLUMN public.chairman_ratification_verifications.attempted_encoded_ref IS
  'What the encode was about to assert. On a refused attempt the parent row keeps encoded_ref '
  'NULL permanently, so this column is the only surviving record of the attempted claim.';

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260911_chairman_ratification_verifications_DOWN.sql (drop the 4 triggers,
--   then their 4 functions, then the policy, then the table; indexes go with the table).
--
-- APPLY (chairman ceremony; NOT worker/Adam-delegatable -- CREATE TRIGGER + REVOKE/GRANT + DO):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260911_chairman_ratification_verifications.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (after apply): SELECT count(*) FROM chairman_ratification_verifications; -- expect 0
--   until the backfill (scripts/one-off/backfill-ratification-verification-audit-20260911.mjs)
--   is run.
-- ============================================================================
