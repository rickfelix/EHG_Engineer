#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-016, FR-2.
 *
 * Resolves issue_patterns row PAT-LES-2116dd961204: LEAD-phase investigation refuted its
 * premise (add-prd-to-database.js creates PRDs in draft status by default) against current
 * main -- the fix predates pattern detection by 7 months. Closed with a new direct
 * regression test (FR-1: tests/unit/prd/prd-creator-integration-default.test.js) rather than
 * a code change, plus a static dead-code guard (FR-3:
 * tests/unit/prd/prd-creator-dead-code-guard.test.js).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const PATTERN_ID = 'PAT-LES-2116dd961204';

const resolution_notes = 'REFUTED against current main (SD-LEARN-FIX-ADDRESS-PAT-LES-016, LEAD-phase, 2 independent verifications). '
  + 'The described gap does not exist: createPRDWithValidatedContent() (scripts/prd/prd-creator.js:460) has set status=\'approved\' '
  + 'unconditionally on every fresh PRD insert since commit a09c4e48 (2026-02-05, "add semantic concept mapping and auto-approve workflow") '
  + '-- over 7 months before this pattern was first detected (2026-09-12). The status=\'planning\' path (createPRDEntry(), '
  + 'scripts/prd/prd-creator.js:145) is dead code, documented as deprecated at scripts/prd/index.js:36, never invoked live. '
  + 'Empirically confirmed against the live database: product_requirements_v2 carried exactly two status values (approved, completed) '
  + 'across its entire population at investigation time -- zero draft, zero planning. '
  + 'Closed with a new direct regression test (tests/unit/prd/prd-creator-integration-default.test.js, FR-1, mutation-verified) '
  + 'asserting the correct fresh-insert-status behavior, plus a static dead-code guard '
  + '(tests/unit/prd/prd-creator-dead-code-guard.test.js, FR-3, mutation-verified) protecting against silent reintroduction of the described gap.';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('issue_patterns')
    .update({
      status: 'resolved',
      resolution_notes,
      resolution_date: new Date().toISOString(),
    })
    .eq('pattern_id', PATTERN_ID)
    .select('pattern_id, status, resolution_date')
    .single();

  if (error) { console.error('FAILED:', error.message); process.exit(1); }

  console.log('RESOLVED:', data.pattern_id, '-- status:', data.status, '-- resolution_date:', data.resolution_date);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
