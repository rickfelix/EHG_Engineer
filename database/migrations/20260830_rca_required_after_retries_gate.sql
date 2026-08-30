-- @approved-by: codestreetlabs@gmail.com
-- SD-ALTIFYAI-LEO-FIX-ENFORCE-RATIFIED-RETRY-001
-- Seeds the app_config row for the new RCA_REQUIRED_AFTER_2_RETRIES gate's enforcement mode,
-- matching the sibling rca.feedback_loop.enforcement_mode seeding pattern (Explore evidence
-- 9f9cafef, LEAD phase): the codebase convention is explicit migration seeding, not lazy
-- first-read creation, even though readEnforcementMode() already defaults safely to
-- 'advisory' when the key is absent.
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DELETE FROM app_config WHERE key = 'rca.required_after_retries.enforcement_mode';

BEGIN;

INSERT INTO app_config (key, value, description)
VALUES (
  'rca.required_after_retries.enforcement_mode',
  '"advisory"'::jsonb,
  'RCA_REQUIRED_AFTER_2_RETRIES gate enforcement mode (SD-ALTIFYAI-LEO-FIX-ENFORCE-RATIFIED-RETRY-001). Values: advisory (count + surface attempt_index, never fails -- default), blocking (refuse the 3rd+ attempt on a transition without a fresh post-2nd-rejection RCA row), disabled (no-op).'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
