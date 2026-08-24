#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 FR-2/FR-4 -- ledger-shaped intake record.
 *
 * chairman_ratifications (database/chairman-gated/20260823_chairman_ratifications.sql) does not
 * exist live yet -- confirmed via to_regclass returning NULL -- and no separate ratification
 * intake-queue table exists either. FR-1/FR-2's dedup decisions are recorded here, in this SD's
 * own strategic_directives_v2.metadata, structured so a future small SD/QF can migrate them
 * verbatim into the real ledger once SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001's migration
 * is applied. This is NOT a live ledger write.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001';

const dedupDecisions = [
  {
    decision: 'Reconcile leo_protocol_sections rows 308/309/310 (duplicates diverged from canonical row 307, "Phase Transition Commands") to a neutral archived-duplicate marker; target_file nulled; content NOT copied from row 307.',
    rationale: 'Row 307 renders a known-superseded bypass-quota claim (3-per-SD-max/10-per-day-global) that CLAUDE.md\'s own live text says was corrected by build-vs-run deep-dive D9 (no per-SD cap, 2000/day global). Copying 307\'s current text into 308-310 would have propagated that error into 3 more rows -- the exact defect class this SD exists to fix.',
    evidence: ['sub_agent_execution_results:9dda91be-e56d-4e6a-a469-13d9571758c2 (Explore, phase=LEAD)', 'sub_agent_execution_results:069bc064-f76d-467f-b8c5-36710fd36c08 (VALIDATION, phase=LEAD)', 'sub_agent_execution_results:968f8f8c-fb3b-453a-b04b-49e57de47094 (TESTING, phase=PLAN)'],
    decided_by: 'fleet worker (session c29c1952-8d10-4a11-a71e-5ca637c41106), LEAD role, per CLAUDE_LEAD.md scope-correction authority',
    decided_at: new Date().toISOString(),
  },
  {
    decision: 'Reconcile leo_protocol_sections row 450 (byte-identical peer of canonical row 449, "migration_execution_protocol_lead/_plan") via lower-id tie-break; row 545 (byte-identical peer of canonical row 544, "handoff_precheck") likewise.',
    rationale: 'The two peers in each pair carried identical content with no basis to distinguish "canonical" otherwise -- lower id chosen as a deterministic, content-neutral tie-break rule.',
    evidence: ['sub_agent_execution_results:ff37f2d4-ecaa-4b13-8536-01565c9c43ab (RISK, phase=LEAD)', 'sub_agent_execution_results:968f8f8c-fb3b-453a-b04b-49e57de47094 (TESTING, phase=PLAN)'],
    decided_by: 'fleet worker (session c29c1952-8d10-4a11-a71e-5ca637c41106), LEAD role',
    decided_at: new Date().toISOString(),
  },
  {
    decision: 'Formalize row 416/567\'s existing AUTO-PROCEED spec retirement citation (metadata.publication_status=\'retired\' on row 416, corroborated by section-file-mapping.json\'s _removed_sections_note) -- confirmed sufficient, no new code change made.',
    rationale: 'The originating architecture eval claimed this 10.7KB spec was silently dark; LEAD-phase Explore verification found it already carried a citation. FR-2\'s job was to confirm and formalize that citation through this ledger-shaped record, not to add new fields to an already-adequate row.',
    evidence: ['sub_agent_execution_results:9dda91be-e56d-4e6a-a469-13d9571758c2 (Explore, phase=LEAD)'],
    decided_by: 'fleet worker (session c29c1952-8d10-4a11-a71e-5ca637c41106), LEAD role',
    decided_at: new Date().toISOString(),
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMetadata = {
  ...sd.metadata,
  dedup_decisions: {
    status: 'pending_migration_to_chairman_ratifications',
    note: 'chairman_ratifications does not exist live yet (staged, unapplied). These records are structured to migrate verbatim once that table applies -- see database/chairman-gated/20260823_chairman_ratifications.sql for the target schema.',
    decisions: dedupDecisions,
  },
};

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('id', sd.id);
if (updErr) { console.error('WRITE ERR', updErr.message); process.exit(1); }
console.log('OK: dedup_decisions ledger-shaped record written for', sd.id);
