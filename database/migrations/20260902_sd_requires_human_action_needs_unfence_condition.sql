-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-FIX-HUMAN-ACTION-FENCES-001
--
-- WHY. Live re-measurement (2026-09-02) found 3 of 8 current requires_human_action holds on
-- strategic_directives_v2 created THAT SAME DAY with zero requires_human_action_reason and zero
-- metadata.unfence_condition — proving the write chokepoint this SD's code fix adds (setHold(),
-- lib/fleet/claim-eligibility.cjs) is not itself enough: the existing mergeMetadataKeys/
-- checkDeciderPairing guard was demonstrably bypassed for all three (a raw metadata write skips
-- any application-layer function entirely). A DB CHECK constraint is the one layer a raw write
-- cannot route around.
--
-- PRECEDENT (same table, same shape, already live): chk_deferred_requires_trigger_condition
-- (database/migrations/20260412_deferred_sd_audit_trigger.sql) requires do_not_advance_without_trigger
-- carry a trigger_condition. This constraint applies the identical pattern to the sibling flag
-- requires_human_action / unfence_condition.
--
-- SCOPE GUARD, and why NOT VALID + a status predicate (the precedent constraint has neither): ~106
-- rows across all statuses currently carry requires_human_action=true, most from cancelled/legacy
-- backfill with no unfence_condition — a blanket CHECK would fail to add. NOT VALID lets the
-- constraint apply to future writes immediately without validating the historical backlog; the
-- non-terminal-status predicate additionally narrows enforcement to the live, dispatchable set
-- (completed/cancelled/deferred rows are settled history, not something anyone can re-fence).

ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS chk_human_action_requires_unfence_condition;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT chk_human_action_requires_unfence_condition
  CHECK (
    NOT (
      (metadata->>'requires_human_action')::boolean = true
      AND metadata->'unfence_condition' IS NULL
      AND status NOT IN ('completed', 'cancelled', 'deferred')
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT chk_human_action_requires_unfence_condition ON strategic_directives_v2
  IS 'Prevents setting requires_human_action=true without a metadata.unfence_condition on a non-terminal-status row. NOT VALID: applies to new/updated rows only, does not retroactively validate the ~106-row legacy backlog.';
