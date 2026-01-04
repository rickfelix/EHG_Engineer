/**
 * Naming Engine API
 * SD-NAMING-ENGINE-001
 *
 * Endpoints:
 *   POST /api/v2/naming-engine/generate - Generate name suggestions
 *   GET /api/v2/naming-engine/suggestions/:brand_genome_id - Get saved suggestions
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Request validation schemas
const generateSchema = z.object({
  brand_genome_id: z.string().uuid(),
  count: z.number().min(1).max(20).default(10),
  styles: z.array(z.enum(['descriptive', 'coined', 'abstract', 'combined', 'metaphorical'])).optional()
});

/**
 * Generate venture name suggestions using LLM
 * POST /api/v2/naming-engine/generate
 */
export async function generateNames(req, res) {
  const startTime = Date.now();

  try {
    // Validate request
    const data = generateSchema.parse(req.body);
    const { brand_genome_id, count, styles } = data;

    // Fetch brand genome data
    const { data: brandGenome, error: bgError } = await supabase
      .from('brand_genome_submissions')
      .select('*')
      .eq('id', brand_genome_id)
      .single();

    if (bgError || !brandGenome) {
      return res.status(404).json({
        error: 'Brand genome not found',
        brand_genome_id
      });
    }

    // Generate session ID for this batch
    const sessionId = uuidv4();

    // Build LLM prompt
    const prompt = buildNamingPrompt(brandGenome, count, styles);

    // Call LLM to generate names
    const llmResponse = await callLLM(prompt);

    // Parse and score the generated names
    const suggestions = parseAndScoreNames(llmResponse, brandGenome, sessionId);

    // Save to database
    const { data: savedSuggestions, error: saveError } = await supabase
      .from('naming_suggestions')
      .insert(suggestions.map(s => ({
        ...s,
        venture_id: brandGenome.venture_id,
        brand_genome_id: brand_genome_id,
        generation_session_id: sessionId,
        llm_model: process.env.AI_MODEL || 'gpt-5-mini',
        llm_provider: 'openai'
      })))
      .select();

    if (saveError) {
      console.error('Error saving suggestions:', saveError);
      // Return suggestions anyway, just not persisted
    }

    const generationTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      generation_session_id: sessionId,
      generation_time_ms: generationTime,
      suggestions: savedSuggestions || suggestions,
      count: suggestions.length
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Name generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate names',
      message: error.message
    });
  }
}

/**
 * Get saved suggestions for a brand genome
 * GET /api/v2/naming-engine/suggestions/:brand_genome_id
 */
export async function getSuggestions(req, res) {
  try {
    const { brand_genome_id } = req.params;

    if (!brand_genome_id) {
      return res.status(400).json({ error: 'brand_genome_id required' });
    }

    const { data: suggestions, error } = await supabase
      .from('naming_suggestions')
      .select('*')
      .eq('brand_genome_id', brand_genome_id)
      .order('brand_fit_score', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      suggestions: suggestions || [],
      count: suggestions?.length || 0
    });

  } catch (error) {
    console.error('Get suggestions error:', error);
    return res.status(500).json({
      error: 'Failed to fetch suggestions',
      message: error.message
    });
  }
}

/**
 * Build LLM prompt for name generation
 */
function buildNamingPrompt(brandGenome, count, styles) {
  const styleList = styles?.length
    ? styles.join(', ')
    : 'descriptive, coined, abstract, combined, metaphorical';

  return `You are a brand naming expert. Generate ${count} unique venture/brand names based on the following brand genome:

## Brand Context
- Industry: ${brandGenome.industry || 'Technology'}
- Target Market: ${brandGenome.target_audience || 'General'}
- Brand Values: ${JSON.stringify(brandGenome.brand_values || [])}
- Brand Personality: ${brandGenome.brand_personality || 'Professional, innovative'}
- Positioning: ${brandGenome.positioning_statement || ''}
- Key Differentiators: ${JSON.stringify(brandGenome.differentiators || [])}

## Generation Styles to Include
${styleList}

## Requirements
1. Each name should be:
   - Memorable and easy to pronounce
   - 1-3 words maximum
   - Available as a potential domain (.com preferred)
   - Culturally appropriate globally

2. For each name, provide:
   - The name itself
   - Phonetic pronunciation guide
   - Brief rationale (1-2 sentences) explaining brand fit
   - Generation style used (descriptive/coined/abstract/combined/metaphorical)

## Output Format
Return a JSON array with exactly ${count} objects:
[
  {
    "name": "BrandName",
    "phonetic_guide": "BRAND-naym",
    "rationale": "Why this name fits the brand...",
    "generation_style": "coined"
  }
]

Generate creative, unique names that capture the brand essence.`;
}

/**
 * Call LLM API to generate names
 */
async function callLLM(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a creative brand naming expert. Always return valid JSON arrays.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${error}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

/**
 * Parse LLM response and calculate scores
 */
function parseAndScoreNames(llmResponse, brandGenome, _sessionId) {
  let names;

  try {
    const parsed = JSON.parse(llmResponse);
    names = parsed.names || parsed.suggestions || parsed;
    if (!Array.isArray(names)) {
      names = [names];
    }
  } catch (e) {
    console.error('Failed to parse LLM response:', e);
    throw new Error('Invalid LLM response format');
  }

  return names.map(item => ({
    name: item.name,
    phonetic_guide: item.phonetic_guide || item.phonetic,
    rationale: item.rationale,
    generation_style: item.generation_style || item.style || 'combined',

    // Calculate scores
    brand_fit_score: calculateBrandFitScore(item, brandGenome),
    length_score: calculateLengthScore(item.name),
    pronounceability_score: calculatePronounceabilityScore(item.name),
    uniqueness_score: calculateUniquenessScore(item.name),

    // Domain status (default to unknown, can be checked separately)
    domain_com_status: 'unknown',
    domain_io_status: 'unknown',
    domain_ai_status: 'unknown'
  }));
}

/**
 * Calculate brand fit score (0-100)
 */
function calculateBrandFitScore(nameData, brandGenome) {
  let score = 70; // Base score

  // Bonus for having rationale
  if (nameData.rationale?.length > 20) score += 10;

  // Bonus for matching brand values in rationale
  const brandValues = brandGenome.brand_values || [];
  for (const value of brandValues) {
    if (nameData.rationale?.toLowerCase().includes(value.toLowerCase())) {
      score += 5;
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate length score (0-100) - shorter names score higher
 */
function calculateLengthScore(name) {
  const len = name.replace(/\s/g, '').length;
  if (len <= 5) return 100;
  if (len <= 8) return 90;
  if (len <= 12) return 75;
  if (len <= 15) return 60;
  return 40;
}

/**
 * Calculate pronounceability score (0-100)
 */
function calculatePronounceabilityScore(name) {
  let score = 80;

  // Penalize consecutive consonants
  const consonantClusters = name.match(/[bcdfghjklmnpqrstvwxyz]{3,}/gi) || [];
  score -= consonantClusters.length * 10;

  // Bonus for alternating vowels and consonants
  const vowelPattern = name.match(/[aeiou]/gi) || [];
  if (vowelPattern.length >= name.length * 0.3) score += 10;

  // Penalize unusual character combinations
  if (/[xzq]{2}/i.test(name)) score -= 15;

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate uniqueness score (0-100)
 */
function calculateUniquenessScore(name) {
  let score = 75;

  // Bonus for coined words (no common word patterns)
  const commonPatterns = ['tech', 'app', 'hub', 'lab', 'pro', 'plus', 'cloud', 'smart'];
  for (const pattern of commonPatterns) {
    if (name.toLowerCase().includes(pattern)) {
      score -= 10;
    }
  }

  // Bonus for unusual letter combinations
  if (/[qxz]/i.test(name)) score += 5;

  return Math.min(100, Math.max(0, score));
}

export default {
  generateNames,
  getSuggestions
};
