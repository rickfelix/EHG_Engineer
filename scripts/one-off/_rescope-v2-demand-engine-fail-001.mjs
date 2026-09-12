import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('scope, risks')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

const correctionAddendum = `

--- ADDENDUM (LEAD, Alpha-2, validation-agent evidence 2e1253ec-32fb-4c8f-8b9c-7f2c47b1b93d) ---

CORRECTION TO ITEM 5 ABOVE (mirror sites): DROP lib/services/sovereign-alert.js from the mirror-site list. It is an OPERATOR/CHAIRMAN emergency alerting path (Discord + a direct operator email), not customer outreach -- fireCalibrationEmergency/fireBudgetWarning/fireBudgetExhausted/fireSecurityViolation/fireCircuitBreaker. Gating it on go-live would suppress emergency operator alerts for every pre-go-live venture (currently all 171). The chairman ruling concerns real-customer contact; it does not reach operator telemetry. Mirror sites remain 5: publisher/index.js, email-campaigns.js processStep() (already gated) + sendEmail() (not gated, no bypassing production caller found but callable), venture-consent.js, the outbound-ledger DB trigger.

NEW BLOCKER, MUST RESOLVE BEFORE ARMING (not before building): SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (completed 2026-08-25, the SD that built lib/governance/stage-gate-predicate.js) attached an ATOMIC functional requirement to arming: "HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED and LEO_HIGH_CONSEQUENCE_GATES_ENABLED graduate as part of THIS SD, atomically with the predicate arming." Both flags are STILL is_enabled=true in leo_feature_flags today -- that FR was never discharged. This SD's arming step must either (a) also graduate/resolve those two flags atomically as that predecessor SD promised, or (b) get an explicit, documented waiver for deferring that obligation further, before flipping STAGE_GATE_PREDICATE_ARMED. Separately, that predecessor SD's precondition (b) was "a chairman ratification sitting" -- UNVERIFIED by either sub-agent pass; PLAN/EXEC must confirm this ratification exists before arming, or route through the chairman for it.

NEW STRUCTURAL RISK (GATE-ON-DEAD-INSTRUMENT, matches live pattern PAT-RCG-SOLO-MT8VUXZC): the corrected predicate's PASS side (launch_mode='live') has NEVER been exercised -- 0 of 171 ventures have launch_mode='live'; launch_mode_audit has 0 rows lifetime; the sole writer (lib/eva/launch-mode.js:228) is reachable only via the S24 go-live handler behind verifyExternalObservation(). This means the corrected gate, once armed, would be permanently CLOSED for every venture including AltifyAI (the roadmap-critical-path venture this SD exists to unblock) until something ELSE sets launch_mode='live' for it -- which is explicitly a SEPARATE chairman decision (excluded from this SD's own scope: "switching the venture to go-live (a separate chairman decision)"). PLAN must document this explicitly: Part A closes the safety gap (nothing publishes below go-live) but does NOT and CANNOT by itself unblock AltifyAI's real launch -- that still requires the separate chairman go-live decision this SD deliberately excludes. This is expected and correct (fail-closed is the safety property), but must not be presented as "this SD unblocks AltifyAI" without that caveat.

Blast radius corrected: NOT 3 ventures as originally estimated -- 28 non-cancelled-or-demo ventures at stage<24 flip from shadow-BLOCK to real ENFORCED-BLOCK the instant the flag arms (4 active: AltifyAI S23, ApexNiche AI S21, High-Cap Low-Success S2, Low-Cap Low-Success S1; 24 cancelled but still flip). This is the INTENDED effect (closing a real gap), not a defect, but PLAN should size the negative-test matrix accordingly (at minimum: AltifyAI and ApexNiche AI as the two live active below-go-live ventures).

Content-pipeline finding sharpened: owned-audience-content-loop.js:169-176 is WORSE than originally stated -- a dry-run publish does not merely skip a check, it WRITES marketing_content_queue.status='posted' to the DB and returns {ok:true, published:true}. A dry-run is persisted as a completed real publish, not just miscounted in memory.`;

const newScope = current.scope + correctionAddendum;

const newRisks = [
  {
    risk: "GATE-ON-DEAD-INSTRUMENT: the corrected predicate's PASS condition (launch_mode='live') has never been exercised for any of 171 ventures -- arming closes the gate for everyone, including AltifyAI, until a SEPARATE chairman go-live decision sets launch_mode='live'. This SD closes the safety gap; it does not and cannot unblock AltifyAI's launch by itself.",
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'Document explicitly in the PRD and in any status communication: Part A is a safety fix, not a launch-unblock. The separate go-live chairman decision remains a prerequisite for AltifyAI to ever pass the corrected gate.',
  },
  {
    risk: 'SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (completed) left an atomic FR undischarged: HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED and LEO_HIGH_CONSEQUENCE_GATES_ENABLED were supposed to graduate atomically with arming STAGE_GATE_PREDICATE_ARMED; both remain enabled today with no resolution. Arming this SD alone, without resolving that obligation, may violate the predecessor SD\'s own safety design intent.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'Before the arming step (not before building the code): confirm with the coordinator/chairman whether those 2 flags should graduate now, or document an explicit, chairman-visible waiver for continuing to defer them.',
  },
  ...(current.risks || []),
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ scope: newScope, risks: newRisks })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('SD scope corrected (v2): dropped sovereign-alert.js mirror site, added STAGE-GATE-PREDICATE-001 obligation + gate-on-dead-instrument risk.');
