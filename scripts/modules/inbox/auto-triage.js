#!/usr/bin/env node

/**
 * Auto-Triage Feedback Items via LLM Classification
 *
 * Populates ai_triage_classification, ai_triage_confidence, ai_triage_source
 * on feedback table rows with status='new' and no existing classification.
 *
 * Categories: bug, enhancement, question, noise
 * Idempotent: skips already-classified items.
 *
 * Usage:
 *   node scripts/modules/inbox/auto-triage.js [--dry-run] [--max-items N]
 *
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-D
 * @module scripts/modules/inbox/auto-triage
 */

import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../../../lib/llm/client-factory.js';
import 'dotenv/config';

const VALID_CATEGORIES = ['bug', 'enhancement', 'question', 'noise'];
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { maxItems: 20, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-items' && args[i + 1]) {
      flags.maxItems = parseInt(args[i + 1], 10) || 20;
      i++;
    }
    if (args[i] === '--dry-run') flags.dryRun = true;
  }
  return flags;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[auto-triage] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

const SYSTEM_PROMPT = `You are a feedback triage classifier. Classify the feedback item into exactly one category.

Categories:
- bug: Something is broken, failing, erroring, or producing wrong results
- enhancement: A request for new functionality, improvement, or optimization
- question: A question about how something works, or a request for clarification
- noise: Duplicate, irrelevant, spam, or already-resolved items

Respond with ONLY a JSON object: {"classification": "<category>", "confidence": <0.0-1.0>}
Do not include any other text.`;

async function classifyWithLLM(item) {
  try {
    const client = getLLMClient({ purpose: 'classification' });
    const userPrompt = [
      `Title: ${item.title || 'No title'}`,
      `Category: ${item.category || 'unknown'}`,
      `Severity: ${item.severity || 'unknown'}`,
      `Description: ${(item.description || '').substring(0, 300)}`,
    ].join('\n');

    const result = await client.complete(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 100,
      temperature: 0,
    });

    const text = typeof result === 'string' ? result : result?.content || result?.text || '';
    const match = text.match(/\{[^}]+\}/);
    if (!match) return { classification: 'question', confidence: 0.40 };

    const parsed = JSON.parse(match[0]);
    const classification = VALID_CATEGORIES.includes(parsed.classification)
      ? parsed.classification
      : 'question';
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.50));

    return { classification, confidence };
  } catch (err) {
    console.warn(`  [WARN] LLM classification failed: ${err.message}`);
    return heuristicClassify(item);
  }
}

function heuristicClassify(item) {
  const title = (item.title || '').toLowerCase();
  const category = (item.category || '').toLowerCase();

  if (category.includes('error') || category.includes('failure') || category.includes('ci_failure')) {
    return { classification: 'bug', confidence: 0.75 };
  }
  if (title.includes('fail') || title.includes('error') || title.includes('crash')) {
    return { classification: 'bug', confidence: 0.70 };
  }
  if (title.includes('add') || title.includes('improve') || title.includes('enhance')) {
    return { classification: 'enhancement', confidence: 0.65 };
  }
  return { classification: 'question', confidence: 0.50 };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const flags = parseArgs();
  const supabase = getSupabase();

  console.log('\n[auto-triage] Starting AI classification');
  console.log(`  Max items: ${flags.maxItems}`);
  console.log(`  Dry run: ${flags.dryRun}\n`);

  const { data: items, error } = await supabase
    .from('feedback')
    .select('id, title, description, category, severity, status, created_at')
    .eq('status', 'new')
    .is('ai_triage_classification', null)
    .order('created_at', { ascending: true })
    .limit(flags.maxItems);

  if (error) {
    console.error('[auto-triage] Query error:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('[auto-triage] No untriaged items found.');
    process.exit(0);
  }

  console.log(`[auto-triage] Found ${items.length} item(s) to classify\n`);

  let processed = 0;
  let errors = 0;
  let totalConfidence = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { classification, confidence } = await classifyWithLLM(item);
    const truncTitle = (item.title || '').substring(0, 55);
    totalConfidence += confidence;

    if (flags.dryRun) {
      console.log(`  [DRY-RUN] ${truncTitle} → ${classification} (${(confidence * 100).toFixed(0)}%)`);
      processed++;
    } else {
      const { error: updateError } = await supabase
        .from('feedback')
        .update({
          ai_triage_classification: classification,
          ai_triage_confidence: Math.round(confidence * 100),
          ai_triage_source: 'auto-triage-llm',
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

    // Rate limit between batches
    if ((i + 1) % BATCH_SIZE === 0 && i < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const avgConfidence = processed > 0 ? (totalConfidence / (processed + errors)) : 0;

  console.log('\n[auto-triage] Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`);
  console.log('  Target: >= 70%');
  console.log(`  Mode: ${flags.dryRun ? 'dry-run' : 'live'}`);

  if (avgConfidence < 0.70 && !flags.dryRun) {
    console.warn('\n  ⚠️  Average confidence below 70% target. Review classifications.');
  }
}

run().catch(err => {
  console.error('[auto-triage] Fatal:', err.message);
  process.exit(1);
});
