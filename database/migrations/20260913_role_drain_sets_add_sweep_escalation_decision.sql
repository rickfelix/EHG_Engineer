-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260913-426 — role_drain_sets: register the 'sweep_escalation_decision' kind for
-- 'coordinator', whose JS floor (lib/fleet/worker-status.cjs DRAIN_SETS) already gained it in
-- the same fix.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's 1:1
-- seed-parity enforcement (the same discipline QF-20260903-281 established).
--
-- lib/fleet/sweep-consecutive-escalation.cjs sends this kind to 'broadcast-coordinator' asking
-- for a human decision (claim, correct, or reply recording why) after ESCALATE_AFTER consecutive
-- appearances of the same finding — it was never registered when that mechanism shipped
-- (QF-20260905-594), the same defect shape as the reaper-alert/sweep-finding gaps this table's
-- other additive migrations already closed. Found via QF-20260913-426's regression sweep for the
-- drain-set WARN-\>REFUSE tightening: without this registration, the send-time check would now
-- REFUSE the insert instead of silently warning, breaking the escalation mechanism outright.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'sweep_escalation_decision', 'QF-20260913-426')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
