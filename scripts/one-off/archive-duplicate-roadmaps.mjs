/**
 * One-time archive of 2 pre-guard duplicate draft "EVA Intake Roadmap" rows.
 * SD-LEO-INFRA-ROADMAP-DUPLICATE-CLEANUP-001.
 *
 * Chairman-confirmed 2026-07-17: the LEO Roadmap (3aa2f3e2) is the sole
 * plan-of-record. These 2 rows are distill-pipeline artifacts created BEFORE
 * the now-shipped single-writer guard (SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001).
 * Verified (VALIDATION sub-agent, LEAD-TO-PLAN pass): all 1080 roadmap_wave_items
 * under these 2 roadmaps are pure youtube/todoist intake-table references with
 * zero unique authored content -- safe to archive without migrating anything.
 *
 * Defaults to dry-run (prints the plan, makes ZERO writes). Requires --apply to
 * write. Hardcoded id allowlist (never a dynamic title= match, so a future
 * unrelated row titled "EVA Intake Roadmap" can never be caught by accident).
 * Status update only -- never a DELETE -- so the change is reversible.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const TARGET_IDS = ['a89b078b-836c-437f-9c40-09fb6b23a41a', '8ffa7fdf-5d67-42a7-b135-2f7200fe9da0'];
const LEO_ROADMAP_ID = '3aa2f3e2-75fa-4fc8-a17e-44d553b86674';

async function fetchTargetWaveIds(supabase) {
  const { data, error } = await supabase.from('roadmap_waves').select('id').in('roadmap_id', TARGET_IDS);
  if (error) throw new Error(`Failed to fetch target wave ids: ${error.message}`);
  return (data || []).map((r) => r.id);
}

/**
 * FR-3: fail-closed precondition -- abort if any external referrer exists.
 * @returns {Promise<{safe: boolean, reasons: string[]}>}
 */
export async function checkReferrers(supabase, waveIds) {
  const reasons = [];

  const { data: snapshots, error: snapError } = await supabase
    .from('roadmap_baseline_snapshots')
    .select('id')
    .in('roadmap_id', TARGET_IDS);
  if (snapError) throw new Error(`roadmap_baseline_snapshots check failed: ${snapError.message}`);
  if (snapshots && snapshots.length > 0) {
    reasons.push(`${snapshots.length} roadmap_baseline_snapshots row(s) reference a target roadmap id`);
  }

  if (waveIds.length > 0) {
    const { data: loops, error: loopError } = await supabase
      .from('loop_registry')
      .select('id')
      .in('roadmap_wave_id', waveIds);
    if (loopError) throw new Error(`loop_registry check failed: ${loopError.message}`);
    if (loops && loops.length > 0) {
      reasons.push(`${loops.length} loop_registry row(s) reference a target wave id`);
    }
  }

  // A JSONB-text ilike filter isn't reliably expressible through PostgREST's column-cast
  // syntax via supabase-js, so pull sd_key+metadata and substring-search client-side --
  // strategic_directives_v2 is a bounded, low-thousands table, so this is cheap.
  const { data: allSds, error: sdError } = await supabase.from('strategic_directives_v2').select('sd_key, metadata');
  if (sdError) throw new Error(`strategic_directives_v2 metadata check failed: ${sdError.message}`);
  for (const id of TARGET_IDS) {
    const matches = (allSds || []).filter((sd) => sd.metadata && JSON.stringify(sd.metadata).includes(id));
    if (matches.length > 0) {
      reasons.push(`${matches.length} strategic_directives_v2 row(s) reference target id ${id} in metadata: ${matches.map((m) => m.sd_key).join(', ')}`);
    }
  }

  return { safe: reasons.length === 0, reasons };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: before, error: beforeError } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, vision_key, created_at')
    .order('created_at');
  if (beforeError) {
    console.error('Failed to load strategic_roadmaps:', beforeError.message);
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Roadmap duplicate cleanup (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log('\n--- BEFORE ---');
  for (const row of before) console.log(`  ${row.id}  ${row.status.padEnd(10)}  ${row.title}`);

  const waveIds = await fetchTargetWaveIds(supabase);
  const { safe, reasons } = await checkReferrers(supabase, waveIds);
  if (!safe) {
    console.log('\n[ABORT] External referrer(s) found -- making ZERO writes:');
    for (const r of reasons) console.log(`  - ${r}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n[OK] No external referrers found (roadmap_baseline_snapshots, loop_registry, strategic_directives_v2.metadata all clear).');

  if (!apply) {
    console.log('\n[DRY-RUN] Would archive:', TARGET_IDS.join(', '));
    console.log('[DRY-RUN] No writes made. Re-run with --apply to write.');
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from('strategic_roadmaps')
    .update({ status: 'archived' })
    .in('id', TARGET_IDS)
    .select('id, status');
  if (updateError) {
    console.error('Update failed:', updateError.message);
    process.exitCode = 1;
    return;
  }
  console.log('\n[APPLIED]', JSON.stringify(updated));

  const { count: activeCount, error: countError } = await supabase
    .from('strategic_roadmaps')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (countError) {
    console.error('Post-archive verification query failed:', countError.message);
    process.exitCode = 1;
    return;
  }
  console.log(`\n[VERIFY] active count = ${activeCount} (expected 1, id=${LEO_ROADMAP_ID})`);
  if (activeCount !== 1) {
    console.error('[VERIFY FAILED] Expected exactly 1 active roadmap.');
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
