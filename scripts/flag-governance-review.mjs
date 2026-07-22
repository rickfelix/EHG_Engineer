// flag-governance-review.mjs — scheduled feature-flag governance review (cheap-poller).
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-1). Mirrors the work-triggered, idle-cheap
// pattern of coordinator-self-review.mjs: the cron that invokes this is just a poller.
//
// Each run: scan leo_feature_flags → compute the stale-flag digest (never-reviewed /
// past expiry_at / disabled-aging / enabled-but-never-rolled-out, each with a
// graduate|kill|extend|review recommendation) → emit the digest → stamp last_reviewed_at
// on the reviewed flags so a forgotten flag surfaces within one cycle instead of forever.
//
// Gated behind its OWN registered flag FLAG_GOVERNANCE_REVIEW_V1 (default-OFF until
// baselined): when OFF it is a cheap no-op. Pass --force to run regardless (baseline/smoke).
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { computeStaleFlags, formatDigest } from '../lib/feature-flags/governance-review.js';
import { buildLiveReaderIndex } from '../lib/feature-flags/flag-reader-scan.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_FLAG = 'FLAG_GOVERNANCE_REVIEW_V1';

export async function reviewMain({ force = false } = {}) {
  // Gate: own flag, default-OFF. Absent or disabled → cheap no-op unless --force.
  const { data: gate } = await db.from('leo_feature_flags').select('is_enabled').eq('flag_key', GATE_FLAG).maybeSingle();
  const gateOn = gate?.is_enabled === true;
  if (!gateOn && !force) {
    console.log(`[FLAG-GOV] ${GATE_FLAG} is OFF — cheap no-op poll. Enable the flag (or pass --force) to run the governance review.`);
    return { skipped: true };
  }

  const { data: flags, error } = await db.from('leo_feature_flags').select('*');
  if (error) {
    console.error(`[FLAG-GOV] failed to list flags: ${error.message}`);
    return { skipped: false, error: error.message };
  }

  // Compute the digest BEFORE stamping so never-reviewed flags surface once.
  // env injected for the registry-vs-runtime drift detector (QF-20260610-863).
  // hasLiveReaders (QF-20260721-951): scan the source tree ONCE for each flag's live code
  // readers so a disabled-aging-but-still-read flag is KEPT (load-bearing), not falsely KILLED.
  const hasLiveReaders = buildLiveReaderIndex(REPO_ROOT, (flags || []).map((f) => f.flag_key).filter(Boolean));
  const result = computeStaleFlags(flags || [], Date.now(), { env: process.env, hasLiveReaders });
  console.log(formatDigest(result));

  // Stamp last_reviewed_at on every reviewed flag (the automated review touched them this cycle).
  const ids = (flags || []).map((f) => f.id).filter(Boolean);
  let reviewed = 0;
  if (ids.length) {
    const { error: upErr, count } = await db
      .from('leo_feature_flags')
      .update({ last_reviewed_at: new Date().toISOString() }, { count: 'exact' })
      .in('id', ids);
    if (upErr) console.error(`[FLAG-GOV] stamp failed: ${upErr.message}`);
    else reviewed = count ?? ids.length;
  }

  // Surface the digest to the operator via the durable feedback channel when something is stale.
  if (result.stale.length) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `flag-gov:${today}`;
    const { data: ex } = await db.from('feedback').select('id').eq('category', 'feature_flag_governance').eq('metadata->>digest_key', key).limit(1);
    if (!ex || !ex.length) {
      await db.from('feedback').insert({
        type: 'enhancement', source_application: 'EHG_Engineer', source_type: 'auto_capture',
        category: 'feature_flag_governance', status: 'new', severity: 'low',
        title: `Stale feature flags (${result.stale.length}) — ${today}`,
        description: formatDigest(result),
        metadata: { digest_key: key, stale_count: result.stale.length, by_recommendation: result.byRecommendation }
      });
    }
  }

  console.log(`[FLAG-GOV] reviewed ${reviewed} flag(s); ${result.stale.length} stale.`);

  return { skipped: false, stale: result.stale.length, reviewed };
}

// Main-guard: run only when invoked directly (the cron path), not on import (tests).
if (process.argv[1] && /flag-governance-review\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  reviewMain({ force: process.argv.includes('--force') }).then(async (r) => {
    if (r && r.error) { process.exit(1); return; }
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick
    // (including the gate-off cheap no-op poll) — reflects loop liveness, not whether
    // the governance review actually fired this cycle.
    try {
      await stampLastFired(db, 'standard_loop:flag-review');
    } catch (err) {
      console.error(`[FLAG-GOV] stampLastFired failed (non-fatal): ${err.message}`);
    }
  });
}
