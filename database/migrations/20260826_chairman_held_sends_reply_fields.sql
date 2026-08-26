-- SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — persist the rubric-required reply fields on
-- chairman_held_sends so a released decision doesn't rubric-block on lint.js checks 3 ("reply
-- instruction") and 9 ("reply_ids", read as message.replyId — singular). Deliberately a NEW
-- migration, not an edit to 20260824_chairman_held_sends.sql: that file has been chairman-applied
-- and live since 2026-08-25, so editing it in place would make the file and the live schema
-- silently diverge.
--
-- ALL THREE COLUMNS ARE NULLABLE, NO CHECK — additive-only, self-applicable per the migration
-- delegation classifier (Rule C: bare ADD COLUMN, no NOT NULL/CHECK/DEFAULT-expression). Two live
-- held rows (1d7b5399, e49771f2) already exist and would block a NOT NULL backfill.
--
-- reply_id is SINGULAR (not reply_ids/plural): the consumer, lint.js:177, reads message.replyId as
-- one string, and scripts/adam-chairman-decision.mjs mints exactly one token per decision — there
-- is never more than one to hold.

ALTER TABLE public.chairman_held_sends
  ADD COLUMN IF NOT EXISTS reply_instruction text,
  ADD COLUMN IF NOT EXISTS reply_id text,
  ADD COLUMN IF NOT EXISTS no_reply_consequence text;

COMMENT ON COLUMN public.chairman_held_sends.reply_instruction IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.replyInstruction at hold time so the release path can restore it and satisfy rubric-engine/lint.js check 3 (reply_instruction) on re-evaluation. Nullable: a hold with no reply instruction is a pre-existing malformed decision, not a schema violation.';
COMMENT ON COLUMN public.chairman_held_sends.reply_id IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.replyId (singular — lint.js:177 reads one string, never an array) so the release path can restore it and satisfy rubric-engine/lint.js check 9 (reply_ids).';
COMMENT ON COLUMN public.chairman_held_sends.no_reply_consequence IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.noReplyConsequence at hold time so the release path can fold it back into the composed body via composeDecisionSmsBody() exactly once (see FR-4 skipCompose).';

-- VERIFY (run after apply):
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='chairman_held_sends'
--     AND column_name IN ('reply_instruction','reply_id','no_reply_consequence');
