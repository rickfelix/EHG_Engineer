#!/usr/bin/env node

/**
 * Batch LLM enrichment of design_reference_library rows.
 *
 * Processes all rows with null design_tokens through the LLM to extract
 * 7 design dimensions. Rate-limited at 5 calls/sec. Idempotent.
 *
 * Usage: node scripts/enrich-design-tokens.js [--dry-run]
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-B
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildDesignTokenPrompt } from '../lib/eva/prompts/design-token-extraction.js';
import { validateDesignTokens } from '../lib/eva/utils/validate-design-tokens.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RATE_LIMIT_MS = 200; // 5 calls/sec
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Simple rate limiter - waits between calls.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call LLM to extract design tokens for a single reference.
 */
async function extractTokens(ref) {
  const prompt = buildDesignTokenPrompt(ref);

  // Dynamic import to avoid loading LLM factory at module level
  const { getLLMClient } = await import('../lib/llm/client-factory.js');
  const client = getLLMClient({ purpose: 'generation' });

  const response = await client.complete(
    'You are a design analyst. Extract structured design tokens from website metadata. Respond with ONLY valid JSON.',
    prompt
  );

  const text = typeof response === 'string' ? response : (response?.text || response?.content || '');
  const usage = response?.usage || {};

  // Parse JSON from response (handle potential markdown fencing)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return { tokens: JSON.parse(cleaned), usage };
}

async function main() {
  console.log(`\n🎨 Design Token Enrichment${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('═'.repeat(50));

  // Fetch rows needing enrichment (idempotent: skip non-null)
  const { data: rows, error } = await supabase
    .from('design_reference_library')
    .select('id, site_name, description, archetype_category, score_design, score_usability, score_creativity, score_content')
    .is('design_tokens', null)
    .order('id');

  if (error) {
    console.error('❌ Failed to fetch rows:', error.message);
    process.exit(1);
  }

  console.log(`📋 Rows to enrich: ${rows.length}`);

  if (rows.length === 0) {
    console.log('✅ All rows already enriched. Nothing to do.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('🔍 Dry run - would process these rows:');
    rows.slice(0, 5).forEach((r) => console.log(`   - ${r.site_name} (${r.archetype_category})`));
    if (rows.length > 5) console.log(`   ... and ${rows.length - 5} more`);
    process.exit(0);
  }

  let enriched = 0;
  let failed = 0;
  let totalTokens = 0;
  const startTime = Date.now();

  for (const ref of rows) {
    try {
      const { tokens, usage } = await extractTokens(ref);
      const validation = validateDesignTokens(tokens);

      if (!validation.valid) {
        console.warn(`⚠️  ${ref.site_name}: Invalid tokens (missing: ${validation.missing.join(', ')}, empty: ${validation.empty.join(', ')})`);
        failed++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const { error: updateError } = await supabase
        .from('design_reference_library')
        .update({ design_tokens: tokens })
        .eq('id', ref.id);

      if (updateError) {
        console.error(`❌ ${ref.site_name}: Update failed - ${updateError.message}`);
        failed++;
      } else {
        enriched++;
        totalTokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      }
    } catch (err) {
      console.error(`❌ ${ref.site_name}: ${err.message}`);
      failed++;
    }

    await sleep(RATE_LIMIT_MS);

    // Progress log every 10 rows
    if ((enriched + failed) % 10 === 0) {
      console.log(`   Progress: ${enriched + failed}/${rows.length} (${enriched} ok, ${failed} failed)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const estimatedCost = (totalTokens / 1000000 * 3).toFixed(4); // ~$3/MTok for sonnet

  console.log('\n📊 Results');
  console.log('─'.repeat(50));
  console.log(`   Enriched: ${enriched}/${rows.length}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`   Est Cost: $${estimatedCost}`);
  console.log(`   Duration: ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
