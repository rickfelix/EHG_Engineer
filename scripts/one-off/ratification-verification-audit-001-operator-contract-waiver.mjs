#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TABLE chairman_ratification_verifications in
// database/chairman-gated/20260911_chairman_ratification_verifications.sql, plus a writer
// inserting into it via lib/chairman/ratification-verification-store.mjs) and demanded the full
// operator triple (consumer, armed_cadence, reaper). consumer is present (the backfill script
// scripts/one-off/backfill-ratification-verification-audit-20260911.mjs reads the table back to
// determine already-audited rows, and the sibling migration-shape/unit tests exercise the same
// read path); armed_cadence and reaper are not, and correctly so -- same shape, same reasoning,
// as the precedent waiver granted for
// database/chairman-gated/20260823_chairman_ratifications.sql
// (scripts/one-off/chairman-ratification-ledger-operator-contract-waiver-001.mjs), which this
// migration is itself a sibling of (both under database/chairman-gated/, both chairman-ratified
// append-only ledgers).
const waiver = {
  owner: 'fleet worker (session 961a30d3-1a94-4f10-8b06-b48fa2306361)',
  expiry: '2026-11-24T00:00:00.000Z',
  reason: 'database/chairman-gated/20260911_chairman_ratification_verifications.sql is a chairman-gated, NOT-YET-APPLIED migration (@chairman-gated + @approved-by: PENDING) -- CREATOR classification (CREATE TABLE chairman_ratification_verifications + a writer insert via lib/chairman/ratification-verification-store.mjs) is correct from the diff text, but there is nothing live to arm a NEW cadence against yet: the table does not exist in production until the chairman ratifies and applies it, and the one-off legacy backfill (scripts/one-off/backfill-ratification-verification-audit-20260911.mjs) is an explicit single-operator-run script, not a recurring job -- there is no periodic process for this SD to register. Once applied, chairman_ratification_verifications is a PERMANENT, INSERT-only verification-attempt ledger (its own freeze/no_delete/no_truncate triggers enforce this, matching the pattern already ratified for chairman_ratifications and solomon_ledger_attestations) -- a reaper/TTL is semantically wrong for a governance audit trail that must never expire, and would in fact be BLOCKED by the very immutability triggers this migration ships. The operator triple\'s remaining two members belong to the follow-on chairman-apply-and-backfill work, not to this design-and-implement SD.',
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
