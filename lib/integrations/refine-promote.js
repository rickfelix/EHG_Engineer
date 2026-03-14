/**
 * Refine: Research SD Promotion Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * DEPRECATED (SD-DISTILLTOBRAINSTORM-ORCH-001-C): Items with brainstorm_session_id
 * already have full SDs created via the brainstorm auto-chain. This Research SD
 * path only runs for non-brainstormed items that went through the refine pipeline.
 *
 * Promotes high-scoring wave items into Research SDs.
 * Research SDs follow a lightweight workflow — they're meant for
 * investigation/exploration before deciding whether to build.
 *
 * This module:
 *   1. Identifies items recommended for promotion (composite >= 70)
 *   2. Groups them by theme/application into Research SD batches
 *   3. Creates draft SDs with sd_type='documentation' (lightweight workflow)
 *   4. Links wave items back via promoted_to_sd_key
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Group scored items by target application for SD creation.
 * @param {Array<{item_index: number, composite: number, recommendation: string}>} scoredItems
 * @param {Array} originalItems - Items with metadata
 * @returns {Array<{application: string, items: Array}>}
 */
export function groupForPromotion(scoredItems, originalItems) {
  const promotable = scoredItems.filter(s => s.recommendation === 'promote');
  const groups = {};

  for (const scored of promotable) {
    const item = originalItems[scored.item_index - 1];
    if (!item) continue;

    const app = item.target_application || 'unknown';
    if (!groups[app]) groups[app] = [];
    groups[app].push({ ...item, composite: scored.composite, item_index: scored.item_index });
  }

  return Object.entries(groups).map(([application, items]) => ({
    application,
    items,
  }));
}

/**
 * Generate a Research SD title from a group of items.
 * @param {string} application
 * @param {Array} items
 * @returns {string}
 */
function generateSDTitle(application, items) {
  const appLabels = {
    ehg_engineer: 'EHG Engineer',
    ehg_app: 'EHG App',
    new_venture: 'New Ventures',
  };
  const label = appLabels[application] || application;

  if (items.length === 1) {
    return `Research: ${(items[0].title || 'Untitled').slice(0, 80)}`;
  }

  // Extract common theme from item titles
  const intents = [...new Set(items.map(i => i.chairman_intent).filter(Boolean))];
  const intentLabel = intents.length === 1 ? intents[0] : 'mixed';

  return `Research: ${label} ${intentLabel} items (${items.length} topics)`;
}

/**
 * Generate a unique SD key for a research SD.
 * @param {string} application
 * @param {number} counter
 * @returns {string}
 */
function generateSDKey(application, counter) {
  const appCode = {
    ehg_engineer: 'ENG',
    ehg_app: 'APP',
    new_venture: 'VENT',
  };
  const code = appCode[application] || 'RES';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `SD-RESEARCH-${code}-${date}-${String(counter).padStart(3, '0')}`;
}

/**
 * Create a Research SD in the database and link wave items.
 * @param {Object} group - { application, items }
 * @param {number} counter - Unique counter for SD key
 * @param {Object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{sd_key: string, title: string, item_count: number}>}
 */
async function createResearchSD(group, counter, options) {
  const { supabase, dryRun } = options;
  const sdKey = generateSDKey(group.application, counter);
  const title = generateSDTitle(group.application, group.items);

  const sdData = {
    id: sdKey,
    sd_key: sdKey,
    title,
    description: `Research SD auto-promoted from /distill refine. ${group.items.length} items from ${group.application} scored >= 70 by multi-persona evaluation.`,
    sd_type: 'documentation',
    category: 'research',
    status: 'draft',
    current_phase: 'LEAD',
    priority: 'medium',
    target_application: group.application === 'ehg_app' ? 'EHG' : 'EHG_Engineer',
    strategic_objectives: group.items.map(i => (i.title || '').slice(0, 200)),
    key_changes: group.items.map(i => ({
      description: (i.title || '').slice(0, 200),
      type: 'research',
    })),
    success_criteria: [
      'Research findings documented',
      'Build/no-build decision made for each item',
      'Follow-up SDs created for approved items',
    ],
    metadata: {
      source: 'distill-refine',
      refine_date: new Date().toISOString(),
      avg_composite: Math.round(group.items.reduce((sum, i) => sum + i.composite, 0) / group.items.length),
    },
  };

  if (dryRun) {
    return { sd_key: sdKey, title, item_count: group.items.length };
  }

  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData);

  if (sdErr) {
    console.warn(`  Warning: Could not create research SD ${sdKey}: ${sdErr.message}`);
    return { sd_key: null, title, item_count: group.items.length, error: sdErr.message };
  }

  // Link wave items back to the created SD
  for (const item of group.items) {
    if (item.wave_item_id) {
      await supabase
        .from('roadmap_wave_items')
        .update({ promoted_to_sd_key: sdKey })
        .eq('id', item.wave_item_id);
    }
  }

  return { sd_key: sdKey, title, item_count: group.items.length };
}

/**
 * Promote scored items into Research SDs.
 * @param {Array} scoredItems - Output from refine-score
 * @param {Array} originalItems - Original wave items
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{ promoted: Array<{sd_key: string, title: string, item_count: number}>, skipped: number }>}
 */
export async function promote(scoredItems, originalItems, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const groups = groupForPromotion(scoredItems, originalItems);
  const promoted = [];
  let counter = 1;

  for (const group of groups) {
    // SD-DISTILLTOBRAINSTORM-ORCH-001-B: Skip Research SD for items with brainstorm
    // Items that went through brainstorm-to-SD path already have SDs
    const nonBrainstormed = group.items.filter(i => !i.brainstorm_session_id);
    if (nonBrainstormed.length === 0) {
      console.log(`  ⏭️  Skipping ${group.application}: all ${group.items.length} items already brainstormed`);
      continue;
    }
    const filteredGroup = { ...group, items: nonBrainstormed };

    const result = await createResearchSD(filteredGroup, counter++, {
      supabase,
      dryRun: options.dryRun,
    });
    promoted.push(result);
  }

  const skipped = scoredItems.filter(s => s.recommendation !== 'promote').length;

  return { promoted, skipped };
}
