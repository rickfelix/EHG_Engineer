/**
 * Canonical UPSTREAM_ARTIFACT_TYPES for Stage 18 Marketing Copy.
 *
 * Single source of truth within EHG_Engineer for the 12 artifact types
 * fed into S18 marketing copy AI generation. Imported by:
 *   - lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js
 *   - server/routes/stage18.js
 *
 * The EHG SPA (ehg/src/components/stages/Stage18MarketingCopy.tsx) maintains
 * a parallel copy because EHG and EHG_Engineer are independent npm packages.
 * A vitest deep-equality assertion (tests/integration/stage-18-marketing-copy.test.js)
 * + a CI script (scripts/verify-upstream-types-parity.js) detect drift.
 *
 * SD-MAN-FIX-STAGE-MARKETING-COPY-001
 * @module lib/eva/stage-templates/upstream-artifact-types
 */

export const UPSTREAM_ARTIFACT_TYPES = Object.freeze([
  'truth_idea_brief',                 // S1  — problem statement, value prop
  'truth_competitive_analysis',       // S4  — competitor names, differentiation
  'engine_pricing_model',             // S7  — pricing tiers
  'engine_business_model_canvas',     // S8  — value proposition, customer segments
  'identity_persona_brand',           // S10 — customer personas with pain points
  'identity_brand_guidelines',        // S10 — brand voice, messaging pillars
  'identity_naming_visual',           // S11 — brand name, color palette, tagline
  'identity_brand_name',              // S11 — selected name + rationale
  'identity_gtm_sales_strategy',      // S12 — channels, positioning, launch strategy
  'blueprint_product_roadmap',        // S13 — top features
  'blueprint_user_story_pack',        // S15 — user stories in user language
  'blueprint_financial_projection',   // S16 — revenue projections
]);

/**
 * Stage number lookup for each artifact type (used by route's __byType reshaping).
 */
export const STAGE_MAP = Object.freeze({
  truth_idea_brief: 1,
  truth_competitive_analysis: 4,
  engine_pricing_model: 7,
  engine_business_model_canvas: 8,
  identity_persona_brand: 10,
  identity_brand_guidelines: 10,
  identity_naming_visual: 11,
  identity_brand_name: 11,
  identity_gtm_sales_strategy: 12,
  blueprint_product_roadmap: 13,
  blueprint_user_story_pack: 15,
  blueprint_financial_projection: 16,
});
