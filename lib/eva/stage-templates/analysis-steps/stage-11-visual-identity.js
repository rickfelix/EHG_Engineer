/**
 * Stage 11 Analysis Step - Naming & Visual Identity
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Consumes Stage 10 customer personas and brand genome to evaluate
 * naming candidates against personas and produce visual identity guidelines.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-11-visual-identity
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { runTournament } from '../../crews/tournament-orchestrator.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

// Duplicated from stage-11.js to avoid circular dependency
const MIN_CANDIDATES = 5;
const MIN_CRITERIA = 3;
const NAMING_STRATEGIES = ['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical'];
const AVAILABILITY_STATUSES = ['pending', 'available', 'taken', 'unknown'];

const SYSTEM_PROMPT = `You are EVA's Naming & Visual Identity Engine. Evaluate naming candidates against customer personas and produce visual identity guidelines.

You MUST output valid JSON with exactly this structure:
{
  "namingStrategy": {
    "approach": "descriptive|abstract|acronym|founder|metaphorical",
    "rationale": "Why this naming approach fits the brand and personas"
  },
  "scoringCriteria": [
    { "name": "Criterion name", "weight": 25 }
  ],
  "candidates": [
    {
      "name": "Brand name candidate",
      "rationale": "Why this name fits brand and resonates with personas",
      "scores": { "Criterion name": 85 },
      "personaFit": [
        {
          "personaName": "Persona name from Stage 10",
          "fitScore": 85,
          "reasoning": "How this name resonates with this persona"
        }
      ]
    }
  ],
  "visualIdentity": {
    "colorPalette": [
      {
        "name": "Primary",
        "hex": "#2563EB",
        "usage": "Primary brand color, CTAs, key UI elements",
        "personaAlignment": "Appeals to professional/tech audience"
      }
    ],
    "typography": {
      "heading": "Font family for headings",
      "body": "Font family for body text",
      "rationale": "Why these fonts fit the brand personality"
    },
    "imageryGuidance": "Guidelines for visual imagery style, photography direction, illustration style"
  },
  "brandExpression": {
    "tagline": "Brand tagline",
    "elevator_pitch": "30-second elevator pitch",
    "messaging_pillars": ["Pillar 1", "Pillar 2", "Pillar 3"]
  },
  "decision": {
    "selectedName": "Top-scoring candidate name",
    "workingTitle": true,
    "rationale": "Why this name is recommended",
    "availabilityChecks": { "domain": "pending", "trademark": "pending", "social": "pending" }
  }
}

Rules:
- Generate at least ${MIN_CANDIDATES} naming candidates
- Each candidate MUST have personaFit scores referencing Stage 10 personas by name
- Generate at least ${MIN_CRITERIA} scoring criteria, weights MUST sum to exactly 100
- Include "Persona Resonance" as one scoring criterion
- Visual identity must include colorPalette (>=3 colors), typography, and imageryGuidance
- Color palette entries must include hex value, usage description, and persona alignment
- Typography must include heading and body font recommendations
- Brand expression includes tagline, elevator pitch, and messaging pillars
- Names should be evaluated against both brand genome AND customer personas
- Tournament-mode scoring preserved for naming candidates`;

/**
 * Generate naming evaluation and visual identity from Stage 10 data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea (required)
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} params.stage10Data - Stage 10 customer & brand (required)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Naming & visual identity analysis
 */
export async function analyzeStage11({ stage1Data, stage5Data, stage10Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage11] Starting naming & visual identity analysis', { ventureName });

  if (!stage1Data?.description) {
    throw new Error('Stage 11 requires Stage 1 data with description');
  }
  if (!stage10Data?.customerPersonas || !stage10Data?.brandGenome) {
    throw new Error('Stage 11 requires Stage 10 data with customerPersonas and brandGenome');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build persona context from Stage 10
  const personaContext = stage10Data.customerPersonas
    .map(p => `- ${p.name}: Goals: ${(p.goals || []).join(', ')}. Pain points: ${(p.painPoints || []).join(', ')}`)
    .join('\n');

  const brandContext = `Brand Archetype: ${stage10Data.brandGenome.archetype}
Brand Values: ${(stage10Data.brandGenome.values || []).join(', ')}
Brand Tone: ${stage10Data.brandGenome.tone}
Target Audience: ${stage10Data.brandGenome.audience}
Differentiators: ${(stage10Data.brandGenome.differentiators || []).join(', ')}`;

  const financialContext = stage5Data
    ? `Financial: Initial Investment $${stage5Data.initialInvestment || 'N/A'}`
    : '';

  // Include Stage 10 naming candidates if available for refinement
  const existingCandidates = stage10Data.candidates
    ? `\nExisting naming candidates from Stage 10 (refine or replace):\n${stage10Data.candidates.map(c => `- ${c.name}: ${c.rationale}`).join('\n')}`
    : '';

  // ── SRIP Naming Candidates (optional enrichment) ──────────────
  let sripNamingContext = '';
  let sripNamingCount = 0;
  if (supabase && ventureId) {
    try {
      const { data: sripCandidates } = await supabase
        .from('naming_suggestions')
        .select('name, rationale, brand_fit_score')
        .eq('venture_id', ventureId)
        .order('brand_fit_score', { ascending: false, nullsFirst: false })
        .limit(10);

      if (sripCandidates?.length > 0) {
        sripNamingCount = sripCandidates.length;
        sripNamingContext = `\nSRIP Naming Candidates (from brand DNA analysis — consider alongside Stage 10 candidates):\n${sripCandidates.map(c => `- ${c.name} (brand fit: ${c.brand_fit_score ?? 'N/A'}): ${c.rationale || 'No rationale'}`).join('\n')}`;
        logger.log('[Stage11-SRIP] Found SRIP naming candidates', { count: sripNamingCount });
      }
    } catch (err) {
      logger.warn('[Stage11-SRIP] Naming candidates lookup failed (non-fatal)', { error: err.message });
    }
  }

  const userPrompt = `Evaluate naming candidates against customer personas and create visual identity for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}

Customer Personas (from Stage 10):
${personaContext}

${brandContext}
${financialContext}
${existingCandidates}
${sripNamingContext}

IMPORTANT: Each naming candidate MUST include personaFit scores for each Stage 10 persona.${sripNamingCount > 0 ? '\nConsider the SRIP naming candidates above — they were generated from brand DNA forensic analysis. Include the best ones alongside your own candidates.' : ''}

Output ONLY valid JSON.`;

  // Tournament mode support
  const tournamentEnabled = process.env.CREW_TOURNAMENT_ENABLED === 'true';
  let parsed, fourBuckets, tournamentMeta = null, usage = null;

  if (tournamentEnabled) {
    logger.log('[Stage11] Tournament mode enabled');
    const { result, tournament } = await runTournament({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      context: { description: stage1Data.description, targetMarket: stage1Data.targetMarket },
      options: { logger },
    });
    tournamentMeta = tournament;

    if (result) {
      parsed = result;
      fourBuckets = result.fourBuckets || parseFourBuckets(result, { logger });
    } else {
      logger.log('[Stage11] Tournament fallback — using single generation');
      const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
      usage = extractUsage(response);
      parsed = parseJSON(response);
      fourBuckets = parseFourBuckets(parsed, { logger });
    }
  } else {
    const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
    usage = extractUsage(response);
    parsed = parseJSON(response);
    fourBuckets = parseFourBuckets(parsed, { logger });
  }

  let llmFallbackCount = 0;
  const personaNames = stage10Data.customerPersonas.map(p => p.name);

  // --- Normalize naming strategy ---
  const rawNs = parsed.namingStrategy || {};
  const namingStrategy = {
    approach: NAMING_STRATEGIES.includes(rawNs.approach) ? rawNs.approach : 'descriptive',
    rationale: String(rawNs.rationale || 'Selected based on brand and persona analysis').substring(0, 500),
  };

  // --- Normalize scoring criteria ---
  let scoringCriteria = Array.isArray(parsed.scoringCriteria)
    ? parsed.scoringCriteria.filter(c => c?.name && typeof c?.weight === 'number')
    : [];
  if (scoringCriteria.length < MIN_CRITERIA) {
    llmFallbackCount++;
    scoringCriteria = [
      { name: 'Memorability', weight: 25 },
      { name: 'Relevance', weight: 25 },
      { name: 'Persona Resonance', weight: 25 },
      { name: 'Uniqueness', weight: 25 },
    ];
  }
  // Ensure "Persona Resonance" is a criterion
  if (!scoringCriteria.some(c => c.name.toLowerCase().includes('persona'))) {
    scoringCriteria.push({ name: 'Persona Resonance', weight: 0 });
  }

  // Normalize weights to sum to 100
  const weightSum = scoringCriteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(weightSum - 100) > 0.001) {
    const factor = 100 / weightSum;
    scoringCriteria = scoringCriteria.map(c => ({
      name: String(c.name).substring(0, 200),
      weight: Math.round(c.weight * factor * 100) / 100,
    }));
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

  // --- Normalize candidates with personaFit ---
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error('Stage 11: LLM returned no naming candidates');
  }

  const candidates = parsed.candidates.map((c, i) => {
    const scores = {};
    for (const criterion of scoringCriteria) {
      const raw = c.scores?.[criterion.name];
      scores[criterion.name] = typeof raw === 'number' ? Math.min(100, Math.max(0, Math.round(raw))) : 50;
    }

    // Normalize personaFit — ensure each Stage 10 persona is referenced
    let personaFit = Array.isArray(c.personaFit) ? c.personaFit : [];
    if (personaFit.length === 0) llmFallbackCount++;

    // Ensure all personas from Stage 10 are represented
    for (const pName of personaNames) {
      if (!personaFit.some(pf => pf.personaName === pName)) {
        personaFit.push({
          personaName: pName,
          fitScore: 50,
          reasoning: 'Default fit assessment',
        });
      }
    }

    personaFit = personaFit.map(pf => ({
      personaName: String(pf.personaName || 'Unknown').substring(0, 200),
      fitScore: typeof pf.fitScore === 'number' ? Math.min(100, Math.max(0, Math.round(pf.fitScore))) : 50,
      reasoning: String(pf.reasoning || 'No reasoning provided').substring(0, 500),
    }));

    return {
      name: String(c.name || `Candidate ${i + 1}`).substring(0, 200),
      rationale: String(c.rationale || 'Generated candidate').substring(0, 500),
      scores,
      personaFit,
    };
  });

  // --- Normalize visual identity ---
  if (!parsed.visualIdentity || typeof parsed.visualIdentity !== 'object') llmFallbackCount++;
  const rawVi = parsed.visualIdentity || {};

  let colorPalette = Array.isArray(rawVi.colorPalette) ? rawVi.colorPalette : [];
  if (colorPalette.length === 0) {
    llmFallbackCount++;
    colorPalette = [
      { name: 'Primary', hex: '#2563EB', usage: 'Primary brand color', personaAlignment: 'Professional appeal' },
      { name: 'Secondary', hex: '#10B981', usage: 'Accent and success states', personaAlignment: 'Trust and growth' },
      { name: 'Neutral', hex: '#6B7280', usage: 'Text and backgrounds', personaAlignment: 'Clean, readable' },
    ];
  }
  colorPalette = colorPalette.map(c => ({
    name: String(c.name || 'Color').substring(0, 100),
    hex: String(c.hex || '#000000').substring(0, 7),
    usage: String(c.usage || '').substring(0, 300),
    personaAlignment: String(c.personaAlignment || '').substring(0, 300),
  }));

  const typography = rawVi.typography && typeof rawVi.typography === 'object'
    ? {
        heading: String(rawVi.typography.heading || 'Inter').substring(0, 100),
        body: String(rawVi.typography.body || 'Inter').substring(0, 100),
        rationale: String(rawVi.typography.rationale || '').substring(0, 300),
      }
    : { heading: 'Inter', body: 'Inter', rationale: 'Clean, modern sans-serif' };

  const imageryGuidance = String(rawVi.imageryGuidance || 'Professional, modern imagery aligned with brand values').substring(0, 1000);

  const visualIdentity = { colorPalette, typography, imageryGuidance };

  // --- Normalize brand expression ---
  const rawBe = parsed.brandExpression || {};
  const brandExpression = {
    tagline: String(rawBe.tagline || '').substring(0, 200) || null,
    elevator_pitch: String(rawBe.elevator_pitch || '').substring(0, 500) || null,
    messaging_pillars: Array.isArray(rawBe.messaging_pillars)
      ? rawBe.messaging_pillars.map(p => String(p).substring(0, 200))
      : [],
  };

  // --- Normalize decision ---
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
    rationale: String(dec.rationale || 'Top-scoring candidate based on weighted criteria and persona fit').substring(0, 500),
    availabilityChecks: {
      domain: AVAILABILITY_STATUSES.includes(ac.domain) ? ac.domain : 'pending',
      trademark: AVAILABILITY_STATUSES.includes(ac.trademark) ? ac.trademark : 'pending',
      social: AVAILABILITY_STATUSES.includes(ac.social) ? ac.social : 'pending',
    },
  };

  if (llmFallbackCount > 0) {
    logger.warn('[Stage11] LLM fallback fields detected', { llmFallbackCount });
  }

  // --- DB Write-Through: Naming Suggestions + Venture Artifacts ---
  if (supabase && ventureId) {
    await writeStage11Artifacts({ supabase, ventureId, candidates, logger });
  }

  logger.log('[Stage11] Analysis complete', { duration: Date.now() - startTime, candidateCount: candidates.length });
  return {
    namingStrategy,
    scoringCriteria,
    candidates,
    visualIdentity,
    brandExpression,
    decision,
    totalCandidates: candidates.length,
    totalCriteria: scoringCriteria.length,
    fourBuckets, usage, llmFallbackCount,
    ...(tournamentMeta ? { tournament: tournamentMeta } : {}),
  };
}

/**
 * Write Stage 11 naming candidates to naming_suggestions and venture_artifacts.
 * All DB writes are non-fatal — errors are logged and swallowed.
 */
async function writeStage11Artifacts({ supabase, ventureId, candidates, logger }) {
  // Generate a session UUID per Stage 11 run
  const generationSessionId = crypto.randomUUID();

  for (const candidate of candidates) {
    try {
      // Compute brand_fit_score from personaFit average if available
      const personaFitAvg = Array.isArray(candidate.personaFit) && candidate.personaFit.length > 0
        ? Math.round(candidate.personaFit.reduce((sum, pf) => sum + (pf.fitScore || 0), 0) / candidate.personaFit.length)
        : null;

      // Map pronounceability from scoring criteria if present
      const pronounceabilityScore = candidate.scores?.['Pronounceability'] ?? candidate.scores?.['Memorability'] ?? null;
      const uniquenessScore = candidate.scores?.['Uniqueness'] ?? null;

      const { error: insertErr } = await supabase.from('naming_suggestions').insert({
        venture_id: ventureId,
        generation_session_id: generationSessionId,
        name: candidate.name,
        rationale: candidate.rationale,
        brand_fit_score: personaFitAvg,
        pronounceability_score: pronounceabilityScore,
        uniqueness_score: uniquenessScore,
        domain_com_status: 'unknown',
        domain_io_status: 'unknown',
        domain_ai_status: 'unknown',
      });

      if (insertErr) {
        logger.warn('[Stage11] Naming suggestion insert failed', { name: candidate.name, error: insertErr.message });
      }
    } catch (err) {
      logger.warn('[Stage11] Naming suggestion write error', { name: candidate.name, error: err.message });
    }
  }

  // Write venture_artifacts ref for naming session
  try {
    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: 11,
      artifact_type: 'brand_name',
      title: 'Naming Candidates (Stage 11)',
      metadata: {
        generation_session_id: generationSessionId,
        candidate_count: candidates.length,
        source: 'stage-11-analysis',
      },
    });
  } catch (err) {
    logger.warn('[Stage11] Naming artifact ref failed', { error: err.message });
  }

  logger.log('[Stage11] Wrote naming suggestions', { sessionId: generationSessionId, count: candidates.length });
}

export { MIN_CANDIDATES, MIN_CRITERIA, NAMING_STRATEGIES };
