-- Migration: launch_mode flip guard — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-1).
--
-- CHAIRMAN-GATED DDL (requires_chairman_apply=true stamped at sourcing): rides the
-- same chairman sitting bundle as 20260703_ventures_launch_mode.sql and
-- 20260705_launch_mode_audit.sql. NEVER applied mid-EXEC.
--
-- Defense-in-depth behind lib/eva/launch-mode.js setLaunchMode (which enforces the
-- chairman decided_by allowlist in code): a launch_mode UPDATE is rejected unless a
-- matching AUDIT-FIRST row (same venture, same from->to transition, chairman
-- decided_by) landed within the last 60 seconds. Direct service-role writes that
-- bypass the code path therefore fail — the flip is only reachable through the
-- audited, allowlisted lane. Mirrors the reject_s16_programmatic_approval guard
-- pattern (20260320/20260411 migrations).

CREATE OR REPLACE FUNCTION reject_unaudited_launch_mode_flip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.launch_mode IS DISTINCT FROM OLD.launch_mode THEN
    IF NOT EXISTS (
      SELECT 1 FROM launch_mode_audit a
      WHERE a.venture_id = NEW.id
        AND a.from_mode = OLD.launch_mode
        AND a.to_mode = NEW.launch_mode
        AND LOWER(a.decided_by) LIKE '%chairman%'
        AND a.flipped_at > now() - INTERVAL '60 seconds'
    ) THEN
      RAISE EXCEPTION
        'launch_mode flip rejected: no fresh chairman-audited launch_mode_audit row for venture % (% -> %). Use lib/eva/launch-mode.js setLaunchMode (SD-LEO-INFRA-LAUNCH-MODE-POLICY-002).',
        NEW.id, OLD.launch_mode, NEW.launch_mode;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_unaudited_launch_mode_flip ON ventures;
CREATE TRIGGER trg_reject_unaudited_launch_mode_flip
  BEFORE UPDATE OF launch_mode ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION reject_unaudited_launch_mode_flip();

COMMENT ON FUNCTION reject_unaudited_launch_mode_flip IS
  'SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: ventures.launch_mode may only change with a fresh chairman-audited launch_mode_audit row (audit-first lane). Defense-in-depth behind the code-level allowlist in setLaunchMode.';
