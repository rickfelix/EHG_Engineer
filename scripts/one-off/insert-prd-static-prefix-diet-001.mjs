#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';
const SD_UUID = '9b20269f-1759-45b7-8b2d-ae8cda5bb29d';
const PRD_ID = `PRD-${SD_KEY}`;

const prdContent = {
  executive_summary: 'Materializes burn-lever item A4 (chairman-approved 2026-08-29T13:13:19Z, ratification 0daf3bd8): a per-seat static-prefix composition audit followed by moving rarely-needed content behind on-demand reads, so every seat pays a smaller cache-write cost on session start. LEAD-phase discovery (Explore + validation-agent, evidence ids b5058ee1/7c7f909e) confirmed no existing per-seat prefix-composition audit exists, identified substantial reusable infrastructure (the calibrated harness-token-scale.cjs conversion, the generation manifest\'s per-file byte tracking), and surfaced five load-bearing traps this PRD encodes as explicit requirements: the printed token-budget line uses the wrong (uncalibrated) estimator, check-claude-md-drift.cjs cannot detect size reduction, MEMORY.md lives outside the repo at a per-seat path, MUST_FIT_SINGLE_READ is a hard boundary that must never be relaxed, and open PR #7430 touches the same generated-file family with an unresolved merge-order risk.',
  functional_requirements: [
    { id: 'FR-1', requirement: 'Build a per-seat static-prefix composition audit script that measures bytes and calibrated harness-tokens (via lib/protocol/harness-token-scale.cjs harnessTokensFromBytes) for each prefix component: CLAUDE.md, the generated role-contract file for the seat, the per-seat MEMORY.md index, agent-compiler output, SessionStart hook combined stdout, and .claude/settings.json (including its env block).', description: 'Run on at least an Adam seat and a worker seat. The audit is the sole basis for choosing diet targets — no component may be moved on intuition.', priority: 'CRITICAL', acceptance_criteria: ['Audit script exists and runs against a live Adam seat and a live worker seat', 'Output breaks down bytes AND harnessTokensFromBytes(bytes) per component, not just a single-file total', 'Component list includes SessionStart hook stdout and settings.json env block (both currently unmeasured per Explore finding)'] },
    { id: 'FR-2', requirement: 'MEMORY.md must be resolved at its real per-seat path (%USERPROFILE%/.claude/projects/<project-hash>/memory/MEMORY.md on this machine), never assumed repo-relative. If the path cannot be resolved for a seat, the audit must fail loud with an explicit error naming the seat, not silently report 0 bytes for that component.', description: 'Explore confirmed MEMORY.md is invisible to git ls-files and would silently zero-out as the largest hand-maintained component under a naive repo-relative resolver.', priority: 'HIGH', acceptance_criteria: ['Audit correctly reports non-zero bytes for the real MEMORY.md on a seat where it exists', 'Audit throws/errors explicitly (never reports 0) when the path cannot be resolved'] },
    { id: 'FR-3', requirement: 'Move rarely-needed content (candidates selected ONLY from the FR-1 audit output) behind on-demand reads in the generated protocol files, while keeping ALL pause-points, gate requirements, and safety rules inline.', description: 'Candidates are audit-selected: long why-blocks reachable via a read-on-need pointer, digest variants, provenance files. A named checklist of preserved-inline safety content must be produced and verified post-diet.', priority: 'CRITICAL', acceptance_criteria: ['Every moved item cites the specific audit measurement line that justified moving it', 'A named checklist (pause points from CLAUDE.md "Canonical Pause Points", all gate names, all safety rules) is verified still-inline post-diet', 'MUST_FIT_SINGLE_READ (scripts/modules/claude-md-generator/index.js:635 — CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_SOLOMON.md) is NEVER edited, nor is HARNESS_BYTES_PER_TOKEN (2.4177) or tests/unit/claude-md-single-read-cap.test.js, as a way to manufacture a passing number'] },
    { id: 'FR-4', requirement: 'Measure the diet\'s real effect using harnessTokensFromBytes(bytes) from lib/protocol/harness-token-scale.cjs, NOT the generator\'s printed "Token budget OK" / "Token Savings" lines (scripts/modules/claude-md-generator/index.js:405-436), which are computed from estimated_tokens = content.length/4 and run ~40% low for this file family (documented root cause of SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001).', description: 'A 15% reduction on the printed line is not evidence of a real 15% reduction. Only assertSingleReadFit (index.js:648-670) already uses the calibrated model.', priority: 'CRITICAL', acceptance_criteria: ['Before/after evidence for the >=15% reduction target is computed via harnessTokensFromBytes(bytes) on the actual generated file bytes, pasted into SD evidence', 'The generator\'s printed Token Savings line is NOT cited as the acceptance number'] },
    { id: 'FR-5', requirement: 'Regenerate protocol files via scripts/generate-claude-md-from-db.js and verify via scripts/check-claude-md-drift.cjs that the CHANGED SECTION SET equals exactly the enumerated intended-move set (a full list of which sections moved, recorded before regeneration).', description: 'check-claude-md-drift.cjs compares content identity via section digests, exits 0/1/2 with no CLI flags, and WILL report DRIFT (exit 1) for any intended A4 move until the manifest is regenerated — its exit code alone is not the pass/fail signal here; the diff between changed sections and the pre-declared move list is.', priority: 'HIGH', acceptance_criteria: ['A pre-declared list of intended section moves exists before regeneration', 'Post-regeneration, check-claude-md-drift.cjs\'s changed-section report is diffed against that list and shown to match exactly', 'No section is silently dropped (present in the pre-move list of "keep" content and absent post-diet)'] },
    { id: 'FR-6', requirement: 'Record an explicit merge-order decision relative to open PR #7430 (touches scripts/modules/claude-md-generator/digest-generators.js, claude-generation-manifest.json, CLAUDE_CORE.md, CLAUDE_SOLOMON.md, and 7 *_DIGEST.md files — the same generated-file family this SD regenerates) before EXEC begins.', description: 'PR #7430 is OPEN and stale since 2026-08-24 with a completed source SD, so it does not surface in a DB-scoped open-SD overlap query. Landing it after this SD\'s regeneration could silently overwrite the diet.', priority: 'HIGH', acceptance_criteria: ['PRD/EXEC evidence records the chosen order (land #7430 first and rebase the diet on top, OR proceed and re-verify the diet survives #7430\'s eventual merge) with a named reason', 'If #7430 merges during this SD\'s EXEC phase, the diet is re-verified (re-run FR-4/FR-5 checks) before PLAN-TO-LEAD'] },
    { id: 'FR-7', requirement: 'Establish a 7-day lost-rule incident watch with an explicit incident definition and a named observer.', description: 'A lost-rule incident is: a rule that lived only in moved (on-demand) content being violated in a case where its prior inline presence would plausibly have prevented the violation. Observer: Solomon adherence audits + self-adherence ticks, per the SD scope.', priority: 'MEDIUM', acceptance_criteria: ['Incident definition and observer are recorded in SD evidence before the 7-day window starts', 'Window passes with zero incidents, OR each incident triggers a logged, targeted revert of the specific move that caused it (never a silent re-inline)'] },
    { id: 'FR-8', requirement: 'Record the post-diet prefix size so the dependent SD (B1, externalized wakes) can cite it in its wake-cost break-even math.', description: 'Critique S3 (Solomon-conceded cross-phase dependency): B1\'s economics require the post-diet prefix size as an input.', priority: 'MEDIUM', acceptance_criteria: ['Final post-diet per-component byte/token breakdown for both audited seats is recorded in a location B1 can reference (SD evidence or a durable artifact path)'] },
  ],
  technical_requirements: [
    { id: 'TR-1', requirement: 'Reuse lib/protocol/harness-token-scale.cjs (HARNESS_BYTES_PER_TOKEN=2.4177, harnessTokensFromBytes, SINGLE_READ_TOKEN_CAP=25000) as the sole token-conversion instrument; do not introduce a second, rival constant.', rationale: 'The file\'s own header documents collapsing a prior wrong constant (CL100K_TO_HARNESS=1.85 in lib/protocol/contract-read-coverage.cjs) into this SSOT — a new audit script must not reintroduce that class of bug.' },
    { id: 'TR-2', requirement: 'Reuse claude-generation-manifest.json\'s existing per-file {bytes, content_hash} tracking as a baseline; add new per-SECTION attribution only where the manifest genuinely lacks it (confirmed gap).', rationale: 'Avoids rebuilding tracking that already exists at the file level.' },
    { id: 'TR-3', requirement: 'The audit script and diet changes are additive/measurement-and-content-move only — no changes to scripts/generate-claude-md-from-db.js\'s enforcement logic, MUST_FIT_SINGLE_READ, or the harness-token-scale constants.', rationale: 'Preserves the guarantee 4 prior completed SDs already established; relaxing it to pass this SD\'s own metric would be circular.' },
  ],
  system_architecture: {
    overview: 'A new audit script (scripts/audit-static-prefix.mjs or similar) reads each per-seat prefix component, converts to calibrated harness-tokens, and prints a per-component breakdown for two seat types. Diet candidates are selected from that output and moved from inline DB-sourced protocol sections to on-demand pointers, using the existing generator (scripts/generate-claude-md-from-db.js) unchanged in its enforcement logic. Verification chains: audit (before) -> move content -> regenerate -> audit (after) -> compute real delta via harnessTokensFromBytes -> diff check-claude-md-drift.cjs\'s changed-section report against the pre-declared move list.',
    components: [
      { name: 'audit-static-prefix (new)', responsibility: 'Per-seat, per-component bytes + calibrated-token breakdown for CLAUDE.md, role-contract, MEMORY.md (real per-seat path), agent-compiler output, SessionStart hook stdout, settings.json env block.', technology: 'Node.js, reuses lib/protocol/harness-token-scale.cjs' },
      { name: 'generate-claude-md-from-db.js / claude-md-generator (existing, unmodified logic)', responsibility: 'Regenerates protocol files from leo_protocol_sections after content is moved to on-demand references.', technology: 'Node.js' },
      { name: 'check-claude-md-drift.cjs (existing, unmodified)', responsibility: 'Reports which sections changed post-regeneration, diffed against the pre-declared intended-move list by this SD\'s own process, not by the script itself.', technology: 'Node.js' },
    ],
    data_flow: 'Seat filesystem/DB state -> audit-static-prefix (before) -> content-move edits to leo_protocol_sections -> generate-claude-md-from-db.js -> audit-static-prefix (after) -> harnessTokensFromBytes delta -> check-claude-md-drift.cjs changed-section report -> manual diff against pre-declared move list.',
    integration_points: ['lib/protocol/harness-token-scale.cjs', 'claude-generation-manifest.json', 'leo_protocol_sections table', '.claude/settings.json (read-only, for env-block byte measurement)'],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Audit reports non-zero, correct bytes for the real per-seat MEMORY.md', test_type: 'unit', given: 'a seat with a real MEMORY.md at its per-seat path', when: 'the audit runs', then: 'reported bytes match the actual file size, not zero' },
    { id: 'TS-2', scenario: 'Audit fails loud when MEMORY.md path cannot be resolved', test_type: 'unit', given: 'a seat/environment where the per-seat memory path is unresolvable', when: 'the audit runs', then: 'an explicit error is raised naming the seat, never a silent 0-byte report' },
    { id: 'TS-3', scenario: 'Real reduction computed via harnessTokensFromBytes, not the printed Token Savings line', test_type: 'integration', given: 'before/after generated file bytes', when: 'computing the reduction percentage', then: 'the calculation uses harnessTokensFromBytes(bytes) and differs from (is not sourced from) the generator\'s printed Token Savings line' },
    { id: 'TS-4', scenario: 'MUST_FIT_SINGLE_READ and the 2.4177 constant are untouched', test_type: 'regression', given: 'the diet\'s full diff', when: 'tests/unit/claude-md-single-read-cap.test.js is run', then: 'it passes unmodified, proving neither the file list nor the constant was relaxed' },
    { id: 'TS-5', scenario: 'Drift check changed-section set matches the pre-declared move list exactly', test_type: 'integration', given: 'a pre-declared list of intended section moves', when: 'check-claude-md-drift.cjs is run post-regeneration', then: 'the changed-section set it reports equals the pre-declared list, with no unintended additions or omissions' },
  ],
  acceptance_criteria: [
    'Per-seat prefix-composition audit exists, runs on an Adam seat and a worker seat, and its output (not intuition) selects every moved item',
    'Measured reduction >=15% on both audited seats, computed via harnessTokensFromBytes(bytes), pasted into SD evidence',
    'MEMORY.md resolved at its real per-seat path in the audit; fails loud (never reports zero) when unresolvable',
    'MUST_FIT_SINGLE_READ, HARNESS_BYTES_PER_TOKEN, and tests/unit/claude-md-single-read-cap.test.js are unmodified',
    'check-claude-md-drift.cjs changed-section report matches the pre-declared intended-move list exactly',
    'Explicit merge-order decision relative to PR #7430 recorded before EXEC',
    '7-day lost-rule incident window passes (0 incidents) or each incident is a logged, targeted revert',
    'Post-diet prefix size recorded for B1 to cite',
  ],
  risks: [
    { risk: 'Diet reduces the printed Token Savings number without a real calibrated-byte reduction', probability: 'MEDIUM', impact: 'HIGH', mitigation: 'FR-4 mandates harnessTokensFromBytes(bytes) as the sole acceptance computation', rollback_plan: 'Recompute from raw bytes; if the real reduction is under 15%, identify further audit-selected candidates rather than accepting the printed estimate.' },
    { risk: 'A moved rule is violated because its on-demand pointer is not consulted when actually needed', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'FR-7 7-day lost-rule watch with a named observer and an explicit incident definition', rollback_plan: 'Revert the specific move that caused the incident (logged), not a blanket revert of the whole diet.' },
    { risk: 'PR #7430 lands mid-EXEC and silently overwrites diet content in the shared generated-file family', probability: 'LOW', impact: 'HIGH', mitigation: 'FR-6 explicit merge-order decision recorded before EXEC; re-verification triggered if #7430 merges during EXEC', rollback_plan: 'Re-run the audit + drift-diff process after #7430 lands, before proceeding to PLAN-TO-LEAD.' },
  ],
  implementation_approach: {
    phases: [
      { phase: 'Audit (before)', description: 'Build and run the per-seat, per-component prefix-composition audit on an Adam seat and a worker seat.', deliverables: ['audit-static-prefix script', 'before-state per-component breakdown for both seats'] },
      { phase: 'Diet + regenerate', description: 'Move audit-selected candidates behind on-demand reads; keep safety-critical content inline; regenerate via the existing generator.', deliverables: ['content moves in leo_protocol_sections', 'regenerated protocol files'] },
      { phase: 'Verify', description: 'Re-run the audit (after), compute the real reduction via harnessTokensFromBytes, diff the drift-check changed-section report against the pre-declared move list, confirm MUST_FIT_SINGLE_READ untouched.', deliverables: ['before/after evidence', 'drift-diff confirmation', 'named safety-content checklist'] },
      { phase: '7-day watch', description: 'Monitor for lost-rule incidents per the named definition/observer for 7 days post-merge.', deliverables: ['incident log (or a clean 7-day record)'] },
    ],
    technical_decisions: ['Reuse harness-token-scale.cjs and the existing manifest\'s per-file bytes rather than building a parallel measurement system.', 'Never relax MUST_FIT_SINGLE_READ or the 2.4177 constant to manufacture a passing number.'],
  },
};

async function main() {
  const nowIso = new Date().toISOString();
  const { data: existingPrd } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();

  const row = {
    id: PRD_ID,
    directive_id: SD_KEY,
    sd_id: SD_UUID,
    title: 'A4 static-prefix diet: audit + move + verify',
    status: 'approved',
    category: 'infrastructure',
    priority: 'high',
    executive_summary: prdContent.executive_summary,
    functional_requirements: prdContent.functional_requirements,
    technical_requirements: prdContent.technical_requirements,
    system_architecture: prdContent.system_architecture,
    test_scenarios: prdContent.test_scenarios,
    acceptance_criteria: prdContent.acceptance_criteria,
    risks: prdContent.risks,
    implementation_approach: prdContent.implementation_approach,
    integration_operationalization: {
      consumers: ['B1 externalized-wakes SD(s) — cite the post-diet prefix size in wake-cost break-even math'],
      dependencies: ['lib/protocol/harness-token-scale.cjs', 'scripts/generate-claude-md-from-db.js', 'scripts/check-claude-md-drift.cjs', 'claude-generation-manifest.json'],
      data_contracts: [],
      runtime_config: {},
      observability_rollout: { rollout: '7-day lost-rule incident watch post-merge, observer: Solomon adherence audits + self-adherence ticks' },
    },
    metadata: {
      created_by: 'PLAN_INLINE_GENERATION',
      created_at: nowIso,
      lead_explore_evidence_id: 'b5058ee1-d034-4486-a01b-af1b62e67677',
      lead_validation_evidence_id: '7c7f909e-9f1e-49d5-8bf1-f86ef8532a4b',
      pr_ordering_risk: 'https://github.com/rickfelix/EHG_Engineer/pull/7430',
    },
  };

  const result = existingPrd
    ? await supabase.from('product_requirements_v2').update(row).eq('id', PRD_ID).select('id')
    : await supabase.from('product_requirements_v2').insert(row).select('id');

  if (result.error) { console.error('PRD write failed:', result.error); process.exit(1); }
  console.log('PRD written OK:', JSON.stringify(result.data));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
