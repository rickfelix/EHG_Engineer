-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-FIX-MAKE-VENTURE-STAGE-001 (additive UP: view + flag column).
--
-- Drops the gate-debt view and the scaffolding flag. The column drop loses any
-- chairman-set is_scaffolding=true marks — acceptable for a rollback of the
-- feature itself; re-applying the UP restores the column at default false.

DROP VIEW IF EXISTS v_venture_gate_debt;

ALTER TABLE ventures DROP COLUMN IF EXISTS is_scaffolding;
