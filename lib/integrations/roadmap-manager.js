/**
 * Roadmap Manager Module
 * Stateful operations for strategic roadmap lifecycle:
 * approve, promote, baseline, query.
 *
 * SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-D (FR-002, FR-003)
 */

import { validateTransition } from './roadmap-taxonomy.js';

/**
 * Get the most recent active roadmap.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Object|null>}
 */
export async function getActiveRoadmap(supabase) {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, vision_key, current_baseline_version, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get active roadmap: ${error.message}`);
  }
  return data || null;
}

/**
 * Get stats for a roadmap: wave count, item counts, promotion progress.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @returns {Promise<Object>}
 */
export async function getRoadmapStats(supabase, roadmapId) {
  const { data: waves, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status, time_horizon')
    .eq('roadmap_id', roadmapId);

  if (wErr) throw new Error(`Failed to get waves: ${wErr.message}`);

  const waveIds = (waves || []).map(w => w.id);
  let totalItems = 0;
  let promotedItems = 0;

  if (waveIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from('roadmap_wave_items')
      .select('id, promoted_to_sd_key')
      .in('wave_id', waveIds);

    if (iErr) throw new Error(`Failed to get items: ${iErr.message}`);
    totalItems = (items || []).length;
    promotedItems = (items || []).filter(i => i.promoted_to_sd_key).length;
  }

  return {
    wave_count: (waves || []).length,
    total_items: totalItems,
    promoted_items: promotedItems,
    completion_pct: totalItems > 0 ? Math.round((promotedItems / totalItems) * 100) : 0,
  };
}

/**
 * Get baseline snapshot history for a roadmap.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @returns {Promise<Array>}
 */
export async function getBaselineHistory(supabase, roadmapId) {
  const { data, error } = await supabase
    .from('roadmap_baseline_snapshots')
    .select('id, version, wave_sequence, change_rationale, approved_by, created_at')
    .eq('roadmap_id', roadmapId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to get baseline history: ${error.message}`);
  return data || [];
}

/**
 * Approve a wave sequence: transitions waves from proposed→approved,
 * creates a baseline snapshot, and increments the roadmap version.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @param {string} rationale - Change rationale from Chairman
 * @returns {Promise<{version: number, snapshotId: string}>}
 */
export async function approveSequence(supabase, roadmapId, rationale) {
  // Fetch roadmap
  const { data: roadmap, error: rErr } = await supabase
    .from('strategic_roadmaps')
    .select('id, current_baseline_version')
    .eq('id', roadmapId)
    .single();

  if (rErr || !roadmap) throw new Error(`Roadmap not found: ${roadmapId}`);

  // Fetch all waves with items for snapshot
  const { data: waves, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status, sequence_rank, confidence_score, time_horizon')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (wErr) throw new Error(`Failed to get waves: ${wErr.message}`);

  // Build wave sequence snapshot (include items per wave)
  const waveSequence = [];
  for (const wave of (waves || [])) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('id, title, source_type, promoted_to_sd_key, priority_rank')
      .eq('wave_id', wave.id)
      .order('priority_rank', { ascending: true });

    waveSequence.push({
      wave_id: wave.id,
      title: wave.title,
      status: wave.status,
      sequence_rank: wave.sequence_rank,
      items: items || [],
    });
  }

  // Increment version
  const newVersion = (roadmap.current_baseline_version || 0) + 1;

  // Create baseline snapshot
  const { data: snapshot, error: sErr } = await supabase
    .from('roadmap_baseline_snapshots')
    .insert({
      roadmap_id: roadmapId,
      version: newVersion,
      wave_sequence: waveSequence,
      change_rationale: rationale,
      approved_by: 'chairman',
    })
    .select('id')
    .single();

  if (sErr) throw new Error(`Failed to create snapshot: ${sErr.message}`);

  // Update roadmap version
  await supabase
    .from('strategic_roadmaps')
    .update({ current_baseline_version: newVersion, status: 'active' })
    .eq('id', roadmapId);

  // Transition proposed waves to approved
  for (const wave of (waves || [])) {
    if (wave.status === 'proposed') {
      const check = validateTransition('proposed', 'approved');
      if (check.valid) {
        await supabase
          .from('roadmap_waves')
          .update({ status: 'approved' })
          .eq('id', wave.id);
      }
    }
  }

  return { version: newVersion, snapshotId: snapshot.id };
}

/**
 * Promote unpromoted wave items to Strategic Directives.
 * Creates one SD per item, updates promoted_to_sd_key, transitions wave to active.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} waveId
 * @returns {Promise<{created: string[], skipped: number, errors: string[]}>}
 */
export async function promoteWaveToSDs(supabase, waveId) {
  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status, roadmap_id')
    .eq('id', waveId)
    .single();

  if (wErr || !wave) throw new Error(`Wave not found: ${waveId}`);

  const { data: items, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, promoted_to_sd_key, priority_rank')
    .eq('wave_id', waveId)
    .order('priority_rank', { ascending: true });

  if (iErr) throw new Error(`Failed to get items: ${iErr.message}`);

  const unpromoted = (items || []).filter(i => !i.promoted_to_sd_key);
  const created = [];
  const errors = [];

  for (const item of unpromoted) {
    try {
      const sdTitle = `[Wave: ${wave.title}] ${item.title || 'Untitled item'}`;
      const sdKey = `SD-WAVE-${waveId.substring(0, 8).toUpperCase()}-${String(created.length + 1).padStart(3, '0')}`;

      const { data: sd, error: sdErr } = await supabase
        .from('strategic_directives_v2')
        .insert({
          sd_key: sdKey,
          title: sdTitle.substring(0, 200),
          status: 'draft',
          sd_type: 'feature',
          description: `Promoted from roadmap wave "${wave.title}" (source: ${item.source_type})`,
          scope: `Wave item: ${item.title}`,
          success_metrics: [
            { metric: 'Implementation completeness', target: '100%', actual: null },
          ],
        })
        .select('sd_key')
        .single();

      if (sdErr) throw sdErr;

      // Update tracking
      await supabase
        .from('roadmap_wave_items')
        .update({ promoted_to_sd_key: sd.sd_key })
        .eq('id', item.id);

      created.push(sd.sd_key);
    } catch (err) {
      errors.push(`${item.title}: ${err.message}`);
    }
  }

  // Transition wave to active on first promotion
  if (created.length > 0 && (wave.status === 'approved' || wave.status === 'proposed')) {
    const targetStatus = wave.status === 'proposed' ? 'approved' : 'active';
    const check = validateTransition(wave.status, targetStatus);
    if (check.valid) {
      await supabase
        .from('roadmap_waves')
        .update({ status: targetStatus })
        .eq('id', waveId);
    }
  }

  return {
    created,
    skipped: (items || []).length - unpromoted.length,
    errors,
  };
}

/**
 * Create a new wave within a roadmap.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} params
 * @param {string} params.roadmapId
 * @param {string} params.title
 * @param {string} [params.timeHorizon] - One of: now, next, later, eventually
 * @param {number} [params.sequenceRank] - Position in sequence (auto-calculated if omitted)
 * @param {number} [params.confidenceScore] - 0.0-1.0
 * @returns {Promise<Object>} Created wave
 */
export async function createWave(supabase, { roadmapId, title, timeHorizon, sequenceRank, confidenceScore }) {
  // Auto-calculate sequence_rank if not provided
  if (sequenceRank == null) {
    const { data: existing } = await supabase
      .from('roadmap_waves')
      .select('sequence_rank')
      .eq('roadmap_id', roadmapId)
      .order('sequence_rank', { ascending: false })
      .limit(1);

    sequenceRank = existing && existing.length > 0 ? existing[0].sequence_rank + 1 : 1;
  }

  const wave = {
    roadmap_id: roadmapId,
    title,
    status: 'proposed',
    sequence_rank: sequenceRank,
    time_horizon: timeHorizon || null,
    confidence_score: confidenceScore || null,
  };

  const { data, error } = await supabase
    .from('roadmap_waves')
    .insert(wave)
    .select('id, title, status, sequence_rank, time_horizon, confidence_score')
    .single();

  if (error) throw new Error(`Failed to create wave: ${error.message}`);
  return data;
}

/**
 * Get waves filtered by time horizon.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roadmapId
 * @param {string} [timeHorizon] - Filter by horizon (now, next, later, eventually). Omit for all.
 * @returns {Promise<Array>}
 */
export async function getWavesByHorizon(supabase, roadmapId, timeHorizon) {
  let query = supabase
    .from('roadmap_waves')
    .select('id, title, status, sequence_rank, time_horizon, confidence_score')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (timeHorizon) {
    query = query.eq('time_horizon', timeHorizon);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get waves: ${error.message}`);
  return data || [];
}
