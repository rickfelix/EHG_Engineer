// Enhance the auto-generated (boilerplate) SD_COMPLETION retrospective for
// SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B with the actual session narrative:
// the ground-truth-verified spec-conflict correction (solomon_systemic_finding
// was never implemented; adam_advisory+oracle:true is the real wire) and the
// GATE_SUBAGENT_EVIDENCE/Explore harness-bug finding, both signaled to the
// coordinator during this build and reusable beyond this one SD.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = '90d26e44-035d-49f4-bd03-d51d268d982c';
const SD_KEY = 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B';

const update = {
  what_went_well: [
    { achievement: 'Full LEAD→PLAN→EXEC→VERIFY handoff chain completed with all gates green: LEAD-TO-PLAN 93, PLAN-TO-EXEC 98, EXEC-TO-PLAN 96', is_boilerplate: false },
    { achievement: 'Small, well-bounded infra plumbing child: 3 source files changed (lib/fleet/worker-status.cjs, scripts/solomon-advisory.cjs, scripts/adam-advisory.cjs) + 3 test files (2 new: tests/unit/adam-advisory-framing-class.test.js, tests/unit/fleet/framing-classes.test.js; 1 extended: tests/unit/solomon-advisory.test.js), 70 unit tests passing', is_boilerplate: false },
    { achievement: 'Ground-truth spec-conflict caught BEFORE build: the parent SD description and docs/design/fw3-effort-distribution-tier-design.md §6c both said reuse kind "solomon_systemic_finding", but a full-repo grep found zero code hits for that kind — it was a forward-reference to a solomon-oracle.md design doc that does not exist. Verified via grep + CLAUDE_SOLOMON.md (line ~220), which confirmed the real live wire is adam_advisory kind + payload.oracle:true (already registered in lib/fleet/worker-status.cjs PAYLOAD_KINDS.ADAM_ADVISORY). This child SD\'s own title already carried the correction ("NOT solomon_systemic_finding, unregistered"); the build proceeded on the corrected, ground-truth-verified leg.', is_boilerplate: false },
    { achievement: 'Spec-conflict finding signaled to the coordinator (session_coordination id 1358ce4e-c414-4a74-ad52-7e1c35c32e06, 2026-07-19T19:18:33Z) so sibling FW-3 children (-C/-D/-E/-F/-G/-H) and the parent orchestrator do not independently re-derive the same stale "reuse solomon_systemic_finding" assumption from the shared parent description / design doc excerpt.', is_boilerplate: false },
    { achievement: 'Harness bug (GATE_SUBAGENT_EVIDENCE requiring read-only Explore agent to self-write evidence) diagnosed via RCA rather than blindly retried or bypassed, then unblocked with the established manual-persist workaround already used by sibling -001-C and parent -001, keeping the handoff chain gate-validated instead of using --bypass-validation', is_boilerplate: false },
    { achievement: 'Two unrelated issues surfaced during testing (evidence-pack e2e exit code; pre-existing golden-references test failure) were correctly triaged as out-of-scope and NOT fixed inline (scope discipline, NC-EXEC-001), each independently signaled instead', is_boilerplate: false },
    { achievement: 'PRD created and validated (product_requirements_v2 PRD-SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B) with 15 acceptance criteria; all pre-EXEC requirements met before EXEC authorized', is_boilerplate: false },
    { achievement: '9 sub-agent executions consulted across the chain (VALIDATION, Explore, DESIGN, RISK, TESTING x2, SECURITY, VALIDATION x2, REGRESSION)', is_boilerplate: false }
  ],
  what_needs_improvement: [
    'Parent orchestrator SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001\'s description (and the design doc it cites, docs/design/fw3-effort-distribution-tier-design.md §6c) still reads "reuse solomon_systemic_finding" — stale and unresolved at the parent level even though this child correctly deviated; the parent record itself needs a correction pass so a future reader of the parent alone doesn\'t re-derive the wrong kind',
    'GATE_SUBAGENT_EVIDENCE\'s LEAD-TO-PLAN required set still includes "Explore" (scripts/modules/handoff/required-subagents.js:25) even though the built-in Explore agent is read-only and cannot self-write to sub_agent_execution_results — every LEAD-TO-PLAN handoff fleet-wide hand-rolls the same one-off manual-insert workaround (only 9 task_hook rows exist repo-wide across hundreds of handoffs, confirming scripts/hooks/task-subagent-recorder.cjs is not reliably capturing it)',
    'npm run test:e2e exits 1 in a freshly-created worktree because lib/evidence/manifest-generator.js:362 process.exit(1)s when ./test-results doesn\'t exist yet — unrelated to this SD\'s scope, not fixed here',
    'tests/unit/golden-references/witness-emitter-acceptance.test.js ("action OUTSIDE the transaction fails action_inside_transaction") fails on main independent of this SD\'s changes — pre-existing regression from a different, already-shipped SD (SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D), confirmed unrelated by two independent checks (TESTING sub-agent + this session) but left unfixed per scope discipline'
  ],
  key_learnings: [
    { learning: 'Design docs and parent-SD descriptions can carry forward-references to plans that were adjudicated but never implemented (solomon_systemic_finding referenced a solomon-oracle.md §10 that does not exist in the repo, in any git history, or on disk) — always ground-truth verify a "reuse X" instruction against the actual codebase (full-repo grep + the live protocol doc, here CLAUDE_SOLOMON.md) before building on it, even when the instruction appears in an authoritative-looking design doc.', is_boilerplate: false },
    { learning: 'When a spec conflict is caught and corrected at the child-SD level, the correction does not automatically propagate to the parent orchestrator or to sibling children reading the same shared description — it must be actively signaled to the coordinator so siblings do not independently re-derive the same stale assumption and burn effort on the wrong wire kind.', is_boilerplate: false },
    { learning: 'GATE_SUBAGENT_EVIDENCE blocking on a read-only built-in agent (Explore) is a structural, fleet-wide harness gap, not an SD-specific issue: the intended auto-capture path (task-subagent-recorder.cjs PostToolUse hook) is effectively non-functional (9 task_hook rows across hundreds of handoffs), so every LEAD-TO-PLAN handoff either hand-rolls a manual-insert workaround or is at risk of stalling. RCA-confirmed fix options: drop Explore from the blocking set (gate on prd.exploration_summary at PLAN-TO-EXEC instead), or promote the one-off pattern into a supported CLI.', is_boilerplate: false },
    { learning: 'Two independent verification passes (this session + the TESTING sub-agent) on an unrelated full-suite test failure gave high confidence it was pre-existing and out of scope — corroboration across two independently-reasoning checks is a cheap, effective way to avoid both false "it\'s pre-existing, ignore it" dismissals and false "I broke this" scope creep.', is_boilerplate: false },
    { learning: 'A small, single-leg wire change (one enum field on one existing payload leg) still benefits from the full LEAD→PLAN→EXEC→VERIFY chain: the PRD\'s 15 acceptance criteria and the 3-file/3-test-file discipline kept the change auditable despite its small size, and the gate chain caught the harness bug early rather than at merge time.', is_boilerplate: false }
  ],
  action_items: [
    {
      owner: 'Coordinator / parent SD owner',
      action: 'Correct SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001\'s description and docs/design/fw3-effort-distribution-tier-design.md §6c to reference adam_advisory+payload.oracle:true instead of the never-implemented solomon_systemic_finding kind, so the parent record itself is no longer a stale-assumption source for remaining siblings',
      source: 'spec_conflict_finding',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'Parent SD description and design-doc §6c no longer reference solomon_systemic_finding; both name adam_advisory/oracle:true explicitly',
      evidence_ref: 'session_coordination id 1358ce4e-c414-4a74-ad52-7e1c35c32e06'
    },
    {
      owner: 'LEO Protocol / harness team',
      action: 'File a harness-backlog SD for GATE_SUBAGENT_EVIDENCE\'s LEAD-TO-PLAN Explore requirement: either drop Explore from the blocking required-subagent set (scripts/modules/handoff/required-subagents.js:25) and gate exploration via prd.exploration_summary at PLAN-TO-EXEC, or promote the manual-insert workaround into a supported scripts/record-explore-evidence.js CLI',
      source: 'harness_bug',
      priority: 'high',
      smart_format: true,
      success_criteria: 'A tracked SD exists for this fix; RCA reference aa445f8c and session_coordination id 2a9d643e-7f2f-4704-aae3-dc2822e9212b cited as evidence',
      evidence_ref: 'session_coordination id 2a9d643e-7f2f-4704-aae3-dc2822e9212b'
    },
    {
      owner: 'Test infra owner',
      action: 'Investigate and fix lib/evidence/manifest-generator.js:362 process.exit(1) on missing ./test-results in a fresh worktree (npm run test:e2e false-fails before any test runs)',
      source: 'harness_bug',
      priority: 'low',
      smart_format: true,
      success_criteria: 'npm run test:e2e no longer exits 1 solely because ./test-results is absent in a freshly-created worktree'
    },
    {
      owner: 'Golden-references doctrine owner (SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D)',
      action: 'Fix pre-existing failure in tests/unit/golden-references/witness-emitter-acceptance.test.js ("action OUTSIDE the transaction fails action_inside_transaction")',
      source: 'pre_existing_failure',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'Test passes on main; confirmed unrelated to FW3-B\'s touched files (worker-status.cjs/adam-advisory.cjs/solomon-advisory.cjs)',
      evidence_ref: 'session_coordination id 6e3f08ee-e9c6-4d3c-8bfc-84014461095d'
    }
  ],
  success_patterns: [
    'Ground-truth verification (full-repo grep + reading the live protocol doc) before building on a design-doc "reuse X" instruction caught a stale forward-reference before any code was written against the wrong wire kind',
    'RCA before workaround: the GATE_SUBAGENT_EVIDENCE/Explore block was diagnosed to root cause (read-only agent vs. non-functional auto-capture hook) rather than bypassed, and resolved with the already-established sibling workaround',
    'Two independent checks (session + TESTING sub-agent) corroborating an unrelated pre-existing test failure before deciding not to fix it',
    'Full LEAD→PLAN→EXEC→VERIFY handoff chain all-green (93/98/96) on a small, tightly-scoped 3-file/3-test-file change'
  ],
  failure_patterns: [
    'Parent-orchestrator description and its cited design doc (§6c) contained a stale, never-implemented wire-kind reference (solomon_systemic_finding) that could have silently propagated to sibling children if not caught and signaled',
    'GATE_SUBAGENT_EVIDENCE required Explore evidence for LEAD-TO-PLAN twice before the manual-insert workaround was applied (2 auto-signaled STUCK escalations at 19:19:22Z and 19:36:18Z)'
  ],
  quality_score: 90,
  team_satisfaction: 9,
  business_value_delivered: 'Adds payload.framing_class (instrument|pick) as a sub-discriminator on the existing adam_advisory/oracle:true systemic-finding wire, giving downstream consumers (Adam, future FW-3 siblings B\'s dependents) a machine-readable signal to distinguish tactical instrument findings from framing-level picks without inventing a new, unregistered wire kind. Also prevents a fleet-wide stale-assumption re-derivation by signaling the corrected wire choice to the coordinator for sibling FW-3 children.',
  customer_impact: 'None directly customer-facing — internal fleet coordination plumbing (harness infrastructure)',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 2,
  bugs_resolved: 0,
  tests_added: 2,
  performance_impact: 'Negligible — additive optional field, no new I/O',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  related_files: [
    'lib/fleet/worker-status.cjs',
    'scripts/solomon-advisory.cjs',
    'scripts/adam-advisory.cjs',
    'tests/unit/adam-advisory-framing-class.test.js',
    'tests/unit/fleet/framing-classes.test.js',
    'tests/unit/solomon-advisory.test.js',
    'docs/design/fw3-effort-distribution-tier-design.md'
  ],
  affected_components: ['adam_advisory wire (oracle:true leg)', 'lib/fleet/worker-status.cjs PAYLOAD_KINDS SSOT', 'Adam drain-set consumer (scripts/adam-advisory.cjs)'],
  tags: ['fw3', 'framing-class', 'spec-conflict-caught', 'harness-bug-explore-evidence', 'infra-plumbing']
};

const { data: sd } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();

const { data, error } = await s
  .from('retrospectives')
  .update(update)
  .eq('id', RETRO_ID)
  .select('id, sd_id, quality_score')
  .single();

if (error) {
  console.error('ENHANCE ERROR:', error.message);
  process.exit(1);
}

if (data.sd_id !== sd.id) {
  console.error(`ENHANCE ERROR: RETRO_ID ${RETRO_ID} belongs to sd_id=${data.sd_id}, not ${SD_KEY} (${sd.id}) — refusing to report success on a mismatched retro.`);
  process.exit(1);
}

console.log('Enhanced retrospective', data.id, 'for', SD_KEY, '- quality_score:', data.quality_score);
