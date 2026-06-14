#!/usr/bin/env node
/**
 * FR-1 (SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001): insert the "Loop Continuity / Never-Exit"
 * canon section into leo_protocol_sections (idempotent check-then-update-or-insert keyed on
 * protocol_id + section_type). After this, add the section_type to scripts/section-file-mapping.json
 * under CLAUDE_EXEC.md + CLAUDE_CORE.md and run: node scripts/generate-claude-md-from-db.js.
 * Do NOT hand-edit the generated CLAUDE_*.md files.
 */
require('dotenv').config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SECTION_TYPE = 'fleet_worker_loop_continuity';
const TITLE = 'Loop Continuity / Never-Exit (Fleet Worker Contract)';
const CONTENT = `## Loop Continuity / Never-Exit (Fleet Worker Contract)

The WORKER analog of CLAUDE.md "Canonical Pause Points — THE ONLY REASONS TO STOP". An autonomous fleet worker in a /loop must NEVER exit prematurely: the enumerated stops below are the ONLY legitimate exits; every other condition re-arms a ScheduleWakeup and re-enters the loop.

**THE ONLY legitimate stops (the allow-path):**
1. The operator tells you to stop / wind down.
2. A canonical pause point is reached.
3. You completed the /signal wind-down handshake (announced offline + gave the grace window).

**Every other condition is a CONTINUE — re-arm a ScheduleWakeup and re-run the loop. Four enforced exit-modes:**
- **(4a) Post-ship**: you just shipped an SD → /signal a fleet-retro → /checkin → claim the next workable SD (READY > EXEC > PLANNING > DRAFT) in the SAME turn. Shipping is the START of the next iteration, not the end of the loop (the #1 wrong-stop).
- **(4b) Blocked claim**: your SD hit a chairman gate/blocker while unblocked belt work exists → build what IS buildable, /signal the specific blocker, PARK that SD (push WIP), and claim a DIFFERENT unblocked SD. Never idle holding a blocked claim.
- **(4c) No wind-down handshake**: never exit silently → /signal feedback "winding down — finished <SD>, anything queued? idling ~180s", arm a SHORT (~180s) grace ScheduleWakeup, re-check the inbox on that tick, THEN settle into the ~1200s idle cadence.
- **(4d) Transient error**: a connectivity/API/tool blip is NOT a stop → re-arm a ScheduleWakeup and resume (retry ≤2, then invoke the RCA sub-agent). Never treat a transient error as terminal.

**ENFORCEMENT (the teeth):** the Stop hook \`scripts/hooks/stop-loop-wakeup-reminder.cjs\` BLOCKS a premature stop (emits \`{decision:"block"}\` + re-prompts you to push WIP and arm a wakeup) UNLESS you took the allow-path (operator-stop / canonical pause point / an announced /signal wind-down detected in session_coordination). Gated by \`LEO_LOOP_WAKEUP_REMINDER\`; fail-open + single-fire (blocks at most once per turn) so a legitimate stop is never trapped.

**CANON SYNC:** this section (\`leo_protocol_sections#fleet_worker_loop_continuity\`) is the source of truth; it is mirrored in \`docs/protocol/fleet-worker-loop-directive.md\` and the \`[ROLE] WORKER\` block in \`scripts/hooks/session-role-orient.cjs\`. Keep all three in sync.`;

(async () => {
  const { data: protocol, error: pErr } = await sb.from('leo_protocols').select('id').eq('status', 'active').single();
  if (pErr || !protocol) { console.error('No active protocol:', pErr && pErr.message); process.exit(1); }

  const { data: existing } = await sb.from('leo_protocol_sections')
    .select('id').eq('protocol_id', protocol.id).eq('section_type', SECTION_TYPE).maybeSingle();

  const row = { protocol_id: protocol.id, section_type: SECTION_TYPE, title: TITLE, content: CONTENT,
    order_index: 880, target_file: 'CLAUDE_EXEC.md', context_tier: 'PHASE_EXEC' };

  if (existing) {
    const { error } = await sb.from('leo_protocol_sections').update({ title: TITLE, content: CONTENT }).eq('id', existing.id);
    if (error) { console.error('UPDATE_FAIL', error.message); process.exit(1); }
    console.log('Updated existing section', existing.id, '(idempotent)');
  } else {
    const { data, error } = await sb.from('leo_protocol_sections').insert(row).select('id').single();
    if (error) { console.error('INSERT_FAIL', error.message); process.exit(1); }
    console.log('Inserted section', data.id, 'section_type=' + SECTION_TYPE);
  }
})();
