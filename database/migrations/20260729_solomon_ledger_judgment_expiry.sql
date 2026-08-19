-- @approved-by: codestreetlabs@gmail.com
-- approval-note: chairman ruling A by SMS 2026-08-19T19:13:20Z (drift packet #2: 5 structural, Solomon 299de763); additive/idempotent; drift-guard gap; scribe adam-08049808
-- @approved-by: 2026-08-19T19:26Z
-- approval-note: chairman ruling A by SMS 2026-08-19T19:13:20Z (drift packet #2: 5 structural, Solomon 299de763); additive/idempotent; drift-guard gap; scribe adam-08049808
-- SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-1 — judgment expiry as its OWN column.
--
-- CHAIRMAN-APPLY-GATED. Authored, not applied.
--
-- WHY A COLUMN RATHER THAN A NEW `decision` VALUE, which is what this SD originally specified.
-- The first design added `expired_unjudged` to decision. Review dismantled it on three counts and
-- the reversal is the safer design, not merely the cheaper one:
--
--   1. It would have moved BOTH scripts/drain-inventory.mjs:88 and :91 at once — emptying the
--      undrained population while simultaneously inflating closingPathUses. One action moving two
--      counters the right way for the wrong reason is exactly the silent-retirement risk this SD
--      exists to prevent, so the original plan caused the harm it was written to stop and then
--      spent a whole FR repairing it.
--   2. scripts/fleet-dashboard.cjs:1959 partitions the accuracy DENOMINATOR by negation of
--      'pending' while :1980 uses a positive allow-list for the numerator, so any new terminal
--      decision value lands in the denominator and can never reach the numerator. Simulated on live
--      data: aging every pending row would have dropped accuracy from 16% to 6% with no change in
--      the world.
--   3. The SD's own FR told EXEC to add the value to VALID_DISPOSITIONS while its own test asserted
--      the judging path could NOT write it — a self-contradiction inside one PRD.
--
-- Expiry and adoption are independent facts. Keeping them in separate columns means a row can be
-- both "never judged by a human" and "still pending", which is the truth, and it answers the
-- six-months-out question better than collapsing them ever could. It also turns CHECK-altering DDL
-- into a plain ADD COLUMN.
--
-- MEASURED BEFORE WRITING (2026-07-29): 1100 rows; outcome unknown on 1047; ZERO negatives ever;
-- decision pending on 566. Zero pending rows exceed 5 days, 176 exceed 72h, max age 4.8 days —
-- which is why the aging threshold is pinned at 7d in the job rather than left to a fixture, and
-- why the job ships disabled. A shorter threshold would only stamp rows history says were about to
-- be judged.

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS judgment_expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS judgment_expired_by text;

-- Partial index: the aging job and every consumer ask "which rows expired", never "which did not".
CREATE INDEX IF NOT EXISTS idx_solomon_ledger_judgment_expired
  ON solomon_advice_outcome_ledger (judgment_expired_at)
  WHERE judgment_expired_at IS NOT NULL;

-- Attribution is REQUIRED when expiry is stamped: a stamped row must say WHAT stamped it.
--
-- CLAIM NARROWED AFTER SECURITY REVIEW, because the first version of this comment overstated it. I
-- wrote that this makes a hand-written row unable to "pass for a mechanism that actually ran". It
-- does not, and no CHECK could: it constrains neither the VALUE (EXPIRY_ACTOR is a public exported
-- constant anyone can copy) nor the WRITER (every writer authenticates as the same service role, so
-- Postgres cannot tell them apart). What it actually guarantees is narrower and still worth having:
-- an expiry stamp can never be ANONYMOUS, so a row missing attribution is a schema violation rather
-- than a silent gap.
--
-- TS-10 -- "the mechanism actually RAN rather than merely shipping green" -- therefore CANNOT rest
-- on this constraint. Five mechanisms have already shipped into this table and all five run at zero;
-- distinguishing "ran" from "shipped" needs a witness the DB cannot provide, and that is recorded as
-- an open gap rather than papered over with a constraint that reads like it closes it.
ALTER TABLE solomon_advice_outcome_ledger
  DROP CONSTRAINT IF EXISTS solomon_ledger_judgment_expiry_attributed;
ALTER TABLE solomon_advice_outcome_ledger
  ADD CONSTRAINT solomon_ledger_judgment_expiry_attributed
  CHECK (judgment_expired_at IS NULL OR judgment_expired_by IS NOT NULL);

COMMENT ON COLUMN solomon_advice_outcome_ledger.judgment_expired_at IS
  'When the adoption judgment aged out unanswered. INDEPENDENT of decision, which stays ''pending'' -- a row can be both never-judged and still-pending, and that is the truth. Deliberately NOT a decision value: routing expiry through decision would move drain-inventory.mjs:88 and :91 together and inflate the accuracy denominator at fleet-dashboard.cjs:1959. SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-1.';

COMMENT ON COLUMN solomon_advice_outcome_ledger.judgment_expired_by IS
  'Identifier of the aging process that stamped judgment_expired_at. Constraint-required so a stamp can never be ANONYMOUS -- it does NOT establish WHO stamped it, because the actor value is a public constant and every writer shares one service-role identity. TS-10 (did the mechanism actually RUN) needs a witness the database cannot supply. SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-2.';
