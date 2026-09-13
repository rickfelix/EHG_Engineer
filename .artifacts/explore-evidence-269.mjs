/**
 * Explore sub-agent evidence writer for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001
 * (LEAD-TO-PLAN). Uses the canonical writer path — storeSubAgentResults +
 * applySubAgentRepoVerdict — never a hand-rolled insert.
 */
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_UUID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';
const SD_KEY = 'SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001';

const supabase = await getSupabaseClient();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'Explore',
  probeExistsRelative: 'lib/coordinator/dispatch.cjs',
  supabase,
});

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Read-only research to scope PLAN-phase remaining work for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001, following '
    + 'VALIDATION\'s finding that the SD fix shape limb (a) — a writer that sets payload.urgency=\'interrupt\' on '
    + 'coordinator rulings that reverse in-flight work — was never implemented, even though the reader side merged. '
    + 'Located the canonical write chokepoint (lib/coordinator/dispatch.cjs: insertCoordinationRow / dispatchToWorker), '
    + 'confirmed no existing classifier for "reverses in-flight work" exists (must be an explicit caller-supplied '
    + 'parameter), and identified the fence_notice precedent (lib/sd/amend-sd.js:291-310) as the structural template.',
  critical_issues: [],
  warnings: [],
  recommendations: [
    'Scope PLAN-phase FR-1 as: add an explicit urgency parameter to the ruling-authoring path so a caller can stamp '
      + "payload.urgency='interrupt' at insert time, mirroring lib/sd/amend-sd.js:291-310's fence_notice payload construction "
      + 'through lib/coordinator/dispatch.cjs:1905-1912 (dispatchToWorker).',
    'Scope PLAN-phase FR-2 as: fix the stale doc pointer at scripts/hooks/coordination-inbox.cjs:842-843 (cites '
      + 'docs/protocol/coordinator-adam-comms.md, which has zero "urgency"/"fence_notice" matches) — either add a real '
      + 'cross-referencing subsection there (best insertion points: the "Receipt contract" section at lines 115-162, or '
      + 'the "Optional, validated typed --kind at send" section at lines 368-393) or correct the pointer to name '
      + 'docs/reference/fleet-coordination.md:173-194, which already carries the real section.',
    'Because no existing classifier infers "reverses in-flight work" from message content, the new parameter must be an '
      + 'explicit, caller-supplied flag (coordinator/LLM judgment at authoring time) — do not attempt automatic inference.',
  ],
  justification:
    'Confirms VALIDATION\'s finding via independent grep/read evidence rather than re-deriving it: zero writers set '
      + 'payload.topic=\'ruling\' anywhere in scripts/ or lib/ (excluding archive/) as purpose-built code — the one '
      + 'historical row with topic=\'ruling\' was ad hoc, not from a dedicated helper. The real chokepoint for any '
      + 'coordinator→worker payload (including a future urgency stamp) is lib/coordinator/dispatch.cjs\'s '
      + 'insertCoordinationRow/dispatchToWorker pair. fence_notice (lib/sd/amend-sd.js:291-310) is a directly analogous, '
      + 'already-shipped precedent for adding one more payload key at a dispatchToWorker call site.',
  validation_mode: 'retrospective',
  execution_time_ms: 0,
  metadata: {
    sd_key: SD_KEY,
    agent_kind: 'Task-tool Explore (built-in, unregistered in leo_sub_agents by design — see required-subagents.js comment)',
    escalation_reason: 'QF escalated to SD for sensitive-path governance (scripts/hooks/coordination-inbox.cjs, fleet-wide PostToolUse hook)',
    findings: {
      writer_for_topic_ruling: 'NONE — grep across scripts/ and lib/ (excl. archive/) finds zero purpose-built writers; only test fixtures and prose docs reference topic:"ruling"',
      canonical_dispatch_chokepoint: 'lib/coordinator/dispatch.cjs:1453 insertCoordinationRow(supabase, row, opts); thin wrapper dispatchToWorker at :1905-1912; both exported :1914-1929',
      reverses_in_flight_classifier: 'NONE EXISTS — closest adjacent concept is payload.message_kind (lib/coordinator/message-kinds.cjs:30-38, CORRECTION_KINDS retraction/amend/supersede) which is about correcting prior messages, not about build-direction reversal; must be a new explicit caller-supplied parameter',
      fence_notice_precedent: 'lib/sd/amend-sd.js:261-318 (amendSd function): gated on isInActiveBuildPhase + PRD existence + claiming_session_id; calls dispatchToWorker(supabase, { ..., payload: { kind: "fence_notice", sd_key, amended_fields, body } }, { logger }) at lines 291-310',
      doc_venue_confirmed: {
        coordinator_adam_comms_md: 'zero matches for "urgency" or "fence_notice" (contradicts the code comment at coordination-inbox.cjs:842-843)',
        fleet_coordination_md: 'lines 173-194 carry the real "Urgency classes (payload.urgency)" section, including the ruling example at line 187',
        best_insertion_points_in_coordinator_adam_comms_md: ['lines 115-162 (Receipt contract — ALL directive kinds)', 'lines 368-393 (Optional, validated typed --kind at send)'],
      },
    },
    evidence_author: 'Explore sub-agent (Task tool run, read-only research)',
  },
};

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'Explore',
  SD_UUID,
  { name: 'Explore (Task-tool research agent)' },
  results,
  { phase: 'LEAD-TO-PLAN', sdKey: SD_KEY },
);

console.log('Stored Explore evidence row id:', stored?.id || stored?.data?.id || JSON.stringify(stored));
