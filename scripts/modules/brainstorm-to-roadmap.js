/**
 * Brainstorm-to-Roadmap Connection Hook
 * SD: SD-MAN-INFRA-STRATEGIC-ROADMAP-PROCESS-001
 *
 * After chairman approval in the distill pipeline, auto-creates
 * roadmap_wave_items from brainstorm sessions that have both
 * vision_key and arch_key in their metadata.
 *
 * Idempotent via source_id (brainstorm_session_id).
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Check if a brainstorm session qualifies for roadmap promotion.
 * Must have both vision_key and arch_key.
 * @param {object} brainstorm - brainstorm_sessions row
 * @returns {boolean}
 */
export function qualifiesForRoadmap(brainstorm) {
  if (!brainstorm) return false;
  const meta = brainstorm.metadata || {};
  return !!(meta.vision_key && meta.arch_key);
}

/**
 * Create a roadmap wave item from a brainstorm session.
 * Idempotent: skips if source_id already exists.
 *
 * @param {string} brainstormId - UUID of the brainstorm session
 * @param {object} [options]
 * @param {object} [options.supabase] - Supabase client
 * @returns {Promise<{created: boolean, skipped: boolean, item_id?: string, reason?: string}>}
 */
export async function createRoadmapItemFromBrainstorm(brainstormId, options = {}) {
  const supabase = options.supabase || createSupabaseServiceClient();

  // Fetch brainstorm
  const { data: brainstorm, error: bErr } = await supabase
    .from('brainstorm_sessions')
    .select('id, title, metadata, stage, outcome_type, created_at')
    .eq('id', brainstormId)
    .single();

  if (bErr || !brainstorm) {
    return { created: false, skipped: true, reason: `Brainstorm not found: ${brainstormId}` };
  }

  // Check qualification
  if (!qualifiesForRoadmap(brainstorm)) {
    return { created: false, skipped: true, reason: 'Missing vision_key or arch_key' };
  }

  // Check idempotency — look for existing item with this source_id
  const { data: existing } = await supabase
    .from('roadmap_wave_items')
    .select('id')
    .eq('source_id', brainstormId)
    .eq('source_type', 'brainstorm')
    .limit(1);

  if (existing && existing.length > 0) {
    return { created: false, skipped: true, item_id: existing[0].id, reason: 'Already exists (idempotent)' };
  }

  // Get active roadmap and its first wave
  const { data: roadmap } = await supabase
    .from('strategic_roadmaps')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!roadmap) {
    return { created: false, skipped: true, reason: 'No active roadmap found' };
  }

  // Get the "future" or latest wave to add to
  const { data: waves } = await supabase
    .from('roadmap_waves')
    .select('id, title, sequence_rank')
    .eq('roadmap_id', roadmap.id)
    .order('sequence_rank', { ascending: false })
    .limit(1);

  const waveId = waves?.[0]?.id;
  if (!waveId) {
    return { created: false, skipped: true, reason: 'No waves in active roadmap' };
  }

  // Create the wave item
  const meta = brainstorm.metadata || {};
  const { data: item, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .insert({
      wave_id: waveId,
      title: brainstorm.title,
      source_type: 'brainstorm',
      source_id: brainstormId,
      metadata: {
        brainstorm_session_id: brainstormId,
        vision_key: meta.vision_key,
        arch_key: meta.arch_key,
        brainstorm_stage: brainstorm.stage,
        outcome_type: brainstorm.outcome_type,
        created_from: 'brainstorm-to-roadmap-hook',
      },
    })
    .select('id')
    .single();

  if (iErr) {
    return { created: false, skipped: false, reason: `Insert failed: ${iErr.message}` };
  }

  return { created: true, skipped: false, item_id: item.id };
}

/**
 * Query roadmap items with linked brainstorm/vision/arch metadata.
 * @param {object} [options]
 * @param {object} [options.supabase] - Supabase client
 * @param {string} [options.roadmapId] - Specific roadmap (defaults to active)
 * @returns {Promise<object[]>}
 */
export async function queryRoadmapItemsWithMetadata(options = {}) {
  const supabase = options.supabase || createSupabaseServiceClient();

  let roadmapId = options.roadmapId;
  if (!roadmapId) {
    const { data: roadmap } = await supabase
      .from('strategic_roadmaps')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    roadmapId = roadmap?.id;
  }

  if (!roadmapId) return [];

  // Get waves for this roadmap
  const { data: waves } = await supabase
    .from('roadmap_waves')
    .select('id, title, sequence_rank, time_horizon')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (!waves || waves.length === 0) return [];

  const waveIds = waves.map(w => w.id);
  const waveMap = new Map(waves.map(w => [w.id, w]));

  // Get all items across waves
  const { data: items } = await supabase
    .from('roadmap_wave_items')
    .select('id, wave_id, title, source_type, source_id, promoted_to_sd_key, priority_rank, metadata, created_at')
    .in('wave_id', waveIds)
    .order('priority_rank', { ascending: true });

  return (items || []).map(item => ({
    ...item,
    wave: waveMap.get(item.wave_id) || null,
    brainstorm_session_id: item.metadata?.brainstorm_session_id || null,
    vision_key: item.metadata?.vision_key || null,
    arch_key: item.metadata?.arch_key || null,
  }));
}

/**
 * Process all approved brainstorms that qualify for roadmap but haven't been added yet.
 * Batch operation for catching up on missed items.
 * @param {object} [options]
 * @returns {Promise<{processed: number, created: number, skipped: number}>}
 */
export async function processAllPendingBrainstorms(options = {}) {
  const supabase = options.supabase || createSupabaseServiceClient();

  // Find brainstorms with vision+arch that are chairman-reviewed
  const { data: brainstorms } = await supabase
    .from('brainstorm_sessions')
    .select('id, title, metadata')
    .not('metadata->vision_key', 'is', null)
    .not('metadata->arch_key', 'is', null)
    .not('chairman_reviewed_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  let created = 0;
  let skipped = 0;

  for (const bs of (brainstorms || [])) {
    const result = await createRoadmapItemFromBrainstorm(bs.id, { supabase });
    if (result.created) created++;
    else skipped++;
  }

  return { processed: (brainstorms || []).length, created, skipped };
}
