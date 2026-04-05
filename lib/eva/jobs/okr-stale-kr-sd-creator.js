/**
 * OKR Stale KR → Auto-SD Creator
 * SD-LEO-INFRA-OKR-PIPELINE-AUTOMATION-001 Phase 2
 *
 * Detects stale KRs (0% progress, no active aligned SDs, older than threshold)
 * and creates DRAFT SDs to address them. Rate-limited to 1 SD per KR per cycle.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createSupabaseServiceClient } from '../../supabase-client.js';

const DEFAULT_STALENESS_DAYS = 30;
const MAX_SDS_PER_CYCLE = 5;

/**
 * Detect stale KRs that have no active aligned SDs.
 * @param {Object} supabase - Supabase client
 * @param {number} stalenessDays - Minimum age in days before a KR is considered stale
 * @returns {Promise<Array>} Stale KRs with objective context
 */
export async function detectStaleKRs(supabase, stalenessDays = DEFAULT_STALENESS_DAYS) {
  const cutoff = new Date(Date.now() - stalenessDays * 24 * 60 * 60 * 1000).toISOString();

  // Get all active KRs at 0% progress
  const { data: krs, error } = await supabase
    .from('key_results')
    .select(`
      id, code, title, baseline_value, current_value, target_value, unit, direction, status,
      objectives!inner(id, code, title, is_active)
    `)
    .eq('is_active', true)
    .eq('objectives.is_active', true)
    .lt('created_at', cutoff);

  if (error || !krs) {
    console.error('[stale-kr] Failed to load KRs:', error?.message);
    return [];
  }

  // Filter to KRs with 0% progress (current = baseline)
  const zeroProgress = krs.filter(kr => {
    if (kr.current_value == null || kr.baseline_value == null) return false;
    return String(kr.current_value) === String(kr.baseline_value);
  });

  if (zeroProgress.length === 0) return [];

  // Check which KRs already have active aligned SDs
  const krIds = zeroProgress.map(kr => kr.id);
  const { data: alignments } = await supabase
    .from('sd_key_result_alignment')
    .select('key_result_id, sd_id, strategic_directives_v2!inner(status)')
    .in('key_result_id', krIds);

  const activeAlignedKRs = new Set();
  if (alignments) {
    for (const a of alignments) {
      const status = a.strategic_directives_v2?.status;
      if (status && !['completed', 'cancelled'].includes(status)) {
        activeAlignedKRs.add(a.key_result_id);
      }
    }
  }

  // Return KRs with no active aligned SDs
  const stale = zeroProgress.filter(kr => !activeAlignedKRs.has(kr.id));

  // Pre-flight completeness check: require non-null target, baseline, unit
  return stale.filter(kr =>
    kr.target_value != null && kr.baseline_value != null && kr.unit != null
  );
}

/**
 * Check if an SD was already auto-created for this KR in the current cycle.
 * @param {Object} supabase - Supabase client
 * @param {string} krCode - KR code to check
 * @returns {Promise<boolean>} True if rate limit hit
 */
async function isRateLimited(supabase, krCode) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .ilike('title', `%${krCode}%`)
    .gte('created_at', thirtyDaysAgo)
    .limit(1);

  return data && data.length > 0;
}

/**
 * Create a DRAFT SD from a stale KR.
 * @param {Object} supabase - Supabase client
 * @param {Object} kr - Stale KR object with objective context
 * @param {boolean} dryRun - If true, report but don't create
 * @returns {Promise<Object|null>} Created SD or null
 */
async function createSDFromStaleKR(supabase, kr, dryRun = false) {
  const sdTitle = `Address stale KR: ${kr.code} — ${kr.title}`;
  const objective = kr.objectives;

  // Generate unique SD key from KR code
  const semantic = kr.code.replace(/[^A-Z0-9-]/gi, '-').toUpperCase();
  const sdKey = `SD-OKR-AUTO-${semantic}-001`;

  // Check for collision
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`[stale-kr] Rate limited: ${kr.code} (SD ${sdKey} already exists)`);
    return null;
  }

  const sdData = {
    id: sdKey,
    sd_key: sdKey,
    title: sdTitle,
    description: `Auto-generated from stale KR ${kr.code} (${kr.title}). Part of objective ${objective.code}: ${objective.title}. Current: ${kr.current_value}${kr.unit}, Target: ${kr.target_value}${kr.unit}. KR has been at 0% progress for over ${DEFAULT_STALENESS_DAYS} days with no active aligned SDs.`,
    status: 'draft',
    sd_type: 'infrastructure',
    category: 'infrastructure',
    priority: kr.status === 'off_track' ? 'high' : 'medium',
    scope: `Move KR ${kr.code} from ${kr.current_value} to ${kr.target_value} ${kr.unit}`,
    target_application: 'EHG_Engineer',
    rationale: `OKR automation: KR ${kr.code} is at 0% progress with no active work. Objective: ${objective.title}.`,
    is_active: true,
    success_criteria: [{ criterion: `KR ${kr.code} progress > 0%`, measure: `current_value changes from ${kr.current_value}` }],
    success_metrics: [{ metric: `${kr.code} progress`, target: `>${kr.baseline_value} ${kr.unit}`, actual: `${kr.current_value} ${kr.unit}` }],
    key_principles: [`Address OKR gap for ${objective.code}`, 'Auto-generated — chairman review required before LEAD approval'],
    key_changes: [{ change: `Move ${kr.code} off 0% progress`, type: 'feature' }],
    strategic_objectives: [`Advance ${objective.code}: ${objective.title}`],
    risks: [{ risk: 'Auto-generated scope may not match actual work needed', mitigation: 'Chairman reviews in DRAFT status before approval' }],
    metadata: {
      auto_generated: true,
      source: 'okr-stale-kr-sd-creator',
      kr_id: kr.id,
      kr_code: kr.code,
      objective_code: objective.code,
      created_at_cycle: new Date().toISOString()
    }
  };

  if (dryRun) {
    console.log(`[DRY RUN] Would create DRAFT SD: ${sdTitle}`);
    return { dry_run: true, title: sdTitle, kr_code: kr.code };
  }

  // Use leo-create-sd.js pattern: insert directly with required fields
  const { data: created, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, status')
    .single();

  if (error) {
    console.error(`[stale-kr] Failed to create SD for ${kr.code}:`, error.message);
    return null;
  }

  // Audit log
  console.log(JSON.stringify({
    event: 'auto_sd_created',
    sd_id: created.sd_key || created.id,
    kr_code: kr.code,
    objective_code: objective.code,
    actor: 'okr-stale-kr-sd-creator',
    timestamp: new Date().toISOString()
  }));

  return created;
}

/**
 * Main entry point: detect stale KRs and create DRAFT SDs.
 * @param {Object} options
 * @param {boolean} options.dryRun - Preview mode
 * @param {number} options.stalenessDays - Staleness threshold
 * @returns {Promise<Object>} Results summary
 */
export async function runStaleKRAutomation(options = {}) {
  const { dryRun = false, stalenessDays = DEFAULT_STALENESS_DAYS } = options;
  const supabase = createSupabaseServiceClient();

  console.log(`\n[okr-stale-kr] Running stale KR detection (threshold: ${stalenessDays} days, mode: ${dryRun ? 'DRY RUN' : 'LIVE'})...\n`);

  const staleKRs = await detectStaleKRs(supabase, stalenessDays);
  console.log(`[okr-stale-kr] Found ${staleKRs.length} stale KR(s) with no active aligned SDs`);

  const results = { detected: staleKRs.length, created: 0, skipped: 0, rate_limited: 0, errors: 0 };

  for (const kr of staleKRs.slice(0, MAX_SDS_PER_CYCLE)) {
    // Rate limit: 1 SD per KR per cycle
    const limited = await isRateLimited(supabase, kr.code);
    if (limited) {
      console.log(`[okr-stale-kr] Rate limited: ${kr.code} (SD already exists this cycle)`);
      results.rate_limited++;
      continue;
    }

    const sd = await createSDFromStaleKR(supabase, kr, dryRun);
    if (sd) {
      results.created++;
    } else if (!dryRun) {
      results.errors++;
    }
  }

  if (staleKRs.length > MAX_SDS_PER_CYCLE) {
    results.skipped = staleKRs.length - MAX_SDS_PER_CYCLE;
    console.log(`[okr-stale-kr] Skipped ${results.skipped} KR(s) (max ${MAX_SDS_PER_CYCLE} per cycle)`);
  }

  console.log(`\n[okr-stale-kr] Summary: ${results.created} created, ${results.rate_limited} rate-limited, ${results.skipped} skipped, ${results.errors} errors\n`);
  return results;
}

// CLI entry point
const isMain = process.argv[1]?.endsWith('okr-stale-kr-sd-creator.js') ||
  process.argv[1]?.replace(/\\/g, '/')?.endsWith('okr-stale-kr-sd-creator.js');

if (isMain) {
  const dryRun = process.argv.includes('--dry-run');
  const stalenessDays = (() => {
    const idx = process.argv.indexOf('--days');
    return idx > -1 ? parseInt(process.argv[idx + 1], 10) : DEFAULT_STALENESS_DAYS;
  })();

  runStaleKRAutomation({ dryRun, stalenessDays })
    .then(results => {
      process.exit(results.errors > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('[okr-stale-kr] Fatal error:', err.message);
      process.exit(2);
    });
}
