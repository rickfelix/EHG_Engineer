-- SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A
-- Purpose: Redesign lifecycle_stage_config S18-S26 for marketing-first post-build pipeline
-- Vision: VISION-S18-S26-PIPELINE-REDESIGN-L2-001
-- Date: 2026-04-21
--
-- Changes:
--   1. Update S18-S25 with new stage names, descriptions, work_types, required_artifacts
--   2. Insert S26 (Growth Playbook) — previously MAX_STAGE=26 but no config row existed
--   3. Update lifecycle_phases for phases 5 and 6
--
-- Stage flow (new):
--   S17 (Design) -> S18 (Marketing Copy Studio) -> S19 (Build in Replit) ->
--   S20 (Code Quality Gate) -> S21 (Visual Assets) -> S22 (Distribution Setup) ->
--   S23 (Launch Readiness Kill Gate) -> S24 (Go Live & Announce) ->
--   S25 (Post-Launch Review) -> S26 (Growth Playbook)

BEGIN;

-- ============================================================================
-- 1. Update lifecycle_stage_config S18-S26
-- ============================================================================

INSERT INTO lifecycle_stage_config (stage_number, stage_name, description, phase_number, phase_name, work_type, sd_required, sd_suffix, advisory_enabled, depends_on, required_artifacts, metadata) VALUES

-- PHASE 5: BUILD & MARKET (Stages 17-22) — S17 unchanged, S18-S22 redesigned
(18, 'Marketing Copy Studio', 'Persona-targeted marketing copy generation from 12 upstream artifacts. Produces taglines, app store descriptions, email sequences, social posts, landing page copy, SEO meta, and blog drafts. Copy is seeded into the GitHub repo for Replit builds.', 5, 'BUILD & MARKET', 'sd_required', true, 'MARKETING', false, ARRAY[17], ARRAY['marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero', 'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement', 'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft'], '{"upstream_artifacts": ["truth_idea_brief", "truth_competitive_analysis", "engine_pricing_model", "engine_business_model_canvas", "identity_persona_brand", "identity_brand_guidelines", "identity_naming_visual", "identity_brand_name", "identity_gtm_sales_strategy", "blueprint_product_roadmap", "blueprint_user_story_pack", "blueprint_financial_projection"], "copy_sections": ["tagline", "app_store_description", "landing_page_hero", "email_welcome", "email_onboarding", "email_reengagement", "social_posts", "seo_meta", "blog_draft"]}'),

(19, 'Build in Replit', 'Venture build execution via Replit Agent using seeded GitHub repo containing docs, designs, and marketing copy. Produces the deployed application URL and GitHub repo URL.', 5, 'BUILD & MARKET', 'sd_required', true, 'BUILD', false, ARRAY[18], ARRAY['build_mvp_build'], '{"build_method": "replit_agent", "gates": {"entry": ["Marketing copy complete", "GitHub repo seeded"], "exit": ["Application deployed", "GitHub repo URL stored in venture_resources"]}}'),

(20, 'Code Quality Gate', 'Claude Code validates the actual GitHub repo: npm audit, secret detection, lint, test suite execution. Produces pass/fail quality report. Blocks advancement if critical issues found.', 5, 'BUILD & MARKET', 'automated_check', false, NULL, false, ARRAY[19], ARRAY['code_quality_report'], '{"validation_methods": ["npm_audit", "secret_detection", "lint", "test_suite"], "gates": {"exit": ["No critical security issues", "No exposed secrets", "Lint passes"]}}'),

(21, 'Visual Assets', 'Generate device-framed screenshots from live app, social media graphics sized per platform, and video storyboard cards. Uses S17 approved designs and the built application.', 5, 'BUILD & MARKET', 'artifact_only', false, NULL, false, ARRAY[20], ARRAY['visual_device_screenshots', 'visual_social_graphics'], '{"asset_types": ["device_screenshots", "social_graphics", "video_storyboards"], "device_frames": ["iphone", "macbook"], "social_sizes": ["instagram_square", "twitter_banner", "facebook_cover"]}'),

(22, 'Distribution Setup', 'Configure distribution channels based on GTM strategy. Generate platform-specific ad copy with targeting parameters. Export email sequences. Each channel shows status and content preview.', 5, 'BUILD & MARKET', 'artifact_only', false, NULL, false, ARRAY[21], ARRAY['distribution_channel_config', 'distribution_ad_copy'], '{"channels": ["app_store", "google_ads", "facebook_instagram", "twitter_x", "email", "blog_seo"], "targeting_sources": ["identity_persona_brand", "engine_pricing_model"]}'),

-- PHASE 6: LAUNCH & GROW (Stages 23-26)
(23, 'Launch Readiness Kill Gate', 'Aggregates readiness signals from S20-S22. Checklist: code quality, marketing assets, distribution channels, analytics wiring, monitoring, legal. Kill gate blocks if any category incomplete. Chairman can override.', 6, 'LAUNCH & GROW', 'decision_gate', false, NULL, false, ARRAY[22], ARRAY['launch_readiness_checklist'], '{"decision_options": ["launch", "hold", "reject"], "checklist_categories": ["code_quality", "marketing_assets", "distribution_channels", "analytics", "monitoring", "legal"], "gates": {"exit": ["All categories green OR chairman override"]}}'),

(24, 'Go Live & Announce', 'Chairman explicitly triggers launch across all configured channels. Multi-channel announcement: app store publish, ad campaigns activate, email sequences start, social posts publish.', 6, 'LAUNCH & GROW', 'decision_gate', false, NULL, false, ARRAY[23], ARRAY['launch_launch_metrics'], '{"decision_options": ["launch_now", "schedule", "abort"], "gates": {"entry": ["Launch readiness PASS"], "exit": ["Launch triggered", "All channels activated"]}}'),

(25, 'Post-Launch Review', 'Collect real-world performance data: user signups, engagement metrics, revenue, churn indicators. Compare against S16 financial projections. Identify what worked and what needs adjustment.', 6, 'LAUNCH & GROW', 'artifact_only', false, NULL, false, ARRAY[24], ARRAY['launch_assumptions_vs_reality', 'launch_user_feedback_summary'], '{"metrics_collected": ["signups", "engagement", "revenue", "churn", "nps"], "comparison_baseline": "blueprint_financial_projection"}'),

(26, 'Growth Playbook', 'Generate growth strategy playbook based on post-launch data. Define optimization experiments, scaling priorities, and operational handoff to the Operations dashboard for ongoing monitoring.', 6, 'LAUNCH & GROW', 'artifact_only', false, NULL, false, ARRAY[25], ARRAY['growth_playbook', 'launch_optimization_roadmap'], '{"outputs": ["growth_experiments", "scaling_priorities", "operations_handoff"], "feeds_into": "operations_dashboard"}')

ON CONFLICT (stage_number) DO UPDATE SET
  stage_name = EXCLUDED.stage_name,
  description = EXCLUDED.description,
  phase_number = EXCLUDED.phase_number,
  phase_name = EXCLUDED.phase_name,
  work_type = EXCLUDED.work_type,
  sd_required = EXCLUDED.sd_required,
  sd_suffix = EXCLUDED.sd_suffix,
  advisory_enabled = EXCLUDED.advisory_enabled,
  depends_on = EXCLUDED.depends_on,
  required_artifacts = EXCLUDED.required_artifacts,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- 2. Update lifecycle_phases for phases 5 and 6
-- ============================================================================

UPDATE lifecycle_phases SET
  phase_name = 'BUILD & MARKET',
  description = 'Marketing copy, build execution, code validation, visual assets, and distribution setup',
  stages = ARRAY[17, 18, 19, 20, 21, 22]
WHERE phase_number = 5;

UPDATE lifecycle_phases SET
  phase_name = 'LAUNCH & GROW',
  description = 'Launch readiness, go-live execution, post-launch review, and growth playbook',
  stages = ARRAY[23, 24, 25, 26]
WHERE phase_number = 6;

COMMIT;

-- ============================================================================
-- Verification queries (run after migration):
-- ============================================================================
-- SELECT stage_number, stage_name, work_type, phase_name
-- FROM lifecycle_stage_config
-- WHERE stage_number BETWEEN 18 AND 26
-- ORDER BY stage_number;
-- Expected: 9 rows with new names
--
-- SELECT phase_number, phase_name, stages
-- FROM lifecycle_phases
-- WHERE phase_number IN (5, 6);
-- Expected: Phase 5 stages={17,18,19,20,21,22}, Phase 6 stages={23,24,25,26}
