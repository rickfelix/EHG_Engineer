/**
 * Stage 16 Template - Financial Projections
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Financial projections with revenue/cost data, runway calculation,
 * burn rate, break-even analysis, P&L, cash balance, viability
 * warnings, and Phase 4→5 Promotion Gate.
 *
 * Promotion gate pass requires:
 *   - Stage 13: >= 3 milestones with deliverables, kill gate passed
 *   - Stage 14: all 5 layers defined (presentation, api, business_logic, data, infrastructure)
 *   - Stage 14: >= 1 risk with severity, priority, and mitigation plan
 *   - Stage 16: positive runway and defined projections
 *
 * @module lib/eva/stage-templates/stage-16
 */

import { validateNumber, validateArray, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage16 } from './analysis-steps/stage-16-financial-projections.js';
import { MIN_MILESTONES } from './stage-13.js';
import { REQUIRED_LAYERS } from './stage-14.js';
import { MIN_RISKS } from './stage-14.js';
// SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern A): positioning-brief co-output.
import { analyzeStage16PositioningBrief, POSITIONING_UPSTREAM_ARTIFACT_TYPES } from './analysis-steps/stage-16-positioning-brief.js';

const MIN_PROJECTION_MONTHS = 6;

const TEMPLATE = {
  id: 'stage-16',
  slug: 'financial-projections',
  title: 'Financial Projections',
  version: '3.0.0',
  schema: {
    initial_capital: { type: 'number', min: 0, required: true },
    monthly_burn_rate: { type: 'number', min: 0, required: true },
    revenue_projections: {
      type: 'array',
      minItems: MIN_PROJECTION_MONTHS,
      items: {
        month: { type: 'number', min: 1, required: true },
        revenue: { type: 'number', min: 0, required: true },
        costs: { type: 'number', min: 0, required: true },
        cost_breakdown: {
          type: 'object',
          properties: {
            personnel: { type: 'number', min: 0 },
            infrastructure: { type: 'number', min: 0 },
            marketing: { type: 'number', min: 0 },
            other: { type: 'number', min: 0 },
          },
        },
      },
    },
    funding_rounds: {
      type: 'array',
      items: {
        round_name: { type: 'string', required: true },
        target_amount: { type: 'number', min: 0, required: true },
        target_date: { type: 'string', required: true },
      },
    },
    // Derived
    runway_months: { type: 'number', derived: true },
    burn_rate: { type: 'number', derived: true },
    break_even_month: { type: 'number', nullable: true, derived: true },
    total_projected_revenue: { type: 'number', derived: true },
    total_projected_costs: { type: 'number', derived: true },
    pnl: { type: 'object', derived: true },
    cash_balance_end: { type: 'array', derived: true },
    viability_warnings: { type: 'array', derived: true },
    promotion_gate: { type: 'object', derived: true },
  },
  defaultData: {
    initial_capital: 0,
    monthly_burn_rate: 0,
    revenue_projections: [],
    funding_rounds: [],
    runway_months: 0,
    burn_rate: 0,
    break_even_month: null,
    total_projected_revenue: 0,
    total_projected_costs: 0,
    pnl: null,
    cash_balance_end: [],
    viability_warnings: [],
    promotion_gate: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const errors = [];

    const capitalCheck = validateNumber(data?.initial_capital, 'initial_capital', 0);
    if (!capitalCheck.valid) errors.push(capitalCheck.error);

    const burnCheck = validateNumber(data?.monthly_burn_rate, 'monthly_burn_rate', 0);
    if (!burnCheck.valid) errors.push(burnCheck.error);

    // Revenue projections
    const projCheck = validateArray(data?.revenue_projections, 'revenue_projections', MIN_PROJECTION_MONTHS);
    if (!projCheck.valid) {
      errors.push(projCheck.error);
    } else {
      for (let i = 0; i < data.revenue_projections.length; i++) {
        const rp = data.revenue_projections[i];
        const prefix = `revenue_projections[${i}]`;
        const results = [
          validateNumber(rp?.month, `${prefix}.month`, 1),
          validateNumber(rp?.revenue, `${prefix}.revenue`, 0),
          validateNumber(rp?.costs, `${prefix}.costs`, 0),
        ];
        errors.push(...collectErrors(results));

        // cost_breakdown is optional but validate structure if present
        if (rp?.cost_breakdown && typeof rp.cost_breakdown === 'object') {
          for (const key of ['personnel', 'infrastructure', 'marketing', 'other']) {
            if (rp.cost_breakdown[key] !== undefined) {
              const cbCheck = validateNumber(rp.cost_breakdown[key], `${prefix}.cost_breakdown.${key}`, 0);
              if (!cbCheck.valid) errors.push(cbCheck.error);
            }
          }
        }
      }
    }

    // Funding rounds (optional but validate if present)
    if (data?.funding_rounds && Array.isArray(data.funding_rounds)) {
      for (let i = 0; i < data.funding_rounds.length; i++) {
        const fr = data.funding_rounds[i];
        const prefix = `funding_rounds[${i}]`;
        if (!fr?.round_name || typeof fr.round_name !== 'string') {
          errors.push(`${prefix}.round_name is required`);
        }
        const amtCheck = validateNumber(fr?.target_amount, `${prefix}.target_amount`, 0);
        if (!amtCheck.valid) errors.push(amtCheck.error);
      }
    }

    if (errors.length > 0) { logger.warn('[Stage16] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: runway, burn rate, break-even, P&L, cash balance,
   * viability warnings, and promotion gate.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage13, stage14, stage15 }
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

const PROMOTION_THRESHOLDS = { pass: 70, revise: 50 };

/**
 * Evaluate Phase 4→5 Promotion Gate.
 *
 * Uses Blueprint Readiness Score when available (from blueprint_quality_assessments):
 *   - Score >= 70: PROMOTE
 *   - Score 50-69: REVISE (retry with feedback)
 *   - Score < 50: REJECT
 *
 * Falls back to legacy basic checks when no readiness score is available.
 * Chairman override bypasses automated gate with audit trail.
 *
 * @param {{ stage13: Object, stage14: Object, stage15: Object, stage16: Object }} prerequisites
 * @param {{ readinessScore?: number, gate?: Object, chairmanOverride?: { approved: boolean, justification: string } }} [options]
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[], readinessScore?: number, decision?: string }}
 */
export function evaluatePromotionGate({ stage13, stage14, stage15, stage16 }, options = {}) {
  if (options.chairmanOverride?.approved) {
    return {
      pass: true,
      rationale: `Chairman override: ${options.chairmanOverride.justification || 'No justification provided'}`,
      blockers: [],
      required_next_actions: [],
      readinessScore: options.readinessScore ?? null,
      decision: 'OVERRIDE',
    };
  }

  if (typeof options.readinessScore === 'number') {
    const score = options.readinessScore;
    const remediations = options.gate?.remediationItems || [];

    if (score >= PROMOTION_THRESHOLDS.pass) {
      return { pass: true, rationale: `Blueprint readiness score ${score}/100 meets promotion threshold.`, blockers: [], required_next_actions: [], readinessScore: score, decision: 'PROMOTE' };
    }
    if (score >= PROMOTION_THRESHOLDS.revise) {
      return { pass: false, rationale: `Blueprint readiness score ${score}/100 requires revision.`, blockers: [`Readiness score ${score}/100 below ${PROMOTION_THRESHOLDS.pass}`], required_next_actions: remediations.length > 0 ? remediations : ['Improve artifact quality scores to reach 70+'], readinessScore: score, decision: 'REVISE' };
    }
    return { pass: false, rationale: `Blueprint readiness score ${score}/100 is insufficient.`, blockers: [`Readiness score ${score}/100 far below ${PROMOTION_THRESHOLDS.pass}`], required_next_actions: remediations.length > 0 ? remediations : ['Significant blueprint quality improvements needed'], readinessScore: score, decision: 'REJECT' };
  }

  return evaluatePromotionGateLegacy({ stage13, stage14, stage15, stage16 });
}

function evaluatePromotionGateLegacy({ stage13, stage14, _stage15, stage16 }) {
  const blockers = [];
  const required_next_actions = [];

  const milestoneCount = stage13?.milestones?.length || 0;
  if (milestoneCount < MIN_MILESTONES) {
    blockers.push(`Product roadmap has ${milestoneCount} milestone(s), minimum ${MIN_MILESTONES} required`);
    required_next_actions.push(`Add ${MIN_MILESTONES - milestoneCount} more milestones to the product roadmap`);
  }
  if (stage13?.decision === 'kill') {
    blockers.push('Product roadmap kill gate triggered - roadmap is incomplete');
    required_next_actions.push('Resolve kill gate reasons in Stage 13 before promotion');
  }

  for (const layer of REQUIRED_LAYERS) {
    if (!stage14?.layers?.[layer]) {
      blockers.push(`Technical architecture missing '${layer}' layer`);
      required_next_actions.push(`Define the '${layer}' layer with technology, components, and rationale`);
    }
  }

  const riskCount = stage14?.risks?.length || 0;
  if (riskCount < MIN_RISKS) {
    blockers.push(`Risk register has ${riskCount} risk(s), minimum ${MIN_RISKS} required`);
    required_next_actions.push(`Identify at least ${MIN_RISKS} risk(s) with severity, priority, and mitigation plans`);
  }

  if (!stage16?.initial_capital || stage16.initial_capital <= 0) {
    blockers.push('Financial projections have no initial capital');
    required_next_actions.push('Set initial_capital to a positive value');
  }
  const projCount = stage16?.revenue_projections?.length || 0;
  if (projCount < MIN_PROJECTION_MONTHS) {
    blockers.push(`Financial projections have ${projCount} month(s), minimum ${MIN_PROJECTION_MONTHS} required`);
    required_next_actions.push(`Add projections for at least ${MIN_PROJECTION_MONTHS} months`);
  }

  const pass = blockers.length === 0;
  return { pass, rationale: pass ? 'All Phase 4 prerequisites met (legacy checks).' : `Phase 4 incomplete: ${blockers.length} blocker(s).`, blockers, required_next_actions, decision: pass ? 'PROMOTE_LEGACY' : 'REJECT_LEGACY' };
}

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage16;

// ── SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern A) ────────────────
// CO-OUTPUT MECHANISM: persist a venture-grounded positioning brief as an
// ADDITIONAL Stage-16 artifact via the onBeforeAnalysis seam, leaving the
// financial-projection analysisStep (analyzeStage16) and its persistence path
// BYTE-IDENTICAL.
//
// Why this seam (least-invasive of the three options examined):
//   - Both runner paths invoke onBeforeAnalysis(supabase, ventureId) BEFORE the
//     analysisStep (eva-orchestrator.js ~L380; stage-execution-engine.js ~L492),
//     and both wrap it in try/catch — so a self-contained side-effect persist
//     here cannot disturb the financial write that follows.
//   - The financial projection continues to flow through analyzeStage16 →
//     persistArtifact unchanged (legacy single-write in stage-execution-engine,
//     blueprint_financial_projection via the orchestrator's required-artifact
//     path). We do NOT convert Stage 16 to the typed-array contract, which WOULD
//     re-route the financial write through writeArtifactBatch and change the
//     persisted artifact_type/source — i.e. not byte-identical.
//   - The brief gets its OWN writeArtifact call: artifact_type
//     'blueprint_positioning_brief', lifecycle_stage 16, is_current true, a
//     non-null title, and the JSON payload landing in the `content` column
//     (deriveContent(artifactData) JSON-stringifies the payload — the EHG
//     frontend reads `content`, not `artifact_data`).
//
// Flag-free + fail-safe: any missing supabase/ventureId or thrown error degrades
// to a no-op (the financial projection write is unaffected). We return {} so the
// analysisStep params are not altered (the brief is persisted as a side effect,
// not threaded into the financial analysis).
TEMPLATE.onBeforeAnalysis = async (supabase, ventureId) => {
  if (!supabase || !ventureId) return {};
  try {
    // Fetch already-current upstream artifacts the brief grounds on, plus the
    // venture name. We query venture_artifacts directly (mirrors stage-18.js's
    // onBeforeAnalysis) rather than re-running the cross-stage fetch, keeping
    // this seam self-contained and side-effecting only the positioning row.
    const [{ data: rows }, { data: venture }] = await Promise.all([
      supabase
        .from('venture_artifacts')
        .select('artifact_type, artifact_data, content')
        .eq('venture_id', ventureId)
        .eq('is_current', true)
        .in('artifact_type', POSITIONING_UPSTREAM_ARTIFACT_TYPES),
      supabase
        .from('ventures')
        .select('name')
        .eq('id', ventureId)
        .maybeSingle(),
    ]);

    // Build a flat { artifact_type: data } map for resolvePositioningInputs.
    const byType = {};
    for (const r of rows || []) {
      const data = r?.artifact_data ?? r?.content ?? null;
      if (data != null && byType[r.artifact_type] === undefined) byType[r.artifact_type] = data;
    }

    const { brief, metadata } = await analyzeStage16PositioningBrief({
      ...byType,
      ventureName: venture?.name || null,
      ventureId,
      logger: console,
    });

    // Persist via the unified service so dedup + content/artifact_data dual-write
    // are handled identically to every other artifact. content (TEXT) is derived
    // by JSON-stringifying the payload — exactly what the EHG composer parses.
    const { writeArtifact } = await import('../artifact-persistence-service.js');
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 16,
      artifactType: 'blueprint_positioning_brief',
      title: 'Positioning Brief',
      artifactData: brief,
      // content omitted → deriveContent(artifactData) JSON-stringifies brief.
      source: 'stage-16-positioning-brief',
      isCurrent: true,
      metadata: { co_output: true, ...metadata },
    });
  } catch (err) {
    // Non-fatal: the financial projection write must never be blocked by the
    // positioning co-output. The orchestrator/engine also wrap this in try/catch.
    console.warn?.(`[Stage16-PositioningBrief] co-output persist failed (non-blocking): ${err?.message || err}`);
  }
  // Return {} — do NOT thread positioning data into the financial analysisStep.
  return {};
};

ensureOutputSchema(TEMPLATE);

export { MIN_PROJECTION_MONTHS };
export default TEMPLATE;
