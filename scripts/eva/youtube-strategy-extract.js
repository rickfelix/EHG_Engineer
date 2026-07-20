#!/usr/bin/env node
/**
 * YouTube Strategy Extraction orchestrator
 * SD: SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001 (FR-3 + FR-4)
 *
 * Distills the For-Processing YouTube strategy videos into reusable frameworks:
 *   1. Read pending candidates from eva_youtube_intake (the For-Processing sync).
 *   2. Analyze each (native Gemini, falling back to a transcript for long videos
 *      that abort — lib/integrations/youtube/transcript-fallback.js).
 *   3. 4-persona score (lib/integrations/refine-score.js), categorize, and dedup
 *      against existing SDs (lib/integrations/youtube/strategy-extract-core.js).
 *   4. Maintain a JSON processing ledger (memory/youtube-strategy-ledger.json).
 *   5. Append NOVEL frameworks to docs/reference/youtube-strategy-frameworks.md
 *      and route ENHANCEMENT-worthy ones for chairman/coordinator review via the
 *      durable feedback channel (lib/governance/emit-feedback.js) — NO auto-SD.
 *
 * Disposal (moving processed videos to the Processed playlist) is a SEPARATE,
 * explicitly-gated step (FR-5) and is intentionally NOT part of this default run.
 *
 * Usage:
 *   node scripts/eva/youtube-strategy-extract.js [--limit N] [--dry-run] [--verbose] [--lang en]
 *   npm run youtube:extract -- --limit 3 --dry-run
 *
 *   --dry-run : read-only — analyze + print the summary, write NOTHING (no
 *               ledger, no reference file, no routing rows). Safe inspection.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { analyzeWithFallback } from '../../lib/integrations/youtube/transcript-fallback.js';
import { score } from '../../lib/integrations/refine-score.js';
import {
  runExtraction,
  cleanLedgerEntry,
  isEnhancementWorthy,
  disposeEntries,
} from '../../lib/integrations/youtube/strategy-extract-core.js';
import { emitFeedback } from '../../lib/governance/emit-feedback.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: fetchCandidates has no cap
// when --limit is omitted, and fetchSDList's .limit(3000) exceeds the PostgREST 1000-row
// cap and was silently truncating the SD dedup list to 1000 (real bug: fixed via maxRows).
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const SD_KEY = 'SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001';
const LEDGER_PATH = path.resolve(process.cwd(), 'memory', 'youtube-strategy-ledger.json');
const REFERENCE_PATH = path.resolve(process.cwd(), 'docs', 'reference', 'youtube-strategy-frameworks.md');

// A non-positive or non-numeric --limit means "no limit"? No — that silently
// drains the whole backlog on a typo. Treat only a finite positive integer as a
// real limit; anything else (0, NaN, negative) -> null = no limit only when the
// flag was absent. Here an explicit bad value collapses to null but is logged by
// the caller path; positive-int is the sole "limited" case.
function toPositiveLimit(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function parseArgs(argv = []) {
  const a = { limit: null, dryRun: false, dispose: false, verbose: false, lang: 'en' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--limit') a.limit = toPositiveLimit(argv[++i]);
    else if (t.startsWith('--limit=')) a.limit = toPositiveLimit(t.split('=')[1]);
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '--dispose') a.dispose = true;
    else if (t === '--verbose' || t === '-v') a.verbose = true;
    else if (t === '--lang') a.lang = argv[++i] || 'en';
    else if (t.startsWith('--lang=')) a.lang = t.split('=')[1] || 'en';
  }
  return a;
}

function loadLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    return raw && typeof raw === 'object' && raw.videos ? raw : { videos: {}, updated_at: null };
  } catch {
    return { videos: {}, updated_at: null };
  }
}

function saveLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

async function fetchCandidates(supabase, limit) {
  // FIFO by intake order — drains the backlog representatively. (Most pending
  // videos are short enough for native Gemini; only a handful of ultra-long ones
  // need the transcript fallback, which is environmentally limited — see
  // transcript-fallback.js header. Ordering longest-first would front-load those
  // failures and waste a --limit sample on them.)
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('eva_youtube_intake')
      .select('id, youtube_video_id, youtube_playlist_item_id, title, channel_name, duration_seconds, chairman_intent, chairman_notes, target_application, business_function, status, processed_at')
      .eq('status', 'pending')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }), // unique tiebreaker (FR-6)
      { maxRows: limit || Infinity }); // preserves the original --limit sampling cap
  } catch (error) {
    throw new Error(`fetch candidates: ${error.message}`);
  }
  return data.filter((r) => r.youtube_video_id);
}

async function fetchSDList(supabase) {
  // BUG FIX (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9): .limit(3000)
  // exceeds the PostgREST 1000-row cap -- the server silently clamped the response to
  // 1000 rows regardless of the requested 3000, degrading dedup coverage. maxRows
  // preserves the original 3000-row sampling intent via real pagination.
  try {
    return await fetchAllPaginated(
      () => supabase.from('strategic_directives_v2').select('sd_key, title').order('id', { ascending: true }),
      { maxRows: 3000 }
    );
  } catch (error) {
    console.warn(`  (dedup degraded: could not load SD list: ${error.message})`);
    return [];
  }
}

function appendReferenceLibrary(entries) {
  let novel = entries.filter((e) => e.analysis_status === 'ok' && e.dedup_status === 'novel' && e._summary);
  if (novel.length === 0) return 0;
  // Idempotent append: skip any framework whose video already appears in the file
  // (re-runs must not duplicate committed reference blocks).
  let existing = '';
  try { existing = fs.readFileSync(REFERENCE_PATH, 'utf8'); } catch { /* fresh file */ }
  novel = novel.filter((e) => !existing.includes(`youtu.be/${e.video_id}`));
  if (novel.length === 0) return 0;
  const fresh = existing === '';
  const header = fresh
    ? '# YouTube Strategy Frameworks — extracted reference library\n\nNovel frameworks distilled from the For-Processing strategy playlist by `scripts/eva/youtube-strategy-extract.js` (SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001). Duplicates of existing SDs/capabilities are excluded.\n'
    : '';
  const blocks = novel
    .map((e) => `\n## ${e.title}\n- video: https://youtu.be/${e.video_id}\n- category: ${e.category} | score: ${e.composite_score ?? 'n/a'} | recommendation: ${e.recommendation ?? 'n/a'}\n\n${e._summary}\n`)
    .join('');
  fs.mkdirSync(path.dirname(REFERENCE_PATH), { recursive: true });
  fs.appendFileSync(REFERENCE_PATH, header + blocks);
  return novel.length;
}

async function routeEnhancements(supabase, entries, verbose) {
  const worthy = entries.filter(isEnhancementWorthy);
  let routed = 0;
  for (const e of worthy) {
    try {
      await emitFeedback({
        supabase,
        title: `YouTube enhancement framework: ${e.title}`.slice(0, 200),
        description: `Extracted from https://youtu.be/${e.video_id} (composite ${e.composite_score}, category ${e.category}, novel). ${(e._summary || '').slice(0, 600)} — routed for chairman/coordinator review; no SD auto-created.`,
        type: 'enhancement',
        category: 'completion_flag',
        severity: 'low',
        // 'youtube_intake' is the only youtube value allowed by the
        // feedback_source_type_check CHECK constraint; the extraction provenance
        // lives in metadata.source instead (verified against live DB).
        source_type: 'youtube_intake',
        sd_id: SD_KEY,
        metadata: { source: 'youtube_strategy_extraction', video_id: e.video_id, composite_score: e.composite_score, category: e.category },
        dedup_key: `youtube-framework-${e.video_id}`,
      });
      routed++;
    } catch (err) {
      if (verbose) console.error(`  route failed for ${e.video_id}: ${err.message}`);
    }
  }
  return routed;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const supabase = createSupabaseServiceClient();

  console.log(`\n🎬 YouTube Strategy Extraction (${opts.dryRun ? 'DRY-RUN' : 'live'}${opts.limit ? `, limit ${opts.limit}` : ''})`);

  const candidates = await fetchCandidates(supabase, opts.limit);
  console.log(`   Candidates (pending, unprocessed): ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('   Nothing to process. Done.');
    return { processed: 0 };
  }

  const sdList = await fetchSDList(supabase);
  const { entries, summary } = await runExtraction(candidates, { analyzeWithFallback, score, sdList }, { verbose: opts.verbose });

  console.log('\n   Results:');
  console.log(`     status:        ${JSON.stringify(summary.by_status)}`);
  console.log(`     method:        ${JSON.stringify(summary.by_method)}`);
  console.log(`     category:      ${JSON.stringify(summary.by_category)}`);
  console.log(`     dedup:         ${JSON.stringify(summary.by_dedup)}`);
  console.log(`     recommendation:${JSON.stringify(summary.by_recommendation)}`);

  if (opts.dryRun) {
    if (opts.dispose) console.log('   (--dispose ignored under --dry-run — no playlist mutation.)');
    console.log('\n   DRY-RUN: no ledger / reference / routing / disposal writes. Done.');
    return { processed: entries.length, summary, dryRun: true };
  }

  // Persist ledger (merge by video_id; strip working fields). Preserve a prior
  // disposed:true so re-processing a video never resets its disposal history.
  const ledger = loadLedger();
  for (const e of entries) {
    const prior = ledger.videos[e.video_id];
    const clean = cleanLedgerEntry(e);
    if (prior && prior.disposed) clean.disposed = true;
    ledger.videos[e.video_id] = clean;
  }
  ledger.updated_at = new Date().toISOString();
  saveLedger(ledger);

  const refCount = appendReferenceLibrary(entries);
  const routed = await routeEnhancements(supabase, entries, opts.verbose);

  console.log(`\n   Ledger updated: ${LEDGER_PATH}`);
  console.log(`   Novel frameworks -> reference library: ${refCount}`);
  console.log(`   Enhancement-worthy routed to chairman/coordinator: ${routed}`);

  // FR-5: disposal (outward-facing playlist mutation) is OPT-IN via --dispose and
  // only ever moves successfully-extracted videos — failures stay in For-Processing.
  let disposed = 0;
  if (opts.dispose) {
    console.log('\n   --dispose: moving successfully-extracted videos For-Processing -> Processed...');
    let youtube = null;
    try {
      const { getAuthenticatedClient } = await import('../../lib/integrations/youtube/oauth-manager.js');
      const { google } = await import('googleapis');
      youtube = google.youtube({ version: 'v3', auth: await getAuthenticatedClient() });
    } catch (e) {
      console.log(`   disposal skipped (not authenticated): ${e.message}`);
    }
    if (youtube) {
      const disp = await disposeEntries(entries, { youtube, supabase, verbose: opts.verbose });
      for (const vid of disp.disposed_ids) if (ledger.videos[vid]) ledger.videos[vid].disposed = true;
      saveLedger(ledger);
      disposed = disp.moved;
      console.log(`   Disposed (-> Processed): ${disp.moved}${disp.errors.length ? `, errors: ${disp.errors.length}` : ''}`);
    }
  } else {
    console.log('   (Disposal NOT run — pass --dispose to move successfully-extracted videos to Processed.)');
  }
  return { processed: entries.length, summary, refCount, routed, disposed };
}

if (isMainModule(import.meta.url)) {
  main().then(() => process.exit(0)).catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

export default { main, parseArgs };
