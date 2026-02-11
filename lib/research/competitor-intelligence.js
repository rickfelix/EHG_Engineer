/**
 * Competitor Intelligence Service
 * SD: IDEATION-GENESIS-AUDIT - Fix Hallucinated Market Research
 *
 * Provides REAL competitor analysis by:
 * 1. Fetching actual website content
 * 2. Using AI to analyze the competitor
 * 3. Classifying outputs with Four Buckets (Facts/Assumptions/Simulations/Unknowns)
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Four Buckets classification for epistemic honesty
const FOUR_BUCKETS = {
  FACT: 'fact',           // Verified from source
  ASSUMPTION: 'assumption', // Reasonable inference
  SIMULATION: 'simulation', // AI-generated projection
  UNKNOWN: 'unknown'       // Cannot determine
};

class CompetitorIntelligenceService {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || 'openai',
      model: config.model || 'gpt-5',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      openaiKey: config.openaiKey || process.env.OPENAI_API_KEY,
      timeout: config.timeout || 30000,
      ...config
    };
  }

  /**
   * Analyze a competitor URL and return structured intelligence
   * @param {string} url - Competitor website URL
   * @returns {Object} Structured competitor analysis with Four Buckets classification
   */
  async analyzeCompetitor(url) {
    const startTime = Date.now();

    try {
      // Step 1: Fetch website content
      const websiteContent = await this.fetchWebsiteContent(url);

      // Step 2: Analyze with AI
      const analysis = await this.performAIAnalysis(url, websiteContent);

      // Step 3: Structure response with Four Buckets
      const structuredAnalysis = this.structureWithFourBuckets(analysis, url);

      // Add metadata
      structuredAnalysis.metadata = {
        analyzed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        source_url: url,
        content_length: websiteContent.text.length,
        provider: this.config.provider,
        model: this.config.model
      };

      return structuredAnalysis;

    } catch (error) {
      console.error('Competitor analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch and parse website content
   */
  async fetchWebsiteContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EHG-Research-Bot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        maxRedirects: 5
      });

      const html = response.data;

      // Extract text content (basic HTML stripping)
      const text = this.extractTextFromHTML(html);

      // Extract metadata
      const title = this.extractMetaTag(html, 'title') || this.extractTagContent(html, 'title');
      const description = this.extractMetaTag(html, 'description');
      const keywords = this.extractMetaTag(html, 'keywords');

      return {
        html: html.substring(0, 50000), // Limit HTML size
        text: text.substring(0, 20000), // Limit text size
        title,
        description,
        keywords,
        url,
        fetchedAt: new Date().toISOString()
      };

    } catch (error) {
      // If fetch fails, return minimal data for AI to work with
      console.warn(`Failed to fetch ${url}:`, error.message);

      const domain = new URL(url).hostname;
      return {
        html: '',
        text: `[Website fetch failed: ${error.message}]`,
        title: domain,
        description: null,
        keywords: null,
        url,
        fetchedAt: new Date().toISOString(),
        fetchError: error.message
      };
    }
  }

  /**
   * Extract text content from HTML
   */
  extractTextFromHTML(html) {
    // Remove scripts, styles, and HTML tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract meta tag content
   */
  extractMetaTag(html, name) {
    const regex = new RegExp(`<meta[^>]*(?:name|property)=["'](?:og:)?${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];

    // Try alternate format
    const regex2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:og:)?${name}["']`, 'i');
    const match2 = html.match(regex2);
    return match2 ? match2[1] : null;
  }

  /**
   * Extract tag content
   */
  extractTagContent(html, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]+)<\/${tagName}>`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Perform AI analysis on competitor content
   */
  async performAIAnalysis(url, content) {
    const prompt = this.buildAnalysisPrompt(url, content);

    if (this.config.provider === 'anthropic') {
      return await this.callAnthropic(prompt);
    } else {
      return await this.callOpenAI(prompt);
    }
  }

  /**
   * Build the analysis prompt
   */
  buildAnalysisPrompt(url, content) {
    const domain = new URL(url).hostname;

    return `You are a competitive intelligence analyst. Analyze this competitor website and extract actionable insights.

COMPETITOR URL: ${url}
DOMAIN: ${domain}

WEBSITE CONTENT:
Title: ${content.title || 'Unknown'}
Meta Description: ${content.description || 'None'}
Keywords: ${content.keywords || 'None'}

Page Content (first 15000 chars):
${content.text.substring(0, 15000)}

${content.fetchError ? `\nNOTE: Full content fetch failed (${content.fetchError}). Analyze based on available data and domain name.` : ''}

ANALYSIS REQUIREMENTS:
Provide a comprehensive competitive analysis with the following structure. For EACH piece of information, classify it using the Four Buckets framework:
- FACT: Directly observed/verified from the website
- ASSUMPTION: Reasonable inference from available data
- SIMULATION: AI-generated projection or estimate
- UNKNOWN: Cannot determine from available information

Respond in valid JSON format:
{
  "company": {
    "name": { "value": "Company Name", "bucket": "FACT|ASSUMPTION" },
    "tagline": { "value": "Their tagline", "bucket": "FACT" },
    "founded": { "value": "Year or Unknown", "bucket": "FACT|UNKNOWN" }
  },
  "product": {
    "description": { "value": "What they offer", "bucket": "FACT|ASSUMPTION" },
    "key_features": [
      { "value": "Feature 1", "bucket": "FACT" },
      { "value": "Feature 2", "bucket": "FACT" }
    ],
    "pricing_model": { "value": "Subscription/Freemium/etc", "bucket": "FACT|ASSUMPTION|UNKNOWN" }
  },
  "market": {
    "target_audience": { "value": "Who they serve", "bucket": "FACT|ASSUMPTION" },
    "industry": { "value": "Industry vertical", "bucket": "FACT|ASSUMPTION" },
    "positioning": { "value": "How they position themselves", "bucket": "FACT|ASSUMPTION" }
  },
  "strengths": [
    { "value": "Strength 1", "bucket": "FACT|ASSUMPTION", "evidence": "How you know" }
  ],
  "weaknesses": [
    { "value": "Weakness 1", "bucket": "ASSUMPTION|SIMULATION", "evidence": "How you inferred" }
  ],
  "opportunities": [
    { "value": "Opportunity to compete", "bucket": "SIMULATION", "reasoning": "Why this is an opportunity" }
  ],
  "venture_suggestion": {
    "name": { "value": "Suggested venture name", "bucket": "SIMULATION" },
    "problem_statement": { "value": "Problem your venture could solve better", "bucket": "SIMULATION" },
    "solution": { "value": "How to differentiate", "bucket": "SIMULATION" },
    "target_market": { "value": "Who to target", "bucket": "ASSUMPTION|SIMULATION" },
    "differentiation_points": [
      { "value": "How to be different", "bucket": "SIMULATION" }
    ]
  },
  "confidence_score": 0.85,
  "data_quality": "high|medium|low",
  "analysis_notes": "Any caveats or notes about this analysis"
}`;
  }

  /**
   * Call Anthropic Claude API
   */
  async callAnthropic(prompt) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      }
    );

    const text = response.data.content[0].text;

    // Extract JSON from response
    return this.parseJSONResponse(text);
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(prompt) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.openaiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  }

  /**
   * Parse JSON from AI response
   */
  parseJSONResponse(text) {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_e) {
        console.warn('Failed to parse JSON from response');
      }
    }

    // Return structured error
    return {
      error: 'Failed to parse AI response',
      raw_response: text.substring(0, 1000)
    };
  }

  /**
   * Structure analysis with Four Buckets for the API response
   */
  structureWithFourBuckets(analysis, url) {
    const domain = new URL(url).hostname.replace('www.', '');

    // Extract venture suggestion for the API response
    const suggestion = analysis.venture_suggestion || {};

    return {
      // Standard API response fields (for backward compatibility)
      name: this.extractValue(suggestion.name) || `${domain.split('.')[0].toUpperCase()} Alternative`,
      problem_statement: this.extractValue(suggestion.problem_statement) ||
        `Compete with ${domain} by addressing their market gaps`,
      solution: this.extractValue(suggestion.solution) ||
        'Differentiated platform addressing competitor weaknesses',
      target_market: this.extractValue(suggestion.target_market) ||
        'Underserved segments of competitor\'s market',
      competitor_reference: url,

      // Four Buckets classified data
      four_buckets: {
        facts: this.extractByBucket(analysis, FOUR_BUCKETS.FACT),
        assumptions: this.extractByBucket(analysis, FOUR_BUCKETS.ASSUMPTION),
        simulations: this.extractByBucket(analysis, FOUR_BUCKETS.SIMULATION),
        unknowns: this.extractByBucket(analysis, FOUR_BUCKETS.UNKNOWN)
      },

      // Full competitive intelligence
      competitive_intelligence: {
        company: analysis.company,
        product: analysis.product,
        market: analysis.market,
        swot: {
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          opportunities: analysis.opportunities
        }
      },

      // Quality metrics
      quality: {
        confidence_score: analysis.confidence_score || 0.5,
        data_quality: analysis.data_quality || 'medium',
        analysis_notes: analysis.analysis_notes
      }
    };
  }

  /**
   * Extract value from bucket-structured field
   */
  extractValue(field) {
    if (!field) return null;
    return typeof field === 'object' ? field.value : field;
  }

  /**
   * Extract all items classified with a specific bucket
   */
  extractByBucket(analysis, bucket) {
    const items = [];

    const traverse = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.bucket && obj.bucket.toUpperCase() === bucket.toUpperCase()) {
        items.push({
          path,
          value: obj.value,
          evidence: obj.evidence || obj.reasoning
        });
      }

      if (Array.isArray(obj)) {
        obj.forEach((item, i) => traverse(item, `${path}[${i}]`));
      } else {
        Object.entries(obj).forEach(([key, value]) => {
          traverse(value, path ? `${path}.${key}` : key);
        });
      }
    };

    traverse(analysis);
    return items;
  }
}

export default CompetitorIntelligenceService;
