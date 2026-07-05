-- requires-chairman-apply
-- SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-3): activation-evidence columns on
-- scope_completion_chain. STAGED, NOT APPLIED — scope_completion_chain carries an
-- @approved-by tag (see 20260516130000_add_scope_completion_chain.sql), so this ALTER is
-- chairman-gated per repo convention. Application code (checkActivationEvidence in
-- scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js)
-- fails open (returns false, never throws) if these columns do not yet exist, so nothing
-- breaks pre-approval.
--
-- real_event_ref: id/correlation id of the real production event this row evidences.
-- evidence_kind: advisory (non-blocking trigger) vocab distinguishing a genuine production
-- event from a replayed test fixture — a replayed_fixture row must NOT satisfy G3's
-- ACTIVATED requirement.

ALTER TABLE scope_completion_chain
  ADD COLUMN IF NOT EXISTS real_event_ref TEXT,
  ADD COLUMN IF NOT EXISTS evidence_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_scope_completion_chain_evidence_kind ON scope_completion_chain (evidence_kind);

-- Advisory-only vocab check (mirrors bypass_ledger's non-blocking vocab trigger convention) —
-- does NOT block writes; future vocab additions need no migration.
CREATE OR REPLACE FUNCTION scope_completion_chain_evidence_kind_advisory_trigger()
RETURNS trigger AS $$
DECLARE
  known_vocab TEXT[] := ARRAY['real_event', 'replayed_fixture', 'armed_declaration'];
BEGIN
  IF NEW.evidence_kind IS NOT NULL AND NOT (NEW.evidence_kind = ANY(known_vocab)) THEN
    RAISE NOTICE 'scope_completion_chain: advisory — evidence_kind ''%'' not in known vocab list %', NEW.evidence_kind, known_vocab;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scope_completion_chain_evidence_kind_advisory ON scope_completion_chain;
CREATE TRIGGER scope_completion_chain_evidence_kind_advisory
  BEFORE INSERT OR UPDATE ON scope_completion_chain
  FOR EACH ROW EXECUTE FUNCTION scope_completion_chain_evidence_kind_advisory_trigger();

COMMENT ON COLUMN scope_completion_chain.real_event_ref IS 'G3 (SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001): id/correlation id of the real production event this row evidences.';
COMMENT ON COLUMN scope_completion_chain.evidence_kind IS 'G3 (SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001): advisory vocab (real_event | replayed_fixture | armed_declaration) — a replayed_fixture row does NOT satisfy the ACTIVATED requirement.';
