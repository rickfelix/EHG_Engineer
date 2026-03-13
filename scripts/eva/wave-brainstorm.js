#!/usr/bin/env node
/**
 * wave-brainstorm.js — LLM-powered strategic brainstorm per roadmap wave
 * SD: SD-DISTILL-PIPELINE-CHAIRMAN-REVIEW-ORCH-001-D
 *
 * Generates strategic recommendations for a wave's items as a cohesive unit.
 * Stores results in roadmap_waves.metadata JSONB.
 *
 * Usage:
 *   node scripts/eva/wave-brainstorm.js --wave-id <uuid>
 *   node scripts/eva/wave-brainstorm.js --wave-id <uuid> --dry-run
 *   node scripts/eva/wave-brainstorm.js --wave-id <uuid> --review
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createLLMClient } from '../../lib/llm/client-factory.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Load wave items with enrichment data from intake tables.
 */
async function loadWaveItems(waveId) {
  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, description, status, metadata, roadmap_id, sequence_rank')
    .eq('id', waveId)
    .single();

  if (wErr || !wave) throw new Error(`Wave not found: ${waveId}`);

  const { data: waveItems, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, source_id, priority_rank, promoted_to_sd_key')
    .eq('wave_id', waveId)
    .order('priority_rank', { ascending: true });

  if (iErr) throw new Error(`Failed to load wave items: ${iErr.message}`);
  if (!waveItems || waveItems.length === 0) return { wave, items: [] };

  // Enrich items with intake classification data
  const enrichedItems = [];
  for (const item of waveItems) {
    let enrichment = {};
    if (item.source_type === 'todoist' || item.source_type === 'classified') {
      const { data } = await supabase
        .from('eva_intake_classified')
        .select('title, description, target_application, target_aspects, chairman_intent, chairman_notes, enrichment_summary, classification_confidence')
        .eq('id', item.source_id)
        .single();
      if (data) enrichment = data;
    } else if (item.source_type === 'youtube') {
      const { data } = await supabase
        .from('eva_youtube_intake')
        .select('title, description, target_application, target_aspects, chairman_intent, chairman_notes, enrichment_summary')
        .eq('id', item.source_id)
        .single();
      if (data) enrichment = data;
    }

    enrichedItems.push({
      ...item,
      enrichment_title: enrichment.title || item.title,
      description: enrichment.description || '',
      target_application: enrichment.target_application || 'unknown',
      target_aspects: enrichment.target_aspects || [],
      chairman_intent: enrichment.chairman_intent || null,
      chairman_notes: enrichment.chairman_notes || null,
      enrichment_summary: enrichment.enrichment_summary || null,
      classification_confidence: enrichment.classification_confidence || null,
    });
  }

  return { wave, items: enrichedItems };
}

/**
 * Generate brainstorm via LLM.
 */
async function generateBrainstorm(wave, items) {
  const itemDescriptions = items.map((item, i) => {
    const parts = [
      `${i + 1}. "${item.enrichment_title || item.title}"`,
      `   App: ${item.target_application}`,
      `   Intent: ${item.chairman_intent || 'unset'}`,
    ];
    if (item.enrichment_summary) parts.push(`   Summary: ${item.enrichment_summary}`);
    if (item.chairman_notes) parts.push(`   Chairman Notes: ${item.chairman_notes}`);
    if (Array.isArray(item.target_aspects) && item.target_aspects.length > 0) {
      parts.push(`   Aspects: ${item.target_aspects.join(', ')}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const prompt = `You are a strategic technology advisor. Analyze this roadmap wave and provide strategic recommendations.

Wave: "${wave.title}"
Description: ${wave.description || 'No description'}
Items (${items.length}):

${itemDescriptions}

Provide a JSON response with this structure:
{
  "wave_theme": "One sentence describing the unifying theme of this wave",
  "wave_assessment": "2-3 sentence strategic assessment of this wave's value and risk",
  "item_recommendations": [
    {
      "item_index": 1,
      "priority": "high|medium|low",
      "recommendation": "Brief strategic recommendation for this item",
      "dependencies": ["item indices this depends on"]
    }
  ],
  "dependency_suggestions": [
    "Cross-item dependency or ordering suggestion"
  ],
  "risk_flags": [
    "Strategic risk or concern about this wave"
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown fences.`;

  const client = await createLLMClient('planning');
  const response = await client.chat(prompt);
  const text = typeof response === 'string' ? response : response.content || response.text || '';

  // Parse JSON, handling potential markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Persist brainstorm results to wave metadata.
 */
async function persistBrainstorm(waveId, brainstorm, existingMetadata) {
  const merged = {
    ...(existingMetadata || {}),
    brainstorm_at: new Date().toISOString(),
    brainstorm_results: brainstorm,
    model_used: 'planning-tier',
  };

  const { error } = await supabase
    .from('roadmap_waves')
    .update({ metadata: merged })
    .eq('id', waveId);

  if (error) throw new Error(`Failed to persist brainstorm: ${error.message}`);
}

/**
 * Display brainstorm results for chairman review.
 */
function displayBrainstorm(brainstorm, items) {
  console.log('\n  Wave Theme:', brainstorm.wave_theme);
  console.log('  Assessment:', brainstorm.wave_assessment);
  console.log('\n  Item Recommendations:');

  for (const rec of brainstorm.item_recommendations || []) {
    const item = items[rec.item_index - 1];
    const title = item ? (item.enrichment_title || item.title || '(untitled)') : `Item ${rec.item_index}`;
    const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
    console.log(`    ${priorityIcon} [${rec.priority.toUpperCase()}] ${title}`);
    console.log(`       ${rec.recommendation}`);
    if (rec.dependencies && rec.dependencies.length > 0) {
      console.log(`       Depends on: items ${rec.dependencies.join(', ')}`);
    }
  }

  if (brainstorm.dependency_suggestions && brainstorm.dependency_suggestions.length > 0) {
    console.log('\n  Dependency Suggestions:');
    brainstorm.dependency_suggestions.forEach(s => console.log(`    - ${s}`));
  }

  if (brainstorm.risk_flags && brainstorm.risk_flags.length > 0) {
    console.log('\n  Risk Flags:');
    brainstorm.risk_flags.forEach(r => console.log(`    ⚠ ${r}`));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const waveIdFlag = args.indexOf('--wave-id');
  const waveId = waveIdFlag >= 0 ? args[waveIdFlag + 1] : null;
  const dryRun = args.includes('--dry-run');
  const review = args.includes('--review');

  if (!waveId) {
    console.log('Usage:');
    console.log('  node scripts/eva/wave-brainstorm.js --wave-id <uuid>');
    console.log('  node scripts/eva/wave-brainstorm.js --wave-id <uuid> --dry-run');
    console.log('  node scripts/eva/wave-brainstorm.js --wave-id <uuid> --review');
    process.exit(0);
  }

  console.log('\nWave Brainstorm Generator');
  console.log('═'.repeat(50));

  // Load wave + items with enrichment
  const { wave, items } = await loadWaveItems(waveId);
  console.log(`  Wave: ${wave.title} [${wave.status}]`);
  console.log(`  Items: ${items.length}`);

  if (items.length === 0) {
    console.log('\n  No items in wave. Nothing to brainstorm.');
    process.exit(0);
  }

  // Show item summary
  const byApp = {};
  const byIntent = {};
  for (const item of items) {
    byApp[item.target_application] = (byApp[item.target_application] || 0) + 1;
    byIntent[item.chairman_intent || 'unset'] = (byIntent[item.chairman_intent || 'unset'] || 0) + 1;
  }
  console.log(`  By app: ${Object.entries(byApp).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log(`  By intent: ${Object.entries(byIntent).map(([k, v]) => `${k}(${v})`).join(', ')}`);

  // Generate brainstorm
  console.log('\n  Generating brainstorm...');
  const brainstorm = await generateBrainstorm(wave, items);
  console.log('  Brainstorm generated.');

  // Display results
  displayBrainstorm(brainstorm, items);

  if (review) {
    console.log('\n  Chairman Review Mode');
    console.log('  Review the recommendations above.');
    console.log('  To persist, re-run without --review flag (or remove --dry-run).');
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist
  await persistBrainstorm(wave.id, brainstorm, wave.metadata);
  console.log('\n  Brainstorm results saved to wave metadata.');
  console.log('═'.repeat(50));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
