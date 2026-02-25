/**
 * Vision Heal Trigger — Predicate module for auto-triggering /heal vision
 *
 * SD-MAN-INFRA-WIRE-HEAL-VISION-002
 *
 * Two primary triggers:
 *   1. Orchestrator completion — all children done
 *   2. Vision-linked SD completion — SD has vision_key in metadata
 *
 * Guards:
 *   - Cooldown: skip if ran within last 3 SD completions or 4 hours
 *   - Non-blocking: errors logged, never blocks completion
 *   - Token budget: defer if context > 70% (not checkable server-side, advisory only)
 *
 * Integration: called from lead-final-approval/index.js after SD completion
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COOLDOWN_SD_COUNT = 3;
const COOLDOWN_HOURS = 4;

/**
 * Determine if /heal vision should run after this SD completes.
 *
 * @param {Object} sd - The completing SD record
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{shouldRun: boolean, reason: string}>}
 */
export async function shouldTriggerVisionHeal(sd, supabase) {
  const sdKey = sd.sd_key || sd.id;

  // Trigger 1: Orchestrator completion (SD has children and all are done)
  if (sd.parent_sd_id === null || sd.parent_sd_id === undefined) {
    // Check if this SD is an orchestrator (has children)
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      .select('id, status')
      .eq('parent_sd_id', sd.id);

    if (children && children.length > 0) {
      const allDone = children.every(c => c.status === 'completed');
      if (allDone) {
        return { shouldRun: true, reason: `orchestrator_completion: ${sdKey} has ${children.length} completed children` };
      }
    }
  }

  // Trigger 2: Vision-linked SD (has vision_key in metadata)
  const metadata = sd.metadata || {};
  if (metadata.vision_key) {
    return { shouldRun: true, reason: `vision_linked: ${sdKey} has vision_key=${metadata.vision_key}` };
  }

  return { shouldRun: false, reason: 'no_trigger: not orchestrator completion, no vision_key' };
}

/**
 * Check cooldown — skip if /heal vision ran recently.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{cooledDown: boolean, reason: string}>}
 */
export async function checkCooldown(supabase) {
  const { data: lastRun } = await supabase
    .from('leo_protocol_state')
    .select('value')
    .eq('key', 'last_vision_heal')
    .single();

  if (!lastRun || !lastRun.value) {
    return { cooledDown: false, reason: 'no_previous_run' };
  }

  const state = typeof lastRun.value === 'string' ? JSON.parse(lastRun.value) : lastRun.value;
  const lastAt = new Date(state.ran_at);
  const hoursSince = (Date.now() - lastAt.getTime()) / (1000 * 60 * 60);
  const sdsSince = state.sd_completions_since || 0;

  if (hoursSince < COOLDOWN_HOURS) {
    return { cooledDown: true, reason: `time_cooldown: ${hoursSince.toFixed(1)}h < ${COOLDOWN_HOURS}h` };
  }

  if (sdsSince < COOLDOWN_SD_COUNT) {
    return { cooledDown: true, reason: `sd_cooldown: ${sdsSince} SDs < ${COOLDOWN_SD_COUNT}` };
  }

  return { cooledDown: false, reason: `cooldown_expired: ${hoursSince.toFixed(1)}h, ${sdsSince} SDs` };
}

/**
 * Record that /heal vision ran (update cooldown state).
 *
 * @param {Object} supabase - Supabase client
 */
export async function recordVisionHealRun(supabase) {
  const value = { ran_at: new Date().toISOString(), sd_completions_since: 0 };

  const { error } = await supabase
    .from('leo_protocol_state')
    .upsert({ key: 'last_vision_heal', value }, { onConflict: 'key' });

  if (error) {
    console.log(`   ⚠️  Failed to record vision heal run: ${error.message}`);
  }
}

/**
 * Increment SD completion counter (called on every SD completion).
 *
 * @param {Object} supabase - Supabase client
 */
export async function incrementCompletionCounter(supabase) {
  const { data: existing } = await supabase
    .from('leo_protocol_state')
    .select('value')
    .eq('key', 'last_vision_heal')
    .single();

  if (!existing || !existing.value) return; // No previous run, nothing to increment

  const state = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value;
  state.sd_completions_since = (state.sd_completions_since || 0) + 1;

  await supabase
    .from('leo_protocol_state')
    .update({ value: state })
    .eq('key', 'last_vision_heal');
}

/**
 * Execute /heal vision as a non-blocking subprocess.
 *
 * @returns {{success: boolean, output: string}}
 */
export function executeVisionHeal() {
  const healScript = join(__dirname, '../../eva/heal-command.mjs');

  const result = spawnSync(
    process.execPath,
    [healScript, 'vision', 'score'],
    { encoding: 'utf8', timeout: 120000, env: process.env }
  );

  if (result.status === 0) {
    return { success: true, output: (result.stdout || '').substring(0, 500) };
  }

  return {
    success: false,
    output: (result.stderr || result.stdout || 'unknown error').substring(0, 500)
  };
}

/**
 * Main entry point — called from lead-final-approval/index.js
 *
 * @param {Object} sd - The completing SD
 * @param {Object} supabase - Supabase client
 */
export async function runVisionHealIfTriggered(sd, supabase) {
  const sdKey = sd.sd_key || sd.id;

  console.log('\n🔭 VISION HEAL TRIGGER CHECK');
  console.log('-'.repeat(50));

  // Always increment the completion counter
  await incrementCompletionCounter(supabase);

  // Check if this SD should trigger vision heal
  const trigger = await shouldTriggerVisionHeal(sd, supabase);
  if (!trigger.shouldRun) {
    console.log(`   ℹ️  No trigger: ${trigger.reason}`);
    return;
  }

  console.log(`   ✅ Trigger matched: ${trigger.reason}`);

  // Check cooldown
  const cooldown = await checkCooldown(supabase);
  if (cooldown.cooledDown) {
    console.log(`   ⏸️  Cooldown active: ${cooldown.reason}`);
    return;
  }

  console.log(`   ✅ Cooldown clear: ${cooldown.reason}`);

  // Execute vision heal (non-blocking)
  console.log('   🔍 Running /heal vision score...');
  const result = executeVisionHeal();

  if (result.success) {
    console.log('   ✅ Vision heal completed successfully');
    await recordVisionHealRun(supabase);
  } else {
    console.log(`   ⚠️  Vision heal failed (non-blocking): ${result.output}`);
  }
}
