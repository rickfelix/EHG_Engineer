#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (kind FLAG: database/migrations/20260823_register_path_integrity_flags.sql INSERTs two
// leo_feature_flags rows -- PATH_INTEGRITY_EXIT_GATE_ENFORCE, PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH)
// and demanded the full operator triple (consumer, armed_cadence, reaper). PLAN-TO-LEAD failed with
// OPERATOR_CONTRACT_INCOMPLETE -- missing: consumer, armed_cadence (reaper auto-passes: validateReaper
// short-circuits reaper_present=true whenever createdTables is empty, and a flag-only creator creates
// no table).
//
// consumer is REAL and citable, not waived: detectWiring() is JS/TS-only (`.from(table).verb()`
// regex against changed files) and cannot see a SQL-file `INSERT INTO leo_feature_flags`, so the
// blocking creator path's validateConsumer() call never received the read half automatically. But
// lib/eva/stage-execution-worker.js -- itself in this diff -- reads both flags directly inside
// _advanceStage() (harness-adapter.js:341's own in-code comment names this exact shape: "a FLAG
// creator that DOES ship a reader returned passed:false missing:[consumer]"). Citing the actual
// read sites satisfies the consumer leg honestly.
const consumerEvidence = [
  {
    consumer: 'lib/eva/stage-execution-worker.js:3134',
    observed_read: "_advanceStage()'s FR-1 path-integrity choke-point reads leo_feature_flags.is_enabled WHERE flag_key='PATH_INTEGRITY_EXIT_GATE_ENFORCE' immediately before the exit-gate/thesis-kill/gate-debt composite check; ON blocks the raw ventures UPDATE on a fired limb, OFF logs an observe-only PATH_INTEGRITY_WOULD_BLOCK system_events row via _emitPathIntegrityEvent.",
  },
  {
    consumer: 'lib/eva/stage-execution-worker.js:2918',
    observed_read: "_advanceStage()'s FR-4 product-review choke-point reads leo_feature_flags.is_enabled WHERE flag_key='PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH' as an operator escape hatch inside the evaluator-error catch block, restoring pre-fix fail-open behavior only when explicitly enabled.",
  },
];

// armed_cadence CANNOT be satisfied by doing the right thing, and not because of a detection gap:
// validateCadence() requires a periodic_process_registry row keyed to a capability derived from
// createdTables (t, `${t}-sweep`, `${t}-reaper`, ...). createdTables is genuinely empty for this SD
// (it creates no table, only two boolean flags), so there is no capability key to look up and no
// row that could ever exist to satisfy it. A feature-flag toggle is read INLINE on every
// _advanceStage() call -- the opposite of a periodic sweep -- so "armed cadence" does not apply to
// this creator kind. Same reasoning validateReaper() already applies automatically for reaper
// (createdTables.length === 0 -> reaper_present=true); armed_cadence has no equivalent auto-pass,
// so a waiver is the only exit, per harness-adapter.js:343's own comment ("A gate that cannot be
// satisfied by doing the right thing leaves a waiver as the only exit").
const waiver = {
  owner: 'Golf (worker session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
  expiry: '2026-11-23T00:00:00.000Z',
  reason: 'FLAG creator (leo_feature_flags rows PATH_INTEGRITY_EXIT_GATE_ENFORCE, PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH via database/migrations/20260823_register_path_integrity_flags.sql) with a genuine, cited consumer (metadata.consumer_evidence, both flags read inline in lib/eva/stage-execution-worker.js _advanceStage()) but no created table, hence no operator_capability_keys for validateCadence() to look up and structurally no periodic_process_registry row that could ever satisfy armed_cadence -- a boolean toggle read on every stage-advance call is the opposite of a periodic cadence. reaper already auto-passes for the same createdTables-empty reason (validateReaper index.js:378). Only the armed_cadence leg is waived; consumer is satisfied honestly via citation, not waived.',
  granted_at: new Date().toISOString(),
};

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMeta = { ...(sd.metadata || {}), consumer_evidence: consumerEvidence, operator_contract_waiver: waiver };
const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMeta })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('consumer_evidence + operator_contract_waiver written for SD', sd.id);
