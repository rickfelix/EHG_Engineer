-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260905-230 — role_drain_sets: register the new 'sweep_finding_alert' kind for
-- 'coordinator', whose JS floor (lib/fleet/worker-status.cjs DRAIN_SETS) already gained it in
-- the same PR.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 established).
--
-- lib/fleet/sweep-findings-sink.cjs is the only writer and only ever targets 'coordinator' —
-- stale-session-sweep.cjs's own console-only CONFLICTS/WARNINGS/SKIP_RESET findings now also
-- persist a per-run jsonl AND (deduped per finding, re-emitted every 6h while it persists) alert
-- the coordinator directly, closing the "detector whose findings have no sink" gap.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'sweep_finding_alert', 'QF-20260905-230')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
