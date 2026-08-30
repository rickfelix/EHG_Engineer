-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260830-280 — role_drain_sets: register 'parent_completion' for role='worker'.
--
-- WHY. lib/checkin/steps/directed-assignment.cjs:230's orchestrator-parent completion
-- exception is gated exactly on assignment.payload.kind === 'parent_completion'. That kind
-- was never seeded into role_drain_sets (20260720_role_drain_sets_STAGED.sql's worker seed
-- list), so lib/coordinator/dispatch.cjs's send-time warnIfUndrainedKindViaRegistry fired
-- "[target-drain] WARN: kind 'parent_completion' is not in role 'worker' drain set" on
-- every dispatch of a stranded orchestrator parent's completion (e.g. the
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001 dispatch to Hotel-5, 2026-08-30 17:2xZ).
--
-- TRACED, not just read (tests/unit/checkin/parent-completion-drain-set-trace.test.js):
-- lib/fleet/worker-status.cjs's getMessagesForSession — the actual function that fills
-- directed-assignment.cjs's pickClaimable — filters ONLY by target_session (+ optional
-- sinceIso/read/ack/expiry flags). It has no kind or drain-set awareness at all.
-- role_drain_sets / DRAIN_SETS is consulted EXCLUSIVELY at send time in dispatch.cjs, never
-- on this read path. So the warn was correct that the kind was unregistered, but the
-- delivery itself was never actually at risk of being silently dropped on this path — this
-- migration closes the false-positive warn; it is not a fix for a real drop.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) —
-- no schema change, no existing row touched.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('worker', 'parent_completion', 'QF-20260830-280')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
