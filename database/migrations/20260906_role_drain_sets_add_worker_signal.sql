-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-3) — role_drain_sets: register the new
-- 'worker_signal' kind for coordinator/solomon/michael/adam, whose JS floor
-- (lib/fleet/worker-status.cjs DRAIN_SETS) already gained it in the same PR.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 established).
--
-- worker-signal.cjs's default (no --to) target is the coordinator, so 'coordinator' is the
-- load-bearing row; solomon/michael/adam are added too since --to can route a /signal to any of
-- them and the send-time target-drain warn (lib/fleet/worker-status.cjs warnIfUndrainedKind /
-- lib/fleet/drain-set-registry.js warnIfUndrainedKindViaRegistry) is WARN-only but otherwise
-- would fire a spurious "may orphan at the target" log line on those paths. 'worker' is
-- deliberately NOT added — worker-signal.cjs never targets the worker role.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'worker_signal', 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001'),
  ('solomon', 'worker_signal', 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001'),
  ('michael', 'worker_signal', 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001'),
  ('adam', 'worker_signal', 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
