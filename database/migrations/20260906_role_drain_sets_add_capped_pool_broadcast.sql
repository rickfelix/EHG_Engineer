-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-2 — role_drain_sets: register
-- the new 'capped_pool_broadcast' kind for all four roles, whose JS floor
-- (lib/fleet/worker-status.cjs DRAIN_SETS) already gained it via BACKPRESSURE_EXEMPT_KINDS.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 and QF-20260906-162 established).
--
-- All four roles, not worker-only: capped_pool_broadcast joined lib/fleet/worker-status.cjs's
-- BACKPRESSURE_EXEMPT_KINDS (mirroring the send-time exemption in lib/coordinator/dispatch.cjs,
-- which lets a fleet-wide over-cap notice bypass a busy seat's backlog cap) — and per the same
-- precedent, any kind in that shared constant is spread into EVERY role's drain set, universally
-- drainable, even though today only the worker role is ever actually routed this kind.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the prior seed migrations' own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('solomon', 'capped_pool_broadcast', 'SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001'),
  ('adam', 'capped_pool_broadcast', 'SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001'),
  ('coordinator', 'capped_pool_broadcast', 'SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001'),
  ('worker', 'capped_pool_broadcast', 'SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
