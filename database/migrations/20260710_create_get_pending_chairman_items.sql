-- SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001
-- Create get_pending_chairman_items(): the CANONICAL chairman-actionable pending-items source.
--
-- WHY: the console's designed reader (src/hooks/useDecisionGateQueue.ts:61 in rickfelix/ehg)
-- has called this function since UIUX-B, but it was never created — every /chairman and
-- /chairman/decisions load 404s (PGRST202) and falls back to the raw chairman_pending_decisions
-- view, which mixes machine telemetry into the chairman's queue (measured 2026-07-10:
-- 77 rows = 75 flag_review telemetry + 2 real approvals — a ~20x actionable-load overstatement).
--
-- ============================================================================
-- SHARED PREDICATE ARTIFACT (canonical home — do not re-derive elsewhere)
-- Consumed by: SD-EHG-CONSOLE-QUEUE-POLLUTION-001 (view scope) and
-- SD-EHG-CONSOLE-PENDING-COUNT-SSOT-001 (every pending-count gauge reads total from here).
-- A row is CHAIRMAN-ACTIONABLE iff ALL of:
--   1. status = 'pending'
--   2. decision_type is in the ALLOWLIST:
--        'chairman_approval', 'gate_decision'          -- always actionable (RPC-actionable set,
--                                                      -- DecisionActions.tsx:38)
--        'escalation', 'okr_acceptance'                -- only when blocking = true (human-routed)
--      (allowlist, not blocklist: new/unknown decision_type values are EXCLUDED by default and
--       must be deliberately admitted here. flag_review / flag_enablement — auto-filed
--       harness telemetry — are intentionally NOT admitted.)
--   3. NOT a fixture venture: venture_id IS NULL (holding-level) OR the linked venture has
--      (is_demo IS DISTINCT FROM true) AND name NOT LIKE '\_\_%' AND name NOT ILIKE 'test venture%'
--      AND name NOT ILIKE '%citest%' AND name NOT ILIKE 'canonical-source-test%'
-- Ratified with SD-EHG-CONSOLE-QUEUE-POLLUTION-001 (coordinator thread cae7eb0d); any future
-- change lands HERE first and siblings follow.
-- ============================================================================
--
-- Envelope: jsonb { items: [...], total: <int>, page: <int>, page_size: <int> }
-- Each item is the view row (to_jsonb) plus consumer aliases:
--   deadline := response_deadline  (GateDecision reads .deadline; raw view rows leave it
--                                   undefined — the queue's blanket "No SLA" artifact)
--   summary  := recommendation
--
-- Security: SECURITY INVOKER (caller's RLS posture), STABLE, read-only. EXECUTE granted to
-- authenticated + service_role. No table DDL, no writer surface.
--
-- APPLY (chairman-gated, requires_chairman_apply pre-flagged at sourcing):
--   node scripts/apply-migration.js database/migrations/20260710_create_get_pending_chairman_items.sql --prod-deploy
--   with the chairman @approved-by stamp per standing policy.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_pending_chairman_items(text, integer, integer);
--   (consumers transparently resume the existing view-fallback path, useDecisionGateQueue.ts:77)

CREATE OR REPLACE FUNCTION public.get_pending_chairman_items(
  p_decision_type text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH actionable AS (
  SELECT d.*
  FROM public.chairman_pending_decisions d
  LEFT JOIN public.ventures v ON v.id = d.venture_id
  WHERE d.status = 'pending'
    AND (
      d.decision_type IN ('chairman_approval', 'gate_decision')
      OR (d.decision_type IN ('escalation', 'okr_acceptance') AND d.blocking IS TRUE)
    )
    AND (
      d.venture_id IS NULL
      OR (
        (v.is_demo IS DISTINCT FROM TRUE)
        AND v.name NOT LIKE '\_\_%'
        AND v.name NOT ILIKE 'test venture%'
        AND v.name NOT ILIKE '%citest%'
        AND v.name NOT ILIKE 'canonical-source-test%'
      )
    )
    AND (p_decision_type IS NULL OR d.decision_type = p_decision_type)
),
page AS (
  SELECT *
  FROM actionable
  ORDER BY
    CASE effective_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT GREATEST(COALESCE(p_page_size, 50), 1)
  OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * GREATEST(COALESCE(p_page_size, 50), 1)
)
SELECT jsonb_build_object(
  'items', COALESCE(
    (SELECT jsonb_agg(
       to_jsonb(page.*)
       || jsonb_build_object('deadline', page.response_deadline, 'summary', page.recommendation)
     ) FROM page),
    '[]'::jsonb
  ),
  'total', (SELECT count(*) FROM actionable),
  'page', GREATEST(COALESCE(p_page, 1), 1),
  'page_size', GREATEST(COALESCE(p_page_size, 50), 1)
);
$$;

-- Least-privilege: strip the Postgres default PUBLIC EXECUTE before granting (security-agent review).
REVOKE EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.get_pending_chairman_items(text, integer, integer) IS
'Canonical chairman-actionable pending-items source (SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001). Predicate is the shared artifact for QUEUE-POLLUTION-001 / PENDING-COUNT-SSOT-001 — change it here first. Envelope: {items,total,page,page_size}.';
