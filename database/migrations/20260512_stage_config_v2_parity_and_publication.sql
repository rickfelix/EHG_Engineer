-- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-1
-- @approved-by: rickfelix@example.com
--
-- Stage config V2 parity backfill + supabase_realtime publication membership.
--
-- Closes 4 audit issues from the 4-source-of-truth governance audit (2026-05-12):
--   Issue C: gate_type drift on S18, S19, S22, S25 (stage_config stale since 2026-04-21
--            redesign SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A)
--   Issue D: S26 Growth Playbook row missing from stage_config entirely
--   Plus  : 14 stage_name drifts (cosmetic but creates false-source-of-truth signal)
--   Plus  : 2 chunk corrections (S17 -> THE_BLUEPRINT, S23 -> THE_BUILD)
--   FR-2  : ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_config so
--           the new lib/eva/stage-governance.js cache-invalidation subscription
--           actually fires (DATABASE agent C1 BLOCKING resolution).
--
-- Supersedes cancelled SD-FDBK-INFRA-STAGE-CONFIG-PARITY-001 (filed 2026-05-09).
--
-- Idempotency: All UPDATEs are UPSERT-equivalent on a fixed key (stage_number).
-- The S26 INSERT uses ON CONFLICT DO NOTHING so re-runs are no-ops.
-- The ALTER PUBLICATION is guarded by a DO-block that checks pg_publication_tables
-- so re-runs are no-ops.
--
-- Audit-trail note (DATABASE agent C3 advisory): trg_stage_config_audit fires only
-- on UPDATE. The S26 INSERT will NOT produce an audit row. This is acceptable
-- because the row creation is a one-time event tied to this SD.
--
-- application_name is set explicitly so audit rows attribute to this SD
-- (SECURITY agent finding #4 — changed_by would otherwise be null).
--
-- UNIQUE(stage_key) constraint handling: S24/S25 key swap requires a temp value
-- so we don't violate UNIQUE mid-statement. We park S25 on a tombstone key
-- (`__pending_v2_25`) before renaming S24 -> `go_live`, then claim S25's final key.
--
-- VERIFICATION at end of transaction asserts:
--   1. exactly 26 rows in stage_config
--   2. gate_type tally: kill=4, promotion=7, none=15
--   3. review_mode tally: review=4, auto=22
--   4. stage_config is in supabase_realtime publication

BEGIN;

SET LOCAL application_name = 'SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001-FR-1';

-- ============================================================================
-- Step 1: park S25 stage_key on a tombstone to free up 'post_launch_review'
-- for S25's eventual claim (S24 currently owns that key).
-- ============================================================================
UPDATE public.stage_config
SET stage_key = '__pending_v2_25'
WHERE stage_number = 25
  AND stage_key <> '__pending_v2_25';  -- idempotent

-- ============================================================================
-- Step 2: Name + key + chunk + gate_type backfills for existing rows.
-- Order matters only for stage_key collisions (S24 must rename before S25 claims).
-- ============================================================================

-- S4: Market Analysis -> Competitive Intelligence
UPDATE public.stage_config
SET stage_name = 'Competitive Intelligence', stage_key = 'competitive_intelligence'
WHERE stage_number = 4;

-- S6: Go-to-Market Strategy -> Risk Evaluation (chunk already correct: THE_ENGINE)
UPDATE public.stage_config
SET stage_name = 'Risk Evaluation', stage_key = 'risk_evaluation'
WHERE stage_number = 6;

-- S12: Go-to-Market Plan -> GTM & Sales Strategy
UPDATE public.stage_config
SET stage_name = 'GTM & Sales Strategy', stage_key = 'gtm_sales_strategy'
WHERE stage_number = 12;

-- S14: Tech Architecture -> Technical Architecture
UPDATE public.stage_config
SET stage_name = 'Technical Architecture', stage_key = 'technical_architecture'
WHERE stage_number = 14;

-- S15: Development Plan -> Design Studio
UPDATE public.stage_config
SET stage_name = 'Design Studio', stage_key = 'design_studio'
WHERE stage_number = 15;

-- S17: Build Readiness -> Blueprint Review (also chunk correction THE_BUILD -> THE_BLUEPRINT)
UPDATE public.stage_config
SET stage_name = 'Blueprint Review', stage_key = 'blueprint_review', chunk = 'THE_BLUEPRINT'
WHERE stage_number = 17;

-- S18: MVP Development -> Marketing Copy Studio (gate_type none -> promotion)
UPDATE public.stage_config
SET stage_name = 'Marketing Copy Studio', stage_key = 'marketing_copy_studio', gate_type = 'promotion'
WHERE stage_number = 18;

-- S19: Testing & QA -> Sprint Planning (gate_type none -> promotion)
UPDATE public.stage_config
SET stage_name = 'Sprint Planning', stage_key = 'sprint_planning', gate_type = 'promotion'
WHERE stage_number = 19;

-- S20: Stage 20 Quality Gate -> Code Quality Gate
UPDATE public.stage_config
SET stage_name = 'Code Quality Gate', stage_key = 'code_quality_gate'
WHERE stage_number = 20;

-- S21: Pre-Launch Prep -> Visual Assets
UPDATE public.stage_config
SET stage_name = 'Visual Assets', stage_key = 'visual_assets'
WHERE stage_number = 21;

-- S22: Deployment -> Distribution Setup (gate_type promotion -> none)
UPDATE public.stage_config
SET stage_name = 'Distribution Setup', stage_key = 'distribution_setup', gate_type = 'none'
WHERE stage_number = 22;

-- S23: Production Launch -> Launch Readiness Kill Gate (chunk THE_LAUNCH -> THE_BUILD)
UPDATE public.stage_config
SET stage_name = 'Launch Readiness Kill Gate', stage_key = 'launch_readiness_gate', chunk = 'THE_BUILD'
WHERE stage_number = 23;

-- S24: Post-Launch Review -> Go Live & Announce
-- (S24 currently owns 'post_launch_review' key; freeing it now allows S25 to claim it)
UPDATE public.stage_config
SET stage_name = 'Go Live & Announce', stage_key = 'go_live'
WHERE stage_number = 24;

-- S25: Growth & Scale -> Post-Launch Review (gate_type none -> promotion)
-- Now safe to claim 'post_launch_review' since S24 has been renamed.
UPDATE public.stage_config
SET stage_name = 'Post-Launch Review', stage_key = 'post_launch_review', gate_type = 'promotion'
WHERE stage_number = 25;

-- ============================================================================
-- Step 3: INSERT missing S26 Growth Playbook row.
-- ON CONFLICT DO NOTHING keeps the migration idempotent.
-- ============================================================================
INSERT INTO public.stage_config (stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description)
VALUES (
  26,
  'Growth Playbook',
  'growth_playbook',
  'none',
  'auto',
  'THE_LAUNCH',
  'Launch execution, scale planning, and operations handoff. Final stage of the venture lifecycle.'
)
ON CONFLICT (stage_number) DO NOTHING;

-- ============================================================================
-- Step 4: ALTER PUBLICATION — guarded for idempotency (DATABASE agent C1).
-- Without this, FR-2 (lib/eva/stage-governance.js) realtime subscription is
-- silent dead-code.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'stage_config'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_config';
    RAISE NOTICE '[VENTURE-GATE-UNIFICATION-001] Added stage_config to supabase_realtime publication';
  ELSE
    RAISE NOTICE '[VENTURE-GATE-UNIFICATION-001] stage_config already in supabase_realtime publication (no-op)';
  END IF;
END $$;

-- ============================================================================
-- Step 5: VERIFICATION — assert post-state matches V2 contract.
-- ============================================================================
DO $$
DECLARE
  v_count          int;
  v_kill_count     int;
  v_promo_count    int;
  v_none_count     int;
  v_review_count   int;
  v_auto_count     int;
  v_pub_count      int;
BEGIN
  -- 1. Exactly 26 rows
  SELECT count(*) INTO v_count FROM public.stage_config;
  IF v_count <> 26 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 26 rows in stage_config, found %', v_count;
  END IF;

  -- 2. gate_type tally: kill=4, promotion=7, none=15
  SELECT count(*) INTO v_kill_count  FROM public.stage_config WHERE gate_type = 'kill';
  SELECT count(*) INTO v_promo_count FROM public.stage_config WHERE gate_type = 'promotion';
  SELECT count(*) INTO v_none_count  FROM public.stage_config WHERE gate_type = 'none';

  IF v_kill_count <> 4 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 4 kill gates, found %', v_kill_count;
  END IF;
  IF v_promo_count <> 7 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 7 promotion gates, found %', v_promo_count;
  END IF;
  IF v_none_count <> 15 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 15 no-gate stages, found %', v_none_count;
  END IF;

  -- 3. review_mode tally: review=4 (S7,S8,S9,S11), auto=22
  SELECT count(*) INTO v_review_count FROM public.stage_config WHERE review_mode = 'review';
  SELECT count(*) INTO v_auto_count   FROM public.stage_config WHERE review_mode = 'auto';

  IF v_review_count <> 4 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 4 review-mode stages, found %', v_review_count;
  END IF;
  IF v_auto_count <> 22 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] Expected 22 auto stages, found %', v_auto_count;
  END IF;

  -- 4. stage_config in supabase_realtime publication
  SELECT count(*) INTO v_pub_count
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'stage_config';
  IF v_pub_count <> 1 THEN
    RAISE EXCEPTION '[VGU-001-VERIFY] stage_config not in supabase_realtime publication (count=%)', v_pub_count;
  END IF;

  RAISE NOTICE '[VGU-001-VERIFY] All assertions passed: 26 rows, kill=4, promo=7, none=15, review=4, auto=22, publication=1';
END $$;

COMMIT;
