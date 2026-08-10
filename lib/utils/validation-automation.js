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

import { createSupabaseServiceClient } from '../supabase-client.js';
import { getEmbeddingClient } from '../llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createSupabaseServiceClient();

// Embedding client initialized lazily on first use.
//
// THERE USED TO BE A LOCAL getEmbeddingClient() HERE AND IT WAS THE WHOLE PROBLEM. It returned
// getLLMClient({purpose:'validation-semantic-search'}) — a CHAT provider adapter — while shadowing
// the real exported getEmbeddingClient() of the SAME NAME in ../llm/client-factory.js. A reader
// checking "does this file use getEmbeddingClient?" got yes, and the answer was still wrong. That
// is what made it invisible to 289 days of readers, and it is why the wrapper is DELETED rather
// than repaired: patching the call shape would have left the shadow in place for the next caller.
let embeddingClient = null;

function resolveEmbeddingClient() {
  if (!embeddingClient) {
    embeddingClient = getEmbeddingClient({ purpose: 'validation-semantic-search' });
  }
  return embeddingClient;
}

/**
 * Similarity tiers — MEASURED against the live index, not assumed.
 * SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-5c).
 *
 * The previous cutoffs (floor 0.65, infra 0.70, dup 0.85) were calibrated for the
 * OpenAI-era embedder. The factory now serves gemini-embedding-001 (1536D), whose cosine
 * scale sits LOWER — measured with three probes against the fed index (16,668 entities,
 * 2026-08-10):
 *   - verbatim stored description → self-match 1.000; related entities 0.75–0.79
 *   - realistic SD-style paraphrase of an existing capability → correct rows at 0.60–0.64
 *     (semantic_code_search, checkForDuplicate — the exact hits the create-path needs)
 *   - unrelated control ("bake a chocolate cake…") → noise ceiling 0.517
 * Under the old floor the paraphrase band (the entire point of the create-path search) was
 * FILTERED OUT WHOLESALE: a fed search that can never fire is indistinguishable from an
 * unfed one — the same defect this SD repaired in the writer.
 */
const SIMILARITY_TIERS = {
  calibrated_for: 'gemini-embedding-001',
  floor: 0.55,      // above the 0.517 measured noise ceiling, below the 0.60+ signal band
  infrastructure: 0.60, // paraphrase-level "this capability likely exists"
  duplicate: 0.75,  // near-copy band measured at 0.75–0.79
};

/**
 * Generate embedding for search query.
 *
 * THE OLD CALL WAS `client.embeddings.create({...})` AND IT MATCHED NEITHER FACTORY. Measured
 * live: the chat adapter exposes {complete, chat, messages} with embeddings=UNDEFINED, and the
 * real embedding client exposes {embed, model, dimensions, provider} with no `.embeddings` either.
 * So this was never a shadowed-import bug alone — it is writer-correct/consumer-wrong API
 * asymmetry, and repairing only the import would still have thrown. scripts/semantic-indexer.js
 * (the WRITER of this same index) has always called embed() correctly; it is the shape to copy.
 *
 * embed() returns an ARRAY OF VECTORS (number[][]) even for a single string — verified by
 * execution, outer length 1, inner length 1536 matching the client's declared `dimensions`. The
 * previous `response.data[0].embedding` needed no such indexing, so the [0] here is load-bearing.
 *
 * @param {string} query - Text to embed
 * @returns {Promise<number[]>} a single embedding vector of the client's declared width
 */
async function generateEmbedding(query) {
  const client = resolveEmbeddingClient();
  if (!client) {
    throw new Error('Embedding client not available');
  }

  const vectors = await client.embed(query);
  const vector = Array.isArray(vectors) ? vectors[0] : undefined;
  if (!Array.isArray(vector)) {
    // Loud rather than undefined-shaped: an unusable embedding must not reach the RPC as a silent
    // malformed argument, because that surfaces as a confusing database error rather than as
    // "the embedding provider returned something we did not expect".
    throw new Error(`embed() returned an unexpected shape for the query (expected number[][], got ${typeof vectors})`);
  }
  return vector;
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
    matchThreshold = SIMILARITY_TIERS.floor,
    matchCount = 15
  } = options;

  // Warn on calibration drift: the tiers below are MODEL-calibrated. A different embedding
  // model re-scales cosine similarity and silently inverts the tuning (the previous
  // OpenAI-era 0.65 floor sat ABOVE gemini's true-positive band, so a fed index of 16k+
  // entities returned zero results on every realistic query — measured live, twice).
  try {
    const activeModel = resolveEmbeddingClient()?.model;
    if (activeModel && activeModel !== SIMILARITY_TIERS.calibrated_for) {
      console.warn(`   ⚠️  Similarity tiers were calibrated for ${SIMILARITY_TIERS.calibrated_for} but the active embedder is ${activeModel} — thresholds may be mis-scaled; re-run the calibration probes.`);
    }
  } catch { /* calibration warning is best-effort */ }

  // search_performed IS NOT DECLARED HERE ANY MORE, AND THAT IS THE POINT OF THIS SD.
  //
  // It used to be initialised to `true` on this line — before a single query had been attempted —
  // so it recorded an INTENTION TO SEARCH and was never reconciled against what happened. When
  // every query failed, the catch inside the loop logged and continued, and this function returned
  // search_performed: true with empty result arrays. A total failure and a clean search were the
  // same bytes on the wire. That is why a feature that has never once executed looked, for 289
  // days, exactly like a feature that ran and found nothing.
  //
  // The outcome fields are now DERIVED at the end from what the loop actually did. Note the catch
  // block never had to set this to true to do the damage — it merely failed to set it to false.
  // A fix aimed only at the catch would leave the next failure mode lying by default.
  const results = {
    automated: true,
    search_queries: [],
    existing_infrastructure: [],
    potential_duplicates: [],
    related_components: []
  };
  let queriesAttempted = 0;
  let queriesSucceeded = 0;
  const failureReasons = [];

  try {
    // Generate search queries from SD metadata
    const searchQueries = generateSearchQueries(sdMetadata);
    results.search_queries = searchQueries;

    console.log(`   📝 Generated ${searchQueries.length} search queries`);

    // Execute semantic searches
    for (const query of searchQueries) {
      console.log(`      Searching: "${query.text.substring(0, 50)}..."`);

      queriesAttempted++;
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
          failureReasons.push(`rpc: ${error.message}`);
          continue;
        }

        // Past the RPC without an error: THIS query genuinely searched. Counted here rather than
        // at the top of the try, so that "attempted" and "succeeded" cannot be the same number by
        // construction — which is the property that makes could-not-search detectable at all.
        queriesSucceeded++;

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

            // Tiers are model-calibrated — see SIMILARITY_TIERS above for the measurements.
            if (match.similarity >= SIMILARITY_TIERS.duplicate) {
              results.potential_duplicates.push(matchInfo);
            }
            else if (match.similarity >= SIMILARITY_TIERS.infrastructure) {
              results.existing_infrastructure.push(matchInfo);
            }
            else {
              results.related_components.push(matchInfo);
            }
          }
        } else {
          console.log('      ℹ️  No matches found');
        }
      } catch (searchErr) {
        console.log(`      ⚠️  Query failed: ${searchErr.message}`);
        failureReasons.push(searchErr.message);
      }
    }

    // Deduplicate results by file_path + entity_name
    results.potential_duplicates = deduplicateResults(results.potential_duplicates);
    results.existing_infrastructure = deduplicateResults(results.existing_infrastructure);
    results.related_components = deduplicateResults(results.related_components);

    // DERIVE the outcome from what actually happened. Three states, deliberately distinct:
    //   'not_attempted'    — the loop never ran (no queries generated); nothing was tried.
    //   'could_not_search' — queries were attempted and NONE completed; the result arrays are
    //                        empty because the instrument is blind, not because the codebase is.
    //   'searched'         — at least one query completed; an empty result is a real finding.
    // The middle state is the one that did not exist before, and its absence is the entire defect.
    results.queries_attempted = queriesAttempted;
    results.queries_succeeded = queriesSucceeded;
    results.failure_reasons = [...new Set(failureReasons)];
    results.search_status = queriesAttempted === 0
      ? 'not_attempted'
      : (queriesSucceeded === 0 ? 'could_not_search' : 'searched');

    // Retained for the existing consumer at performGapAnalysis() below, which gates on it. Now
    // COMPUTED rather than declared, so it can no longer be true for a run that searched nothing.
    results.search_performed = results.search_status === 'searched';

    if (results.search_status === 'could_not_search') {
      console.log(`   ❌ SEARCH DID NOT RUN: ${queriesAttempted} querie(s) attempted, 0 completed — ` +
        'results below are EMPTY BECAUSE NOTHING WAS SEARCHED, not because nothing was found. ' +
        `Reasons: ${results.failure_reasons.join('; ')}`);
    }

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
      search_status: 'could_not_search',
      queries_attempted: queriesAttempted,
      queries_succeeded: queriesSucceeded,
      failure_reasons: [...new Set([...failureReasons, error.message])],
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
    // A head:true COUNT CANNOT TELL AN ABSENT TABLE FROM AN EMPTY ONE. Measured live against a
    // fabricated table name in this repo: PostgREST returned error=null AND count=null — no error
    // at all. So `available: count > 0` would have reported a dropped or renamed table as merely
    // "empty" and told the operator to run the indexer, which is useless advice for a schema
    // problem. The non-head select below distinguishes them: a missing relation raises PGRST205,
    // an empty one returns an empty array. Same defect class as search_performed above — an
    // instrument that cannot tell "nothing there" from "could not look" — in the same file.
    const { data, error } = await supabase
      .from('codebase_semantic_index')
      .select('id')
      .limit(1);

    if (error) {
      // THREE OUTCOMES, NOT TWO — and the first version of this fix got that wrong in the exact
      // way this SD exists to prevent. It wrote `table_present: !absent`, which turns ANY error
      // that is not PGRST205/42P01 — RLS 42501, a network fault, an expired JWT — into a POSITIVE
      // ASSERTION THAT THE TABLE EXISTS, manufactured from evidence that says nothing either way.
      // The function whose whole purpose is telling ABSENT from EMPTY had acquired a third case,
      // COULD-NOT-LOOK, and answered it definitively. Caught by a RETRO sub-agent before merge.
      const absent = error.code === 'PGRST205' || error.code === '42P01';
      return {
        available: false,
        entity_count: null,
        // null, not false: "we could not determine whether it exists" is its own answer.
        table_present: absent ? false : null,
        error: error.message,
        message: absent
          ? 'Semantic index TABLE DOES NOT EXIST - this is a schema problem, not an empty index; running the indexer will not help'
          : `Semantic index UNREADABLE - cannot tell whether the table exists: ${error.message}`
      };
    }

    if (!data || data.length === 0) {
      return {
        available: false,
        entity_count: 0,
        table_present: true,
        message: 'Semantic index is empty - run scripts/semantic-indexer.js first'
      };
    }

    // Only pay for the exact count once the table is known to exist and be non-empty.
    const { count } = await supabase
      .from('codebase_semantic_index')
      .select('*', { count: 'exact', head: true });

    return {
      available: true,
      entity_count: count,
      table_present: true,
      message: `Semantic index available with ${count} entities`
    };
  } catch (err) {
    return {
      available: false,
      error: err.message
    };
  }
}
