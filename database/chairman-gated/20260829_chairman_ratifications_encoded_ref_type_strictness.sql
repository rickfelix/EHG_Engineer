-- @chairman-gated
-- @approved-by: PENDING — this migration has NOT yet been ratified/applied. Per
-- database/chairman-gated/README.md's two-invocation ceremony (--issue-token, then --prod-deploy
-- --allow-any-path), applying it requires a chairman-approved token and an -- @approved-by header
-- matching the approver's git config email. This SD ships the migration FILE as its FR-1/TR-2
-- deliverable; the apply ceremony itself is a separate, chairman-gated follow-up step, not
-- self-authorizable by the worker session that authored the fix.
-- SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (FR-1 / TR-2)
--
-- Widens cr_encoded_ref_shape from object-ness-only to also assert section_id is a STRING when
-- present. Live-measured bug (VALIDATION evidence a7ff2a22): 4 of 8 chairman_ratifications rows
-- currently store section_id as a NUMBER, which permanently blinds them to Stage-1 regression
-- detection (strict === comparison against always-string ids). The application-layer fix
-- (lib/chairman/ratification-writer.mjs markRatificationEncoded) now type-checks sectionId before
-- writing; this constraint is the DB-layer backstop against a future write path bypassing that
-- check.
--
-- TESTING FINDING (HIGH, evidence 21dc1450-8f9a-4722-8b56-c849537d695c): a plain `ADD CONSTRAINT
-- ... CHECK` validates ALL EXISTING ROWS by default -- Postgres does NOT limit a CHECK constraint
-- to new/updated rows unless told to. Live-measured: 4 of 8 (now 10) chairman_ratifications rows
-- currently violate this predicate (numeric section_id), so a plain ADD CONSTRAINT would FAIL
-- outright against the live table. `NOT VALID` is required: it skips the existing-row scan (still
-- enforces the predicate on every future INSERT/UPDATE, which is the actual goal here) without an
-- explicit VALIDATE CONSTRAINT pass -- exactly right, since those rows cannot be corrected anyway
-- (chairman_ratifications_freeze() blocks UPDATE while encoded_at IS NOT NULL, and all 4 already-
-- affected rows are already encoded).

ALTER TABLE chairman_ratifications
  DROP CONSTRAINT IF EXISTS cr_encoded_ref_shape;

ALTER TABLE chairman_ratifications
  ADD CONSTRAINT cr_encoded_ref_shape CHECK (
    encoded_ref IS NULL
    OR (
      jsonb_typeof(encoded_ref) = 'object'
      AND (
        NOT (encoded_ref ? 'section_id')
        OR jsonb_typeof(encoded_ref -> 'section_id') = 'string'
      )
    )
  ) NOT VALID;
