#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-PART-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a TABLE
// CREATOR (database/migrations/20260913_mock_outreach_personas.sql: CREATE TABLE
// mock_outreach_personas) and demanded the full operator triple. CONSUMER and REAPER are both
// genuinely shipped in this SD, not waived: authorSyntheticPersona()/authorMockContent() (lib/
// marketing/synthetic-personas.js) are the consumer-side writers the registry exists to serve,
// and lib/retention/policies.js now carries a real { table: 'mock_outreach_personas',
// timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS } entry (verified: tests/unit/
// retention/retention-policy.test.js updated to 24 tables, passing). Only armed_cadence is
// waived here.
//
// armed_cadence does not semantically apply to this table: mock_outreach_personas rows are
// authored ONCE, synchronously, at the moment a mock run explicitly declares a persona -- there
// is no backlog/queue of unprocessed personas for a periodic cron to drain. The operator triple's
// armed_cadence member exists for tables a periodic process must sweep (a pending-approval queue,
// a staging table awaiting relay); this table has no such shape, same precedent as the stateless-
// change waiver granted in scripts/one-off/ventures-client-write-001-operator-contract-waiver.mjs
// ("forcing an armed_cadence onto this SD would mean inventing unneeded periodic machinery with
// nothing for it to do") -- except here the table itself is real and its reaper is real; only the
// cadence member is inapplicable.
const waiver = {
  owner: 'fleet worker Alpha (coordinator 3616c697-916a-4e60-bc83-be29c9557d71, session 64728de4-8120-4470-810e-425fdcc34d47)',
  expiry: '2026-12-15T00:00:00.000Z',
  reason: 'mock_outreach_personas rows are authored once, synchronously, at mock-run-declaration time by authorSyntheticPersona() (lib/marketing/synthetic-personas.js) -- the consumer this SD ships. There is no backlog/queue of unprocessed personas for a periodic armed_cadence to drain; the table has a real reaper (lib/retention/policies.js, DEFAULT_HOT_DAYS, keyed on created_at) shipped in this same SD, verified by tests/unit/retention/retention-policy.test.js (24 tables, passing). Only armed_cadence is waived -- consumer and reaper are both genuinely delivered, not waived.',
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
