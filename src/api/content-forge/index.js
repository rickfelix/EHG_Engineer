/**
 * Content Forge API
 * SD-CONTENT-FORGE-IMPL-001
 *
 * Endpoints:
 *   POST /api/v2/content-forge/generate - Generate marketing content using LLM
 *   GET /api/v2/content-forge/list - List generated content with filters
 *   POST /api/v2/content-forge/compliance-check - Check content compliance
 *   GET /api/v2/brand-genome/:id - Get brand genome by ID
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const generateSchema = z.object({
  brand_genome_id: z.string().uuid(),
  content_type: z.enum(['landing_page', 'email_sequence', 'seo_faq', 'comparison_page', 'how_to_guide']),
  parameters: z.object({
    // Landing page parameters
    headline_count: z.number().min(1).max(5).optional(),
    section_count: z.number().min(3).max(10).optional(),
    cta_style: z.enum(['aggressive', 'soft', 'balanced']).optional(),

    // Email sequence parameters
    email_count: z.number().min(3).max(10).optional(),
    sequence_type: z.enum(['welcome', 'nurture', 'conversion', 'onboarding']).optional(),

    // FAQ parameters
    faq_count: z.number().min(5).max(20).optional(),
    include_schema: z.boolean().optional(),

    // Comparison parameters
    competitor_count: z.number().min(2).max(5).optional(),

    // How-to guide parameters
    step_count: z.number().min(3).max(15).optional(),

    // Common parameters
    tone_override: z.string().optional(),
    target_length: z.enum(['short', 'medium', 'long']).optional()
  }).optional()
});

const listSchema = z.object({
  venture_id: z.string().uuid().optional(),
  content_type: z.enum(['landing_page', 'email_sequence', 'seo_faq', 'comparison_page', 'how_to_guide']).optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'published', 'archived']).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

const complianceSchema = z.object({
  content_id: z.string().uuid().optional(),
  content: z.string().optional()
}).refine(data => data.content_id || data.content, {
  message: 'Either content_id or content must be provided'
});

// ============================================================
// CONTENT TEMPLATES
// ============================================================

const CONTENT_PROMPTS = {
  landing_page: (genome, params) => `You are an expert marketing copywriter. Generate a high-converting landing page for:

## Brand Context
- Brand: ${genome.brand_name || 'The Brand'}
- Industry: ${genome.industry || 'Technology'}
- ICP: ${JSON.stringify(genome.ideal_customer_profile || {})}
- Tone: ${genome.brand_voice?.tone || 'Professional yet approachable'}
- Key Value Props: ${JSON.stringify(genome.value_propositions || [])}

## Requirements
- Generate ${params.headline_count || 3} headline variations
- Include ${params.section_count || 5} content sections
- CTA style: ${params.cta_style || 'balanced'}
- Target length: ${params.target_length || 'medium'}

## Output Format (JSON)
{
  "headlines": ["headline1", "headline2", ...],
  "hero": { "title": "", "subtitle": "", "cta_text": "" },
  "sections": [
    { "title": "", "content": "", "type": "benefit|feature|social_proof" }
  ],
  "cta_blocks": [
    { "headline": "", "body": "", "button_text": "" }
  ],
  "meta": { "title": "", "description": "" }
}`,

  email_sequence: (genome, params) => `You are an expert email marketing strategist. Generate an email sequence for:

## Brand Context
- Brand: ${genome.brand_name || 'The Brand'}
- ICP: ${JSON.stringify(genome.ideal_customer_profile || {})}
- Tone: ${genome.brand_voice?.tone || 'Friendly and helpful'}
- Value Props: ${JSON.stringify(genome.value_propositions || [])}

## Requirements
- Generate ${params.email_count || 5} emails
- Sequence type: ${params.sequence_type || 'nurture'}
- Include subject lines, preview text, body, and CTAs

## Output Format (JSON)
{
  "sequence_name": "",
  "emails": [
    {
      "order": 1,
      "delay_days": 0,
      "subject": "",
      "preview_text": "",
      "body_html": "",
      "cta": { "text": "", "url_placeholder": "" }
    }
  ]
}`,

  seo_faq: (genome, params) => `You are an SEO content expert. Generate FAQ content for:

## Brand Context
- Brand: ${genome.brand_name || 'The Brand'}
- Industry: ${genome.industry || 'Technology'}
- Products/Services: ${JSON.stringify(genome.products_services || [])}

## Requirements
- Generate ${params.faq_count || 10} FAQ items
- Include schema.org markup: ${params.include_schema !== false}
- Focus on high-search-volume questions

## Output Format (JSON)
{
  "faqs": [
    {
      "question": "",
      "answer": "",
      "category": "",
      "search_intent": "informational|navigational|transactional"
    }
  ],
  "schema_json_ld": { "@context": "https://schema.org", ... }
}`,

  comparison_page: (genome, params) => `You are a competitive positioning expert. Generate a comparison page for:

## Brand Context
- Brand: ${genome.brand_name || 'The Brand'}
- Differentiators: ${JSON.stringify(genome.differentiators || [])}
- Competitors: ${JSON.stringify(genome.competitors || [])}

## Requirements
- Compare against ${params.competitor_count || 3} competitors
- Highlight unique advantages
- Be factual but persuasive

## Output Format (JSON)
{
  "headline": "",
  "intro": "",
  "comparison_table": {
    "features": ["Feature 1", "Feature 2", ...],
    "competitors": [
      { "name": "", "values": [true/false/"value", ...], "notes": [] }
    ],
    "our_brand": { "values": [...], "highlights": [] }
  },
  "why_choose_us": ["reason1", "reason2", ...]
}`,

  how_to_guide: (genome, params) => `You are a technical content writer. Generate a how-to guide for:

## Brand Context
- Brand: ${genome.brand_name || 'The Brand'}
- Products: ${JSON.stringify(genome.products_services || [])}
- Target Audience: ${JSON.stringify(genome.ideal_customer_profile || {})}

## Requirements
- Generate ${params.step_count || 7} detailed steps
- Include tips and common mistakes
- Add schema.org HowTo markup

## Output Format (JSON)
{
  "title": "",
  "introduction": "",
  "time_required": "",
  "difficulty": "beginner|intermediate|advanced",
  "steps": [
    {
      "number": 1,
      "title": "",
      "description": "",
      "tips": [],
      "warnings": []
    }
  ],
  "conclusion": "",
  "schema_json_ld": { "@context": "https://schema.org", "@type": "HowTo", ... }
}`
};

// Forbidden terms for compliance checking
const FORBIDDEN_TERMS = [
  'guarantee', 'guaranteed', 'promise', 'promises',
  'best in class', 'best-in-class', 'world\'s best', 'world\'s leading',
  'number one', '#1', 'leading provider',
  'risk-free', 'no risk', 'zero risk',
  'unlimited', 'never fail'
];

// ============================================================
// LLM INTEGRATION
// ============================================================

async function callLLM(prompt, _contentType) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const startTime = Date.now();

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
          content: 'You are an expert marketing content generator. Always return valid JSON. Focus on conversion-optimized, brand-aligned content.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${error}`);
  }

  const result = await response.json();
  const generationTime = Date.now() - startTime;

  // Track cost (approximate based on tokens)
  const inputTokens = result.usage?.prompt_tokens || 0;
  const outputTokens = result.usage?.completion_tokens || 0;
  const cost = (inputTokens * 0.00015 + outputTokens * 0.0006) / 1000; // GPT-4o-mini pricing

  return {
    content: result.choices[0].message.content,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: Math.round(cost * 10000) / 10000
    },
    generation_time_ms: generationTime,
    model: result.model
  };
}

// ============================================================
// COMPLIANCE CHECKING
// ============================================================

function checkCompliance(content, brandGenome) {
  const issues = [];
  let score = 100;
  const contentLower = typeof content === 'string' ? content.toLowerCase() : JSON.stringify(content).toLowerCase();

  // Check forbidden terms
  for (const term of FORBIDDEN_TERMS) {
    if (contentLower.includes(term.toLowerCase())) {
      issues.push({
        severity: 'HIGH',
        type: 'forbidden_term',
        term: term,
        message: `Content contains forbidden term: "${term}"`,
        suggestion: 'Rephrase to avoid absolute claims'
      });
      score -= 10;
    }
  }

  // Check brand voice alignment (if brand genome available)
  if (brandGenome?.brand_voice?.tone) {
    const expectedTone = brandGenome.brand_voice.tone.toLowerCase();
    // Simple tone check - in production, use NLP
    if (expectedTone.includes('formal') && contentLower.includes('awesome')) {
      issues.push({
        severity: 'MEDIUM',
        type: 'tone_mismatch',
        message: 'Informal language detected in formal brand voice',
        suggestion: 'Use more professional language'
      });
      score -= 5;
    }
  }

  // Check for required elements
  if (brandGenome?.value_propositions) {
    const propsMentioned = brandGenome.value_propositions.filter(prop =>
      contentLower.includes(prop.toLowerCase())
    );
    if (propsMentioned.length === 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'missing_value_prop',
        message: 'No value propositions from brand genome mentioned',
        suggestion: 'Include key brand value propositions'
      });
      score -= 10;
    }
  }

  // Check content length
  const wordCount = contentLower.split(/\s+/).length;
  if (wordCount < 100) {
    issues.push({
      severity: 'LOW',
      type: 'content_length',
      message: 'Content may be too short for effective marketing',
      suggestion: 'Consider expanding with more details'
    });
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    issues,
    word_count: wordCount,
    checked_at: new Date().toISOString()
  };
}

// ============================================================
// API HANDLERS
// ============================================================

/**
 * Generate marketing content using LLM
 * POST /api/v2/content-forge/generate
 */
export async function generateContent(req, res) {
  const startTime = Date.now();

  try {
    const data = generateSchema.parse(req.body);
    const { brand_genome_id, content_type, parameters = {} } = data;

    // Fetch brand genome
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

    // Build and execute LLM prompt
    const promptBuilder = CONTENT_PROMPTS[content_type];
    if (!promptBuilder) {
      return res.status(400).json({ error: `Unknown content type: ${content_type}` });
    }

    const prompt = promptBuilder(brandGenome, parameters);
    const llmResult = await callLLM(prompt, content_type);

    // Parse generated content
    let generatedContent;
    try {
      generatedContent = JSON.parse(llmResult.content);
    } catch (_parseError) {
      return res.status(500).json({
        error: 'Failed to parse LLM response',
        raw_content: llmResult.content
      });
    }

    // Check compliance
    const compliance = checkCompliance(generatedContent, brandGenome);

    // Save to database
    const contentId = uuidv4();
    const { data: savedContent, error: saveError } = await supabase
      .from('generated_content')
      .insert({
        id: contentId,
        brand_genome_id,
        venture_id: brandGenome.venture_id,
        content_type,
        content_data: generatedContent,
        status: 'draft',
        compliance_score: compliance.score,
        compliance_issues: compliance.issues.map(i => i.message)
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving content:', saveError);
      // Return content anyway, just not persisted
      return res.status(200).json({
        success: true,
        persisted: false,
        warning: 'Content generated but not saved to database',
        content_id: contentId,
        content_type,
        content: generatedContent,
        compliance,
        llm_usage: llmResult.usage,
        generation_time_ms: Date.now() - startTime
      });
    }

    return res.status(201).json({
      success: true,
      persisted: true,
      content_id: savedContent.id,
      content_type,
      content: generatedContent,
      compliance,
      llm_usage: llmResult.usage,
      generation_time_ms: Date.now() - startTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Content generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate content',
      message: error.message
    });
  }
}

/**
 * List generated content with filters
 * GET /api/v2/content-forge/list
 */
export async function listContent(req, res) {
  try {
    const data = listSchema.parse(req.query);
    const { venture_id, content_type, status, limit, offset } = data;

    let query = supabase
      .from('generated_content')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (venture_id) query = query.eq('venture_id', venture_id);
    if (content_type) query = query.eq('content_type', content_type);
    if (status) query = query.eq('status', status);

    const { data: items, count, error } = await query;

    if (error) {
      console.error('List content error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      items: items || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('List content error:', error);
    return res.status(500).json({
      error: 'Failed to list content',
      message: error.message
    });
  }
}

/**
 * Check content compliance
 * POST /api/v2/content-forge/compliance-check
 */
export async function checkContentCompliance(req, res) {
  try {
    const data = complianceSchema.parse(req.body);

    let content;
    let brandGenome = null;

    if (data.content_id) {
      // Fetch existing content
      const { data: existingContent, error } = await supabase
        .from('generated_content')
        .select('*, brand_genome_submissions(*)')
        .eq('id', data.content_id)
        .single();

      if (error || !existingContent) {
        return res.status(404).json({ error: 'Content not found', content_id: data.content_id });
      }

      content = existingContent.content_data;
      brandGenome = existingContent.brand_genome_submissions;
    } else {
      content = data.content;
    }

    const compliance = checkCompliance(content, brandGenome);

    // Update compliance score in database if content_id provided
    if (data.content_id) {
      await supabase
        .from('generated_content')
        .update({
          compliance_score: compliance.score,
          compliance_issues: compliance.issues.map(i => i.message)
        })
        .eq('id', data.content_id);
    }

    return res.status(200).json({
      success: true,
      score: compliance.score,
      issues: compliance.issues,
      word_count: compliance.word_count,
      checked_at: compliance.checked_at
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Compliance check error:', error);
    return res.status(500).json({
      error: 'Failed to check compliance',
      message: error.message
    });
  }
}

/**
 * Get brand genome by ID
 * GET /api/v2/brand-genome/:id
 */
export async function getBrandGenome(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Brand genome ID required' });
    }

    const { data: brandGenome, error } = await supabase
      .from('brand_genome_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !brandGenome) {
      return res.status(404).json({ error: 'Brand genome not found', id });
    }

    // Format response to match PRD specification
    return res.status(200).json({
      success: true,
      id: brandGenome.id,
      venture_id: brandGenome.venture_id,
      brand_name: brandGenome.brand_name,
      industry: brandGenome.industry,
      icp: brandGenome.ideal_customer_profile || {},
      tone: brandGenome.brand_voice || {},
      claims: brandGenome.value_propositions || [],
      positioning: brandGenome.positioning_statement,
      differentiators: brandGenome.differentiators || [],
      created_at: brandGenome.created_at,
      updated_at: brandGenome.updated_at
    });

  } catch (error) {
    console.error('Get brand genome error:', error);
    return res.status(500).json({
      error: 'Failed to fetch brand genome',
      message: error.message
    });
  }
}

export default {
  generateContent,
  listContent,
  checkContentCompliance,
  getBrandGenome
};
