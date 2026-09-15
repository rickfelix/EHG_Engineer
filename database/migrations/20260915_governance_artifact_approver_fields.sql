-- SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 FR-1 -- approver-identity columns, distinct from
-- chairman_approved, on the two governance-artifact tables.
-- Target DB: EHG_Engineer

ALTER TABLE eva_architecture_plans ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE eva_architecture_plans ADD COLUMN IF NOT EXISTS approved_by_at TIMESTAMPTZ;

ALTER TABLE eva_vision_documents ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE eva_vision_documents ADD COLUMN IF NOT EXISTS approved_by_at TIMESTAMPTZ;

COMMENT ON COLUMN eva_architecture_plans.approved_by IS
  'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001. Identity of the seat that approved this plan, distinct from created_by (the author) and from chairman_approved (a separate boolean the chairman himself flips). NULL means no distinct-seat approval has been recorded yet -- never a guessed value. Written only by lib/eva/archplan-promote.js promoteArchPlan(), never by the authoring write path.';

COMMENT ON COLUMN eva_architecture_plans.approved_by_at IS
  'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001. Timestamp of the approved_by approval. NULL iff approved_by is NULL.';

COMMENT ON COLUMN eva_vision_documents.approved_by IS
  'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001. Identity of the seat that approved this vision document, distinct from created_by (the author) and from chairman_approved. NULL means no distinct-seat approval has been recorded yet -- never a guessed value. Written only by lib/eva/vision-promote.js promoteVisionDocument(), never by the authoring write path.';

COMMENT ON COLUMN eva_vision_documents.approved_by_at IS
  'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001. Timestamp of the approved_by approval. NULL iff approved_by is NULL.';
