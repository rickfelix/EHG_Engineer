#!/usr/bin/env node
/**
 * Embedding Indexer for Semantic Search
 * SD-EVA-FEAT-SEMANTIC-SEARCH-001 (Phase 2B)
 *
 * Generates embeddings for venture_artifacts and issue_patterns rows
 * that have content but no embedding yet, then writes them back to the DB.
 *
 * Usage:
 *   node scripts/index-embeddings.js                # Index all pending rows
 *   node scripts/index-embeddings.js --table venture_artifacts
 *   node scripts/index-embeddings.js --table issue_patterns
 *   node scripts/index-embeddings.js --limit 50     # Process at most 50 rows
 *   node scripts/index-embeddings.js --dry-run      # Show what would be indexed
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getEmbeddingClient } from '../lib/llm/client-factory.js';
import { parseArgs } from 'node:util';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 10;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 2;

/**
 * Parse CLI arguments
 */
function getArgs() {
  const { values } = parseArgs({
    options: {
      table: { type: 'string', default: 'all' },
      limit: { type: 'string', default: '200' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: false,
  });
  return {
    table: values.table,
    limit: parseInt(values.limit, 10),
    dryRun: values['dry-run'],
  };
}

/**
 * Fetch rows from venture_artifacts that need embeddings
 */
async function getPendingArtifacts(limit) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, content, artifact_type')
    .not('content', 'is', null)
    .or('artifact_embedding.is.null,indexing_status.eq.pending,indexing_status.eq.failed')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);
  return data || [];
}

/**
 * Fetch rows from issue_patterns that need embeddings
 */
async function getPendingPatterns(limit) {
  const { data, error } = await supabase
    .from('issue_patterns')
    .select('id, issue_summary')
    .not('issue_summary', 'is', null)
    .is('content_embedding', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch patterns: ${error.message}`);
  return data || [];
}

/**
 * Generate embedding with retry logic
 */
async function generateWithRetry(embedder, text) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [embedding] = await embedder.embed(text);
      return embedding;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.log(`   Retry ${attempt + 1}/${MAX_RETRIES}: ${err.message}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

/**
 * Index venture_artifacts in batches
 */
async function indexArtifacts(embedder, limit, dryRun) {
  const rows = await getPendingArtifacts(limit);
  if (rows.length === 0) {
    console.log('   No pending venture_artifacts to index.');
    return { indexed: 0, failed: 0, skipped: 0 };
  }

  console.log(`   Found ${rows.length} venture_artifacts to index.`);
  if (dryRun) return { indexed: 0, failed: 0, skipped: rows.length };

  let indexed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const text = row.content?.trim();
      if (!text || text.length < 10) {
        // Too short to embed meaningfully
        await supabase
          .from('venture_artifacts')
          .update({ indexing_status: 'skipped' })
          .eq('id', row.id);
        skipped++;
        continue;
      }

      try {
        const embedding = await generateWithRetry(embedder, text.slice(0, 8000));
        const { error } = await supabase
          .from('venture_artifacts')
          .update({
            artifact_embedding: JSON.stringify(embedding),
            embedding_model: embedder.model,
            embedding_updated_at: new Date().toISOString(),
            indexing_status: 'indexed',
          })
          .eq('id', row.id);

        if (error) throw error;
        indexed++;
        process.stdout.write(`   Indexed artifact ${indexed}/${rows.length} (${row.artifact_type})\r`);
      } catch (err) {
        console.error(`   Failed to index artifact ${row.id}: ${err.message}`);
        await supabase
          .from('venture_artifacts')
          .update({ indexing_status: 'failed' })
          .eq('id', row.id);
        failed++;
      }
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(''); // Clear carriage return
  return { indexed, failed, skipped };
}

/**
 * Index issue_patterns in batches
 */
async function indexPatterns(embedder, limit, dryRun) {
  const rows = await getPendingPatterns(limit);
  if (rows.length === 0) {
    console.log('   No pending issue_patterns to index.');
    return { indexed: 0, failed: 0, skipped: 0 };
  }

  console.log(`   Found ${rows.length} issue_patterns to index.`);
  if (dryRun) return { indexed: 0, failed: 0, skipped: rows.length };

  let indexed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const text = row.issue_summary?.trim();
      if (!text || text.length < 10) {
        skipped++;
        continue;
      }

      try {
        const embedding = await generateWithRetry(embedder, text.slice(0, 8000));
        const { error } = await supabase
          .from('issue_patterns')
          .update({
            content_embedding: JSON.stringify(embedding),
            embedding_updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (error) throw error;
        indexed++;
        process.stdout.write(`   Indexed pattern ${indexed}/${rows.length}\r`);
      } catch (err) {
        console.error(`   Failed to index pattern ${row.id}: ${err.message}`);
        failed++;
      }
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(''); // Clear carriage return
  return { indexed, failed, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = getArgs();

  console.log('=== Semantic Search Embedding Indexer ===');
  console.log(`   Table: ${args.table}`);
  console.log(`   Limit: ${args.limit}`);
  console.log(`   Dry Run: ${args.dryRun}`);

  const embedder = getEmbeddingClient();
  console.log(`   Provider: ${embedder.provider} (${embedder.model}, ${embedder.dimensions}d)`);
  console.log('');

  const results = {};

  if (args.table === 'all' || args.table === 'venture_artifacts') {
    console.log('--- venture_artifacts ---');
    results.artifacts = await indexArtifacts(embedder, args.limit, args.dryRun);
    console.log(`   Result: ${results.artifacts.indexed} indexed, ${results.artifacts.failed} failed, ${results.artifacts.skipped} skipped`);
    console.log('');
  }

  if (args.table === 'all' || args.table === 'issue_patterns') {
    console.log('--- issue_patterns ---');
    results.patterns = await indexPatterns(embedder, args.limit, args.dryRun);
    console.log(`   Result: ${results.patterns.indexed} indexed, ${results.patterns.failed} failed, ${results.patterns.skipped} skipped`);
    console.log('');
  }

  const totalIndexed = (results.artifacts?.indexed || 0) + (results.patterns?.indexed || 0);
  const totalFailed = (results.artifacts?.failed || 0) + (results.patterns?.failed || 0);
  console.log(`=== Done: ${totalIndexed} indexed, ${totalFailed} failed ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
