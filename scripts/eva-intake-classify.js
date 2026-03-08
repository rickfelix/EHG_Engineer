#!/usr/bin/env node
/**
 * EVA Intake Classify CLI
 * SD: SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003-C
 *
 * Interactive 3-dimension classification for intake items.
 * Uses AskUserQuestion flow when run inside Claude Code,
 * or batch mode for automated processing.
 *
 * Usage:
 *   node scripts/eva-intake-classify.js                # Show unclassified count
 *   node scripts/eva-intake-classify.js --batch        # Auto-classify all unclassified
 *   node scripts/eva-intake-classify.js --batch --limit 10  # Auto-classify up to 10
 *   node scripts/eva-intake-classify.js --item <id>    # Classify a single item by ID
 *   node scripts/eva-intake-classify.js --stats        # Show classification statistics
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  classifyItem,
  getUnclassifiedItems,
  saveClassification,
  getAIRecommendation,
  askUserQuestions,
} from '../lib/integrations/intake-classifier.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showStats() {
  const { count: total } = await supabase
    .from('eva_todoist_intake')
    .select('*', { count: 'exact', head: true });

  const { count: classified } = await supabase
    .from('eva_todoist_intake')
    .select('*', { count: 'exact', head: true })
    .not('classified_at', 'is', null);

  const { count: unclassified } = await supabase
    .from('eva_todoist_intake')
    .select('*', { count: 'exact', head: true })
    .is('classified_at', null);

  const { data: byApp } = await supabase
    .from('eva_todoist_intake')
    .select('target_application')
    .not('classified_at', 'is', null);

  const appCounts = {};
  for (const row of byApp || []) {
    const app = row.target_application || 'unknown';
    appCounts[app] = (appCounts[app] || 0) + 1;
  }

  console.log('\n=== EVA Intake Classification Stats ===');
  console.log(`  Total items:        ${total}`);
  console.log(`  Classified (3D):    ${classified}`);
  console.log(`  Unclassified:       ${unclassified}`);
  console.log(`  Coverage:           ${total > 0 ? Math.round((classified / total) * 100) : 0}%`);

  if (Object.keys(appCounts).length > 0) {
    console.log('\n  By Application:');
    for (const [app, count] of Object.entries(appCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${app}: ${count}`);
    }
  }
  console.log('');
}

async function batchClassify(limit) {
  const items = await getUnclassifiedItems(supabase, { limit });

  if (items.length === 0) {
    console.log('No unclassified items found.');
    return;
  }

  console.log(`\nClassifying ${items.length} items...\n`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    const result = await classifyItem(supabase, item);
    const saveResult = await saveClassification(supabase, item.id, result);

    if (saveResult.success) {
      success++;
      console.log(
        `  [${result.method}] ${item.title.slice(0, 50).padEnd(50)} → ${result.target_application} | [${result.target_aspects.join(', ')}] | ${result.chairman_intent} (${Math.round(result.confidence * 100)}%)`
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

// Parse args
const args = process.argv.slice(2);
const isBatch = args.includes('--batch');
const isStats = args.includes('--stats');
const itemIdx = args.indexOf('--item');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 50 : 50;

if (isStats) {
  showStats().catch(console.error);
} else if (isBatch) {
  batchClassify(limit).catch(console.error);
} else if (itemIdx >= 0 && args[itemIdx + 1]) {
  classifySingleItem(args[itemIdx + 1]).catch(console.error);
} else {
  // Default: show stats + unclassified count
  showStats().catch(console.error);
}
