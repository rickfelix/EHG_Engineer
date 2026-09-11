#!/usr/bin/env node
// GATE_MECHANISM_CLAIM_VERIFIER (LEAD-TO-PLAN) fix for SD-LEO-FIX-PRE-COMMIT-SECRET-001.
// The spine names three test files as mechanism witnesses; this records who actually opened
// each one and at what line, per the gate's remediation (metadata.mechanism_verifications).
// Worker Golf, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349, 2026-09-11.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-PRE-COMMIT-SECRET-001';
const VERIFIER = 'Golf (autonomous fleet worker, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349)';

const mechanism_verifications = [
  {
    verified_by: VERIFIER,
    verified_at: 'tests/unit/complete-quick-fix/merged-reconcile-verification.test.js:435',
    claim: 'Contains a secret-shaped fixture literal ("sk-live-ABCDEF1234567890abcdef" inside a curl-Authorization string) that a merge-basis-unaware Stage 1 scan would re-flag as newly added.',
    confirmed: 'Opened the file at this line and confirmed the literal is present in an assertion input, consistent with the incident narrative.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'tests/unit/hooks/notification-permission-wait.test.js:163',
    claim: 'Contains a secret-shaped fixture literal ("sk-live" + "TestKeyPlaceholder1234567890", concatenated here to avoid re-triggering this repo\'s own secret scanner) matching the SECRET_PATTERNS sk- regex, used as a redaction-test input.',
    confirmed: 'Opened the file at this line and confirmed the literal is present and matches the sk- + 20-or-more-alnum pattern (no internal hyphen breaking the run, unlike the other cited fixture).',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'tests/unit/husky/pre-commit-nonempty-index-guard.test.js:18',
    claim: 'The sibling husky-hook test harness pattern this SD\'s new regression test reuses: bashAvailable() (child_process.spawnSync probe) gating a describe.skip, plus fs.mkdtempSync (line 43) for a throwaway repo.',
    confirmed: 'Opened the file and confirmed the bashAvailable/spawnSync/mkdtempSync pattern at the cited lines (also independently confirmed by the LEAD-phase Explore pass, evidence id b559b83d).',
  },
];

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw fetchErr;

  const metadata = { ...(current.metadata || {}), mechanism_verifications };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK mechanism_verifications recorded for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
