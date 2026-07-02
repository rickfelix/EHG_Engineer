-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-3a)
--
-- Advisory (non-blocking) insert-time lint for session_coordination, plus a nullable
-- correlation_id column. No backfill of historical rows. RAISE NOTICE only -- never
-- rejects an insert (matches the bypass_ledger_advisory_vocab_trigger precedent
-- in 20260516130001_add_bypass_ledger.sql, not the blocking sd_type_change_governance
-- precedent in 20260202_sd_type_change_governance_fixed.sql).
--
-- Rationale: rather than converting all ~19 raw session_coordination producers to
-- route through insertCoordinationRow() (large, risky, still-incomplete coverage for
-- any future raw-insert site), this trigger catches every producer automatically
-- regardless of code path. Paired with a CI-enforced ESLint rule (separate change)
-- that blocks NEW raw inserts from being written going forward.

ALTER TABLE session_coordination ADD COLUMN IF NOT EXISTS correlation_id text;

COMMENT ON COLUMN session_coordination.correlation_id IS
  'Optional message id this row replies to / correlates with. Nullable -- no backfill '
  'for historical rows. SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D';

CREATE OR REPLACE FUNCTION session_coordination_insert_lint()
RETURNS TRIGGER AS $$
DECLARE
  known_sender_types text[] := ARRAY['orchestrator','worker','coordinator','sweep','manual','adam','solomon'];
  dup_count integer;
BEGIN
  IF NEW.sender_type IS NOT NULL AND NOT (NEW.sender_type = ANY(known_sender_types)) THEN
    RAISE NOTICE 'session_coordination_insert_lint: unrecognized sender_type "%" (id=%)', NEW.sender_type, NEW.id;
  END IF;

  IF NEW.correlation_id IS NULL THEN
    RAISE NOTICE 'session_coordination_insert_lint: missing correlation_id (id=%, subject=%)', NEW.id, NEW.subject;
  END IF;

  IF NEW.sender_session IS NOT NULL AND NEW.body IS NOT NULL THEN
    SELECT COUNT(*) INTO dup_count
    FROM session_coordination
    WHERE sender_session = NEW.sender_session
      AND body = NEW.body
      AND created_at > now() - interval '60 seconds';
    IF dup_count > 0 THEN
      RAISE NOTICE 'session_coordination_insert_lint: duplicate body from sender_session=% within 60s (id=%)', NEW.sender_session, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION session_coordination_insert_lint() IS
  'Advisory (non-blocking, RAISE NOTICE only) insert-time lint for session_coordination: '
  'unrecognized sender_type, missing correlation_id, duplicate body within 60s. Never '
  'rejects an insert. SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D';

DROP TRIGGER IF EXISTS trg_session_coordination_insert_lint ON session_coordination;
CREATE TRIGGER trg_session_coordination_insert_lint
  BEFORE INSERT ON session_coordination
  FOR EACH ROW
  EXECUTE FUNCTION session_coordination_insert_lint();
