-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-1)
--
-- Gate-version registry: seeds chairman_dashboard_config.metadata.claim_gate_version_floor,
-- reusing the SAME config row (config_key='default') claim_sd() already reads for
-- claim_ttl_minutes / sweep_respect_inflight_agent. Uses jsonb_set (atomic, single-key
-- merge) rather than a JS read-whole-object-then-write, so no concurrent writer to a
-- sibling metadata key can ever be lost (per lib/coordinator/clear-coordinator-review.js's
-- documented precedent for avoiding the lost-update class on this JSONB column).
DO $$
BEGIN
  UPDATE chairman_dashboard_config
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{claim_gate_version_floor}', to_jsonb(1))
   WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_dashboard_config.config_key=default row not found -- cannot seed claim_gate_version_floor';
  END IF;
END $$;

DO $$
DECLARE
  v_floor int;
BEGIN
  SELECT (metadata->>'claim_gate_version_floor')::int INTO v_floor
    FROM chairman_dashboard_config WHERE config_key = 'default';
  IF v_floor IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: claim_gate_version_floor = % (expected 1)', v_floor;
  END IF;
  RAISE NOTICE 'claim_gate_version_floor seeded to 1 successfully.';
END $$;
