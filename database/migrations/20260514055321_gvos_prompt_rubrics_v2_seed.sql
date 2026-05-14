-- ============================================================================
-- SD-LEO-FEAT-CHILD-PER-WIREFRAME-001 FR-9 — gvos_prompt_rubrics v2 INSERT
-- ============================================================================
--
-- Child A of SD-LEO-ORCH-S17-PER-WIREFRAME-001.
--
-- Inserts rubric v2 with 11 reweighted dimensions for per-wireframe scoring.
-- 6 points reserved in weights._reserved_for_motion_grammar_density JSONB key
-- for Child B (SD-LEO-FEAT-CHILD-MOTION-GRAMMAR-001 FR-16) to claim via UPDATE.
--
-- Schema notes (per DATABASE sub-agent evidence cadfa7aa-2237-4092-a98c-121ac5cf51bb):
--   - Column is `active` NOT `is_active`
--   - Column is `created_by` (text) NOT `created_by_sd`
--   - UNIQUE constraint is on (version) only — ON CONFLICT (version) DO NOTHING
--   - Table is APPEND-ONLY with block triggers — must run via service_role
--     (apply-migration.js handles this)
--   - Reserved dim is encoded as JSONB key in weights, NOT a separate column
--
-- v1 row preservation: v1 stays active=true until v2 passes 3-prompt smoke test.
-- The active flag flip (v1.active=false, v2.active=true) is a SEPARATE admin
-- step (also APPEND-ONLY → requires service_role) handled outside this migration.
--
-- Weight allocation totaling 100:
--   completeness                            10 (down from 15 — wireframe-specific dimensions absorb weight)
--   archetype_specificity                   12 (slight rebalance)
--   typography_declared                      6 (down from 10)
--   layout_token_density                    10 (down from 15)
--   color_interaction                        6 (down from 10)
--   reference_urls                           6 (down from 10)
--   negative_prompts                        10 (down from 15)
--   wireframe_specificity                    8 (NEW — per-wireframe context citation)
--   upstream_context_inclusion              10 (NEW — brand/persona/user-stories citation)
--   data_schema_specificity                 12 (NEW — entities/endpoints/tables citation)
--   library_motion                           4 (deprecated; Child B FR-16 replaces)
--   _reserved_for_motion_grammar_density     6 (RESERVED for Child B FR-16 UPDATE)
--   ---
--   TOTAL                                  100
--
-- Threshold inheritance: v2 uses same thresholds as v1 (85/70/50/0) for scoring
-- comparability across versions. Scorer normalises to /100 regardless of which
-- row it reads.
--
-- Idempotent: re-running this migration is a no-op (ON CONFLICT (version) DO NOTHING).
-- ============================================================================

INSERT INTO gvos_prompt_rubrics (
  id,
  version,
  active,
  weights,
  threshold_green,
  threshold_yellow_soft,
  threshold_yellow_hard,
  threshold_red,
  notes,
  created_at,
  created_by
) VALUES (
  gen_random_uuid(),
  2,
  false,  -- v1 stays active=true until 3-prompt smoke test passes
  jsonb_build_object(
    'completeness',                          10,
    'archetype_specificity',                 12,
    'typography_declared',                    6,
    'layout_token_density',                  10,
    'color_interaction',                      6,
    'reference_urls',                         6,
    'negative_prompts',                      10,
    'wireframe_specificity',                  8,
    'upstream_context_inclusion',            10,
    'data_schema_specificity',               12,
    'library_motion',                         4,
    '_reserved_for_motion_grammar_density',   6
  ),
  85,
  70,
  50,
  0,
  'v2 — per-wireframe rubric with upstream-context dimensions. Reserves 6 weight in _reserved_for_motion_grammar_density JSONB key for SD-LEO-FEAT-CHILD-MOTION-GRAMMAR-001 FR-16 UPDATE. Activation gated on 3-prompt smoke test passing (separate admin operation). Source: SD-LEO-FEAT-CHILD-PER-WIREFRAME-001 FR-9. Evidence: cadfa7aa-2237-4092-a98c-121ac5cf51bb.',
  now(),
  'sd:SD-LEO-FEAT-CHILD-PER-WIREFRAME-001'
)
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- Post-INSERT verification (informational — does not affect migration result)
-- ============================================================================
-- Expected post-state:
--   SELECT version, active, jsonb_object_keys(weights) AS weight_keys
--   FROM gvos_prompt_rubrics ORDER BY version;
--
-- Row 1: v=1 active=true  weights[completeness/library_motion/reference_urls/...]
-- Row 2: v=2 active=false weights[...+wireframe_specificity/upstream_context_inclusion/data_schema_specificity/_reserved_for_motion_grammar_density]
--
-- Weight total verification:
--   SELECT version,
--          (SELECT SUM((value)::int) FROM jsonb_each_text(weights)) AS total_weight
--   FROM gvos_prompt_rubrics ORDER BY version;
--
-- Row 1: v=1 total=100
-- Row 2: v=2 total=100
-- ============================================================================
