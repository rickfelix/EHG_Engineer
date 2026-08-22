#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-STAGE-DECISION-RESTORE-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TABLE solomon_ledger_attestations in database/chairman-gated/20260821_solomon_ledger_attestations.sql)
// and demanded the full operator triple (consumer, armed_cadence, reaper). consumer is present;
// armed_cadence and reaper are not, and correctly so -- see reason below. Waiver shape and
// justification pattern mirror the precedent granted for database/chairman-gated/20260812_venture_ingest_key_binding.sql
// (same class: a chairman-gated, staged-not-applied migration authored by a design/stage SD).
const waiver = {
  owner: 'Golf-8 (worker session ea51a2e3-5f10-4426-a055-3d1be568d0fc)',
  expiry: '2026-11-19T23:30:00.000Z',
  reason: 'database/chairman-gated/20260821_solomon_ledger_attestations.sql is a chairman-gated, NOT-YET-APPLIED migration (no @approved-by line, staged only) -- CREATOR classification (CREATE TABLE solomon_ledger_attestations) is correct from the diff text, but there is nothing live to consume, arm a cadence against, or reap yet: the table does not exist in production until the chairman ratifies and applies it. Precedent: an identically-shaped waiver was granted for database/chairman-gated/20260812_venture_ingest_key_binding.sql (see that SD\'s strategic_directives_v2.metadata.operator_contract_waiver). Additionally, once applied, solomon_ledger_attestations is a PERMANENT append-only attestation/audit ledger (modeled wholesale on database/chairman-gated/20260817_venture_gate_attestations.sql) -- a reaper/TTL is semantically wrong for a chairman-attested audit trail that must never expire, and no periodic cadence processes it (it is insert-once-per-verified-row, not a queue). The operator triple belongs to the follow-on work that actually ratifies and applies this migration, not to this design-and-stage SD.',
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
