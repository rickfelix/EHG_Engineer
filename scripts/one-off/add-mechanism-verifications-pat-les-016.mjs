#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER (QF-20260727-982, LEAD-TO-PLAN) requires a NAME plus a
 * file:line citation for every file+function mechanism claim in the SD spine -- a boolean
 * attestation is explicitly rejected. Records the real file:line locations actually opened
 * and verified during this SD's LEAD-phase investigation into PAT-LES-2116dd961204's premise.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-016';

const mechanismVerifications = [
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'scripts/prd/prd-creator.js:460',
    note: 'createPRDWithValidatedContent() INSERT branch sets status: \'approved\' unconditionally ("Auto-approved: grounding validation passed") -- the only PRD-creation status value the live add-prd-to-database.js CLI path can produce.'
  },
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'scripts/prd/prd-creator.js:145',
    note: 'createPRDEntry() (the function that would produce status: \'planning\') is the ONLY status=planning/draft insert site in the file, and is dead code -- never invoked from any live caller.'
  },
  {
    verified_by: 'Alpha-2 (primary session)',
    verified_at: 'scripts/prd/index.js:36',
    note: 'confirmed the deprecation comment: "Note: createPRDEntry and updatePRDWithLLMContent are deprecated / We now use createPRDWithValidatedContent (generate-first pattern)" -- addPRDToDatabase() only calls createPRDWithValidatedContent (index.js:183,:211).'
  },
  {
    verified_by: 'Explore sub-agent (Task-tool, independent verification)',
    verified_at: 'scripts/prd/prd-creator.js:453-460',
    note: 'independently traced the identical live call path (add-prd-to-database.js -> prd/index.js addPRDToDatabase -> prd-creator.js createPRDWithValidatedContent) and confirmed the same file:line evidence, citing commit a09c4e48 (2026-02-05, "add semantic concept mapping and auto-approve workflow") as the origin of the auto-approve behavior -- REFUTED verdict, independently corroborating this session\'s finding.'
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
