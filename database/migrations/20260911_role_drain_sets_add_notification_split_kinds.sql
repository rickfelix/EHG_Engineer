-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260911-078 — role_drain_sets: register 'notification_idle_prompt' and
-- 'notification_usage_limit_reset' for 'coordinator', whose JS floor
-- (lib/fleet/worker-status.cjs DRAIN_SETS) already gained both in the same PR.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement.
--
-- Both kinds are the notification_permission_wait split (QF-20260911-078's
-- classifyNotificationKind, lib/hooks/notification-permission-wait-core.cjs): the original kind
-- over-counted frozen seats ~5.3x because it never inspected notification_type, lumping idle/
-- resume notifications in with genuine permission waits. The split kinds are addressed to
-- role=coordinator exactly like the original (the SAME QF-20260906-154 visibility gap would
-- reappear for them without this registration).
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'notification_idle_prompt', 'QF-20260911-078'),
  ('coordinator', 'notification_usage_limit_reset', 'QF-20260911-078')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
