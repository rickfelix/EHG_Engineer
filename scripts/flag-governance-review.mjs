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
import { buildFlagCodeIndices } from '../lib/feature-flags/flag-reader-scan.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { NON_BINDING_MODES } from './lint/non-binding-mode-registry-lint.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_FLAG = 'FLAG_GOVERNANCE_REVIEW_V1';

/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (FR-3). Additive, separate from
 * computeStaleFlags()/formatDigest() -- does NOT touch that pipeline at all. The 4
 * non-binding-mode rows (registered by this SD's migration under lifecycle_state=
 * 'archived') never produce a classifier recommendation (archived is a terminal
 * state classifyFlag() short-circuits to null for), so there is nothing for the
 * existing stale-flag digest to say about them. This lists them directly instead.
 *
 * Conjunctive filter (flag_key IN the known list AND lifecycle_state='archived') is
 * load-bearing: a prospective TESTING review found the registry already holds
 * unrelated pre-existing archived rows (ADAM_SELF_SCORE_CADENCE,
 * COORD_TEARDOWN_SAFETY_V2, product_pivot_active) that a bare lifecycle_state filter
 * would wrongly sweep in.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{flag_key:string, gates_what:string|null, enablement_criteria:string|null, lifecycle_state:string}>>}
 */
export async function listNonBindingModes(supabase) {
  const flagKeys = NON_BINDING_MODES.map((m) => m.flagKey);
  // flag_key is UNIQUE NOT NULL, and the literal bound below is NON_BINDING_MODES.length --
  // update both together when the curated list grows (it is deliberately hand-maintained).
  const { data, error } = await supabase
    .from('leo_feature_flags')
    .select('flag_key, gates_what, enablement_criteria, lifecycle_state')
    .in('flag_key', flagKeys)
    .eq('lifecycle_state', 'archived')
    .limit(4);
  if (error) {
    console.error(`[FLAG-GOV] listNonBindingModes query failed: ${error.message}`);
    return [];
  }
  return data || [];
}

/** Plain-text rendering of listNonBindingModes()'s rows, appended to the digest output. */
export function formatNonBindingModesSection(rows) {
  if (!rows.length) return '';
  const lines = ['', 'NON-BINDING VENTURE-QUALITY MECHANISMS (registered, not graduated):'];
  for (const r of rows) {
    lines.push(`  - ${r.flag_key} [${r.lifecycle_state}] -- ${r.gates_what || '(no gates_what)'}`);
  }
  return lines.join('\n');
}

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
  // QF-20260906-235: one combined tree-walk (not two) computes both predicates in a single pass
  // — an already-graduated-in-code flag reports GRADUATED instead of a daily GRADUATE nag.
  const { hasLiveReaders, isGraduatedInCode } = buildFlagCodeIndices(REPO_ROOT, (flags || []).map((f) => f.flag_key).filter(Boolean));
  const result = computeStaleFlags(flags || [], Date.now(), { env: process.env, hasLiveReaders, isGraduatedInCode });
  console.log(formatDigest(result));

  // FR-3: additive, separate section -- never touches computeStaleFlags/formatDigest above.
  const nonBindingModes = await listNonBindingModes(db);
  const nonBindingSection = formatNonBindingModesSection(nonBindingModes);
  if (nonBindingSection) console.log(nonBindingSection);

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
