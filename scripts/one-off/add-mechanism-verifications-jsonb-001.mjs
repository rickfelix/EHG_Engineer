#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine -- a boolean
 * attestation is explicitly rejected. Records the real file:line locations actually opened
 * and verified during this SD's LEAD-phase investigation, by the party who opened each one.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001';

const mechanismVerifications = [
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'lib/coordinator/safe-metadata-merge.mjs:49-207',
    note: 'confirmed mergeMetadataKeys/removeMetadataKey/removeMetadataKeyIfClaimedBy are all hard-coded to strategic_directives_v2 (sd_key or id column); no table/column parameters exist today'
  },
  {
    verified_by: 'Validation sub-agent (independent re-verification)',
    verified_at: 'lib/coordinator/safe-metadata-merge.mjs:28-30 (docblock) vs. live git grep',
    note: 'confirmed the docblock\'s "9 live production call sites" claim is a stale QF-20260902-928-era measurement; independently re-derived the real count as 28 call sites across 17 files via repo-wide git grep with alias resolution'
  },
  {
    verified_by: 'Bravo (primary session)',
    verified_at: 'lib/coordinator/reconcile-clone-tree-exclusion.js:75,83 and lib/checkin/steps/release-request.cjs:82-84',
    note: 'confirmed removeMetadataKey has exactly 1 production call site and removeMetadataKeyIfClaimedBy has exactly 1, both independently re-verified by Explore and Validation'
  },
  {
    verified_by: 'Validation sub-agent (independent re-verification, 5 searches with positive controls)',
    verified_at: '.artifacts/rca-jsonb-merge-detector.mjs (searched, absent) and lib/rca/rca-orchestrator.js:137 (the RCA finding\'s cited blind-replace instance)',
    note: 'confirmed the cited RCA prototype file does not exist anywhere in the repo (working tree, any branch, git history) via Glob/grep/git-log searches with positive controls proving the search tooling works; the SD description was corrected to remove this claim'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs:32,52,54-60,87,103-104,148-149',
    note: 'confirmed the lint excludes scripts/one-off/ (line 32), only flags .update({...metadata...}) containing a literal "..." spread within an 800-char window (lines 54-60), is hard-gated to files mentioning "strategic_directives_v2" literally (line 52, making it blind to product_requirements_v2-class defects), and only scans lib/+scripts/ (lines 103,148-149)'
  },
  {
    verified_by: 'Bravo (primary session)',
    verified_at: 'lib/coordinator/reconcile-clone-tree-exclusion.js:83 and lib/checkin/steps/release-request.cjs:84 (test mocks only, not real coverage)',
    note: 'confirmed via reading tests/unit/eva/clone-tree-exclusion-fail-open.test.js and tests/unit/fleet/release-request.test.js that removeMetadataKey/removeMetadataKeyIfClaimedBy have zero direct unit-test coverage of their real SQL -- only injected mocks in consumer tests'
  },
  {
    verified_by: 'Validation sub-agent (independent re-verification, live DB query)',
    verified_at: 'product_requirements_v2 (information_schema.columns, pg_trigger -- live DB, not docs/reference/schema/*.md)',
    note: 'confirmed PK=id (varchar PRD-SD-XXX, not UUID), metadata jsonb nullable default \'{}\'::jsonb, and 7 live triggers (not the 1 Explore initially cited), 4 of which fire on a metadata-only UPDATE -- de-risked by confirming 2 of those 4 are idempotent/non-destructive or already fire on every existing write path'
  },
  {
    verified_by: 'Validation sub-agent (independent re-verification, git ref comparison)',
    verified_at: 'git merge-base --is-ancestor origin/feat/SD-LEARN-FIX-ADDRESS-PAT-LES-012 origin/main (false) and git cat-file -e origin/main:scripts/one-off/backfill-integration-operationalization-v2.mjs (absent)',
    note: 'confirmed SD-LEARN-FIX-ADDRESS-PAT-LES-012 (the motivating incident\'s fix branch) is not merged to main -- 7 commits ahead, 39 behind -- and its product_requirements_v2 backfill scripts do not exist on origin/main today'
  },
  {
    verified_by: 'Validation sub-agent (independent re-verification, mandatory duplicate-implementation sweep)',
    verified_at: 'lib/fleet/qf-metadata-merge.mjs:15,50 and scripts/coordinator-backlog-rank.mjs:180',
    note: 'found (not requested by Explore) a PRIOR independent generalization attempt for the quick_fixes table whose own docblock cites safe-metadata-merge.mjs as "strategic_directives_v2-only by design", plus a 29th logical call site (coordinator-backlog-rank.mjs) that inlines the identical merge SQL, bypassing the helper\'s guard/audit path entirely and undetected by the lint'
  }
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

  const metadata = { ...existing.metadata, mechanism_verifications: mechanismVerifications };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) { console.error('FAILED:', error.message); process.exit(1); }

  console.log('UPDATED:', data.sd_key, '-- mechanism_verifications count:', mechanismVerifications.length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
