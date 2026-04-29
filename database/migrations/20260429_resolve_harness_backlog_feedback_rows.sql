-- =====================================================
-- Migration: Mark 7 harness_backlog feedback rows as resolved
-- Date: 2026-04-29
-- Context: Migrated from docs/harness-backlog.md with status='new' but
--          had [RESOLVED:...] prefixes the migration parser stripped.
--          Triage agent verified each row's resolution evidence.
-- Reversible: Yes (UPDATE only, no DROP)
-- =====================================================

BEGIN;

-- Pre-update verification (informational; visible in command log)
DO $$
DECLARE
  pre_new_count INT;
  pre_resolved_count INT;
  target_count INT;
BEGIN
  SELECT COUNT(*) INTO pre_new_count
    FROM feedback
   WHERE category = 'harness_backlog' AND status = 'new';
  SELECT COUNT(*) INTO pre_resolved_count
    FROM feedback
   WHERE category = 'harness_backlog' AND status = 'resolved';
  SELECT COUNT(*) INTO target_count
    FROM feedback
   WHERE id IN (
     '09b016f6-890e-41d9-8ea5-d7f2757eec90',
     '5ed830dc-3391-41aa-a062-2349a5e34458',
     '94ea026d-3f61-40c5-8a49-30ea573962c1',
     '7ed38d85-050f-4791-8f26-7cdba409cf30',
     'ce6dd11b-b45b-4b94-af69-6078372137ff',
     'b1bb1c07-4118-4f45-9374-222a85adcf0a',
     'e51fe945-8775-4235-9e03-8d2bf56cc238'
   );
  RAISE NOTICE 'PRE-UPDATE: harness_backlog new=%, resolved=%, target_rows_found=%',
    pre_new_count, pre_resolved_count, target_count;
  IF target_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 target rows, found %; aborting', target_count;
  END IF;
END $$;

-- Perform the UPDATE
UPDATE feedback
   SET status = 'resolved',
       resolution_notes = CASE id
         WHEN '09b016f6-890e-41d9-8ea5-d7f2757eec90' THEN 'PR #3416 fix/stage-20-venture-resources-query-shape, merged 2026-04-29; lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js now uses row-per-resource shape'
         WHEN '5ed830dc-3391-41aa-a062-2349a5e34458' THEN 'PR #3406 QF-20260428-PLAYWRIGHT-BACKEND, merged 2026-04-28; short-circuit gate for backend SDs'
         WHEN '94ea026d-3f61-40c5-8a49-30ea573962c1' THEN 'PR #3407 QF-20260428-RETRO-AGENT-LESSON-TRIAGE, merged 2026-04-28; lesson-triage step baked into retro-agent.partial'
         WHEN '7ed38d85-050f-4791-8f26-7cdba409cf30' THEN 'EHG PR #550 (squash 299516c9) via SD-LEO-INFRA-EHG-REPO-ADD-001; tagged [RESOLVED] in docs/harness-backlog.md commit fadedd05a7'
         WHEN 'ce6dd11b-b45b-4b94-af69-6078372137ff' THEN 'EHG PR #550 via SD-LEO-INFRA-EHG-REPO-ADD-001; tagged [RESOLVED] in docs commit fadedd05a7'
         WHEN 'b1bb1c07-4118-4f45-9374-222a85adcf0a' THEN 'EHG PR #550 via SD-LEO-INFRA-EHG-REPO-ADD-001; tagged [RESOLVED] in docs commit fadedd05a7'
         WHEN 'e51fe945-8775-4235-9e03-8d2bf56cc238' THEN 'EHG PR #550 via SD-LEO-INFRA-EHG-REPO-ADD-001; tagged [RESOLVED] in docs commit fadedd05a7'
       END,
       resolved_at = now()
 WHERE id IN (
   '09b016f6-890e-41d9-8ea5-d7f2757eec90',
   '5ed830dc-3391-41aa-a062-2349a5e34458',
   '94ea026d-3f61-40c5-8a49-30ea573962c1',
   '7ed38d85-050f-4791-8f26-7cdba409cf30',
   'ce6dd11b-b45b-4b94-af69-6078372137ff',
   'b1bb1c07-4118-4f45-9374-222a85adcf0a',
   'e51fe945-8775-4235-9e03-8d2bf56cc238'
 );

-- Post-update verification
DO $$
DECLARE
  post_new_count INT;
  post_resolved_count INT;
  unresolved_target INT;
BEGIN
  SELECT COUNT(*) INTO post_new_count
    FROM feedback
   WHERE category = 'harness_backlog' AND status = 'new';
  SELECT COUNT(*) INTO post_resolved_count
    FROM feedback
   WHERE category = 'harness_backlog' AND status = 'resolved';
  SELECT COUNT(*) INTO unresolved_target
    FROM feedback
   WHERE id IN (
     '09b016f6-890e-41d9-8ea5-d7f2757eec90',
     '5ed830dc-3391-41aa-a062-2349a5e34458',
     '94ea026d-3f61-40c5-8a49-30ea573962c1',
     '7ed38d85-050f-4791-8f26-7cdba409cf30',
     'ce6dd11b-b45b-4b94-af69-6078372137ff',
     'b1bb1c07-4118-4f45-9374-222a85adcf0a',
     'e51fe945-8775-4235-9e03-8d2bf56cc238'
   ) AND status <> 'resolved';
  RAISE NOTICE 'POST-UPDATE: harness_backlog new=%, resolved=%, unresolved_targets=%',
    post_new_count, post_resolved_count, unresolved_target;
  IF unresolved_target <> 0 THEN
    RAISE EXCEPTION 'Some target rows still unresolved (count=%), aborting', unresolved_target;
  END IF;
END $$;

COMMIT;

-- =====================================================
-- Rollback (if needed):
-- UPDATE feedback SET status = 'new', resolution_notes = NULL, resolved_at = NULL
--  WHERE id IN ('09b016f6-...', ...);
-- =====================================================
