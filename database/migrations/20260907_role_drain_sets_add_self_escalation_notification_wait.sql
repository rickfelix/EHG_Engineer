-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260906-154 — role_drain_sets: register 'self_escalation' and
-- 'notification_permission_wait' for 'coordinator', whose JS floor (lib/fleet/worker-status.cjs
-- DRAIN_SETS) already gained both in the same PR.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement.
--
-- Both kinds were addressed to role=coordinator (self_escalation from
-- lib/fleet/self-wake-escalation.cjs, target_session='broadcast-coordinator';
-- notification_permission_wait from lib/hooks/notification-permission-wait-core.cjs) but absent
-- from every drain set — invisible to the coordinator's inbox readers until orphan-reroute-sweep
-- rescued them (measured: rerouted 2x each in 14 days, rows 55eb64df, 52d91091).
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'self_escalation', 'QF-20260906-154'),
  ('coordinator', 'notification_permission_wait', 'QF-20260906-154')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
