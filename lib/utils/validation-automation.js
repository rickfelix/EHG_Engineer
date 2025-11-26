/**
 * VALIDATION Sub-Agent Automation Utilities
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Automate Steps 4-5 of VALIDATION using semantic search
 * - Step 4: Search Codebase for Existing Infrastructure
 * - Step 5: Gap Analysis (Backlog vs Existing Code)
 *
 * Philosophy: "Find duplicates before creating duplicates."
 *
 * Created: 2025-11-26 (LEO Protocol Enhancement)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate embedding for search query
 * @param {string} query - Text to embed
 * @returns {Promise<number[]>} 1536-dimensional embedding
 */
async function generateEmbedding(query) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    encoding_format: 'float'
  });
  return response.data[0].embedding;
}

/**
 * Step 4: Search Codebase for Existing Infrastructure
 * Uses semantic search to find related code entities
 *
 * @param {Object} sdMetadata - SD metadata from Step 1
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with existing infrastructure
 */
export async function searchExistingInfrastructure(sdMetadata, options = {}) {
  console.log('   🔍 Searching codebase using semantic search...');

  const {
    application = sdMetadata.target_application || null,
    matchThreshold = 0.65,
    matchCount = 15
  } = options;

  const results = {
    automated: true,
    search_performed: true,
    search_queries: [],
    existing_infrastructure: [],
    potential_duplicates: [],
    related_components: []
  };

  try {
    // Generate search queries from SD metadata
    const searchQueries = generateSearchQueries(sdMetadata);
    results.search_queries = searchQueries;

    console.log(`   📝 Generated ${searchQueries.length} search queries`);

    // Execute semantic searches
    for (const query of searchQueries) {
      console.log(`      Searching: "${query.text.substring(0, 50)}..."`);

      try {
        const embedding = await generateEmbedding(query.text);

        const { data: searchResults, error } = await supabase.rpc('semantic_code_search', {
          query_embedding: embedding,
          application_filter: application,
          entity_type_filter: query.entityType || null,
          language_filter: null,
          match_threshold: matchThreshold,
          match_count: matchCount
        });

        if (error) {
          console.log(`      ⚠️  Search error: ${error.message}`);
          continue;
        }

        if (searchResults && searchResults.length > 0) {
          console.log(`      ✅ Found ${searchResults.length} matches`);

          // Categorize results
          for (const match of searchResults) {
            const matchInfo = {
              file_path: match.file_path,
              entity_name: match.entity_name,
              entity_type: match.entity_type,
              similarity: match.similarity,
              line_start: match.line_start,
              line_end: match.line_end,
              semantic_description: match.semantic_description,
              query_context: query.context
            };

            // High similarity = potential duplicate
            if (match.similarity >= 0.85) {
              results.potential_duplicates.push(matchInfo);
            }
            // Medium similarity = existing infrastructure
            else if (match.similarity >= 0.70) {
              results.existing_infrastructure.push(matchInfo);
            }
            // Lower similarity = related component
            else {
              results.related_components.push(matchInfo);
            }
          }
        } else {
          console.log('      ℹ️  No matches found');
        }
      } catch (searchErr) {
        console.log(`      ⚠️  Query failed: ${searchErr.message}`);
      }
    }

    // Deduplicate results by file_path + entity_name
    results.potential_duplicates = deduplicateResults(results.potential_duplicates);
    results.existing_infrastructure = deduplicateResults(results.existing_infrastructure);
    results.related_components = deduplicateResults(results.related_components);

    // Summary
    results.summary = {
      potential_duplicates_count: results.potential_duplicates.length,
      existing_infrastructure_count: results.existing_infrastructure.length,
      related_components_count: results.related_components.length,
      total_matches: results.potential_duplicates.length +
        results.existing_infrastructure.length +
        results.related_components.length
    };

    console.log(`   📊 Summary: ${results.summary.potential_duplicates_count} potential duplicates, ` +
      `${results.summary.existing_infrastructure_count} existing infrastructure, ` +
      `${results.summary.related_components_count} related components`);

    return results;

  } catch (error) {
    console.log(`   ❌ Infrastructure search failed: ${error.message}`);
    return {
      automated: true,
      search_performed: false,
      error: error.message,
      fallback_commands: [
        'find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "<feature-keywords>"',
        'grep -r "<route-pattern>" src/App.tsx src/routes/'
      ]
    };
  }
}

/**
 * Step 5: Automated Gap Analysis
 * Compares backlog items against found infrastructure
 *
 * @param {Array} backlogItems - Items from Step 3
 * @param {Object} infrastructureResults - Results from Step 4
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Gap analysis results
 */
export async function performGapAnalysis(backlogItems, infrastructureResults, _options = {}) {
  console.log('   📊 Performing automated gap analysis...');

  const results = {
    automated: true,
    analysis_performed: true,
    backlog_count: backlogItems?.length || 0,
    coverage_analysis: [],
    gaps_identified: [],
    already_satisfied: [],
    partial_coverage: [],
    recommendations: []
  };

  if (!backlogItems || backlogItems.length === 0) {
    results.analysis_performed = false;
    results.reason = 'No backlog items to analyze';
    return results;
  }

  if (!infrastructureResults?.search_performed) {
    results.analysis_performed = false;
    results.reason = 'No infrastructure search results available';
    return results;
  }

  const existingCode = [
    ...infrastructureResults.potential_duplicates,
    ...infrastructureResults.existing_infrastructure
  ];

  // Analyze each backlog item
  for (const item of backlogItems) {
    const analysis = {
      backlog_title: item.backlog_title,
      backlog_id: item.backlog_id || item.id,
      priority: item.priority,
      status: 'gap', // Default to gap
      matching_infrastructure: [],
      coverage_percentage: 0,
      recommendation: null
    };

    // Search for related infrastructure
    const itemKeywords = extractKeywords(item.backlog_title + ' ' + (item.description_raw || ''));

    for (const code of existingCode) {
      const codeKeywords = extractKeywords(code.entity_name + ' ' + (code.semantic_description || ''));

      const keywordOverlap = calculateKeywordOverlap(itemKeywords, codeKeywords);

      if (keywordOverlap > 0.3 || code.similarity >= 0.75) {
        analysis.matching_infrastructure.push({
          file_path: code.file_path,
          entity_name: code.entity_name,
          similarity: code.similarity,
          keyword_overlap: keywordOverlap
        });
      }
    }

    // Determine coverage status
    if (analysis.matching_infrastructure.length > 0) {
      const maxSimilarity = Math.max(...analysis.matching_infrastructure.map(m => m.similarity || 0));

      if (maxSimilarity >= 0.85) {
        analysis.status = 'satisfied';
        analysis.coverage_percentage = 100;
        analysis.recommendation = 'Existing implementation found - verify completeness before new work';
        results.already_satisfied.push(analysis);
      } else if (maxSimilarity >= 0.70) {
        analysis.status = 'partial';
        analysis.coverage_percentage = Math.round(maxSimilarity * 100);
        analysis.recommendation = 'Partial implementation exists - extend rather than rebuild';
        results.partial_coverage.push(analysis);
      } else {
        analysis.status = 'gap';
        analysis.coverage_percentage = Math.round(maxSimilarity * 50);
        analysis.recommendation = 'Related code exists - review before implementing';
        results.gaps_identified.push(analysis);
      }
    } else {
      analysis.status = 'gap';
      analysis.coverage_percentage = 0;
      analysis.recommendation = 'No existing implementation found - new development required';
      results.gaps_identified.push(analysis);
    }

    results.coverage_analysis.push(analysis);
  }

  // Generate summary recommendations
  if (results.already_satisfied.length > 0) {
    results.recommendations.push({
      type: 'DUPLICATE_WARNING',
      severity: 'HIGH',
      message: `${results.already_satisfied.length} backlog item(s) may already be implemented`,
      action: 'Review existing code before proceeding - avoid duplicate work'
    });
  }

  if (results.partial_coverage.length > 0) {
    results.recommendations.push({
      type: 'EXTEND_EXISTING',
      severity: 'MEDIUM',
      message: `${results.partial_coverage.length} backlog item(s) have partial implementation`,
      action: 'Extend existing code rather than rebuilding from scratch'
    });
  }

  if (results.gaps_identified.length === backlogItems.length) {
    results.recommendations.push({
      type: 'GREENFIELD',
      severity: 'INFO',
      message: 'All backlog items require new implementation',
      action: 'No duplicate work concerns - proceed with development'
    });
  }

  // Calculate overall coverage
  const totalCoverage = results.coverage_analysis.reduce((sum, a) => sum + a.coverage_percentage, 0);
  results.overall_coverage_percentage = Math.round(totalCoverage / results.coverage_analysis.length);

  console.log(`   📈 Overall coverage: ${results.overall_coverage_percentage}%`);
  console.log(`      ✅ Satisfied: ${results.already_satisfied.length}`);
  console.log(`      ⚠️  Partial: ${results.partial_coverage.length}`);
  console.log(`      ❌ Gaps: ${results.gaps_identified.length}`);

  return results;
}

/**
 * Generate search queries from SD metadata
 */
function generateSearchQueries(sdMetadata) {
  const queries = [];

  // Query 1: Title-based search
  if (sdMetadata.title) {
    queries.push({
      text: sdMetadata.title,
      context: 'SD title',
      entityType: null
    });
  }

  // Query 2: Scope-based search
  if (sdMetadata.scope) {
    queries.push({
      text: sdMetadata.scope,
      context: 'SD scope',
      entityType: null
    });
  }

  // Query 3: Category-specific search
  if (sdMetadata.category) {
    const categorySearches = {
      'database': 'database migration schema table',
      'ui': 'component page view form',
      'api': 'endpoint route controller service',
      'security': 'authentication authorization permission role',
      'testing': 'test spec coverage e2e unit'
    };

    const categoryKeyword = Object.keys(categorySearches).find(
      k => sdMetadata.category.toLowerCase().includes(k)
    );

    if (categoryKeyword) {
      queries.push({
        text: `${sdMetadata.title} ${categorySearches[categoryKeyword]}`,
        context: `Category: ${sdMetadata.category}`,
        entityType: categoryKeyword === 'ui' ? 'component' : null
      });
    }
  }

  // Query 4: Extract potential feature name
  const featureMatch = sdMetadata.title?.match(/(?:implement|add|create|build|update)\s+(.+)/i);
  if (featureMatch) {
    queries.push({
      text: featureMatch[1],
      context: 'Feature extraction',
      entityType: null
    });
  }

  return queries;
}

/**
 * Deduplicate results by file_path + entity_name
 */
function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = `${r.file_path}:${r.entity_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(word));
}

/**
 * Calculate keyword overlap between two keyword arrays
 */
function calculateKeywordOverlap(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  const intersection = [...set1].filter(k => set2.has(k)).length;
  const union = new Set([...keywords1, ...keywords2]).size;

  return intersection / union;
}

/**
 * Check if semantic index is populated
 */
export async function checkSemanticIndexStatus() {
  try {
    const { count, error } = await supabase
      .from('codebase_semantic_index')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        available: false,
        error: error.message
      };
    }

    return {
      available: count > 0,
      entity_count: count,
      message: count > 0
        ? `Semantic index available with ${count} entities`
        : 'Semantic index is empty - run scripts/semantic-indexer.js first'
    };
  } catch (err) {
    return {
      available: false,
      error: err.message
    };
  }
}
