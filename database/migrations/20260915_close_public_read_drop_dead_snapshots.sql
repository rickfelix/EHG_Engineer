-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-CLOSE-PUBLIC-READ-001 -- chairman_decisions row b2a73285 ("[LIVE EXPOSURE] Nine
-- open secret-scanning alerts on the public EHG_Engineer repo -- seven service-role keys, oldest
-- unresolved since 2025-09-22"). Chairman verbal at the Adam terminal, verbatim "approve the
-- drops", 2026-09-15T10:57:53.766Z, captured by Adam (49eabb23) as ratification 49686fd3, stamped
-- onto this SD's metadata.chairman_drop_approval (quote/approved_at/captured_by/safety_basis/
-- scope_exactly/scope_excludes). Coordinator (3616c697) applying per direct chairman
-- authorization in a live conversation, 2026-09-15T10:5xZ ("you can go ahead and issue that
-- immediately").
--
-- SCOPE: exactly the 23 tables named in chairman_drop_approval.scope_exactly -- 20 qparity
-- snapshot tables (2026-06-10), 1 storm-quarantine snapshot (2026-07-04), 2 sd_baseline_items
-- backup/recon snapshots (2026-06-09). Nothing else. The 13 LIVE tables carrying the same public
-- read exposure are explicitly OUT OF SCOPE (scope_excludes) -- they need per-table row-level
-- protection, not removal, and are a separate follow-up. Key rotation is also explicitly out of
-- scope and deliberately sequenced AFTER this migration (rotating the project secret invalidates
-- the service-role key every live seat is using).
--
-- SAFETY BASIS (Adam, verified 2026-09-15 10:5xZ, re-verified by the coordinator immediately
-- before writing this migration via a live row-count check against every table below -- all 23
-- counts matched Adam's figures exactly, e.g. sd_baseline_items_purge_backup_20260609=12932):
-- every table here is a stale partial copy whose live source still exists and is populated.
-- sd_baseline_items_purge_backup_20260609 holds 12,932 rows against a live sd_baseline_items of
-- 33,318; the qparity20260610 and storm-quarantine snapshots hold single/double/triple digits
-- against live tables of comparable or larger size. No foreign-key constraint references any of
-- these 23 tables in either direction (checked live via information_schema before this file was
-- written) -- a plain DROP TABLE needs no CASCADE and cannot touch anything else.
--
-- EFFECT: removes roughly 13,000 of the ~15,300 publicly-readable rows the chairman's own
-- Advisors scan flagged (36/36 tables, anon count == service-role count on every one).

DROP TABLE public.ventures_qparity20260610;
DROP TABLE public.eva_ventures_qparity20260610;
DROP TABLE public.eva_stage_gate_results_qparity20260610;
DROP TABLE public.factory_guardrail_state_qparity20260610;
DROP TABLE public.stage_executions_qparity20260610;
DROP TABLE public.venture_artifacts_qparity20260610;
DROP TABLE public.venture_resources_qparity20260610;
DROP TABLE public.venture_stage_transitions_qparity20260610;
DROP TABLE public.venture_stage_work_qparity20260610;
DROP TABLE public.eva_scheduler_queue_qparity20260610;
DROP TABLE public.eva_scheduler_metrics_qparity20260610;
DROP TABLE public.eva_events_qparity20260610;
DROP TABLE public.eva_decisions_qparity20260610;
DROP TABLE public.eva_automation_executions_qparity20260610;
DROP TABLE public.venture_separability_scores_qparity20260610;
DROP TABLE public.venture_data_room_artifacts_qparity20260610;
DROP TABLE public.capital_transactions_preimg_qparity20260610;
DROP TABLE public.venture_artifact_summaries_qparity20260610;
DROP TABLE public.eva_audit_log_preimg_qparity20260610;
DROP TABLE public.quarantine_meta_qparity20260610;
DROP TABLE public.venture_artifacts_storm_quarantine_20260704;
DROP TABLE public.sd_baseline_items_purge_backup_20260609;
DROP TABLE public.sd_baseline_items_recon_backup;
