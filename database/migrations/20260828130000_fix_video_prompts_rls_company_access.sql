-- Fix video_prompts RLS: scope through user_company_access, not ventures.created_by.
--
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D. TESTING FAIL 49e5b1ef (item 3): the
-- 20260828120000_create_video_prompts_table_corrected.sql migration fixed the
-- `CREATE POLICY IF NOT EXISTS` syntax error, but carried forward the ORIGINAL policies'
-- ownership model unchanged -- every policy scoped through
-- `venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid())`. ventures.created_by
-- is NULL on all 152 live ventures (same defect the PRD's own FR-5 rationale documents for
-- creative_asset_variant_scores / marketing_content_variants), so those policies denied every
-- authenticated user unconditionally -- the table was reachable (no PGRST205) but functionally
-- empty for every real user. That is a FUNCTIONAL fix, not a syntax fix; applying only the
-- syntax fix left FR-1/US-001 hollow.
--
-- Corrected model: scope through user_company_access, the SAME ownership model
-- creative_assets (database/migrations/20260712_creative_assets.sql,
-- creative_assets_venture_access policy) already uses successfully -- verified by DATABASE
-- sub-agent to have real, non-empty rows for live users. SELECT is company-wide (any user with
-- access to the venture's company can read its prompts); INSERT/UPDATE/DELETE keep both the
-- company-access boundary AND require the row's created_by = auth.uid(), preserving per-row
-- authorship (nobody else's prompt can be edited/deleted, even within the same company).
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE POLICY), wrapped in a transaction.
--
-- SECURITY review db9a6d11-acd9-4ee3-8f33-99bbe50f1816 (SEC-4, 2026-08-28): this file and
-- 20260828120000_create_video_prompts_table_corrected.sql were, for a time, two DIVERGENT
-- representations of "what video_prompts RLS should be" -- 20260828120000 still created the
-- broken ventures.created_by-scoped policies, so replaying it after this file would have
-- silently regressed the live policies back to deny-everyone with no error (both migrations
-- "succeed"; only the predicate differs). 20260828120000 has since been rewritten to create
-- the SAME user_company_access-scoped policies below directly, so this file is now a
-- redundant re-assertion of the identical predicate -- kept as the historical record of the
-- fix (and because it is itself still idempotent/harmless to rerun), not as a second source of
-- truth. If the two files' policy bodies ever diverge again, that is itself the bug.

BEGIN;

DROP POLICY IF EXISTS "Users can view prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can view prompts for their ventures" ON public.video_prompts
  FOR SELECT
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can create prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can create prompts for their ventures" ON public.video_prompts
  FOR INSERT
  WITH CHECK (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update their own prompts" ON public.video_prompts;
CREATE POLICY "Users can update their own prompts" ON public.video_prompts
  FOR UPDATE
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can delete their own prompts" ON public.video_prompts;
CREATE POLICY "Users can delete their own prompts" ON public.video_prompts
  FOR DELETE
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

COMMIT;
