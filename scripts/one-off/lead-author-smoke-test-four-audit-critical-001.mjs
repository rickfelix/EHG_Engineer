#!/usr/bin/env node
// LEAD-phase: replace the generic auto-generated smoke_test_steps placeholder with a real
// 30-second demo (LEAD Q9 human-verifiable outcome).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run the pre-apply information_schema.columns verification query over the pooler for the 15 known-naive audit-critical columns (sd_phase_handoffs.{accepted_at,created_at,rejected_at}; strategic_directives_v2.{approval_date,archived_at,created_at,effective_date,expiry_date,updated_at}; quick_fixes.{completed_at,created_at,started_at}; user_stories.{completed_at,created_at,updated_at}).',
    expected_outcome: 'All 15 columns report data_type=\'timestamp without time zone\'; the already-aware columns on the same tables (resolved_at, completion_date, embedding_generated_at, quality_checked_at, not_before, e2e_test_last_run) report \'timestamp with time zone\', confirming the live mixed-representation baseline this SD closes.',
  },
  {
    step_number: 2,
    instruction: 'Inspect the staged migration file under database/chairman-gated/ and confirm it is inert.',
    expected_outcome: 'File exists with a blank @approved-by header and a paired _DOWN.sql; grep across scripts/ for the filename finds zero inline-apply callers; database/chairman-gated/README.md has a new "Applying <file>" entry documenting the ceremony command.',
  },
  {
    step_number: 3,
    instruction: 'Run the high-traffic JS-reader audit sweep (grep for created_at/age computations against the 4 tables across ehg/src and EHG_Engineer/{scripts,lib}) and review its output table.',
    expected_outcome: 'Every matched reader is classified SAFE (no timezone assumption) or FIXED (patch applied), with zero UNCLASSIFIED entries -- closing the folded-in JS-consumer half from SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001.',
  },
];

const { data: sd, error: readErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const { error: updErr } = await supabase.from('strategic_directives_v2').update({ smoke_test_steps }).eq('id', sd.id);
if (updErr) { console.error('UPDATE ERR:', updErr.message); process.exit(1); }
console.log('smoke_test_steps authored with a real 30-second demo.');
