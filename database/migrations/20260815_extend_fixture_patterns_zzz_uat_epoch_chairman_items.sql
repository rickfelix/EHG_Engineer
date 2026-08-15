-- SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 (FR-1)
-- Extend the fixture-venture exclusion in get_pending_chairman_items() with ZZZ_-prefixed,
-- UAT[-_]-anchored, and epoch-tail-suffixed fixture venture names.
--
-- MECHANISM CORRECTION (LEAD-phase, see SD metadata for full detail): this SD was originally
-- scoped around a claimed SQL-vs-JS-mirror divergence that direct verification refuted -- the
-- SQL (20260717 body, byte-identical here below it) and lib/chairman/chairman-actionable.mjs
-- FIXTURE_NAME_PATTERNS already agree with each other. The real, verified gap is that NEITHER
-- excludes ZZZ_/UAT/epoch-tail names, which a separate module (lib/governance/fixture-exclusion.mjs)
-- already covers correctly. The three new clauses below copy that module's proven-correct anchored
-- forms (FIXTURE_VENTURE_NAME_RE's ZZZ_ and UAT[-_] alternatives, EPOCH_TAIL_RE) verbatim -- this is
-- NOT a delegation/import (fixture-exclusion.mjs stays untouched per its own DO-NOT-COLLAPSE
-- docblock), just re-expressing the same proven regex forms as SQL clauses.
--
-- ANCHORED, NOT SUBSTRING: a cancelled QF (QF-20260807-014) already documents the general
-- defect CLASS this guards against -- unanchored substring patterns on this exact list
-- (the existing '-realdb-'/'-noop-'/'citest' clauses above) over-excluding real ventures it
-- measured (my-app-realdb-check, svc-noop-probe, citest-runner). ZZZ_ and UAT are
-- prefix-anchored; the epoch-tail is suffix-anchored with a 10+-digit minimum (no real
-- venture name ends in a raw epoch/run-id, per fixture-exclusion.mjs's own EPOCH_TAIL_RE
-- comment) -- specifically to avoid adding a same-class defect. The QF's own cited cases
-- remain unfixed by this migration -- out of scope, see that QF for detail.
--
-- LOCKSTEP: this pattern list mirrors FIXTURE_NAME_PATTERNS in lib/chairman/chairman-actionable.mjs
-- -- change BOTH in the same PR; pinned by tests/unit/chairman/fixture-pattern-parity.test.js and
-- tests/integration/get-pending-chairman-items.contract.test.js.
--
-- Everything except the 3 new fixture-exclusion clauses is byte-identical to
-- database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql (the current
-- live body).
--
-- CHAIRMAN-GATED. Per the SD family convention this file is a DELIVERABLE, not an applied change.
-- It is inert until the approver header below is filled with the approving bare email (must match
-- git user.email -- see scripts/lib/migration-guards.js APPROVED_BY_RE) and applied via
-- `node scripts/apply-migration.js`.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK. checkApproverFactor() fails closed on a missing header, so this
--     migration cannot be applied by accident. Do NOT fill this in on the SD's behalf.
--
-- ROLLBACK: re-apply database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql
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
    -- SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001: extended with 'ZZZ\_%' (prefix), 'UAT-%'/'UAT\_%'
    -- (prefix, 2 clauses since LIKE has no character class), and a POSIX ~ epoch-tail clause
    -- (LIKE/ILIKE cannot express a numeric-length anchor) — all copied verbatim from
    -- lib/governance/fixture-exclusion.mjs's proven-correct anchored forms.
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
      OR v.name ILIKE 'ZZZ\_%'
      OR v.name ILIKE 'UAT-%'
      OR v.name ILIKE 'UAT\_%'
      OR v.name ~ '[-:][0-9]{10,}$'
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
'Canonical chairman-actionable pending-items source (SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001; fixture patterns extended by SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002, then SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 for ZZZ_/UAT/epoch-tail). Predicate is the shared artifact for QUEUE-POLLUTION-001 / PENDING-COUNT-SSOT-001 — change it here first. Envelope: {items,total,page,page_size}.';
