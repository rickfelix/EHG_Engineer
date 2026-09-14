/**
 * Stage-key binding SSOT — SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001.
 *
 * WHY THIS EXISTS: stage-registry.js and stage-execution-engine.js dispatch stage
 * templates POSITIONALLY — a numeric stage_number is padded into a literal filename
 * (`stage-${paddedNum}.js`) and trusted blindly. When the venture_stages scheme is
 * renumbered (as it was by SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001, which explicitly
 * deferred this exact fix pending Solomon adjudication 22a7d1a1), nothing detects a
 * template file that was never moved to match — the wrong content silently keeps
 * running under the new number. venture_stages.stage_key is a pre-existing, UNIQUE,
 * renumber-resistant identifier (see database/migrations/20260529_create_venture_
 * stages_unified.sql) already read by stage-governance.js; this module is the static
 * SSOT the file-based templates get checked against, and validateStageKeyBinding()
 * is the check itself.
 *
 * SCOPE (validateStageKeyBinding): only templates that OPT IN by declaring
 * `TEMPLATE.stageKey` are validated — stages 1-22's TEMPLATE files predate this SD and
 * do not yet declare it (retrofitting every template's opt-in declaration is a
 * separate, still-deferred remainder scope; validateStageKeyBinding() stays a silent
 * no-op for them). Stages 23-27 (the renumbered cluster this SD touches) all declare it.
 *
 * STAGE_KEY_BY_NUMBER ITSELF now covers all 27 stages (extended by
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J, P5.1/FR-10 — "stage-key-registry.js covers
 * all 27 stages" is that SD's own acceptance criterion) — the map completeness above
 * is a DIFFERENT, now-closed concern from the template opt-in note above: any caller
 * needing a stage_number -> stage_key lookup for ANY of the 27 stages (e.g. a lint
 * pointing authors away from a bare numeric literal) has a real entry to reference,
 * independent of whether that stage's TEMPLATE file itself has adopted `stageKey`.
 *
 * @module lib/eva/stage-templates/stage-key-registry
 */

/** Canonical stage_number -> stage_key map, mirrors the live venture_stages table. */
export const STAGE_KEY_BY_NUMBER = Object.freeze({
  1: 'draft_idea',
  2: 'ai_review',
  3: 'comprehensive_validation',
  4: 'competitive_intelligence',
  5: 'profitability_forecasting',
  6: 'risk_evaluation',
  7: 'revenue_architecture',
  8: 'business_model_canvas',
  9: 'exit_strategy',
  10: 'customer_brand_foundation',
  11: 'naming_visual_identity',
  12: 'gtm_sales_strategy',
  13: 'product_roadmap',
  14: 'technical_architecture',
  15: 'design_studio',
  16: 'financial_projections',
  17: 'blueprint_review',
  18: 'marketing_copy_studio',
  19: 'sprint_planning',
  20: 'code_quality_gate',
  21: 'distribution_setup',
  22: 'visual_assets',
  23: 'dedicated_venture_uat',
  24: 'launch_readiness_gate',
  25: 'go_live',
  26: 'post_launch_review',
  27: 'growth_playbook',
});

/**
 * Validate that a loaded template's declared stageKey matches the expected
 * stage_key for the position it was registered under. Opt-in: a template with
 * no `stageKey` field is skipped (valid: true, skipped: true), never blocked.
 *
 * @param {number} stageNumber
 * @param {{stageKey?: string}} template
 * @returns {{valid: boolean, skipped?: boolean, expected?: string, actual?: string}}
 */
export function validateStageKeyBinding(stageNumber, template) {
  const declared = template?.stageKey;
  if (declared === undefined) return { valid: true, skipped: true };
  const expected = STAGE_KEY_BY_NUMBER[stageNumber];
  if (expected === undefined) return { valid: true, skipped: true };
  return declared === expected
    ? { valid: true, expected, actual: declared }
    : { valid: false, expected, actual: declared };
}
