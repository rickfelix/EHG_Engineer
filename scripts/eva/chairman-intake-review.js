#!/usr/bin/env node
/**
 * Chairman Intake Review
 *
 * Two modes:
 *   1. Auto-review (default / pipeline): Maps AI capture-intent to action-intent,
 *      stamps chairman_reviewed_at. High-confidence items proceed automatically.
 *   2. Interactive (--interactive): Emits REVIEW_ITEMS JSON for Claude Code
 *      AskUserQuestion consumption — chairman confirms or overrides each item.
 *
 * Taxonomy bridge (capture-intent → action-intent):
 *   idea     → build     (raw ideas become features)
 *   insight  → improve   (insights suggest enhancements)
 *   reference→ reference (direct mapping)
 *   question → research  (questions need investigation)
 *   value    → research  (values need strategic validation)
 *
 * Usage:
 *   node scripts/eva/chairman-intake-review.js                # Auto-review
 *   node scripts/eva/chairman-intake-review.js --interactive  # Emit for AskUserQuestion
 *   node scripts/eva/chairman-intake-review.js --skip-review  # Skip (for automated runs)
 *   node scripts/eva/chairman-intake-review.js --dry-run      # Preview without DB writes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const skipReview = args.includes('--skip-review');
const dryRun = args.includes('--dry-run');
const interactive = args.includes('--interactive');

const INTENT_OPTIONS = ['Build', 'Research', 'Reference', 'Improve'];

const INTENT_DESCRIPTIONS = {
  Build: 'Create a new feature or capability from this item',
  Research: 'Investigate further before deciding — needs brainstorm/vision SD',
  Reference: 'Store for future lookup only — exclude from wave clustering',
  Improve: 'Enhance or fix an existing feature based on this insight',
};

/**
 * Map AI capture-intent to chairman action-intent.
 * Capture-intent describes WHY the item was recorded.
 * Action-intent describes WHAT to do with it.
 */
const CAPTURE_TO_ACTION_MAP = {
  idea: 'build',
  insight: 'improve',
  reference: 'reference',
  question: 'research',
  value: 'research',
};

function mapCaptureToActionIntent(captureIntent) {
  return CAPTURE_TO_ACTION_MAP[captureIntent?.toLowerCase()] || 'research';
}

async function getUnreviewedItems() {
  const { data, error } = await supabase
    .from('eva_todoist_intake')
    .select('id, title, description, todoist_url, target_application, target_aspects, chairman_intent, enrichment_summary, classification_confidence, enrichment_status')
    .eq('enrichment_status', 'enriched')
    .is('chairman_reviewed_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching items:', error.message);
    return [];
  }
  return data || [];
}

function formatItemForReview(item, index, total) {
  const lines = [
    `## Item ${index + 1} of ${total}: ${item.title}`,
    '',
  ];

  if (item.todoist_url) lines.push(`**Source:** ${item.todoist_url}`);
  if (item.target_application) lines.push(`**Application:** ${item.target_application}`);
  if (item.target_aspects) {
    const aspects = Array.isArray(item.target_aspects) ? item.target_aspects.join(', ') : item.target_aspects;
    lines.push(`**Aspects:** ${aspects}`);
  }
  if (item.enrichment_summary) {
    lines.push('');
    lines.push(`**Enrichment Summary:** ${item.enrichment_summary}`);
  }
  if (item.classification_confidence) {
    lines.push(`**AI Confidence:** ${Math.round(item.classification_confidence * 100)}%`);
  }
  if (item.description) {
    const desc = item.description.length > 200 ? item.description.substring(0, 200) + '...' : item.description;
    lines.push('');
    lines.push(`**Description:** ${desc}`);
  }

  return lines.join('\n');
}

function buildIntentOptions(aiRecommendation) {
  const recommended = aiRecommendation || 'Research';
  const normalizedRec = INTENT_OPTIONS.find(
    o => o.toLowerCase() === recommended.toLowerCase()
  ) || 'Research';

  const ordered = [normalizedRec, ...INTENT_OPTIONS.filter(o => o !== normalizedRec)];

  return ordered.map((intent, i) => ({
    label: i === 0 ? `${intent} (AI Recommended)` : intent,
    description: INTENT_DESCRIPTIONS[intent] || intent,
  }));
}

function inferAIRecommendation(item) {
  if (item.chairman_intent) return item.chairman_intent;

  const aspects = Array.isArray(item.target_aspects) ? item.target_aspects : [];
  if (aspects.includes('reference') || aspects.includes('documentation')) return 'Reference';
  if (aspects.includes('bug') || aspects.includes('fix')) return 'Improve';
  if (aspects.includes('feature') || aspects.includes('new')) return 'Build';
  return 'Research';
}

async function storeReviewDecision(itemId, intent, reviewMethod = 'auto') {
  if (dryRun) {
    console.log(`  [DRY RUN] Would store intent=${intent} (${reviewMethod}) for item ${itemId}`);
    return true;
  }

  const { error } = await supabase
    .from('eva_todoist_intake')
    .update({
      chairman_intent: intent.toLowerCase(),
      chairman_reviewed_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error(`  Error storing decision for ${itemId}:`, error.message);
    return false;
  }
  return true;
}

function buildSummaryTable(decisions) {
  const counts = {};
  for (const d of decisions) {
    counts[d.intent] = (counts[d.intent] || 0) + 1;
  }

  const lines = [
    '',
    '  Review Summary',
    '',
    '  | Intent    | Count |',
    '  |-----------|-------|',
  ];

  for (const intent of INTENT_OPTIONS) {
    const key = intent.toLowerCase();
    if (counts[key]) {
      lines.push(`  | ${intent.padEnd(9)} | ${String(counts[key]).padStart(5)} |`);
    }
  }

  lines.push(`  | ${'Total'.padEnd(9)} | ${String(decisions.length).padStart(5)} |`);
  lines.push('');

  return lines.join('\n');
}

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  CHAIRMAN INTAKE REVIEW');
  console.log('══════════════════════════════════════════════════════');

  if (skipReview) {
    console.log('  --skip-review flag set. Bypassing chairman review.');
    console.log('══════════════════════════════════════════════════════');
    process.exit(0);
  }

  const items = await getUnreviewedItems();

  if (items.length === 0) {
    console.log('  No unreviewed enriched items found. Skipping review step.');
    console.log('══════════════════════════════════════════════════════');
    process.exit(0);
  }

  console.log(`  ${items.length} item(s) ready for review`);
  if (dryRun) console.log('  [DRY RUN MODE - no DB writes]');

  // --- Interactive mode: emit for AskUserQuestion consumption ---
  if (interactive) {
    console.log('  Mode: INTERACTIVE (emit for AskUserQuestion)\n');

    const reviewData = items.map((item, i) => ({
      itemId: item.id,
      markdown: formatItemForReview(item, i, items.length),
      options: buildIntentOptions(mapCaptureToActionIntent(item.chairman_intent)),
      captureIntent: item.chairman_intent,
      mappedActionIntent: mapCaptureToActionIntent(item.chairman_intent),
      title: item.title,
    }));

    console.log('REVIEW_ITEMS_START');
    console.log(JSON.stringify(reviewData));
    console.log('REVIEW_ITEMS_END');
    console.log(`REVIEW_COUNT=${items.length}`);
    return;
  }

  // --- Auto-review mode: map capture-intent → action-intent and stamp ---
  console.log('  Mode: AUTO (mapping capture-intent → action-intent)\n');
  console.log('  Taxonomy bridge:');
  console.log('    idea     → build     | insight  → improve');
  console.log('    reference→ reference | question → research');
  console.log('    value    → research\n');

  const decisions = [];
  let stored = 0;
  let failed = 0;

  for (const item of items) {
    const captureIntent = item.chairman_intent || 'research';
    const actionIntent = mapCaptureToActionIntent(captureIntent);

    const ok = await storeReviewDecision(item.id, actionIntent, 'auto');
    if (ok) {
      decisions.push({ intent: actionIntent, captureIntent });
      stored++;
    } else {
      failed++;
    }
  }

  console.log(`  Reviewed: ${stored} items (${failed} errors)`);
  console.log(buildSummaryTable(decisions));
}

// Export for programmatic use
export {
  getUnreviewedItems,
  formatItemForReview,
  buildIntentOptions,
  inferAIRecommendation,
  mapCaptureToActionIntent,
  storeReviewDecision,
  buildSummaryTable,
  INTENT_OPTIONS,
  CAPTURE_TO_ACTION_MAP,
};

main().catch(err => {
  console.error('Chairman review error:', err.message);
  process.exit(1);
});
