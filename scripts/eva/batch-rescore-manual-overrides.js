#!/usr/bin/env node
/**
 * Batch Rescore Manual-Override Vision Scores
 * SD: SD-MAN-FIX-VISION-MANUAL-OVERRIDE-AUDIT-001
 *
 * Queries eva_vision_scores for rows with created_by='manual-chairman-override',
 * runs organic vision scoring via programmatic Ollama fallback for each SD,
 * and archives the manual-override rows by patching rubric_snapshot.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { scoreSD } from './vision-scorer.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n🔄 Batch Rescore Manual-Override Vision Scores${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // Step 1: Query all manual-override rows
  const { data: manualRows, error } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, scored_at, rubric_snapshot')
    .eq('created_by', 'manual-chairman-override')
    .order('scored_at', { ascending: true });

  if (error) throw new Error(`Failed to query manual override rows: ${error.message}`);

  console.log(`Found ${manualRows.length} manual-override row(s):\n`);
  manualRows.forEach(r => console.log(`  • ${r.sd_id} (score: ${r.total_score}, id: ${r.id})`));
  console.log();

  const results = { success: [], failed: [], skipped: [] };

  for (const row of manualRows) {
    const sdKey = row.sd_id;
    console.log(`\n──────────────────────────────────────────`);
    console.log(`Rescoring: ${sdKey}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would run scoreSD for ${sdKey}`);
      results.skipped.push(sdKey);
      continue;
    }

    try {
      // Step 2: Run organic rescore via programmatic path (Ollama)
      const score = await scoreSD({
        sdKey,
        visionKey: 'VISION-EHG-L1-001',
        archKey: 'ARCH-EHG-L1-001',
      });

      console.log(`  ✅ Organic score: ${score.total_score}/100 (${score.action})`);
      console.log(`     Dimensions: ${Object.keys(score.dimension_scores || {}).length}`);
      results.success.push({ sdKey, score: score.total_score });

      // Step 3: Archive the manual-override row
      const updatedSnapshot = {
        ...(row.rubric_snapshot || {}),
        archived: true,
        replaced_by_organic_run: new Date().toISOString(),
        organic_score_id: score.score_id ?? null,
      };

      const { error: patchErr } = await supabase
        .from('eva_vision_scores')
        .update({ rubric_snapshot: updatedSnapshot })
        .eq('id', row.id);

      if (patchErr) {
        console.warn(`  ⚠️  Failed to archive row ${row.id}: ${patchErr.message}`);
      } else {
        console.log(`  📦 Archived manual-override row ${row.id}`);
      }
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      results.failed.push({ sdKey, error: err.message });
    }
  }

  // Step 4: Create issue_patterns entry (only on real run)
  if (!DRY_RUN && results.success.length > 0) {
    await createIssuePattern(manualRows.length);
  }

  // Summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`BATCH RESCORE COMPLETE`);
  console.log(`  ✅ Success: ${results.success.length}`);
  console.log(`  ❌ Failed:  ${results.failed.length}`);
  console.log(`  ⏭  Skipped: ${results.skipped.length}`);
  if (results.failed.length > 0) {
    console.log(`\nFailed SDs:`);
    results.failed.forEach(f => console.log(`  • ${f.sdKey}: ${f.error}`));
    process.exit(1);
  }
}

async function createIssuePattern(affectedCount) {
  const { error } = await supabase.from('issue_patterns').upsert({
    title: 'OpenAI vision scorer timeout causes manual-override scores',
    description: `During a session on 2026-02-19 (approx 03:00-13:10 UTC), OpenAI gpt-5.2 timed out repeatedly during vision scoring. The programmatic Ollama fallback was available but broken by a Windows path bug (new URL().pathname returns /C:/path, causing C:\\C:\\ double-prefix). ${affectedCount} SDs received shallow manual-override scores (1-5 generic dimensions) instead of 15-dimension organic scores.`,
    frequency: 'one-time-session',
    severity: 'medium',
    resolution: 'Fixed fileURLToPath bug in scripts/eva/vision-scorer.js line 302. Run batch-rescore-manual-overrides.js with USE_PROGRAMMATIC=true to regenerate organic scores.',
    prevention: 'Use fileURLToPath(new URL(..., import.meta.url)) for all ESM file paths on Windows. Check Ollama health before scoring sessions.',
    status: 'resolved',
  }, { onConflict: 'title', ignoreDuplicates: false });

  if (error) {
    console.warn(`  ⚠️  Failed to create issue_patterns entry: ${error.message}`);
  } else {
    console.log(`\n📝 Issue pattern recorded for OpenAI timeout incident`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
