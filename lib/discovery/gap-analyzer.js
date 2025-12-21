/**
 * Gap Analyzer Service
 * SD: AI-Generated Venture Idea Discovery
 *
 * Analyzes competitor data across 6 dimensions to identify market gaps:
 * 1. Features - Missing or poorly implemented features
 * 2. Pricing - Arbitrage opportunities
 * 3. Segments - Unserved market segments
 * 4. Experience - UX/Support gaps
 * 5. Integrations - Missing connections
 * 6. Quality - Reliability/performance issues
 *
 * Uses OpenAI for intelligent gap analysis with Four Buckets classification
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// Four Buckets for epistemic classification
const FOUR_BUCKETS = {
  FACT: 'fact',           // Verified from source data
  ASSUMPTION: 'assumption', // Reasonable inference
  SIMULATION: 'simulation', // AI-generated projection
  UNKNOWN: 'unknown'       // Cannot determine
};

// Gap dimension definitions
const GAP_DIMENSIONS = {
  features: {
    name: 'Features',
    description: 'Missing or poorly implemented product features',
    questions: [
      'What features do customers frequently request but the competitor lacks?',
      'What features are implemented but receive negative reviews?',
      'What emerging features are missing from the product?'
    ]
  },
  pricing: {
    name: 'Pricing',
    description: 'Pricing model gaps and arbitrage opportunities',
    questions: [
      'Are there underserved price segments?',
      'Is the pricing model overly complex or confusing?',
      'Are there bundling or unbundling opportunities?'
    ]
  },
  segments: {
    name: 'Segments',
    description: 'Unserved or underserved market segments',
    questions: [
      'What customer segments are being ignored?',
      'Are there geographic markets not being served?',
      'Are there vertical/industry niches being overlooked?'
    ]
  },
  experience: {
    name: 'Experience',
    description: 'User experience and customer support gaps',
    questions: [
      'What are common UX complaints?',
      'Where does the customer journey break down?',
      'What support gaps exist?'
    ]
  },
  integrations: {
    name: 'Integrations',
    description: 'Missing ecosystem connections and partnerships',
    questions: [
      'What key integrations are customers requesting?',
      'What platform ecosystems are not supported?',
      'What partnership opportunities are being missed?'
    ]
  },
  quality: {
    name: 'Quality',
    description: 'Reliability, performance, and trust issues',
    questions: [
      'What reliability/uptime issues exist?',
      'What performance complaints are common?',
      'Are there security or compliance gaps?'
    ]
  }
};

class GapAnalyzer {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'gpt-4o',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      temperature: config.temperature || 0.3,
      ...config
    };

    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });
  }

  /**
   * Analyze competitor data across all 6 dimensions
   * @param {Object} competitorData - Data from competitor-intelligence.js
   * @returns {Object} Gap analysis with opportunities
   */
  async analyze(competitorData) {
    const startTime = Date.now();

    const analysis = {
      competitor: competitorData.competitor_reference || 'Unknown',
      analyzed_at: new Date().toISOString(),
      dimensions: {},
      top_opportunities: [],
      four_buckets: {
        facts: [],
        assumptions: [],
        simulations: [],
        unknowns: []
      }
    };

    // Analyze each dimension
    for (const [key, dimension] of Object.entries(GAP_DIMENSIONS)) {
      try {
        const dimensionAnalysis = await this.analyzeDimension(key, dimension, competitorData);
        analysis.dimensions[key] = dimensionAnalysis;

        // Aggregate four buckets
        if (dimensionAnalysis.items) {
          for (const item of dimensionAnalysis.items) {
            const bucket = item.bucket?.toLowerCase() || 'unknown';
            if (analysis.four_buckets[bucket + 's']) {
              analysis.four_buckets[bucket + 's'].push({
                dimension: key,
                ...item
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${key} dimension:`, error.message);
        analysis.dimensions[key] = {
          error: error.message,
          gaps: [],
          opportunity_score: 0
        };
      }
    }

    // Identify top opportunities across all dimensions
    analysis.top_opportunities = this.identifyTopOpportunities(analysis.dimensions);

    // Calculate overall score
    analysis.overall_score = this.calculateOverallScore(analysis.dimensions);

    // Add metadata
    analysis.metadata = {
      duration_ms: Date.now() - startTime,
      model: this.config.model,
      dimensions_analyzed: Object.keys(analysis.dimensions).length
    };

    return analysis;
  }

  /**
   * Analyze a single dimension
   */
  async analyzeDimension(key, dimension, competitorData) {
    const prompt = this.buildDimensionPrompt(key, dimension, competitorData);

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a market gap analyst. Analyze the ${dimension.name} dimension for competitive opportunities. Be specific and actionable. Classify each finding using the Four Buckets framework:
- FACT: Directly observable from the data provided
- ASSUMPTION: Reasonable inference from available evidence
- SIMULATION: AI-generated projection or estimate
- UNKNOWN: Cannot determine from available information

Respond in JSON format.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.temperature,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      dimension: key,
      name: dimension.name,
      items: result.gaps || result.items || [],
      opportunity_score: result.opportunity_score || 0,
      summary: result.summary || '',
      recommendations: result.recommendations || []
    };
  }

  /**
   * Build prompt for dimension analysis
   */
  buildDimensionPrompt(key, dimension, competitorData) {
    const companyInfo = competitorData.competitive_intelligence?.company || {};
    const productInfo = competitorData.competitive_intelligence?.product || {};
    const marketInfo = competitorData.competitive_intelligence?.market || {};
    const swot = competitorData.competitive_intelligence?.swot || {};

    return `Analyze the "${dimension.name}" dimension for market gap opportunities.

COMPETITOR: ${competitorData.competitor_reference || 'Unknown'}
COMPANY: ${JSON.stringify(companyInfo, null, 2)}
PRODUCT: ${JSON.stringify(productInfo, null, 2)}
MARKET: ${JSON.stringify(marketInfo, null, 2)}
SWOT: ${JSON.stringify(swot, null, 2)}

DIMENSION: ${dimension.name}
DESCRIPTION: ${dimension.description}

KEY QUESTIONS TO ANSWER:
${dimension.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Respond with JSON in this format:
{
  "gaps": [
    {
      "title": "Gap title",
      "description": "Detailed description of the gap",
      "evidence": "What data supports this gap",
      "bucket": "FACT|ASSUMPTION|SIMULATION|UNKNOWN",
      "impact": "high|medium|low",
      "time_to_exploit": "short (<90 days)|medium (90-180 days)|long (>180 days)",
      "difficulty": 1-5
    }
  ],
  "opportunity_score": 0-100,
  "summary": "One sentence summary of gaps in this dimension",
  "recommendations": ["Specific action 1", "Specific action 2"]
}`;
  }

  /**
   * Identify top opportunities across all dimensions
   */
  identifyTopOpportunities(dimensions) {
    const allGaps = [];

    for (const [dimKey, dimension] of Object.entries(dimensions)) {
      if (dimension.items) {
        for (const item of dimension.items) {
          allGaps.push({
            dimension: dimKey,
            ...item,
            // Calculate composite score
            score: this.calculateGapScore(item)
          });
        }
      }
    }

    // Sort by score and return top 10
    return allGaps
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((gap, index) => ({
        rank: index + 1,
        ...gap
      }));
  }

  /**
   * Calculate score for a single gap
   */
  calculateGapScore(gap) {
    let score = 50; // Base score

    // Impact bonus
    if (gap.impact === 'high') score += 30;
    else if (gap.impact === 'medium') score += 15;

    // Time to exploit bonus (shorter is better)
    if (gap.time_to_exploit === 'short' || gap.time_to_exploit?.includes('<90')) score += 20;
    else if (gap.time_to_exploit === 'medium') score += 10;

    // Difficulty penalty
    const difficulty = gap.difficulty || 3;
    score -= (difficulty - 1) * 5;

    // Bucket confidence bonus
    if (gap.bucket === 'FACT') score += 10;
    else if (gap.bucket === 'ASSUMPTION') score += 5;
    else if (gap.bucket === 'UNKNOWN') score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate overall opportunity score
   */
  calculateOverallScore(dimensions) {
    const scores = Object.values(dimensions)
      .filter(d => typeof d.opportunity_score === 'number')
      .map(d => d.opportunity_score);

    if (scores.length === 0) return 0;

    // Weighted average with bonus for multiple high-scoring dimensions
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const highScorers = scores.filter(s => s >= 70).length;
    const bonus = highScorers * 5;

    return Math.min(100, Math.round(avg + bonus));
  }

  /**
   * Quick analysis for a single dimension
   */
  async analyzeSingleDimension(dimensionKey, competitorData) {
    const dimension = GAP_DIMENSIONS[dimensionKey];
    if (!dimension) {
      throw new Error(`Unknown dimension: ${dimensionKey}`);
    }

    return this.analyzeDimension(dimensionKey, dimension, competitorData);
  }
}

export default GapAnalyzer;
export { GAP_DIMENSIONS, FOUR_BUCKETS };
