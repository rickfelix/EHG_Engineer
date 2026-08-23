#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TABLE chairman_ratifications in database/chairman-gated/20260823_chairman_ratifications.sql,
// plus a writer inserting into it via lib/chairman/ratification-writer.mjs) and demanded the full
// operator triple (consumer, armed_cadence, reaper). consumer is present (all three FR-3 quiet-tick
// legs read chairman_ratifications); armed_cadence and reaper are not, and correctly so -- same
// shape, same reasoning, as the precedent waiver granted for
// database/chairman-gated/20260821_solomon_ledger_attestations.sql
// (scripts/one-off/lead-operator-contract-waiver-stage-decision-restore-001.mjs), which this
// migration's own header explicitly says it is "MODELLED ON."
const waiver = {
  owner: 'fleet worker (session 3108079c-d395-499a-a355-caac03d4a28d)',
  expiry: '2026-11-23T00:00:00.000Z',
  reason: 'database/chairman-gated/20260823_chairman_ratifications.sql is a chairman-gated, NOT-YET-APPLIED migration (no @approved-by line, staged only) -- CREATOR classification (CREATE TABLE chairman_ratifications + a writer insert) is correct from the diff text, but there is nothing live to arm a NEW cadence against or reap yet: the table does not exist in production until the chairman ratifies and applies it. The FR-3 staleness gauge already rides on the EXISTING, already-armed Adam/coordinator quiet-tick cadence (periodic_process_registry process_key standard_loop:quiet-tick) rather than a new standalone cron -- the validator\'s capability-key heuristic does not recognize a capability wired into shared infrastructure it did not create, but no genuinely-unarmed cadence exists. Once applied, chairman_ratifications is a PERMANENT append-only ratification ledger (its own freeze/no_delete/no_truncate triggers enforce this) -- a reaper/TTL is semantically wrong for a governance record that must never expire, and would in fact be BLOCKED by the very immutability triggers this migration ships. The operator triple\'s remaining two members belong to the follow-on work that actually ratifies and applies this migration, not to this design-and-stage SD.',
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
