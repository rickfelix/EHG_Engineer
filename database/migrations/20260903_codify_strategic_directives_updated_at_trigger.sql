-- QF-20260903-095
--
-- PREMISE CORRECTION (measured live, 2026-09-03): the QF as filed claims
-- strategic_directives_v2.updated_at "is not auto-maintained" and "does not
-- advance with the write." Both claims are FALSE as measured against the live
-- database. Two triggers already exist and fire on every UPDATE:
--   - update_sd_timestamp            -> update_updated_at()
--   - update_strategic_directives_v2_updated_at -> update_updated_at_column()
-- A live empirical test (read updated_at, write metadata via the Supabase JS
-- client, re-read updated_at) confirmed the column DOES advance. Neither
-- trigger is represented in database/migrations/, so this file codifies the
-- SECOND of the two (the shared, repo-wide update_updated_at_column()
-- convention already used across ~15+ other tables) declaratively, closing
-- the gap where a from-scratch schema replay would not reproduce it. This is
-- a documentation/tracking fix, not a behavior change -- CREATE OR REPLACE +
-- DROP TRIGGER IF EXISTS make this a no-op against the current live state.
--
-- THE REAL BUG, separately reproduced and NOT fixed by this migration: two
-- concurrent client-side read-modify-write calls to the SAME row's metadata
-- column (read, locally merge a new key, write the whole object back) cause
-- one writer's key to be silently lost, even though updated_at correctly
-- advances on both writes (proving the trigger is not the mechanism at fault).
-- Reproduced live: two concurrent Supabase-client .update({metadata: ...})
-- calls against strategic_directives_v2, each adding a distinct top-level key
-- to a locally-merged copy of the same base object -- one key was present,
-- one was silently absent, in the final row. This is a classic last-write-
-- wins race on a JSONB column and is present at 30+ call sites in scripts/
-- alone (grep '.update({ metadata' -- not an exhaustive repo-wide count) that
-- follow the same read-then-replace-whole-object pattern. Fixing it requires
-- either an atomic `metadata = metadata || $delta` UPDATE pattern (no
-- client-side read needed) or optimistic concurrency (a WHERE updated_at =
-- $expected clause) at each call site -- out of scope for this quick fix;
-- recommended as a separate, properly-scoped SD.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_strategic_directives_v2_updated_at ON public.strategic_directives_v2;
CREATE TRIGGER update_strategic_directives_v2_updated_at
  BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
