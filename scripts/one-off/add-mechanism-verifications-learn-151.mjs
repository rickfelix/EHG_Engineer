#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';

const mechanismVerifications = [
  {
    verified_by: 'Golf (primary session)',
    verified_at: 'scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js:22',
    note: 'confirmed sdObjectivesDefined registrant, its score>=30 threshold (PAT-AUTO-b6e88bcc), and that it is the LIVE validator wired at validator-registry/index.js:38'
  },
  {
    verified_by: 'Golf (primary session)',
    verified_at: 'lib/eva/stage-templates/stage-14.js:38',
    note: 'confirmed the security object schema (authStrategy, dataClassification, complianceRequirements) is required and enforced -- PAT-LES-e72314a404ae is stale'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'lib/eva/stage-templates/analysis-steps/stage-01-hydration.js:50',
    note: 'confirmed live logger.log/logger.warn structured logging calls with entry/exit/duration timing -- PAT-LES-7fd10bfaf89a is stale'
  },
  {
    verified_by: 'VALIDATION sub-agent (independent re-verification)',
    verified_at: 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js:88',
    note: 'independently re-ran the mutation test on the boundary-case assertion (0 objectives + metrics, score=30) and reproduced the identical single-test kill when the live gate is reverted to its pre-fix formula'
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
