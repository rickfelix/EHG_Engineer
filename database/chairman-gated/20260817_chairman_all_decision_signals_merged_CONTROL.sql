-- CONTROL QUERY for 20260817_chairman_all_decision_signals_merged.sql (QF-20260816-456, QF-20260816-988)
--
-- Run this ONE statement immediately after applying the merge. All five checks must read PASS.
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
      WHERE id = 'b7a7c05f-837c-444b-860b-8abd8197d938') AS decided_row_decided_by,
    (SELECT decided_at FROM public.chairman_all_decision_signals
      WHERE id = 'fab64495-a580-4b8f-8cef-2aae275c8bc6') AS system_write_decided_at,
    (SELECT decided_by FROM public.chairman_all_decision_signals
      WHERE id = 'fab64495-a580-4b8f-8cef-2aae275c8bc6') AS system_write_decided_by,
    (SELECT details->>'decided_by_label' FROM public.chairman_all_decision_signals
      WHERE id = 'fab64495-a580-4b8f-8cef-2aae275c8bc6') AS system_write_decided_by_label
)
SELECT
  CASE WHEN post_count = pre_count THEN 'PASS' ELSE 'FAIL — row count drifted: ' || pre_count || ' -> ' || post_count END AS check_1_row_count_stable,
  CASE WHEN ratified_hold_status = 'held' THEN 'PASS' ELSE 'FAIL — expected held, got ' || COALESCE(ratified_hold_status, 'NULL') END AS check_2_ratified_hold_renders_held,
  CASE WHEN ratified_hold_title LIKE '%HELD until:%' THEN 'PASS' ELSE 'FAIL — title missing HELD-until suffix: ' || COALESCE(ratified_hold_title, 'NULL') END AS check_3_ratified_hold_title_explains_itself,
  CASE WHEN decided_row_decided_by = '69c8aa7a-7661-48ed-9779-746fa6290873' THEN 'PASS' ELSE 'FAIL — expected 69c8aa7a-7661-48ed-9779-746fa6290873, got ' || COALESCE(decided_row_decided_by::text, 'NULL') END AS check_4_decided_row_shows_real_decider,
  -- QF-20260816-988: a row decided by a system/free-text actor (no linked uuid) must NOT read as
  -- "decided at X by nobody" — decided_at populates, decided_by (uuid) is honestly NULL, but
  -- details.decided_by_label carries the real actor name so the identity is not silently dropped.
  CASE WHEN system_write_decided_at IS NOT NULL AND system_write_decided_by IS NULL AND system_write_decided_by_label = 'chairman-cli'
       THEN 'PASS'
       ELSE 'FAIL — expected decided_at set + decided_by NULL + decided_by_label=chairman-cli, got decided_at=' || COALESCE(system_write_decided_at::text, 'NULL') || ' decided_by=' || COALESCE(system_write_decided_by::text, 'NULL') || ' decided_by_label=' || COALESCE(system_write_decided_by_label, 'NULL')
  END AS check_5_system_write_not_decided_by_nobody
FROM checks;

-- Anchor rows (all verified live on 2026-08-16, immediately before this file was written):
--   3aa84300-0f0b-4a91-bebe-a24768c94320  chairman_decisions row with brief_data->'hold'->>'ratified'='true'
--                                          (decision='pending', status='approved' on the raw row —
--                                          deliberately inconsistent-looking; the ratified-hold check
--                                          must win regardless of what decision/status literally say)
--   b7a7c05f-837c-444b-860b-8abd8197d938  chairman_decisions row with decided_by_user_id=
--                                          69c8aa7a-7661-48ed-9779-746fa6290873, status='approved'
--   fab64495-a580-4b8f-8cef-2aae275c8bc6  chairman_decisions row with decided_by='chairman-cli' (text),
--                                          decided_by_user_id=NULL, status='rejected' — the QF-988
--                                          "decided by nobody" case
--
-- If any anchor row's id no longer exists at ceremony time (e.g. deleted/archived between
-- 2026-08-16 and apply), re-run the anchor-finding queries from this migration's header comment
-- ("ANCHOR:" queries) to pick fresh live rows before using this control query. For a fresh
-- check_5 anchor: SELECT id, decided_by, decided_by_user_id, status FROM chairman_decisions
-- WHERE decided_by IS NOT NULL AND status <> 'pending' AND decided_by_user_id IS NULL LIMIT 1;
