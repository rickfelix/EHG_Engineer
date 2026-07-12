-- SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 FR-1
-- @approved-by: codestreetlabs@gmail.com
--
-- Additive, zero-behavior-change: a SECURITY DEFINER boolean RPC that lets the
-- feedback-widget dedup check (currently a raw anon-role SELECT relying on the
-- over-permissive venture_user_select_feedback policy -- see FR-3's staged drop
-- migration) run without exposing any row content. Mirrors
-- venture_exists_and_active's exact SECURITY DEFINER shape (STABLE,
-- SET search_path=pg_catalog,public, REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO
-- anon) rather than check_feedback_rate_limit's (whose live search_path is
-- reversed: public,pg_catalog).
--
-- Replicates ehg/src/integrations/feedback/feedbackDataAccess.ts's
-- findRecentDuplicate() matching semantics exactly (same venture_id,
-- case-insensitive title match, 24h window, feedback_type LIKE 'user_%',
-- status NOT IN ('resolved','wont_fix')) so migrating the client to call this
-- RPC (FR-2) is a behavior-preserving swap, not a silent dedup-check change.
-- Uses lower(title)=lower(p_title) rather than the client's current ILIKE --
-- semantically equivalent for exact-match use (avoids ILIKE's wildcard-
-- injection quirk if a title ever contains a literal '%' character).
--
-- COORDINATION NOTE (sibling migration on the SAME function, applied SECOND):
-- database/migrations/20260712_check_feedback_duplicate_rpc_fix_return_type.sql
-- DROP+CREATEs this function with RETURNS uuid instead of RETURNS boolean --
-- submitFeedback()'s real contract needs the matching row's id on a dedup
-- hit, not just a boolean. Postgres cannot CREATE OR REPLACE a function with
-- a different return type, so the sibling migration's DROP FUNCTION IF EXISTS
-- supersedes the CREATE OR REPLACE below; the live function is uuid-returning
-- (verified via pg_proc readback 2026-07-12). This file's DDL literal is
-- reconciled here to match that live state for fresh-environment/disaster-
-- recovery replay correctness -- replaying this file alone no longer
-- reproduces what's live, but replaying it followed by the sibling file does.

CREATE OR REPLACE FUNCTION public.check_feedback_duplicate(
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
