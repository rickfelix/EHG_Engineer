#!/usr/bin/env node

/**
 * LEO Assist Runner — Periodic feedback inbox processor
 *
 * Queries untriaged feedback items and classifies them via LLM.
 * Designed to run from GitHub Actions on a cron schedule.
 *
 * Usage:
 *   node scripts/modules/inbox/assist-runner.js [--max-items N] [--dry-run]
 *
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-F
 * @module scripts/modules/inbox/assist-runner
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const CLASSIFICATION_CATEGORIES = ['bug', 'enhancement', 'question', 'noise'];

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { maxItems: 10, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-items' && args[i + 1]) {
      flags.maxItems = parseInt(args[i + 1], 10) || 10;
      i++;
    }
    if (args[i] === '--dry-run') {
      flags.dryRun = true;
    }
  }
  return flags;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[assist-runner] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

async function classifyItem(item) {
  // Heuristic classification based on title and category
  // LLM-based classification is handled by auto-triage.js (Child -D)
  const title = (item.title || '').toLowerCase();
  const category = (item.category || '').toLowerCase();

  let classification = 'question';
  let confidence = 0.60;

  if (category.includes('error') || category.includes('failure') || category.includes('ci_failure')) {
    classification = 'bug';
    confidence = 0.80;
  } else if (title.includes('fail') || title.includes('error') || title.includes('crash') || title.includes('broken')) {
    classification = 'bug';
    confidence = 0.75;
  } else if (title.includes('add') || title.includes('improve') || title.includes('enhance') || title.includes('feature')) {
    classification = 'enhancement';
    confidence = 0.70;
  } else if (title.includes('bypass') || title.includes('detection')) {
    classification = 'noise';
    confidence = 0.65;
  }

  return { classification, confidence };
}

async function run() {
  const flags = parseArgs();
  const supabase = getSupabaseClient();

  console.log('\n[assist-runner] Starting periodic assist');
  console.log(`  Max items: ${flags.maxItems}`);
  console.log(`  Dry run: ${flags.dryRun}`);
  console.log('');

  // Query untriaged items
  const { data: items, error } = await supabase
    .from('feedback')
    .select('id, title, description, category, severity, status, created_at')
    .eq('status', 'new')
    .is('ai_triage_classification', null)
    .order('created_at', { ascending: true })
    .limit(flags.maxItems);

  if (error) {
    console.error('[assist-runner] Query error:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('[assist-runner] No untriaged items found. Inbox is clean.');
    process.exit(0);
  }

  console.log(`[assist-runner] Found ${items.length} untriaged item(s)\n`);

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    const { classification, confidence } = await classifyItem(item);
    const truncTitle = (item.title || '').substring(0, 60);

    if (flags.dryRun) {
      console.log(`  [DRY-RUN] ${truncTitle} → ${classification} (${(confidence * 100).toFixed(0)}%)`);
      processed++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('feedback')
      .update({
        ai_triage_classification: classification,
        ai_triage_confidence: Math.round(confidence * 100),
        ai_triage_source: 'assist-runner',
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`  [ERROR] ${truncTitle}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`  [OK] ${truncTitle} → ${classification} (${(confidence * 100).toFixed(0)}%)`);
      processed++;
    }
  }

  console.log('\n[assist-runner] Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Mode: ${flags.dryRun ? 'dry-run (no writes)' : 'live'}`);
}

run().catch(err => {
  console.error('[assist-runner] Fatal:', err.message);
  process.exit(1);
});
