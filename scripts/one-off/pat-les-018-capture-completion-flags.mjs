#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { captureCompletionFlags, formatCompletionFlagsBlock } from '../capture-completion-flags.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

const flags = [
  {
    type: 'note',
    description: "issue_patterns.proven_solutions for PAT-LES-455c48ba7d65 was mismatched to an unrelated fix (a retrospective-quality-trigger bug from the same origin SD's retrospective) rather than describing the actual user_stories CHECK-constraint finding. Not applied; the real root cause was independently re-derived from the origin SD's own retrospective text. Worth a follow-up look at the /learn pattern-extraction code path if this recurs elsewhere.",
  },
  {
    type: 'note',
    description: 'LEAD-FINAL-APPROVAL for this SD reported HANDOFF_RESULT=PASS SCORE=95 for this SD, then a separate auto-chain/cascade step attempted to continue into an unrelated, unclaimed SD (SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001), which failed with GATE_CLAIM_VALIDITY_FAILED and exit code 1. This SD\'s own completion was independently confirmed via direct DB query (status=completed, current_phase=COMPLETED) before proceeding -- the cascade failure did not affect this SD\'s own outcome, but the misleading top-level \'HANDOFF FAILED\' banner on an otherwise-successful handoff is worth flagging.',
  },
];

const reflection = { asked: true, checklist_items: 4, gaps_found: 2 };

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const results = await captureCompletionFlags({ supabase, sdKey: SD_KEY, flags, reflection });
  console.log(formatCompletionFlagsBlock(results));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
