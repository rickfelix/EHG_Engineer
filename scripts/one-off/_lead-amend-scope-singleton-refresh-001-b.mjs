// Amend scope + smoke_test_steps for SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B
// per LEAD-phase VALIDATION findings (evidence e00dc73e-ddfb-4837-aaee-3b3ce1ea4b19).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B';

const { data: sd } = await s.from('strategic_directives_v2').select('id, metadata, scope').eq('sd_key', KEY).single();

const scope = 'IN SCOPE: (1) Handoff-memory artifact schema for the state a relaunching singleton must preserve that is NOT already DB-backed via claude_sessions.metadata.working_context or session_coordination (i.e. mid-reasoning context, replies the old session intended to send but had not, items read but not yet actioned) -- reuses working_context threads[] shape as substrate, does not duplicate it. (2) Write path: an atomic RPC (modeled on set_session_working_context, database/migrations/20260615_set_session_working_context.sql) the retiring singleton calls before relaunch to persist metadata.handoff_memory. (3) Read path: the new session, on boot, restores metadata.handoff_memory (plus the carried-over working_context) from the retiring session row. (4) Fresh-checkout relaunch mechanism: extends lib/worktree-manager.js (createWorktree/createWorkTypeWorktree) + lib/governance/checkout-freshness.js as the post-boot freshness canary -- reuses the existing origin/main fail-closed fetch, fork-drift refusal, and junction-safe removal rather than a new git-clone wrapper. (5) Extends the SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001 restart-wrapper pattern (scripts/adam-restart.cjs FRESHNESS->REGENERATE->REGISTER->CANARY) with the memory-write/restore + fresh-checkout steps, generalized to Solomon/coordinator (no solomon-restart.cjs equivalent exists yet) -- NOT a parallel restart path. B stops once the new session is live with its memory restored. OUT OF SCOPE (narrowed from initial framing per VALIDATION e00dc73e): a new parallel in-flight-thread schema (working_context already is one); re-registration of the new session and retirement of the old session/worktree (Child C, SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-C, already in EXEC, owns register/retire sequencing reusing the existing adam-register core); deciding WHEN to relaunch (Child A owns the trigger/schedule); any worktree-removal code.';

const key_changes = [
  { change: 'Handoff-memory schema for non-DB-backed in-flight state (reuses working_context threads[] substrate)', impact: 'defines exactly what a relaunching singleton must capture beyond what is already DB-backed' },
  { change: 'Atomic write-path RPC (modeled on set_session_working_context)', impact: 'the retiring singleton persists its handoff memory before relaunch without a read-modify-write race' },
  { change: 'Read-path restore on new-session boot', impact: 'the new session recovers in-flight context the old one had, closing the documented Solomon relaunch context-loss incident' },
  { change: 'Fresh-checkout relaunch mechanism extending lib/worktree-manager.js + checkout-freshness.js', impact: 'new singleton boots on a genuinely fresh origin/main checkout, never an in-place pull on the shared/messy tree' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Call the handoff-memory write RPC against a test claude_sessions row with a sample non-DB-backed item (e.g. {kind: "reply_owed", correlation_id: "test-1", summary: "..."})', expected_outcome: 'claude_sessions.metadata.handoff_memory contains the item; a session_lifecycle_events row with event_type=HANDOFF_MEMORY_WRITTEN is inserted' },
  { step_number: 2, instruction: 'Call the read-path restore function against the same session_id from a simulated "new session"', expected_outcome: 'The restore function returns the same item written in step 1 (round-trip verified); a HANDOFF_MEMORY_CONSUMED event is logged' },
  { step_number: 3, instruction: 'Invoke the fresh-checkout relaunch mechanism for a test role/workKey', expected_outcome: '`git worktree list` shows a new worktree at a fresh path; `git log -1` inside it matches origin/main HEAD at invocation time (not the stale shared tree HEAD); no in-place `git pull` was run on the shared tree' },
  { step_number: 4, instruction: 'Run checkoutFreshness() against the newly created worktree', expected_outcome: 'Returns FRESH (not STALE/STALE-CRITICAL)' },
];

const metadata = { ...(sd.metadata || {}), lead_scope_narrowed_per_validation: 'e00dc73e-ddfb-4837-aaee-3b3ce1ea4b19', sibling_c_interface_note_sent: '4518e128-0afc-410d-acf6-5d360f4a3009' };

const { error: upErr } = await s.from('strategic_directives_v2').update({ scope, key_changes, smoke_test_steps, scope_reduction_percentage: 25, metadata }).eq('sd_key', KEY);
console.log(upErr ? 'AMEND ERR: '+upErr.message : 'Scope narrowed + smoke_test_steps populated (25% scope reduction: dropped parallel thread-schema + register/retire duplication per VALIDATION).');
