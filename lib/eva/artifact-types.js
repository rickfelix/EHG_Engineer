/**
 * EVA Artifact Type Registry — Single Source of Truth
 *
 * All EVA modules MUST import artifact type constants from this file.
 * No hardcoded artifact type strings elsewhere in the codebase.
 *
 * Naming convention: {phase_prefix}_{descriptive_name}
 * Phase prefixes derived from lifecycle_stage_config.phase_name.
 *
 * SD-LEO-INFRA-EVA-ARTIFACT-NAMING-001
 * @module lib/eva/artifact-types
 */

// ── Phase prefixes (from lifecycle_stage_config.phase_name) ───────────
export const PHASE_PREFIXES = Object.freeze({
  INTAKE: 'intake',       // Stage 0 (pre-pipeline)
  TRUTH: 'truth',         // Stages 1-5 (THE_TRUTH)
  ENGINE: 'engine',       // Stages 6-9 (THE_ENGINE)
  IDENTITY: 'identity',   // Stages 10-12 (THE_IDENTITY)
  BLUEPRINT: 'blueprint', // Stages 13-17 (THE_BLUEPRINT)
  BUILD: 'build',         // Stages 18-22 (THE_BUILD)
  LAUNCH: 'launch',       // Stages 22-26 (THE_LAUNCH)
  SYSTEM: 'system',       // Cross-cutting artifacts
});

// ── All artifact types ───────────────────────────────────────────────
export const ARTIFACT_TYPES = Object.freeze({
  // Stage 0 — Intake
  INTAKE_VENTURE_ANALYSIS: 'intake_venture_analysis',

  // Stages 1-5 — The Truth
  TRUTH_IDEA_BRIEF: 'truth_idea_brief',
  TRUTH_AI_CRITIQUE: 'truth_ai_critique',
  TRUTH_VALIDATION_DECISION: 'truth_validation_decision',
  TRUTH_COMPETITIVE_ANALYSIS: 'truth_competitive_analysis',
  TRUTH_FINANCIAL_MODEL: 'truth_financial_model',
  TRUTH_PROBLEM_STATEMENT: 'truth_problem_statement',
  TRUTH_TARGET_MARKET_ANALYSIS: 'truth_target_market_analysis',
  TRUTH_VALUE_PROPOSITION: 'truth_value_proposition',

  // Stages 6-9 — The Engine
  ENGINE_RISK_MATRIX: 'engine_risk_matrix',
  ENGINE_PRICING_MODEL: 'engine_pricing_model',
  ENGINE_BUSINESS_MODEL_CANVAS: 'engine_business_model_canvas',
  ENGINE_EXIT_STRATEGY: 'engine_exit_strategy',
  /**
   * @deprecated since=2026-05-12 sd=SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001
   * No stage analyzer emits this artifact_type. Use ENGINE_RISK_MATRIX (S6 canonical).
   * Retained as a CHECK-constraint allowed value for one release; slated for removal
   * in a follow-up SD after telemetry confirms zero writes for 14d.
   */
  ENGINE_RISK_ASSESSMENT: 'engine_risk_assessment',
  /**
   * @deprecated since=2026-05-12 sd=SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001
   * No stage analyzer emits this artifact_type. Use ENGINE_PRICING_MODEL (S7 canonical).
   * Retained as a CHECK-constraint allowed value for one release; slated for removal.
   */
  ENGINE_REVENUE_MODEL: 'engine_revenue_model',

  // Stages 10-12 — The Identity
  IDENTITY_PERSONA_BRAND: 'identity_persona_brand',
  IDENTITY_BRAND_GUIDELINES: 'identity_brand_guidelines',
  IDENTITY_NAMING_VISUAL: 'identity_naming_visual',
  IDENTITY_BRAND_NAME: 'identity_brand_name',
  IDENTITY_LOGO_IMAGE: 'identity_logo_image',
  IDENTITY_GTM_SALES_STRATEGY: 'identity_gtm_sales_strategy',

  // Stages 13-16 — The Blueprint (includes blueprint agents)
  BLUEPRINT_PRODUCT_ROADMAP: 'blueprint_product_roadmap',
  BLUEPRINT_TECHNICAL_ARCHITECTURE: 'blueprint_technical_architecture',
  BLUEPRINT_DATA_MODEL: 'blueprint_data_model',
  BLUEPRINT_ERD_DIAGRAM: 'blueprint_erd_diagram',
  BLUEPRINT_API_CONTRACT: 'blueprint_api_contract',
  BLUEPRINT_SCHEMA_SPEC: 'blueprint_schema_spec',
  BLUEPRINT_RISK_REGISTER: 'blueprint_risk_register',
  BLUEPRINT_USER_STORY_PACK: 'blueprint_user_story_pack',
  BLUEPRINT_WIREFRAMES: 'blueprint_wireframes',
  BLUEPRINT_FINANCIAL_PROJECTION: 'blueprint_financial_projection',
  // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 FR-1/FR-2: Stage-16 co-output. A
  // venture-grounded positioning brief (tagline/hero/voice/key-messages) that
  // Stage 17 design and Stage 18 marketing consume. Stored in the `content`
  // column (JSON) so the EHG GVOS composer can parse it. Mirrored in the EHG
  // frontend gvos/upstream-context.ts allowlist (two-sided contract).
  BLUEPRINT_POSITIONING_BRIEF: 'blueprint_positioning_brief',
  BLUEPRINT_LAUNCH_READINESS: 'blueprint_launch_readiness',
  BLUEPRINT_SPRINT_PLAN: 'blueprint_sprint_plan',
  BLUEPRINT_PROMOTION_GATE: 'blueprint_promotion_gate',
  BLUEPRINT_PROJECT_PLAN: 'blueprint_project_plan',
  BLUEPRINT_REVIEW_SUMMARY: 'blueprint_review_summary',
  BLUEPRINT_TOKEN_MANIFEST: 'blueprint_token_manifest',

  // Stages 18-22 — The Build
  BUILD_SYSTEM_PROMPT: 'build_system_prompt',
  BUILD_CICD_CONFIG: 'build_cicd_config',
  BUILD_SECURITY_AUDIT: 'build_security_audit',
  BUILD_MVP_BUILD: 'build_mvp_build',
  BUILD_TEST_COVERAGE_REPORT: 'build_test_coverage_report',

  // Stage 18 — Marketing Copy Studio (SD-LEO-FEAT-STAGE-MARKETING-COPY-001).
  // One artifact per COPY_SECTIONS entry; these marketing_<section> strings are
  // the same types server/routes/stage18.js (interactive generate-copy) writes
  // and already exist in the venture_artifacts artifact_type CHECK constraint.
  MARKETING_TAGLINE: 'marketing_tagline',
  MARKETING_APP_STORE_DESC: 'marketing_app_store_desc',
  MARKETING_LANDING_HERO: 'marketing_landing_hero',
  MARKETING_EMAIL_WELCOME: 'marketing_email_welcome',
  MARKETING_EMAIL_ONBOARDING: 'marketing_email_onboarding',
  MARKETING_EMAIL_REENGAGEMENT: 'marketing_email_reengagement',
  MARKETING_SOCIAL_POSTS: 'marketing_social_posts',
  MARKETING_SEO_META: 'marketing_seo_meta',
  MARKETING_BLOG_DRAFT: 'marketing_blog_draft',

  // Stages 22-26 — Launch & Learn
  LAUNCH_TEST_PLAN: 'launch_test_plan',
  LAUNCH_UAT_REPORT: 'launch_uat_report',
  LAUNCH_DEPLOYMENT_RUNBOOK: 'launch_deployment_runbook',
  // SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-1: canonical Stage 23 artifact_type.
  // LAUNCH_MARKETING_CHECKLIST kept as deprecated alias for one release (read-only;
  // legacy rows backfilled via FR-6 migration). Do not emit launch_marketing_checklist for new rows.
  LAUNCH_READINESS_CHECKLIST: 'launch_readiness_checklist',
  /** @deprecated Use LAUNCH_READINESS_CHECKLIST. Legacy alias for one release. Backfilled via SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-6. */
  LAUNCH_MARKETING_CHECKLIST: 'launch_marketing_checklist',
  LAUNCH_ANALYTICS_DASHBOARD: 'launch_analytics_dashboard',
  LAUNCH_HEALTH_SCORING: 'launch_health_scoring',
  LAUNCH_CHURN_TRIGGERS: 'launch_churn_triggers',
  LAUNCH_RETENTION_PLAYBOOK: 'launch_retention_playbook',
  /**
   * @deprecated Use GROWTH_OPTIMIZATION_ROADMAP. Retained as alias for one
   * release for read-back of pre-rename rows (live count = 0 verified
   * 2026-05-09). Will be removed in a future release.
   * SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-2.
   */
  LAUNCH_OPTIMIZATION_ROADMAP: 'launch_optimization_roadmap',
  LAUNCH_ASSUMPTIONS_VS_REALITY: 'launch_assumptions_vs_reality',
  // SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-1: canonical Stage 24 artifact_type.
  // LAUNCH_LAUNCH_METRICS retained below as deprecated alias for read-back of legacy rows.
  // Live row count for the legacy key is 0 (verified 2026-05-07); writers must emit LAUNCH_METRICS.
  LAUNCH_METRICS: 'launch_metrics',
  /**
   * @deprecated since=2026-05-07 sd=SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001
   * Use LAUNCH_METRICS. Legacy alias for read-back of pre-rename rows (live row count = 0
   * verified 2026-05-07; gate_boundary_config has been corrected post-2026-05-12 to use
   * canonical launch_metrics). Slated for removal in a follow-up SD.
   */
  LAUNCH_LAUNCH_METRICS: 'launch_launch_metrics',
  LAUNCH_USER_FEEDBACK_SUMMARY: 'launch_user_feedback_summary',
  LAUNCH_PRODUCTION_APP: 'launch_production_app',
  // SD-LEO-FEAT-STAGE-POST-LAUNCH-001 carry-over: explicit constants for the
  // postlaunch_* artifacts S25 emits (previously raw strings in
  // stage-25-post-launch-review.js). S26 entry-precondition reads these.
  LAUNCH_POSTLAUNCH_ASSUMPTIONS_VS_REALITY: 'postlaunch_assumptions_vs_reality',
  LAUNCH_POSTLAUNCH_USER_FEEDBACK_SUMMARY: 'postlaunch_user_feedback_summary',
  LAUNCH_POSTLAUNCH_ANALYTICS_DASHBOARD: 'postlaunch_analytics_dashboard',
  // SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-2: canonical Stage 26 artifact_types.
  // Phase prefix LAUNCH retained (Stages 22-26 share the LAUNCH phase per
  // PHASE_PREFIXES; do NOT add a separate GROWTH prefix).
  // GROWTH_OPTIMIZATION_ROADMAP replaces LAUNCH_OPTIMIZATION_ROADMAP via
  // deprecated-alias-for-one-release pattern (mirrors LAUNCH_READINESS_CHECKLIST
  // / LAUNCH_MARKETING_CHECKLIST shape above). Live row count for legacy key
  // is 0 (verified 2026-05-09 by database-agent prospective).
  GROWTH_PLAYBOOK: 'growth_playbook',
  GROWTH_OPTIMIZATION_ROADMAP: 'growth_optimization_roadmap',

  // Stage 17 — Design Refinement (ARCH-S17-DESIGN-REFINEMENT-001 § Data Layer)
  /** Immutable design token manifest produced by S17 archetype selection */
  BLUEPRINT_DESIGN_TOKEN_MANIFEST: 'design_token_manifest',
  /** S17 stage analysis (readiness summary — distinct from actual archetypes) */
  BLUEPRINT_S17_ANALYSIS: 'stage_17_analysis',
  /** S17 archetype design variants (generated by archetype-generator.js) */
  BLUEPRINT_S17_ARCHETYPES: 's17_archetypes',
  /** S17 session state for resumable design refinement workflows */
  BLUEPRINT_S17_SESSION_STATE: 's17_session_state',
  /** Final S17-approved design refinement output */
  BLUEPRINT_S17_APPROVED: 's17_approved',
  /** S17 variant scoring results (per-screen) — SD-S17-DESIGN-INTELLIGENCE-ORCH-001-A */
  BLUEPRINT_S17_VARIANT_SCORES: 's17_variant_scores',
  /** S17 PNG screenshots from approved HTML — SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-C */
  BLUEPRINT_S17_APPROVED_PNG: 's17_approved_png',
  /** S17 work-in-progress variant (per-variant checkpoint) — PAT-PERSIST-CHECKPOINT-001 */
  BLUEPRINT_S17_VARIANT_WIP: 's17_variant_wip',
  /** S17 strategy recommendation (ranked strategies with fit scores) — SD-S17-STRATEGYFIRST */
  BLUEPRINT_S17_STRATEGY_RECOMMENDATION: 's17_strategy_recommendation',
  /** S17 preview variants (2 screens × 2 strategies) — SD-S17-STRATEGYFIRST */
  BLUEPRINT_S17_PREVIEW: 's17_preview',
  /** S17 design system tokens derived from approved designs — SD-S17-WORKER-STRATEGY-GATE-ORCH-001-A */
  BLUEPRINT_S17_DESIGN_SYSTEM: 's17_design_system',
  /** S17 strategy usage statistics (feedback loop) — SD-S17-WORKER-STRATEGY-GATE-ORCH-001-A */
  BLUEPRINT_S17_STRATEGY_STATS: 's17_strategy_stats',

  // Stage 15 — Wireframe screen data (replaces Stitch provisioning)
  BLUEPRINT_WIREFRAME_SCREENS: 'wireframe_screens',

  // Cross-cutting — Stitch Integration (legacy, kept for backward compat)
  BLUEPRINT_STITCH_PROJECT: 'stitch_project',
  BLUEPRINT_STITCH_CURATION: 'stitch_curation',

  // Cross-cutting — System
  SYSTEM_DEVILS_ADVOCATE_REVIEW: 'system_devils_advocate_review',

  // Cross-cutting — Gate & Analysis artifacts (SD-MAN-FIX-FIX-VENTURE-ARTIFACTS-001)
  VALUE_MULTIPLIER_ASSESSMENT: 'value_multiplier_assessment',
  ECONOMIC_LENS: 'economic_lens',
  LIFECYCLE_SD_BRIDGE: 'lifecycle_sd_bridge',
  POST_LIFECYCLE_DECISION: 'post_lifecycle_decision',
});

// ── Old → New mapping (for verification and migration) ───────────────
export const OLD_TO_NEW_MAP = Object.freeze({
  stage_0_analysis: ARTIFACT_TYPES.INTAKE_VENTURE_ANALYSIS,
  idea_brief: ARTIFACT_TYPES.TRUTH_IDEA_BRIEF,
  critique_report: ARTIFACT_TYPES.TRUTH_AI_CRITIQUE,
  validation_report: ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION,
  competitive_analysis: ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS,
  financial_model: ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL,
  problem_statement: ARTIFACT_TYPES.TRUTH_PROBLEM_STATEMENT,
  target_market_analysis: ARTIFACT_TYPES.TRUTH_TARGET_MARKET_ANALYSIS,
  value_proposition: ARTIFACT_TYPES.TRUTH_VALUE_PROPOSITION,
  risk_matrix: ARTIFACT_TYPES.ENGINE_RISK_MATRIX,
  pricing_model: ARTIFACT_TYPES.ENGINE_PRICING_MODEL,
  business_model_canvas: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS,
  exit_strategy: ARTIFACT_TYPES.ENGINE_EXIT_STRATEGY,
  risk_assessment: ARTIFACT_TYPES.ENGINE_RISK_ASSESSMENT,
  revenue_model: ARTIFACT_TYPES.ENGINE_REVENUE_MODEL,
  cultural_design_config: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
  brand_guidelines: ARTIFACT_TYPES.IDENTITY_BRAND_GUIDELINES,
  gtm_plan: ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL,
  brand_name: ARTIFACT_TYPES.IDENTITY_BRAND_NAME,
  logo_image: ARTIFACT_TYPES.IDENTITY_LOGO_IMAGE,
  sales_playbook: ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY,
  tech_stack_decision: ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP,
  technical_architecture: ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE,
  data_model: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
  erd_diagram: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
  api_contract: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
  schema_spec: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
  risk_register: ARTIFACT_TYPES.BLUEPRINT_RISK_REGISTER,
  user_story_pack: ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK,
  wireframes: ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES,
  financial_projection: ARTIFACT_TYPES.BLUEPRINT_FINANCIAL_PROJECTION,
  launch_readiness: ARTIFACT_TYPES.BLUEPRINT_LAUNCH_READINESS,
  sprint_plan: ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN,
  promotion_gate: ARTIFACT_TYPES.BLUEPRINT_PROMOTION_GATE,
  project_plan: ARTIFACT_TYPES.BLUEPRINT_PROJECT_PLAN,
  system_prompt: ARTIFACT_TYPES.BUILD_SYSTEM_PROMPT,
  cicd_config: ARTIFACT_TYPES.BUILD_CICD_CONFIG,
  security_audit: ARTIFACT_TYPES.BUILD_SECURITY_AUDIT,
  mvp_build: ARTIFACT_TYPES.BUILD_MVP_BUILD,
  test_coverage_report: ARTIFACT_TYPES.BUILD_TEST_COVERAGE_REPORT,
  test_plan: ARTIFACT_TYPES.LAUNCH_TEST_PLAN,
  uat_report: ARTIFACT_TYPES.LAUNCH_UAT_REPORT,
  deployment_runbook: ARTIFACT_TYPES.LAUNCH_DEPLOYMENT_RUNBOOK,
  launch_checklist: ARTIFACT_TYPES.LAUNCH_MARKETING_CHECKLIST,
  analytics_dashboard: ARTIFACT_TYPES.LAUNCH_ANALYTICS_DASHBOARD,
  health_scoring_system: ARTIFACT_TYPES.LAUNCH_HEALTH_SCORING,
  churn_triggers: ARTIFACT_TYPES.LAUNCH_CHURN_TRIGGERS,
  retention_playbook: ARTIFACT_TYPES.LAUNCH_RETENTION_PLAYBOOK,
  optimization_roadmap: ARTIFACT_TYPES.GROWTH_OPTIMIZATION_ROADMAP,
  // SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-2: launch_optimization_roadmap →
  // growth_optimization_roadmap rename (resolveArtifactType returns canonical).
  launch_optimization_roadmap: ARTIFACT_TYPES.GROWTH_OPTIMIZATION_ROADMAP,
  assumptions_vs_reality_report: ARTIFACT_TYPES.LAUNCH_ASSUMPTIONS_VS_REALITY,
  // SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-1b: typo → canonical translation.
  // resolveArtifactType('launch_launch_metrics') now returns 'launch_metrics'.
  launch_launch_metrics: ARTIFACT_TYPES.LAUNCH_METRICS,
  user_feedback_summary: ARTIFACT_TYPES.LAUNCH_USER_FEEDBACK_SUMMARY,
  production_app: ARTIFACT_TYPES.LAUNCH_PRODUCTION_APP,
  devils_advocate_review: ARTIFACT_TYPES.SYSTEM_DEVILS_ADVOCATE_REVIEW,
  // Duplicates removed (map to same target for migration scripts)
  strategic_narrative: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
  marketing_manifest: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
});

// ── Artifact types by stage ──────────────────────────────────────────
// SD-RCA-PREEMPTIVE-S26: Added Stage 26 entry (was missing).
export const ARTIFACT_TYPE_BY_STAGE = Object.freeze({
  0: [ARTIFACT_TYPES.INTAKE_VENTURE_ANALYSIS],
  1: [ARTIFACT_TYPES.TRUTH_IDEA_BRIEF],
  2: [ARTIFACT_TYPES.TRUTH_AI_CRITIQUE],
  3: [ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION],
  4: [ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS],
  5: [ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL],
  6: [ARTIFACT_TYPES.ENGINE_RISK_MATRIX],
  7: [ARTIFACT_TYPES.ENGINE_PRICING_MODEL],
  8: [ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS],
  9: [ARTIFACT_TYPES.ENGINE_EXIT_STRATEGY],
  10: [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND, ARTIFACT_TYPES.IDENTITY_BRAND_GUIDELINES],
  11: [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL, ARTIFACT_TYPES.IDENTITY_BRAND_NAME, ARTIFACT_TYPES.IDENTITY_LOGO_IMAGE],
  12: [ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY],
  13: [ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP],
  14: [
    ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE,
    ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
    ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
    ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
    ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
  ],
  15: [
    ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK,
    ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES,
    ARTIFACT_TYPES.BLUEPRINT_WIREFRAME_SCREENS,
  ],
  16: [
    ARTIFACT_TYPES.BLUEPRINT_FINANCIAL_PROJECTION,
    ARTIFACT_TYPES.BLUEPRINT_LAUNCH_READINESS,
    ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN,
    ARTIFACT_TYPES.BLUEPRINT_PROMOTION_GATE,
    // SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 FR-1: positioning-brief co-output.
    // reverse-lookup _STAGE_BY_ARTIFACT_TYPE resolves blueprint_positioning_brief -> 16.
    ARTIFACT_TYPES.BLUEPRINT_POSITIONING_BRIEF,
  ],
  17: [
    ARTIFACT_TYPES.BLUEPRINT_REVIEW_SUMMARY,
    ARTIFACT_TYPES.BLUEPRINT_DESIGN_TOKEN_MANIFEST,
    ARTIFACT_TYPES.BLUEPRINT_S17_ARCHETYPES,
    ARTIFACT_TYPES.BLUEPRINT_S17_SESSION_STATE,
    ARTIFACT_TYPES.BLUEPRINT_S17_APPROVED,
    ARTIFACT_TYPES.BLUEPRINT_S17_APPROVED_PNG,
    ARTIFACT_TYPES.BLUEPRINT_S17_VARIANT_WIP,
    ARTIFACT_TYPES.BLUEPRINT_S17_STRATEGY_RECOMMENDATION,
    ARTIFACT_TYPES.BLUEPRINT_S17_PREVIEW,
    ARTIFACT_TYPES.BLUEPRINT_S17_DESIGN_SYSTEM,
    ARTIFACT_TYPES.BLUEPRINT_S17_STRATEGY_STATS,
  ],
  // Stage 18 = "Marketing Copy Studio" — outputs 9 persona-targeted copy sections,
  // one marketing_<section> artifact each. Was missing from the registry (gap
  // between 17 and 19), causing eva-orchestrator to throw "No artifact type
  // configured for stage 18" on every autonomous worker run (mirrors the Stage 19
  // gap fixed 2026-04-28). The worker analysisStep emits these via the typed-array
  // form; the interactive generate-copy route writes the identical set.
  // SD-LEO-FEAT-STAGE-MARKETING-COPY-001.
  18: [
    ARTIFACT_TYPES.MARKETING_TAGLINE,
    ARTIFACT_TYPES.MARKETING_APP_STORE_DESC,
    ARTIFACT_TYPES.MARKETING_LANDING_HERO,
    ARTIFACT_TYPES.MARKETING_EMAIL_WELCOME,
    ARTIFACT_TYPES.MARKETING_EMAIL_ONBOARDING,
    ARTIFACT_TYPES.MARKETING_EMAIL_REENGAGEMENT,
    ARTIFACT_TYPES.MARKETING_SOCIAL_POSTS,
    ARTIFACT_TYPES.MARKETING_SEO_META,
    ARTIFACT_TYPES.MARKETING_BLOG_DRAFT,
  ],
  // Stage 19 = "Sprint Planning" — outputs blueprint_sprint_plan. Was missing
  // from the registry (gap between 17 and 20), causing the eva-orchestrator
  // to throw "No artifact type configured for stage 19" when the worker
  // tried to persist analyzeStage19's output. Caught live during S18→S19
  // chairman approval on 2026-04-28. blueprint_sprint_plan is the canonical
  // type for this stage; the same constant also appears at stage 16 (which
  // emits the architecture-time sprint plan as one of four outputs); the
  // reverse-lookup _STAGE_BY_ARTIFACT_TYPE will map blueprint_sprint_plan
  // to 19 (last write wins) since S19 is the unambiguous Sprint Planning
  // stage by name.
  // SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 — DUAL emission added at S19:
  // BUILD_MVP_BUILD is the build-completion output (emitted by POST
  // /api/stage19/:ventureId/register-deployment when the operator returns
  // post-Replit-build with repo + deployment URLs). Coexists with the
  // planning blueprint_sprint_plan emit. BUILD_MVP_BUILD is unique to S19
  // (no other stage entry references it), so reverse-lookup
  // _STAGE_BY_ARTIFACT_TYPE resolves 'build_mvp_build' to 19 deterministically.
  19: [ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN, ARTIFACT_TYPES.BUILD_MVP_BUILD],
  20: [ARTIFACT_TYPES.BUILD_SECURITY_AUDIT],
  21: [ARTIFACT_TYPES.LAUNCH_TEST_PLAN, ARTIFACT_TYPES.LAUNCH_UAT_REPORT],
  22: [ARTIFACT_TYPES.LAUNCH_DEPLOYMENT_RUNBOOK],
  23: [ARTIFACT_TYPES.LAUNCH_MARKETING_CHECKLIST],
  24: [
    ARTIFACT_TYPES.LAUNCH_ANALYTICS_DASHBOARD,
    ARTIFACT_TYPES.LAUNCH_HEALTH_SCORING,
    ARTIFACT_TYPES.LAUNCH_CHURN_TRIGGERS,
    ARTIFACT_TYPES.LAUNCH_RETENTION_PLAYBOOK,
  ],
  // SD-LEO-FEAT-STAGE-POST-LAUNCH-001 carry-over: S25 emits the postlaunch_*
  // canonical artifact set (S25 itself does not produce launch_optimization_roadmap;
  // that artifact was historically misattributed and is renamed for S26 below).
  25: [
    ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_ASSUMPTIONS_VS_REALITY,
    ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_USER_FEEDBACK_SUMMARY,
    ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_ANALYTICS_DASHBOARD,
    ARTIFACT_TYPES.LAUNCH_ASSUMPTIONS_VS_REALITY,
  ],
  // SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-2: S26 emits growth_playbook +
  // growth_optimization_roadmap as canonical artifacts. Legacy
  // LAUNCH_OPTIMIZATION_ROADMAP retained at index for one release (alias);
  // LAUNCH_USER_FEEDBACK_SUMMARY + LAUNCH_PRODUCTION_APP retained as historic
  // S26-touched artifacts (out of growth-strategy scope but still indexed here
  // for reverse-lookup parity with prior shipped behavior).
  26: [
    ARTIFACT_TYPES.GROWTH_PLAYBOOK,
    ARTIFACT_TYPES.GROWTH_OPTIMIZATION_ROADMAP,
    ARTIFACT_TYPES.LAUNCH_OPTIMIZATION_ROADMAP,
    ARTIFACT_TYPES.LAUNCH_USER_FEEDBACK_SUMMARY,
    ARTIFACT_TYPES.LAUNCH_PRODUCTION_APP,
  ],
});

// ── Reverse lookup: artifact_type → lifecycle_stage ─────────────────
// SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-C: Derive stage from type, not hardcode it.
const _STAGE_BY_ARTIFACT_TYPE = Object.freeze(
  Object.entries(ARTIFACT_TYPE_BY_STAGE).reduce((acc, [stage, types]) => {
    for (const type of types) {
      acc[type] = Number(stage);
    }
    return acc;
  }, {})
);

/**
 * Get the lifecycle stage number for a given artifact type.
 * @param {string} artifactType - A valid artifact type string
 * @returns {number|null} The stage number, or null if not found
 */
export function getStageForArtifactType(artifactType) {
  return _STAGE_BY_ARTIFACT_TYPE[artifactType] ?? null;
}

// ── Set of all valid type strings (for fast lookup) ──────────────────
const ALL_VALID_TYPES = new Set(Object.values(ARTIFACT_TYPES));

/**
 * Check if a string is a valid artifact type.
 * @param {string} type
 * @returns {boolean}
 */
export function isValidArtifactType(type) {
  return ALL_VALID_TYPES.has(type);
}

/**
 * Get the new name for an old artifact type, or return the input if already new.
 * @param {string} type - Old or new artifact type string
 * @returns {string} The canonical new-format artifact type
 */
export function resolveArtifactType(type) {
  return OLD_TO_NEW_MAP[type] || type;
}
