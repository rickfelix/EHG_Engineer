#!/usr/bin/env node
/**
 * SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 — backfill the citation-carrying audit_log rows
 * for the QF-20260912-959 flag-arming/graduation event.
 *
 * Root cause (found by VALIDATION sub-agent, confirmed by direct probe): logAudit() in
 * lib/feature-flags/registry.js unconditionally passed `environment: environment || null` to
 * its insert into leo_feature_flag_audit_log, an updatable VIEW that rejects any insert
 * naming that column at all (even NULL) -- "cannot insert into column 'environment' of view".
 * Every application-level logAudit() call in that file has silently failed since inception;
 * the only rows that ever landed for these flags are DB-trigger-written (changed_by=NULL,
 * generic action), never carrying the actor citation. Fixed at the source in registry.js
 * (this SD) -- this script backfills the ONE historical event this SD's own promise depends
 * on: the chairman-cited arming/graduation that already happened live (Adam, 2026-09-12
 * ~21:29:09-10Z), so the audit trail actually carries the citation the governance rule
 * requires, instead of silently reading as an uncited raw update forever.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DECISION_CITATION = 'chairman_decision:6cb60a30-93d4-49a3-83b4-8e1ba1d49dd2';
const RATIFICATION_CITATION = 'chairman_ratification:b75ddfff-ea06-495d-a507-b887f1623eed';
const EVENT_AT = '2026-09-12T21:29:10.500000+00:00'; // just after the live trigger-written rows

const ENTRIES = [
  {
    flag_key: 'STAGE_GATE_PREDICATE_ARMED',
    action: 'transition',
    note: 'Armed to enabled via governed transitionLifecycleState -- 2 approvals (decision + ratification) already recorded in leo_feature_flag_approvals.',
  },
  {
    flag_key: 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED',
    action: 'update',
    note: 'Graduated via markRolledOut (rolled_out_at stamped) -- classifyFlag() stops recommending GRADUATE.',
  },
  {
    flag_key: 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED',
    action: 'update',
    note: 'Graduated via markRolledOut (rolled_out_at stamped) -- classifyFlag() stops recommending GRADUATE.',
  },
];

async function backfillOne({ flag_key, action, note }) {
  const { data: flag, error: flagErr } = await supabase
    .from('leo_feature_flags')
    .select('*')
    .eq('flag_key', flag_key)
    .single();
  if (flagErr || !flag) {
    throw new Error(`Flag '${flag_key}' not found: ${flagErr?.message}`);
  }

  // Idempotency: never insert a second citation row for the same flag+event.
  const { data: existing } = await supabase
    .from('leo_feature_flag_audit_log')
    .select('id')
    .eq('flag_key', flag_key)
    .eq('changed_by', DECISION_CITATION)
    .maybeSingle();
  if (existing) {
    console.log(`  ${flag_key}: citation row already present (id=${existing.id}), skipping`);
    return;
  }

  const { data, error } = await supabase.from('leo_feature_flag_audit_log').insert({
    flag_key,
    action,
    previous_state: { backfill_note: 'original state prior to the live 2026-09-12 apply not separately captured; see leo_feature_flags.created_at/updated_at history' },
    new_state: { ...flag, backfill_reason: note, cited_decision: DECISION_CITATION, cited_ratification: RATIFICATION_CITATION, backfilled_by: 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001' },
    changed_by: DECISION_CITATION,
    created_at: EVENT_AT,
  }).select().single();

  if (error) {
    throw new Error(`Backfill insert failed for '${flag_key}': ${error.message}`);
  }
  console.log(`  ${flag_key}: backfilled citation row id=${data.id}`);
}

async function main() {
  console.log('Backfilling citation-carrying audit_log rows for the QF-20260912-959 arming/graduation event:');
  for (const entry of ENTRIES) {
    await backfillOne(entry);
  }
  console.log('\nReadback:');
  const { data } = await supabase
    .from('leo_feature_flag_audit_log')
    .select('flag_key, action, changed_by, created_at')
    .in('flag_key', ENTRIES.map((e) => e.flag_key))
    .eq('changed_by', DECISION_CITATION);
  console.log(data);
  const pass = data && data.length === ENTRIES.length;
  console.log(pass ? '\n✅ All 3 flags now carry the chairman citation in their audit trail.' : '\n❌ Backfill incomplete');
  process.exitCode = pass ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('Backfill FAILED:', err.stack || err.message);
    process.exitCode = 1;
  });
}
