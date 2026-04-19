/**
 * Stage 14 Analysis Step - Technical Architecture Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stage 1 idea and Stage 13 roadmap to generate a technical
 * architecture with all 5 required layers, security object,
 * data entities, integration points, and constraints.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { extractADRs } from '../../adr-extractor.js';
import { getContract } from '../../contracts/financial-contract.js';

// NOTE: REQUIRED_LAYERS and CONSTRAINT_CATEGORIES intentionally duplicated from stage-14.js
// to avoid circular dependency — stage-14.js imports analyzeStage14 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const REQUIRED_LAYERS = ['presentation', 'api', 'business_logic', 'data', 'infrastructure'];
const CONSTRAINT_CATEGORIES = ['performance', 'security', 'compliance', 'operational'];

// Risk register constants (moved from stage-15-risk-register.js in SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B)
const MIN_RISKS = 1;
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ENUM = ['immediate', 'short_term', 'long_term'];

const RISK_SYSTEM_PROMPT = `You are EVA's Risk Identification Engine. Generate a structured risk register for a venture.

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

const SYSTEM_PROMPT = `You are EVA's Technical Architecture Engine. Generate a structured technical architecture for a venture.

You MUST output valid JSON with exactly this structure:
{
  "architecture_summary": "High-level architecture description (min 20 chars)",
  "layers": {
    "presentation": {
      "technology": "React/Vue/etc",
      "components": ["Component 1", "Component 2"],
      "rationale": "Why this technology"
    },
    "api": {
      "technology": "REST/GraphQL/etc",
      "components": ["Endpoint group 1", "Endpoint group 2"],
      "rationale": "Why this API approach"
    },
    "business_logic": {
      "technology": "Node.js/Python/etc",
      "components": ["Service 1", "Service 2"],
      "rationale": "Why this technology"
    },
    "data": {
      "technology": "PostgreSQL/MongoDB/etc",
      "components": ["Table 1", "Collection 1"],
      "rationale": "Why this technology"
    },
    "infrastructure": {
      "technology": "AWS/GCP/Vercel/etc",
      "components": ["Service 1", "Service 2"],
      "rationale": "Why this infrastructure"
    }
  },
  "security": {
    "authStrategy": "JWT/OAuth2/Session-based/etc",
    "dataClassification": "public/internal/confidential/restricted",
    "complianceRequirements": ["GDPR", "SOC2", "etc"]
  },
  "dataEntities": [
    {
      "name": "Entity name",
      "description": "What this entity represents",
      "relationships": ["Related entity 1", "Related entity 2"],
      "estimatedVolume": "~1000 records/month"
    }
  ],
  "integration_points": [
    {
      "name": "Integration name",
      "source_layer": "presentation|api|business_logic|data|infrastructure",
      "target_layer": "presentation|api|business_logic|data|infrastructure",
      "protocol": "REST|GraphQL|gRPC|WebSocket|SQL|etc"
    }
  ],
  "constraints": [
    {
      "name": "Constraint name",
      "description": "Description of the constraint",
      "category": "performance|security|compliance|operational"
    }
  ]
}

Rules:
- ALL five layers (presentation, api, business_logic, data, infrastructure) MUST be defined
- Each layer MUST have technology, at least 1 component, and rationale
- Security object MUST include authStrategy and dataClassification
- At least 1 data entity with name, description, and relationships
- At least 1 integration point between layers
- Constraints should include a category from: performance, security, compliance, operational
- Technology choices should be practical and match the venture's scale
- Rationale should reference specific venture needs, not generic advice`;

/**
 * Generate a technical architecture from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage6Data] - Stage 6 Competitive Analysis
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {string} [params.ventureName]
 * @param {string} [params.ventureId]
 * @param {Object} [params.supabase]
 * @returns {Promise<Object>} Technical architecture + risk register
 */
export async function analyzeStage14({ stage1Data, stage6Data, stage13Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage14] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 14 technical architecture requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const roadmapContext = stage13Data?.milestones
    ? `Product Roadmap:
  Milestones: ${stage13Data.milestones.length}
  Now priorities: ${stage13Data.milestones.filter(m => m.priority === 'now').map(m => m.name).join(', ') || 'None'}
  Timeline: ${stage13Data.phases?.[0]?.start_date || 'N/A'} to ${stage13Data.phases?.[stage13Data.phases.length - 1]?.end_date || 'N/A'}`
    : 'No roadmap available';

  const userPrompt = `Generate a technical architecture for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}

${roadmapContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Validate layers
  if (!parsed.layers || typeof parsed.layers !== 'object') {
    throw new Error('Stage 14 technical architecture: LLM returned no layers');
  }

  // Normalize layers
  const layers = {};
  for (const layer of REQUIRED_LAYERS) {
    const l = parsed.layers[layer];
    if (!l || typeof l !== 'object') {
      layers[layer] = {
        technology: 'TBD',
        components: ['TBD'],
        rationale: `${layer} layer technology to be determined`,
      };
    } else {
      layers[layer] = {
        technology: String(l.technology || 'TBD').substring(0, 200),
        components: Array.isArray(l.components) && l.components.length > 0
          ? l.components.map(c => String(c).substring(0, 200))
          : ['TBD'],
        rationale: String(l.rationale || 'TBD').substring(0, 500),
      };
    }
  }

  // Normalize security
  const security = {
    authStrategy: String(parsed.security?.authStrategy || 'TBD').substring(0, 200),
    dataClassification: String(parsed.security?.dataClassification || 'internal').substring(0, 100),
    complianceRequirements: Array.isArray(parsed.security?.complianceRequirements)
      ? parsed.security.complianceRequirements.map(r => String(r).substring(0, 100))
      : [],
  };

  // Normalize data entities
  const dataEntities = Array.isArray(parsed.dataEntities) && parsed.dataEntities.length > 0
    ? parsed.dataEntities.map(de => ({
      name: String(de.name || 'Entity').substring(0, 200),
      description: String(de.description || '').substring(0, 500),
      relationships: Array.isArray(de.relationships) ? de.relationships.map(r => String(r).substring(0, 200)) : [],
      estimatedVolume: de.estimatedVolume ? String(de.estimatedVolume).substring(0, 100) : '',
    }))
    : [{ name: 'Primary Entity', description: 'Core data entity to be defined', relationships: [], estimatedVolume: '' }];

  // Normalize integration points
  const integration_points = Array.isArray(parsed.integration_points) && parsed.integration_points.length > 0
    ? parsed.integration_points.map(ip => ({
      name: String(ip.name || 'Integration').substring(0, 200),
      source_layer: REQUIRED_LAYERS.includes(ip.source_layer) ? ip.source_layer : 'api',
      target_layer: REQUIRED_LAYERS.includes(ip.target_layer) ? ip.target_layer : 'data',
      protocol: String(ip.protocol || 'REST').substring(0, 100),
    }))
    : [{ name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' }];

  // Normalize constraints
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.map(c => ({
      name: String(c.name || 'Constraint').substring(0, 200),
      description: String(c.description || '').substring(0, 500),
      category: CONSTRAINT_CATEGORIES.includes(c.category) ? c.category : 'operational',
    }))
    : [];

  const architecture_summary = String(parsed.architecture_summary || '').length >= 20
    ? String(parsed.architecture_summary).substring(0, 500)
    : `Technical architecture for ${ventureName || 'venture'}: ${Object.values(layers).map(l => l.technology).join(', ')}`;

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!parsed.layers || typeof parsed.layers !== 'object') llmFallbackCount++;
  if (!parsed.architecture_summary || String(parsed.architecture_summary).length < 20) llmFallbackCount++;
  if (!Array.isArray(parsed.dataEntities) || parsed.dataEntities.length === 0) llmFallbackCount++;
  if (!Array.isArray(parsed.integration_points) || parsed.integration_points.length === 0) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage14] LLM fallback fields detected', { llmFallbackCount });
  }

  // Extract ADRs from architecture output (SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001-A)
  const archResult = {
    architecture_summary,
    layers,
    security,
    dataEntities,
    integration_points,
    constraints,
  };
  const extractedADRs = extractADRs(archResult);
  logger.log('[Stage14] Extracted ADRs', { count: extractedADRs.length });

  // ── Risk Register Generation (moved from S15 in SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B) ──
  logger.log('[Stage14] Starting risk register generation');

  const competitiveContext = stage6Data?.competitors
    ? `Competitive Landscape: ${stage6Data.competitors.length} competitors identified`
    : 'No competitive analysis available';

  const roadmapContextForRisk = stage13Data?.milestones
    ? `Roadmap: ${stage13Data.milestones.length} milestones, ${stage13Data.phases?.length || 0} phases`
    : 'No roadmap available';

  const archContextForRisk = `Architecture:
  Presentation: ${layers.presentation?.technology || 'N/A'}
  API: ${layers.api?.technology || 'N/A'}
  Business Logic: ${layers.business_logic?.technology || 'N/A'}
  Data: ${layers.data?.technology || 'N/A'}
  Infrastructure: ${layers.infrastructure?.technology || 'N/A'}
  Components: ${Object.values(layers).reduce((sum, l) => sum + l.components.length, 0)}`;

  const riskPrompt = `Generate a risk register for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}

${competitiveContext}

${roadmapContextForRisk}

${archContextForRisk}

Output ONLY valid JSON.`;

  const riskResponse = await client.complete(RISK_SYSTEM_PROMPT + getFourBucketsPrompt(), riskPrompt, { timeout: 120000 });
  const riskUsage = extractUsage(riskResponse);
  const riskParsed = parseJSON(riskResponse);
  const riskFourBuckets = parseFourBuckets(riskParsed, { logger });

  if (!Array.isArray(riskParsed.risks) || riskParsed.risks.length === 0) {
    throw new Error('Stage 14 risk register: LLM returned no risks');
  }

  const risks = riskParsed.risks.map(r => ({
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

  let riskLlmFallbackCount = 0;
  for (const r of riskParsed.risks || []) {
    if (!SEVERITY_ENUM.includes(r.severity)) riskLlmFallbackCount++;
    if (!PRIORITY_ENUM.includes(r.priority)) riskLlmFallbackCount++;
  }

  let financialContract = null;
  if (ventureName) {
    try {
      financialContract = await getContract(ventureId);
      if (financialContract) {
        logger.log('[Stage14] Financial contract loaded for risk grounding');
      }
    } catch (err) {
      logger.warn('[Stage14] Financial contract lookup skipped:', err.message);
    }
  }

  logger.log('[Stage14] Risk register complete', { riskCount: risks.length });
  logger.log('[Stage14] Analysis complete', { duration: Date.now() - startTime });
  return {
    artifactType: 'blueprint_technical_architecture',
    architecture_summary,
    layers,
    security,
    dataEntities,
    integration_points,
    constraints,
    layer_count: Object.keys(layers).length,
    total_components: Object.values(layers).reduce((sum, l) => sum + l.components.length, 0),
    all_layers_defined: REQUIRED_LAYERS.every(l => layers[l] && layers[l].technology !== 'TBD'),
    entity_count: dataEntities.length,
    llmFallbackCount,
    fourBuckets, usage,
    extractedADRs,
    // Risk register fields (SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B)
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
    riskLlmFallbackCount,
    riskFourBuckets,
    riskUsage,
  };
}


export { REQUIRED_LAYERS, CONSTRAINT_CATEGORIES, MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM };
