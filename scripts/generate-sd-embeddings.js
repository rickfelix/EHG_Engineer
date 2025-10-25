#!/usr/bin/env node
/**
 * Generate Strategic Directive Embeddings with OpenAI
 *
 * Purpose: Generate semantic search embeddings for existing SDs using OpenAI text-embedding-3-small
 *
 * Features:
 * - Batch processing with rate limit handling
 * - Retry logic with exponential backoff
 * - Cost estimation and monitoring
 * - Status filtering (only active SDs by default)
 * - Updates existing embeddings (idempotent)
 * - Progress tracking and resumability
 *
 * Usage:
 *   node scripts/generate-sd-embeddings.js [OPTIONS]
 *
 * Options:
 *   --force          Regenerate embeddings even if they exist
 *   --status=STATUS  Filter by SD status (default: PLAN_PRD,PLAN_VERIFY,EXEC_IMPL,EXEC_TEST)
 *   --sd-id=ID       Process only a specific SD (for testing)
 *   --batch-size=N   Number of SDs to process per batch (default: 10)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, $0.02/1M tokens
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_STATUSES = ['active', 'draft']; // Active and draft SDs need embeddings

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate embedding with retry logic
 */
async function generateEmbeddingWithRetry(text, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text
      });

      return response.data[0].embedding;

    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`   ⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Estimate cost based on token count
 */
function estimateCost(text) {
  // Rough estimate: 1 token ≈ 4 characters
  const estimatedTokens = Math.ceil(text.length / 4);
  const costPerMillionTokens = 0.02; // $0.02 per 1M tokens
  const cost = (estimatedTokens / 1_000_000) * costPerMillionTokens;
  return { tokens: estimatedTokens, cost };
}

/**
 * Build embedding text from SD
 */
function buildSDEmbeddingText(sd) {
  const parts = [
    `Title: ${sd.title || ''}`,
    sd.scope && `Scope: ${sd.scope}`,
    sd.description && `Description: ${sd.description}`,
    sd.strategic_intent && `Strategic Intent: ${sd.strategic_intent}`,
    sd.strategic_objectives && `Strategic Objectives: ${sd.strategic_objectives}`,
    sd.success_criteria && `Success Criteria: ${sd.success_criteria}`,
    sd.implementation_guidelines && `Implementation Guidelines: ${sd.implementation_guidelines}`,
    sd.key_principles && `Key Principles: ${sd.key_principles}`
  ].filter(Boolean);

  return parts.join('\n\n');
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    force: args.includes('--force'),
    statuses: DEFAULT_STATUSES,
    sdId: null,
    batchSize: DEFAULT_BATCH_SIZE
  };

  // Parse --status=VALUE
  const statusArg = args.find(arg => arg.startsWith('--status='));
  if (statusArg) {
    options.statuses = statusArg.split('=')[1].split(',');
  }

  // Parse --sd-id=VALUE
  const sdIdArg = args.find(arg => arg.startsWith('--sd-id='));
  if (sdIdArg) {
    options.sdId = sdIdArg.split('=')[1];
  }

  // Parse --batch-size=VALUE
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  if (batchSizeArg) {
    options.batchSize = parseInt(batchSizeArg.split('=')[1], 10);
  }

  return options;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('\n🧠 SD Embedding Generation - Starting...\n');
  console.log('='.repeat(70));

  // Parse options
  const options = parseArgs();

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.error('   Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  // Build query
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, scope, description, strategic_intent, strategic_objectives, success_criteria, implementation_guidelines, key_principles, status, scope_embedding');

  // Filter by SD ID if specified
  if (options.sdId) {
    query = query.eq('sd_key', options.sdId);
  } else {
    // Filter by status
    query = query.in('status', options.statuses);
  }

  query = query.order('created_at', { ascending: false });

  // Fetch SDs
  const { data: sds, error: fetchError } = await query;

  if (fetchError) {
    console.error('❌ Failed to fetch SDs:', fetchError.message);
    process.exit(1);
  }

  console.log(`📋 Found ${sds.length} SDs matching criteria`);
  console.log(`   Statuses: ${options.statuses.join(', ')}`);
  if (options.sdId) {
    console.log(`   SD ID: ${options.sdId}`);
  }

  // Filter by existing embeddings if not force
  const sdsToProcess = options.force
    ? sds
    : sds.filter(sd => !sd.scope_embedding);

  if (sdsToProcess.length === 0) {
    console.log('\n✅ No SDs to process (all have embeddings, use --force to regenerate)');
    process.exit(0);
  }

  console.log(`🎯 Processing ${sdsToProcess.length} SD(s)`);
  console.log('='.repeat(70));
  console.log('');

  // Calculate total cost estimate
  let totalTokens = 0;
  let totalCost = 0;

  for (const sd of sdsToProcess) {
    const text = buildSDEmbeddingText(sd);
    const estimate = estimateCost(text);
    totalTokens += estimate.tokens;
    totalCost += estimate.cost;
  }

  console.log('💰 Cost Estimate:');
  console.log(`   Total tokens: ~${totalTokens.toLocaleString()}`);
  console.log(`   Estimated cost: $${totalCost.toFixed(4)}`);
  console.log('');

  // Process in batches
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < sdsToProcess.length; i++) {
    const sd = sdsToProcess[i];
    const progress = `[${i + 1}/${sdsToProcess.length}]`;

    console.log(`\n${progress} Processing: ${sd.sd_key} (${sd.title})`);
    console.log('-'.repeat(70));

    try {
      // Build embedding text
      const text = buildSDEmbeddingText(sd);

      if (!text || text.trim().length === 0) {
        console.log('   ⚠️  No content to embed - skipping');
        skipCount++;
        continue;
      }

      // Generate embedding
      console.log('   🧠 Generating embedding...');
      const embedding = await generateEmbeddingWithRetry(text);

      // Update database
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          scope_embedding: embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', sd.id);

      if (updateError) {
        throw new Error(`Failed to update database: ${updateError.message}`);
      }

      const estimate = estimateCost(text);
      console.log('   ✅ Embedding generated and stored');
      console.log(`   📊 Tokens: ~${estimate.tokens.toLocaleString()}, Cost: $${estimate.cost.toFixed(6)}`);

      successCount++;

      // Rate limiting: Add small delay between requests
      if (i < sdsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms between requests
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;

      // Continue processing other SDs even if one fails
      continue;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log(`✅ Success: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
  console.log('='.repeat(70));
  console.log('');

  if (successCount > 0) {
    console.log('🎉 SD embedding generation complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify embeddings with:');
    console.log('   SELECT COUNT(*) FROM strategic_directives_v2 WHERE scope_embedding IS NOT NULL;');
    console.log('2. Test hybrid selection with context-aware-sub-agent-selector.js');
    console.log('3. Update orchestrator to use selectSubAgentsHybrid()');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
