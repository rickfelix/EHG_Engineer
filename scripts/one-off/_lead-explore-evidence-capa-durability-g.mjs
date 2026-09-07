#!/usr/bin/env node
/**
 * LEAD-phase Explore evidence for SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G (LEAD-TO-PLAN gate).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '8ea5b6ea-55ea-454c-9baa-19e32d1cb9a2';
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G';

async function writeExplore(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings: [
      {
        id: 'E1-recordCompaction-implementations-located',
        severity: 'INFO',
        summary: 'The cited recordCompaction() at core-protocol-gate.js:405-411 is actually named recordCompactionEvent() (lines 392-429), zero callers anywhere in scripts/, lib/, .claude/ — dead code. A separately-named recordCompaction() lives at scripts/hooks/protocol-compaction-hook.cjs:57-109, called ONLY from .claude/commands/context-compact.md:73 (the manual /context-compact slash command). Corroborates VALIDATION finding F2.',
      },
      {
        id: 'E2-the-real-wired-PreCompact-hook-preserves-not-clears',
        severity: 'CRITICAL',
        summary: 'The actual wired PreCompact hook is .claude/settings.json:19-27 -> scripts/hooks/precompact-snapshot.ps1, which fires on BOTH manual and automatic compaction and does NOT call either recordCompaction*() function. Per QF-20260524-337 (ps1 lines 54-80, 122-125) it deliberately PRESERVES protocolGate (incl. fileReads) across compaction, merging it back into the new state, to stop a post-compaction /sd-create false-block. lastCompactionAt is never stamped on this path. It DOES write a genuine, path-agnostic marker on every firing: ~/.claude/flags/last-compaction.json ({timestamp, sessionId, trigger}).',
      },
      {
        id: 'E3-role-seat-tick-hosts-inventoried',
        severity: 'INFO',
        summary: 'Adam: scripts/adam-quiet-tick.mjs (armed via ADAM_LOOPS in adam-startup-check.mjs). Coordinator: scripts/coordinator-quiet-tick.mjs (armed as a harness CronCreate loop). Solomon: NO solomon-quiet-tick.mjs exists -- Solomon work is fragmented across SOLOMON_LOOPS entries (solomon-startup-check.mjs), no single per-tick entry point analogous to Adam/coordinator. A 4th seat, Michael, has scripts/michael-quiet-tick.mjs (formalized under SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A, dated 2026-09-03, AFTER this SD was authored) and is NOT named in this SD scope. Corroborates VALIDATION finding F6.',
      },
      {
        id: 'E4-existing-STEP-0-hand-written-text-located',
        severity: 'INFO',
        summary: '.claude/commands/coordinator.md:139 carries the exact hand-written carve-out this SD targets ("...on any resumed/compacted session, or when a cron tick re-enters coordinator work and the skill body is no longer in context, re-read the file before acting."). .claude/commands/adam.md and solomon.md have NO equivalent compaction/resumed-session carve-out language -- they lean on a verification script (register contract_read) instead. Note: CLAUDE_ADAM.md/CLAUDE_SOLOMON.md "STEP-0" mentions refer to an UNRELATED concept (sourcing/dedup entry point for minting SDs) -- do not conflate with protocol re-reads when scoping the PRD.',
      },
      {
        id: 'E5-no-new-machinery-host-already-exists',
        severity: 'INFO',
        summary: 'scripts/hooks/protocol-file-tracker.cjs is a wired PostToolUse hook (.claude/settings.json:174-179), fires on EVERY tool call for EVERY session. Its PROTOCOL_FILES list already includes CLAUDE_ADAM.md, CLAUDE_SOLOMON.md, CLAUDE_COORDINATOR*.md and companions, writing to protocolFileReadStatus in session state -- reaches all three (four) seats without inventing a Solomon-specific tick. Carries an explicit "must stay in sync with core-protocol-gate.js" comment. Also: scripts/hooks/context-compact-nudge.js (wired PostToolUse every-10th-call + UserPromptSubmit) already reads the genuine ~/.claude/flags/last-compaction.json marker and computes minutesSinceCompaction -- closest existing mechanism to a "time since last real compaction" signal. Also: role-capture-gate.mjs pattern (lib/learning/role-capture-gate.js) is direct prior art for this SD shape -- an obligation checked at each role recurring operating choke, invoked inside adam-quiet-tick.mjs/coordinator-quiet-tick.mjs AND backstopped by a durable GHA cron (.github/workflows/role-capture-gate-cron.yml, every 30 min, checks adam/coordinator/solomon -- proving Solomon CAN be checked without a Solomon quiet-tick). Its ROLES list matches this SDs stated 3-seat scope exactly.',
      },
      {
        id: 'E6-no-per-session-DB-compaction-tracking-exists',
        severity: 'WARNING',
        summary: 'No claude_sessions.metadata.lastCompactionAt or equivalent DB column found -- everything compaction-related is file-based. The nearest "per-role last enforced re-read at" timestamp is contract_last_read_at, produced by checkContractRead() (duplicated verbatim in adam-register.cjs, solomon-register.cjs, coordinator-startup-check.mjs), which reads state.protocolFileReadStatus[CONTRACT_FILE] -- a DIFFERENT session-state field than protocolGate.fileReads. Corroborates VALIDATION finding F5: any relocation must target protocolFileReadStatus (or bridge the two trackers), not protocolGate.fileReads, to actually affect role-seat contract verification.',
      },
    ],
    detailed_analysis: JSON.stringify({
      gate: 'GATE 1 - LEAD Pre-Approval (Explore pass)',
      verdict_rationale: 'Explore independently confirms every load-bearing claim in the VALIDATION pass via direct file/grep verification, and locates a concrete no-new-machinery host (protocol-file-tracker.cjs) plus direct prior art for the exact SD shape (role-capture-gate.mjs + its GHA cron backstop for Solomon). No duplicate implementation found.',
      duplicate_check: 'NEGATIVE — grep for lastCompactionAt across scripts/*.mjs, scripts/*.cjs, scripts/solomon/, scripts/coordinator/ returns nothing; scripts/hooks/pre-tool-enforce.cjs has zero protocol-read/compaction references.',
      infrastructure_check: 'POSITIVE — protocol-file-tracker.cjs (wired PostToolUse) already tracks all four role contracts and fires on every tool call for every session; role-capture-gate.mjs is direct prior art for a role-recurring-choke obligation check, already proven to reach Solomon via a GHA cron rather than a quiet-tick.',
      files_reviewed: [
        'scripts/modules/handoff/gates/core-protocol-gate.js',
        'scripts/hooks/protocol-compaction-hook.cjs',
        'scripts/hooks/precompact-snapshot.ps1',
        'scripts/hooks/protocol-file-tracker.cjs',
        'scripts/hooks/context-compact-nudge.js',
        '.claude/settings.json',
        '.claude/commands/coordinator.md',
        '.claude/commands/adam.md',
        '.claude/commands/solomon.md',
        'scripts/adam-quiet-tick.mjs',
        'scripts/coordinator-quiet-tick.mjs',
        'scripts/michael-quiet-tick.mjs',
        'scripts/adam-startup-check.mjs',
        'scripts/solomon-startup-check.mjs',
        'scripts/solomon-register.cjs',
        'lib/learning/role-capture-gate.js',
        'scripts/role-capture-gate.mjs',
        '.github/workflows/role-capture-gate-cron.yml',
        'lib/fleet/context-ceiling-checker.cjs',
      ],
    }),
    metadata: {
      sd_key: SD_KEY,
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_found: false,
      no_new_machinery_host_found: 'protocol-file-tracker.cjs + role-capture-gate.mjs pattern',
      exploration_mode: 'codebase_and_hook_wiring_review',
    },
    phase: 'LEAD',
    summary: 'CONDITIONAL_PASS (confidence 90). Independently confirms the VALIDATION pass\'s critical findings via direct file/grep verification: the cited recordCompaction() is dead code on the auto-compaction path (the real wired PreCompact hook, precompact-snapshot.ps1, deliberately PRESERVES protocolGate under QF-20260524-337 and never stamps lastCompactionAt); Solomon has no quiet-tick host while Michael (out of stated scope) does; role-seat contract-read state lives in a separate tracker (protocolFileReadStatus/contract_last_read_at) than the one the SD names (protocolGate.fileReads). Positive finding: a no-new-machinery host already exists and already reaches all four seats — protocol-file-tracker.cjs (wired PostToolUse, fires on every tool call) — plus direct prior art for this exact SD shape in role-capture-gate.mjs, which already proves Solomon is checkable without a dedicated quiet-tick via a GHA cron backstop. No duplicate implementation found. PLAN should build the PRD around protocol-file-tracker.cjs + role-capture-gate.mjs as the enforcement host, name a corrected seat roster, and resolve the QF-20260524-337 interaction per VALIDATION\'s Q1.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('Explore', SD_ID, { name: 'Explore (codebase search)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const row = await writeExplore(supabase);
  console.log('Explore row:', row.id, '| verdict:', row.verdict, '| confidence:', row.confidence, '| phase:', row.phase);
  console.log('repo_path:', row.metadata?.repo_path, '| executed_from_cwd:', row.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
