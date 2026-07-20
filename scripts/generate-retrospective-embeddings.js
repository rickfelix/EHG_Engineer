#!/usr/bin/env node
/**
 * Generate Retrospective Embeddings with OpenAI
 *
 * SD-RETRO-ENHANCE-001 Checkpoint 2: US-004
 * Purpose: Generate semantic search embeddings for retrospectives using OpenAI text-embedding-3-small
 *
 * Features:
 * - Batch processing (5 at a time to respect rate limits)
 * - Retry logic with exponential backoff
 * - Progress tracking with resume capability
 * - Cost estimation and monitoring
 * - Only processes PUBLISHED retrospectives (quality gate)
 *
 * Usage:
 *   node scripts/generate-retrospective-embeddings.js [--force] [--retro-id=RETRO-ID]
 *
 * Options:
 *   --force      Regenerate embeddings even if they exist
 *   --retro-id   Process only a specific retrospective (for testing)
 */

import { createClient } from '@supabase/supabase-js';
import { getEmbeddingClient } from '../lib/llm/client-factory.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: retrospectives is a growing table;
// a bare embedding-backlog fetch can exceed the PostgREST cap after a bulk import or long gap
// between runs, silently leaving some PUBLISHED retrospectives without an embedding forever.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import fs from 'fs';
// import path from 'path'; // Currently unused - available for future path utilities
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const BATCH_SIZE = 5; // Process 5 at a time (rate limit: 3000 req/min)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
const PROGRESS_FILE = 'embedding-generation-progress.json';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const embedder = getEmbeddingClient();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load progress from file (for resume capability)
 */
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn(`⚠️  Could not load progress file: ${error.message}`);
  }
  return { processedIds: [], successCount: 0, errorCount: 0, totalCost: 0 };
}

/**
 * Save progress to file
 */
function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.warn(`⚠️  Could not save progress file: ${error.message}`);
  }
}

/**
 * Build embedding content from retrospective
 * Combines title, key_learnings, and action_items for rich semantic representation
 */
function buildEmbeddingContent(retrospective) {
  const parts = [];

  if (retrospective.title) {
    parts.push(`Title: ${retrospective.title}`);
  }

  if (retrospective.key_learnings) {
    parts.push(`Key Learnings: ${retrospective.key_learnings}`);
  }

  if (retrospective.action_items) {
    parts.push(`Action Items: ${retrospective.action_items}`);
  }

  return parts.join('\n\n');
}

/**
 * Generate embedding with retry logic
 */
async function generateEmbeddingWithRetry(content, retries = 0) {
  try {
    const [embedding] = await embedder.embed(content);

    // Estimate tokens/cost (factory doesn't return usage stats)
    const estimatedTokens = Math.ceil(content.length / 4);
    return {
      embedding,
      tokens: estimatedTokens,
      cost: (estimatedTokens / 1000000) * 0.02 // $0.02 per 1M tokens
    };
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retries); // Exponential backoff
      console.log(`   ⚠️  Retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateEmbeddingWithRetry(content, retries + 1);
    }
    throw error;
  }
}

/**
 * Update retrospective with embedding
 */
async function updateRetrospectiveEmbedding(retrospectiveId, embedding) {
  const { data, error } = await supabase
    .from('retrospectives')
    .update({ content_embedding: JSON.stringify(embedding) })
    .eq('id', retrospectiveId)
    .select()
    .single();

  if (error) {
    throw new Error(`Database update failed: ${error.message}`);
  }

  return data;
}

/**
 * Process a batch of retrospectives
 */
async function processBatch(retrospectives, progress) {
  const results = [];

  for (const retro of retrospectives) {
    try {
      console.log(`\n📝 Processing: ${retro.title} (${retro.id})`);

      // Build content
      const content = buildEmbeddingContent(retro);
      console.log(`   Content length: ${content.length} chars`);

      // Generate embedding
      const { embedding, tokens, cost } = await generateEmbeddingWithRetry(content);
      console.log(`   Tokens: ${tokens}, Cost: $${cost.toFixed(6)}`);

      // Update database
      await updateRetrospectiveEmbedding(retro.id, embedding);
      console.log('   ✅ Embedding stored successfully');

      // Track progress
      progress.processedIds.push(retro.id);
      progress.successCount++;
      progress.totalCost += cost;

      results.push({ success: true, id: retro.id, tokens, cost });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      progress.errorCount++;
      results.push({ success: false, id: retro.id, error: error.message });
    }

    // Save progress after each retrospective
    saveProgress(progress);
  }

  return results;
}

/**
 * Fetch retrospectives that need embeddings
 */
async function fetchRetrospectivesNeedingEmbeddings(force, specificId, progress) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: paginate to completion --
  // queryFactory must return a FRESH builder per page, so the conditional filter-building
  // moved into this closure (behavior-identical, just re-run per page).
  const buildQuery = () => {
    let query = supabase
      .from('retrospectives')
      .select('id, title, key_learnings, action_items, content_embedding, status');

    // Filter by specific ID if provided
    if (specificId) {
      query = query.eq('id', specificId);
    } else {
      // Only PUBLISHED retrospectives
      query = query.eq('status', 'PUBLISHED');

      // Skip if embedding exists (unless force)
      if (!force) {
        query = query.is('content_embedding', null);
      }

      // Skip already processed IDs
      if (progress.processedIds.length > 0) {
        query = query.not('id', 'in', `(${progress.processedIds.join(',')})`);
      }
    }

    return query.order('id', { ascending: true }); // unique tiebreaker: stable page boundaries (FR-6)
  };

  try {
    return await fetchAllPaginated(buildQuery);
  } catch (error) {
    throw new Error(`Failed to fetch retrospectives: ${error.message}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🚀 Retrospective Embedding Generation');
  console.log('═'.repeat(70));
  console.log(`Model: ${embedder.model} (${embedder.provider})`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Max Retries: ${MAX_RETRIES}`);
  console.log('');

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const retroIdArg = args.find(arg => arg.startsWith('--retro-id='));
  const specificId = retroIdArg ? retroIdArg.split('=')[1] : null;

  if (force) {
    console.log('⚠️  Force mode: Will regenerate embeddings even if they exist');
  }

  if (specificId) {
    console.log(`🎯 Single retrospective mode: ${specificId}`);
  }

  // Load progress
  const progress = loadProgress();
  if (progress.processedIds.length > 0) {
    console.log(`📂 Resuming from previous run: ${progress.successCount} success, ${progress.errorCount} errors`);
  }

  // Fetch retrospectives needing embeddings
  console.log('\n🔍 Fetching retrospectives needing embeddings...');
  const retrospectives = await fetchRetrospectivesNeedingEmbeddings(force, specificId, progress);

  if (retrospectives.length === 0) {
    console.log('✅ All retrospectives already have embeddings!');
    console.log('   Use --force to regenerate existing embeddings');
    return;
  }

  console.log(`Found ${retrospectives.length} retrospective(s) to process`);
  console.log('');

  // Process in batches
  const totalBatches = Math.ceil(retrospectives.length / BATCH_SIZE);

  for (let i = 0; i < retrospectives.length; i += BATCH_SIZE) {
    const batch = retrospectives.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} retrospectives)`);
    console.log('─'.repeat(70));

    await processBatch(batch, progress);

    // Rate limiting pause between batches (if not last batch)
    if (i + BATCH_SIZE < retrospectives.length) {
      console.log('\n⏸️  Pausing 2s before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Final summary
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('📊 Final Summary');
  console.log('═'.repeat(70));
  console.log(`Total Processed: ${progress.processedIds.length}`);
  console.log(`✅ Success: ${progress.successCount}`);
  console.log(`❌ Errors: ${progress.errorCount}`);
  console.log(`💰 Total Cost: $${progress.totalCost.toFixed(6)}`);
  console.log('');

  // Query embedding stats
  const { data: stats } = await supabase.rpc('get_retrospective_embedding_stats');

  if (stats && stats.length > 0) {
    const stat = stats[0];
    console.log('📈 Embedding Coverage:');
    console.log(`   Total Retrospectives: ${stat.total_retrospectives}`);
    console.log(`   With Embeddings: ${stat.with_embeddings}`);
    console.log(`   Without Embeddings: ${stat.without_embeddings}`);
    console.log(`   Coverage: ${stat.embedding_coverage_percent}%`);
  }

  console.log('');
  console.log('✅ Embedding generation complete!');

  // Clean up progress file if all successful
  if (progress.errorCount === 0) {
    try {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('🧹 Progress file cleaned up');
    } catch (_error) {
      // Ignore cleanup errors
    }
  } else {
    console.log(`⚠️  ${progress.errorCount} error(s) occurred. Progress file retained for retry.`);
  }
}

// Execute
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
