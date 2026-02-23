#!/usr/bin/env node
/**
 * Intelligent Impact Analyzer
 * LEO Protocol Enhancement - Uses LLM to infer validation needs from SD scope
 *
 * PURPOSE:
 * Instead of relying purely on keyword matching, this module uses an LLM to
 * understand the INTENT of an SD and infer ALL areas that need validation,
 * even when keywords aren't explicitly present.
 *
 * EXAMPLE:
 * SD: "Add decisions API endpoint for chairman dashboard"
 * - Keywords would only match: API
 * - LLM inference: API + SECURITY (auth needed) + PERFORMANCE (N+1 risk) + DATABASE (queries)
 *
 * Created: 2025-12-18
 * Part of LEO Protocol v4.3.4 - Quality Intelligence Enhancement
 */

import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
import { getLLMClient } from './llm/index.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Model selection handled by LLM client factory (lib/llm/client-factory.js)
  // Routes to local Ollama when USE_LOCAL_LLM=true, otherwise cloud Haiku
  maxTokens: 2000,

  // Impact categories that map to sub-agents
  impactCategories: {
    SECURITY: {
      subAgents: ['SECURITY'],
      description: 'Authentication, authorization, RLS, input validation, data protection'
    },
    PERFORMANCE: {
      subAgents: ['PERFORMANCE'],
      description: 'Query patterns, N+1 risks, caching, pagination, response times'
    },
    DATA_INTEGRITY: {
      subAgents: ['DATABASE', 'VALIDATION'],
      description: 'Schema changes, FK relationships, data consistency, migrations'
    },
    TYPE_SAFETY: {
      subAgents: ['API', 'TESTING'],
      description: 'API contracts, TypeScript strictness, type coverage'
    },
    ACCESSIBILITY: {
      subAgents: ['DESIGN'],
      description: 'WCAG compliance, keyboard navigation, screen readers'
    },
    DOCUMENTATION: {
      subAgents: ['DOCMON'],
      description: 'API docs, user guides, developer documentation'
    }
  },

  // Confidence threshold for requiring a sub-agent
  confidenceThreshold: 0.6,  // 60% confidence required

  // Cache settings
  cacheTTLMs: 1000 * 60 * 30  // 30 minutes
};

// In-memory cache for impact analyses (reduces API costs)
const analysisCache = new Map();

// ============================================================================
// Core Analysis Functions
// ============================================================================
// Note: LLM client creation handled by lib/llm/client-factory.js

/**
 * Analyze SD scope and infer ALL validation areas needed
 * This is the main entry point for the intelligent impact analyzer
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Promise<Object>} Impact analysis with required sub-agents
 */
export async function analyzeSDImpact(sd) {
  const startTime = Date.now();

  // Check cache first
  const cacheKey = `${sd.id || sd.sd_key}_${sd.updated_at || 'static'}`;
  if (analysisCache.has(cacheKey)) {
    const cached = analysisCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CONFIG.cacheTTLMs) {
      console.log(`   📦 Using cached impact analysis for ${sd.sd_key || sd.id}`);
      return cached.data;
    }
  }

  console.log(`\n🧠 Analyzing SD impact with LLM: ${sd.title || sd.sd_key}`);

  try {
    // Build the analysis prompt
    const prompt = buildAnalysisPrompt(sd);

    // Use centralized LLM client factory
    // Routes to Ollama when USE_LOCAL_LLM=true, otherwise cloud Haiku
    const client = getLLMClient({ purpose: 'screening' });
    const systemPrompt = 'You are a software quality expert. Respond with JSON only, no markdown.';

    const response = await client.complete(systemPrompt, prompt, { maxTokens: CONFIG.maxTokens });

    const analysisText = response.content;
    const responseMetadata = {
      model: response.model,
      provider: response.provider,
      local: response.local || false,
      fallback: response.fallback || false,
      inputTokens: response.usage?.inputTokens || response.usage?.input_tokens || 0,
      outputTokens: response.usage?.outputTokens || response.usage?.output_tokens || 0
    };

    if (response.fallback) {
      console.log('   ⚠️  Ollama unavailable, fell back to cloud Haiku');
    }

    // Parse the response
    const analysis = parseAnalysisResponse(analysisText, sd);

    // Add metadata
    analysis.metadata = {
      ...responseMetadata,
      analysisTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    // Cache the result
    analysisCache.set(cacheKey, {
      data: analysis,
      timestamp: Date.now()
    });

    console.log(`   ✅ Impact analysis complete (${analysis.metadata.analysisTimeMs}ms)`);
    console.log(`   📊 Identified ${analysis.requiredSubAgents.length} required sub-agents`);

    return analysis;

  } catch (error) {
    console.error(`   ❌ Impact analysis failed: ${error.message}`);

    // Return a safe fallback that doesn't block work
    return {
      success: false,
      error: error.message,
      impacts: {},
      requiredSubAgents: [],
      fallbackUsed: true,
      metadata: {
        analysisTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Build the analysis prompt for Claude
 */
function buildAnalysisPrompt(sd) {
  return `You are a software quality expert analyzing a Strategic Directive (SD) to identify ALL areas that need validation before implementation is complete.

## Strategic Directive
**Title**: ${sd.title || 'Untitled'}
**Description**: ${sd.description || 'No description'}
**Scope**: ${sd.scope || 'No scope defined'}
**Type**: ${sd.sd_type || 'feature'}

## Your Task
Analyze this SD and identify ALL areas that need validation. Be THOROUGH - identify concerns even if not explicitly mentioned in the scope.

For each category below, provide:
1. A confidence score (0.0 to 1.0) that this category needs validation
2. Specific concerns found (list them)
3. Brief reasoning for your assessment

## Categories to Analyze

### SECURITY
- Does this touch authentication/authorization?
- Will it access user data that needs RLS policies?
- Are there input validation needs?
- Could there be injection risks (SQL, XSS, etc.)?

### PERFORMANCE
- Will this involve database queries? (N+1 risk)
- Are there list/pagination needs?
- Could response times be affected?
- Is caching relevant?

### DATA_INTEGRITY
- Are schema changes involved?
- Could data consistency be affected?
- Are there foreign key relationships to validate?
- Is there risk of "split-brain" data issues?

### TYPE_SAFETY
- Are API contracts being created/modified?
- Is TypeScript strictness important here?
- Are there type mismatches risks?

### ACCESSIBILITY
- Does this involve user-facing UI?
- Are there keyboard navigation needs?
- Is WCAG compliance relevant?

### DOCUMENTATION
- Does this create new APIs that need documentation?
- Are there user-facing changes needing docs?

## Response Format
Respond with a JSON object (no markdown code fences, just the JSON):
{
  "SECURITY": {
    "confidence": 0.8,
    "concerns": ["RLS policies needed for user data access", "Input validation for search parameters"],
    "reasoning": "API endpoint accessing user-specific data requires auth and RLS"
  },
  "PERFORMANCE": {
    "confidence": 0.9,
    "concerns": ["Potential N+1 query pattern when fetching related data", "No pagination mentioned for list endpoint"],
    "reasoning": "Dashboard data fetching typically involves multiple related tables"
  },
  // ... other categories
}

IMPORTANT:
- Be conservative with confidence scores - only high confidence if clearly relevant
- But DO identify implicit concerns (e.g., "API endpoint" implies security + performance)
- Zero confidence is valid if category is clearly not relevant`;
}

/**
 * Parse the LLM response and extract structured analysis
 */
function parseAnalysisResponse(responseText, sd) {
  try {
    // Try to parse as JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build the analysis result
    const impacts = {};
    const requiredSubAgents = new Set();

    for (const [category, data] of Object.entries(parsed)) {
      if (data && typeof data.confidence === 'number') {
        impacts[category] = {
          confidence: data.confidence,
          concerns: data.concerns || [],
          reasoning: data.reasoning || '',
          meetsThreshold: data.confidence >= CONFIG.confidenceThreshold
        };

        // If meets threshold, add the mapped sub-agents
        if (data.confidence >= CONFIG.confidenceThreshold) {
          const categoryConfig = CONFIG.impactCategories[category];
          if (categoryConfig) {
            categoryConfig.subAgents.forEach(agent => requiredSubAgents.add(agent));
          }
        }
      }
    }

    return {
      success: true,
      sdId: sd.id,
      sdKey: sd.sd_key,
      impacts,
      requiredSubAgents: Array.from(requiredSubAgents),
      confidenceThreshold: CONFIG.confidenceThreshold
    };

  } catch (error) {
    console.error(`   ⚠️ Failed to parse analysis response: ${error.message}`);

    // Return empty but valid structure
    return {
      success: false,
      parseError: error.message,
      rawResponse: responseText.substring(0, 500),
      impacts: {},
      requiredSubAgents: []
    };
  }
}

/**
 * Get required sub-agents based on impact analysis
 * This integrates with the existing sub-agent selection system
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} options - Options
 * @returns {Promise<Array>} List of required sub-agent codes with reasons
 */
export async function getImpactBasedSubAgents(sd, _options = {}) {
  const analysis = await analyzeSDImpact(sd);

  if (!analysis.success || analysis.fallbackUsed) {
    console.log('   ⚠️ Impact analysis unavailable, using fallback');
    return [];
  }

  const results = [];

  for (const [category, impact] of Object.entries(analysis.impacts)) {
    if (impact.meetsThreshold) {
      const categoryConfig = CONFIG.impactCategories[category];
      if (categoryConfig) {
        for (const agentCode of categoryConfig.subAgents) {
          results.push({
            code: agentCode,
            confidence: Math.round(impact.confidence * 100),
            reason: `LLM Impact Analysis: ${category} (${impact.concerns.slice(0, 2).join('; ')})`,
            source: 'intelligent-impact-analyzer',
            concerns: impact.concerns,
            reasoning: impact.reasoning
          });
        }
      }
    }
  }

  return results;
}

/**
 * Store impact analysis results in database for learning
 */
export async function storeImpactAnalysis(sdId, analysis) {
  try {
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    const { error } = await supabase
      .from('sd_impact_analyses')
      .upsert({
        sd_id: sdId,
        analysis_result: analysis,
        required_sub_agents: analysis.requiredSubAgents,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'sd_id'
      });

    if (error) {
      // Table might not exist yet - that's ok
      if (!error.message.includes('does not exist')) {
        console.warn(`   ⚠️ Failed to store impact analysis: ${error.message}`);
      }
    }
  } catch (err) {
    // Non-fatal - analysis still works without storage
    console.log(`   ℹ️ Impact analysis storage skipped: ${err.message}`);
  }
}

// ============================================================================
// Integration with Existing Sub-Agent Selection
// ============================================================================

/**
 * Enhanced sub-agent selection that combines:
 * 1. Existing keyword/semantic matching
 * 2. LLM-based impact analysis
 * 3. Learned patterns from retrospectives
 *
 * @param {Object} sd - Strategic Directive
 * @param {Array} existingRecommendations - From keyword/semantic selector
 * @returns {Promise<Array>} Merged recommendations with LLM insights
 */
export async function enhanceSubAgentSelection(sd, existingRecommendations = []) {
  console.log('\n🔄 Enhancing sub-agent selection with LLM analysis...');

  // Get LLM-based recommendations
  const impactBasedAgents = await getImpactBasedSubAgents(sd);

  // Merge with existing recommendations
  const merged = new Map();

  // Add existing recommendations
  for (const rec of existingRecommendations) {
    merged.set(rec.code, {
      ...rec,
      sources: ['keyword_semantic']
    });
  }

  // Add/enhance with LLM recommendations
  for (const rec of impactBasedAgents) {
    if (merged.has(rec.code)) {
      // Enhance existing recommendation
      const existing = merged.get(rec.code);
      existing.sources.push('llm_impact');
      existing.llmConfidence = rec.confidence;
      existing.llmConcerns = rec.concerns;
      existing.llmReasoning = rec.reasoning;
      // Boost confidence if both methods agree
      existing.confidence = Math.min(100, Math.round((existing.confidence + rec.confidence) / 2 * 1.2));
    } else {
      // New recommendation from LLM
      merged.set(rec.code, {
        ...rec,
        sources: ['llm_impact']
      });
    }
  }

  const results = Array.from(merged.values());

  // Log the enhancement
  const llmOnly = results.filter(r => r.sources.length === 1 && r.sources[0] === 'llm_impact');
  if (llmOnly.length > 0) {
    console.log(`   🧠 LLM identified ${llmOnly.length} additional sub-agents: ${llmOnly.map(r => r.code).join(', ')}`);
  }

  return results;
}

// ============================================================================
// CLI for Testing
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const testSd = {
    id: 'test-id',
    sd_key: 'SD-TEST-001',
    title: process.argv[2] || 'Add decisions API endpoint for chairman dashboard',
    description: process.argv[3] || 'Create REST API to fetch and display decisions with evidence',
    scope: 'Create /api/chairman/decisions endpoint that returns decisions with related evidence data',
    sd_type: 'feature'
  };

  console.log('\n📋 Testing Intelligent Impact Analyzer');
  console.log('=' .repeat(60));
  console.log(`SD: ${testSd.title}`);
  console.log(`Scope: ${testSd.scope}`);
  console.log('=' .repeat(60));

  analyzeSDImpact(testSd)
    .then(analysis => {
      console.log('\n📊 Analysis Results:');
      console.log(JSON.stringify(analysis, null, 2));
    })
    .catch(error => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}
