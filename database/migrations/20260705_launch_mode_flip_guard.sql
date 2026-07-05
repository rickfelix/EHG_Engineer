-- Migration: launch_mode flip guard — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-1).
--
-- CHAIRMAN-GATED DDL (requires_chairman_apply=true stamped at sourcing): rides the
-- same chairman sitting bundle as 20260703_ventures_launch_mode.sql and
-- 20260705_launch_mode_audit.sql (apply order: column -> audit -> guard). NEVER
-- applied mid-EXEC. ADD COLUMN ... DEFAULT fires no row triggers, so the initial
-- column application cannot trip this guard.
--
-- Defense-in-depth behind lib/eva/launch-mode.js setLaunchMode (which resolves
-- decided_by from the authoritative chairman_decisions row):
--   UPDATE: a launch_mode change must SPEND (one-time-use, adversarial-review
--   hardening) a fresh chairman-audited launch_mode_audit ticket for the exact
--   venture + from->to transition. Consumed tickets cannot be replayed; two
--   racing flips cannot share one ticket.
--   INSERT: ventures are BORN simulated — inserting launch_mode='live' directly
--   is rejected (the clone/seed bypass class: a copied row image of a live
--   venture must not create a live-from-birth clone with no chairman decision).

CREATE OR REPLACE FUNCTION reject_unaudited_launch_mode_flip()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_id UUID;
BEGIN
  IF NEW.launch_mode IS DISTINCT FROM OLD.launch_mode THEN
    SELECT a.id INTO v_ticket_id
    FROM launch_mode_audit a
    WHERE a.venture_id = NEW.id
      AND a.from_mode = OLD.launch_mode
      AND a.to_mode = NEW.launch_mode
      AND LOWER(a.decided_by) LIKE '%chairman%'
      AND a.consumed_at IS NULL
      AND a.flipped_at > now() - INTERVAL '60 seconds'
    ORDER BY a.flipped_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_ticket_id IS NULL THEN
      RAISE EXCEPTION
        'launch_mode flip rejected: no fresh unconsumed chairman-audited launch_mode_audit ticket for venture % (% -> %). Use lib/eva/launch-mode.js setLaunchMode (SD-LEO-INFRA-LAUNCH-MODE-POLICY-002).',
        NEW.id, OLD.launch_mode, NEW.launch_mode;
    END IF;

    -- ONE-TIME-USE: spend the ticket in the same transaction as the flip.
    UPDATE launch_mode_audit SET consumed_at = now() WHERE id = v_ticket_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_unaudited_launch_mode_flip ON ventures;
CREATE TRIGGER trg_reject_unaudited_launch_mode_flip
  BEFORE UPDATE OF launch_mode ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION reject_unaudited_launch_mode_flip();

-- INSERT bypass guard: no venture is ever born live.
CREATE OR REPLACE FUNCTION reject_live_born_venture()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.launch_mode = 'live' THEN
    RAISE EXCEPTION
      'venture INSERT rejected: ventures are born simulated — going live is always a chairman-audited flip (SD-LEO-INFRA-LAUNCH-MODE-POLICY-002).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_live_born_venture ON ventures;
CREATE TRIGGER trg_reject_live_born_venture
  BEFORE INSERT ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION reject_live_born_venture();

COMMENT ON FUNCTION reject_unaudited_launch_mode_flip IS
  'SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: ventures.launch_mode may only change by spending a fresh unconsumed chairman-audited launch_mode_audit ticket (one-time-use). Defense-in-depth behind setLaunchMode.';
COMMENT ON FUNCTION reject_live_born_venture IS
  'SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: ventures are born simulated; INSERT with launch_mode=live is always rejected (clone/seed bypass class).';
