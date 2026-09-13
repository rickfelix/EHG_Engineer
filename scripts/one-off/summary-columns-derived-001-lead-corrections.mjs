import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';

const addendum = `

LEAD VALIDATION CORRECTIONS (evidence row 09ac5c83-847a-4420-ac9f-172308a26b97, sub-agent VALIDATION, 2026-09-13): the premise above needs 4 corrections before PRD authoring, none of them killing the SD -- scope item (4)'s mandated schema walk would surface all of these anyway:
- F1: GENERATED ALWAYS is only viable where the summary is a genuine top-level column deriving from OTHER top-level columns of the SAME row. Instances 1 and 2 (fence_status_2026_08_17, control_pack_evaluated/control_pack_failures) are JSONB metadata KEYS, not top-level columns -- Postgres cannot make one key inside a jsonb blob individually generated while the rest of the blob stays manually writable. These two need the BEFORE INSERT/UPDATE TRIGGER alternative the scope already names, not GENERATED ALWAYS. Instance 3 (sms_outbound_obligations.status, derived cross-table from provider receipts) also requires a trigger, not a generated column.
- F2: The proposed CI lint (new *_evaluated/*_passed/*_verified BOOLEAN columns without a derivation) is DISJOINT from all 3 motivating incidents -- it would have caught zero of them (2 are jsonb keys, 1 is a text column, not a new top-level boolean). The lint's guarded predicate must be widened at PRD to cover jsonb-key summary flags and cross-table-derived status/text columns, or it does not actually close the class it was written to close.
- F3: Instance 3 (SMS) currently has NO durable, queryable table holding provider-receipt delivery-failure causes to derive from -- sms_status_staging is a 0-row transient drain buffer, not a store. Deriving sms_outbound_obligations.status from the newest provider receipt requires PRD to first design where that receipt history durably lives; this is implied but not explicit in the original scope and needs its own FR.
- F4: The "child-E fence reader" scope item (3) names has no live code today -- zero matches for fence_status_2026_08_17 in lib/ or scripts/. Nothing currently reads that key, so there is no reader to redirect for instance 1; only the WRITE-side derivation (trigger) applies there. Conversely, lib/eva/uat-robustness-gate.js (instance 2's named reader) was ALREADY deliberately changed by QF-20260830-666 to key on the boolean rather than absence-of-failures -- PRD must design a genuine reconciliation between that prior, deliberate fix and this SD's "key on the detail" principle, not a blind revert. Also: part of instance 3's remedy may already be shipped via QF-20260912-394 (merged, PR #8807) -- PRD should re-verify what remains before designing new reader changes for the SMS worker.
- Also corrected: the description's prior-art citations (compliance_experiment, its total_score/rating columns) do not exist in the live schema; the real existing GENERATED-column precedents are srip_quality_checks.passed and ai_gen_dwell_tracking.sufficient.
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
console.log('SD description updated with LEAD validation corrections.');
