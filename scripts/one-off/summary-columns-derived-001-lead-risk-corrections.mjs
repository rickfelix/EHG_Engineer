import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';

const addendum = `

LEAD RISK ASSESSMENT (evidence row 594115a9-a49c-4a0c-b1af-68f62c38676a, sub-agent RISK, 2026-09-13, overall=HIGH, not blocking -- approve with a mitigation plan owed at PLAN):
- R1 (highest-severity, sequencing-changing): instance 3 (sms_outbound_obligations) is a live WORKER CLAIM QUEUE (claimed_by/claimed_at/attempts/not_before), not a passive record table -- 1,327 rows, ~19 writes/day, ~17 status write sites in lib/chairman/sms-outbound-worker.js. The worker claims a row by writing status='sending' BEFORE any provider receipt exists; a receipt-derived trigger would overwrite that claim mid-flight, causing the sweep to re-claim and re-send -- an UNBOUNDED RESEND LOOP AGAINST A REAL PHONE NUMBER, i.e. amplifying the exact QF-394 defect class this SD exists to close, not closing it. Recommended sequencing: uat_test_runs (cold, 26 rows, ~6/day, near-zero blast radius) FIRST as the pilot; strategic_directives_v2 only after R2/R3 below resolve; SMS LAST or descoped to its own follow-up SD with a durable receipt-history table designed first (also needed per F3 above).
- R2: strategic_directives_v2 (instance 1's home table) is documented in-repo as trigger-hazardous: database/migrations/20260824_strategic_directives_canonical_writer_choke.sql states CREATE TRIGGER takes ACCESS EXCLUSIVE (blocks reads), service_role/postgres have no lock_timeout, and seq_scan=377,874 -- a hot apply can hang every worker session fleet-wide. 6,269 rows, ~63 distinct rows touched/24h, 68 write call-sites, 2,553 referencing files, plus claim_sd/switch_sd_claim SECURITY DEFINER RPCs. Any new trigger here needs an explicit SET lock_timeout (mitigation pattern already exists in that migration) and must account for >=8 existing triggers firing in alphabetical NAME order (a BEFORE trigger returning NULL silently CANCELS the write -- the real bug mode here, not infinite recursion).
- R3: the "detail" for instance 1 (venture_gate_last_verdict) is ITSELF stale -- venture_gate_last_checked_at=2026-07-28 (46 days old), and the SAME row's own park_reason says verbatim "needs a governed re-measure writer, not a hand edit." A THIRD source (venture_gate_attestations id=3, verdict=PASS, enforcement_strength=convention) disagrees again. PLAN must name the canonical source among three before deriving anything -- deriving now would mechanize the wrong half, silently, on every future write.
- R4: fence_status_2026_08_17 exists on 3 rows, not 1 -- 2 are status=completed, and one of those (SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A) carries the summary key with NO venture_gate_last_verdict at all. A naive "key IS NOT NULL" predicate derives from a missing key on that row and retroactively re-fences 2 already-completed SDs. PLAN needs an explicit sd_key allowlist scoping the trigger, not a pattern match (46 distinct fence/verdict key spellings exist table-wide -- a LIKE predicate would widen silently).
- R5: the SD's own scope text already contains a live predicate bug for instance 2: uat_test_runs' newest row (84d310e1) has control_pack_failures = JSON null, which IS NOT NULL in SQL -- a literal "IS NOT NULL" derivation would assert "evaluated" for a control pack that never ran. Needs jsonb_typeof(...) != 'null', not a bare IS NOT NULL. The scope text also states two different predicates for the same pair (scope item 1 says "IS NOT NULL", scope item 3 says "present-and-empty") -- PLAN must pick one and reconcile.
- R6: database/migrations/20260824_... (the delivery_status_source column instance 3 would need) has sat UNAPPLIED for 19 days despite living in the auto-apply migrations/ directory -- "staged and it lands" is a false assumption for this instance; the SMS worker already carries a defensive PGRST204 fallback because this exact gap burned them before.
- R7: DOWN-migration siblings can reverse the TRIGGER (DROP TRIGGER) but cannot un-derive already-overwritten DATA -- schema-only rollback, not a data rollback. The UP migration needs to capture pre-derivation values before applying, if a real rollback is ever needed.
- R8: the stated success metric ("zero rows disagree") is not enforceable as an acceptance test through every write path: scripts/database-architect-execute-via-psql.sh can DISABLE TRIGGER, and anon-key writers to some of these tables are ALREADY silent 0-row no-ops -- an acceptance test routed through an anon client would pass without the trigger ever firing. PLAN needs a real trigger-is-active assertion (e.g. reading pg_trigger), not just a data-agreement query.
- Also: no exec_sql/execute_sql/run_sql RPC is exposed in this project, so PLAN cannot enumerate live triggers programmatically from the app layer -- the live trigger inventory (>=8 on strategic_directives_v2 alone) must be confirmed via a real psql session before authoring new trigger DDL, not via grep over migration files (a file's presence is a ceremony marker, not proof of live application -- 133 chairman-gated files exist in exactly this unapplied state at any time).
`;

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, description')
  .eq('sd_key', SD_KEY)
  .single();
if (error) { console.error('READ ERR', error.message); process.exit(1); }

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description: sd.description + addendum })
  .eq('id', sd.id);
if (updateErr) { console.error('WRITE ERR', updateErr.message); process.exit(1); }
console.log('SD description updated with LEAD risk assessment corrections.');
