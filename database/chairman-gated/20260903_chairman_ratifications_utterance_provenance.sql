-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- database/chairman-gated/README.md's two-invocation ceremony (--issue-token, then --prod-deploy
-- --allow-any-path), applying it requires a chairman-approved token and an -- @approved-by header
-- matching the approver's git config email. This SD ships the migration FILE as its FR-1/FR-3
-- deliverable; the apply ceremony itself is a separate, chairman-gated step and is NOT
-- self-authorizable by the worker session that authored it.
-- SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D (FR-1 / FR-3)
--
-- WHAT THIS CLOSES. The ledger records when the DATABASE captured a ruling — ratified_at is a
-- DB-clock value set at insert time — but never records when the chairman actually SPOKE it, what
-- the quote verifiably was, or where the utterance can be found again. A row is therefore
-- unfalsifiable after the fact: nothing in it can be checked against a source, and a quote edited
-- later leaves no trace. Three columns fix that:
--   uttered_at    — the moment of utterance, deliberately DISTINCT from ratified_at's capture time
--   quote_hash    — content hash of the quote, so later tampering is detectable
--   transcript_ref— pointer back to the source utterance, so the claim can be re-checked
--
-- WHY `NOT VALID` AND NOT `SET NOT NULL`. This is the load-bearing decision in this file and it is
-- not a preference — SET NOT NULL is UNACHIEVABLE on this table:
--   1. A plain `ADD CONSTRAINT ... CHECK` validates ALL EXISTING ROWS by default. Postgres does not
--      limit a CHECK to new rows unless told to. All ~50 live rows have these columns NULL (the
--      columns do not exist yet), so a plain ADD CONSTRAINT would fail outright against the live
--      table.
--   2. The conventional remedy — backfill, then SET NOT NULL — cannot run here. The append-only
--      freeze trigger chairman_ratifications_freeze() (20260823_chairman_ratifications.sql:96-117)
--      REJECTS ANY UPDATE to a row once encoded_at IS NOT NULL, and 49 of ~50 live rows already
--      have encoded_at set (measured 2026-09-03). The backfill UPDATE would be refused row-by-row.
--   3. A migration containing a top-level UPDATE is FORBIDDEN_TOPLEVEL under
--      scripts/lib/migration-tier-classifier.mjs regardless, so that shape could not ship anyway.
-- `NOT VALID` skips the existing-row scan while still enforcing the predicate on every future
-- INSERT — which is the actual goal — and leaves the frozen historical rows alone. This mirrors
-- 20260829_chairman_ratifications_encoded_ref_type_strictness.sql:28-41, which hit this identical
-- wall for the same reason (4 of 10 rows violated its predicate and were permanently unfixable).
--
-- DO NOT "TIDY" THIS INTO A NOT NULL. It will not apply, and the reason is the freeze trigger, not
-- a stylistic choice. tests/unit/chairman/ratification-migration-shape.test.js asserts this shape.
--
-- DO NOT SPLIT THE COLUMNS AND THE CONSTRAINT INTO SEPARATE FILES. Measured against
-- scripts/lib/migration-tier-classifier.mjs on 2026-09-03: the three ADD COLUMN statements ALONE
-- classify TIER-1 ("all_statements_provably_additive") and are therefore eligible for BaseExecutor
-- AUTO-APPLY, while the CHECK ... NOT VALID alone classifies TIER-2 and is not. Splitting them
-- would let the columns land automatically while the constraint waits on the ceremony — leaving a
-- window where the columns exist, the DB enforces nothing, and inserts can write NULLs into
-- exactly the fields this migration exists to guarantee. Kept as ONE chairman-gated file so the
-- columns and their enforcement arrive together or not at all.
--
-- The columns are added NULLABLE with no DEFAULT and no backfill, deliberately: an ADD COLUMN with
-- a DEFAULT or a backfill UPDATE would rewrite/lock rows and push this out of the additive shape.
-- Enforcement of presence lives entirely in the NOT VALID CHECK below plus the writer-side guard in
-- lib/chairman/ratification-writer.mjs (buildRatificationPayload).

ALTER TABLE chairman_ratifications
  ADD COLUMN IF NOT EXISTS uttered_at timestamptz;

ALTER TABLE chairman_ratifications
  ADD COLUMN IF NOT EXISTS quote_hash text;

ALTER TABLE chairman_ratifications
  ADD COLUMN IF NOT EXISTS transcript_ref text;

COMMENT ON COLUMN chairman_ratifications.uttered_at IS
  'When the chairman actually SPOKE the ruling. Distinct from ratified_at, which is the DB clock at insert time. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D.';
COMMENT ON COLUMN chairman_ratifications.quote_hash IS
  'Content hash of quote, so a later edit to the stored quote is detectable. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D.';
COMMENT ON COLUMN chairman_ratifications.transcript_ref IS
  'Reference to the source utterance so the quote can be re-checked against its origin. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D.';

ALTER TABLE chairman_ratifications
  DROP CONSTRAINT IF EXISTS cr_utterance_provenance_present;

ALTER TABLE chairman_ratifications
  ADD CONSTRAINT cr_utterance_provenance_present CHECK (
    uttered_at IS NOT NULL
    AND quote_hash IS NOT NULL
    AND transcript_ref IS NOT NULL
  ) NOT VALID;
