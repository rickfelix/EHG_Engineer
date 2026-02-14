/**
 * Stage 14 Analysis Step - Technical Architecture Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stage 1 idea and Stage 13 roadmap to generate a technical
 * architecture with all 4 required layers, integration points,
 * and constraints.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';

const REQUIRED_LAYERS = ['frontend', 'backend', 'data', 'infra'];

const SYSTEM_PROMPT = `You are EVA's Technical Architecture Engine. Generate a structured technical architecture for a venture.

You MUST output valid JSON with exactly this structure:
{
  "architecture_summary": "High-level architecture description (min 20 chars)",
  "layers": {
    "frontend": {
      "technology": "React/Vue/etc",
      "components": ["Component 1", "Component 2"],
      "rationale": "Why this technology"
    },
    "backend": {
      "technology": "Node.js/Python/etc",
      "components": ["Service 1", "Service 2"],
      "rationale": "Why this technology"
    },
    "data": {
      "technology": "PostgreSQL/MongoDB/etc",
      "components": ["Table 1", "Collection 1"],
      "rationale": "Why this technology"
    },
    "infra": {
      "technology": "AWS/GCP/Vercel/etc",
      "components": ["Service 1", "Service 2"],
      "rationale": "Why this infrastructure"
    }
  },
  "integration_points": [
    {
      "name": "Integration name",
      "source_layer": "frontend|backend|data|infra",
      "target_layer": "frontend|backend|data|infra",
      "protocol": "REST|GraphQL|gRPC|WebSocket|SQL|etc"
    }
  ],
  "constraints": [
    {
      "name": "Constraint name",
      "description": "Description of the constraint"
    }
  ]
}

Rules:
- ALL four layers (frontend, backend, data, infra) MUST be defined
- Each layer MUST have technology, at least 1 component, and rationale
- At least 1 integration point between layers
- Technology choices should be practical and match the venture's scale
- Rationale should reference specific venture needs, not generic advice
- Include relevant constraints (performance, security, compliance)`;

/**
 * Generate a technical architecture from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Technical architecture
 */
export async function analyzeStage14({ stage1Data, stage13Data, ventureName }) {
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
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}

${roadmapContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

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

  // Normalize integration points
  const integration_points = Array.isArray(parsed.integration_points) && parsed.integration_points.length > 0
    ? parsed.integration_points.map(ip => ({
      name: String(ip.name || 'Integration').substring(0, 200),
      source_layer: REQUIRED_LAYERS.includes(ip.source_layer) ? ip.source_layer : 'backend',
      target_layer: REQUIRED_LAYERS.includes(ip.target_layer) ? ip.target_layer : 'data',
      protocol: String(ip.protocol || 'REST').substring(0, 100),
    }))
    : [{ name: 'API Gateway', source_layer: 'frontend', target_layer: 'backend', protocol: 'REST' }];

  // Normalize constraints
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.map(c => ({
      name: String(c.name || 'Constraint').substring(0, 200),
      description: String(c.description || '').substring(0, 500),
    }))
    : [];

  const architecture_summary = String(parsed.architecture_summary || '').length >= 20
    ? String(parsed.architecture_summary).substring(0, 500)
    : `Technical architecture for ${ventureName || 'venture'}: ${Object.values(layers).map(l => l.technology).join(', ')}`;

  return {
    architecture_summary,
    layers,
    integration_points,
    constraints,
    layerCount: Object.keys(layers).length,
    totalComponents: Object.values(layers).reduce((sum, l) => sum + l.components.length, 0),
    allLayersDefined: REQUIRED_LAYERS.every(l => layers[l] && layers[l].technology !== 'TBD'),
  };
}


export { REQUIRED_LAYERS };
