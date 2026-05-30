-- @approved-by: rickfelix@example.com
-- QF-20260529-565 / feedback 0519017e
--
-- Fix a dead POSIX regex in auto_validate_retrospective_quality(): PostgreSQL POSIX
-- ERE does NOT honor the \d shorthand, so the specificity-bonus check
--   (... ~ '\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)')
-- never matched and the +10 numeric-specificity bonus never fired, even when a retro
-- contained concrete counts ("5 tests", "+143 lines"). Replace the single regex
-- literal's \d+ with a [0-9]+ character class.
--
-- Implemented as an idempotent, self-validating redefinition: read the LIVE function
-- body via pg_get_functiondef and replace ONLY that one regex literal, then re-run the
-- CREATE OR REPLACE. This avoids transcribing the ~215-line body (no drift risk) and is
-- safe to re-run. The trigger validate_retrospective_quality_trigger references the
-- function by name, so it keeps working against the redefined body unchanged.

DO $mig$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.auto_validate_retrospective_quality()'::regprocedure) INTO def;

  IF position($q$\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)$q$ IN def) > 0 THEN
    def := replace(
      def,
      $q$\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)$q$,
      $q$[0-9]+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)$q$
    );
    EXECUTE def;
    RAISE NOTICE 'QF-20260529-565: retro specificity-bonus regex fixed (\d+ -> [0-9]+).';
  ELSIF position($q$[0-9]+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)$q$ IN def) > 0 THEN
    RAISE NOTICE 'QF-20260529-565: already fixed, no-op.';
  ELSE
    RAISE EXCEPTION 'QF-20260529-565: specificity regex literal not found in live function; aborting (drift).';
  END IF;
END
$mig$;
