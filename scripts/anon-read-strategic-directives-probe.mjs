#!/usr/bin/env node
/**
 * Anon read-contract probe for strategic_directives_v2 -- FR-2 of
 * SD-LEO-FIX-CLOSE-ANON-KEY-001, widened per Solomon GO 8d0dead0 / ratification 49656c8c.
 *
 * TWO ASSERTIONS, not one:
 *   1. strategic_directives_v2 itself: a live SELECT AS ANON must return 0 rows. This is the
 *      corrective signal -- it FAILS today (anon_read_strategic_directives_v2 grants USING(true))
 *      and must flip to PASS once the chairman applies the FR-3 migration. Measured as anon
 *      directly (SET LOCAL ROLE anon, rolled back), not inferred from policy text, because a
 *      static read of pg_policies cannot see a GRANT-level exposure or a mis-evaluated qual.
 *   2. every OTHER public table the anon role can read, enumerated via pg_policies and compared
 *      against a frozen allow-list. This is the preventive half: the next table that picks up an
 *      unfiltered anon policy fails CI on its own, instead of waiting for a sub-agent to notice it
 *      by hand. ANON_READ_ALLOWLIST is a measured BASELINE of today's already-exposed tables, not
 *      a security endorsement of each entry -- fixing all of them is explicitly out of scope for
 *      this SD (recorded as a follow-up finding; see SD scope note and /signal history) and
 *      strategic_directives_v2 is deliberately excluded from the list, since it is the one entry
 *      this SD is removing.
 *
 * Usage:
 *   node scripts/anon-read-strategic-directives-probe.mjs
 */
import { createDatabaseClient } from './lib/supabase-connection.js';

export const EXIT = {
  OK: 0,
  ERROR: 1,
  STRATEGIC_DIRECTIVES_ANON_READABLE: 2,
  ALLOWLIST_VIOLATION: 3,
};

/**
 * Measured live against production (dedlbzhpgkmetvhbkyzq) 2026-09-06 via pg_policies, filtered to
 * policies that actually grant anon a row (permissive, cmd SELECT/ALL, roles anon/public, qual not
 * statically always-false, qual not gated by a session-scoped auth function that the anon key's
 * claimless JWT can never satisfy -- see isSessionGated). strategic_directives_v2 removed by hand:
 * it is this SD's own target, not part of the frozen baseline.
 */
export const ANON_READ_ALLOWLIST = Object.freeze([
  'adherence_rubrics', 'advisory_checkpoints', 'aegis_constitutions', 'aegis_rules',
  'aegis_violations', 'agentic_reviews', 'ai_quality_assessments', 'app_config',
  'archetype_benchmarks', 'archetype_profile_interactions', 'auto_apply_allowlist',
  'auto_apply_denylist', 'board_members', 'brand_variants', 'bypass_ledger',
  'chairman_constraints', 'cleanup_orchestration_state', 'content_types', 'context_usage_daily',
  'contract_chain_links', 'cultural_design_styles', 'debate_arguments', 'debate_sessions',
  'defect_taxonomy', 'design_quality_scores', 'discovery_strategies', 'ehg_component_patterns',
  'ehg_feature_areas', 'ehg_page_routes', 'ehg_user_workflows', 'ehg_wiki_sections',
  'eva_architecture_decisions', 'eva_consultant_digests', 'eva_consultant_recommendations',
  'eva_consultant_snapshots', 'eva_consultant_trends', 'eva_source_health',
  'eva_translation_gates', 'eva_youtube_config', 'eva_youtube_scans', 'eva_youtube_scores',
  'feedback', 'feedback_quality_config', 'gap_analysis_results', 'gate_boundary_config',
  'gate_witness_events', 'gate_witness_registry', 'goal_evaluator_verdicts',
  'gvos_prompt_rubrics', 'issue_patterns', 'judge_verdicts', 'leo_agents',
  'leo_effort_policies', 'leo_feedback', 'leo_handoff_executions', 'leo_handoff_templates',
  'leo_integration_contracts', 'leo_integration_verification_results', 'leo_process_scripts',
  'leo_prompts', 'leo_proposals', 'leo_protocol_sections', 'leo_protocols',
  'leo_schema_constraints', 'leo_scoring_prioritization_config', 'leo_scoring_rubrics',
  'leo_settings', 'leo_simplification_rules', 'leo_sub_agent_triggers', 'leo_sub_agents',
  'leo_validation_rules', 'leo_vetting_rubrics', 'lifecycle_phases', 'llm_models',
  'llm_providers', 'market_segments', 'marketing_content', 'mental_model_applications',
  'mental_model_archetype_affinity', 'mental_model_effectiveness', 'mental_models',
  'opportunity_blueprints', 'opportunity_scans', 'pattern_subagent_mapping',
  'pcvp_verification_log', 'portfolios', 'prompt_templates', 'protocol_constitution',
  'public_portfolio', 'quick_fixes', 'retrospective_contributions', 'root_cause_reports',
  'scaffold_patterns', 'schema_migrations', 'screen_layouts', 'sd_baseline_items',
  'sd_baseline_rationale', 'sd_checkpoint_history', 'sd_execution_actuals',
  'sd_execution_baselines', 'sd_intensity_adjustments', 'sd_intensity_gate_exemptions',
  'sd_phase_handoffs', 'sd_stream_requirements', 'sd_type_gate_exemptions',
  'sd_type_validation_profiles', 'sd_workflow_template_steps', 'sd_workflow_templates',
  'simulation_sessions', 'soul_extractions', 'stage_prop_contracts', 'strategy_objectives',
  'sub_agent_execution_results', 'subagent_validation_results', 'system_events',
  'system_health', 'system_settings', 'team_assignments', 'team_templates',
  'tech_stack_references', 'telemetry_analysis_runs', 'test_results', 'test_runs',
  'uat_credential_history', 'uat_runs', 'venture_archetypes', 'venture_blueprints',
  'venture_briefs', 'venture_nursery', 'venture_phase_budgets', 'venture_separability_scores',
  'venture_templates', 'venture_token_budgets', 'voice_cached_responses',
]);

const normalizeQual = (q) => String(q ?? '').replace(/[\s()]/g, '').toLowerCase();
export const isAlwaysFalse = (qual) => ['false', '1=0', 'null'].includes(normalizeQual(qual));
const rolesOf = (r) => (Array.isArray(r) ? r : []).map((s) => String(s).trim());
const anonReachable = (r) => { const x = rolesOf(r); return x.includes('anon') || x.includes('public'); };

/** Session-scoped auth functions the anon key's claimless JWT can never satisfy, so a qual gated
 *  by one of these is not actually anon-readable even though the roles column says anon/public.
 *  Every pattern checks the COMPARED VALUE, not just the function's presence -- an earlier draft
 *  matched bare `jwt() ->> 'role'` regardless of RHS, which would have silently excluded a policy
 *  like `(auth.jwt() ->> 'role') = 'anon'` (genuinely anon-readable: the anon key's own JWT DOES
 *  carry role='anon') from discoverAnonReadableTables, defeating the allow-list diff for exactly
 *  the class of drift this check exists to catch. No such qual exists in production today
 *  (measured), but the pattern must not depend on that staying true. */
const SESSION_GATED = [
  /auth\.uid\(\)/i,
  /auth\.role\(\)\s*=\s*'(service_role|authenticated)'/i,
  /jwt\(\)\s*->>\s*'role'(?:'?::text)?\)?\s*=\s*'(service_role|authenticated|chairman)'/i,
  /fn_is_chairman/i,
  /fn_is_service_role/i,
  /fn_user_has_venture_access/i,
];
/**
 * KNOWN LIMITATION, disclosed rather than silently accepted: this is substring/regex matching on
 * qual TEXT, not a boolean-expression parse. A qual combining a session-gated clause with an
 * unconditional OR disjunct (e.g. `x IS NULL OR fn_is_chairman()`) is still excluded here even
 * though the `x IS NULL` half alone can grant unconditional access -- the same class of static-
 * analysis limit the sibling anon-write-contract-probe.mjs documents for its own qual reads (a
 * qual that is always-false/always-true via a function is not statically distinguishable from the
 * literal). No live policy in this schema takes that shape today (measured); closing it fully
 * would need a real SQL boolean-expression parser, which is out of scope for this frozen-baseline
 * preventive check. The PRIMARY FR-3 acceptance signal (assertion 1 in main()) is unaffected --
 * it measures strategic_directives_v2 empirically via SET LOCAL ROLE anon, never through this
 * heuristic.
 */
export const isSessionGated = (qual) => SESSION_GATED.some((re) => re.test(String(qual ?? '')));

/** Pure. Given pg_policies rows (schemaname='public' only), return the anon-readable table names. */
export function discoverAnonReadableTables(policyRows = []) {
  const tables = new Set();
  for (const r of policyRows) {
    if (String(r.permissive).toUpperCase() !== 'PERMISSIVE') continue;
    if (!['SELECT', 'ALL'].includes(String(r.cmd).toUpperCase())) continue;
    if (!anonReachable(r.roles)) continue;
    if (isAlwaysFalse(r.qual)) continue;
    if (isSessionGated(r.qual)) continue;
    tables.add(r.tablename);
  }
  return [...tables].sort();
}

/** Pure. Anything anon-readable and not on the allow-list is unexpected -- including
 *  strategic_directives_v2 itself before FR-3 applies, since it is deliberately absent above. */
export function diffAgainstAllowlist(discovered, allowlist = ANON_READ_ALLOWLIST) {
  const allowSet = new Set(allowlist);
  const unexpected = discovered.filter((t) => !allowSet.has(t));
  return { ok: unexpected.length === 0, unexpected };
}

export async function main() {
  let client = null;
  try {
    client = await createDatabaseClient('ehg',
      process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});

    // Assertion 1: strategic_directives_v2, measured AS ANON directly (not inferred from policy
    // text), inside a rolled-back transaction so the probe leaves no trace.
    await client.query('BEGIN');
    let anonCount;
    try {
      await client.query('SET LOCAL ROLE anon');
      const { rows: [row] } = await client.query('SELECT count(*)::int AS n FROM strategic_directives_v2');
      anonCount = row.n;
    } finally {
      await client.query('ROLLBACK');
    }
    console.log(`strategic_directives_v2: anon-visible row count = ${anonCount}`);

    // Assertion 2: enumerate every anon-readable public table and diff against the allow-list.
    const { rows: policyRows } = await client.query(`
      SELECT p.tablename, p.policyname, p.roles::text[] AS roles, p.cmd, p.qual, p.permissive
      FROM pg_policies p
      JOIN pg_class c ON c.oid = format('%I.%I', p.schemaname, p.tablename)::regclass
      WHERE p.schemaname = 'public'
    `);
    const discovered = discoverAnonReadableTables(policyRows);
    const { ok, unexpected } = diffAgainstAllowlist(discovered);
    console.log(`discovered ${discovered.length} anon-readable table(s); ${unexpected.length} not on the allow-list.`);

    if (anonCount > 0) {
      console.log(`FAIL: strategic_directives_v2 is anon-readable (${anonCount} row(s)) -- FR-3 has not been applied yet.`);
      return EXIT.STRATEGIC_DIRECTIVES_ANON_READABLE;
    }
    if (!ok) {
      console.log(`FAIL: unexpected anon-readable table(s) not on ANON_READ_ALLOWLIST: ${unexpected.join(', ')}`);
      return EXIT.ALLOWLIST_VIOLATION;
    }
    console.log('PASS: strategic_directives_v2 is not anon-readable, and no unexpected table is.');
    return EXIT.OK;
  } catch (err) {
    console.error(`probe error: ${err.message}`);
    return EXIT.ERROR;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) main().then((code) => process.exit(code));
