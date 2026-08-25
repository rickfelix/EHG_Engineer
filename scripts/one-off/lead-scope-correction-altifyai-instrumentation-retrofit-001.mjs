#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 -- LEAD-phase premise verification
 * (Explore evidence 2a677465-0dff-4038-82a2-a360bd1399de) found the coordinator-authored
 * plan_content's premise was FALSE on 2 of 4 FRs, measured live against the DB:
 *
 *  - FR-1's "AltifyAI's ventures row carries a simulated marker" is NOT a defect unique to
 *    AltifyAI: launch_mode='simulated' + launched_at=NULL is the UNIVERSAL unflipped default
 *    across ALL 152 ventures in the system (0 exceptions). The claimed "live since ~07-21"
 *    date is unsupported -- the GitHub repo was created 2026-08-11, first successful deploy
 *    was 2026-08-17.
 *  - FR-2's named mechanism is wrong: VENTURE-SCAFFOLD-CODE-001's applyVentureScaffoldModules()
 *    (lib/eva/bridge/venture-scaffold-modules-writer.js) only writes CI/deploy/feedback files
 *    into a git-cloned venture repo -- zero DB writes, no code path near venture_guardrail_state
 *    at all. The real writer, persistGuardrailDecisions() (lib/venture-deploy/spend-guardrails.js),
 *    is different code from a different SD, and is itself gated behind the Stage-24 go-live
 *    handler (lib/eva/stage-templates/analysis-steps/stage-24-go-live.js), which is structurally
 *    unreachable today: verifyExternalObservation() always fails closed because no
 *    telemetryRowCount data source exists anywhere in the codebase (docs/reference/
 *    launch-mode-policy.md). "Reconciling" launched_at/launch_mode right now means either
 *    hand-setting fields (the exact dishonesty this policy exists to prevent) or building a
 *    telemetry integration and running the venture through 5 more real stage gates -- both far
 *    outside "reconciliation" scope.
 *  - FR-3 and FR-4(c) hold up: eva_stage_gate_attempts (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001,
 *    "T-minus P1", merged PR #7440, 2026-08-23) is real, wired infrastructure with 970 rows
 *    across other ventures. AltifyAI genuinely has 0 rows there despite 19 chairman-approved
 *    stage transitions on record (stages 0,3,5,5,7,7,8,9,10,11,13,16,17,19 between 07-12 and
 *    08-11) -- a real, independently-actionable gap.
 *  - Missing context the SD's problem statement never cites: chairman decision 97e47923
 *    (2026-08-22T11:11:59Z, "VENTURE-1 RESTART RULING") ordered AltifyAI to re-enter at Stage 0
 *    and re-traverse all 25 stages "as brand new" -- existing work survives only where a stage
 *    gate accepts it as evidence. This directly bears on whether "reconciling" launched_at/
 *    launch_mode now would even be durable once the restart traversal reaches Stage 24 again.
 *
 * SCOPE CORRECTION: narrow to FR-3 (wire AltifyAI's future stage advances through
 * eva_stage_gate_attempts) + FR-4(c) (fixture: a stage advance writes an attempt row) as the
 * sole executable core. FR-1/FR-2 are NOT dropped silently -- reframed as an explicit,
 * measured DEFERRAL (not a build item) with the reason on record, so a future SD picking up
 * the Stage-24/telemetry gap has this evidence instead of re-discovering it.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

async function main() {
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, description, scope, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

  const originalPlanContent = sd.metadata?.plan_content || '';

  const correctionAddendum = `

## LEAD-PHASE VERIFICATION FINDING (Explore evidence 2a677465-0dff-4038-82a2-a360bd1399de) -- SCOPE CORRECTED

Independent verification against the live DB found the above premise FALSE on FR-1 and FR-2,
CONFIRMED on FR-3 and FR-4(c):

- **FR-1 is FALSE as scoped**: \`launch_mode='simulated'\` + \`launched_at=NULL\` is the
  UNIVERSAL unflipped default across ALL 152 ventures in the system (0 exceptions) -- not a
  defect unique to AltifyAI. The claimed "live since ~07-21" date is unsupported: the GitHub
  repo (\`rickfelix/altifyai\`) was created 2026-08-11; the first successful deploy ran
  2026-08-17. The ONE sanctioned mechanism to flip these fields is the Stage-24 go-live gate
  (\`lib/eva/stage-templates/analysis-steps/stage-24-go-live.js\`), which is structurally
  unreachable today: its \`verifyExternalObservation()\` check always fails closed because no
  \`telemetryRowCount\` data source exists anywhere in the codebase (per
  \`docs/reference/launch-mode-policy.md\`). AltifyAI is at stage 19, has not reached 23/24.
  Hand-setting these fields now would BE the dishonest-instrumentation problem this SD exists
  to fix, not a fix for it.
- **FR-2's named mechanism is wrong**: VENTURE-SCAFFOLD-CODE-001's \`applyVentureScaffoldModules()\`
  (\`lib/eva/bridge/venture-scaffold-modules-writer.js\`) only writes CI/deploy/feedback files
  into a git-cloned venture repo -- zero DB writes, no code path near \`venture_guardrail_state\`
  at all. The real writer, \`persistGuardrailDecisions()\`
  (\`lib/venture-deploy/spend-guardrails.js\`), is different code from a different SD chain
  (SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C / SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001),
  and is itself only invoked from the same Stage-24 go-live handler FR-1 depends on -- so FR-2
  cannot execute independently of FR-1's blocked precondition either. Only 3 of the 8 canonical
  guardrails (\`agent-token-ceiling\`, \`human-gate\`, \`per-venture-isolation\`) have any real
  measurement source today; the other 5 would fail-closed by design if seeded now.
- **FR-3 CONFIRMED, actionable now**: \`eva_stage_gate_attempts\`
  (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001, "T-minus P1", merged PR #7440, 2026-08-23) is real,
  wired infrastructure -- 970 rows across other ventures, full trigger/RLS/RPC machinery
  (\`open_eva_gate_attempt\`/\`finalize_eva_gate_attempt\`). AltifyAI genuinely has 0 rows there
  despite 19 chairman-approved stage transitions on record between 2026-07-12 and 2026-08-11.
  Wiring AltifyAI's FUTURE stage advances through this table is real, independently-valuable
  work, unblocked by the FR-1/FR-2 gate.
- **FR-4(c) CONFIRMED, actionable now**: a fixture asserting a stage advance writes an attempt
  row is directly testable against FR-3's real infrastructure. FR-4(a)/(b) (the honesty-census
  and 8/8 guardrail fixtures) are NOT achievable without either bypassing the go-live gate
  (dishonest) or completing the out-of-scope telemetry/guardrail work above -- descoped along
  with FR-1/FR-2.
- **Context the original problem statement omitted**: chairman decision \`97e47923\`
  (2026-08-22T11:11:59Z, "VENTURE-1 RESTART RULING") ordered AltifyAI to re-enter at Stage 0
  and re-traverse all 25 stages "as brand new" -- existing work survives only where a stage
  gate accepts it as evidence. This is on record 2 days before this SD's own 08-24 traversal-GO
  decision (\`e1da09a3\`) and is directly relevant to whether FR-1's fields, even if reachable,
  would stay durable through a from-Stage-0 re-traversal. Flagged for the coordinator/chairman
  thread, non-blocking to this SD's corrected (FR-3-only) scope.

## CORRECTED SCOPE (LEAD)

**In scope**: FR-3 (wire AltifyAI's stage advances through \`eva_stage_gate_attempts\`) and
FR-4(c) (fixture: a stage advance writes an attempt row).

**Explicitly deferred, not silently dropped**: FR-1 (launch_mode/launched_at reconciliation)
and FR-2 (guardrail retroactive seeding) both require either the missing telemetry-observation
data source or a Stage 20-24 real traversal to complete honestly -- out of scope for this SD,
flagged as a distinct future SD once that infrastructure exists. FR-4(a)/(b) fixtures descoped
with them.
`;

  const correctedKeyChanges = [
    { change: 'Wire AltifyAI\'s future venture-lifecycle stage advances through eva_stage_gate_attempts (open_eva_gate_attempt/finalize_eva_gate_attempt), so every future transition records an attempt row instead of bypassing the ledger.', impact: 'AltifyAI genuinely has 0 rows in eva_stage_gate_attempts despite 19 chairman-approved stage transitions on record; this closes the gap forward without fabricating historical rows.' },
    { change: 'Add a fixture proving a stage advance writes an attempt row for AltifyAI specifically.', impact: 'Directly testable against real, already-wired infrastructure (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001).' },
  ];

  const correctedStrategicObjectives = [
    'Close the forward-looking stage-transition ledger gap for AltifyAI: future stage advances must record an eva_stage_gate_attempts row, matching the machinery every other actively-tracked venture already uses.',
    'Do NOT fabricate historical launch_mode/launched_at/guardrail state to appear "honest" -- LEAD verification found the sanctioned path to those fields (Stage-24 go-live) is structurally unreachable today, and hand-setting them would recreate the exact dishonest-instrumentation problem this SD exists to prevent.',
  ];

  const correctedSuccessCriteria = [
    { criterion: 'Every future AltifyAI stage advance produces a matching eva_stage_gate_attempts row.', measure: 'Live-queried: after this SD ships, the next real stage-gate decision on AltifyAI (via the existing chairman decision path) has a corresponding attempt row with matching stage/outcome.' },
    { criterion: 'A fixture test proves the wiring, not just its absence of a false trigger.', measure: 'Positive-control fixture: advancing a fixture venture through the wired path produces an attempt row; a fixture venture NOT advanced through it does not.' },
  ];

  const correctedRisks = [
    {
      risk: 'FR-1/FR-2 (launch_mode/launched_at reconciliation, guardrail seeding) were descoped at LEAD as unreachable without either dishonest hand-setting or out-of-scope telemetry/traversal work -- a future SD may re-attempt this without knowing the Stage-24 gate is the actual blocker.',
      impact: 'medium',
      likelihood: 'medium',
      mitigation: 'This LEAD correction and its Explore evidence (2a677465-0dff-4038-82a2-a360bd1399de) are on record in this SD\'s metadata; a future SD should read this before re-attempting FR-1/FR-2.',
    },
    {
      risk: 'A concurrent chairman ruling (decision 97e47923) orders AltifyAI to re-enter at Stage 0 and re-traverse all 25 stages -- if that traversal runs concurrently with this SD\'s FR-3 wiring, there is a coordination risk (though not a code conflict, since FR-3 only adds forward-transition recording, it does not gate or block transitions).',
      impact: 'low',
      likelihood: 'low',
      mitigation: 'Flagged to the coordinator/chairman thread, non-blocking. FR-3 is purely additive instrumentation and does not need to wait for the restart-traversal question to resolve.',
    },
  ];

  const updates = {
    key_changes: correctedKeyChanges,
    strategic_objectives: correctedStrategicObjectives,
    success_criteria: correctedSuccessCriteria,
    risks: correctedRisks,
    metadata: {
      ...sd.metadata,
      plan_content: originalPlanContent + correctionAddendum,
      needs_enrichment: [],
      lead_enrichment: {
        performed_at: new Date().toISOString(),
        source: 'Explore evidence 2a677465-0dff-4038-82a2-a360bd1399de (LEAD phase premise verification)',
        summary: 'FR-1/FR-2 measurement-falsified and descoped (universal default mistaken for AltifyAI-specific defect; wrong mechanism cited, real mechanism gated behind an unreachable Stage-24 check). FR-3/FR-4(c) confirmed and kept as the sole executable scope.',
      },
      mechanism_verifications: [
        {
          verified_by: 'lead-scope-correction-altifyai-instrumentation-retrofit-001.mjs',
          verified_at: 'lib/eva/bridge/venture-scaffold-modules-writer.js:1 (applyVentureScaffoldModules writes only CI/deploy/feedback files, zero DB writes)',
          claim: 'VENTURE-SCAFFOLD-CODE-001 machinery can retroactively seed venture_guardrail_state rows',
          reproduction: 'Read applyVentureScaffoldModules() and templates/venture-scaffold/scaffold.js in full: both call only writeFileSync into a git-cloned repo checkout; grep for venture_guardrail_state in either file returns zero matches.',
        },
        {
          verified_by: 'lead-scope-correction-altifyai-instrumentation-retrofit-001.mjs',
          verified_at: 'lib/eva/stage-templates/analysis-steps/stage-24-go-live.js:1 (verifyExternalObservation gated on telemetryRowCount, no data source exists)',
          claim: 'AltifyAI launch_mode/launched_at can be reconciled to honest values now',
          reproduction: 'The only writer of launch_mode/launched_at to a non-simulated value is the Stage-24 go-live handler, which requires verifyExternalObservation() to pass; per docs/reference/launch-mode-policy.md, that check always fails closed today because no telemetryRowCount data source exists in the codebase. AltifyAI is at stage 19, has not reached 23/24.',
        },
        {
          verified_by: 'lead-scope-correction-altifyai-instrumentation-retrofit-001.mjs',
          verified_at: 'database/migrations/ (eva_stage_gate_attempts table, SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001, PR #7440) -- 970 rows across other ventures, 0 for AltifyAI',
          claim: 'AltifyAI stage transitions bypassed the transition ledger and eva_stage_gate_attempts is real, wired infrastructure',
          reproduction: 'Live query: SELECT count(*) FROM eva_stage_gate_attempts WHERE venture_id = (AltifyAI venture id) returns 0, against 19 chairman-approved stage-gate/review decisions on record for the same venture between 2026-07-12 and 2026-08-11.',
        },
      ],
    },
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', sd.id);
  if (updErr) { console.error('WRITE ERR', updErr.message); process.exit(1); }
  console.log('OK: LEAD scope correction applied for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
