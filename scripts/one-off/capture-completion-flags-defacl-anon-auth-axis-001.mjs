#!/usr/bin/env node
// Direct import of captureCompletionFlags (bypasses the CLI's argv, which PowerShell's
// native-command quoting kept mangling for embedded-JSON-with-quotes arguments).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { captureCompletionFlags, formatCompletionFlagsBlock } from '../capture-completion-flags.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const flags = [
  {
    type: 'needs_decision',
    item: '60 BYPASSRLS-owner SECURITY DEFINER functions across public+governance+portfolio schemas are anon/authenticated-executable; this SD\'s coordinator-approved scope covers only the 28+41 public-schema subset (FR-6, PRD risks). Needs a decision on whether to file a follow-up SD for governance/portfolio-schema triage.',
  },
  {
    type: 'needs_decision',
    item: 'Both staged migrations (this SD\'s per-role defacl REVOKE, and the predecessor SD\'s existing-surface REVOKE) remain UN-APPLIED pending a chairman ceremony -- by design (chairman-gated, never inline). No code gap; flagging so the ceremony-scheduling decision stays visible rather than assumed-done because the SD shows completed.',
  },
  {
    type: 'already_homed',
    item: "exec_sql RPC wrapper falsely rejects multi-line/indented SQL text with a 42501 error even for plain SELECT statements.",
    existing_id: '8dc8dc44-cb9c-4e39-83d3-88ee56f49403',
  },
  {
    type: 'already_homed',
    item: 'sd_scope_deliverables auto-completion trigger did not fire for 2 of 6 genuinely-delivered rows, causing a false SCOPE_AUDIT gate failure that required manual correction.',
    existing_id: '613051d5-416f-4268-9b6d-ab50a6d462c2',
  },
  {
    type: 'already_homed',
    item: 'GATE3_TRACEABILITY has no full-credit bypass for category=security + zero-UI SDs (only database/infrastructure/refactor), forcing a category-reclassification workaround to pass.',
    existing_id: 'bf4edfe6-2659-4c1b-88ec-73d485d9ad30',
  },
  {
    type: 'already_homed',
    item: "CLAUDE_PLAN.md's 'Testing Tier Strategy (Updated)' heading is empty -- no documented infra/security/no-UI E2E exemption exists despite this SD needing one.",
    existing_id: 'f61c145e-78b9-41ee-9a5e-b61c58c1d519',
  },
];

const reflection = { asked: true, checklist_items: 6, gaps_found: 2 };

const results = await captureCompletionFlags({ supabase, sdKey, flags, reflection });
console.log(formatCompletionFlagsBlock(results));
