-- SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 FR-1 (correction)
-- @approved-by: codestreetlabs@gmail.com
--
-- check_feedback_duplicate originally returned boolean, but the real caller
-- contract (ehg/src/integrations/feedback/feedbackDataAccess.ts's
-- submitFeedback(), via findRecentDuplicate()'s DuplicateMatch.existingId)
-- needs the MATCHING ROW'S ID on a dedup hit, not just a yes/no -- a pure
-- boolean would silently break submitFeedback()'s "return the existing row's
-- id, no insert performed" dedup path. Returning the row id (not title/
-- description/any other content column) matches the DAL's own pre-existing
-- documented security posture in types.ts's DuplicateMatch comment:
-- "the DAL never returns the raw row -- it returns only the minimum
-- identifying fields". An opaque, non-guessable UUID id does not reintroduce
-- the row-content leak this SD closes; it does not materially widen the
-- existence-oracle side-channel already accepted for the boolean version
-- (RISK sub-agent, LEAD-phase grounding).
--
-- Postgres cannot CREATE OR REPLACE a function with a different return type,
-- so this drops and recreates.

DROP FUNCTION IF EXISTS public.check_feedback_duplicate(uuid, text);

CREATE FUNCTION public.check_feedback_duplicate(
  p_venture_id uuid,
  p_title text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND lower(title) = lower(p_title)
    AND feedback_type LIKE 'user_%'
    AND created_at > now() - interval '24 hours'
    AND status NOT IN ('resolved', 'wont_fix')
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.check_feedback_duplicate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_feedback_duplicate(uuid, text) TO anon;
