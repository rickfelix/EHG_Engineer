/**
 * SRIP Naming Generator Module
 * SD: SD-LEO-INFRA-SRIP-QUALITY-SCORING-001
 *
 * Generates session-based brand name candidates from site DNA
 * and brand interview data. Domain availability is set to 'unknown'
 * per architecture phasing (WHOIS integration deferred to SD-C).
 *
 * Input: siteDnaId + brandInterviewId + ventureId
 * Output: Array of naming candidates with domain_status='unknown'
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../../lib/llm/client-factory.js';

dotenv.config();

const DEFAULT_CANDIDATE_COUNT = 8;

/**
 * Generate naming candidates from DNA + interview data.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.siteDnaId - Site DNA record UUID
 * @param {string} params.brandInterviewId - Brand interview UUID
 * @param {number} [params.count] - Number of candidates (default 8)
 * @returns {Promise<Array<Object>>} Array of naming candidates
 */
export async function generateNamingCandidates({
  ventureId,
  siteDnaId,
  brandInterviewId,
  count = DEFAULT_CANDIDATE_COUNT,
}) {
  const supabase = createSupabaseServiceClient();

  // Fetch DNA and interview data
  const [dnaResult, interviewResult] = await Promise.all([
    supabase.from('srip_site_dna').select('dna_json').eq('id', siteDnaId).single(),
    supabase.from('srip_brand_interviews').select('answers').eq('id', brandInterviewId).single(),
  ]);

  if (dnaResult.error) throw new Error(`DNA fetch failed: ${dnaResult.error.message}`);
  if (interviewResult.error) throw new Error(`Interview fetch failed: ${interviewResult.error.message}`);

  const dnaJson = dnaResult.data.dna_json || {};
  const answers = interviewResult.data.answers || {};

  // Extract naming signals from DNA + interview
  const brandName = answers.brand_name || '';
  const tagline = answers.tagline || '';
  const tone = answers.tone_of_voice || '';
  const audience = answers.target_audience || '';
  const positioning = answers.competitive_positioning || '';

  // Design tokens from DNA
  const designTokens = dnaJson.design_tokens || {};
  const techStack = dnaJson.tech_stack || {};

  // Build LLM prompt for naming generation
  const client = getValidationClient();
  const systemPrompt = `You are a brand naming expert. Generate ${count} creative brand name candidates based on the brand context provided. Each name should be:
- Memorable and unique
- Relevant to the brand's positioning
- Domain-friendly (could work as a .com)
- Appropriate for the target audience and tone

Return ONLY valid JSON array of objects with: name, rationale, style (e.g., "abstract", "descriptive", "compound", "acronym")`;

  const userPrompt = `Brand Context:
- Current Name: ${brandName}
- Tagline: ${tagline}
- Tone: ${tone}
- Target Audience: ${audience}
- Positioning: ${positioning}

Design Style: ${designTokens.colors?.primary || 'modern'} palette, ${answers.typography_preference || 'clean'} typography
Industry Signals: ${techStack.detected || 'web application'}

Generate ${count} naming candidates as JSON array.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const responseText = response.content[0]?.text || '[]';
    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const candidates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Add domain_status = 'unknown' per architecture phasing
    return candidates.map((candidate, index) => ({
      ...candidate,
      index: index + 1,
      venture_id: ventureId,
      domain_status: 'unknown', // WHOIS deferred to SD-C
      domain_checked_at: null,
      generated_from: {
        site_dna_id: siteDnaId,
        brand_interview_id: brandInterviewId,
      },
    }));
  } catch (error) {
    console.error(`Naming generation LLM error: ${error.message}`);
    // Fallback: generate basic candidates from brand keywords
    return generateFallbackCandidates(answers, count, ventureId, siteDnaId, brandInterviewId);
  }
}

/**
 * Fallback naming generator when LLM is unavailable.
 * Creates candidates from brand keywords without LLM.
 */
function generateFallbackCandidates(answers, count, ventureId, siteDnaId, brandInterviewId) {
  const brandName = answers.brand_name || 'Brand';
  const words = (answers.tagline || '').split(/\s+/).filter(w => w.length > 3);
  const candidates = [];

  const suffixes = ['io', 'ly', 'fy', 'hub', 'lab', 'app', 'base'];
  const prefixes = ['go', 'my', 'the', 'get', 'try'];

  for (let i = 0; i < count && i < suffixes.length + prefixes.length; i++) {
    const word = words[i % Math.max(words.length, 1)] || brandName.toLowerCase();
    const name = i < suffixes.length
      ? `${word}${suffixes[i]}`
      : `${prefixes[i - suffixes.length]}${brandName.toLowerCase()}`;

    candidates.push({
      name,
      rationale: `Generated from brand keywords (fallback)`,
      style: 'compound',
      index: i + 1,
      venture_id: ventureId,
      domain_status: 'unknown',
      domain_checked_at: null,
      generated_from: { site_dna_id: siteDnaId, brand_interview_id: brandInterviewId },
    });
  }

  return candidates;
}

export { DEFAULT_CANDIDATE_COUNT };
