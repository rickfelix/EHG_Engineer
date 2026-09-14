#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine -- a boolean
 * attestation is explicitly rejected. Records the real file:line locations actually opened
 * and verified during this SD's investigation, by the party who opened each one.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';

const mechanismVerifications = [
  {
    verified_by: 'Golf (primary session)',
    verified_at: 'scripts/modules/rubrics/retrospective-quality-rubric.js:183',
    note: 'detectBoilerplate() static method confirmed to exist exactly as claimed, with BOILERPLATE_PATTERNS anchored to the fleet-wide template-assertion phrases'
  },
  {
    verified_by: 'Golf (primary session)',
    verified_at: 'scripts/modules/rubrics/retrospective-quality-rubric.js:500',
    note: 'confirmed the penalty-subtraction blend (adjustedScore = Math.max(0, adjustedScore - boilerplateResult.scorePenalty)) inside validateRetrospectiveQuality(), the mechanism this SD adds a regression guard for'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'scripts/modules/handoff/retrospective-enricher.js:451',
    note: 'confirmed enrichRetrospectivePreGate() builds SD-specific what_went_well/key_learnings content from git-diff file references and gate scores before the gate evaluates it'
  },
  {
    verified_by: 'VALIDATION sub-agent (independent re-verification)',
    verified_at: 'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js:97',
    note: 'independently re-ran the mutation test on the load-bearing assertion (deterministic penalty flips passed true->false despite a passing AI verdict) and reproduced the identical result'
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
