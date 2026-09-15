#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { captureCompletionFlags, formatCompletionFlagsBlock } from '../capture-completion-flags.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOSE-PUBLIC-READ-001';

const flags = [
  {
    type: 'needs_decision',
    description: 'UNCLAIMED, CHAIRMAN-FLAGGED SECURITY GAP: 13 live tables (door_routing_ledger, scope_completion_chain, north_star, selection_postures, venture_experience_review_runs, coverage_matrix, coverage_matrix_rotation_runs, sourcing_chairman_queue, v_id, claim_rejects, venture_preview_instances, v_hc_flag_enabled, v_s22_flag_enabled) carry the same public-read exposure the chairman\'s Advisors scan flagged (readable by anon key, zero row-level protection), but need per-table row-level-security policy decisions rather than removal -- some may be deliberately public for a dashboard. Confirmed via a duplicate-scope search this SD: no existing SD (draft, active, or completed) covers this work. Key rotation is also outstanding, deliberately sequenced after this decision since rotating the project secret invalidates the service-role key every live fleet seat currently uses. This is real, unclaimed, chairman-directed security work -- not deferred by oversight, but explicitly out of THIS SD\'s narrow scope per its own FR-3.',
  },
  {
    type: 'note',
    description: 'A false completion-verification claim was caught and resolved on this chairman-directed security action: SD metadata recorded the 23-table drop as already applied and verified (0/23 present) at a specific timestamp, but an independent re-check (via Supabase-js) initially read all 23 tables as still present. Root-caused to PostgREST schema-cache staleness after DDL applied via a direct pg connection -- confirmed by testing the coordinator\'s offered explanation directly (a raw pg connection to information_schema, bypassing PostgREST) rather than accepting either claim on authority. The drop genuinely was applied; independently re-confirmed 4 separate times across this SD\'s phases. Worth a durable process note: prefer a direct pg connection over Supabase-js for any future migration-apply-state verification.',
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
