// Insert PRD for SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B (INLINE mode — add-prd-to-database.js
// printed the generation prompt and expects Claude Code to insert directly). Content reflects
// the ALREADY-IMPLEMENTED change (built during LEAD investigation), not a speculative plan.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B';

const { data: sd } = await s.from('strategic_directives_v2').select('id, sd_key, title').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

const functional_requirements = [
  {
    id: 'FR-1', priority: 'critical',
    title: 'FRAMING_CLASSES wire-discriminator SSOT',
    description: "Register FRAMING_CLASSES = Object.freeze({INSTRUMENT:'instrument', PICK:'pick'}) in lib/fleet/worker-status.cjs, exported alongside PAYLOAD_KINDS. NOT a new PAYLOAD_KINDS entry or DRAIN_SETS registration -- adam_advisory already carries the leg; this is a payload-shape sub-discriminator per FW-3 design doc docs/design/fw3-effort-distribution-tier-design.md §6c.",
    acceptance_criteria: ["FRAMING_CLASSES exported from lib/fleet/worker-status.cjs with exactly {instrument, pick}", "Object.values(PAYLOAD_KINDS) does not contain 'instrument' or 'pick' (no new kind)", "DIRECTIVE_KINDS does not contain 'instrument' or 'pick'"],
  },
  {
    id: 'FR-2', priority: 'critical',
    title: 'Sender-side stamping in solomon-advisory.cjs',
    description: "Extend buildAdvisoryPayload({..., framingClass}) to stamp payload.framing_class when framingClass is provided (omitted entirely otherwise -- byte-identical to pre-SD behavior for every existing caller). Add a --framing-class CLI flag to the send command, validated against Object.values(FRAMING_CLASSES), mirroring the existing --reply-class flag pattern.",
    acceptance_criteria: ["buildAdvisoryPayload({body:'x'}) has no framing_class key", "buildAdvisoryPayload({body:'x', framingClass:'pick'}).framing_class === 'pick'", "CLI: --framing-class bogus exits 2 with an error naming the valid values", "payload.oracle remains true and payload.kind remains adam_advisory unchanged"],
  },
  {
    id: 'FR-3', priority: 'critical',
    title: 'Consumer-side surfacing in adam-advisory.cjs',
    description: "drainInbox reads payload.framing_class where present and appends a 'framing:<value>' tag to the rendered inbox line, so the field is never silently dropped. Rows with no framing_class render exactly as before (no tag).",
    acceptance_criteria: ["A row with framing_class:'pick' renders 'framing:pick' in its console.log line", "A row with framing_class:'instrument' renders 'framing:instrument'", "A row with no framing_class field has no 'framing:' tag at all"],
  },
  {
    id: 'FR-4', priority: 'high',
    title: 'Pick-class visibility warning (interim safety, not full routing)',
    description: "A framing_class:'pick' row additionally triggers a console.warn flagging it as a CMV/portfolio-altitude framing that must not be auto-sourced, and explicitly notes that fail-closed chairman-escalation ROUTING is a sibling FW-3 child SD's scope (out of scope here) -- this SD only prevents silent invisibility, it does not implement the routing decision.",
    acceptance_criteria: ["A pick-class row triggers a console.warn matching /PICK-CLASS FRAMING/", "The warning text includes a do-not-auto-source instruction", "An instrument-class or unset-framing row never triggers this warning"],
  },
  {
    id: 'FR-5', priority: 'high',
    title: 'Test coverage across all three files',
    description: "Extend tests/unit/solomon-advisory.test.js with framing_class send-side assertions; add tests/unit/adam-advisory-framing-class.test.js for consumer-side rendering + warning behavior; add tests/unit/fleet/framing-classes.test.js pinning the SSOT enum shape and its exclusion from PAYLOAD_KINDS/DIRECTIVE_KINDS.",
    acceptance_criteria: ["All 3 new/extended test files pass", "Existing solomon-advisory.test.js, adam-advisory-comms.test.js, adam-advisory-action-required.test.js, drain-sets-send-warn.test.js, relay-payload-kinds.test.js all still pass (no regressions)"],
  },
];

const technical_requirements = [
  { id: 'TR-1', description: 'No new PAYLOAD_KINDS entry or DRAIN_SETS registration -- payload-shape reuse only, per FW-3 design doc §6c which explicitly rejects a new solomon_framing kind.' },
  { id: 'TR-2', description: 'Ground-truth correction: solomon_systemic_finding (referenced by the parent SD description and design doc as "the existing leg") has ZERO code hits repo-wide -- it is a forward-reference to a never-created solomon-oracle.md. The actual live wire is adam_advisory+oracle:true (CLAUDE_SOLOMON.md line 220), which is what this PRD implements against.' },
  { id: 'TR-3', description: 'Backward compatibility: omitting --framing-class / framingClass produces a byte-identical payload to pre-SD behavior for every existing sender (worker-signal.cjs, other adam_advisory producers) -- purely additive field.' },
];

const test_scenarios = [
  { id: 'TS-1', scenario: 'Send with --framing-class pick', expected: 'payload.framing_class="pick" stamped; oracle:true unchanged' },
  { id: 'TS-2', scenario: 'Send with --framing-class instrument', expected: 'payload.framing_class="instrument" stamped' },
  { id: 'TS-3', scenario: 'Send with no --framing-class (default/omitted)', expected: 'no framing_class key on the payload at all (not null, not undefined key) -- byte-identical to pre-SD' },
  { id: 'TS-4', scenario: 'Send with --framing-class bogus', expected: 'CLI exits 2 with an error listing the valid values; no row written' },
  { id: 'TS-5', scenario: 'drainInbox renders a pick-class row', expected: 'inbox line includes "framing:pick" AND a separate PICK-CLASS FRAMING warning is printed' },
  { id: 'TS-6', scenario: 'drainInbox renders an instrument-class row', expected: 'inbox line includes "framing:instrument"; no PICK-CLASS warning' },
  { id: 'TS-7', scenario: 'drainInbox renders a row with no framing_class', expected: 'inbox line has no "framing:" tag; no warning; unchanged from pre-SD rendering' },
];

const risks = [
  { risk: 'A future producer forgets to set framing_class on a genuinely pick-class systemic finding', impact: 'medium', likelihood: 'medium', mitigation: 'This SD is wire-plumbing only (visibility), not classification logic or enforcement -- automatic classification/enforcement is explicitly a sibling FW-3 child SD scope (pick-vs-instrument fail-closed routing, -001-C). Documented here so PLAN/EXEC for that sibling inherits the field contract unambiguously.' },
  { risk: 'Confusion with the non-existent solomon_systemic_finding kind referenced by the parent SD/design doc', impact: 'low', likelihood: 'low', mitigation: 'Ground-truth verified (zero code hits repo-wide) and documented in this PRD + a /signal spec-conflict + Explore evidence row, so downstream FW-3 siblings do not independently re-derive the same stale assumption.' },
  { risk: 'Scope creep into implementing the actual pick-vs-instrument ROUTING decision (chairman-escalation fork vs Adam-sourcing)', impact: 'low', likelihood: 'low', mitigation: 'Explicitly out of scope; this SD stops at visibility (a loud warning), not routing. Enforced by keeping the diff to exactly 3 files + tests, no new routing/dispatch logic added.' },
];

const system_architecture = {
  overview: 'A payload-shape sub-discriminator (framing_class) added to the existing adam_advisory+oracle:true session_coordination leg. No new table, no new kind, no new transport.',
  components: [
    { name: 'lib/fleet/worker-status.cjs', role: 'SSOT for FRAMING_CLASSES enum (instrument|pick), exported alongside PAYLOAD_KINDS/DRAIN_SETS.' },
    { name: 'scripts/solomon-advisory.cjs', role: 'Sender: buildAdvisoryPayload stamps payload.framing_class when provided; CLI --framing-class flag with validation.' },
    { name: 'scripts/adam-advisory.cjs', role: 'Consumer: drainInbox reads and surfaces payload.framing_class in rendered output; loudly flags pick-class rows.' },
  ],
  data_flow: 'Solomon (or any adam_advisory sender) -> session_coordination row (payload.kind=adam_advisory, oracle:true, framing_class:instrument|pick) -> Adam\'s drainInbox reads + renders + (if pick) warns. No routing/dispatch decision is made here -- that is a sibling SD.',
};

const prd = {
  id: `PRD-${KEY}`,
  directive_id: KEY,
  sd_id: SD_UUID,
  title: `Product Requirements for ${KEY}`,
  version: '1.0',
  status: 'planning',
  category: 'Infrastructure',
  priority: 'high',
  phase: 'PLAN',
  executive_summary: 'Add a payload.framing_class (instrument|pick) sub-discriminator to the existing adam_advisory+oracle:true systemic-finding leg. Wire-plumbing only: registers the SSOT enum, stamps it on send, and surfaces it (with a loud pick-class warning) on consume. Ground-truth verified: the parent SD/design-doc reference to reusing "solomon_systemic_finding" is stale -- that kind was never implemented (zero code hits, forward-references a non-existent solomon-oracle.md); the real, live wire is adam_advisory+oracle:true. This corrected scope is what is implemented.',
  business_context: 'Part of FW-3 apex-framing plumbing (parent SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001): framing is upstream of every approval gate, so a pick-class (CMV/portfolio-altitude) framing that silently auto-sources bypasses the chairman\'s most consequential strategic act. This child SD is the wire-level prerequisite every other FW-3 child (pick-vs-instrument routing, adversarial rejecter, chairman digest, detection rubric, latency budgets, spine row) builds on.',
  technical_context: 'No DDL, no auth changes, no new kind/drain-set. Pure additive field on an existing JSONB payload leg, consumed by an existing drain loop.',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria: functional_requirements.flatMap(fr => fr.acceptance_criteria),
  risks,
  system_architecture,
  implementation_approach: 'Implemented directly during LEAD-phase ground-truth investigation (small, well-bounded plumbing change, already built + tested before PRD formalization): (1) FRAMING_CLASSES const in worker-status.cjs; (2) buildAdvisoryPayload + CLI flag in solomon-advisory.cjs; (3) drainInbox rendering + warning in adam-advisory.cjs; (4) 3 test files (2 new, 1 extended), 69/69 passing including full regression suite for touched files.',
  dependencies: [],
  constraints: ['No new PAYLOAD_KINDS/DRAIN_SETS entries (FW-3 design doc §6c mandate)', 'Byte-identical payload when framing_class is omitted'],
  assumptions: ['Sibling FW-3 children (-001-C pick-vs-instrument routing, -001-D adversarial rejecter, -001-E digest) will consume payload.framing_class as the field contract established here'],
  exploration_summary: 'Ground-truth verified via Explore sub-agent (evidence row persisted, id 5b0ecbf0-9678-44b2-adb5-096a7a5168ee): PAYLOAD_KINDS has no per-kind field schema (framing_class = enum const, not a schema change); DRAIN_SETS.adam already carries ADAM_ADVISORY (no new registration needed); adam-advisory.cjs had zero pre-existing oracle/framing_class handling (genuinely new consumption, not duplicate); sender site is solomon-advisory.cjs buildAdvisoryPayload (not adam-advisory.cjs); solomon_systemic_finding confirmed unregistered/never-implemented against CLAUDE_SOLOMON.md + full-repo grep.',
  metadata: { built_ahead_of_prd: true, ground_truth_correction: 'reuses adam_advisory+oracle:true, NOT solomon_systemic_finding (unregistered)' },
};

const { data: existing } = await s.from('product_requirements_v2').select('id').eq('directive_id', KEY).maybeSingle();
let result;
if (existing) {
  result = await s.from('product_requirements_v2').update(prd).eq('directive_id', KEY).select('id').single();
} else {
  result = await s.from('product_requirements_v2').insert(prd).select('id').single();
}
if (result.error) { console.log('PRD INSERT ERROR:', JSON.stringify(result.error)); process.exit(1); }
console.log('PRD_ID', result.data.id);
