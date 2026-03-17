#!/usr/bin/env node
/**
 * EVA Intake Classify CLI
 * SD: SD-LEO-FEAT-EVA-INTAKE-INTERACTIVE-001
 *
 * Interactive 3-dimension classification for intake items.
 * Uses AskUserQuestion flow when run inside Claude Code,
 * or batch mode for automated processing.
 *
 * Usage:
 *   node scripts/eva-intake-classify.js                # Show stats (both sources)
 *   node scripts/eva-intake-classify.js --stats        # Show classification statistics
 *   node scripts/eva-intake-classify.js --interactive   # List unclassified items (JSON)
 *   node scripts/eva-intake-classify.js --ai-rec <id>  # Get AI rec + AskUserQuestion payloads
 *   node scripts/eva-intake-classify.js --save <id> '<json>' --source todoist  # Save classification
 *   node scripts/eva-intake-classify.js --batch        # Auto-classify all unclassified
 *   node scripts/eva-intake-classify.js --batch --limit 10  # Auto-classify up to 10
 *   node scripts/eva-intake-classify.js --item <id>    # Classify a single item by ID
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import {
  classifyItem,
  getUnclassifiedItems,
  saveClassification,
  getAIRecommendation,
  askUserQuestions,
  mapSelectionToValue,
} from '../lib/integrations/intake-classifier.js';
import { validateClassification } from '../lib/integrations/intake-taxonomy.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

async function showStats() {
  const { count: todoistTotal } = await supabase
    .from('eva_todoist_intake')
    .select('*', { count: 'exact', head: true });

  const { count: todoistClassified } = await supabase
    .from('eva_todoist_intake')
    .select('*', { count: 'exact', head: true })
    .not('classified_at', 'is', null);

  const { count: youtubeTotal } = await supabase
    .from('eva_youtube_intake')
    .select('*', { count: 'exact', head: true });

  const { count: youtubeClassified } = await supabase
    .from('eva_youtube_intake')
    .select('*', { count: 'exact', head: true })
    .not('classified_at', 'is', null);

  const total = (todoistTotal || 0) + (youtubeTotal || 0);
  const classified = (todoistClassified || 0) + (youtubeClassified || 0);
  const unclassified = total - classified;

  const { data: byAppTodoist } = await supabase
    .from('eva_todoist_intake')
    .select('target_application')
    .not('classified_at', 'is', null);

  const { data: byAppYoutube } = await supabase
    .from('eva_youtube_intake')
    .select('target_application')
    .not('classified_at', 'is', null);

  const appCounts = {};
  for (const row of [...(byAppTodoist || []), ...(byAppYoutube || [])]) {
    const app = row.target_application || 'unknown';
    appCounts[app] = (appCounts[app] || 0) + 1;
  }

  console.log('\n=== EVA Intake Classification Stats ===');
  console.log(`  Total items:        ${total}`);
  console.log(`  Classified (3D):    ${classified}`);
  console.log(`  Unclassified:       ${unclassified}`);
  console.log(`  Coverage:           ${total > 0 ? Math.round((classified / total) * 100) : 0}%`);

  console.log('\n  By Source:');
  console.log(`    Todoist:  ${todoistClassified || 0}/${todoistTotal || 0} classified`);
  console.log(`    YouTube:  ${youtubeClassified || 0}/${youtubeTotal || 0} classified`);

  if (Object.keys(appCounts).length > 0) {
    console.log('\n  By Application:');
    for (const [app, count] of Object.entries(appCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${app}: ${count}`);
    }
  }
  console.log('');
}

async function batchClassify(limit) {
  const items = await getUnclassifiedItems(supabase, { sources: ['todoist', 'youtube'], limit });

  if (items.length === 0) {
    console.log('No unclassified items found.');
    return;
  }

  console.log(`\nClassifying ${items.length} items...\n`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    const result = await classifyItem(supabase, item);
    const saveResult = await saveClassification(supabase, item.id, result, item.source);

    if (saveResult.success) {
      success++;
      const tag = item.source === 'youtube' ? '[YouTube]' : '[Todoist]';
      console.log(
        `  ${tag} [${result.method}] ${item.title.slice(0, 45).padEnd(45)} → ${result.target_application} | [${result.target_aspects.join(', ')}] | ${result.chairman_intent} (${Math.round(result.confidence * 100)}%)`
      );
    } else {
      failed++;
      console.error(`  FAILED: ${item.title.slice(0, 50)} — ${saveResult.error}`);
    }
  }

  console.log(`\nDone: ${success} classified, ${failed} failed.`);
}

async function classifySingleItem(itemId) {
  const { data: item, error } = await supabase
    .from('eva_todoist_intake')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (error || !item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  console.log(`\nItem: ${item.title}`);
  console.log(`Description: ${item.description || '(none)'}`);

  const aiRec = await getAIRecommendation(item.title, item.description || '');

  if (aiRec) {
    console.log(`\nAI Recommendation:`);
    console.log(`  Application: ${aiRec.target_application}`);
    console.log(`  Aspects:     [${aiRec.target_aspects.join(', ')}]`);
    console.log(`  Intent:      ${aiRec.chairman_intent}`);
    console.log(`  Confidence:  ${Math.round(aiRec.confidence * 100)}%`);
    console.log(`  Reasoning:   ${aiRec.reasoning}`);
  } else {
    console.log('\nAI classification unavailable, using keyword fallback.');
  }

  // Output the AskUserQuestion payloads for Claude Code to use
  console.log('\n--- ASKUSERQUESTION PAYLOADS ---');
  console.log('STEP_1_APPLICATION:', JSON.stringify(askUserQuestions.application(aiRec)));
  console.log('STEP_2_ASPECTS_TEMPLATE: Use askUserQuestions.aspects(chosenApp, aiRec)');
  console.log('STEP_3_INTENT:', JSON.stringify(askUserQuestions.intent(aiRec)));
  console.log('--- END PAYLOADS ---');
  console.log(`\nITEM_ID=${item.id}`);
}

/**
 * Interactive mode: output unclassified items as structured JSON
 * for Claude Code to orchestrate the AskUserQuestion loop.
 */
async function interactiveMode(options = {}) {
  const sources = options.sources || ['todoist', 'youtube'];
  const items = await getUnclassifiedItems(supabase, { sources, limit: options.limit });

  if (items.length === 0) {
    console.log('INTERACTIVE_STATUS=empty');
    console.log('No unclassified items found.');
    return;
  }

  console.log(`INTERACTIVE_STATUS=ready`);
  console.log(`INTERACTIVE_TOTAL=${items.length}`);
  console.log('INTERACTIVE_ITEMS=' + JSON.stringify(items.map(i => ({
    id: i.id,
    title: i.title,
    description: i.description || '',
    source: i.source,
    created_at: i.created_at,
  }))));
}

/**
 * Get AI recommendation + AskUserQuestion payloads for a single item.
 * Checks both tables to find the item.
 */
async function getItemAIRec(itemId) {
  let item = null;
  let source = 'todoist';

  const { data: todoistItem } = await supabase
    .from('eva_todoist_intake')
    .select('id, title, description')
    .eq('id', itemId)
    .maybeSingle();

  if (todoistItem) {
    item = todoistItem;
  } else {
    const { data: youtubeItem } = await supabase
      .from('eva_youtube_intake')
      .select('id, title, description')
      .eq('id', itemId)
      .maybeSingle();
    if (youtubeItem) {
      item = youtubeItem;
      source = 'youtube';
    }
  }

  if (!item) {
    console.error(`Item not found: ${itemId}`);
    process.exit(1);
  }

  const aiRec = await getAIRecommendation(item.title, item.description || '');

  const output = {
    item_id: item.id,
    title: item.title,
    description: item.description || '',
    source,
    ai_recommendation: aiRec,
    ask_application: askUserQuestions.application(aiRec),
    ask_aspects: {
      ehg_engineer: askUserQuestions.aspects('ehg_engineer', aiRec),
      ehg_app: askUserQuestions.aspects('ehg_app', aiRec),
      new_venture: askUserQuestions.aspects('new_venture', aiRec),
    },
    ask_intent: askUserQuestions.intent(aiRec),
  };

  console.log(JSON.stringify(output));
}

/**
 * Save a classification for a single item.
 * @param {string} itemId - Item UUID
 * @param {string} classificationJson - JSON string with classification data
 * @param {string} source - 'todoist' or 'youtube'
 */
async function saveItemClassification(itemId, classificationJson, source) {
  let classification;
  try {
    classification = JSON.parse(classificationJson);
  } catch {
    console.error('Invalid classification JSON');
    process.exit(1);
  }

  const { valid, errors } = validateClassification(
    classification.target_application,
    classification.target_aspects,
    classification.chairman_intent
  );
  if (!valid) {
    console.error('Classification validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  const result = await saveClassification(supabase, itemId, classification, source);
  if (result.success) {
    console.log(`SAVE_STATUS=success`);
    console.log(`SAVE_ITEM_ID=${itemId}`);
    console.log(`SAVE_APP=${classification.target_application}`);
    console.log(`SAVE_ASPECTS=[${classification.target_aspects.join(', ')}]`);
    console.log(`SAVE_INTENT=${classification.chairman_intent}`);
  } else {
    console.error(`SAVE_STATUS=error`);
    console.error(`SAVE_ERROR=${result.error}`);
    process.exit(1);
  }
}

// Parse args
const args = process.argv.slice(2);
const isBatch = args.includes('--batch');
const isStats = args.includes('--stats');
const isInteractive = args.includes('--interactive');
const itemIdx = args.indexOf('--item');
const aiRecIdx = args.indexOf('--ai-rec');
const saveIdx = args.indexOf('--save');
const limitIdx = args.indexOf('--limit');
const sourceIdx = args.indexOf('--source');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 50 : 50;
const source = sourceIdx >= 0 ? args[sourceIdx + 1] : 'todoist';

if (isStats) {
  showStats().catch(console.error);
} else if (isInteractive) {
  interactiveMode({ limit, sources: ['todoist', 'youtube'] }).catch(console.error);
} else if (aiRecIdx >= 0 && args[aiRecIdx + 1]) {
  getItemAIRec(args[aiRecIdx + 1]).catch(console.error);
} else if (saveIdx >= 0 && args[saveIdx + 1] && args[saveIdx + 2]) {
  saveItemClassification(args[saveIdx + 1], args[saveIdx + 2], source).catch(console.error);
} else if (isBatch) {
  batchClassify(limit).catch(console.error);
} else if (itemIdx >= 0 && args[itemIdx + 1]) {
  classifySingleItem(args[itemIdx + 1]).catch(console.error);
} else {
  showStats().catch(console.error);
}
