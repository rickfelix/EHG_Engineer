#!/usr/bin/env node
/**
 * regression-fingerprint.mjs — re-run trigger on model/pricing/limits change
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-6).
 *
 * Spec Part 4 eval hygiene: "regression suite re-run on EVERY model/pricing/
 * limits change, not one-shot." This computes a fingerprint over the explicit
 * model/effort/rule surface; on change vs the latest stored fingerprint it
 * (a) writes a feedback re-run demand and (b) runs the offline --dry-run
 * self-test so pipeline drift is caught immediately.
 *
 * Designed for periodic_process_registry registration (named follow-up).
 * Run from the repo SHARED ROOT: node scripts/eval/regression-fingerprint.mjs
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
import { MIN_N, DELTA_PP } from '../../lib/eval/capability-scorer.mjs';

export const EVENT_TYPE = 'model_capability_eval_fingerprint';

/**
 * The EXPLICIT surface whose change demands a regression re-run. Kept as data
 * so a diff to this list is itself a visible, reviewable change.
 */
export function currentSurface() {
  return {
    models: ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    efforts: ['low', 'medium', 'high', 'xhigh'],
    rule: { MIN_N, DELTA_PP },
    suite: 'FABLE5-BASELINE-2026-07-16',
  };
}

/** Pure: stable fingerprint of a surface object. */
export function fingerprintOf(surface) {
  return crypto.createHash('sha256').update(JSON.stringify(surface)).digest('hex');
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const surface = currentSurface();
  const fp = fingerprintOf(surface);
  const latest = await supabase
    .from('system_events')
    .select('id, payload, created_at')
    .eq('event_type', EVENT_TYPE)
    .order('created_at', { ascending: false })
    .limit(1);
  if (latest.error) { console.error('fingerprint read failed:', latest.error.message); process.exitCode = 1; return; }

  const prior = latest.data && latest.data[0] && latest.data[0].payload && latest.data[0].payload.fingerprint;
  if (prior === fp) { console.log(`fingerprint unchanged (${fp.slice(0, 12)}) — no-op`); return; }

  const ins = await supabase.from('system_events').insert({
    event_type: EVENT_TYPE,
    idempotency_key: `${EVENT_TYPE}:${fp}`,
    actor_type: 'agent',
    actor_role: 'model-capability-eval',
    payload: { fingerprint: fp, surface, prior_fingerprint: prior || null },
  }).select('id');
  if (ins.error) { console.error('fingerprint write failed:', ins.error.message); process.exitCode = 1; return; }

  const fb = await supabase.from('feedback').insert({
    type: 'enhancement',
    source_type: 'manual_feedback',
    source_application: 'EHG_Engineer',
    category: 'harness_backlog',
    status: 'new',
    severity: 'medium',
    title: 'model-capability eval regression re-run required (model/pricing/limits surface changed)',
    description: `Surface fingerprint changed ${prior ? prior.slice(0, 12) : '(none)'} -> ${fp.slice(0, 12)}. Re-run the capability eval against the sealed baselines (spec Part 4 regression hygiene). system_events idempotency_key=${EVENT_TYPE}:${fp}.`,
    metadata: { fingerprint: fp, prior_fingerprint: prior || null },
  }).select('id');
  if (fb.error) { console.error('re-run demand write failed:', fb.error.message); process.exitCode = 1; return; }

  console.log(`fingerprint CHANGED -> re-run demanded (feedback ${fb.data[0].id}). Running offline self-test...`);
  const { dryRun } = await import('./capability-runner.mjs');
  const r = await dryRun();
  console.log(`self-test: ${r.ok ? 'PASS' : 'FAIL'}`);
  process.exitCode = r.ok ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
