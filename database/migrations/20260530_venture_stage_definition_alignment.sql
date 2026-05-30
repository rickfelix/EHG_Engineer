-- @approved-by: rickfelix@example.com
-- SD-LEO-INFRA-VENTURE-STAGE-DEFINITION-001
--
-- Venture Stage Definition Alignment: normalize naming + codebase-grounded descriptions
-- across all 26 canonical venture_stages. The stage reorganization renamed stages but left
-- the descriptions derived from OLD/superseded components+templates; these descriptions were
-- re-derived from the CANONICAL built artifact per stage (the component at component_path +
-- its matching analysis-step template + required_artifacts) by code analysis 2026-05-30.
--
-- Changes:
--  1. phase_name -> uniform Title-Case "The X" (was THE_X for 1-17, "Build & Market"/"Launch & Grow" for 18-26).
--  2. stage 23 stage_name "Launch Readiness Kill Gate" -> "Launch Readiness" (gate type stays in gate_label);
--     chunk THE_BUILD -> THE_LAUNCH so its grouping matches phase_number 6 / name / gate / artifact (all "launch").
--  3. description + app_description for all 26 -> one consistent voice (present tense, ~12-22 words, what happens +
--     what it produces, no tool brand names); description and app_description now agree per stage.
--     Fixes: stage 11 (was marketing/GTM -> naming/visual), stage 10/12 realigned, stage 17 (was empty),
--     stage 22 app_description (was the old BuildReview "integration testing" -> distribution).
-- Mirror: regenerate ehg/src/config/venture-workflow.ts (includes stageName/chunk/description) after apply.

-- 1. phase_name uniform
UPDATE venture_stages SET phase_name = CASE phase_number
  WHEN 1 THEN 'The Truth'
  WHEN 2 THEN 'The Engine'
  WHEN 3 THEN 'The Identity'
  WHEN 4 THEN 'The Blueprint'
  WHEN 5 THEN 'The Build'
  WHEN 6 THEN 'The Launch'
  ELSE phase_name END;

-- 2. stage 23 name + grouping
UPDATE venture_stages SET stage_name = 'Launch Readiness', chunk = 'THE_LAUNCH' WHERE stage_number = 23;

-- 3. descriptions + app_descriptions (codebase-grounded, consistent)
UPDATE venture_stages AS vs SET description = v.description, app_description = v.app_desc
FROM (VALUES
  (1,  $sd$Transforms the raw venture seed into a structured draft idea capturing description, problem, value proposition, target market, and archetype.$sd$, $sa$Structured draft idea from the raw venture seed$sa$),
  (2,  $sd$Evaluates the idea from seven analyst perspectives, scoring strengths and risks to produce a composite critique and recommendation.$sd$, $sa$Seven-persona AI critique with composite score$sa$),
  (3,  $sd$Scores the venture across seven validation dimensions and renders a pass, revise, or kill gate decision with supporting rationale.$sd$, $sa$Kill gate: seven-dimension venture validation$sa$),
  (4,  $sd$Identifies and analyzes competitors, capturing positioning, threat level, SWOT, and pricing to map the competitive landscape and market pricing.$sd$, $sa$Competitor landscape, SWOT, and market pricing$sa$),
  (5,  $sd$Builds a three-year financial projection with unit economics and ROI, then applies a profitability kill gate on returns and payback.$sd$, $sa$Kill gate: three-year financial model and ROI$sa$),
  (6,  $sd$Generates a categorized risk register with severity, probability, and impact scoring, mitigations, and aggregate risk metrics.$sd$, $sa$Categorized risk register with scoring and mitigations$sa$),
  (7,  $sd$Designs the pricing model with tiers, competitive anchoring, and positioning, seeding unit economics to architect the venture revenue.$sd$, $sa$Pricing model, tiers, and seeded unit economics$sa$),
  (8,  $sd$Synthesizes upstream analysis into a complete nine-block business model canvas with prioritized, evidence-cited entries and a financial-consistency check.$sd$, $sa$Nine-block business model canvas with evidence$sa$),
  (9,  $sd$Produces an exit strategy with ranked exit paths, target acquirers, a revenue-multiple valuation range, milestones, and a readiness-gate verdict.$sd$, $sa$Exit paths, valuation range, and target acquirers$sa$),
  (10, $sd$Derives customer personas from upstream research and builds a persona-grounded brand foundation, with initial naming candidates gated by chairman governance.$sd$, $sa$Customer personas and a persona-grounded brand foundation$sa$),
  (11, $sd$Evaluates naming candidates against personas and selects a name, then defines the visual identity system, brand expression, and logo specification.$sd$, $sa$Name selection plus visual identity and brand expression$sa$),
  (12, $sd$Builds a go-to-market and sales strategy spanning market tiers, acquisition channels, sales model, conversion funnel, and customer journey, validated by a viability gate.$sd$, $sa$Go-to-market and sales strategy: tiers, channels, funnel$sa$),
  (13, $sd$Generates a phased product roadmap with now/next/later milestones, deliverables, and a vision statement, screened by a viability kill gate.$sd$, $sa$Kill gate: phased product roadmap and vision$sa$),
  (14, $sd$Defines a layered technical architecture on the fixed house tech stack, with security, data entities, integrations, constraints, a data model, and a risk register.$sd$, $sa$Layered technical architecture and data model$sa$),
  (15, $sd$Generates wireframe screens with personas, navigation flows, and components, then scores them through a multi-pass visual-convergence design review.$sd$, $sa$Wireframe screens with visual-convergence review$sa$),
  (16, $sd$Generates multi-month revenue and cost projections, then derives runway, break-even, P&L, and cash balance behind a promotion gate.$sd$, $sa$Promotion gate: financial projections and runway$sa$),
  (17, $sd$Aggregates all prior-stage artifacts into per-phase quality, completeness, and gap scores, producing a gated readiness review before build.$sd$, $sa$Promotion gate: blueprint quality and gap review$sa$),
  (18, $sd$Generates persona-targeted marketing copy across multiple sections from upstream artifacts, gated on chairman sign-off before build.$sd$, $sa$Promotion gate: persona-targeted marketing copy$sa$),
  (19, $sd$Generates a prioritized sprint backlog with story points and build-bridge payloads from blueprint, roadmap, and approved marketing copy.$sd$, $sa$Promotion gate: sprint backlog and build bridge$sa$),
  (20, $sd$Clones the venture repository and runs automated security, lint, and test checks, producing a severity-graded pass-or-fail quality verdict.$sd$, $sa$Automated security, lint, and test quality verdict$sa$),
  (21, $sd$Generates device screenshots and per-platform social-graphic specifications from the venture approved designs and brand identity.$sd$, $sa$Device screenshots and social graphics from designs$sa$),
  (22, $sd$Configures marketing distribution channels and generates per-channel ad copy and targeting from go-to-market strategy and persona data.$sd$, $sa$Distribution channels with ad copy and targeting$sa$),
  (23, $sd$Aggregates upstream readiness signals into a scored checklist and a go/hold verdict gating whether the venture may launch.$sd$, $sa$Kill gate: launch-readiness checklist and verdict$sa$),
  (24, $sd$Executes the approved launch, activating the configured distribution channels and recording the launch timestamp once readiness is confirmed.$sd$, $sa$Promotion gate: chairman-triggered launch execution$sa$),
  (25, $sd$Collects post-launch metrics and compares actual performance against projections, capturing validated assumptions, user feedback, and key learnings.$sd$, $sa$Promotion gate: post-launch metrics vs projections$sa$),
  (26, $sd$Generates a growth playbook of experiments, scaling priorities, an operations handoff, and a 90-day plan from post-launch performance data.$sd$, $sa$Growth playbook: experiments, scaling, ops handoff$sa$)
) AS v(stage_number, description, app_desc)
WHERE vs.stage_number = v.stage_number;

-- Self-verify: 26 rows, no empty descriptions, phase_name uniform set, stage 23 aligned.
DO $verify$
DECLARE n_empty int; n_phase int; s23 record;
BEGIN
  SELECT count(*) INTO n_empty FROM venture_stages WHERE description IS NULL OR trim(description) = '';
  IF n_empty > 0 THEN RAISE EXCEPTION 'venture-stage-align: % rows still have empty description', n_empty; END IF;
  SELECT count(DISTINCT phase_name) INTO n_phase FROM venture_stages;
  IF n_phase <> 6 THEN RAISE EXCEPTION 'venture-stage-align: expected 6 distinct phase_name, got %', n_phase; END IF;
  IF (SELECT count(*) FROM venture_stages WHERE phase_name NOT LIKE 'The %') > 0 THEN
    RAISE EXCEPTION 'venture-stage-align: phase_name not uniform "The X"'; END IF;
  SELECT stage_name, chunk INTO s23 FROM venture_stages WHERE stage_number = 23;
  IF s23.stage_name <> 'Launch Readiness' OR s23.chunk <> 'THE_LAUNCH' THEN
    RAISE EXCEPTION 'venture-stage-align: stage 23 not aligned (name=%, chunk=%)', s23.stage_name, s23.chunk; END IF;
  RAISE NOTICE 'venture-stage-align: 26 descriptions set, phase_name uniform, stage 23 aligned.';
END $verify$;
