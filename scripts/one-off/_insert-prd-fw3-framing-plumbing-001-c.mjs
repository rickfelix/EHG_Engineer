// Insert PRD for SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C (INLINE mode — add-prd-to-database.js
// printed the generation prompt and expects Claude Code to insert directly; same precedent as
// sibling -B's scripts/one-off/_insert-prd-fw3-framing-plumbing-001-b.mjs).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C';

const { data: sd } = await s.from('strategic_directives_v2').select('id, sd_key, title').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

const functional_requirements = [
  {
    id: 'FR-1', priority: 'critical',
    title: 'Pure fail-closed routing predicate (lib/governance/fw3-framing-router.cjs)',
    description: "New CJS module (consistent with sibling fw3-abstraction-rubric.cjs / fw3-cmv-rejecter.cjs) exporting routeFraming(row): for a row on the oracle systemic-finding leg (payload.oracle===true), framing_class==='instrument' -> {route:'adam_sourcing'}; framing_class==='pick' -> {route:'chairman_escalation', reason:'pick-class'}; missing or unrecognized framing_class -> {route:'chairman_escalation', reason:'unproven'} (FAIL-CLOSED: a framing that cannot PROVE instrument-class escalates). Non-oracle rows are OUT OF DOMAIN -> {route:null} (they are advisories, not framings — prevents chairman-queue flooding by legacy rows). Enum values come from the FRAMING_CLASSES SSOT (lib/fleet/worker-status.cjs, established by sibling -B).",
    acceptance_criteria: ["routeFraming is pure (no IO, no DB)", "instrument -> adam_sourcing; pick -> chairman_escalation", "oracle row with missing framing_class -> chairman_escalation reason 'unproven'", "oracle row with framing_class 'garbage' -> chairman_escalation (fail-closed, never adam_sourcing)", "non-oracle row -> route null regardless of framing_class"],
  },
  {
    id: 'FR-2', priority: 'critical',
    title: 'Drain-site wiring in scripts/adam-advisory.cjs (replaces -B interim warn)',
    description: "At the -B PICK-CLASS warn site in drainInbox, invoke routeFraming per row: chairman_escalation routes call recordPendingDecision (lib/chairman/record-pending-decision.mjs — the chairman-escalation fork that feeds lib/comms/adam-outbound decision-scheduler surfacing) and render 'routing:chairman-escalation'; adam_sourcing routes render 'routing:adam-sourcing' and proceed exactly as today (no fork). The escalation write is fail-SOFT for the drain (never breaks draining) but LOUD on failure (stderr) and a failed write does NOT render the row as routed.",
    acceptance_criteria: ["pick row triggers exactly one recordPendingDecision call and renders routing:chairman-escalation", "instrument row triggers zero decision writes and renders routing:adam-sourcing", "unproven oracle row (no framing_class) escalates like pick with reason surfaced", "decision-write failure emits stderr matching /ESCALATION WRITE FAILED/ and the drain continues", "plain (non-oracle) advisory rows render byte-identical to pre-SD", "RISK condition (a): recordPendingDecision is called with EXPLICIT non-auto-escalating params — blocking:false and decisionType:'framing_escalation' (NOT 'session_question') — so shouldAutoEscalate() is false and rows QUEUE for decision-scheduler surfacing without per-row standout email/SMS", "RISK condition (b): draining N>3 pick/unproven oracle rows fires ZERO immediate standout escalations (test asserts escalated===false / no escalateChairmanDecision invocation on the FW-3 path)"],
  },
  {
    id: 'FR-3', priority: 'high',
    title: 'Escalation payload carries framing context + per-row idempotency',
    description: "The pending-decision row's brief_data includes: source advisory row id, framing_class (or 'unproven'), sender session, and a body excerpt. Idempotent per advisory row id — re-draining the same row (or a retry) must not create a duplicate pending decision (probe by advisory row id marker in brief_data/decision key before insert).",
    acceptance_criteria: ["brief_data contains advisory_row_id + framing_class + excerpt", "double-drain of the same pick row records exactly one pending decision", "decision row status='pending' (records, never decides — constitutional constraint of record-pending-decision.mjs)"],
  },
  {
    id: 'FR-4', priority: 'high',
    title: 'Lane-vocabulary analog mapping (sourcing-engine consistency)',
    description: "The router's result carries a laneAnalog field reusing the sourcing-engine lane vocabulary (lib/sourcing-engine/lane.js): chairman_escalation -> LANE.CHAIRMAN_GATED analog, adam_sourcing -> LANE.BELT_READY analog — mapping constants only (no conversion_ledger writes in this SD), so downstream FW-3 consumers persist consistently.",
    acceptance_criteria: ["routeFraming(...).laneAnalog === 'chairman-gated' for pick/unproven", "laneAnalog === 'belt-ready' for instrument", "values imported from/equal to lane.js constants, not re-typed literals"],
  },
  {
    id: 'FR-5', priority: 'critical',
    title: 'Tests: router matrix + drain wiring + -B pin-test update',
    description: "New tests/unit/governance/fw3-framing-router.test.js pinning the full fail-closed matrix (instrument/pick/missing/unknown/non-oracle + laneAnalog). Extend/UPDATE tests/unit/adam-advisory-framing-class.test.js: the -B interim warn assertions are superseded by routed-behavior assertions (routing tag + escalation call + fail-soft error path) — updated in the SAME PR (two-pin-location lesson: sweep repo-wide for pins on the replaced warn text before merging). Full regression on touched files.",
    acceptance_criteria: ["fw3-framing-router.test.js passes with full matrix coverage", "adam-advisory-framing-class.test.js updated + passing (no stale /PICK-CLASS FRAMING/ pin left anywhere repo-wide)", "solomon-advisory.test.js + fleet/framing-classes.test.js still pass unchanged"],
  },
];

const technical_requirements = [
  { id: 'TR-1', description: 'No new PAYLOAD_KINDS/DRAIN_SETS entries, no DDL, no new transport. Consumes the payload.framing_class field contract established by sibling -B; CJS module style consistent with existing fw3-* governance modules.' },
  { id: 'TR-2', description: 'FAIL-CLOSED DOMAIN BOUND: the predicate domain is exactly payload.oracle===true rows (systemic-finding framings). Plain advisories (no oracle flag) are untouched — this is the flood-guard that makes fail-closed safe to ship against legacy rows.' },
  { id: 'TR-3', description: 'recordPendingDecision is invoked as the RECORD-only fork (constitutional: records pending, never decides; its own shouldAutoEscalate policy governs email/SMS side-effects). The drain awaits it inside try/catch: fail-soft for drain liveness, loud (stderr) on failure, and the row is not rendered as routed on failure.' },
];

const test_scenarios = [
  { id: 'TS-1', scenario: 'Drain a pick-class oracle row', expected: 'one recordPendingDecision call; line renders routing:chairman-escalation; no PICK warn (superseded)' },
  { id: 'TS-2', scenario: 'Drain an instrument-class oracle row', expected: 'zero decision writes; renders routing:adam-sourcing; drain proceeds as today' },
  { id: 'TS-3', scenario: 'Drain an oracle row with NO framing_class', expected: 'escalated fail-closed (reason unproven); routing:chairman-escalation rendered' },
  { id: 'TS-4', scenario: 'Drain a non-oracle advisory row', expected: 'route null; rendering byte-identical to pre-SD; no escalation' },
  { id: 'TS-5', scenario: 'Drain the same pick row twice (retry/replay)', expected: 'exactly one pending decision exists (idempotent on advisory row id)' },
  { id: 'TS-6', scenario: 'Decision insert throws (mocked DB error)', expected: 'stderr /ESCALATION WRITE FAILED/; drain continues; row not rendered as routed' },
  { id: 'TS-7', scenario: "oracle row with framing_class 'garbage'", expected: 'escalated (fail-closed) — never adam_sourcing' },
  { id: 'TS-8', scenario: 'Drain 5 pick/unproven oracle rows in one background pass (legacy-backlog simulation)', expected: '5 pending decision rows queue; ZERO standout chairman emails/SMS fire (escalated===false each; shouldAutoEscalate never true on the FW-3 path)' },
];

const risks = [
  { risk: 'Chairman-queue flooding from legacy oracle rows lacking framing_class once fail-closed routing activates', impact: 'medium', likelihood: 'medium', mitigation: 'Domain bounded to oracle:true rows only + per-row idempotency; oracle-leg volume is low (Solomon systemic findings). Queue growth observable in chairman decision queue; reversible by reverting the drain wiring (predicate stays pure).' },
  { risk: "-B pin tests on the interim PICK-CLASS warn break when the warn is superseded by routing", impact: 'low', likelihood: 'high', mitigation: 'FR-5 mandates updating adam-advisory-framing-class.test.js in the same PR and sweeping repo-wide (tests/ AND scripts/**/__tests__) for any other pin on the warn text — the QF-20260719-120 two-pin-location lesson.' },
  { risk: 'recordPendingDecision AUTO-ESCALATES on insert (standout email + gated SMS) whenever shouldAutoEscalate() is true — blocking:true OR (raisedBy adam && decisionType session_question) — so a first background drain over a legacy backlog of unproven oracle rows could fire per-row chairman escalations (the known ~165-emails-in-20-min Resend-burn pattern); per-row idempotency does NOT prevent this since each distinct row is a distinct escalation (RISK sub-agent verified in code, L87-90/L305-313)', impact: 'high', likelihood: 'medium', mitigation: "PINNED by FR-2 acceptance criteria: the drain site passes blocking:false + decisionType:'framing_escalation' (non-session_question) so shouldAutoEscalate() is provably false — rows QUEUE for decision-scheduler surfacing only. Enforced by TS-8 (N>3 drain fires zero standout escalations) so EXEC cannot silently reintroduce the flood. Rate-cap/digest-fold in the escalation module remain as defense-in-depth, not the primary control." },
];

const system_architecture = {
  overview: 'A pure fail-closed routing predicate over the framing_class wire (-B contract), wired at the single drain chokepoint where framings are consumed. PICK/unproven -> the existing chairman-escalation fork (record-pending-decision -> decision-scheduler surfacing); INSTRUMENT -> the existing Adam-sourcing flow.',
  components: [
    { name: 'lib/governance/fw3-framing-router.cjs', role: 'NEW: pure routeFraming predicate + lane-analog mapping. No IO.' },
    { name: 'scripts/adam-advisory.cjs (drainInbox)', role: 'Wiring: per-row routing at the -B warn site; fail-soft loud escalation write; rendering tags.' },
    { name: 'lib/chairman/record-pending-decision.mjs', role: 'EXISTING chairman-escalation fork (records pending decision; feeds decision-scheduler).' },
    { name: 'lib/sourcing-engine/lane.js', role: 'EXISTING lane vocabulary; source of the laneAnalog constants.' },
  ],
  data_flow: "Solomon framing (adam_advisory + oracle:true + framing_class from -B) -> Adam drainInbox -> routeFraming: pick/unproven -> recordPendingDecision (chairman_decisions status=pending, brief_data carries framing context) -> decision-scheduler surfaces to chairman; instrument -> rendered sourcing-eligible, existing Adam-sourcing flow proceeds. Fail-closed: nothing on the oracle leg auto-sources without a proven instrument classification.",
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
  executive_summary: "Build the FAIL-CLOSED pick-vs-instrument routing that sibling -B's wire discriminator was plumbed for: a pure predicate (routeFraming) over payload.framing_class on the oracle systemic-finding leg, wired at the Adam drain chokepoint. PICK-class (CMV/portfolio-altitude) and UNPROVEN framings route to the chairman-escalation fork (record-pending-decision -> decision-scheduler); INSTRUMENT-class framings route to Adam-sourcing. This closes the govern-by-ABSENCE risk: a framing silently degrading govern-by-exception can no longer auto-source past the chairman.",
  business_context: "FW-3 parent: framing is upstream of every approval gate — 'deciding what the problem is' is the chairman's most consequential strategic act. -B made pick-class framings VISIBLE (loud warn, explicitly deferring routing to this SD); this child makes the routing REAL and fail-closed, so the chairman gauge can never read green while pick-class framings quietly auto-source.",
  technical_context: 'No DDL, no new kinds. Consumes -B field contract (FRAMING_CLASSES SSOT), reuses the existing chairman-escalation fork and sourcing-engine lane vocabulary. Domain bounded to oracle:true rows to prevent legacy-row queue flooding.',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria: functional_requirements.flatMap(fr => fr.acceptance_criteria),
  risks,
  system_architecture,
  implementation_approach: '(1) fw3-framing-router.cjs pure predicate + matrix tests; (2) drainInbox wiring replacing the -B interim warn (routing tags + fail-soft loud escalation write + per-row idempotency); (3) update -B pin test to routed behavior + repo-wide pin sweep; (4) full regression on touched files. Target <=100 LOC source diff.',
  dependencies: ['SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B (completed — framing_class wire contract)'],
  constraints: ['Fail-closed: unproven never auto-sources', 'Domain bounded to payload.oracle===true rows', 'record-only escalation (never decides)', 'No new kinds/DDL'],
  assumptions: ['Oracle-leg volume stays low (Solomon systemic findings), so fail-closed escalation of unproven rows is chairman-tolerable', 'Sibling -D (adversarial rejecter) consumes the same routed output downstream'],
  metadata: { field_contract_source: 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B PRD FR-1' },
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
