-- SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child A.3
-- Partial-implication CHECK: rows at status='active' must be RICH
-- (extracted_dimensions populated AND content > 500 chars).
-- Non-active rows pass by default (vacuously true) — this is load-bearing,
-- it prevents lockout of legacy draft / draft_seed / archived rows.
-- Pattern: status != X OR (rich predicates). Standard Postgres partial CHECK.
--
-- DEVIATION FROM SD SCOPE — NOT VALID added at execution time:
-- The SD declares "Backfill of 217 existing non-venture rich L2 docs (already
-- correct)" OUT OF SCOPE. Live DB inspection at apply time shows 27 pre-existing
-- non-venture active rows do NOT satisfy the rich predicate (5 long-content
-- rows with NULL extracted_dimensions including AUTONOMOUS-CONSULTANT-AGENT
-- 6986 chars, VISION-CHAIRMAN-WEB-UI-V2-001 26374 chars; plus 22 short stubs
-- from a legacy stub pipeline). Adding a strict CHECK would block apply.
--
-- NOT VALID is the standard Postgres pattern for this case: the constraint is
-- enforced for ALL future INSERT/UPDATE (the SD's intent — defense-in-depth at
-- the storage layer for the post-cutover pipeline) but pre-existing rows are
-- not retroactively validated. SD-scope smoke_test_steps.1 — which scopes to
-- venture_id IS NOT NULL — still returns 0 (it did even before this constraint,
-- once Child B.1 archived the 10 stubs).
--
-- The 27 legacy violators can be remediated in a follow-up SD by either
-- (a) re-running brainstorm-to-vision.mjs to populate extracted_dimensions, or
-- (b) demoting them to status='archived' or 'draft_seed'. Once clean, a single
-- ALTER TABLE ... VALIDATE CONSTRAINT eva_vision_documents_active_rich_check
-- promotes the gate from "future-only" to "all-row" without further migration.

ALTER TABLE eva_vision_documents ADD CONSTRAINT eva_vision_documents_active_rich_check
  CHECK (status != 'active' OR (extracted_dimensions IS NOT NULL AND char_length(content) > 500))
  NOT VALID;

COMMENT ON CONSTRAINT eva_vision_documents_active_rich_check ON eva_vision_documents IS
  'Storage-layer enforcement of L2 rich-shape contract: status=active requires extracted_dimensions populated AND content > 500 chars. Non-active rows (draft, draft_seed, superseded, archived) pass vacuously. Defense-in-depth alongside lifecycle-bridge consumer-layer refusal (SD Child C). Added NOT VALID at execution time — 27 pre-existing non-venture legacy rows violate the predicate; the constraint is enforced for all FUTURE writes and can be promoted to full enforcement via VALIDATE CONSTRAINT after a backfill SD.';
