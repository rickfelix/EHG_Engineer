// Record Explore evidence for SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B';

const { data: sd } = await s.from('strategic_directives_v2').select('id, metadata').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

// --- Explore evidence (gate REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] includes 'Explore'; Explore agent has no Write tool) ---
const exploreRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Codebase Explorer',
  verdict: 'PASS',
  confidence: 90,
  critical_issues: [],
  warnings: [
    'No handoff-memory artifact exists today — confirmed gap, not a duplicate build.',
    'Adam/Solomon currently appear to run against the shared checkout, not an isolated worktree — the relaunch mechanism must decide worktree vs full clone (parent SD language + sibling C scope ("guarded worktree removal") indicates worktree, not full clone).',
  ],
  recommendations: [
    'Model the handoff-memory write path on lib/coordinator/working-context.cjs + working-context-store.cjs + the set_session_working_context RPC pattern (database/migrations/20260615_set_session_working_context.sql): atomic RPC merging metadata.handoff_memory into claude_sessions.metadata, never a JS read-modify-write.',
    'Scope the artifact to state NOT already DB-backed via session_coordination (open threads with no row yet, mid-reasoning context, replies the old session intended but had not sent) — session_coordination rows already survive restart via retargetStaleAdamInbound/retargetStaleSolomonInbound + drainAdamOutbound/drainSolomonOutbound (lib/coordinator/adam-identity.cjs, lib/coordinator/solomon-identity.cjs).',
    'Reuse lib/worktree-manager.js (createWorktree/createWorkTypeWorktree) for the fresh-checkout relaunch mechanism — it already fetches origin/main fail-closed, refuses drifted branch reuse, verifies post-condition, and guards node_modules junction removal. Do not hand-roll a git-clone wrapper.',
    'Use lib/governance/checkout-freshness.js (checkoutFreshness) as the post-boot verification canary that the new singleton actually landed on fresh code.',
    'Model the new-session self-registration step on scripts/adam-restart.cjs (FRESHNESS -> REGENERATE -> REGISTER -> CANARY orchestration) — no solomon-restart.cjs/coordinator equivalent exists yet; may need to write or generalize.',
    'Store predecessor lineage as metadata.relaunch.predecessor_session_id — do NOT reuse claude_sessions.parent_session_id (that FK is already scoped to drain-agent virtual sessions, a different semantic).',
  ],
  detailed_analysis: JSON.stringify({
    gap_confirmed: 'Grepped handoff_state/handoff-state/HANDOFF-STATE/handoffState/handoff_memory/singleton_handoff across lib/ and scripts/: zero hits except unrelated LEO-protocol handoff-controller.js.',
    incident_evidence: 'scripts/temp/ux9-solomon-relaunch-exec.cjs: coordinator instructed Solomon to "WRITE YOUR HANDOFF-STATE MEMORY NOW" ad hoc over session_coordination — no schema/write-path/read-path existed behind that instruction; confirms the exact problem this child solves.',
    reusable_write_pattern: 'lib/coordinator/working-context.cjs + working-context-store.cjs + database/migrations/20260615_set_session_working_context.sql: JSONB sub-key under claude_sessions.metadata, atomic RPC write (metadata = metadata || jsonb_build_object(...)), thread states active|waiting|blocked|done|cancelled, waiting_on, since, staleness pruning.',
    reusable_relaunch_mechanism: 'lib/worktree-manager.js createWorktree/createWorkTypeWorktree: resolveWorktreeBaseRef defaults origin/main, fetchBaseRef fail-closed, checkBranchForkDrift refuses stale reuse, verifyWorktreeRegisteredSync + rollback on failure, safeRecursiveRm junction-safe removal.',
    consult_thread_transport: 'session_coordination has no native thread concept; threading is ad hoc via payload.correlation_id / payload.reply_to; open/unacked = acknowledged_at IS NULL. Rows already re-target to the live successor automatically on restart via retargetStaleAdamInbound/retargetStaleSolomonInbound + drainAdamOutbound/drainSolomonOutbound — so the new artifact should NOT duplicate DB-backed rows, only cover state that has no row yet.',
    schema_home: 'claude_sessions.metadata jsonb is the established convention for session-lifecycle state (metadata.role, metadata.working_context, metadata.adam_since/solomon_since/coordinator_since) — no new table needed; session_lifecycle_events is reusable as-is for an audit trail (HANDOFF_MEMORY_WRITTEN/CONSUMED events).',
    restart_orchestration_template: 'scripts/adam-restart.cjs runAdamRestart(deps): FRESHNESS -> REGENERATE contract -> REGISTER (singleton guard) -> CANARY, dependency-injected/testable, structured PASS/FAIL JSON. No solomon-restart.cjs or generic singleton-restart.cjs exists yet.',
  }),
  metadata: {
    files_identified: [
      'lib/coordinator/working-context.cjs',
      'lib/coordinator/working-context-store.cjs',
      'database/migrations/20260615_set_session_working_context.sql',
      'lib/worktree-manager.js',
      'lib/governance/checkout-freshness.js',
      'scripts/adam-restart.cjs',
      'lib/coordinator/adam-identity.cjs',
      'lib/coordinator/solomon-identity.cjs',
      'scripts/adam-advisory.cjs',
      'scripts/solomon-advisory.cjs',
    ],
  },
  validation_mode: 'prospective',
  source: 'Explore',
  phase: 'LEAD',
  summary: 'Confirmed no handoff-memory artifact exists today (real gap, direct incident evidence in scripts/temp/ux9-solomon-relaunch-exec.cjs). Identified reusable patterns for all three FRs: working-context.cjs pattern for the write/read path (atomic RPC into claude_sessions.metadata), lib/worktree-manager.js for the fresh-checkout relaunch mechanism (already fetches origin/main fail-closed, refuses drift, guards junction removal), and the existing session_coordination retarget layer (retargetStale*Inbound/drain*Outbound) that already recovers DB-backed threads on restart — the new artifact should be scoped to cover only non-DB-backed in-flight state, not duplicate it.',
};
const { data: ev, error: evErr } = await s.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
if (evErr) { console.log('EXPLORE EVIDENCE ERR:', evErr.message); process.exit(1); }
console.log('EXPLORE_EVIDENCE', ev.id);
