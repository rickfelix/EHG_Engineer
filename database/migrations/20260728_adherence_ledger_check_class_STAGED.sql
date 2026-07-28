-- SD-LEO-INFRA-ROLE-SESSION-SELF-001 / FR-2 — declare WHICH KIND OF GREEN a ledger row is.
-- ============================================================================================
-- WHY. A role-session adherence review returned CLEAN on the night of a self-reported execution
-- breach. Its green was honest and IRRELEVANT: it had only ever checked that duties were LISTED,
-- never that behaviour complied. Those two greens render identically, and the weaker one is the
-- one that reassures. This column makes the claim explicit so a reader — or a gauge — can tell
-- "the duty is wired" from "behaviour complied" by querying the row alone.
--
-- THE CONTRACT AS ORIGINALLY WRITTEN WAS IMPOSSIBLE, and this is the whole reason for the
-- three-step shape below. The PRD asked for NOT NULL with no default. adam_adherence_ledger holds
-- ~1383 existing rows, so ADD COLUMN NOT NULL without a default simply FAILS. And backfilling
-- every historical row to a class would be worse than the defect: it would assign a meaning to
-- 1383 verdicts nobody classified, which is precisely the false-confidence this SD exists to end.
--
-- So: history stays HONESTLY NULL (= "this row predates classification"), and the NOT NULL
-- guarantee is scoped to rows written from here on via a CHECK on created_at. A NULL in this
-- column means "unclassified", never "duty" — silence is never resolved into a claim.
--
-- Step 3 is deliberately NOT "ALTER COLUMN SET NOT NULL": that would force the backfill this
-- comment just argued against. The partial CHECK gives the same forward guarantee without
-- rewriting the past.
-- ============================================================================================

-- 1. The column, nullable. Existing rows remain NULL and MEAN "unclassified".
ALTER TABLE adam_adherence_ledger
  ADD COLUMN IF NOT EXISTS check_class TEXT;

COMMENT ON COLUMN adam_adherence_ledger.check_class IS
  'What this verdict is a claim ABOUT: duty = the duty is wired (a presence check); conduct = behaviour complied (read live behaviour). NULL means the row predates classification and asserts NOTHING — it must never be read as duty. SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-2.';

-- 2. Only the two meanings are admissible. NULL is still allowed (history), but a WRONG value
--    is not: an unrecognised class would be a third, undefined kind of green.
ALTER TABLE adam_adherence_ledger
  DROP CONSTRAINT IF EXISTS adam_adherence_ledger_check_class_check;
ALTER TABLE adam_adherence_ledger
  ADD CONSTRAINT adam_adherence_ledger_check_class_check
  CHECK (check_class IS NULL OR check_class IN ('duty', 'conduct'));

-- 3. FORWARD guarantee, scoped by time rather than by a rewrite of history. Every row written
--    after the cutover must declare its class. NOT VALID skips the scan of existing rows, which
--    is exactly the point — those rows are legitimately unclassified and must stay that way.
ALTER TABLE adam_adherence_ledger
  DROP CONSTRAINT IF EXISTS adam_adherence_ledger_check_class_required_after_cutover;
ALTER TABLE adam_adherence_ledger
  ADD CONSTRAINT adam_adherence_ledger_check_class_required_after_cutover
  CHECK (created_at < TIMESTAMPTZ '2026-07-28 00:00:00+00' OR check_class IS NOT NULL)
  NOT VALID;

-- Index only where it is read: "show me the conduct verdicts" is the query this exists to answer,
-- and it is pointless to index the NULL history.
CREATE INDEX IF NOT EXISTS idx_adam_adherence_ledger_check_class
  ON adam_adherence_ledger (check_class, created_at DESC)
  WHERE check_class IS NOT NULL;

NOTIFY pgrst, 'reload schema';
