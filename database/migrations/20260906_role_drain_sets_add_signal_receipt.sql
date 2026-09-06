-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260906-162 — role_drain_sets: register the new 'signal_receipt' kind for all four
-- roles, whose JS floor (lib/fleet/worker-status.cjs DRAIN_SETS) already gained it.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 established).
--
-- All four roles, not worker-only: signal_receipt joined lib/fleet/worker-status.cjs's
-- BACKPRESSURE_EXEMPT_KINDS (mirroring the send-time exemption in lib/coordinator/dispatch.cjs,
-- which lets a receipt bypass a busy target's backlog cap) — and per QF-20260903-281's own
-- precedent (tests/unit/fleet/drain-sets-adam-reconciliation.test.js), any kind in that shared
-- constant is spread into EVERY role's drain set, universally drainable, even though today only
-- the worker role is ever actually routed a signal_receipt row.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('solomon', 'signal_receipt', 'QF-20260906-162'),
  ('adam', 'signal_receipt', 'QF-20260906-162'),
  ('coordinator', 'signal_receipt', 'QF-20260906-162'),
  ('worker', 'signal_receipt', 'QF-20260906-162')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
