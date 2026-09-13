import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks, system_architecture, integration_operationalization, implementation_approach, metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr) throw readErr;

const fr = prd.functional_requirements;
const byId = (arr, id) => arr.find(x => x.id === id);

// FR-1: reject dry-run sentinels explicitly
byId(fr, 'FR-1').description += ' Additionally, a literal `dry-run-*` sentinel value in campaign_content.external_post_id (emitted by both adapters in dry-run mode) must be rejected the same as a null external_post_id -- classify unmeasurable, never treat the sentinel as a real post id. campaign_content row existence alone does not prove a successful publish: the write is guarded by `if (result.success && campaignId)` in publisher/index.js, but campaign_content is ALSO written ungated by content-generator.js, so external_post_id must be checked non-null and non-sentinel, not row presence.';
byId(fr, 'FR-1').acceptance_criteria.push('A campaign_content row whose external_post_id is null or a literal dry-run-* sentinel classifies unmeasurable, never shipped_clean/reverted/caused_rework');

// FR-2/FR-3: note real API constraints
byId(fr, 'FR-3').description += ' X API access is Basic-tier (15K reads/month budget) -- the scheduled step (FR-4) must batch/backoff rather than poll unboundedly, and treat 429 as a transient failure (stays unknown), never a terminal outcome.';

// FR-4: note supersession of dependency SD residue
byId(fr, 'FR-4').description += ' This scheduled step SUPERSEDES the still-owed inline recordPublishOutcome() call from the dependency SD (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 shipped FR-3 known-incomplete: content-pipeline.js / owned-audience-content-loop.js still owe an inline call). That inline call must NOT be built -- it is the self-report anti-pattern the ledger docstring itself forbids, and building both would create two conflicting writers of the same row.';

// FR-5: correct the falsified premise and add the real gap
byId(fr, 'FR-5').title = 'Mode-aware outcome recording -- net-new, not a reuse of an existing pattern';
byId(fr, 'FR-5').description = "VALIDATION (LEAD phase, sub-agent evidence 8057d0a8) measured that execution_mode is ALREADY APPLIED in the live schema (with mock_run_id; all 3 current ledger rows are execution_mode='live') -- the prior premise that this column was 'chairman-gated, not yet applied' is FALSE, and evaluateGraduation's existing 42703-fallback branch is now dead code (left in place, not removed by this SD -- out of scope to touch). The REAL gap validation found: recordPublishOutcome (lib/marketing/autonomy-gate.js:469) does a bare `.eq('correlation_id')` update with NO execution_mode filter at all -- a mock-mode outcome as written today WOULD silently overwrite a live row's outcome. This SD must ADD an execution_mode-scoped predicate to that update (match the row's own recorded execution_mode, never cross-write). evaluateGraduation (:497) is only partially mode-aware: it currently BREAKS the streak when it encounters a mock-mode row rather than filtering candidate rows by mode up front -- this SD replaces that behavior with an explicit mode filter on evaluateGraduation's SELECT (:509), so a mock-mode call only ever considers mock-mode rows and a live-mode call only ever considers live-mode rows. This is a design decision made explicitly here, not left ambiguous.";
byId(fr, 'FR-5').acceptance_criteria = [
  "recordPublishOutcome's UPDATE includes an execution_mode predicate matching the row being recorded (net-new code this SD -- today's implementation has none)",
  "evaluateGraduation's candidate-row SELECT filters by execution_mode up front; it no longer relies on breaking the streak when a mismatched-mode row is encountered",
  "A mock-mode outcome recorded via the scheduled step never changes a live-mode row's outcome or clean_streak, verified directly (TS-3, TS-6)"
];

// FR-6: clarify caused_rework stays in the enum but is unexercised
byId(fr, 'FR-6').description += " This SD does not remove or alter the existing 'caused_rework' CHECK value -- it remains a valid enum member -- but no code path in this SD produces it: caused_rework is explicitly declared UNREACHABLE this increment (no rework signal exists anywhere in the codebase, confirmed independently by both LEAD's direct read and VALIDATION's re-check of metrics-ingestor.js and variant-outcome-derivation.js). A future SD wires an actual rework signal before caused_rework is ever written by this pipeline.";

// FR-7: sentinel rejection precedes the window logic
byId(fr, 'FR-7').description += ' A literal dry-run-* sentinel or null external_post_id is rejected immediately as unmeasurable (FR-1) BEFORE the fixed-window logic ever runs -- it is not a "transient failure inside the window" case.';

// NEW FR-8: resolves VAL-POO-1 -- mock-mode proof only this increment, live proof named as external dependency
fr.push({
  id: 'FR-8',
  title: 'Live-outcome proof is out of scope this increment; deliver and prove the mechanism in mock mode only',
  priority: 'critical',
  description: "VALIDATION (LEAD phase) measured that AltifyAI -- the only venture this SD's spine names as its subject -- has ZERO rows across venture_channel_secrets, channel_budgets, venture_channel_publish_ledger, venture_channel_autonomy, and venture_demand_verdicts, AND is blocked by a recorded chairman ruling (ventures.metadata.outreach_ruling = BLOCKED, scope 'any outbound contact with a real human being', blocked_until 'S24 Launch Readiness PASS AND S25 Go Live PASS', with the 23->24 transition currently PARKED). Provisioning AltifyAI's channels and clearing that gate are both explicitly OUT OF SCOPE for this SD. As originally scoped, the SD's own success criteria and smoke-test step ('observe one AltifyAI post published in a prior run') had NO SUBJECT and could never be satisfied without either violating the outreach ruling's intent or silently assuming an interpretation of its scope that only the chairman can rule on. Per the chairman's own standing policy (2026-09-12: no real-customer outreach before go-live stage; mock first; Solomon plans the go-live sequencing), this SD resolves the question conservatively WITHOUT needing to escalate the interpretation: it proves the full mechanism (join, adapter lookups, mode-scoped recordPublishOutcome, evaluateGraduation invocation) end-to-end against a MOCK-mode fixture/test post it creates itself, and does not attempt to observe or act on any real AltifyAI (or other venture's) live post. A live-post-based proof remains a named, explicit external dependency on (a) AltifyAI provisioning and (b) the S24/S25 gate clearing -- tracked, not silently assumed, and not delivered by this SD.",
  acceptance_criteria: [
    'evaluateGraduation runs at least once from a recorded MOCK-mode outcome produced by this SD\'s new scheduled path (replacing the SD-spine\'s original live-outcome criterion, which had no reachable subject)',
    'No code path in this SD reads, writes, or otherwise acts on a real AltifyAI post or any other real, unprovisioned venture -- verified by the mock-mode fixture being self-contained test data, never a live query result',
    'The live-outcome proof gap (AltifyAI provisioning + S24/S25 clearing) is recorded as a named external dependency in integration_operationalization, not silently dropped or assumed resolved'
  ]
});

// NEW FR-9: resolves VAL-POO-2 -- bind scope to the publishable intersection
fr.push({
  id: 'FR-9',
  title: "Bind 'channel portfolio' scope literally to {x, bluesky}",
  priority: 'high',
  description: "VALIDATION measured that ventures.metadata.thesis.reached_how names SIX channel families (SEO/webmaster forums, Reddit, Slack/Discord, Facebook Groups, industry blogs, Twitter/LinkedIn), not the two this SD's spine assumed -- and Bluesky is not even among the six named families. Only two families (X/Twitter and, separately, Bluesky as an existing adapter) have any adapter in this codebase today. This SD binds its scope literally and exclusively to the publishable intersection: X and Bluesky. The other five reached_how families have zero adapter code and are explicitly OUT OF SCOPE -- to be covered by future, separate adapter SDs, never silently folded into this one's estimate.",
  acceptance_criteria: [
    "Every reference to 'the AltifyAI thesis channel portfolio' or 'channel portfolio' elsewhere in this PRD and the SD spine is read as meaning exactly {x, bluesky} for delivery purposes",
    "The five other reached_how families are named explicitly as out-of-scope in integration_operationalization.dependencies, not omitted"
  ]
});

// technical_requirements: add budget + mode-filter TRs
prd.technical_requirements.push({
  id: 'TR-4',
  title: 'X API Basic-tier read budget',
  description: 'The scheduled step must operate within a 15K reads/month budget for X lookups -- batch reads, back off on 429, and never treat a rate-limit response as a terminal outcome.'
});
prd.technical_requirements.push({
  id: 'TR-5',
  title: 'No inline recordPublishOutcome call anywhere else',
  description: 'This SD is the only writer of ledger outcomes going forward. The dependency SD\'s still-owed inline call (content-pipeline.js / owned-audience-content-loop.js) must not be built; this SD supersedes that residue.'
});

// test_scenarios: fix TS-1 (drop unreachable caused_rework fixture case), add new scenarios
const ts = prd.test_scenarios;
const tsById = (id) => ts.find(x => x.id === id);
tsById('TS-1').scenario = 'Two-post fixture: clean, deleted';
tsById('TS-1').expected = "observeOutcome classifies shipped_clean and reverted respectively for a fixture of two published posts in known end-states (caused_rework is explicitly unreachable this increment -- no fixture exercises it); a third post with no campaign_content match, or a dry-run-* sentinel external_post_id, classifies unmeasurable";
tsById('TS-3').expected = "Injecting a mock-mode outcome updates only the mock-mode row (via recordPublishOutcome's new execution_mode predicate); evaluateGraduation's mode-scoped SELECT never returns that row for a live-mode call, so the live row's clean_streak and evaluateGraduation result are unaffected";
ts.push({
  id: 'TS-5',
  scenario: 'Dry-run sentinel rejection',
  type: 'unit',
  expected: "A campaign_content row with external_post_id matching the literal dry-run-* sentinel pattern classifies unmeasurable, never shipped_clean"
});
ts.push({
  id: 'TS-6',
  scenario: "recordPublishOutcome's execution_mode predicate",
  type: 'unit',
  expected: "Two ledger rows with the same venture/channel but different execution_mode values: recording an outcome for the mock-mode row's correlation_id updates only that row; the live-mode row's outcome is untouched"
});
ts.push({
  id: 'TS-7',
  scenario: 'Mock-mode-only live proof (FR-8)',
  type: 'integration',
  expected: 'Running the scheduled step end-to-end against a self-created mock-mode fixture causes evaluateGraduation to run successfully from a recorded mock outcome; no real AltifyAI (or other real venture) post is read, written, or otherwise touched by the test'
});

// acceptance_criteria: replace the two criteria VALIDATION found unreachable/ambiguous as written
const ac = prd.acceptance_criteria;
ac[1] = "recordPublishOutcome's update is scoped by execution_mode (net-new this SD) and evaluateGraduation's candidate SELECT filters by execution_mode up front: a mock outcome never touches a live row; live graduation is reachable only from live-mode outcomes";
ac[2] = "A live-capable observer implementation exists for exactly the publishable intersection {x, bluesky} (FR-9); the other five ventures.metadata.thesis.reached_how families have no adapter and are explicitly out of scope for this SD";
ac[3] = "evaluateGraduation has run at least once from a recorded MOCK-mode outcome produced by this new path (FR-8) -- a live-mode proof is a named external dependency (AltifyAI provisioning + S24/S25 gate clearing), not delivered by this SD";
ac.push("No code in this SD reads, writes, or otherwise acts on a real AltifyAI post or any other real, unprovisioned venture (FR-8)");
ac.push("The dependency SD's still-owed inline recordPublishOutcome call is not built anywhere; this SD's scheduled step is the only writer (TR-5)");

// risks: correct the falsified mitigation, add the new measured risks
const risks = prd.risks;
const riskByText = (needle) => risks.find(r => r.risk.includes(needle));
riskByText('A mock-mode outcome graduating a live channel').mitigation = "recordPublishOutcome's update is scoped by an execution_mode predicate (net-new this SD -- today's code has none); evaluateGraduation's candidate SELECT filters by execution_mode up front rather than relying on streak-break-on-mismatch behavior";
risks.push({
  risk: 'AltifyAI has no live-provisioned rows and is blocked by a recorded outreach_ruling (BLOCKED until S24+S25 PASS, 23->24 currently PARKED)',
  severity: 'high',
  mitigation: "This SD proves the mechanism in mock mode only (FR-8) and names live-post proof as an explicit external dependency, consistent with the chairman's standing mock-first / no-real-outreach-before-go-live policy -- avoids both a false completion claim and an unresolved outreach-ruling interpretation question"
});
risks.push({
  risk: 'campaign_content rows are written ungated by content-generator.js, and both adapters emit literal dry-run-* sentinel postIds',
  severity: 'medium',
  mitigation: 'Row existence alone is never treated as proof of a successful publish; external_post_id must be non-null and non-sentinel before any classification proceeds (FR-1, TS-5)'
});
risks.push({
  risk: "The dependency SD's content-pipeline.js / owned-audience-content-loop.js still owe an inline recordPublishOutcome call (self-report anti-pattern the ledger docstring forbids)",
  severity: 'medium',
  mitigation: 'This SD explicitly supersedes that residue (TR-5); the inline call must not be built, avoiding two conflicting writers of the same ledger row'
});
risks.push({
  risk: 'X API Basic-tier budget (15K reads/month) throttles the scheduled poll at scale',
  severity: 'low',
  mitigation: 'Batch reads and back off on 429 in the scheduled step (TR-4); a rate-limit response stays unknown, never a terminal outcome'
});

// system_architecture: recordPublishOutcome/evaluateGraduation are now MODIFIED, not unchanged
const sysArch = JSON.parse(prd.system_architecture);
const comp = sysArch.components;
comp.push({ name: 'lib/marketing/autonomy-gate.js', change: "MODIFIED: recordPublishOutcome's update gains an execution_mode predicate; evaluateGraduation's candidate SELECT is filtered by execution_mode (replacing streak-break-on-mismatch). The now-dead 42703 fallback branch is left in place, not removed (out of scope)." });
sysArch.summary += ' recordPublishOutcome/evaluateGraduation are modified (not reused as-is) to add the execution_mode scoping validation found missing.';

// implementation_approach: add the corrected steps
const impl = JSON.parse(prd.implementation_approach);
impl.steps.push('Add an execution_mode predicate to recordPublishOutcome\'s update and a mode filter to evaluateGraduation\'s candidate SELECT (FR-5)');
impl.steps.push('Prove the full pipeline end-to-end against a self-created mock-mode fixture only; do not attempt any real AltifyAI (or other real venture) post this increment (FR-8)');
impl.steps.push('Confirm the dependency SD\'s owed inline recordPublishOutcome call is not built anywhere (TR-5)');

// integration_operationalization: correct the false execution_mode dependency, add new named dependencies
const io = prd.integration_operationalization;
io.dependencies = io.dependencies.filter(d => !d.includes('execution_mode.sql (staged'));
io.dependencies.push("execution_mode column is CONFIRMED APPLIED in the live schema (not staged) -- no migration dependency here; recordPublishOutcome/evaluateGraduation are modified to actually use it (FR-5)");
io.dependencies.push("content-pipeline.js / owned-audience-content-loop.js's owed inline recordPublishOutcome call (dependency SD residue) -- SUPERSEDED by this SD, must not be built (TR-5)");
io.dependencies.push("AltifyAI provisioning (venture_channel_secrets, channel_budgets, venture_channel_autonomy rows) and the S24/S25 outreach-ruling gate clearing -- NAMED EXTERNAL DEPENDENCY for a live-mode proof; out of scope for this SD's own delivery (FR-8)");
io.dependencies.push("Five of six ventures.metadata.thesis.reached_how channel families (SEO/webmaster forums, Reddit, Slack/Discord, Facebook Groups, industry blogs) have no adapter -- out of scope, future adapter SDs (FR-9)");
io.data_contracts.push("No removal of the existing 'caused_rework' enum value; it remains valid but is unexercised by any code path in this SD (FR-6)");
io.runtime_config.push('X read-budget knob (reads/month cap, batch size, backoff) for the scheduled step (TR-4)');

// metadata: append a traceable revision note (does not touch sub-agent analysis fields)
const metadata = {
  ...prd.metadata,
  plan_revision_note: {
    at: new Date().toISOString(),
    reason: 'Corrected two falsified premises and closed two critical blockers surfaced by VALIDATION (LEAD phase, sub_agent_execution_results row 8057d0a8-5556-4866-a7b6-9610c1b0bd6b) before EXEC: execution_mode is applied (not staged) and recordPublishOutcome/evaluateGraduation needed a real mode-scoping fix (FR-5); the live-outcome success criterion had no reachable subject (AltifyAI fully unprovisioned + a recorded outreach_ruling block) and is resolved via a mock-mode-only proof this increment, consistent with the chairman\'s standing mock-first policy (FR-8); scope bound literally to {x, bluesky} (FR-9); dry-run sentinel rejection and dependency-SD-residue supersession added.',
    source_evidence_row: '8057d0a8-5556-4866-a7b6-9610c1b0bd6b'
  }
};

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: prd.technical_requirements,
    test_scenarios: ts,
    acceptance_criteria: ac,
    risks,
    system_architecture: JSON.stringify(sysArch),
    integration_operationalization: io,
    implementation_approach: JSON.stringify(impl),
    metadata
  })
  .eq('id', PRD_ID);
if (writeErr) throw writeErr;

console.log('PRD corrected. FR count:', fr.length, 'TS count:', ts.length, 'AC count:', ac.length, 'risks:', risks.length);
