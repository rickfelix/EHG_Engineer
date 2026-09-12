import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 92,
  execution_time_ms: 0,
  summary:
    'VALIDATION (LEAD, GATE 1): premise independently CONFIRMED and stronger than stated; NO duplicate SD/QF; ' +
    'handoff_actor_policy determination CONFIRMED (not a substitute). CONDITIONAL on 1 hard GATE-1 block ' +
    '(0 backlog items), 3 scope-target corrections (2 named files are no-op/incomplete edit targets), and ' +
    '1 unproven capability (request.headers) that must be settled by a PLAN spike before EXEC commits to it.',
  findings: [
    { id: 'GATE1-BACKLOG-ZERO', severity: 'critical', type: 'blocker',
      note: 'sd_backlog_map has 0 rows for this SD (queried by BOTH uuid 2d4e7fea-d8db-447e-a75e-0a8ad201f6c4 AND sd_key); user_stories 0; product_requirements_v2 0. GATE 1 requires >=1 backlog item and the require_backlog_for_active constraint blocks status=active. Must add >=1 backlog item before LEAD-TO-PLAN.' },
    { id: 'SCOPE-TARGET-1-SHIM', severity: 'critical', type: 'scope_correction',
      note: 'Scope item 1 names lib/supabase-connection.js, which is a 21-line PURE RE-EXPORT SHIM (lines 11-21 re-export from ../scripts/lib/supabase-connection.js). createDatabaseClient is implemented at scripts/lib/supabase-connection.js:226 (single new pg.Client, no pool, no SET on connect -- confirmed). Editing the named file would be a NO-OP.' },
    { id: 'SCOPE-TARGET-2-TWO-FACTORIES', severity: 'critical', type: 'scope_correction',
      note: 'There are TWO shared service-client factories, not one. (a) lib/supabase-client.js createSupabaseServiceClient(options) -- sync, wraps withSchemaDriftDetection, 468 importing files. (b) scripts/lib/supabase-connection.js:388 createSupabaseServiceClient(projectKey, options) -- async, DIFFERENT signature, re-exported through lib/supabase-connection.js, 542 importing files. Scope item 2 names only (a); (b) is equally shared and would remain unthreaded. (b) also spreads options.clientOptions last, letting a caller clobber global.headers.' },
    { id: 'SCOPE-TARGET-3-TWO-RETURN-PATHS', severity: 'high', type: 'scope_correction',
      note: 'Inside lib/supabase-client.js, createSupabaseServiceClient has TWO return paths: a plain createClient(), and a fetchTimeoutMs branch returning createClient(..., { global: { fetch: boundedFetch } }). A header added to only one path silently misses the other; global must be merged, not replaced.' },
    { id: 'GUC-MECHANISM-PROVEN', severity: 'info', type: 'capability_proven',
      note: 'MEASURED, not reasoned: on a live createDatabaseClient pg client, SET app.actor=... reads back via current_setting (value returned); SET LOCAL app.actor inside BEGIN reads back inside the txn and is correctly EMPTY after COMMIT. Both mechanisms viable.' },
    { id: 'POOLER-SESSION-GUC-RISK', severity: 'medium', type: 'design_risk',
      note: 'createDatabaseClient accepts options.connectionString and QF-20260513-258 documents CI passing a pooler URL. Configured POOLER_URL is port 5432 (SESSION mode) so a session-level SET survives TODAY, but a transaction-mode (6543) pooler would silently DROP a bare SET-on-connect -- the fix would read as wired and no-op. Prefer SET LOCAL per mutating transaction, or add an AC asserting the GUC is readable at trigger time on the pooled path.' },
    { id: 'REQUEST-HEADERS-UNPROVEN', severity: 'high', type: 'unproven_premise',
      note: 'ZERO functions in the live DB reference request.headers (enumerated pg_get_functiondef across public). Enumerated all 22 no-arg current_setting functions: every one is a trigger or returns boolean, so NO PostgREST-callable read path exists to observe request.headers without creating a new object. Scope item 3 fallback 2 is therefore an UNTESTED capability. If Supabase PostgREST does not surface x-actor-session in request.headers, the entire PostgREST half (scope item 2 + that fallback) is dead on arrival while still reading as shipped. Require an empirical spike in PLAN before EXEC commits.' },
    { id: 'REUSE-CANONICAL-ACTOR-RESOLVER', severity: 'high', type: 'duplicate_mechanism_risk',
      note: 'Do NOT hand-roll process.env.CLAUDE_SESSION_ID || <tag>. A canonical resolver already exists: lib/claim/claim-identity.js (documented precedence: CLAUDE_SESSION_ID env, race-free, source=env -> shared pointer fallback), plus lib/resolve-own-session.cjs/.js and lib/session-identity-sot.js. 20+ inline CLAUDE_SESSION_ID||fallback copies already exist across lib/. PRECEDENT: QF-20260904-344 (COMPLETED 2026-09-05) fixed this SAME created_by-attribution defect class for quick_fixes using CLAUDE_SESSION_ID + the role tag. Reuse that pattern; inventing a 4th bespoke resolver repeats the divergence class the handoff_actor_policy SSOT migration existed to END.' },
    { id: 'CEREMONY-SEQUENCING', severity: 'medium', type: 'completion_criteria',
      note: 'trg_sd_mutation_audit is LIVE (pg_trigger tgenabled=O) so mis-attribution CONTINUES until the new chairman-gated migration is APPLIED. chairman-gated = a ceremony a worker seat cannot self-apply, and an @approved-by header is a ceremony MARKER not apply state. Completion criteria must claim only code + staged migration + _DOWN + tests landed, NOT that attribution is fixed at merge.' },
    { id: 'NO-DUPLICATE-SD', severity: 'info', type: 'duplicate_check',
      note: 'Searched strategic_directives_v2 title/description/scope across 9 terms (actor, app.actor, audit, attribution, created_by, session_user, mutation_audit, provenance, identity). Exactly ONE SD matches app.actor: this SD. Repo-wide grep: the only other app.actor references are the trigger itself and scripts/one-off/store-explore-evidence-sd-canonical-001.mjs (evidence of the COMPLETED prior investigation). quick_fixes: no duplicate (nearest is QF-20260904-344, different table, COMPLETED). No in-flight SD touches the client factories. NOT a duplicate.' },
    { id: 'NO-COLLISION-CANONICAL-001', severity: 'info', type: 'collision_check',
      note: 'SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 is status=completed (2026-08-23), so its Explore evidence is a CLOSED prior investigation, not a competing in-flight SD. No collision.' },
    { id: 'HANDOFF-ACTOR-POLICY-NOT-A-SUBSTITUTE', severity: 'info', type: 'determination_confirmed',
      note: 'LEAD determination CONFIRMED, with a STRONGER reason than LEAD gave. handoff_actor_policy(p_created_by text) RETURNS TABLE(may_create bool, skips_claim_check bool) is declared IMMUTABLE and is a pure function of its input: it CONSUMES created_by, it cannot PRODUCE one, and an IMMUTABLE function is structurally barred from reading session state (current_setting) at all. Its registry is a fixed 6-row VALUES list of SYSTEM literals (UNIFIED-HANDOFF-SYSTEM, SYSTEM_MIGRATION, ADMIN_OVERRIDE, ORCHESTRATOR_AUTO_COMPLETE, PCVP_EMERGENCY_BYPASS, ORCHESTRATOR-GUARDIAN); an arbitrary session UUID returns (false,false), so reused as an identity mechanism it would REJECT every real session. Different table (sd_phase_handoffs BEFORE INSERT authorization vs audit_log AFTER UPDATE attribution) and different question (may this actor act? vs who acted?). NOT a substitute.' },
    { id: 'PREMISE-CONFIRMED-STRONGER', severity: 'info', type: 'premise_verified',
      note: 'Independently MEASURED on the live DB (2026-09-12): trg_sd_mutation_audit live on strategic_directives_v2 (tgenabled=O); log_sd_mutation_audit is the ONLY live function reading app.actor; session_user=postgres with app_actor=NULL on the direct-pg path; over the last 48h the trigger authored 310 rows across 4 event types with EXACTLY 2 distinct created_by values (authenticator=282, postgres=28). Repo-wide: ZERO set_config(app.actor) call sites; ZERO x-actor-session header senders. Premise is confirmed and LARGER than the 14-row/25-minute incident cited.' }
  ],
  recommendations: [
    'BLOCKING: add >=1 sd_backlog_map item before LEAD-TO-PLAN (GATE 1 + require_backlog_for_active).',
    'Retarget scope item 1 to scripts/lib/supabase-connection.js:226 (the real createDatabaseClient); lib/supabase-connection.js is a re-export shim.',
    'Extend scope item 2 to BOTH service-client factories (lib/supabase-client.js AND scripts/lib/supabase-connection.js:388) and to BOTH return paths inside the former; merge into global rather than replacing it.',
    'Add a PLAN-phase spike AC that empirically proves Supabase PostgREST surfaces x-actor-session in current_setting(request.headers) BEFORE EXEC builds on it; if it does not, the PostgREST half needs a different carrier (e.g. an RPC arg or a pre-request hook).',
    'Resolve the actor value through the existing canonical resolver (lib/claim/claim-identity.js / lib/session-identity-sot.js) following the QF-20260904-344 precedent, not a new inline fallback.',
    'Use SET LOCAL inside the mutating transaction (proven) rather than a bare SET on connect, so a transaction-mode pooler cannot silently void the fix.',
    'Word completion criteria as code+staged-migration+tests landed; attribution is only fixed once the chairman-gated ceremony applies the migration.'
  ],
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    phase: 'LEAD',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    probe_method: 'live pg via createDatabaseClient(engineer): pg_trigger/pg_proc/pg_get_functiondef enumeration, audit_log 48h created_by cardinality, SET + SET LOCAL GUC round-trip; supabase-js service reads of strategic_directives_v2/sd_backlog_map/user_stories/product_requirements_v2/quick_fixes; repo-wide grep for set_config/app.actor/x-actor-session; import-census of both client factories',
    duplicate_sds_found: 0,
    duplicate_qfs_found: 0,
    backlog_items: 0,
    app_actor_set_config_call_sites: 0,
    live_funcs_reading_app_actor: 1,
    live_funcs_reading_request_headers: 0,
    trigger_created_by_distinct_values_48h: 2,
    trigger_rows_48h: 310,
    service_client_factories_found: 2,
    blockers: ['GATE1-BACKLOG-ZERO'],
    must_fix_before_prd: ['SCOPE-TARGET-1-SHIM', 'SCOPE-TARGET-2-TWO-FACTORIES', 'REQUEST-HEADERS-UNPROVEN']
  }
};

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const supabase = createSupabaseServiceClient();
const { data: sdRow } = await supabase.from('strategic_directives_v2')
  .select('target_application').eq('sd_key', SD).maybeSingle();
const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: sdRow?.target_application || null,
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'lib/supabase-client.js',
  supabase,
});
console.log('RESOLUTION:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const stored = await storeSubAgentResults('VALIDATION', SD, { name: 'Principal Systems Analyst' }, results, { sdKey: SD });
console.log('\nSTORED:', JSON.stringify(stored)?.slice(0, 600));
console.log('FINAL VERDICT:', results.verdict, '| repo_resolved:', results.metadata.repo_resolved, '| repo_path:', results.metadata.repo_path);
