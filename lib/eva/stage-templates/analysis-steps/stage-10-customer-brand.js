/**
 * Stage 10 Analysis Step - Customer & Brand Foundation
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Generates customer personas FIRST from upstream research data,
 * then derives brand genome grounded in persona insights.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-10-customer-brand
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { writeArtifact } from '../../artifact-persistence-service.js';

// ── SRIP Enrichment (optional — all imports try/catch guarded) ──────
let sripSiteDna = null;
let sripBrandInterview = null;
let sripPromptBuilder = null;
let sripQualityCheck = null;
let sripArtifactSynthesizer = null;
try {
  sripSiteDna = await import('../../services/srip-site-dna.js');
  sripBrandInterview = await import('../../services/srip-brand-interview.js');
  sripPromptBuilder = await import('../../services/srip-prompt-builder.js');
  sripQualityCheck = await import('../../services/srip-quality-check.js');
  sripArtifactSynthesizer = await import('../../services/srip-artifact-synthesizer.js');
} catch {
  // SRIP modules not available — enrichment disabled, standalone LLM path used
}

// Duplicated from stage-10.js to avoid circular dependency
const MIN_PERSONAS = 3;
const MIN_CANDIDATES = 5;
const MIN_CRITERIA = 3;
const NAMING_STRATEGIES = ['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical'];
const AVAILABILITY_STATUSES = ['pending', 'available', 'taken', 'unknown'];

const SYSTEM_PROMPT = `You are EVA's Customer & Brand Foundation Engine. Generate customer personas FIRST, then derive a brand genome grounded in those personas.

You MUST output valid JSON with exactly this structure:
{
  "customerPersonas": [
    {
      "name": "Persona name (e.g., 'Tech-Savvy Startup Founder')",
      "demographics": {
        "ageRange": "25-40",
        "role": "Founder/CEO",
        "companySize": "1-50 employees",
        "industry": "Technology",
        "income": "Mid-to-high",
        "location": "Urban"
      },
      "goals": ["Primary goal 1", "Primary goal 2"],
      "painPoints": ["Pain point 1", "Pain point 2"],
      "behaviors": ["Behavior 1", "Behavior 2"],
      "motivations": ["Motivation 1", "Motivation 2"]
    }
  ],
  "brandGenome": {
    "archetype": "Brand archetype (Hero, Explorer, Creator, etc.)",
    "values": ["Core value 1", "Core value 2", "Core value 3"],
    "tone": "Brand tone description grounded in persona preferences",
    "audience": "Primary audience description derived from personas",
    "differentiators": ["Differentiator 1", "Differentiator 2"],
    "customerAlignment": [
      {
        "trait": "Brand trait or value",
        "personaName": "Persona this trait serves",
        "personaInsight": "How this trait addresses the persona's needs/goals"
      }
    ]
  },
  "brandPersonality": {
    "vision": "Company vision statement",
    "mission": "Company mission statement",
    "brandVoice": "Detailed brand voice guidelines"
  },
  "namingStrategy": "descriptive|abstract|acronym|founder|metaphorical",
  "scoringCriteria": [
    { "name": "Criterion name", "weight": 25 }
  ],
  "candidates": [
    {
      "name": "Brand name candidate",
      "rationale": "Why this name fits the brand and resonates with personas",
      "scores": { "Criterion name": 85 }
    }
  ],
  "decision": {
    "selectedName": "Top-scoring candidate name",
    "workingTitle": true,
    "rationale": "Why this name is recommended",
    "availabilityChecks": { "domain": "pending", "trademark": "pending", "social": "pending" }
  }
}

Rules:
- Generate at least ${MIN_PERSONAS} customer personas with demographics, goals, painPoints
- Personas must be derived from upstream research data (stages 1, 3, 5, 8)
- Brand genome MUST include customerAlignment linking each brand trait to persona insights
- Each customerAlignment entry must reference a specific persona by name
- Generate at least ${MIN_CANDIDATES} naming candidates
- Generate at least ${MIN_CRITERIA} scoring criteria, weights MUST sum to exactly 100
- Each candidate MUST have a score (0-100) for every criterion
- brandPersonality vision/mission must be specific to this venture
- namingStrategy: choose approach that fits both brand and customer personas
- decision.selectedName must match one of the candidate names`;

/**
 * Check if SRIP enrichment data is available for a venture.
 * Returns synthesis prompt text if available, null otherwise.
 *
 * @param {string} ventureId
 * @param {Object} supabase
 * @param {Object} logger
 * @returns {Promise<{enriched: boolean, synthesisText: string|null}>}
 */
async function checkSripEnrichment(ventureId, supabase, logger) {
  if (!sripSiteDna || !sripBrandInterview || !sripPromptBuilder) {
    return { enriched: false, synthesisText: null };
  }

  try {
    // 1. Check for completed site DNA
    const dna = await sripSiteDna.getLatestCompletedDna(ventureId);
    if (!dna?.dna_json) {
      logger.log('[Stage10-SRIP] No completed site DNA found — using standalone LLM');
      return { enriched: false, synthesisText: null };
    }

    // 2. Check for completed brand interview linked to this DNA
    const interview = await sripBrandInterview.getLatestCompletedInterview(dna.id);
    if (!interview?.answers) {
      logger.log('[Stage10-SRIP] No completed brand interview found — using standalone LLM');
      return { enriched: false, synthesisText: null };
    }

    // 3. Check quality gate (optional — if quality check exists and failed, fall back)
    if (sripQualityCheck) {
      try {
        // Look for quality checks linked to any synthesis prompt for this venture
        const { data: checks } = await supabase
          .from('srip_quality_checks')
          .select('passed')
          .eq('venture_id', ventureId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (checks?.[0] && checks[0].passed === false) {
          logger.log('[Stage10-SRIP] Quality check failed — falling back to standalone LLM');
          return { enriched: false, synthesisText: null };
        }
      } catch {
        // Quality check lookup failed — proceed with enrichment (non-blocking)
      }
    }

    // 4. Build synthesis prompt
    const { promptText, tokenEstimate } = sripPromptBuilder.buildSynthesisPrompt({
      dnaJson: dna.dna_json,
      answers: interview.answers,
    });

    // Truncate to max 2000 tokens (~8000 chars) to avoid exceeding LLM limits
    const maxChars = 8000;
    const truncatedPrompt = promptText.length > maxChars
      ? promptText.substring(0, maxChars) + '\n\n[... SRIP synthesis truncated for token budget]'
      : promptText;

    logger.log('[Stage10-SRIP] Enrichment available', { tokenEstimate, truncated: promptText.length > maxChars });
    return { enriched: true, synthesisText: truncatedPrompt };
  } catch (err) {
    logger.warn('[Stage10-SRIP] Enrichment check failed — using standalone LLM', { error: err.message });
    return { enriched: false, synthesisText: null };
  }
}

/**
 * Generate customer personas and brand foundation from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea (required)
 * @param {Object} [params.stage3Data] - Stage 3 hybrid scoring
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage8Data] - Stage 8 BMC
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Customer & brand foundation analysis
 */
export async function analyzeStage10({ stage1Data, stage3Data, stage5Data, stage8Data, ventureName, ventureId, supabase, logger = console, visionKey = null, planKey = null }) {
  const startTime = Date.now();
  logger.log('[Stage10] Starting customer & brand foundation analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 10 customer & brand requires Stage 1 data with description');
  }

  // ── SRIP Auto-Synthesis (runs before enrichment check) ─────────
  if (sripArtifactSynthesizer && supabase && ventureId) {
    try {
      const synthResult = await sripArtifactSynthesizer.synthesizeFromArtifacts(ventureId, supabase, logger);
      if (synthResult.synthesized) {
        logger.log('[Stage10-SRIP-Synth] Auto-synthesized SRIP data from stage artifacts');
      }
    } catch (err) {
      logger.warn?.('[Stage10-SRIP-Synth] Synthesis failed — continuing with existing data', { error: err.message });
    }
  }

  // ── SRIP Enrichment Check ──────────────────────────────────────
  let sripEnriched = false;
  let sripContext = '';
  if (supabase && ventureId) {
    const srip = await checkSripEnrichment(ventureId, supabase, logger);
    sripEnriched = srip.enriched;
    if (srip.synthesisText) {
      sripContext = `\n\n--- SRIP BRAND INTELLIGENCE (from forensic site audit + brand interview) ---\n${srip.synthesisText}\n--- END SRIP CONTEXT ---\n`;
      logger.log('[Stage10] SRIP enrichment active — injecting synthesis into LLM context');
    }
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const scoringContext = stage3Data?.overallScore
    ? `Viability Score: ${stage3Data.overallScore}/100`
    : '';

  const financialContext = stage5Data
    ? `Financial: Initial Investment $${stage5Data.initialInvestment || 'N/A'}, Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}`
    : '';

  const bmcContext = stage8Data
    ? `BMC Customer Segments: ${sanitizeForPrompt(JSON.stringify(stage8Data.customerSegments?.items || stage8Data.customerSegments || 'N/A').substring(0, 300))}
BMC Value Proposition: ${stage8Data.valuePropositions?.items?.[0] || 'N/A'}`
    : '';

  const userPrompt = `Generate customer personas and brand foundation for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}
Value Proposition: ${sanitizeForPrompt(stage1Data.valueProp || 'N/A')}
${scoringContext}
${financialContext}
${bmcContext}
${sripContext}
IMPORTANT: Generate customer personas FIRST based on the research data above, then derive the brand genome to serve those personas.${sripEnriched ? '\nLeverage the SRIP brand intelligence above to ground your personas and brand genome in real site DNA analysis.' : ''}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  let llmFallbackCount = 0;

  // --- Normalize customer personas ---
  let customerPersonas = Array.isArray(parsed.customerPersonas) ? parsed.customerPersonas : [];
  if (customerPersonas.length < MIN_PERSONAS) llmFallbackCount++;
  while (customerPersonas.length < MIN_PERSONAS) {
    customerPersonas.push({
      name: `Persona ${customerPersonas.length + 1}`,
      demographics: { role: 'General user', industry: 'Various' },
      goals: ['Solve the core problem'],
      painPoints: ['Current solutions are inadequate'],
      behaviors: [],
      motivations: [],
    });
  }
  customerPersonas = customerPersonas.map((p, i) => ({
    name: String(p.name || `Persona ${i + 1}`).substring(0, 200),
    demographics: p.demographics && typeof p.demographics === 'object' ? p.demographics : { role: 'General user' },
    goals: Array.isArray(p.goals) && p.goals.length > 0
      ? p.goals.map(g => String(g).substring(0, 300))
      : ['Solve the core problem'],
    painPoints: Array.isArray(p.painPoints) && p.painPoints.length > 0
      ? p.painPoints.map(pp => String(pp).substring(0, 300))
      : ['Current solutions are inadequate'],
    behaviors: Array.isArray(p.behaviors) ? p.behaviors.map(b => String(b).substring(0, 300)) : [],
    motivations: Array.isArray(p.motivations) ? p.motivations.map(m => String(m).substring(0, 300)) : [],
  }));

  // --- Normalize brand genome with customerAlignment ---
  if (!parsed.brandGenome || typeof parsed.brandGenome !== 'object') llmFallbackCount++;
  const rawBg = parsed.brandGenome || {};
  const brandGenome = {
    archetype: String(rawBg.archetype || 'Creator').substring(0, 200),
    values: Array.isArray(rawBg.values) && rawBg.values.length > 0
      ? rawBg.values.map(v => String(v).substring(0, 200))
      : ['Innovation'],
    tone: String(rawBg.tone || 'Professional').substring(0, 200),
    audience: String(rawBg.audience || stage1Data.targetMarket || 'General').substring(0, 200),
    differentiators: Array.isArray(rawBg.differentiators) && rawBg.differentiators.length > 0
      ? rawBg.differentiators.map(d => String(d).substring(0, 200))
      : ['Unique approach'],
    customerAlignment: [],
  };

  // Normalize customerAlignment — each brand trait linked to a persona
  let rawAlignment = Array.isArray(rawBg.customerAlignment) ? rawBg.customerAlignment : [];
  if (rawAlignment.length === 0) {
    llmFallbackCount++;
    // Auto-generate alignment from brand values and first persona
    rawAlignment = brandGenome.values.map(v => ({
      trait: v,
      personaName: customerPersonas[0]?.name || 'Primary User',
      personaInsight: `This value addresses the needs of ${customerPersonas[0]?.name || 'the primary user'}`,
    }));
  }
  brandGenome.customerAlignment = rawAlignment.map(ca => ({
    trait: String(ca.trait || 'Brand trait').substring(0, 200),
    personaName: String(ca.personaName || customerPersonas[0]?.name || 'Primary User').substring(0, 200),
    personaInsight: String(ca.personaInsight || 'Addresses persona needs').substring(0, 500),
  }));

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

  // Ensure weights sum to 100
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

  // --- Normalize candidates ---
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error('Stage 10: LLM returned no naming candidates');
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

  // --- Normalize brand personality ---
  if (!parsed.brandPersonality) llmFallbackCount++;
  const rawBp = parsed.brandPersonality || parsed.narrativeExtension || {};
  const brandPersonality = {
    vision: String(rawBp.vision || '').substring(0, 500) || null,
    mission: String(rawBp.mission || '').substring(0, 500) || null,
    brandVoice: String(rawBp.brandVoice || '').substring(0, 500) || null,
  };

  // --- Normalize naming strategy ---
  if (!NAMING_STRATEGIES.includes(parsed.namingStrategy)) llmFallbackCount++;
  const namingStrategy = NAMING_STRATEGIES.includes(parsed.namingStrategy)
    ? parsed.namingStrategy
    : 'descriptive';

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
    rationale: String(dec.rationale || 'Top-scoring candidate based on weighted criteria').substring(0, 500),
    availabilityChecks: {
      domain: AVAILABILITY_STATUSES.includes(ac.domain) ? ac.domain : 'pending',
      trademark: AVAILABILITY_STATUSES.includes(ac.trademark) ? ac.trademark : 'pending',
      social: AVAILABILITY_STATUSES.includes(ac.social) ? ac.social : 'pending',
    },
  };

  // --- Source provenance ---
  const sourceProvenance = {
    stage1: !!stage1Data,
    stage3: !!stage3Data,
    stage5: !!stage5Data,
    stage8: !!stage8Data,
    srip_enriched: sripEnriched,
    upstreamCount: [stage1Data, stage3Data, stage5Data, stage8Data].filter(Boolean).length,
  };

  if (llmFallbackCount > 0) {
    logger.warn('[Stage10] LLM fallback fields detected', { llmFallbackCount });
  }

  // --- DB Write-Through: Personas, Brand Genome, Venture Artifacts ---
  if (supabase && ventureId) {
    await writeStage10Artifacts({ supabase, ventureId, customerPersonas, brandGenome, stage1Data, logger, visionKey, planKey });
  }

  logger.log('[Stage10] Analysis complete', { duration: Date.now() - startTime, personaCount: customerPersonas.length });
  return {
    customerPersonas,
    brandGenome,
    brandPersonality,
    namingStrategy,
    scoringCriteria,
    candidates,
    decision,
    totalPersonas: customerPersonas.length,
    totalCandidates: candidates.length,
    totalCriteria: scoringCriteria.length,
    personaCoverageScore: null, // computed by template.computeDerived
    sourceProvenance,
    fourBuckets, usage, llmFallbackCount,
  };
}

/**
 * Write Stage 10 outputs to customer_personas, venture_persona_mapping,
 * brand_genome_submissions, and venture_artifacts.
 * All DB writes are non-fatal — errors are logged and swallowed.
 */
async function writeStage10Artifacts({ supabase, ventureId, customerPersonas, brandGenome, stage1Data, logger, visionKey = null, planKey = null }) {
  // Derive industry from stage1Data or first persona demographics
  const ventureIndustry = stage1Data?.targetMarket || customerPersonas[0]?.demographics?.industry || null;

  // 1. Upsert customer personas and create venture_persona_mapping
  for (let idx = 0; idx < customerPersonas.length; idx++) {
    const persona = customerPersonas[idx];
    try {
      const { data: personaRow, error: personaErr } = await supabase
        .from('customer_personas')
        .upsert({
          name: persona.name,
          demographics: persona.demographics,
          goals: persona.goals,
          pain_points: persona.painPoints,
          psychographics: { behaviors: persona.behaviors, motivations: persona.motivations },
          // Coalesce to empty string to match the partial unique index expression:
          // CREATE UNIQUE INDEX idx_customer_personas_canonical ON customer_personas (name, COALESCE(industry, '')) WHERE canonical_id IS NULL
          industry: ventureIndustry || '',
          source_venture_id: ventureId,
        }, { onConflict: 'name,industry' })
        .select('id')
        .single();

      if (personaErr) {
        logger.warn('[Stage10] Persona upsert failed', { name: persona.name, error: personaErr.message });
        continue;
      }

      // Create venture_persona_mapping with role encoded in notes and relevance_score
      const role = idx === 0 ? 'primary' : idx === 1 ? 'secondary' : 'tertiary';
      const relevanceScore = idx === 0 ? 1.0 : idx === 1 ? 0.75 : 0.5;
      const { error: mappingErr } = await supabase
        .from('venture_persona_mapping')
        .upsert({
          venture_id: ventureId,
          persona_id: personaRow.id,
          relevance_score: relevanceScore,
          notes: JSON.stringify({ role, source_stage: 10, generated_at: new Date().toISOString() }),
        }, { onConflict: 'venture_id,persona_id' })
        .select('id');

      if (mappingErr) {
        logger.warn('[Stage10] Persona mapping upsert failed', { personaId: personaRow.id, error: mappingErr.message });
      }
    } catch (err) {
      logger.warn('[Stage10] Persona write-through error', { name: persona.name, error: err.message });
    }
  }

  // 2. Create brand genome via service
  try {
    const { createBrandGenome } = await import('../../services/brand-genome.js');
    const genomeResult = await createBrandGenome(supabase, {
      venture_id: ventureId,
      // brand_genome_submissions.created_by is uuid NOT NULL with no FK constraint.
      // Use the all-zeros sentinel UUID for system-actor (no auth.getUser() in CLI).
      // Source attribution is preserved via brand_data + audit metadata, not created_by.
      created_by: '00000000-0000-0000-0000-000000000000',
      brand_data: {
        archetype: brandGenome.archetype,
        values: brandGenome.values,
        tone: brandGenome.tone,
        audience: brandGenome.audience,
        differentiators: brandGenome.differentiators,
        customerAlignment: brandGenome.customerAlignment,
      },
    });
    logger.log('[Stage10] Brand genome created', { id: genomeResult?.id });

    // Write venture_artifacts ref for brand genome via unified service
    try {
      await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 10,
        artifactType: 'identity_brand_guidelines',
        title: 'Brand Genome (Stage 10)',
        artifactData: genomeResult,
        metadata: { brand_genome_id: genomeResult?.id, source: 'stage-10-analysis' },
        source: 'stage-10-analysis',
        visionKey,
        planKey,
      });
    } catch (artifactErr) {
      logger.warn('[Stage10] Brand genome artifact ref failed', { error: artifactErr.message });
    }
  } catch (err) {
    logger.warn('[Stage10] Brand genome creation failed', { error: err.message });
  }

  // 3. Write venture_artifacts ref for persona catalog via unified service
  try {
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 10,
      artifactType: 'identity_brand_guidelines',
      title: 'Customer Personas (Stage 10)',
      artifactData: { personas: customerPersonas },
      metadata: { persona_count: customerPersonas.length, source: 'stage-10-analysis' },
      source: 'stage-10-analysis',
      visionKey,
      planKey,
    });
  } catch (err) {
    logger.warn('[Stage10] Persona artifact ref failed', { error: err.message });
  }
}

export { MIN_PERSONAS, MIN_CANDIDATES, MIN_CRITERIA, NAMING_STRATEGIES };
