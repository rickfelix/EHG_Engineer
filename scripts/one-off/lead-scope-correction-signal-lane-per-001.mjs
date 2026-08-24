#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 -- LEAD-phase round-2 correction.
 *
 * VALIDATION (sub_agent_execution_results eb009c8e-0ec1-49ec-bef7-b8cc2ff20d01, CONDITIONAL_PASS 88)
 * independently re-verified the Explore premise-verification pass and found 2 real HIGH findings
 * the Explore pass missed. Folding both into risks + scope so PLAN's PRD is required to resolve
 * them before EXEC, per the recommendation "proceed to PLAN, the PRD must resolve the two HIGH
 * conditions before EXEC."
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SIGNAL-LANE-PER-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, scope, risks, mechanism_verifications:metadata->mechanism_verifications, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const additionalRisks = [
  {
    risk: "FR-3's backfill, if it reuses coordinator-ack-signal.cjs's writer unmodified, would corrupt the answered-rate ledger: the writer hardcodes disposition:'ACTIONED' and isRetention:false unconditionally (coordinator-ack-signal.cjs:99,102), so backfilling 262 rows would flatten 10 distinct hand-stamped dispositions to a single generic 'actioned' value AND inject 262 rows indistinguishable from genuine coordinator answers into the answered-rate ledger (~9% numerator inflation on a 2,864-row ledger, 610 of which are signal receipts today) -- the exact defect is_retention was purpose-built to prevent (coordination_receipts migration comment: 'must never again be indistinguishable from one'). source_age_ms computed at backfill time would also record up to 38h fake answer latencies.",
    impact: 'high',
    likelihood: 'high',
    mitigation: "FR-3's backfill MUST NOT call the FR-1 writer unmodified for already-hand-stamped rows: either (a) route backfilled rows through a distinct isRetention:true path that preserves the original hand-stamped disposition text rather than flattening to ACTIONED, or (b) exclude backfilled rows from the answered-rate ledger entirely. PLAN's PRD must specify which, with a test asserting the answered-rate ledger's numerator is unchanged by a backfill run.",
  },
  {
    risk: "A dormant THIRD acknowledged_at writer already exists (lib/coordinator/signal-router.cjs:337-432 -- shouldRouteLone/stampRoutedToCoordinator/ackAndRouteLoneSignal, from SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001), self-documented as unreachable with 0 rows ever produced. It stamps acknowledged_at with NO receipt-ledger call -- the same 'looks closed but is invisible to measurement' defect this SD's Risk #1 names for FR-1. FR-4 (lone non-promoted signal handling) is the most likely place EXEC wires into this exact dormant path, and the SD's 'extend, don't duplicate' principle was applied to FR-1 but never explicitly to this third writer. Additionally, this dormant path has a fixture-blind bug: loadRecentSignals doesn't select acknowledged_at but branches on it, so in production the idempotency guard can never fire (re-stamps every tick) -- its test suite only passes because every mock row hand-supplies the field.",
    impact: 'high',
    likelihood: 'medium',
    mitigation: "PLAN's PRD must explicitly decide FR-4's relationship to signal-router.cjs:337-432: either wire FR-1's canonical writer through it (adding the missing receipt-ledger call and fixing the loadRecentSignals select-list gap) or retire the dormant path entirely if FR-1/FR-4 supersede it -- never leave both live. A test must prove the idempotency guard actually fires against a real (not hand-supplied) row shape.",
  },
  {
    risk: "The existing SIGNAL_RESOLVED loop has NEVER fired in production (0 rows ever carried routed_to_sd_key, 0 notification_sent, 0 SIGNAL_RESOLVED messages sent) -- it is zero-yield, not merely narrow. smoke_test_steps[4] (asserting promotion alone doesn't fire SIGNAL_RESOLVED) is therefore vacuous as currently scoped: it would pass identically against a completely broken FR-4 implementation. The candidate query also has .limit(50) with no ORDER BY, invisible today at pool size 0 but a starvation risk once FR-4 widens the trigger against 262 candidate rows.",
    impact: 'medium',
    likelihood: 'medium',
    mitigation: "PLAN's PRD must add a POSITIVE control alongside smoke_test_steps[4]: a fixture asserting SIGNAL_RESOLVED DOES fire for a genuinely lone-dispositioned signal, not just that it doesn't fire for promotion-alone. Add explicit ORDER BY (e.g. created_at ASC) to the candidate query before FR-4 widens its result set.",
  },
];

const scopeAddendum = `

## LEAD round-2 correction (VALIDATION sub_agent_execution_results eb009c8e-0ec1-49ec-bef7-b8cc2ff20d01, CONDITIONAL_PASS 88)
Independent re-verification confirmed all 7 mechanism_verifications citations accurate and the corrected 262-row live count exact, but surfaced 2 additional HIGH findings the LEAD-phase Explore pass missed (see risks): FR-3's naive backfill would corrupt the answered-rate ledger by ~9%, and a dormant third acknowledged_at writer (signal-router.cjs:337-432, 0 rows ever produced, no receipt-ledger call, fixture-blind idempotency bug) is the most likely place FR-4 gets wired and must not be left as a second silent-close path. PLAN's PRD MUST resolve both before EXEC -- also address: vocabulary reconciliation (this SD's proposed 5-value set vs the existing 3-value ACTIONED/DECLINED/SUPERSEDED enum, noting buildReceipt:89 silently drops unlisted values), an explicit FR-1-before-FR-3 ordering dependency, a concrete success criterion for FR-3, and a bound numeric SLA value for success_criteria[0] (currently unbound prose).`;

const updErr1 = await supabase
  .from('strategic_directives_v2')
  .update({
    scope: sd.scope + scopeAddendum,
    risks: [...(sd.risks || []), ...additionalRisks],
  })
  .eq('id', sd.id);
if (updErr1.error) { console.error('WRITE ERR', updErr1.error.message); process.exit(1); }
console.log('OK: LEAD round-2 correction applied for', sd.id);
