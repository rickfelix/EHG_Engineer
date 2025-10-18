/**
 * Shadcn Semantic Component Selector with Explainable AI
 *
 * Purpose: Recommend UI components for Strategic Directives using semantic search
 * and provide transparent confidence breakdowns explaining each recommendation.
 *
 * Features:
 * - OpenAI text-embedding-3-small embeddings for semantic matching
 * - Explainable confidence scoring (semantic + keyword + popularity)
 * - Installation priority classification (Critical, Recommended, Optional)
 * - Bundle size warnings for large components
 * - Alternative component suggestions with tradeoffs
 *
 * Usage:
 *   import { getComponentRecommendations } from './lib/shadcn-semantic-explainable-selector.js';
 *
 *   const recommendations = await getComponentRecommendations({
 *     sdScope: "Build a user management dashboard with data tables and filters",
 *     sdDescription: "Admin interface for viewing and managing user accounts...",
 *     maxComponents: 5,
 *     similarityThreshold: 0.70
 *   });
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions
const DEFAULT_SIMILARITY_THRESHOLD = 0.70; // 70% similarity minimum
const DEFAULT_MAX_COMPONENTS = 8;

// Confidence tier thresholds
const CONFIDENCE_TIERS = {
  HIGH: 0.85,     // ≥85%: High confidence
  MEDIUM: 0.70,   // 70-85%: Medium confidence
  LOW: 0          // <70%: Low confidence (may not pass threshold)
};

// Installation priority mapping
const INSTALLATION_PRIORITIES = {
  CRITICAL: { min: 0.85, label: 'Critical', description: 'Core component, install immediately' },
  RECOMMENDED: { min: 0.70, label: 'Recommended', description: 'Strong match, install if applicable' },
  OPTIONAL: { min: 0.60, label: 'Optional', description: 'Consider based on specific requirements' }
};

// Bundle size warning threshold (KB)
const BUNDLE_SIZE_WARNING_THRESHOLD = 40;

// ============================================================================
// Explanation Builder
// ============================================================================

/**
 * Build human-readable explanation for component recommendation
 *
 * @param {Object} component - Component data from match_components_semantic()
 * @param {Object} scoring - Scoring breakdown
 * @returns {Object} Explanation with confidence breakdown and reasoning
 */
export function buildExplanation(component, scoring) {
  const {
    similarity,
    confidence_score,
    confidence_weight,
    keyword_boost = 0
  } = scoring;

  // Determine confidence tier
  let confidenceTier = 'LOW';
  if (confidence_score >= CONFIDENCE_TIERS.HIGH) {
    confidenceTier = 'HIGH';
  } else if (confidence_score >= CONFIDENCE_TIERS.MEDIUM) {
    confidenceTier = 'MEDIUM';
  }

  // Determine installation priority
  let priority = 'OPTIONAL';
  if (confidence_score >= INSTALLATION_PRIORITIES.CRITICAL.min) {
    priority = 'CRITICAL';
  } else if (confidence_score >= INSTALLATION_PRIORITIES.RECOMMENDED.min) {
    priority = 'RECOMMENDED';
  }

  // Build confidence breakdown
  const breakdown = {
    semantic_similarity: {
      score: similarity,
      percentage: Math.round(similarity * 100),
      weight: 1.0,
      explanation: `${Math.round(similarity * 100)}% semantic match between SD description and component use cases`
    },
    keyword_boost: {
      score: keyword_boost,
      percentage: Math.round(keyword_boost * 100),
      weight: keyword_boost > 0 ? 1.0 : 0,
      explanation: keyword_boost > 0
        ? `+${Math.round(keyword_boost * 100)}% boost from matching trigger keywords`
        : 'No keyword triggers matched'
    },
    popularity_weight: {
      score: confidence_weight,
      percentage: Math.round((confidence_weight - 1.0) * 100),
      weight: confidence_weight,
      explanation: confidence_weight > 1.0
        ? `+${Math.round((confidence_weight - 1.0) * 100)}% popularity boost (widely used component)`
        : confidence_weight < 1.0
        ? `${Math.round((confidence_weight - 1.0) * 100)}% (specialized component, less common)`
        : 'Neutral popularity (standard component)'
    },
    final_confidence: {
      score: confidence_score,
      percentage: Math.round(confidence_score * 100),
      tier: confidenceTier,
      explanation: `Final confidence: ${Math.round(confidence_score * 100)}% (${confidenceTier})`
    }
  };

  // Build plain-English reasoning
  const reasons = [];

  // Primary use case match
  if (component.primary_use_case) {
    reasons.push(`Primary use case: ${component.primary_use_case}`);
  }

  // Semantic similarity reasoning
  if (similarity >= 0.85) {
    reasons.push('Excellent semantic match with SD requirements');
  } else if (similarity >= 0.75) {
    reasons.push('Strong semantic alignment with SD objectives');
  } else if (similarity >= 0.65) {
    reasons.push('Moderate semantic relevance to SD scope');
  } else {
    reasons.push('Partial semantic match, verify applicability');
  }

  // Keyword boost reasoning
  if (keyword_boost > 0) {
    reasons.push('Trigger keywords matched in SD description');
  }

  // Popularity reasoning
  if (confidence_weight >= 1.5) {
    reasons.push('Highly popular component with proven reliability');
  } else if (confidence_weight > 1.0) {
    reasons.push('Commonly used component');
  }

  // Bundle size warnings
  const warnings = [];
  if (component.bundle_size_kb >= BUNDLE_SIZE_WARNING_THRESHOLD) {
    warnings.push({
      type: 'BUNDLE_SIZE',
      severity: 'INFO',
      message: `Large bundle size: ~${component.bundle_size_kb}KB. Consider performance impact.`
    });
  }

  // Dependency warnings
  if (component.dependencies && component.dependencies.length > 3) {
    warnings.push({
      type: 'DEPENDENCIES',
      severity: 'INFO',
      message: `Requires ${component.dependencies.length} dependencies. Review installation requirements.`
    });
  }

  // Build alternatives explanation
  const alternatives = [];
  if (component.common_alternatives && component.common_alternatives.length > 0) {
    component.common_alternatives.forEach(alt => {
      alternatives.push({
        component: alt.component,
        tradeoff: alt.tradeoff,
        recommendation: `Alternative: ${alt.component}. Tradeoff: ${alt.tradeoff}`
      });
    });
  }

  return {
    confidence_tier: confidenceTier,
    confidence_percentage: Math.round(confidence_score * 100),
    installation_priority: priority,
    breakdown,
    reasons,
    warnings,
    alternatives,
    summary: `${confidenceTier} confidence (${Math.round(confidence_score * 100)}%) - ${priority.toLowerCase()} installation priority. ${reasons.join('. ')}.`
  };
}

// ============================================================================
// Component Recommendation Engine
// ============================================================================

/**
 * Get component recommendations for a Strategic Directive
 *
 * @param {Object} options - Configuration options
 * @param {string} options.sdScope - Strategic Directive scope/title
 * @param {string} [options.sdDescription] - Optional detailed SD description
 * @param {string} [options.sdObjectives] - Optional SD strategic objectives
 * @param {number} [options.maxComponents=8] - Maximum components to return
 * @param {number} [options.similarityThreshold=0.70] - Minimum similarity threshold
 * @param {string} [options.categoryFilter] - Filter by category (ui, ai, voice, etc.)
 * @param {string} [options.registryFilter] - Filter by registry source
 * @param {Object} [options.supabase] - Supabase client (if not provided, creates new)
 * @param {Object} [options.openai] - OpenAI client (if not provided, creates new)
 * @returns {Promise<Array>} Component recommendations with explainable scoring
 */
export async function getComponentRecommendations(options) {
  const {
    sdScope,
    sdDescription = '',
    sdObjectives = '',
    maxComponents = DEFAULT_MAX_COMPONENTS,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    categoryFilter = null,
    registryFilter = null,
    supabase: supabaseClient = null,
    openai: openaiClient = null
  } = options;

  // Validate inputs
  if (!sdScope || sdScope.trim().length === 0) {
    throw new Error('sdScope is required');
  }

  // Initialize clients
  const openai = openaiClient || new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Build embedding text from SD
  const embeddingText = buildSDEmbeddingText({
    scope: sdScope,
    description: sdDescription,
    objectives: sdObjectives
  });

  // Generate embedding
  let queryEmbedding;
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: embeddingText
    });
    queryEmbedding = response.data[0].embedding;
  } catch (error) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }

  // Query component registry using semantic search
  const { data: components, error } = await supabase.rpc('match_components_semantic', {
    query_embedding: queryEmbedding,
    match_threshold: similarityThreshold,
    match_count: maxComponents,
    filter_category: categoryFilter,
    filter_registry: registryFilter
  });

  if (error) {
    throw new Error(`Failed to query components: ${error.message}`);
  }

  if (!components || components.length === 0) {
    return {
      recommendations: [],
      summary: {
        total_found: 0,
        threshold: similarityThreshold,
        query_text: embeddingText.substring(0, 200) + '...'
      }
    };
  }

  // Build explainable recommendations
  const recommendations = components.map(component => {
    // Calculate keyword boost (if SD contains any trigger keywords)
    const keywordBoost = calculateKeywordBoost(
      embeddingText.toLowerCase(),
      component.trigger_keywords || []
    );

    const scoring = {
      similarity: component.similarity,
      confidence_score: component.confidence_score,
      confidence_weight: component.confidence_weight,
      keyword_boost: keywordBoost
    };

    const explanation = buildExplanation(component, scoring);

    return {
      component_name: component.component_name,
      registry_source: component.registry_source,
      description: component.description,
      install_command: component.install_command,
      dependencies: component.dependencies,
      registry_dependencies: component.registry_dependencies,
      docs_url: component.docs_url,
      implementation_notes: component.implementation_notes,
      example_code: component.example_code,
      scoring,
      explanation
    };
  });

  // Sort by confidence score (descending)
  recommendations.sort((a, b) => b.scoring.confidence_score - a.scoring.confidence_score);

  // Build summary
  const summary = {
    total_found: recommendations.length,
    threshold: similarityThreshold,
    query_text: embeddingText.substring(0, 200) + '...',
    breakdown: {
      critical: recommendations.filter(r => r.explanation.installation_priority === 'CRITICAL').length,
      recommended: recommendations.filter(r => r.explanation.installation_priority === 'RECOMMENDED').length,
      optional: recommendations.filter(r => r.explanation.installation_priority === 'OPTIONAL').length
    },
    top_recommendation: recommendations.length > 0
      ? {
          component: recommendations[0].component_name,
          confidence: recommendations[0].explanation.confidence_percentage,
          priority: recommendations[0].explanation.installation_priority
        }
      : null
  };

  return {
    recommendations,
    summary
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build embedding text from SD metadata
 */
function buildSDEmbeddingText({ scope, description, objectives }) {
  const parts = [
    scope && `Scope: ${scope}`,
    description && `Description: ${description}`,
    objectives && `Objectives: ${objectives}`
  ].filter(Boolean);

  return parts.join('\n\n');
}

/**
 * Calculate keyword boost based on trigger keyword matches
 */
function calculateKeywordBoost(queryText, triggerKeywords) {
  if (!triggerKeywords || triggerKeywords.length === 0) {
    return 0;
  }

  const matches = triggerKeywords.filter(keyword =>
    queryText.includes(keyword.toLowerCase())
  );

  if (matches.length === 0) {
    return 0;
  }

  // Boost: 5% per keyword match, capped at 20%
  return Math.min(matches.length * 0.05, 0.20);
}

/**
 * Format recommendations for PRD insertion
 */
export function formatForPRD(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return {
      ui_components: [],
      ui_components_summary: 'No component recommendations generated.'
    };
  }

  const uiComponents = recommendations.map(rec => ({
    name: rec.component_name,
    registry: rec.registry_source,
    install_command: rec.install_command,
    confidence: rec.explanation.confidence_percentage,
    priority: rec.explanation.installation_priority,
    reason: rec.explanation.summary,
    docs_url: rec.docs_url,
    dependencies: rec.dependencies || [],
    warnings: rec.explanation.warnings || [],
    alternatives: rec.explanation.alternatives || []
  }));

  const summary = `Found ${recommendations.length} component recommendations:\n` +
    `- ${recommendations.filter(r => r.explanation.installation_priority === 'CRITICAL').length} critical\n` +
    `- ${recommendations.filter(r => r.explanation.installation_priority === 'RECOMMENDED').length} recommended\n` +
    `- ${recommendations.filter(r => r.explanation.installation_priority === 'OPTIONAL').length} optional`;

  return {
    ui_components: uiComponents,
    ui_components_summary: summary
  };
}

/**
 * Generate installation script from recommendations
 */
export function generateInstallScript(recommendations, priorityFilter = ['CRITICAL', 'RECOMMENDED']) {
  if (!recommendations || recommendations.length === 0) {
    return '';
  }

  const filtered = recommendations.filter(rec =>
    priorityFilter.includes(rec.explanation.installation_priority)
  );

  if (filtered.length === 0) {
    return '';
  }

  const lines = [
    '#!/bin/bash',
    '# Component Installation Script',
    '# Generated by Shadcn Semantic Selector',
    '',
    'echo "Installing UI components..."',
    ''
  ];

  filtered.forEach(rec => {
    lines.push(`# ${rec.component_name} (${rec.explanation.installation_priority})`);
    lines.push(`# Confidence: ${rec.explanation.confidence_percentage}%`);
    lines.push(`# ${rec.explanation.summary}`);
    lines.push(rec.install_command);
    lines.push('');
  });

  lines.push('echo "Installation complete!"');

  return lines.join('\n');
}
