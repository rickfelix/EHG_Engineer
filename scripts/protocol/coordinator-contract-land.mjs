#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 -- Coordinator contract landing script.
 *
 * Mirrors the SHAPE of scripts/protocol/adam-contract-land.mjs (staleness guard vs. a
 * pre-migration snapshot, companions-before-contract ordering) but is NOT a call into that
 * script -- VALIDATION sub-agent (LEAD, row 86ad1bd6) confirmed it is hard-wired to Adam row
 * IDs/paths/artifact filenames at every seam and is not a reusable library. This is a fresh,
 * coordinator-specific implementation with its own row IDs and its own snapshot.
 *
 * FR-4 SCOPING NOTE (ground-truthed at EXEC): the original plan described the charter's 8
 * "utilization" mentions as duplicate "tripled statements" to dedupe. Measurement (this
 * script's own dry-run output) showed that framing was false -- they are 8 distinct
 * operational duties with dates fused into the SAME SENTENCE as the rule itself (e.g.
 * "Maximize utilization without conflict (operator directive 2026-06-07)"), not separable
 * chronology extractable without paraphrasing. This migration therefore:
 *   1. Collapses the ONE genuine duplicate: row 609's redundant embedded heading.
 *   2. Extracts exactly ONE clean, self-contained, byte-identical block (the "Blocked-claim
 *      resolution" procedure + "Gauge-integrity challenge" checklist -- contiguous in row
 *      605, verified by index search) into the new coordinator_manual companion, replacing
 *      it in the charter with a short cross-reference pointer.
 *   3. Adds NEW rows for FR-5 (never-do block) and FR-2 (loop-registry governance) --
 *      genuinely new consolidation content, not moved from elsewhere, so no conservation
 *      risk applies to them.
 *   4. Does NOT attempt to relocate the other 7 "utilization" duty mentions or the Adam
 *      governance section -- their dates are inline-fused with live operational rules; moving
 *      them would require paraphrasing (prohibited) or duplication (defeats consolidation).
 *
 * Dry-run by default. Set LEO_COORDINATOR_CONTRACT_LAND=1 and pass --apply to write.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = `${__dirname}/coordinator-contract-review-2026-08-23`;
const SNAPSHOT_PATH = `${SNAPSHOT_DIR}/coordinator-contract-9row-snapshot-pre-002.json`;

const APPLY = process.argv.includes('--apply') && process.env.LEO_COORDINATOR_CONTRACT_LAND === '1';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ROW_605 = 605; // coordinator_role_contract (the monolith)
const ROW_609 = 609; // coordinator_role_contract (comms-typed rule, duplicate heading)
const PROTOCOL_ID = 'leo-v4-3-3-ui-parity'; // NOT NULL column; matches existing rows' value

const MANUAL_BLOCK_START_MARKER = '## Blocked-claim resolution';
const MANUAL_BLOCK_END_MARKER = '## Adam GOVERNANCE';
const CROSS_REF_REPLACEMENT =
  'See `CLAUDE_COORDINATOR_MANUAL.md` for the Blocked-claim resolution procedure (chairman directive 2026-06-24) and the Gauge-integrity challenge checklist (chairman-directed, verbal 2026-07-19) — both are IN FORCE regardless of whether the manual is read.\n\n';

const NEVER_DO_CONTENT = `**Never do these, regardless of context:**

1. **Never apply a production migration yourself.** Verify it is safe (purely additive — CREATE-only, no ALTER/DROP/data-mutation of existing objects), then APPROVE the worker to apply it themselves; the worker applies WITH your sign-off. Full procedure: "Blocked-claim resolution" in \`CLAUDE_COORDINATOR_MANUAL.md\`.
2. **Never dispatch an orchestrator PARENT as buildable work.** Parents auto-complete when their children finish — dispatch only children / leaf SDs.
3. **DOC-001 — never create SDs/QFs yourself.** Materialization uses canonical scripts only (\`node scripts/leo-create-sd.js\`, or Adam's proposal-materialization path); sourcing is Adam's lane, dispatch is yours.`;

const LOOP_GOVERNANCE_CONTENT = `**The coordinator's operational heartbeat is governed, not ad hoc.** All 34 of the coordinator's session-cron loops are registered in \`scripts/coordinator-startup-check.mjs\`'s \`STANDARD_LOOPS\` array — the ONLY place a loop's cadence, GHA-backing, or session-arming status is defined. **Loop changes land in the registry, never ad hoc** — a loop added, removed, or rescheduled outside this array is invisible to the coordinator's own startup check and to \`.claude/commands/coordinator.md\`'s "arm exactly the set this script emits" instruction.

**2026-08-22 cron ruling (operator commission 60153bf2, encoded QF-20260822-510):** 8 of the 34 loops (\`sweep\`, \`unranked-gauge\`, \`singleton-relaunch\`, \`relay-drop-gauge\`, \`fleet-retro\`, \`row-growth\`, \`gauge-runner\`, \`feedback-sla\`) carry \`session_arm: false\` — GHA-backed only, dropped from the session-armed set. Two GHA-backed loops (\`relay-drain\`, \`sms-relay-drain\`) are a deliberate carve-out and remain session-armed. **Reversal condition** (through 2026-08-25T22:00:00Z): if any dropped loop's artifact goes stale beyond 2x its GHA cadence, re-arm it as session-owned pending re-review.

*This table is DRIFT-CHECKED (never regenerated) against the live array by \`tests/unit/coordinator/coordinator-loop-governance-drift.test.js\`, via the checked-in snapshot \`scripts/coordinator-loop-governance-snapshot.json\`. When STANDARD_LOOPS changes, update the snapshot file AND this section together.*`;

const PROVENANCE_STUB_CONTENT = `This is the initial \`CLAUDE_COORDINATOR_PROVENANCE.md\` seed (SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002). It does not yet carry the full dated-rationale history embedded across the charter's duty list and governance clauses — those dates remain fused with their operational rules in \`CLAUDE_COORDINATOR.md\` by deliberate choice (see the FR-4 scoping note below). Populate this file incrementally as genuinely historical-only content (superseded cadences, resolved incidents) is identified and can be extracted without paraphrasing the rule it explains.

**FR-4 scoping note (ground-truthed at EXEC):** the original plan described "tripled utilization statements" as duplicate content to dedupe. Measurement showed this was false — the 8 "utilization" mentions in the charter are distinct operational duties with dates woven inline into the SAME sentence as the rule itself (e.g. "Maximize utilization without conflict (operator directive 2026-06-07)"), not separable chronology. Only the genuinely duplicated embedded heading in the Adam-comms-typing section was collapsed. No governed duty content was deleted or silently dropped in this pass.`;

async function main() {
  const { data: row605, error: e605 } = await supabase.from('leo_protocol_sections').select('*').eq('id', ROW_605).single();
  if (e605) throw e605;
  const { data: row609, error: e609 } = await supabase.from('leo_protocol_sections').select('*').eq('id', ROW_609).single();
  if (e609) throw e609;

  // Staleness guard: compare live rows against the pre-migration snapshot (mirrors
  // adam-contract-land.mjs's per-row SHA-256-vs-snapshot pattern).
  if (existsSync(SNAPSHOT_PATH)) {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    if (snapshot.row605_content !== row605.content) {
      throw new Error('STALENESS_GUARD: row 605 content has changed since the snapshot was captured. Re-review before applying.');
    }
    if (snapshot.row609_content !== row609.content) {
      throw new Error('STALENESS_GUARD: row 609 content has changed since the snapshot was captured. Re-review before applying.');
    }
  } else {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({
      captured_at_note: 'pre-migration snapshot, SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002',
      row605_content: row605.content,
      row609_content: row609.content,
    }, null, 2));
    console.log(`Snapshot captured: ${SNAPSHOT_PATH}`);
  }

  // --- Extraction (M3 content-conservation: byte-identical block, verified below) ---
  const startIdx = row605.content.indexOf(MANUAL_BLOCK_START_MARKER);
  const endIdx = row605.content.indexOf(MANUAL_BLOCK_END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('EXTRACTION_MARKERS_NOT_FOUND: row 605 content has changed shape; re-verify the manual-block boundaries before applying.');
  }
  const extractedManualBlock = row605.content.substring(startIdx, endIdx);
  const newRow605Content = row605.content.substring(0, startIdx) + CROSS_REF_REPLACEMENT + row605.content.substring(endIdx);

  // Conservation check: the union of (new row 605) + (extracted block) must reconstruct
  // exactly the original row 605 content when the cross-ref replacement is excluded.
  const reconstructed = row605.content.substring(0, startIdx) + extractedManualBlock + row605.content.substring(endIdx);
  if (reconstructed !== row605.content) {
    throw new Error('CONSERVATION_CHECK_FAILED: reconstructed content does not match the original row 605 byte-for-byte.');
  }

  const newRow609Content = row609.content.replace(
    /^## Coordinator → Adam messages MUST carry a recognized payload\.kind\n\n/,
    ''
  );
  if (newRow609Content === row609.content) {
    throw new Error('ROW_609_DUPLICATE_HEADING_NOT_FOUND: expected embedded heading not present; re-verify before applying.');
  }

  console.log('=== DRY RUN (pass --apply with LEO_COORDINATOR_CONTRACT_LAND=1 to write) ===');
  console.log(`Row 605: ${row605.content.length} -> ${newRow605Content.length} chars (extracted ${extractedManualBlock.length} chars to manual, +${CROSS_REF_REPLACEMENT.length} char cross-ref)`);
  console.log(`Row 609: ${row609.content.length} -> ${newRow609Content.length} chars (removed duplicate embedded heading)`);
  console.log(`New coordinator_manual row: ${extractedManualBlock.length} chars`);
  console.log(`New coordinator_role_contract row (never-do, FR-5): ${NEVER_DO_CONTENT.length} chars, order_index=2610`);
  console.log(`New coordinator_role_contract row (loop governance, FR-2): ${LOOP_GOVERNANCE_CONTENT.length} chars, order_index=2623`);
  console.log(`New coordinator_provenance row (stub): ${PROVENANCE_STUB_CONTENT.length} chars`);

  if (!APPLY) {
    console.log('\nDry run only -- no writes performed.');
    return;
  }

  const { error: u605 } = await supabase.from('leo_protocol_sections').update({ content: newRow605Content }).eq('id', ROW_605);
  if (u605) throw u605;
  const { error: u609 } = await supabase.from('leo_protocol_sections').update({ content: newRow609Content }).eq('id', ROW_609);
  if (u609) throw u609;

  const { error: iManual } = await supabase.from('leo_protocol_sections').insert({
    section_type: 'coordinator_manual',
    title: 'Coordinator Manual — Blocked-claim resolution & gauge-integrity procedures',
    content: extractedManualBlock,
    order_index: 2660,
    protocol_id: PROTOCOL_ID,
  });
  if (iManual) throw iManual;

  const { error: iProvenance } = await supabase.from('leo_protocol_sections').insert({
    section_type: 'coordinator_provenance',
    title: 'Coordinator Provenance — index (initial)',
    content: PROVENANCE_STUB_CONTENT,
    order_index: 2670,
    protocol_id: PROTOCOL_ID,
  });
  if (iProvenance) throw iProvenance;

  const { error: iNeverDo } = await supabase.from('leo_protocol_sections').insert({
    section_type: 'coordinator_role_contract',
    title: 'Coordinator — Never-Do Boundaries (top-of-charter)',
    content: NEVER_DO_CONTENT,
    order_index: 2610,
    protocol_id: PROTOCOL_ID,
  });
  if (iNeverDo) throw iNeverDo;

  const { error: iLoopGov } = await supabase.from('leo_protocol_sections').insert({
    section_type: 'coordinator_role_contract',
    title: 'Coordinator loop-registry governance (STANDARD_LOOPS)',
    content: LOOP_GOVERNANCE_CONTENT,
    order_index: 2623,
    protocol_id: PROTOCOL_ID,
  });
  if (iLoopGov) throw iLoopGov;

  console.log('\nAPPLIED. Run node scripts/generate-claude-md-from-db.js to regenerate files.');
}

main().catch((e) => { console.error(e); process.exit(1); });
