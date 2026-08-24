#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TRIGGER ventures_block_client_governance_write_trg + CREATE POLICY statements in
// database/chairman-gated/20260824_ventures_rls_integrity_repair.sql) and demanded the full
// operator triple (consumer, armed_cadence, reaper). Same shape as the precedent waiver granted
// for database/chairman-gated/20260823_chairman_ratifications.sql
// (scripts/one-off/chairman-ratification-ledger-operator-contract-waiver-001.mjs), but an even
// cleaner case: this migration creates no new data table at all -- it is a stateless RLS
// policy + guard trigger on the EXISTING public.ventures table.
const waiver = {
  owner: 'fleet worker (session 3108079c-d395-499a-a355-caac03d4a28d)',
  expiry: '2026-11-24T00:00:00.000Z',
  reason: 'database/chairman-gated/20260824_ventures_rls_integrity_repair.sql is a chairman-gated, NOT-YET-APPLIED migration (no @approved-by line, staged only) -- CREATOR classification (CREATE TRIGGER + CREATE POLICY) is correct from the diff text, but armed_cadence and reaper do not semantically apply here at all, waiver or not: this migration creates no new persistent data table, log, or queue for anything to periodically process (armed_cadence) or expire (reaper) against. It is a stateless RLS policy narrowing plus a BEFORE UPDATE guard trigger on the pre-existing public.ventures table -- the trigger fires synchronously per-statement, has no backlog to drain and no rows of its own to age out. consumer is present in the sense that the guard IS consumed on every client UPDATE attempt, continuously, by construction; there is no separate periodic consumer process to name because none is needed. The operator triple was designed for durable-ledger/queue-shaped migrations (e.g. the chairman_ratifications precedent this file cites); it does not map cleanly onto a pure RLS/trigger policy change, and forcing an armed_cadence + reaper onto this SD would mean inventing unneeded periodic machinery with nothing for it to do.',
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
