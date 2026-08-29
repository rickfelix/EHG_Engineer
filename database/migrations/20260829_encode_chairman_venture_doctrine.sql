-- SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 (FR-4): seed 4 new chairman_constraints rows for
-- chairman doctrine dimensions not yet present (2026-08-26 Card C, chairman-approved by SMS).
-- Vertical-knowledge-depth and two-years-out are already covered by the existing
-- NARROW_SPECIALIZATION / TWO_YEAR_POSITIONING rows (see 20260209_stage0_venture_entry_schema.sql)
-- once lib/eva/stage-zero/synthesis/chairman-constraints.js's case-matching fix lands (FR-1) --
-- no new row needed for those two. All 4 rows here use score_modifier/score_bonus/advisory only,
-- matching the chairman's own language (strength signals, not disqualifiers) -- never hard_reject.

INSERT INTO chairman_constraints (constraint_key, name, description, filter_type, filter_logic, source, priority_order)
VALUES
  ('AMBITION_AS_MOAT', 'Ambition as moat', 'Score higher for ideas ambitious enough to deter competitors (5-10X value vs incumbents)', 'score_bonus',
   '{"condition": "order_of_magnitude_value", "bonus": 0.15, "reason": "Ambitious ideas deter competitors -- 5-10X value vs incumbents is itself a moat"}'::jsonb,
   'manual', 110),
  ('JAGGED_SPACE_TARGETING', 'Jagged-space targeting', 'Score higher for ideas that target current LLM capability gaps (the jagged frontier)', 'score_bonus',
   '{"condition": "targets_capability_gap", "bonus": 0.10, "reason": "Jagged-space targeting exploits gaps competitors cannot yet close"}'::jsonb,
   'manual', 120),
  ('EDGE_OF_CAPABILITY_TIMING', 'Edge-of-capability timing', 'Score higher for ideas that sit on what models can do TODAY, not a future capability bet', 'score_bonus',
   '{"condition": "newly_possible_today", "bonus": 0.10, "reason": "Edge-of-capability timing captures a window before it becomes commoditized"}'::jsonb,
   'manual', 130),
  ('TECHNOLOGY_CONVERGENCE', 'Technology-convergence compounding', 'Score higher for ideas positioned at the convergence of multiple compounding technology trends', 'score_bonus',
   '{"condition": "multiple_trend_convergence", "bonus": 0.10, "reason": "Convergence positioning compounds advantage as each underlying trend matures"}'::jsonb,
   'manual', 140)
ON CONFLICT (constraint_key) DO NOTHING;
