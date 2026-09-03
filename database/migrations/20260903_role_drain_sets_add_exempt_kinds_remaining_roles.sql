-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260903-281 — role_drain_sets: register the 6 BACKPRESSURE_EXEMPT_KINDS for the THREE
-- roles that still lack them: 'coordinator', 'solomon', 'worker'.
--
-- WHY. lib/coordinator/dispatch.cjs deliberately lets these six kinds past the unanswered-
-- directed-row limit BECAUSE corrections must always get through. QF-20260831-769 registered
-- them for role='adam' only. The other three roles had NO lane to surface any of them, so a
-- kind that is backpressure-exempt on SEND was orphaned by construction on RECEIVE — it lands,
-- the generic surface stamps read_at and even acknowledged_at, and it never appears in the
-- inbox anyone actually works from.
--
-- MEASURED CONSEQUENCE, 2026-09-03: a coordinator retraction of a budget advisory was delivered
-- 19:12:51 and stamped read 19:15:02, while the advisory it cancelled was read 19:20:56 and
-- acted upon — six worker seats throttled on an instruction its author had already withdrawn,
-- against a standing chairman ruling. A correction that cannot reach the party correcting
-- course is not a correction.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns
-- a UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The companion change
-- in lib/fleet/worker-status.cjs adds these kinds to the JS floor, which is what delivers the
-- behaviour immediately and independently of whether this migration is ever applied. This file
-- exists so the two surfaces do not drift — the repo enforces 1:1 seed parity in
-- tests/unit/fleet/drain-set-registry.test.js, and a floor entry with no seed row is precisely
-- the drift that made three seats give three different confident answers about this set.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'collision_warning', 'QF-20260903-281'),
  ('coordinator', 'amend_sd', 'QF-20260903-281'),
  ('coordinator', 'disposition', 'QF-20260903-281'),
  ('coordinator', 'retraction', 'QF-20260903-281'),
  ('coordinator', 'amend', 'QF-20260903-281'),
  ('coordinator', 'supersede', 'QF-20260903-281'),
  ('solomon', 'collision_warning', 'QF-20260903-281'),
  ('solomon', 'amend_sd', 'QF-20260903-281'),
  ('solomon', 'disposition', 'QF-20260903-281'),
  ('solomon', 'retraction', 'QF-20260903-281'),
  ('solomon', 'amend', 'QF-20260903-281'),
  ('solomon', 'supersede', 'QF-20260903-281'),
  ('worker', 'collision_warning', 'QF-20260903-281'),
  ('worker', 'amend_sd', 'QF-20260903-281'),
  ('worker', 'disposition', 'QF-20260903-281'),
  ('worker', 'retraction', 'QF-20260903-281'),
  ('worker', 'amend', 'QF-20260903-281'),
  ('worker', 'supersede', 'QF-20260903-281')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
