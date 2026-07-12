-- ROLLBACK for 20260712_orchestrator_ghost_complete_lead_final.sql
-- SD: SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001
--
-- ⚠️  CHAIRMAN APPLY ONLY. Restores the PRIOR (permissive, ghost-complete)
-- behavior from database/migrations/20251221_orchestrator_auto_complete.sql.
-- Only use if the enforcement migration causes fleet-wide orchestrator
-- completion failures that cannot be remediated forward.
--
-- To roll back: re-apply database/migrations/20251221_orchestrator_auto_complete.sql
-- verbatim — it CREATE OR REPLACEs both complete_orchestrator_sd() and
-- check_handoff_bypass() with their prior bodies. This file exists so the
-- rollback path is explicit and reviewable next to the forward migration:

\i database/migrations/20251221_orchestrator_auto_complete.sql
