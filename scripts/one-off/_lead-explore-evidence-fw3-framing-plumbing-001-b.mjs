// Record Explore evidence for SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B.
// Explore agent (built-in, read-only, no Write tool) cannot self-write to
// sub_agent_execution_results — this persists its REAL findings from the actual
// Explore run this session (task-subagent-recorder.cjs hook is flaky; established
// workaround per RCA, mirrors sibling -001-C and parent -001).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B';

const { data: sd } = await s.from('strategic_directives_v2').select('id, metadata').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

const exploreRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Codebase Explorer',
  verdict: 'PASS',
  confidence: 90,
  critical_issues: [],
  warnings: [
    'lib/fleet/worker-status.cjs PAYLOAD_KINDS has NO per-kind field-level schema at all — no nested shape validation exists for any kind (e.g. payload.oracle is only a runtime convention, never declared there). framing_class registration must follow the same convention: a documented enum const, not a schema addition.',
  ],
  recommendations: [
    "DRAIN_SETS.adam (lib/fleet/worker-status.cjs ~lines 143-156) already includes PAYLOAD_KINDS.ADAM_ADVISORY -- a new framing_class field needs NO new drain-set registration, only a FRAMING_CLASSES enum const + doc comment near ADAM_ADVISORY (line 64).",
    'scripts/adam-advisory.cjs never destructures payload.oracle or any oracle-specific field (zero hits for oracle/framing_class in that file); natural insertion point is the row-rendering loop in drainInbox (~lines 543-636, the console.log/warn block ~620-630) — add a payload.framing_class read there.',
    'The actual field is stamped in scripts/solomon-advisory.cjs, NOT adam-advisory.cjs: buildAdvisoryPayload (~lines 102-128), payload literal ~107-113 already sets oracle:true alongside kind/sender_callsign/repo/reply_class -- framing_class belongs in that same object literal.',
    'Extend, do not duplicate: tests/unit/solomon-advisory.test.js (asserts p.oracle===true on buildAdvisoryPayload output) and tests/unit/fleet/drain-sets-send-warn.test.js (asserts DRAIN_SETS.adam contents) are the existing tests this SD extends.',
    'Wire-contract docs to update for consistency: docs/protocol/coordinator-solomon-comms.md (documents the adam_advisory+payload.oracle=true leg) and CLAUDE_SOLOMON.md line 222 (references a never-created solomon-oracle.md and a never-implemented solomon_systemic_finding kind -- confirms this leg is the correct, ground-truth-verified reuse target per FW-3 design doc docs/design/fw3-effort-distribution-tier-design.md 6c, which mandates framing_class in {instrument,pick} on THIS leg, explicitly rejecting a new kind).',
  ],
  detailed_analysis: JSON.stringify({
    payload_kinds_shape: 'lib/fleet/worker-status.cjs PAYLOAD_KINDS (~lines 59-75): flat Object.freeze({KEY: \'string\'}) map, no per-kind field schema anywhere in the file.',
    drain_set_state: 'ADAM_EXCLUDED_KINDS (~line 131): [canary_request, comms_check, ack, coordinator_ack, cross_party_ping]. DRAIN_SETS.adam (~lines 143-156) = [...DIRECTIVE_KINDS, PAYLOAD_KINDS.ADAM_ADVISORY, PAYLOAD_KINDS.COORDINATOR_REPLY, PAYLOAD_KINDS.CANARY_REQUEST, comms_check, PAYLOAD_KINDS.CROSS_PARTY_PING] -- adam_advisory already present, no new drain-set entry needed.',
    consumer_gap: 'scripts/adam-advisory.cjs drainInbox (~lines 543-636) has NO existing payload.oracle or payload.framing_class read path -- consumption is genuinely new work, not a duplicate. Oracle rows currently drain generically via isReplyRow/isAdamInboxRow with no oracle-specific branching.',
    sender_site: 'scripts/solomon-advisory.cjs buildAdvisoryPayload (~lines 102-128) is the actual production stamping site for oracle:true -- this is where framing_class as an optional sub-discriminator naturally sits alongside it.',
    tests_to_extend: 'tests/unit/solomon-advisory.test.js (oracle:true assertions on buildAdvisoryPayload), tests/unit/fleet/drain-sets-send-warn.test.js (DRAIN_SETS.adam contents), tests/unit/solomon-consult-originator-cc.test.js (raw {oracle:true} payload fixtures) -- none currently assert PAYLOAD_KINDS field-level shape for adam_advisory.',
    wire_contract_docs: 'docs/protocol/coordinator-solomon-comms.md documents the adam_advisory+payload.oracle=true table row; CLAUDE_SOLOMON.md line 210 (systemic_flag handoff doctrine) and line 222 (references solomon-oracle.md 10 and solomon_systemic_finding -- both confirmed non-existent/never-implemented, i.e. this leg is CURRENTLY the real, live wire, reused per FW-3 design doc 6c which is authoritative for framing_class in {instrument,pick} on this exact leg, not a new kind).',
  }),
  metadata: {
    files_identified: [
      'lib/fleet/worker-status.cjs',
      'scripts/adam-advisory.cjs',
      'scripts/solomon-advisory.cjs',
      'tests/unit/solomon-advisory.test.js',
      'tests/unit/fleet/drain-sets-send-warn.test.js',
      'tests/unit/solomon-consult-originator-cc.test.js',
      'docs/protocol/coordinator-solomon-comms.md',
      'CLAUDE_SOLOMON.md',
      'docs/design/fw3-effort-distribution-tier-design.md',
    ],
  },
  validation_mode: 'prospective',
  source: 'Explore',
  phase: 'LEAD',
  summary: 'Confirmed adam_advisory+oracle:true is the live systemic-finding leg (no field-level PAYLOAD_KINDS schema exists anywhere, so framing_class registration = a documented enum const, not a schema change). DRAIN_SETS.adam already carries ADAM_ADVISORY -- no new drain-set entry needed. Sender-side stamping site is scripts/solomon-advisory.cjs buildAdvisoryPayload (not adam-advisory.cjs); consumer-side scripts/adam-advisory.cjs drainInbox has no existing oracle/framing_class handling, so consumption is new, non-duplicate work. Identified the exact tests to extend and the wire-contract docs (CLAUDE_SOLOMON.md, coordinator-solomon-comms.md) confirming solomon_systemic_finding was never implemented -- this leg is the ground-truth-correct reuse target per FW-3 design doc 6c.',
};
const { data: ev, error: evErr } = await s.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
if (evErr) { console.log('EXPLORE EVIDENCE ERR:', evErr.message); process.exit(1); }
console.log('EXPLORE_EVIDENCE', ev.id);
