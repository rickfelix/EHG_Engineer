import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';

const newRisks = [
  {
    risk: 'RISK sub-agent (evidence 594115a9): sms_outbound_obligations is a live WORKER CLAIM QUEUE, not a passive record table. A receipt-derived trigger on .status could overwrite an in-flight status=sending claim before any provider receipt exists, causing the sweep to re-claim and re-send -- an unbounded resend loop against a real phone number (amplifies, not closes, the QF-394 class this SD exists to fix).',
    severity: 'high',
    mitigation: 'Sequence this instance LAST or split to its own follow-up SD; design a durable receipt-history table first (none exists today -- sms_status_staging is a 0-row transient buffer); ship uat_test_runs (cold, near-zero blast radius) as the pilot instance instead.'
  },
  {
    risk: 'RISK sub-agent (evidence 594115a9): strategic_directives_v2 (instance 1\'s home table) is documented in-repo (20260824_strategic_directives_canonical_writer_choke.sql) as trigger-hazardous -- CREATE TRIGGER takes ACCESS EXCLUSIVE, no lock_timeout for service_role/postgres, seq_scan=377,874, 68 write call-sites, >=8 existing triggers firing in alphabetical name order.',
    severity: 'high',
    mitigation: 'Any new trigger must SET lock_timeout explicitly (mitigation pattern already exists in-repo); name it to fire in the correct order relative to existing triggers; a BEFORE trigger returning NULL silently cancels the write -- test for this failure mode specifically, not just infinite recursion.'
  },
  {
    risk: 'RISK sub-agent (evidence 594115a9): fence_status_2026_08_17 exists on 3 SD rows (2 already status=completed), one with no venture_gate_last_verdict at all. A naive "key IS NOT NULL" trigger predicate would derive from a missing key and retroactively re-fence 2 completed SDs; the "detail" itself (venture_gate_last_verdict) is 46 days stale per the same row\'s own park_reason, and a 3rd disagreeing source (venture_gate_attestations) exists.',
    severity: 'high',
    mitigation: 'Scope the trigger to an explicit sd_key allowlist, never a pattern match; name the canonical detail source among the 3 candidates at PRD before deriving anything.'
  }
];

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, risks')
  .eq('sd_key', SD_KEY)
  .single();
if (error) { console.error('READ ERR', error.message); process.exit(1); }

const merged = [...(sd.risks || []), ...newRisks];
const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ risks: merged })
  .eq('id', sd.id);
if (updateErr) { console.error('WRITE ERR', updateErr.message); process.exit(1); }
console.log(`risks field updated: ${sd.risks?.length || 0} -> ${merged.length} entries.`);
