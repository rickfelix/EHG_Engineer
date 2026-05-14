#!/usr/bin/env node
/**
 * Atomic activation flip for rubric v2 + motion_grammar_density sub-flag.
 *
 * Part of SD-LEO-FEAT-MOTION-GRAMMAR-DENSITY-001 FR-7b.
 *
 * Default mode: activate
 *   1. UPDATE gvos_prompt_rubrics SET active=true WHERE id=469f63fb (v2)
 *   2. UPDATE gvos_prompt_rubrics SET active=false WHERE version=1
 *   3. UPDATE leo_feature_flags SET is_enabled=true WHERE flag_key=s17_per_wireframe_sections
 *
 * --rollback mode: inverse
 *   1. UPDATE gvos_prompt_rubrics SET active=true WHERE version=1
 *   2. UPDATE gvos_prompt_rubrics SET active=false WHERE id=469f63fb (v2)
 *   3. UPDATE leo_feature_flags SET is_enabled=false WHERE flag_key=s17_per_wireframe_sections
 *
 * Idempotency: re-running in already-target state exits 0 with "already <state>" message.
 *
 * Atomicity: NOT a Postgres transaction (Supabase REST). On step failure, compensating
 * writes restore the pre-script state. Each step re-SELECTs to verify success.
 *
 * row_version on leo_feature_flags is auto-bumped by fn_increment_feature_flag_version
 * trigger — do NOT include row_version in UPDATE payload.
 *
 * Trigger gate: gvos_prompt_rubrics has gvos_prompt_rubrics_block_update_trigger gated by
 * is_leo_admin() which short-circuits TRUE only for service_role JWT. Anon/authenticated
 * keys raise SQLSTATE 42501.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const RUBRIC_V2_ID = '469f63fb-543f-43af-8509-7575ae2340ec';
const SUB_FLAG_KEY = 's17_per_wireframe_sections';

const rollback = process.argv.includes('--rollback');
const targetState = rollback
  ? { v1_active: true,  v2_active: false, flag_enabled: false, label: 'rollback (v1 active)' }
  : { v1_active: false, v2_active: true,  flag_enabled: true,  label: 'activate (v2 active)' };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function readState() {
  const { data: v2 } = await supabase.from('gvos_prompt_rubrics').select('active').eq('id', RUBRIC_V2_ID).maybeSingle();
  const { data: v1Rows } = await supabase.from('gvos_prompt_rubrics').select('id, active').eq('version', 1);
  const { data: flag } = await supabase.from('leo_feature_flags').select('is_enabled').eq('flag_key', SUB_FLAG_KEY).maybeSingle();
  // Take the most-recent v1 row (typically there is one)
  const v1Active = (v1Rows || []).some((r) => r.active === true);
  return {
    v2_active: v2?.active === true,
    v1_active: v1Active,
    flag_enabled: flag?.is_enabled === true
  };
}

function stateMatches(actual, target) {
  return actual.v1_active === target.v1_active
      && actual.v2_active === target.v2_active
      && actual.flag_enabled === target.flag_enabled;
}

async function setV2Active(active) {
  const { error } = await supabase.from('gvos_prompt_rubrics').update({ active }).eq('id', RUBRIC_V2_ID);
  if (error) throw new Error(`UPDATE v2 active=${active} failed: ${error.message}`);
}

async function setV1Active(active) {
  const { error } = await supabase.from('gvos_prompt_rubrics').update({ active }).eq('version', 1);
  if (error) throw new Error(`UPDATE v1 active=${active} failed: ${error.message}`);
}

async function setFlagEnabled(isEnabled) {
  // Do NOT pass row_version (trigger auto-bumps it).
  const { error } = await supabase.from('leo_feature_flags').update({ is_enabled: isEnabled }).eq('flag_key', SUB_FLAG_KEY);
  if (error) throw new Error(`UPDATE sub-flag is_enabled=${isEnabled} failed: ${error.message}`);
}

console.log(`activate-rubric-v2: mode=${rollback ? 'rollback' : 'activate'}`);

const preState = await readState();
console.log('Pre-state:', preState);

if (stateMatches(preState, targetState)) {
  console.log(`Already in ${targetState.label} state. No-op.`);
  process.exit(0);
}

const steps = [
  { name: 'set v2 active',           fn: () => setV2Active(targetState.v2_active),       compensate: () => setV2Active(preState.v2_active) },
  { name: 'set v1 active',           fn: () => setV1Active(targetState.v1_active),       compensate: () => setV1Active(preState.v1_active) },
  { name: 'set sub-flag is_enabled', fn: () => setFlagEnabled(targetState.flag_enabled), compensate: () => setFlagEnabled(preState.flag_enabled) }
];

const completed = [];
try {
  for (const step of steps) {
    await step.fn();
    completed.push(step);
    console.log(`  OK: ${step.name}`);
  }
} catch (err) {
  console.error(`  FAIL: ${err.message}`);
  console.error('Rolling back completed steps...');
  for (const step of completed.reverse()) {
    try {
      await step.compensate();
      console.error(`    rolled back: ${step.name}`);
    } catch (cErr) {
      console.error(`    ROLLBACK FAILED for ${step.name}: ${cErr.message}`);
    }
  }
  process.exit(1);
}

const postState = await readState();
console.log('Post-state:', postState);
if (!stateMatches(postState, targetState)) {
  console.error('Post-state does not match target — manual inspection required');
  process.exit(1);
}

console.log(`Done: ${targetState.label}`);
process.exit(0);
