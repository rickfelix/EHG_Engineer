-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A / substrate) — role_drain_sets.
-- STAGED / chairman-gated apply (additive-only). Pattern precedent:
-- 20260719_coordinator_succession_STAGED.sql (DO-block self-verify BEFORE COMMIT
-- + _DOWN companion). Code paths (lib/fleet/drain-set-registry.js) FAIL-OPEN with
-- a loud stderr canary while this migration is merged-but-unapplied — applying it
-- makes this table the SSOT for per-role recognized-kinds instead of the
-- hard-coded DRAIN_SETS constant in lib/fleet/worker-status.cjs.
--
-- FR-1: role_drain_sets — the per-role recognized message-kind registry that
-- lib/coordinator/dispatch.cjs's send-time WARN validator (repointed in this
-- same SD, see lib/fleet/drain-set-registry.js) will consume once applied.
--
-- RLS ships IN THIS SAME MIGRATION (hard repo rule: RLS-at-create). Posture is
-- SERVICE-ROLE ONLY: this table holds fleet-internal coordination vocabulary
-- read and written exclusively by service-role clients; no authenticated/anon
-- policy exists at all (outside rls-anon-tenant-predicate-lint's scoped roles
-- by construction — same posture as coordinator_role_history/coordinator_follow_ons
-- above).

BEGIN;

CREATE TABLE IF NOT EXISTS role_drain_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,
  kind        text NOT NULL,
  direction   text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  provenance  text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_drain_sets_role_kind_direction_key UNIQUE (role, kind, direction)
);

-- Hot path: resolveRecognizedKinds({role}) filters role + status='active' + direction='inbound'.
CREATE INDEX IF NOT EXISTS idx_role_drain_sets_role_active
  ON role_drain_sets (role, direction) WHERE status = 'active';

ALTER TABLE role_drain_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_drain_sets_service_role_all ON role_drain_sets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed: reconciled R2 vocabulary ───────────────────────────────────────────
-- Ported verbatim from lib/fleet/worker-status.cjs's DRAIN_SETS constant
-- (direction='inbound', status='active'), PLUS the two reconciliation fixes
-- Solomon pinned explicitly (provenance below distinguishes ported-vs-fixed rows).

-- solomon: DIRECTIVE_KINDS + solomon_consult + comms_check (mirrors SOLOMON_INBOX_KINDS)
INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('solomon', 'coordinator_request',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'work_assignment',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'adam_action_required',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'coordinator_reminder',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'coordinator_to_adam',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'coordinator_directive',   'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'chairman_directive',      'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'fence_notice',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'review_request',          'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'solomon_consult',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('solomon', 'comms_check',             'lib/fleet/worker-status.cjs DRAIN_SETS'),
  -- R2 reconciliation fix #1: Solomon's own oracle-answer replies ride adam_advisory
  -- (scripts/solomon-advisory.cjs, payload.oracle=true) but his drain set never
  -- recognized it -- the "founding defect" this SD closes.
  ('solomon', 'adam_advisory',           'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001 R2 vocab reconciliation'),
  -- R2 reconciliation fix #2 (Solomon pin 1): pre-registered before any sender
  -- exists, so a future emitter is recognized on day one with no registry update.
  ('solomon', 'solomon_systemic_finding', 'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001 R2 vocab reconciliation (Solomon pin 1)')
ON CONFLICT (role, kind, direction) DO NOTHING;

-- adam: DIRECTIVE_KINDS + adam_advisory + coordinator_reply + canary_request + comms_check + cross_party_ping
INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('adam', 'coordinator_request',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'work_assignment',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'adam_action_required',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'coordinator_reminder',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'coordinator_to_adam',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'coordinator_directive',   'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'chairman_directive',      'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'fence_notice',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'review_request',          'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'adam_advisory',           'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'coordinator_reply',       'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'canary_request',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'comms_check',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('adam', 'cross_party_ping',       'lib/fleet/worker-status.cjs DRAIN_SETS')
ON CONFLICT (role, kind, direction) DO NOTHING;

-- coordinator: DIRECTIVE_KINDS + roll_call + coordinator_reply + adam_advisory + relay_request + relay_confirm + cross_party_ping + solomon_consult
INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('coordinator', 'coordinator_request',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'work_assignment',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'adam_action_required',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'coordinator_reminder',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'coordinator_to_adam',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'coordinator_directive',   'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'chairman_directive',      'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'fence_notice',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'review_request',          'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'roll_call',               'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'coordinator_reply',       'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'adam_advisory',           'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'relay_request',           'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'relay_confirm',           'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'cross_party_ping',        'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('coordinator', 'solomon_consult',         'lib/fleet/worker-status.cjs DRAIN_SETS')
ON CONFLICT (role, kind, direction) DO NOTHING;

-- worker: DIRECTIVE_KINDS + coordinator_reply + coordinator_reservation + seat_busy_reservation
--         + comms_check + completion_nudge + CLAIM_RELEASED + SET_IDENTITY + claim_released
INSERT INTO role_drain_sets (role, kind, provenance) VALUES
  ('worker', 'coordinator_request',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'work_assignment',         'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'adam_action_required',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'coordinator_reminder',    'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'coordinator_to_adam',     'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'coordinator_directive',   'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'chairman_directive',      'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'fence_notice',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'review_request',          'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'coordinator_reply',       'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'coordinator_reservation', 'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'seat_busy_reservation',   'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'comms_check',             'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'completion_nudge',        'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'CLAIM_RELEASED',          'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'SET_IDENTITY',            'lib/fleet/worker-status.cjs DRAIN_SETS'),
  ('worker', 'claim_released',          'lib/fleet/worker-status.cjs DRAIN_SETS')
ON CONFLICT (role, kind, direction) DO NOTHING;

-- ── Self-verify (BEFORE COMMIT, so an ASSERT failure rolls back atomically) ──
DO $verify$
DECLARE
  rls_enabled boolean;
  row_count   integer;
BEGIN
  ASSERT to_regclass('public.role_drain_sets') IS NOT NULL,
    'role_drain_sets missing after create';
  SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid = 'public.role_drain_sets'::regclass;
  ASSERT rls_enabled, 'RLS not enabled on role_drain_sets';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'role_drain_sets') = 1,
    'role_drain_sets must have exactly 1 policy (service-role-only)';
  SELECT count(*) INTO row_count FROM role_drain_sets;
  -- 13 (solomon, incl. 2 R2 reconciliation fixes) + 14 (adam) + 16 (coordinator)
  -- + 17 (worker) = 60 seed rows.
  ASSERT row_count = 60, format('expected 60 seed rows, got %s', row_count);
END
$verify$;

COMMIT;
