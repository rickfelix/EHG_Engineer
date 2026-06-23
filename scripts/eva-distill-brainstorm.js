#!/usr/bin/env node
// @wire-check-exempt: operator/chairman-invoked CLI (node scripts/eva-distill-brainstorm.js), the
// chairman quality-validation entry point for FR-4. Defaults to --dry-run (zero DB writes); imports
// the distiller core (lib/integrations/distill-brainstorm.js) and the idx-0 queue writer. Unit-tested
// (tests/unit/eva/distill-brainstorm.test.js + eva-distill-brainstorm-cli.test.js).
/**
 * eva-distill-brainstorm.js — chairman-validation CLI for the brainstorm distiller.
 *
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-C (FR-2/FR-4).
 *
 * Loads the top-20 roadmap_wave_items by metadata.refine_composite_score (DESC, NULLS LAST),
 * enriches each from its source intake table (mirrors scripts/eva-intake-refine.js), distills each
 * into a structured SD payload, and DEFAULTS to --dry-run: a temp-file + console report with ZERO
 * DB writes, so the chairman can validate distillation quality BEFORE any scale-up.
 *
 * Only with --apply does it enqueue each distilled payload to the chairman review queue via the
 * child idx-0 writer (lib/eva/consultant/distillation-queue-writer.js enqueueDistilledCandidate).
 * It NEVER mints an SD — promotion to the belt is gated separately by the disposition gate (idx-1).
 *
 * Usage:
 *   node scripts/eva-distill-brainstorm.js            # dry-run (default), top 20, no DB writes
 *   node scripts/eva-distill-brainstorm.js --apply    # enqueue distilled candidates to the review queue
 *   node scripts/eva-distill-brainstorm.js --top 10   # limit
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { distillItem, toQueueCandidate } from '../lib/integrations/distill-brainstorm.js';
import { enqueueDistilledCandidate } from '../lib/eva/consultant/distillation-queue-writer.js';

dotenv.config();

const SOURCE_TABLES = { todoist: 'eva_todoist_intake', youtube: 'eva_youtube_intake' };

/**
 * Load the top-N wave items by refine_composite_score, newest-safe.
 * Fetches the scored set and sorts client-side (PostgREST JSONB ordering is unreliable),
 * applying NULLS LAST then taking the top N.
 */
export async function loadTopWaveItems(supabase, topN = 20) {
  const { data, error } = await supabase
    .from('roadmap_wave_items')
    .select('id, wave_id, source_type, source_id, title, metadata, item_disposition')
    .not('metadata->refine_composite_score', 'is', null);
  if (error) throw new Error(`loadTopWaveItems: ${error.message}`);
  const scored = (data || []).map((r) => ({
    ...r,
    refine_composite_score:
      typeof r.metadata?.refine_composite_score === 'number' ? r.metadata.refine_composite_score : null,
  }));
  scored.sort((a, b) => (b.refine_composite_score ?? -1) - (a.refine_composite_score ?? -1));
  return scored.slice(0, topN);
}

/** Enrich a wave item from its source intake table (mirrors eva-intake-refine.js). */
export async function enrichWaveItem(supabase, item) {
  let sourceData = null;
  const table = SOURCE_TABLES[item.source_type];
  if (table && item.source_id) {
    const { data } = await supabase
      .from(table)
      .select('title, description, target_application, target_aspects, chairman_intent')
      .eq('id', item.source_id)
      .maybeSingle();
    sourceData = data;
  }
  return {
    wave_item_id: item.id,
    title: sourceData?.title || item.title || '(untitled)',
    description: sourceData?.description || '',
    target_application: sourceData?.target_application || '',
    target_aspects: sourceData?.target_aspects || [],
    chairman_intent: sourceData?.chairman_intent || '',
    refine_composite_score: item.refine_composite_score,
  };
}

export async function run({ supabase, apply = false, topN = 20, client = undefined } = {}) {
  const items = await loadTopWaveItems(supabase, topN);
  const results = [];
  for (const item of items) {
    const enriched = await enrichWaveItem(supabase, item);
    const { payload, method } = await distillItem(enriched, { client });
    let enqueued = false;
    if (apply) {
      const candidate = toQueueCandidate(payload, enriched.wave_item_id, enriched.refine_composite_score);
      await enqueueDistilledCandidate(supabase, candidate); // surfaces errors
      enqueued = true;
    }
    results.push({
      wave_item_id: enriched.wave_item_id,
      refine_composite_score: enriched.refine_composite_score,
      method,
      payload,
      enqueued,
    });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const topIdx = args.indexOf('--top');
  const topN = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : 20;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  console.log(`\n── Brainstorm Distiller ${apply ? '(APPLY — writing to chairman review queue)' : '(DRY-RUN — zero DB writes)'} ──`);
  console.log(`   top ${topN} by refine_composite_score\n`);

  const results = await run({ supabase, apply, topN });

  const aiCount = results.filter((r) => r.method === 'ai').length;
  for (const r of results) {
    console.log(`  [${r.method}] score=${r.refine_composite_score ?? '—'} :: ${r.payload.title} (${r.payload.sd_type}/${r.payload.confidence_tier})${r.enqueued ? ' [enqueued]' : ''}`);
  }
  console.log(`\n  ${results.length} distilled (${aiCount} AI / ${results.length - aiCount} keyword).`);

  if (!apply) {
    const out = join(tmpdir(), `distill-brainstorm-dryrun-${results.length}.json`);
    writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`  DRY-RUN report: ${out}`);
    console.log('  No DB writes. Re-run with --apply to enqueue to the chairman review queue.');
  } else {
    console.log(`  Enqueued ${results.filter((r) => r.enqueued).length} candidate(s) to the chairman review queue.`);
  }
}

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('eva-distill-brainstorm failed:', err.message);
    process.exit(1);
  });
}
