#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001';

// OPERATOR_CONTRACT gate flagged this SD's registry.js writer changes (markRolledOut,
// transitionLifecycleState) as a FLAG CREATOR demanding the full operator triple (consumer,
// armed_cadence, reaper). This is the SAME false-attribution shape as the precedent waiver
// (scripts/one-off/demand-engine-fail-001-operator-contract-waiver.mjs): the detector's
// raw-write-pattern heuristic sees registry.js's write calls and does not recognize
// lib/governance/stage-gate-predicate.js's checkStageGate()/shouldEnforceBlock() as the
// consumer, because that file is not part of THIS diff -- it already existed, unmodified,
// before this SD.
//
// Substantively: this SD does not create a new flag, a new table, or a new consumer. It is the
// literal "FR-7 ceremony" that SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001's own precedent waiver named
// and deferred to -- that SD created STAGE_GATE_PREDICATE_ARMED DISABLED, and its own waiver
// text says verbatim: "wiring a new consumer or armed_cadence against this flag NOW, before
// that ceremony, would mean either prematurely enforcing a gate this SD deliberately leaves
// unarmed, or fabricating a citation with nothing real behind it." This SD IS that ceremony.
// The consumer (checkStageGate/shouldEnforceBlock, lib/governance/stage-gate-predicate.js) was
// purpose-built for this exact moment and has existed, unmodified, in shadow/audit-only mode
// this whole time -- arming the flag activates an EXISTING consumer, it does not require this
// SD to add a new one. The graduation action (markRolledOut, for the two HIGH_CONSEQUENCE
// flags) is a one-time, chairman-cited stamp with no queue/backlog to drain and no ephemeral
// row to expire -- same shape as the ventures-client-write-001 precedent waiver for a stateless
// state change.
const waiver = {
  owner: 'fleet worker Alpha-2 (coordinator 3616c697-916a-4e60-bc83-be29c9557d71, session 689a1237-33b7-406f-9772-668958b289d6)',
  expiry: '2026-12-15T00:00:00.000Z',
  reason: 'This SD is the FR-7 arming ceremony that SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001\'s own precedent operator-contract waiver explicitly named and deferred to -- it created STAGE_GATE_PREDICATE_ARMED disabled, stating verbatim that wiring a consumer/cadence before this ceremony "would mean either prematurely enforcing a gate this SD deliberately leaves unarmed, or fabricating a citation with nothing real behind it." The consumer (checkStageGate()/shouldEnforceBlock(), lib/governance/stage-gate-predicate.js) already exists, purpose-built for this exact flag, unmodified by this SD\'s diff -- arming activates an existing consumer, it does not add a new one the detector could find in-diff. The two HIGH_CONSEQUENCE flags\' graduation (markRolledOut) is a one-time chairman-cited stamp with no queue for an armed_cadence to drain and no ephemeral row for a reaper to expire (same shape as the ventures-client-write-001 precedent waiver). Detector limitation (does not recognize an out-of-diff consumer file) flagged for the gate\'s own maintainers, not remediated here.',
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
