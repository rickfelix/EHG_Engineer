-- SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg) -- sealed-prediction registry + firing-verification
-- record store, per docs/design/kill-gate-teeth-proof-spec.md.
--
-- ============================================================================================
-- WHY TWO TABLES, NOT ONE
-- ============================================================================================
-- `kill_gate_sealed_predictions` -- Solomon-writable, tamper-evident sealed kill-predictions
--   (§3.4/§4: "sealed instances live outside the repo, hashes only"; predictions never touch
--   fleet-visible surfaces pre-run). The traversal side (any code executing a venture's stage
--   advancement) MUST NOT be able to read an undischarged row's content -- that is the whole
--   point of sealing. See the blindness mechanism below.
-- `kill_gate_teeth_proof_records` -- the OUTPUT of the firing-verification harness: one row per
--   gated-stage crossing, comparing the (post-discharge) sealed prediction against the actual
--   gate behavior observed on `system_events` (the pinned primary observation surface -- see
--   lib/eva/kill-gate-teeth/firing-verification.js header comment for why).
--
-- ============================================================================================
-- TWO-SIDED BLINDNESS MECHANISM -- READ THIS BEFORE MODIFYING GRANTS
-- ============================================================================================
-- This codebase's real DB access pattern (lib/supabase-client.js) is a SINGLE shared
-- SUPABASE_SERVICE_ROLE_KEY used by nearly all server-side code (scripts, lib/eva/**, the
-- stage-execution worker). The Postgres `service_role` in Supabase carries BYPASSRLS, so an
-- RLS-policy-only blindness mechanism (`ENABLE ROW LEVEL SECURITY` + a `USING (discharged_at IS
-- NOT NULL)` policy) would be a NO-OP against that role -- it would be a fixture that "runs but
-- cannot observe its subject" (this codebase's own named class of blind guard). RLS-based
-- blindness was rejected for that reason.
--
-- Instead this uses PRIVILEGE-based blindness, which service_role's BYPASSRLS does NOT defeat
-- (BYPASSRLS only skips row-security policies; it does not grant table privileges that were
-- never GRANTed):
--   1. A dedicated, non-superuser, NOLOGIN, NOINHERIT role `kill_gate_traversal_ro` is created.
--      NOLOGIN because nothing connects AS this role directly today; NOINHERIT so it never
--      silently inherits a broader group's privileges later.
--   2. NOTHING is GRANTed to that role on the base table `kill_gate_sealed_predictions`. A
--      Postgres role with zero grants on a table gets a REAL `permission denied for table ...`
--      error (SQLSTATE 42501) on any SELECT against it -- this is enforced by the Postgres
--      privilege system itself, not application logic.
--   3. A SECURITY DEFINER function `kill_gate_teeth_discharged_predictions()` (owned by the
--      migration-applying role, e.g. `postgres`) returns ONLY discharged rows
--      (`WHERE discharged_at IS NOT NULL`), and EXECUTE on that function (only) is GRANTed to
--      `kill_gate_traversal_ro`.
--
--   WHY A SECURITY DEFINER FUNCTION, NOT A VIEW (measured live on this project, 2026-08-29): a
--   plain view's classic "runs with the owner's underlying-table privileges" behavior
--   (`security_invoker = false`, the documented Postgres default) does NOT hold on this hosted
--   Supabase project -- `CREATE VIEW ... WITH (security_invoker = false)` was measured to
--   silently persist as `security_invoker=on` regardless (`pg_class.reloptions`), i.e. Supabase
--   force-hardens every new view to check the INVOKING role's own table privileges, not the
--   owner's. A view built on that assumption would have been ANOTHER 42501 wall for
--   `kill_gate_traversal_ro`, not the one authorized read surface -- exactly the kind of thing
--   that "runs but cannot observe its subject" for the wrong reason. `SECURITY DEFINER` on a
--   FUNCTION is a separate Postgres mechanism unaffected by that view hardening (functions have
--   carried this semantic unconditionally since Postgres 8), and was verified end-to-end on this
--   project's live connection before being adopted here.
--
--   4. The two-sided test (tests/integration/kill-gate-teeth/sealed-predictions-blindness.test.js)
--      connects with a real Postgres session, issues `SET ROLE kill_gate_traversal_ro`, and
--      asserts a REAL 42501 on a direct base-table SELECT and a REAL, correctly-filtered success
--      via the function -- never a mocked assertion of app-layer logic.
--
-- HONEST RESIDUAL GAP (documented per this SD's PLAN risk section -- do not silently "fix" this
-- by widening a grant): no PRODUCTION traversal-side code path is actually FORCED to connect as
-- `kill_gate_traversal_ro` today. Every existing stage-advancement call site
-- (lib/eva/stage-execution-worker.js and friends) uses the shared service_role key, which remains
-- capable of reading the base table directly (service_role has BYPASSRLS and is the effective
-- table owner's peer via Supabase infra defaults). This migration proves the blindness mechanism
-- is REAL and independently testable -- it does not yet prove the live traversal path is wired
-- through it. Wiring a dedicated low-privilege connection into the actual stage-advancement call
-- sites is future work, explicitly out of ALPHA-leg scope (see PRD risk section, "residual
-- blindness wiring gap").
--
-- ============================================================================================
-- KILL-SET DERIVATION -- do NOT hardcode stage numbers anywhere that reads these tables
-- ============================================================================================
-- The live kill set MUST be derived at runtime via
--   SELECT stage_number FROM venture_stages WHERE gate_type = 'kill'
-- (currently stages {3,5,13,24}). A SIBLING module
-- (scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js) calls
-- `gate_type` a "lossy mirror" of `work_type` and treats `work_type` as canonical -- that is
-- WRONG for kill-SET derivation specifically: `work_type='decision_gate'` conflates the 4 kill
-- stages with promotion stages 10/16/17/25 and cannot express the kill/promotion distinction.
-- `gate_type` is the ONLY column carrying that distinction (measured live 2026-08-29: gate_type
-- distribution none=16/promotion=7/kill=4 over a 27-row scheme). See
-- lib/eva/kill-gate-teeth/kill-stage-set.js `deriveLiveKillStages()` for the single
-- authorized read site; do not add a second one.

BEGIN;

-- ----------------------------------------------------------------------------------------------
-- 1. Sealed-prediction registry
-- ----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kill_gate_sealed_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SHA-256 hex digest of the sealed prediction content (the "hash lodged with Adam/chairman
  -- before injection" per spec §3.4). Content itself is never written here pre-discharge.
  sealed_hash text NOT NULL,
  CONSTRAINT kill_gate_sealed_predictions_hash_hex_chk
    CHECK (sealed_hash ~ '^[0-9a-f]{64}$'),

  -- Who sealed it. Non-fleet party per spec §2/§6 ("a non-fleet party (Solomon or the chairman)").
  sealer_identity text NOT NULL,
  CONSTRAINT kill_gate_sealed_predictions_sealer_chk
    CHECK (sealer_identity IN ('solomon', 'chairman')),

  sealed_at timestamptz NOT NULL DEFAULT now(),

  -- Nullable pre-attach: a seal can be lodged before the concrete probe venture/criterion exists
  -- (spec §3.4/§4: predictions are written at run-prep, before Stage-0 intake).
  venture_id uuid REFERENCES ventures(id) ON DELETE SET NULL,
  criterion_id text,

  expected_stage integer,
  expected_verdict text,
  CONSTRAINT kill_gate_sealed_predictions_verdict_chk
    CHECK (expected_verdict IS NULL OR expected_verdict IN ('fired', 'hold', 'pass')),

  -- Discharge: content is revealed only after the run (spec §3.4: "content revealed after the
  -- run"). Both columns are set together at discharge time by the same non-fleet party.
  discharged_at timestamptz,
  discharged_content jsonb,
  CONSTRAINT kill_gate_sealed_predictions_discharge_pair_chk
    CHECK ((discharged_at IS NULL) = (discharged_content IS NULL)),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kill_gate_sealed_predictions_venture
  ON kill_gate_sealed_predictions (venture_id);
CREATE INDEX IF NOT EXISTS idx_kill_gate_sealed_predictions_hash
  ON kill_gate_sealed_predictions (sealed_hash);
CREATE INDEX IF NOT EXISTS idx_kill_gate_sealed_predictions_discharged
  ON kill_gate_sealed_predictions (discharged_at) WHERE discharged_at IS NOT NULL;

COMMENT ON TABLE kill_gate_sealed_predictions IS
  'Sealed kill-gate predictions (SD-LEO-INFRA-KILL-GATE-TEETH-001 ALPHA leg). Traversal-side code '
  'must read ONLY via kill_gate_teeth_discharged_predictions(), never this base table directly -- '
  'see this migration file header for the two-sided blindness mechanism and its honest residual gap.';

-- ----------------------------------------------------------------------------------------------
-- 2. Privilege-based blindness: dedicated role + discharged-only SECURITY DEFINER function
-- ----------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kill_gate_traversal_ro') THEN
    CREATE ROLE kill_gate_traversal_ro NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Membership grant, NOT a privilege grant: this lets `postgres` / `service_role` sessions
-- (the only ones with any legitimate reason to assume the restricted identity -- e.g. this
-- SD's own test harness, and a future wired-in traversal call site) issue `SET ROLE
-- kill_gate_traversal_ro`. Measured live on this hosted project (2026-08-29): Supabase's
-- `postgres` role is NOT a true Postgres superuser and CANNOT `SET ROLE` to an arbitrary role
-- without this explicit membership grant (`permission denied to set role`, 42501) -- a plain
-- vanilla-Postgres assumption that does not hold here and would have made the two-sided test
-- itself unable to assume the restricted identity. Membership does NOT flow the other way:
-- kill_gate_traversal_ro never gains postgres/service_role's privileges.
GRANT kill_gate_traversal_ro TO postgres, service_role;

-- Explicit and defensive: no role should have ambient access to the base table via PUBLIC.
REVOKE ALL ON kill_gate_sealed_predictions FROM PUBLIC;

-- SECURITY DEFINER function, not a view (see migration header for why a view does not work on
-- this project). Runs with the privileges of its OWNER (whichever role applies this migration,
-- e.g. `postgres`) regardless of the invoking role's own table grants -- that owner-privilege
-- semantic is exactly what makes this a genuine structural boundary rather than an app-level
-- if-check: the function body itself, not the caller, decides what is readable.
--
-- `SET search_path = pg_catalog, public` is required SECURITY DEFINER hygiene (a caller-writable
-- search_path could otherwise shadow `kill_gate_sealed_predictions` with a same-named object in
-- a schema earlier on their path and redirect this function's read).
CREATE OR REPLACE FUNCTION kill_gate_teeth_discharged_predictions()
RETURNS SETOF kill_gate_sealed_predictions
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM kill_gate_sealed_predictions WHERE discharged_at IS NOT NULL;
$$;

COMMENT ON FUNCTION kill_gate_teeth_discharged_predictions() IS
  'The ONLY read surface kill_gate_traversal_ro (or any traversal-side code, once wired) is '
  'granted on sealed predictions -- rows with discharged_at IS NULL are structurally absent from '
  'this result set (SECURITY DEFINER, filtered inside the function body), not merely filtered by '
  'an app-layer if-check on the caller''s side.';

REVOKE ALL ON FUNCTION kill_gate_teeth_discharged_predictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kill_gate_teeth_discharged_predictions() TO kill_gate_traversal_ro;
-- Deliberately NOT granting SELECT on kill_gate_sealed_predictions itself to this role -- that
-- omission IS the blindness mechanism.

-- ----------------------------------------------------------------------------------------------
-- 3. Firing-verification / teeth-proof records
-- ----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kill_gate_teeth_proof_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id uuid REFERENCES ventures(id) ON DELETE SET NULL,
  stage_number integer NOT NULL,

  -- venture_stages.gate_type value AT THE TIME OF THE CROSSING (kill-set membership is a
  -- runtime-derived fact, not a hardcoded list -- see migration header + firing-verification.js).
  gate_type text NOT NULL,

  sealed_prediction_id uuid REFERENCES kill_gate_sealed_predictions(id) ON DELETE SET NULL,
  predicted_verdict text,

  observed_verdict text NOT NULL,
  CONSTRAINT kill_gate_teeth_proof_records_observed_verdict_chk
    CHECK (observed_verdict IN ('fired', 'hold', 'pass', 'unknown')),

  -- Pinned primary observation surface (PLAN warning: SC2 named 3 candidate surfaces and required
  -- exactly one be pinned). system_events is authoritative because thesis-kill-gate.js writes it
  -- on EVERY evaluation (fired, hold, AND pass-equivalent silence); chairman_decisions only exists
  -- for FIRED verdicts and is a secondary routing cross-check, never the primary record.
  observed_source text NOT NULL DEFAULT 'system_events',
  CONSTRAINT kill_gate_teeth_proof_records_source_chk
    CHECK (observed_source IN ('system_events', 'venture_stage_transitions')),
  observed_event_id uuid,

  -- Secondary cross-check only: was a FIRED verdict correctly routed to a chairman_decisions row?
  routed_to_decision boolean,
  chairman_decision_id uuid,

  -- The LEO_THESIS_KILL_GATE flag mode ('off'|'observe'|'binding') AT EVALUATION TIME. Required so
  -- a teeth-proof produced under observe-mode (verdict logged, advancement never blocked) is never
  -- later misread as proof that the gate blocked anything (PLAN warning, verified-vs-binding gap).
  flag_mode text NOT NULL,
  CONSTRAINT kill_gate_teeth_proof_records_flag_mode_chk
    CHECK (flag_mode IN ('off', 'observe', 'binding')),

  -- NULL when no sealed prediction covers this crossing (nothing to compare against).
  matched_prediction boolean,

  evaluated_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_kill_gate_teeth_proof_records_venture_stage
  ON kill_gate_teeth_proof_records (venture_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_kill_gate_teeth_proof_records_gate_type
  ON kill_gate_teeth_proof_records (gate_type);

COMMENT ON TABLE kill_gate_teeth_proof_records IS
  'One row per gated-stage crossing: sealed prediction (post-discharge) vs. actual system_events '
  'observation. Queryable teeth-proof report surface for Solomon -- see '
  'lib/eva/kill-gate-teeth/firing-verification.js getTeethProofReport().';

COMMIT;
