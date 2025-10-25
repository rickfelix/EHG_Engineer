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
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const BATCH_SIZE = 5; // Process 5 at a time (OpenAI rate limit: 3000 req/min)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, $0.02/1M tokens
const PROGRESS_FILE = 'embedding-generation-progress.json';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: content,
      encoding_format: 'float'
    });

    return {
      embedding: response.data[0].embedding,
      tokens: response.usage.total_tokens,
      cost: (response.usage.total_tokens / 1000000) * 0.02 // $0.02 per 1M tokens
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

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch retrospectives: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🚀 Retrospective Embedding Generation');
  console.log('═'.repeat(70));
  console.log(`Model: ${EMBEDDING_MODEL}`);
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

  // Verify OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    console.error('   Add OPENAI_API_KEY to your .env file');
    process.exit(1);
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
    } catch (error) {
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
