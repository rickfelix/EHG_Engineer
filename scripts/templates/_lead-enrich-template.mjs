// PRECHECK_EXEMPT: canonical template — example consumer of lead-precheck-helpers; verifications run via test fixtures only
/**
 * Canonical _lead-enrich-*.mjs template.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-2.
 *
 * COPY this file to scripts/one-off/_lead-enrich-<sd-key>.mjs and customize the
 * `claims` array. Every prose claim about origin/main, join shapes, or canonical-
 * helper coverage MUST have a corresponding verification entry. The script
 * default-fails if any verification returns ok=false without explicit override.
 *
 * Worked example (commented out below):
 *   - Claim C1: "QF-X DB-canonical reader was never wired" → verifyOriginMainPremise
 *   - Claim C2: "metadata.deferred_from_sd_key joins escalated_to_sd_id" → verifyJoinShape
 *   - Claim C3: "FR-3 covers all writers via canonical helper" → verifyHelperCoverage
 *
 * Usage:
 *   node scripts/one-off/_lead-enrich-<sd-key>.mjs
 *
 * On any verify-fail, the script exits non-zero with structured evidence
 * written to stdout AND stored in metadata.lead_evaluation.precheck_evidence
 * on the target SD. Use --override <rationale ≥30 chars> to proceed despite
 * a fail (logged + audited).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  verifyOriginMainPremise,
  verifyJoinShape,
  verifyHelperCoverage,
} from '../lib/lead-precheck-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// CUSTOMIZE: target SD
const SD_UUID = process.env.LEAD_ENRICH_SD_UUID || 'CHANGE-ME-UUID';
const SD_KEY = process.env.LEAD_ENRICH_SD_KEY || 'CHANGE-ME-SD-KEY';

/**
 * CUSTOMIZE: list every prose claim made in LEAD enrichment with a
 * corresponding verification call. Empty array fails the conformance test.
 *
 * Each entry: { id, prose, verify: () => Promise<{ok, evidence}> }
 */
const claims = [
  // EXAMPLE C1 — uncomment and customize:
  // {
  //   id: 'C1',
  //   prose: 'origin/main does not yet contain LEGACY_HARNESS_BACKLOG_FALLBACK',
  //   verify: () => verifyOriginMainPremise({
  //     claim: 'LEGACY_HARNESS_BACKLOG_FALLBACK absent on origin/main',
  //     witnessFile: 'scripts/modules/sd-next/data-loaders.js',
  //     expectedAbsent: /LEGACY_HARNESS_BACKLOG_FALLBACK/,
  //   }),
  // },
  // EXAMPLE C2 — uncomment and customize:
  // {
  //   id: 'C2',
  //   prose: 'metadata.deferred_from_sd_key joins quick_fixes.escalated_to_sd_id',
  //   verify: async () => {
  //     const supabase = createClient(
  //       process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  //       process.env.SUPABASE_SERVICE_ROLE_KEY,
  //     );
  //     return verifyJoinShape({
  //       leftTable: 'feedback', leftCol: 'metadata->>deferred_from_sd_key',
  //       rightTable: 'quick_fixes', rightCol: 'escalated_to_sd_id',
  //       supabase,
  //     });
  //   },
  // },
  // EXAMPLE C3 — uncomment and customize:
  // {
  //   id: 'C3',
  //   prose: 'emit-feedback is the single canonical helper for feedback table writes',
  //   verify: () => verifyHelperCoverage({
  //     helperFile: 'lib/governance/emit-feedback.js',
  //     table: 'feedback',
  //     repoRoot: REPO_ROOT,
  //   }),
  // },
];

/**
 * Optional override — used when a verification legitimately fails but caller
 * has reviewed the evidence. Rationale must be ≥30 chars.
 *
 * @type {string|null}
 */
const OVERRIDE_RATIONALE = process.argv.includes('--override')
  ? process.argv[process.argv.indexOf('--override') + 1]
  : null;

(async () => {
  if (claims.length === 0) {
    console.error('[lead-enrich] FAIL: claims[] is empty. Customize the template before running.');
    process.exit(1);
  }

  const results = [];
  let anyFail = false;

  for (const claim of claims) {
    let result;
    try {
      result = await claim.verify();
    } catch (err) {
      result = { ok: false, evidence: { error: String(err?.message || err) } };
    }
    results.push({ id: claim.id, prose: claim.prose, ok: result.ok, evidence: result.evidence });
    if (result.ok === false) anyFail = true;
    console.log(`[lead-enrich] ${claim.id} ok=${result.ok} :: ${claim.prose}`);
    if (result.ok !== true) {
      console.log('  evidence:', JSON.stringify(result.evidence, null, 2));
    }
  }

  if (anyFail && !OVERRIDE_RATIONALE) {
    console.error('\n[lead-enrich] FAIL: at least one claim verification returned ok=false.');
    console.error('Use --override "<rationale ≥30 chars>" to proceed with documented justification.');
    process.exit(1);
  }
  if (anyFail && OVERRIDE_RATIONALE && OVERRIDE_RATIONALE.length < 30) {
    console.error(`[lead-enrich] FAIL: --override rationale too short (${OVERRIDE_RATIONALE.length} < 30 chars).`);
    process.exit(1);
  }

  // Persist evidence onto SD metadata.lead_evaluation.precheck_evidence
  if (SD_UUID && SD_UUID !== 'CHANGE-ME-UUID') {
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', SD_UUID)
      .single();
    const meta = sd?.metadata || {};
    meta.lead_evaluation = meta.lead_evaluation || {};
    meta.lead_evaluation.precheck_evidence = {
      ran_at: new Date().toISOString(),
      sd_key: SD_KEY,
      override_used: Boolean(OVERRIDE_RATIONALE),
      override_rationale: OVERRIDE_RATIONALE || null,
      results,
    };
    await supabase
      .from('strategic_directives_v2')
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', SD_UUID);
    console.log(`[lead-enrich] Evidence persisted to ${SD_KEY}.metadata.lead_evaluation.precheck_evidence`);
  }

  console.log('[lead-enrich] PASS');
})();
