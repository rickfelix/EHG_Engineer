#!/usr/bin/env node
/**
 * Smoke test for rubric v2 motion_grammar_density activation readiness.
 *
 * Part of SD-LEO-FEAT-MOTION-GRAMMAR-DENSITY-001 FR-7a.
 *
 * Validates pre-activation invariants:
 *   1. gvos_prompt_rubrics v2 row 469f63fb is present with weights total=100 and motion_grammar_density=10
 *   2. leo_feature_flags s17_per_wireframe_sections row is present (any state)
 *   3. Three synthetic layer8_motion_grammar payloads (0 tokens / 2 tokens / 5 tokens with timing)
 *      produce the expected 4-band motion_grammar_density contribution (0 / 4 / 10) when scored
 *      with the same logic the EHG scorer will use.
 *
 * Exit 0 = PASS (safe to run activate-rubric-v2.mjs).
 * Exit 1 = FAIL (do NOT activate; investigate the failed invariant).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const RUBRIC_V2_ID = '469f63fb-543f-43af-8509-7575ae2340ec';
const SUB_FLAG_KEY = 's17_per_wireframe_sections';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function scoreMotionGrammarDensityMirror(tokens) {
  // Mirror of EHG scorer FR-2 logic. Kept in sync with src/lib/gvos/prompt-quality-scorer.ts.
  // Smoke duplication is intentional: validates the math here, then the unit test in EHG
  // validates the same math against the scorer source-of-truth.
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  if (tokens.length < 3) return 0.4;
  const hasTimingPattern = tokens.some((t) => /\d+ms/.test(t));
  return hasTimingPattern ? 1.0 : 0.6;
}

const SYNTHETIC_PAYLOADS = [
  { name: 'no_layer8', tokens: [], expected_band: 0,   expected_pct: 0  },
  { name: 'two_tokens_no_timing', tokens: ['Hover-Lift', 'Press-Tactile'], expected_band: 0.4, expected_pct: 4 },
  { name: 'five_tokens_with_timing', tokens: ['Press-Tactile-80ms', 'Hover-Lift-100ms', 'Toast-Slide-In-180ms', 'Modal-Scale-In-200ms', 'Skeleton-Shimmer-1200ms'], expected_band: 1.0, expected_pct: 10 }
];

let failed = false;

console.log('SMOKE: rubric v2 activation readiness');
console.log('======================================\n');

// Check 1: rubric v2 row + weights
const { data: rubric, error: rubricErr } = await supabase
  .from('gvos_prompt_rubrics')
  .select('id, version, active, weights')
  .eq('id', RUBRIC_V2_ID)
  .maybeSingle();

if (rubricErr || !rubric) {
  console.error(`FAIL: rubric v2 row ${RUBRIC_V2_ID} not found (${rubricErr?.message || 'no row'})`);
  failed = true;
} else {
  const weights = rubric.weights || {};
  const total = Object.values(weights).reduce((s, v) => s + Number(v || 0), 0);
  const mgd = weights.motion_grammar_density;
  console.log(`Check 1: rubric v2 row present (version=${rubric.version}, active=${rubric.active})`);
  console.log(`         weights total = ${total}, motion_grammar_density = ${mgd}`);
  if (total !== 100) { console.error('         FAIL: weights do not sum to 100'); failed = true; }
  if (mgd !== 10)    { console.error('         FAIL: motion_grammar_density != 10'); failed = true; }
  if (weights.library_motion !== undefined) { console.error('         FAIL: library_motion key still present'); failed = true; }
  if (weights._reserved_for_motion_grammar_density !== undefined) { console.error('         FAIL: _reserved_for_motion_grammar_density still present'); failed = true; }
  if (!failed) console.log('         OK\n');
}

// Check 2: sub-flag row
const { data: flag, error: flagErr } = await supabase
  .from('leo_feature_flags')
  .select('id, flag_key, is_enabled')
  .eq('flag_key', SUB_FLAG_KEY)
  .maybeSingle();

if (flagErr || !flag) {
  console.error(`FAIL: sub-flag ${SUB_FLAG_KEY} not found (${flagErr?.message || 'no row'})`);
  failed = true;
} else {
  console.log(`Check 2: sub-flag ${SUB_FLAG_KEY} present (is_enabled=${flag.is_enabled})`);
  console.log('         OK\n');
}

// Check 3: scoring math on synthetic payloads
console.log('Check 3: scoreMotionGrammarDensity mirror math');
for (const p of SYNTHETIC_PAYLOADS) {
  const band = scoreMotionGrammarDensityMirror(p.tokens);
  const pct = Math.round(band * 10);
  const ok = Math.abs(band - p.expected_band) < 0.01 && pct === p.expected_pct;
  console.log(`         ${p.name.padEnd(28)} tokens=${String(p.tokens.length).padStart(2)} -> band=${band.toFixed(2)} pct=${String(pct).padStart(2)} ${ok ? 'OK' : `FAIL (expected band=${p.expected_band} pct=${p.expected_pct})`}`);
  if (!ok) failed = true;
}

console.log();
if (failed) {
  console.error('SMOKE FAIL — do NOT activate rubric v2');
  process.exit(1);
}
console.log('SMOKE PASS — safe to run activate-rubric-v2.mjs');
process.exit(0);
