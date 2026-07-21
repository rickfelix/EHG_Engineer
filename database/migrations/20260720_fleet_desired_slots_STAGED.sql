-- SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-1) — fleet_desired_slots.
-- STAGED / chairman-gated apply (additive-only). Pattern precedent:
-- 20260719_coordinator_succession_STAGED.sql (DO-block self-verify BEFORE COMMIT
-- + _DOWN companion) and 20260720_role_drain_sets_STAGED.sql (RLS-at-create,
-- service-role-only posture).
--
-- FR-1: fleet_desired_slots — the FROZEN desired-state slot manifest that
-- reboot-respawn spawns FROM. Sibling B shipped the pure slot core
-- (lib/fleet/session-manifest.js normalizeDesiredSlots/computeSlotDrift) and the
-- live-drift adapter (loadLiveSlotIdentity) but NOTHING stored the desired set, so
-- a host reboot (zero live sessions) had no manifest to read. This table is that
-- manifest: one row per chairman-editable slot, keyed by `name`, mirroring the
-- exact shape normalizeDesiredSlots normalizes.
--
-- Code paths (lib/fleet/desired-slots-store.js loadDesiredSlots) FAIL-SOFT with a
-- loud stderr canary (return [] on table-absent) while this migration is merged-
-- but-unapplied — so the reboot-respawn mechanism + its in-session drill are
-- deliverable and testable BEFORE the chairman gate has fired (against a fixture
-- or manually-seeded manifest). Applying this migration makes this table the SSOT
-- for the desired slot set.
--
-- RLS ships IN THIS SAME MIGRATION (hard repo rule: RLS-at-create). Posture is
-- SERVICE-ROLE ONLY, matching the recent-migration precedent (role_drain_sets /
-- coordinator_succession): this table holds fleet-internal coordination vocabulary
-- read (loadDesiredSlots) and written (upsertDesiredSlot / captureResumeUuid)
-- EXCLUSIVELY by service-role clients; there is no authenticated/anon consumer. An
-- unconditional authenticated USING(true) read is the SD-LEO-GEN-SCOPE-ANON-KEY-001
-- / rls-anon-tenant-predicate-lint violation class, so no authenticated policy is
-- created (deliberate deviation from a naive "authenticated read" default; if a UI
-- reader is ever added, gate it with a scoped predicate, never USING(true)).

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_desired_slots (
  -- `name` is the stable, chairman-editable slot key reboot-respawn + the
  -- reconciliation loop diff against (mirrors normalizeDesiredSlots's name-required
  -- filter). PRIMARY KEY => implicitly UNIQUE and the upsert conflict target.
  name            text PRIMARY KEY,
  color           text NULL,
  role            text NULL,
  account_profile text NULL,
  model           text NULL,
  effort          text NULL,
  worktree        text NULL,
  -- The captured Claude Code session UUID (claude_sessions.session_id) that
  -- `claude --resume <uuid>` reattaches to after a reboot. NULL until captured.
  resume_uuid     text NULL,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot path: loadDesiredSlots reads enabled slots to build the respawn roster.
CREATE INDEX IF NOT EXISTS idx_fleet_desired_slots_enabled
  ON fleet_desired_slots (name) WHERE enabled = true;

ALTER TABLE fleet_desired_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY fleet_desired_slots_service_role_all ON fleet_desired_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Self-verify (BEFORE COMMIT, so an ASSERT failure rolls back atomically) ──
DO $verify$
DECLARE
  rls_enabled boolean;
BEGIN
  ASSERT to_regclass('public.fleet_desired_slots') IS NOT NULL,
    'fleet_desired_slots missing after create';
  SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid = 'public.fleet_desired_slots'::regclass;
  ASSERT rls_enabled, 'RLS not enabled on fleet_desired_slots';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'fleet_desired_slots') = 1,
    'fleet_desired_slots must have exactly 1 policy (service-role-only)';
END
$verify$;

COMMIT;
