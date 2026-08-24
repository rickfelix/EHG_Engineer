#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TABLE leo_protocol_sections_history in
// database/chairman-gated/20260824_leo_protocol_sections_history.sql) and demanded the full
// operator triple (consumer, armed_cadence, reaper). consumer is present (the gate did not list it
// as missing); armed_cadence and reaper are not, and correctly so -- same shape, same reasoning,
// as the precedent waivers granted for
// database/chairman-gated/20260821_solomon_ledger_attestations.sql
// (scripts/one-off/lead-operator-contract-waiver-stage-decision-restore-001.mjs) and
// database/chairman-gated/20260823_chairman_ratifications.sql
// (scripts/one-off/chairman-ratification-ledger-operator-contract-waiver-001.mjs).
const waiver = {
  owner: 'fleet worker (session c29c1952-8d10-4a11-a71e-5ca637c41106)',
  expiry: '2026-11-24T00:00:00.000Z',
  reason: 'database/chairman-gated/20260824_leo_protocol_sections_history.sql is a chairman-gated, NOT-YET-APPLIED migration (approved-by line is an explicit <PENDING> placeholder, staged only) -- CREATOR classification (CREATE TABLE leo_protocol_sections_history) is correct from the diff text, but there is nothing live to arm a cadence against or reap yet: the table does not exist in production (to_regclass returns NULL, confirmed live) until the chairman runs the apply ceremony. Unlike a periodic-ingest table, this migration\'s own header states the table is PHASE-A LOG-ONLY audit trail written exclusively by its own AFTER-INSERT/UPDATE/DELETE triggers -- there is no batch job or cron process to arm a cadence for, and there never will be; every row lands synchronously inside the write transaction it observes. A reaper/TTL is also semantically wrong for this table by design: it is explicitly append-only with no_update/no_delete/no_truncate guards (ENABLE ALWAYS TRIGGER) and its own header says "this table has NO sanctioned mutation at all after insert -- pure append-only" -- a retention policy that ever deletes a row would be blocked by the very immutability triggers this migration ships, and would also defeat the audit trail\'s purpose (this SD exists specifically because the sibling doctrine-of-constraint trigger on the SAME table is confirmed blind; an audit log that can be reaped is not the fix). The operator triple\'s remaining two members belong to a genuinely different concern (an eventual coverage-monitoring cadence over the table\'s contents, proposed but explicitly NOT built by this SD\'s own FR-3 staged chairman-decision proposal) than a CREATE-TABLE waiver should try to satisfy speculatively.',
  granted_at: new Date().toISOString(),
};

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMeta = { ...(sd.metadata || {}), operator_contract_waiver: waiver };
const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMeta })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('Waiver written for SD', sd.id);
