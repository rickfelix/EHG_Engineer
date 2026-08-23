// Completion script: the row605/row609 UPDATEs from coordinator-contract-land.mjs already
// landed; only the 4 INSERTs failed (missing required protocol_id). This performs exactly
// those 4 inserts with the same content, protocol_id added.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROTOCOL_ID = 'leo-v4-3-3-ui-parity';

// Re-read the extracted manual block from the pre-migration snapshot to guarantee byte-identity.
const fs = await import('fs');
const snapshot = JSON.parse(fs.readFileSync(
  'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002/scripts/protocol/coordinator-contract-review-2026-08-23/coordinator-contract-9row-snapshot-pre-002.json',
  'utf8'
));
const startIdx = snapshot.row605_content.indexOf('## Blocked-claim resolution');
const endIdx = snapshot.row605_content.indexOf('## Adam GOVERNANCE');
const extractedManualBlock = snapshot.row605_content.substring(startIdx, endIdx);

const NEVER_DO_CONTENT = `**Never do these, regardless of context:**

1. **Never apply a production migration yourself.** Verify it is safe (purely additive — CREATE-only, no ALTER/DROP/data-mutation of existing objects), then APPROVE the worker to apply it themselves; the worker applies WITH your sign-off. Full procedure: "Blocked-claim resolution" in \`CLAUDE_COORDINATOR_MANUAL.md\`.
2. **Never dispatch an orchestrator PARENT as buildable work.** Parents auto-complete when their children finish — dispatch only children / leaf SDs.
3. **DOC-001 — never create SDs/QFs yourself.** Materialization uses canonical scripts only (\`node scripts/leo-create-sd.js\`, or Adam's proposal-materialization path); sourcing is Adam's lane, dispatch is yours.`;

const LOOP_GOVERNANCE_CONTENT = `**The coordinator's operational heartbeat is governed, not ad hoc.** All 34 of the coordinator's session-cron loops are registered in \`scripts/coordinator-startup-check.mjs\`'s \`STANDARD_LOOPS\` array — the ONLY place a loop's cadence, GHA-backing, or session-arming status is defined. **Loop changes land in the registry, never ad hoc** — a loop added, removed, or rescheduled outside this array is invisible to the coordinator's own startup check and to \`.claude/commands/coordinator.md\`'s "arm exactly the set this script emits" instruction.

**2026-08-22 cron ruling (operator commission 60153bf2, encoded QF-20260822-510):** 8 of the 34 loops (\`sweep\`, \`unranked-gauge\`, \`singleton-relaunch\`, \`relay-drop-gauge\`, \`fleet-retro\`, \`row-growth\`, \`gauge-runner\`, \`feedback-sla\`) carry \`session_arm: false\` — GHA-backed only, dropped from the session-armed set. Two GHA-backed loops (\`relay-drain\`, \`sms-relay-drain\`) are a deliberate carve-out and remain session-armed. **Reversal condition** (through 2026-08-25T22:00:00Z): if any dropped loop's artifact goes stale beyond 2x its GHA cadence, re-arm it as session-owned pending re-review.

*This table is DRIFT-CHECKED (never regenerated) against the live array by \`tests/unit/coordinator/coordinator-loop-governance-drift.test.js\`, via the checked-in snapshot \`scripts/coordinator-loop-governance-snapshot.json\`. When STANDARD_LOOPS changes, update the snapshot file AND this section together.*`;

const PROVENANCE_STUB_CONTENT = `This is the initial \`CLAUDE_COORDINATOR_PROVENANCE.md\` seed (SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002). It does not yet carry the full dated-rationale history embedded across the charter's duty list and governance clauses — those dates remain fused with their operational rules in \`CLAUDE_COORDINATOR.md\` by deliberate choice (see the FR-4 scoping note below). Populate this file incrementally as genuinely historical-only content (superseded cadences, resolved incidents) is identified and can be extracted without paraphrasing the rule it explains.

**FR-4 scoping note (ground-truthed at EXEC):** the original plan described "tripled utilization statements" as duplicate content to dedupe. Measurement showed this was false — the 8 "utilization" mentions in the charter are distinct operational duties with dates woven inline into the SAME sentence as the rule itself (e.g. "Maximize utilization without conflict (operator directive 2026-06-07)"), not separable chronology. Only the genuinely duplicated embedded heading in the Adam-comms-typing section was collapsed. No governed duty content was deleted or silently dropped in this pass.`;

const inserts = [
  { section_type: 'coordinator_manual', title: 'Coordinator Manual — Blocked-claim resolution & gauge-integrity procedures', content: extractedManualBlock, order_index: 2660, protocol_id: PROTOCOL_ID },
  { section_type: 'coordinator_provenance', title: 'Coordinator Provenance — index (initial)', content: PROVENANCE_STUB_CONTENT, order_index: 2670, protocol_id: PROTOCOL_ID },
  { section_type: 'coordinator_role_contract', title: 'Coordinator — Never-Do Boundaries (top-of-charter)', content: NEVER_DO_CONTENT, order_index: 2610, protocol_id: PROTOCOL_ID },
  { section_type: 'coordinator_role_contract', title: 'Coordinator loop-registry governance (STANDARD_LOOPS)', content: LOOP_GOVERNANCE_CONTENT, order_index: 2623, protocol_id: PROTOCOL_ID },
];

for (const row of inserts) {
  const { data, error } = await supabase.from('leo_protocol_sections').insert(row).select('id,section_type,title');
  if (error) { console.error('FAILED:', row.title, error); process.exit(1); }
  console.log('Inserted:', data[0].id, data[0].section_type, '-', data[0].title);
}
console.log('\nAll 4 inserts complete.');
