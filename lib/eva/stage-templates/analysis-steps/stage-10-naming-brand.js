/**
 * Stage 10 Analysis Step - Naming / Brand Generation
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Consumes Stages 1-9 data and generates brand genome, scoring criteria,
 * and naming candidates with weighted scoring.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-10-naming-brand
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const MIN_CANDIDATES = 5;
const MIN_CRITERIA = 3;
const NAMING_STRATEGIES = ['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical'];
const AVAILABILITY_STATUSES = ['pending', 'available', 'taken', 'unknown'];

const SYSTEM_PROMPT = `You are EVA's Brand Identity Engine. Generate a complete brand naming analysis for a venture based on prior stage data.

You MUST output valid JSON with exactly this structure:
{
  "brandGenome": {
    "archetype": "Brand archetype (e.g., Hero, Explorer, Creator)",
    "values": ["Core value 1", "Core value 2", "Core value 3"],
    "tone": "Brand tone description",
    "audience": "Primary audience description",
    "differentiators": ["Differentiator 1", "Differentiator 2"]
  },
  "narrativeExtension": {
    "vision": "Company vision statement (aspirational future state)",
    "mission": "Company mission statement (how you get there)",
    "brandVoice": "Detailed brand voice guidelines (tone, style, personality)"
  },
  "namingStrategy": "descriptive|abstract|acronym|founder|metaphorical",
  "scoringCriteria": [
    { "name": "Criterion name", "weight": 25 }
  ],
  "candidates": [
    {
      "name": "Brand name candidate",
      "rationale": "Why this name fits the brand",
      "scores": { "Criterion name": 85 }
    }
  ],
  "decision": {
    "selectedName": "Top-scoring candidate name",
    "workingTitle": true,
    "rationale": "Why this name is recommended (2-3 sentences)",
    "availabilityChecks": {
      "domain": "pending",
      "trademark": "pending",
      "social": "pending"
    }
  }
}

Rules:
- Generate at least ${MIN_CANDIDATES} naming candidates
- Generate at least ${MIN_CRITERIA} scoring criteria
- Scoring criteria weights MUST sum to exactly 100
- Each candidate MUST have a score (0-100) for every criterion
- Brand genome must include archetype, values (>= 1), tone, audience, differentiators (>= 1)
- narrativeExtension: vision and mission must be specific to this venture, not generic
- namingStrategy: choose the approach that best fits the venture (descriptive, abstract, acronym, founder, metaphorical)
- decision.selectedName must match one of the candidate names
- decision.workingTitle should be true (pending availability checks)
- Names should be creative, memorable, and relevant to the venture
- Rationale should explain why the name fits the brand genome`;

/**
 * Generate brand naming analysis from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage3Data] - Stage 3 hybrid scoring
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage8Data] - Stage 8 BMC
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Brand naming analysis
 */
export async function analyzeStage10({ stage1Data, stage3Data, stage5Data, stage8Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage10] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 10 naming/brand requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const scoringContext = stage3Data?.overallScore
    ? `Viability Score: ${stage3Data.overallScore}/100`
    : '';

  const financialContext = stage5Data
    ? `Financial: Initial Investment $${stage5Data.initialInvestment || 'N/A'}, Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}`
    : '';

  const bmcContext = stage8Data
    ? `BMC Value Proposition: ${stage8Data.value_propositions?.items?.[0] || 'N/A'}`
    : '';

  const userPrompt = `Generate a brand naming analysis for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}
${scoringContext}
${financialContext}
${bmcContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize brand genome
  const brandGenome = {
    archetype: String(parsed.brandGenome?.archetype || 'Creator').substring(0, 200),
    values: Array.isArray(parsed.brandGenome?.values) && parsed.brandGenome.values.length > 0
      ? parsed.brandGenome.values.map(v => String(v).substring(0, 200))
      : ['Innovation'],
    tone: String(parsed.brandGenome?.tone || 'Professional').substring(0, 200),
    audience: String(parsed.brandGenome?.audience || stage1Data.targetMarket || 'General').substring(0, 200),
    differentiators: Array.isArray(parsed.brandGenome?.differentiators) && parsed.brandGenome.differentiators.length > 0
      ? parsed.brandGenome.differentiators.map(d => String(d).substring(0, 200))
      : ['Unique approach'],
  };

  // Normalize scoring criteria
  let scoringCriteria = Array.isArray(parsed.scoringCriteria)
    ? parsed.scoringCriteria.filter(c => c?.name && typeof c?.weight === 'number')
    : [];

  if (scoringCriteria.length < MIN_CRITERIA) {
    scoringCriteria = [
      { name: 'Memorability', weight: 30 },
      { name: 'Relevance', weight: 30 },
      { name: 'Uniqueness', weight: 20 },
      { name: 'Pronounceability', weight: 20 },
    ];
  }

  // Ensure weights sum to 100
  const weightSum = scoringCriteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(weightSum - 100) > 0.001) {
    const factor = 100 / weightSum;
    scoringCriteria = scoringCriteria.map(c => ({
      name: String(c.name).substring(0, 200),
      weight: Math.round(c.weight * factor * 100) / 100,
    }));
    // Fix rounding
    const newSum = scoringCriteria.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(newSum - 100) > 0.001) {
      scoringCriteria[0].weight += 100 - newSum;
      scoringCriteria[0].weight = Math.round(scoringCriteria[0].weight * 100) / 100;
    }
  } else {
    scoringCriteria = scoringCriteria.map(c => ({
      name: String(c.name).substring(0, 200),
      weight: c.weight,
    }));
  }

  // Normalize candidates
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error('Stage 10 naming/brand: LLM returned no candidates');
  }

  const candidates = parsed.candidates.map((c, i) => {
    const scores = {};
    for (const criterion of scoringCriteria) {
      const raw = c.scores?.[criterion.name];
      scores[criterion.name] = typeof raw === 'number' ? Math.min(100, Math.max(0, Math.round(raw))) : 50;
    }
    return {
      name: String(c.name || `Candidate ${i + 1}`).substring(0, 200),
      rationale: String(c.rationale || 'Generated candidate').substring(0, 500),
      scores,
    };
  });

  // Normalize narrativeExtension
  const ne = parsed.narrativeExtension || {};
  const narrativeExtension = {
    vision: String(ne.vision || '').substring(0, 500) || null,
    mission: String(ne.mission || '').substring(0, 500) || null,
    brandVoice: String(ne.brandVoice || '').substring(0, 500) || null,
  };

  // Normalize namingStrategy
  const namingStrategy = NAMING_STRATEGIES.includes(parsed.namingStrategy)
    ? parsed.namingStrategy
    : 'descriptive';

  // Normalize decision — select top-scoring candidate if LLM didn't provide one
  const dec = parsed.decision || {};
  const topCandidate = candidates.length > 0
    ? [...candidates].sort((a, b) => {
        const scoreA = scoringCriteria.reduce((sum, cr) => sum + (a.scores[cr.name] || 0) * cr.weight / 100, 0);
        const scoreB = scoringCriteria.reduce((sum, cr) => sum + (b.scores[cr.name] || 0) * cr.weight / 100, 0);
        return scoreB - scoreA;
      })[0]
    : null;
  const selectedName = dec.selectedName && candidates.some(c => c.name === dec.selectedName)
    ? dec.selectedName
    : topCandidate?.name || '';
  const ac = dec.availabilityChecks || {};
  const decision = {
    selectedName,
    workingTitle: dec.workingTitle !== false,
    rationale: String(dec.rationale || 'Top-scoring candidate based on weighted criteria').substring(0, 500),
    availabilityChecks: {
      domain: AVAILABILITY_STATUSES.includes(ac.domain) ? ac.domain : 'pending',
      trademark: AVAILABILITY_STATUSES.includes(ac.trademark) ? ac.trademark : 'pending',
      social: AVAILABILITY_STATUSES.includes(ac.social) ? ac.social : 'pending',
    },
  };

  logger.log('[Stage10] Analysis complete', { duration: Date.now() - startTime });
  return {
    brandGenome,
    narrativeExtension,
    namingStrategy,
    scoringCriteria,
    candidates,
    decision,
    totalCandidates: candidates.length,
    totalCriteria: scoringCriteria.length,
    fourBuckets, usage,
  };
}


export { MIN_CANDIDATES, MIN_CRITERIA, NAMING_STRATEGIES };
