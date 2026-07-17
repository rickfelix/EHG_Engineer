-- @approved-by: codestreetlabs@gmail.com
-- (chairman verbal approval 2026-07-17 evening, in-session; Adam as scribe per standing convention)
-- SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-2)
-- Extend the fixture-venture exclusion in get_pending_chairman_items() with the
-- realdb-suite fixture families that leaked into the chairman digest
-- ("HCGate-RealDB-unclassified-noop-<ts>" et al., RCA Adam 2026-07-16), plus the
-- write-guard families from lib/eva/chairman-decision-watcher.js so every chairman
-- SURFACE excludes them (the watcher deliberately stays narrower at its WRITE seam).
--
-- LOCKSTEP: this pattern list mirrors FIXTURE_NAME_PATTERNS in
-- lib/chairman/chairman-actionable.mjs — change BOTH in the same PR; pinned by
-- tests/integration/get-pending-chairman-items.contract.test.js parity assertions.
--
-- Everything except the fixture-exclusion block is byte-identical to
-- database/migrations/20260710_create_get_pending_chairman_items.sql.
--
-- APPLY (chairman-gated, requires_chairman_apply — same standing policy as the
-- 20260710 original):
--   node scripts/apply-migration.js database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql --prod-deploy
--   with the chairman @approved-by stamp.
--
-- ROLLBACK: re-apply database/migrations/20260710_create_get_pending_chairman_items.sql
-- (restores the previous pattern list; function signature unchanged).

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
    -- Fixture exclusion: exclude only rows POSITIVELY identified as fixture-linked.
    -- COALESCE(..., false) makes NULL venture name / dangling reference / RLS-invisible
    -- venture resolve to INCLUDE — a real pending decision must never vanish because its
    -- venture row is missing or unreadable (adversarial-review W2).
    -- SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002: extended with '%-realdb-%', '%-noop-%',
    -- 'parity-test-%', 'test-stub%', 'test-harness-%', 'ts-fixture-%',
    -- '\_pipeline\_test\_%', 'pipeline-test-%', 'gate-test-%' (real-path test suites whose
    -- ventures deliberately stay is_demo=false so decision minting works; surfaces filter them).
    AND NOT COALESCE(
      v.is_demo IS TRUE
      OR v.name LIKE '\_\_%'
      OR v.name ILIKE 'test venture%'
      OR v.name ILIKE '%citest%'
      OR v.name ILIKE 'canonical-source-test%'
      OR v.name ILIKE '%-realdb-%'
      OR v.name ILIKE '%-noop-%'
      OR v.name ILIKE 'parity-test-%'
      OR v.name ILIKE 'test-stub%'
      OR v.name ILIKE 'test-harness-%'
      OR v.name ILIKE 'ts-fixture-%'
      OR v.name ILIKE '\_pipeline\_test\_%'
      OR v.name ILIKE 'pipeline-test-%'
      OR v.name ILIKE 'gate-test-%'
    , false)
    AND (p_decision_type IS NULL OR d.decision_type = p_decision_type)
),
page AS (
  SELECT *
  FROM actionable
  ORDER BY
    CASE effective_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at ASC,
    id ASC -- unique tiebreaker: LIMIT/OFFSET pages must be deterministic (adversarial-review W1)
  LIMIT LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200)
  OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1)::bigint * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200)
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
  'page_size', LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200)
);
$$;

-- Least-privilege: strip the Postgres default PUBLIC EXECUTE before granting (security-agent review).
REVOKE EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_chairman_items(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.get_pending_chairman_items(text, integer, integer) IS
'Canonical chairman-actionable pending-items source (SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001; fixture patterns extended by SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002). Predicate is the shared artifact for QUEUE-POLLUTION-001 / PENDING-COUNT-SSOT-001 — change it here first. Envelope: {items,total,page,page_size}.';
