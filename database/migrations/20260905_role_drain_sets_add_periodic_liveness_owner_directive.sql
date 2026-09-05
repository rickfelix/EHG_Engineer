-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-1 — role_drain_sets: register the new
-- 'periodic_liveness_owner_directive' DIRECTIVE_KINDS entry for the four roles whose JS floor
-- (lib/fleet/worker-status.cjs DRAIN_SETS, which spreads ...DIRECTIVE_KINDS) already gained it.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 established).
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('adam', 'periodic_liveness_owner_directive', 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001'),
  ('solomon', 'periodic_liveness_owner_directive', 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001'),
  ('coordinator', 'periodic_liveness_owner_directive', 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001'),
  ('worker', 'periodic_liveness_owner_directive', 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
