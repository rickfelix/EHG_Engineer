/**
 * Blueprint Generator Service
 * SD: AI-Generated Venture Idea Discovery
 *
 * Converts scored opportunities into structured blueprints ready for
 * the opportunity_blueprints table. Uses OpenAI to enrich the content.
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

class BlueprintGenerator {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'gpt-4o',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      temperature: config.temperature || 0.4,
      ...config
    };

    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });
  }

  /**
   * Generate blueprints from scored opportunities
   * @param {Array} opportunities - Scored opportunities from OpportunityScorer
   * @param {Object} competitorData - Original competitor analysis data
   * @param {String} scanId - UUID of the parent scan
   * @returns {Array} Generated blueprints
   */
  async generateBlueprints(opportunities, competitorData, scanId) {
    const blueprints = [];

    // Only generate blueprints for approved or pending opportunities
    const eligibleOpportunities = opportunities.filter(
      opp => opp.approval_status?.status !== 'auto_rejected'
    );

    for (const opportunity of eligibleOpportunities) {
      try {
        const blueprint = await this.generateBlueprint(opportunity, competitorData, scanId);
        blueprints.push(blueprint);
      } catch (error) {
        console.error(`Error generating blueprint for "${opportunity.title}":`, error.message);
        // Continue with other opportunities
      }
    }

    return blueprints;
  }

  /**
   * Generate a single blueprint from an opportunity
   */
  async generateBlueprint(opportunity, competitorData, scanId) {
    // Get AI-enhanced content
    const enhancedContent = await this.enhanceWithAI(opportunity, competitorData);

    // Determine chairman_status based on approval
    let chairmanStatus = 'pending';
    if (opportunity.approval_status?.status === 'auto_approved') {
      chairmanStatus = 'approved';
    } else if (opportunity.approval_status?.status === 'auto_rejected') {
      chairmanStatus = 'rejected';
    }

    // Build the blueprint object for opportunity_blueprints table
    const blueprint = {
      // Core fields
      title: enhancedContent.title || opportunity.title,
      summary: enhancedContent.summary,
      problem: enhancedContent.problem_statement,
      solution: enhancedContent.solution_concept,
      target_market: enhancedContent.target_market,

      // Classification
      category: this.determineCategory(opportunity, competitorData),
      industry: competitorData.competitive_intelligence?.market?.industry?.value || null,

      // Business context
      business_model: enhancedContent.business_model,
      differentiation: enhancedContent.differentiation,
      competitive_gaps: {
        dimension: opportunity.dimension,
        gaps: [opportunity],
        competitor_reference: competitorData.competitor_reference
      },

      // AI Discovery fields (new columns)
      source_type: 'ai_generated',
      opportunity_box: opportunity.classification?.box || 'yellow',
      time_to_capture_days: opportunity.classification?.time_horizon
        ? this.parseTimeToDays(opportunity.classification.time_horizon)
        : 120,
      confidence_score: opportunity.scores?.overall || 0,
      scan_id: scanId,

      // Gap analysis (6 dimensions)
      gap_analysis: {
        primary_dimension: opportunity.dimension,
        impact: opportunity.impact,
        difficulty: opportunity.difficulty,
        time_to_exploit: opportunity.time_to_exploit,
        evidence: opportunity.evidence,
        bucket: opportunity.bucket
      },

      // AI metadata
      ai_metadata: {
        model: this.config.model,
        generated_at: new Date().toISOString(),
        confidence: opportunity.scores?.overall || 0,
        four_buckets: {
          bucket: opportunity.bucket,
          evidence_strength: opportunity.scores?.evidence_strength || 0
        },
        scoring: opportunity.scores,
        classification: opportunity.classification,
        source_opportunity: {
          title: opportunity.title,
          dimension: opportunity.dimension,
          rank: opportunity.rank
        }
      },

      // Success metrics
      success_metrics: enhancedContent.success_metrics || {},

      // Tags
      tags: this.generateTags(opportunity, competitorData),

      // Difficulty and timeline
      difficulty_level: this.mapDifficultyToLevel(opportunity.difficulty),
      estimated_timeline: opportunity.classification?.time_horizon || 'TBD',

      // Chairman workflow
      chairman_status: chairmanStatus,
      opportunity_score: opportunity.scores?.overall || 0,

      // Active by default
      is_active: true
    };

    return blueprint;
  }

  /**
   * Enhance opportunity with AI-generated content
   */
  async enhanceWithAI(opportunity, competitorData) {
    const prompt = this.buildEnhancementPrompt(opportunity, competitorData);

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: `You are a venture strategist creating a business blueprint from a market gap opportunity. Be specific, actionable, and realistic. The blueprint should be ready for a founder to evaluate and potentially pursue.

Respond in JSON format with these fields:
- title: Compelling venture name (not just "Alternative to X")
- summary: 2-3 sentence elevator pitch
- problem_statement: Clear problem being solved
- solution_concept: High-level solution approach
- target_market: Specific target audience
- differentiation: How this beats competitors
- business_model: Revenue model suggestion
- success_metrics: Key KPIs to track`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.temperature,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Build prompt for AI enhancement
   */
  buildEnhancementPrompt(opportunity, competitorData) {
    const competitor = competitorData.competitor_reference || 'Unknown';
    const companyInfo = competitorData.competitive_intelligence?.company || {};
    const ventureInfo = competitorData.venture_suggestion || {};

    return `Create a business blueprint for this market gap opportunity:

COMPETITOR ANALYZED: ${competitor}
COMPETITOR INFO: ${JSON.stringify(companyInfo, null, 2)}

GAP OPPORTUNITY:
- Title: ${opportunity.title}
- Description: ${opportunity.description}
- Dimension: ${opportunity.dimension}
- Impact: ${opportunity.impact}
- Evidence: ${opportunity.evidence}
- Time to exploit: ${opportunity.time_to_exploit}
- Difficulty: ${opportunity.difficulty}/5

CLASSIFICATION:
- Box: ${opportunity.classification?.box} (${opportunity.classification?.label})
- Score: ${opportunity.scores?.overall}/100
- Recommendation: ${opportunity.classification?.recommendation}

EXISTING VENTURE SUGGESTION (for reference):
${JSON.stringify(ventureInfo, null, 2)}

Generate a complete business blueprint that exploits this specific gap. Be specific about:
1. A compelling venture name that captures the value proposition
2. The exact problem and solution
3. Who the target customers are
4. How to differentiate from ${competitor}
5. A realistic business model
6. Key metrics to track`;
  }

  /**
   * Determine category based on opportunity and competitor
   */
  determineCategory(opportunity, competitorData) {
    const industry = competitorData.competitive_intelligence?.market?.industry?.value?.toLowerCase() || '';
    const dimension = opportunity.dimension;

    // Map industry to category
    if (industry.includes('finance') || industry.includes('payment') || industry.includes('bank')) {
      return 'fintech';
    }
    if (industry.includes('health') || industry.includes('medical') || industry.includes('wellness')) {
      return 'healthtech';
    }
    if (industry.includes('education') || industry.includes('learning') || industry.includes('training')) {
      return 'edtech';
    }
    if (industry.includes('commerce') || industry.includes('retail') || industry.includes('shopping')) {
      return 'ecommerce';
    }

    // Default to saas for B2B software gaps
    if (dimension === 'integrations' || dimension === 'features') {
      return 'saas';
    }

    return 'other';
  }

  /**
   * Generate tags for the blueprint
   */
  generateTags(opportunity, competitorData) {
    const tags = [];

    // Add dimension tag
    tags.push(opportunity.dimension);

    // Add box tag
    if (opportunity.classification?.box) {
      tags.push(`${opportunity.classification.box}-box`);
    }

    // Add impact tag
    if (opportunity.impact) {
      tags.push(`${opportunity.impact}-impact`);
    }

    // Add bucket tag
    if (opportunity.bucket) {
      tags.push(opportunity.bucket.toLowerCase());
    }

    // Add competitor tag
    if (competitorData.competitor_reference) {
      try {
        const domain = new URL(competitorData.competitor_reference).hostname
          .replace('www.', '')
          .split('.')[0];
        tags.push(`vs-${domain}`);
      } catch {
        // Ignore URL parsing errors
      }
    }

    return tags;
  }

  /**
   * Map numeric difficulty to string level
   */
  mapDifficultyToLevel(difficulty) {
    const level = difficulty || 3;
    if (level <= 1) return 'beginner';
    if (level <= 2) return 'intermediate';
    if (level <= 3) return 'intermediate';
    if (level <= 4) return 'advanced';
    return 'expert';
  }

  /**
   * Parse time horizon string to days
   */
  parseTimeToDays(timeHorizon) {
    if (!timeHorizon) return 120;

    const str = timeHorizon.toLowerCase();

    if (str.includes('< 90') || str.includes('<90') || str === 'short') {
      return 60;
    }
    if (str.includes('90') || str.includes('medium')) {
      return 120;
    }
    if (str.includes('180') || str.includes('long')) {
      return 240;
    }

    // Try to extract number
    const match = str.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 120; // Default
  }

  /**
   * Generate a single blueprint without scoring (for direct conversion)
   */
  async generateFromOpportunity(opportunity, competitorData, scanId) {
    // Add default scores if not present
    if (!opportunity.scores) {
      opportunity.scores = { overall: 70 };
    }
    if (!opportunity.classification) {
      opportunity.classification = {
        box: 'yellow',
        label: 'Needs Evaluation',
        recommendation: 'Evaluate this opportunity',
        time_horizon: '120 days'
      };
    }
    if (!opportunity.approval_status) {
      opportunity.approval_status = {
        status: 'pending_review',
        label: 'Pending Review'
      };
    }

    return this.generateBlueprint(opportunity, competitorData, scanId);
  }
}

export default BlueprintGenerator;
