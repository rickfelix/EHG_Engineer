-- CONTROL QUERY for 20260817_chairman_all_decision_signals_merged.sql (QF-20260816-456)
--
-- Run this ONE statement immediately after applying the merge. All three checks must read PASS.
--
-- Row count is NOT hardcoded (it was 1,047 when this file was written on 2026-08-16 and will have
-- drifted by ceremony time) — instead capture the pre-apply count yourself right before running
-- BEGIN on the merge migration:
--   SELECT count(*) FROM public.chairman_all_decision_signals;   -- note this number as :pre_count
-- then substitute it into the query below. The merge changes only computed columns (title,
-- priority, status, decided_at, decided_by) on branches 3 and 4 — it does not add, remove, or
-- re-filter any WHERE predicate on any branch — so the post-apply count must equal :pre_count
-- exactly. Any difference means a branch's row set moved and the merge did NOT do what it claims.

WITH checks AS (
  SELECT
    (SELECT count(*) FROM public.chairman_all_decision_signals) AS post_count,
    :pre_count AS pre_count,
    (SELECT status FROM public.chairman_all_decision_signals
      WHERE id = '3aa84300-0f0b-4a91-bebe-a24768c94320') AS ratified_hold_status,
    (SELECT title FROM public.chairman_all_decision_signals
      WHERE id = '3aa84300-0f0b-4a91-bebe-a24768c94320') AS ratified_hold_title,
    (SELECT decided_by FROM public.chairman_all_decision_signals
      WHERE id = 'b7a7c05f-837c-444b-860b-8abd8197d938') AS decided_row_decided_by
)
SELECT
  CASE WHEN post_count = pre_count THEN 'PASS' ELSE 'FAIL — row count drifted: ' || pre_count || ' -> ' || post_count END AS check_1_row_count_stable,
  CASE WHEN ratified_hold_status = 'held' THEN 'PASS' ELSE 'FAIL — expected held, got ' || COALESCE(ratified_hold_status, 'NULL') END AS check_2_ratified_hold_renders_held,
  CASE WHEN ratified_hold_title LIKE '%HELD until:%' THEN 'PASS' ELSE 'FAIL — title missing HELD-until suffix: ' || COALESCE(ratified_hold_title, 'NULL') END AS check_3_ratified_hold_title_explains_itself,
  CASE WHEN decided_row_decided_by = '69c8aa7a-7661-48ed-9779-746fa6290873' THEN 'PASS' ELSE 'FAIL — expected 69c8aa7a-7661-48ed-9779-746fa6290873, got ' || COALESCE(decided_row_decided_by::text, 'NULL') END AS check_4_decided_row_shows_real_decider
FROM checks;

-- Anchor rows (both verified live on 2026-08-16, immediately before this file was written):
--   3aa84300-0f0b-4a91-bebe-a24768c94320  chairman_decisions row with brief_data->'hold'->>'ratified'='true'
--                                          (decision='pending', status='approved' on the raw row —
--                                          deliberately inconsistent-looking; the ratified-hold check
--                                          must win regardless of what decision/status literally say)
--   b7a7c05f-837c-444b-860b-8abd8197d938  chairman_decisions row with decided_by_user_id=
--                                          69c8aa7a-7661-48ed-9779-746fa6290873, status='approved'
--
-- If either anchor row's id no longer exists at ceremony time (e.g. deleted/archived between
-- 2026-08-16 and apply), re-run the two anchor-finding queries from this migration's header
-- comment ("ANCHOR:" queries) to pick fresh live rows before using this control query.
