-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G — role_drain_sets: register the new
-- 'michael_handoff' kind for role='michael', whose JS floor (lib/fleet/worker-status.cjs
-- PAYLOAD_KINDS.MICHAEL_HANDOFF + DRAIN_SETS.michael) already gained it in the same PR.
--
-- RELATIONSHIP TO THE JS FLOOR. lib/fleet/drain-set-registry.js resolveRecognizedKinds returns a
-- UNION: [...new Set([...DRAIN_SETS[role], ...role_drain_sets rows])]. The JS floor delivers the
-- behaviour immediately and independently of whether this migration is ever applied; this file
-- exists so the two surfaces do not drift, per tests/unit/fleet/drain-set-registry.test.js's
-- targeted michael_handoff parity check.
--
-- Required per the chairman-ratified Solomon Q6 adjudication (docs/michael/05-SOLOMON-
-- ADJUDICATION.md): "michael_handoff as a new kind is acceptable only if registered in the same
-- PR everywhere the challenge lists (PAYLOAD_KINDS, DRAIN_SETS.michael, the DB drain-set registry,
-- declaredAddresseeRole, peer-target.cjs)" — a partial registration is the untyped-row class.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched, no role's existing kinds altered.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('michael', 'michael_handoff', 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
