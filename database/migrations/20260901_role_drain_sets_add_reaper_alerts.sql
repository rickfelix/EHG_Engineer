-- @approved-by: PENDING — chairman-gated apply required (do NOT apply outside it)
-- SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B — role_drain_sets: register the 4 reaper alert
-- kinds for role='coordinator'.
--
-- WHY. Chairman-ordered RCA 9a02a76d-96d9-4134-a185-1a089c1120a5 traced the 2026-09-01
-- 14.6h fleet output stall to reaper_starvation_alert (and its siblings
-- reaper_census_blind_alert / reaper_not_invoked_alert / reaper_rebuild_churn_alert,
-- lib/coordinator/coordination-events.cjs) never being registered in role_drain_sets for
-- 'coordinator' — the ONE alarm that fired during the incident was structurally
-- undeliverable and only survived by way of orphan-reroute-sweep's rescue, which strips
-- its severity in the process (see lib/fleet/orphan-reroute-sweep.js's severity-preserving
-- fix, same SD). Registering these here closes the undeliverable-alarm root cause directly.
--
-- Purely additive (ON CONFLICT DO NOTHING, matching the seed migration's own pattern) — no
-- schema change, no existing row touched.

INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'reaper_starvation_alert', 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B'),
  ('coordinator', 'reaper_census_blind_alert', 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B'),
  ('coordinator', 'reaper_not_invoked_alert', 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B'),
  ('coordinator', 'reaper_rebuild_churn_alert', 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B')
ON CONFLICT (role, kind, direction) DO NOTHING;

NOTIFY pgrst, 'reload schema';
