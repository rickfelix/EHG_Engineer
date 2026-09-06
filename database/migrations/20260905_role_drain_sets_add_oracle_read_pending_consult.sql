-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-2) — role_drain_sets: register
-- 'oracle_read_pending_consult' for the 'solomon' role.
--
-- WHY. Solomon's registered drain set recognizes 'solomon_consult' (lib/fleet/worker-status.cjs
-- DRAIN_SETS) while scripts/cron/batch-mint-sweep.mjs's openConsultRow() writes the differently-
-- named 'oracle_read_pending_consult' -- a naming collision, not a missing registration slot.
-- Live-measured: zero role_drain_sets rows matched kind ILIKE '%oracle%' for any role before this
-- migration. The consequence: every batch-mint consult row surfaced only via Solomon's
-- orphan-catcher rather than as a recognized consult, so the review it solicits could never
-- happen by construction (SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001's core finding).
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])] -- a single DB row is
-- sufficient to register a new kind; the JS floor in worker-status.cjs is deliberately NOT
-- touched (per the chairman's "one registry row" framing on this defect family, ratification
-- 76a3c081).
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) -- no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('solomon', 'oracle_read_pending_consult', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
