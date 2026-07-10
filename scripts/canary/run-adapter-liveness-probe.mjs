#!/usr/bin/env node
/**
 * Publisher-adapter live-post liveness probe — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C
 * FR-1: "adapter exists" remains WIRED-BUT-SILENT until one real post lands and is observed.
 *
 * Distinct from scripts/canary/run-gauge-liveness-probe.mjs (Child A's funnel-gauge probe —
 * a different subsystem). This probe calls the REAL lib/marketing/publisher/index.js publish()
 * for one adapter — deliberately going through the SAME fail-closed autonomy gate, rate
 * limiter, and kill-switch check as any other post (no bypass path exists; an operator must
 * first approve the test post via the propose-and-approve flow, same as any other content,
 * or graduate the channel to autonomous first). A result with dryRun:true NEVER satisfies the
 * liveness proof — only a genuine observed post (real postId, no dryRun flag) flips
 * venture_distribution_channels.liveness_state to 'proven_live'.
 *
 * Gated by leo_feature_flags ADAPTER_LIVENESS_CANARY_V1 (ships OFF), mirroring the flag-gating
 * convention in scripts/canary/canary-core.mjs / run-gauge-liveness-probe.mjs.
 *
 * Usage: node scripts/canary/run-adapter-liveness-probe.mjs --venture-id <uuid> --channel-id <uuid> --platform x [--force-local]
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { publish } from '../../lib/marketing/publisher/index.js';

config();

export const ADAPTER_LIVENESS_CANARY_FLAG = 'ADAPTER_LIVENESS_CANARY_V1';

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const FORCE_LOCAL = args.includes('--force-local');
const VENTURE_ID = argVal('--venture-id');
const CHANNEL_ID = argVal('--channel-id');
const PLATFORM = argVal('--platform');

async function flagEnabled(supabase) {
  const { data } = await supabase.from('leo_feature_flags').select('is_enabled').eq('flag_key', ADAPTER_LIVENESS_CANARY_FLAG).maybeSingle();
  return data?.is_enabled === true;
}

/**
 * Run the probe. Injectable publishFn for testing; default is the real publish().
 * @param {{supabase: object, ventureId: string, channelId: string, platform: string, content?: object, campaignId?: string, publishFn?: Function}} opts
 * @returns {Promise<{passed: boolean, reason: string, postId?: string}>}
 */
export async function runAdapterLivenessProbe({ supabase, ventureId, channelId, platform, content, campaignId, publishFn = publish }) {
  const testContent = content || {
    id: `liveness-probe-${Date.now()}`,
    headline: 'Liveness probe',
    body: 'Automated liveness check — one real post to verify this adapter is genuinely wired.',
  };

  const result = await publishFn({ supabase, content: testContent, platform, ventureId, campaignId });

  if (!result.success) {
    return { passed: false, reason: `publish() rejected the probe: ${result.error || result.reason || 'unknown reason'}${result.blockedBy ? ` (blockedBy: ${result.blockedBy})` : ''}` };
  }

  if (result.dryRun === true) {
    return { passed: false, reason: 'publish() succeeded but as a DRY RUN — no real post landed, this does NOT satisfy the liveness proof' };
  }

  if (!result.postId) {
    return { passed: false, reason: 'publish() reported success with no postId — cannot record observed evidence' };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('venture_distribution_channels')
    .update({
      liveness_state: 'proven_live',
      auth_verified_at: now,
      ratelimit_verified_at: now,
      first_post_observed_at: now,
      liveness_evidence_ref: result.postUrl || result.postId,
    })
    .eq('venture_id', ventureId)
    .eq('channel_id', channelId);

  if (updateError) {
    return { passed: false, reason: `real post landed (postId ${result.postId}) but liveness-state update failed: ${updateError.message}`, postId: result.postId };
  }

  return { passed: true, reason: `one real post observed (postId ${result.postId}) — adapter flips WIRED-BUT-SILENT -> proven_live`, postId: result.postId };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  (async () => {
    if (!FORCE_LOCAL && !(await flagEnabled(supabase))) {
      console.log(`[adapter-liveness-probe] flag ${ADAPTER_LIVENESS_CANARY_FLAG} is disabled — quiet refusal (enable it or pass --force-local)`);
      process.exit(0);
    }
    if (!VENTURE_ID || !CHANNEL_ID || !PLATFORM) {
      console.error('[adapter-liveness-probe] --venture-id <uuid> --channel-id <uuid> --platform <x|bluesky> are required');
      process.exit(1);
    }
    const result = await runAdapterLivenessProbe({ supabase, ventureId: VENTURE_ID, channelId: CHANNEL_ID, platform: PLATFORM });
    console.log(JSON.stringify(result));
    process.exit(result.passed ? 0 : 1);
  })();
}

export default { ADAPTER_LIVENESS_CANARY_FLAG, runAdapterLivenessProbe };
