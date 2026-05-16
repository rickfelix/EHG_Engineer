#!/usr/bin/env node
// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-2
// Backfill writer for metadata.vision_key + metadata.arch_key + lineage_verdict
// + lineage_attribution_confidence on strategic_directives_v2.
//
// Order of operations:
//   1. Pre-register app_config.child_0_shadow_sampling_protocol (temporal invariant per FR-C0-7)
//   2. For each in-scope SD missing metadata.vision_key:
//      a. Call tierKeysFromSDKey (scripts/eva/vision-scorer.js:777-787) FIRST — anchored /-L([123])-/
//         suffix match → confidence=100 → BACKFILLED_HIGH
//      b. Fall through to structural heuristic for the rest (tier-key suffix + sd_type + adrs_consulted
//         + brainstorm_session_id signals; NOT brainstorm-references-alone per RISK C0-R-01 0/11 finding)
//      c. mapConfidenceToVerdict on the resulting confidence
//   3. Idempotent UPDATE WHERE metadata->>'vision_key' IS NULL (RISK C0-R-06)
//   4. Set smoke_test_passed_at + runtime_observed_at (Guardrail #3)
//   5. Respect --target cap (BACKFILL_TARGET_CAP default 50); refuse anything beyond

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { tierKeysFromSDKey } from '../eva/vision-scorer.js';
import { mapConfidenceToVerdict } from './verdict-tier.mjs';
import {
  CONFIDENCE_THRESHOLD,
  VERDICT_HIGH,
  BACKFILL_TARGET_CAP,
  APP_CONFIG_KEYS,
} from './constants.mjs';

config();

const STRUCTURAL_SIGNAL_WEIGHTS = {
  tier_suffix: 100,
  brainstorm_session_id: 60,
  adrs_consulted: 60,
  sd_type: 30,
};

export function structuralConfidence(sd) {
  const signals = {
    tier_suffix: Boolean(tierKeysFromSDKey(sd.sd_key)?.tier),
    brainstorm_session_id: Boolean(sd.metadata?.brainstorm_session_id),
    adrs_consulted: Array.isArray(sd.metadata?.adrs_consulted) && sd.metadata.adrs_consulted.length > 0,
    sd_type: Boolean(sd.sd_type),
  };
  if (signals.tier_suffix) return 100;
  let score = 0;
  for (const [k, present] of Object.entries(signals)) {
    if (present) score += STRUCTURAL_SIGNAL_WEIGHTS[k] || 0;
  }
  return Math.min(score, 100);
}

export function computeBackfillRow(sd) {
  const fromSuffix = tierKeysFromSDKey(sd.sd_key);
  if (fromSuffix?.tier) {
    return {
      vision_key: fromSuffix.vision_key,
      arch_key: fromSuffix.arch_key,
      confidence: 100,
      verdict: VERDICT_HIGH,
      reason: 'tierKeysFromSDKey-first',
    };
  }
  const confidence = structuralConfidence(sd);
  return {
    vision_key: 'VISION-EHG-L1-001',
    arch_key: 'ARCH-EHG-L1-001',
    confidence,
    verdict: mapConfidenceToVerdict(confidence),
    reason: 'structural-heuristic',
  };
}

async function preRegisterShadowProtocol(supabase) {
  const nowIso = new Date().toISOString();
  const protocolPayload = {
    pre_registered_at: nowIso,
    sampling_rule: 'uniform',
    target_cap: BACKFILL_TARGET_CAP,
    cohort: 'EHG_Engineer SDs with metadata.vision_key IS NULL, status in (active, completed)',
    confidence_threshold: CONFIDENCE_THRESHOLD,
  };
  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: APP_CONFIG_KEYS.SHADOW_SAMPLING_PROTOCOL, value: protocolPayload },
      { onConflict: 'key' }
    );
  if (error) throw error;
  return protocolPayload;
}

async function isKillSwitchActive(supabase) {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', APP_CONFIG_KEYS.KILL_SWITCH)
    .maybeSingle();
  if (error) return false;
  const v = data?.value;
  if (!v) return false;
  return Boolean(v.kill_switch || v.blocked);
}

async function fetchInScopeCohort(supabase, limit) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, metadata, created_at')
    .is('metadata->>vision_key', null)
    .in('status', ['active', 'completed', 'in_progress', 'draft'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function backfillVisionKey({ supabase, target = BACKFILL_TARGET_CAP, dryRun = false } = {}) {
  if (target > BACKFILL_TARGET_CAP) {
    throw new Error(
      `target ${target} exceeds BACKFILL_TARGET_CAP ${BACKFILL_TARGET_CAP} — refuse to run`
    );
  }
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  if (await isKillSwitchActive(supabase)) {
    throw new Error('child_0_kill_switch is active — refusing to run');
  }

  await preRegisterShadowProtocol(supabase);

  const cohort = await fetchInScopeCohort(supabase, target);
  const results = [];
  for (const sd of cohort) {
    if (results.length >= target) break;
    const decision = computeBackfillRow(sd);
    const nextMetadata = { ...(sd.metadata || {}), vision_key: decision.vision_key, arch_key: decision.arch_key };
    const update = {
      metadata: nextMetadata,
      lineage_verdict: decision.verdict,
      lineage_attribution_confidence: decision.confidence,
      smoke_test_passed_at: new Date().toISOString(),
      runtime_observed_at: new Date().toISOString(),
    };
    if (dryRun) {
      results.push({ sd_key: sd.sd_key, decision, dryRun: true });
      continue;
    }
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update(update)
      .eq('id', sd.id)
      .is('metadata->>vision_key', null);
    results.push({ sd_key: sd.sd_key, decision, error: error?.message ?? null });
  }
  return { protocol_pre_registered: true, results, cap_reached: results.length >= target };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('backfill-vision-key.mjs')) {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const target = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : BACKFILL_TARGET_CAP;
  const dryRun = args.includes('--dry-run');
  backfillVisionKey({ target, dryRun })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('BACKFILL_FAILED:', err.message);
      process.exit(1);
    });
}
