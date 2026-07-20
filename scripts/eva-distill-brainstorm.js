#!/usr/bin/env node
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
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const SOURCE_TABLES = { todoist: 'eva_todoist_intake', youtube: 'eva_youtube_intake' };

// SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-D (FR-2): hard batch ceiling.
// A scale-up over the ~429 unpromoted roadmap_wave_items must stay cost-bounded —
// at most MAX_BATCH distilled per invocation regardless of --top. SSOT constant.
export const MAX_BATCH = 50;

/** Clamp a requested batch size into [1, MAX_BATCH], coercing NaN/garbage to the default 20. */
export function clampBatch(topN) {
  return Math.min(MAX_BATCH, Math.max(1, Number(topN) || 20));
}

/**
 * Load the top-N wave items by refine_composite_score, newest-safe.
 * Fetches the scored set and sorts client-side (PostgREST JSONB ordering is unreliable),
 * applying NULLS LAST then taking the top N. The batch is clamped to <=MAX_BATCH (FR-2)
 * here — the shared DB-fetch chokepoint reached by both run() and main() — so the
 * programmatic run({topN}) path is bounded, not just the CLI arg parse.
 */
export async function loadTopWaveItems(supabase, topN = 20) {
  const n = clampBatch(topN);
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: roadmap_wave_items is unbounded
  // and the whole scored set must be collected before the client-side sort below (PostgREST
  // JSONB ordering is unreliable, per the doc comment above) — paginate to completion so the
  // top-N selection is computed over the FULL scored set, not a possibly-truncated page.
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items')
      .select('id, wave_id, source_type, source_id, title, metadata, item_disposition')
      .not('metadata->refine_composite_score', 'is', null)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) { throw new Error(`loadTopWaveItems: ${e.message}`); }
  const scored = (data || []).map((r) => ({
    ...r,
    refine_composite_score:
      typeof r.metadata?.refine_composite_score === 'number' ? r.metadata.refine_composite_score : null,
  }));
  // SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 (FR-3): make reconcile STANDING — a scored
  // item whose persisted reconcile disposition is a done-state (a completed SD covers it)
  // or already-institutionalized (an existing protocol/role duty absorbs it) does NOT
  // consume a novel-work review slot. It is NOT dropped: its metadata.refine_disposition
  // (with the section/SD pointer) stays on the row for chairman spot-check. FAIL-OPEN:
  // any item with no reconcile disposition, or an unrecognized one, still surfaces — never
  // fail-closed-suppress. `already_institutionalized` only reaches this metadata after the
  // enforceInstitutionDiscipline guard (>=85 confidence + verifiable section pointer).
  const RECONCILED_OUT = new Set(['already_done', 'already_institutionalized']);
  const eligible = scored.filter((r) => {
    const status = r.metadata?.refine_disposition?.status;
    return !RECONCILED_OUT.has(status);
  });
  eligible.sort((a, b) => (b.refine_composite_score ?? -1) - (a.refine_composite_score ?? -1));
  return eligible.slice(0, n);
}

/**
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-D (FR-1): disposition-coverage probe.
 * Standalone count_ratio over roadmap_wave_items: actively-dispositioned (item_disposition
 * <> 'pending') / total. NOT a VDR vision-ladder capability — the "Backlog distilled and
 * dispositioned" ladder label is already bound to sd_backlog_map and adding a new capability
 * without a matching vision_ladder_criteria row would break the gauge-coherence invariant.
 * Read-only. Returns { value, status, numerator, denominator, detail }.
 */
export async function dispositionCoverage(supabase) {
  const { count: denom, error: dErr } = await supabase
    .from('roadmap_wave_items')
    .select('id', { count: 'exact', head: true });
  if (dErr) return { value: null, status: 'unknown', numerator: 0, denominator: 0, detail: `denom error: ${dErr.message}` };
  const { count: numer, error: nErr } = await supabase
    .from('roadmap_wave_items')
    .select('id', { count: 'exact', head: true })
    .neq('item_disposition', 'pending');
  if (nErr) return { value: null, status: 'unknown', numerator: 0, denominator: denom || 0, detail: `numer error: ${nErr.message}` };
  if (!denom) return { value: null, status: 'unknown', numerator: 0, denominator: 0, detail: 'empty corpus (0 items)' };
  const value = (numer || 0) / denom;
  return {
    value,
    status: 'ok',
    numerator: numer || 0,
    denominator: denom,
    detail: `${numer || 0}/${denom} actively-dispositioned (item_disposition <> 'pending')`
  };
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

  // FR-1: read-only disposition-coverage probe (no distillation, no writes).
  if (args.includes('--coverage')) {
    const cov = await dispositionCoverage(supabase);
    console.log('\n── Brainstorm corpus disposition coverage ──');
    console.log(`   ${cov.detail}`);
    console.log(`   coverage: ${cov.value === null ? 'unknown' : (cov.value * 100).toFixed(2) + '%'} (status=${cov.status})`);
    return;
  }

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
