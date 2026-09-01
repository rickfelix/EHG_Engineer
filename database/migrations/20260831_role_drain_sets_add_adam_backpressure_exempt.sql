-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- QF-20260831-769 — role_drain_sets: register the 6 BACKPRESSURE_EXEMPT_KINDS for role='adam'.
--
-- WHY. lib/coordinator/dispatch.cjs's Adam-directed send guard rejects any payload.kind not in
-- ADAM_INBOX_KINDS (derived from DRAIN_SETS.adam) as DISPATCH_UNTYPED_ADAM_KIND — but
-- BACKPRESSURE_EXEMPT_KINDS ('collision_warning', 'amend_sd', 'disposition', 'retraction',
-- 'amend', 'supersede') were never registered there, so a coordinator send of one of these
-- kinds TO Adam was refused outright, leaving the coordinator zero lanes to Adam during
-- exactly the incidents (collisions, corrections, terminal dispositions) that need one.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('adam', 'collision_warning', 'QF-20260831-769'),
  ('adam', 'amend_sd', 'QF-20260831-769'),
  ('adam', 'disposition', 'QF-20260831-769'),
  ('adam', 'retraction', 'QF-20260831-769'),
  ('adam', 'amend', 'QF-20260831-769'),
  ('adam', 'supersede', 'QF-20260831-769')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
