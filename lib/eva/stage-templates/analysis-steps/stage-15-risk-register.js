/**
 * Stage 15 Analysis Step - Risk Register Generation
 * Part of SD-EVA-FIX-STAGE15-RISK-001
 *
 * Consumes Stage 1 idea, Stage 6 competitive analysis,
 * Stage 13 roadmap, and Stage 14 architecture to generate
 * a risk register with severity/priority classification.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-risk-register
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { getContract } from '../../contracts/financial-contract.js';

// NOTE: MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM intentionally duplicated from stage-15.js
// to avoid circular dependency — stage-15.js imports analyzeStage15 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const MIN_RISKS = 1;
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ENUM = ['immediate', 'short_term', 'long_term'];

const SYSTEM_PROMPT = `You are EVA's Risk Identification Engine. Generate a structured risk register for a venture.

You MUST output valid JSON with exactly this structure:
{
  "risks": [
    {
      "title": "Short risk title",
      "description": "Detailed risk description",
      "owner": "Role responsible for managing this risk",
      "severity": "critical|high|medium|low",
      "priority": "immediate|short_term|long_term",
      "phaseRef": "Phase or milestone this risk relates to",
      "mitigationPlan": "How to reduce likelihood or impact",
      "contingencyPlan": "What to do if the risk materializes"
    }
  ]
}

Rules:
- At least ${MIN_RISKS} risk required, aim for 5-10 comprehensive risks
- severity must be one of: ${SEVERITY_ENUM.join(', ')}
- priority must be one of: ${PRIORITY_ENUM.join(', ')}
- phaseRef should reference a roadmap phase or milestone when available
- mitigationPlan is required for every risk
- contingencyPlan is optional but recommended
- Consider: technical, market, operational, financial, and team risks
- Base risks on the venture's architecture, roadmap, and competitive landscape`;

/**
 * Generate a risk register from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage6Data] - Stage 6 Competitive Analysis
 * @param {Object} [params.stage13Data] - Stage 13 Product Roadmap
 * @param {Object} [params.stage14Data] - Stage 14 Technical Architecture
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Risk register
 */
export async function analyzeStage15({ stage1Data, stage6Data, stage13Data, stage14Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage15] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 15 risk register requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const competitiveContext = stage6Data?.competitors
    ? `Competitive Landscape: ${stage6Data.competitors.length} competitors identified`
    : 'No competitive analysis available';

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap: ${stage13Data.milestones.length} milestones, ${stage13Data.phases?.length || 0} phases`
    : 'No roadmap available';

  const archContext = stage14Data?.layers
    ? `Architecture:
  Presentation: ${stage14Data.layers.presentation?.technology || 'N/A'}
  API: ${stage14Data.layers.api?.technology || 'N/A'}
  Business Logic: ${stage14Data.layers.business_logic?.technology || 'N/A'}
  Data: ${stage14Data.layers.data?.technology || 'N/A'}
  Infrastructure: ${stage14Data.layers.infrastructure?.technology || 'N/A'}
  Components: ${stage14Data.total_components || 'N/A'}`
    : 'No architecture available';

  const userPrompt = `Generate a risk register for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}

${competitiveContext}

${roadmapContext}

${archContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) {
    throw new Error('Stage 15 risk register: LLM returned no risks');
  }

  // Normalize risks
  const risks = parsed.risks.map(r => ({
    title: String(r.title || 'Untitled Risk').substring(0, 200),
    description: String(r.description || '').substring(0, 1000),
    owner: String(r.owner || 'Unassigned').substring(0, 200),
    severity: SEVERITY_ENUM.includes(r.severity) ? r.severity : 'medium',
    priority: PRIORITY_ENUM.includes(r.priority) ? r.priority : 'short_term',
    phaseRef: r.phaseRef ? String(r.phaseRef).substring(0, 200) : '',
    mitigationPlan: String(r.mitigationPlan || 'TBD').substring(0, 500),
    contingencyPlan: r.contingencyPlan ? String(r.contingencyPlan).substring(0, 500) : '',
  }));

  const severity_breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const risk of risks) {
    severity_breakdown[risk.severity]++;
  }

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) llmFallbackCount++;
  for (const r of parsed.risks || []) {
    if (!SEVERITY_ENUM.includes(r.severity)) llmFallbackCount++;
    if (!PRIORITY_ENUM.includes(r.priority)) llmFallbackCount++;
  }
  if (llmFallbackCount > 0) {
    logger.warn('[Stage15] LLM fallback fields detected', { llmFallbackCount });
  }

  // Attach financial contract context for risk assessment grounding
  let financialContract = null;
  if (ventureName) {
    try {
      financialContract = await getContract(ventureName);
      if (financialContract) {
        logger.log('[Stage15] Financial contract loaded for risk grounding');
      }
    } catch (err) {
      logger.warn('[Stage15] Financial contract lookup skipped:', err.message);
    }
  }

  // ── Wireframe Artifact Visibility (supplementary, non-fatal) ──────
  let wireframeSummary = null;
  if (supabase && ventureId) {
    try {
      const { data: wireframeArt } = await supabase
        .from('venture_artifacts')
        .select('id, metadata, created_at')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'blueprint_wireframes')
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();

      if (wireframeArt) {
        wireframeSummary = {
          artifact_id: wireframeArt.id,
          screen_count: wireframeArt.metadata?.screen_count ?? null,
          created_at: wireframeArt.created_at,
          has_data: true,
        };
        logger.log('[Stage15] Wireframe artifact included', { id: wireframeArt.id });
      }
    } catch {
      // Non-fatal: wireframe lookup failure does not affect risk register
    }
  }

  logger.log('[Stage15] Analysis complete', { duration: Date.now() - startTime });
  return {
    risks,
    total_risks: risks.length,
    severity_breakdown,
    budget_coherence: {
      aligned: true,
      notes: `${risks.length} risk(s) identified with mitigation plans`,
    },
    financialContract: financialContract ? {
      cac: financialContract.cac_estimate,
      ltv: financialContract.ltv_estimate,
      capitalRequired: financialContract.capital_required,
    } : null,
    llmFallbackCount,
    fourBuckets, usage,
    ...(wireframeSummary ? { wireframe_summary: wireframeSummary } : {}),
  };
}

export { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM };
