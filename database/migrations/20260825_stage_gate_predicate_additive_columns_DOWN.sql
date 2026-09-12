-- DOWN for 20260825_stage_gate_predicate_additive_columns.sql (ceremony f, 2026-09-12): drops the two additive columns. Not auto-applied.
ALTER TABLE chairman_decisions DROP COLUMN IF EXISTS override_key;
ALTER TABLE quick_fixes DROP COLUMN IF EXISTS venture_id;
