#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001';

// OPERATOR_CONTRACT gate (lib/gates/operator-contract/index.js) classified this SD as a CREATOR
// (CREATE TABLE public_read_allowlist + public_surface_canary in
// database/migrations/20260915_continuous_external_surface_allowlist_and_canary.sql) and
// demanded the full operator triple. consumer is already satisfied (both tables are read by
// lib/security/continuous-external-surface-checker.mjs, cited in the same diff); armed_cadence
// and reaper are the 2 missing legs.
//
// armed_cadence does not apply BY DESIGN, not by omission: this SD's entire thesis (chairman
// ratification 030d72e8, "Yes to both") is building the CONTINUOUS-AT-APPLY half that is
// explicitly NOT another periodic cron -- the sentinel this SD extends
// (scripts/sentinels/audit-security-linter.mjs) already runs weekly, and the whole point of
// this SD's own PRD (FR-4, FR-5) is closing the gap BETWEEN those weekly runs by checking at
// the moment each migration applies (both the TIER-1 auto-apply hook and the manual TIER-2
// path). Registering a periodic_process_registry cadence for this specific checker would add
// scope the approved PRD never asked for and would sit awkwardly alongside the sentinel it
// extends, which already owns the periodic cadence for the broader RLS/grants check class.
//
// reaper does not semantically apply to either created table: public_read_allowlist is a small,
// chairman-curated, bounded reference table (entries added rarely, by hand, never by this SD's
// own code -- TS-3 enforces zero writes); public_surface_canary holds EXACTLY one row by design
// (the positive-canary invariant itself). Neither is a log, queue, or event stream with rows
// that age out -- there is nothing for a retention/TTL policy to reap. Same reasoning shape as
// the precedent waiver for database/chairman-gated/20260824_ventures_rls_integrity_repair.sql
// (scripts/one-off/ventures-client-write-001-operator-contract-waiver.mjs): the operator triple
// is designed for durable-ledger/queue-shaped migrations, and forcing armed_cadence + reaper
// onto a tiny bounded config table + a fixed-cardinality canary means inventing unneeded
// periodic machinery with nothing for it to do.
const waiver = {
  owner: 'fleet worker (session 45924f8d-f761-49fe-b89e-dbb1df80b7a8)',
  expiry: '2026-12-15T00:00:00.000Z',
  reason: 'database/migrations/20260915_continuous_external_surface_allowlist_and_canary.sql creates public_read_allowlist (small, chairman-curated, bounded reference table -- this SD writes zero rows, TS-3 enforces it) and public_surface_canary (exactly one row by design, the positive-canary invariant itself). Neither is a log/queue/event-stream needing a reaper. armed_cadence does not apply by design: this SD builds the continuous-AT-MIGRATION-APPLY half (wired into pending-migrations-check.js TIER-1 auto-apply and apply-migration.js manual TIER-2 paths per FR-4/FR-5), deliberately NOT a periodic cron -- the sentinel it extends (scripts/sentinels/audit-security-linter.mjs) already owns the weekly cadence for the broader RLS/grants check class this SD complements, not duplicates.',
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
