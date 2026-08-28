/**
 * DATABASE (Principal Database Architect) PLAN-phase schema evidence for
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C.
 *
 * Ran AFTER and incorporates the DESIGN sub-agent findings (execution_id
 * 38a6c88b-1e7f-4ab4-838c-c2db1e7f32ba) already patched into the PRD --
 * metadata.database_analysis.design_informed = true.
 *
 * Every claim below is MEASURED (live information_schema / pg_catalog, a
 * rolled-back live-DDL transaction, and direct execution of classifyMigration()),
 * never inferred from the handoff summary.
 */
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    'FR-1 schema premises CONFIRMED live and the whole FR-1 design IS expressible in TIER-1 -- measured by EXECUTING classifyMigration() '
    + '(tier:1, all_statements_provably_additive) and by EXECUTING the full 6-statement DDL against the live database inside a rolled-back '
    + 'transaction (all 6 statements OK, constraints resolved as designed, nothing persisted). creative_assets.venture_id is a direct '
    + 'uuid NOT NULL column FK-ing ventures(id); marketing_content_variants.id is a uuid PRIMARY KEY. No naming collision: '
    + 'creative_asset_variant_scores does not exist in any schema. ONE BLOCKING DESIGN CONFLICT FOUND, not present in the PRD: TR-1 (TIER-1) '
    + 'and referential integrity are MUTUALLY EXCLUSIVE here, because the classifier bans the bare token DELETE, which no ON DELETE CASCADE '
    + 'clause can avoid. Since ventures -> creative_assets is ON DELETE CASCADE, a NO ACTION FK from the new join table BLOCKS chairman venture '
    + 'teardown (delete_venture() RPC) with SQLSTATE 23503 -- proven by an isolated live cascade probe. PLAN must choose this tradeoff '
    + 'explicitly before EXEC rather than discover it at teardown time.',
  findings: [
    'D-1 CONFIRMED (Q1) -- creative_assets.venture_id IS a direct column, exactly as PLAN described. Live information_schema: '
    + 'data_type=uuid, udt_name=uuid, is_nullable=NO, column_default=NULL. pg_constraint: creative_assets_venture_id_fkey => '
    + 'FOREIGN KEY (venture_id) REFERENCES ventures(id) ON DELETE CASCADE. The RLS policy can therefore scope through '
    + 'creative_assets.venture_id in ONE hop and never needs the marketing_content_variants.content_id -> marketing_content.venture_id '
    + 'detour. creative_assets is 11 columns live (10 in the original migration + storage_path added by sibling -A on 2026-08-26).',

    'D-2 CONFIRMED (Q2) -- marketing_content_variants.id is a valid FK target: data_type=uuid, is_nullable=NO, '
    + 'default gen_random_uuid(), and constraint marketing_content_variants_pkey => PRIMARY KEY (id). Type matches the proposed '
    + 'variant_id UUID column exactly, so no cast or domain mismatch. Two tables already FK it (daily_rollups.variant_id, '
    + 'marketing_attribution.variant_id), BOTH declared ON DELETE SET NULL -- so neither of them blocks a cascade, and the new '
    + 'join table would be the first inbound FK that does. creative_assets currently has ZERO inbound FKs.',

    'D-3 CONFIRMED (Q3) -- the FR-1 design IS fully TIER-1-expressible. EXECUTED classifyMigration() on the exact 6-statement '
    + 'candidate (CREATE TABLE IF NOT EXISTS + 2x CREATE INDEX IF NOT EXISTS + ALTER TABLE ... ENABLE ROW LEVEL SECURITY + 2x '
    + 'CREATE POLICY) => {tier:1, reason:"all_statements_provably_additive", matched:[create_table_if_not_exists:'
    + 'creative_asset_variant_scores, create_index, create_index, enable_rls:creative_asset_variant_scores, create_policy, '
    + 'create_policy]}. NOTHING in the design needs a GRANT/REVOKE or a CREATE OR REPLACE FUNCTION: the two-policy idiom is pure '
    + 'CREATE POLICY, and PRIMARY KEY / UNIQUE / NOT NULL / REFERENCES / CHECK / JSONB DEFAULT are all permitted INSIDE a '
    + 'CREATE TABLE IF NOT EXISTS (the classifier only forbids those qualifiers on ALTER TABLE ADD COLUMN, Rule C -- they are '
    + 'unrestricted under Rule A). Also EXECUTED the full DDL against the LIVE database inside BEGIN..ROLLBACK: all 6 statements '
    + 'applied, the policy expression parsed and bound against real columns, pg_constraint resolved PRIMARY KEY (id), '
    + 'UNIQUE (creative_asset_id, variant_id) and both FKs; post-rollback to_regclass = NULL (nothing leaked).',

    'D-4 BLOCKING DESIGN CONFLICT (Q3, NOT in the PRD) -- TIER-1 AND CASCADING REFERENTIAL INTEGRITY ARE MUTUALLY EXCLUSIVE. '
    + 'The classifier FORBIDDEN_TOPLEVEL sweep (migration-tier-classifier.mjs:44) bans the bare token DELETE across the whole '
    + 'comment-stripped file, and the ON DELETE clause of a referential action necessarily contains it. MEASURED: the identical '
    + 'candidate with "REFERENCES creative_assets(id) ON DELETE CASCADE" => {tier:2, reason:"forbidden_token_in_residue"}; without '
    + 'the clause => tier:1. CORPUS CONFIRMATION (not a one-off): classifyMigration() run over all 1442 files in '
    + 'database/migrations/ yields 30 TIER-1 migrations, of which ZERO contain the string "ON DELETE". No TIER-1 migration in this '
    + 'repo has ever declared a cascading FK, and none can. This is structural, not incidental.',

    'D-5 CONSEQUENCE OF D-4, MEASURED -- a NO ACTION FK on the new table BREAKS CHAIRMAN VENTURE TEARDOWN. delete_venture(uuid) '
    + 'exists live (pg_proc, prosrc 7242 chars) and its final statement is "DELETE FROM ventures WHERE id = p_venture_id", relying '
    + 'on FK CASCADE for dependents; ventures -> creative_assets is ON DELETE CASCADE. A grandchild FK with the default NO ACTION '
    + 'blocks that cascade. PROVEN in an isolated live transaction with the exact topology (parent -CASCADE-> child -NO ACTION-> '
    + 'grandchild): DELETE on the parent raised SQLSTATE 23503 "update or delete on table _c violates foreign key constraint '
    + '_g_noaction_c_id_fkey"; the same delete with an ON DELETE CASCADE grandchild SUCCEEDED. Both FKs are affected: '
    + 'marketing_content_variants is also cascade-reachable from ventures via marketing_content.venture_id. Blast radius is '
    + 'currently LATENT ONLY because creative_assets and marketing_content_variants both hold 0 live rows -- it arms the moment '
    + 'this SD family produces its first asset. delete_venture() has an EXCEPTION WHEN OTHERS handler, so it would fail LOUDLY '
    + '(success:false), not silently corrupt.',

    'D-6 RESOLUTION OPTIONS FOR D-4/D-5, for PLAN to choose EXPLICITLY (I recommend Option 1): '
    + 'OPTION 1 (RECOMMENDED) -- ship TIER-1 with plain NO ACTION FKs, and record the teardown gap as an explicit, owned follow-up '
    + '(add an explicit "DELETE FROM creative_asset_variant_scores WHERE creative_asset_id IN (...)" step to delete_venture() in a '
    + 'SEPARATE, deliberately chairman-gated migration). Keeps TR-1 intact for this SD, keeps referential integrity, and the '
    + 'teardown fix is honestly scoped as the TIER-2 work it actually is instead of being smuggled into a TIER-1 file. PRECEDENT '
    + 'EXISTS for the plain-FK half: 20260712_spine_core_identity_registry_fabric.sql is TIER-1 and declares '
    + '"REFERENCES org_agent_roles(role_key)" and "REFERENCES org_agent_identities(id)" with no referential action. '
    + 'OPTION 2 -- accept ON DELETE CASCADE and TIER-2 (chairman-gated apply). Correct semantics in one file; this is exactly what '
    + 'the parent table did (20260712_creative_assets.sql is chairman-gated) and what PRD risk R4 already prescribes as the '
    + 'fallback. Cost: EXEC blocks on a chairman apply. '
    + 'OPTION 3 (REJECT) -- drop the FKs to stay TIER-1. Violates FR-1 AC-1, which requires both FKs by name.',

    'D-7 ANSWERED (Q4) -- creative_assets IS chairman-gated, and it has NO bearing on the new table. VERIFIED BOTH DIRECTIONS. '
    + '(a) The gating is real but SD-SCOPED, not table-scoped: 20260712_creative_assets.sql carries a "CHAIRMAN-GATED APPLY" header '
    + 'and metadata.requires_chairman_apply=true is set on SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (confirmed live: that SD reads '
    + 'requires_chairman_apply=true). (b) There is NO propagation mechanism from a gated table to its FK dependents: '
    + 'check-migration-readiness.mjs reads metadata.requires_chairman_apply from the SD row and "-- @chairman-gated" markers from the '
    + 'MIGRATION FILE -- neither is ever derived from a referenced table. Confirmed live that THIS SD and all four siblings '
    + '(-001, -A, -B, -C, -D) have requires_chairman_apply=NULL. (c) Independently, the file that gating rule was written for '
    + '("this migration adds an RLS policy, so it is NOT self-applicable") predates the tier classifier, which now explicitly '
    + 'admits CREATE POLICY and ENABLE RLS as TIER-1 (Rule D) -- so the new table is not gated by inheritance OR by its own RLS.',

    'D-8 IMPORTANT NUANCE ON TR-1 -- TIER-1 buys auto-apply on the HANDOFF path but NOT on the Adam-delegated path; do not '
    + 'conflate them. MEASURED: (a) the handoff pre-check scripts/modules/handoff/pre-checks/pending-migrations-check.js:289-320 '
    + 'partitions by classifyMigration() and routes TIER-1 files to the auto-apply executor, and tierGateEnabled() returns TRUE '
    + 'LIVE, so TR-1s premise HOLDS for the handoff pipeline. (b) BUT lib/migration/adam-delegated-apply.js deliberately defines '
    + 'delegatable as a STRICT SUBSET of TIER-1 that EXCLUDES create_policy/enable_rls (its "GAP A"), and EXECUTING '
    + 'isDelegatableAdditive() on the exact candidate returns {delegatable:false, reason:'
    + '"policy_or_rls_chairman_only:enable_rls:creative_asset_variant_scores"}. So if EXEC routes this migration through the '
    + 'delegated-apply path it WILL be refused as chairman-only, despite being TIER-1. EXEC must use the handoff pipeline.',

    'D-9 TIER-1 AUTHORING HAZARDS, measured so EXEC does not rediscover them by trial and error. (a) COMMENT ON TABLE is NOT '
    + 'allow-listed -- only COMMENT ON COLUMN is (Rule F). Adding a table comment flipped the candidate to '
    + '{tier:2, reason:"unrecognized_or_unsafe_statement: comment on table ..."}. The precedent migration 20260712_creative_assets.sql '
    + 'uses COMMENT ON TABLE, so copying its comment block verbatim WILL break TIER-1. (b) COMMENT ON COLUMN prose is scanned for '
    + 'command verbs because the string literal survives into the head: a comment reading "we never update this" returned '
    + '{tier:2, reason:"multiple_commands_in_statement"}. Column-comment prose must avoid update/delete/drop/grant/create/alter/etc. '
    + '(c) Ordinary "--" SQL header comments ARE safe: a header reading "Rollback: DROP TABLE creative_asset_variant_scores" '
    + 'still classified tier:1 (stripNonDdl removes it before the sweep). (d) Partial indexes are TIER-2 -- '
    + '"CREATE INDEX ... WHERE metadata IS NOT NULL" => tier:2. So the creative_assets_unconsumed_idx style partial index used by '
    + 'the parent migration cannot be copied either.',

    'D-10 ANSWERED (Q5) -- no collision and no partial implementation. to_regclass and information_schema both report '
    + 'creative_asset_variant_scores ABSENT in every schema (0 columns). A repo-wide grep for the exact identifier returns hits ONLY '
    + 'in this SDs own planning artifacts (scripts/temp/prd-content-c.json, scripts/temp/patch-prd-design-findings.mjs, '
    + 'scripts/one-off/store-validation-evidence-...-001-c.mjs) -- i.e. the PRD talking about itself, zero implementation. The '
    + 'nearest lexical neighbour is the UNRELATED "s17_variant_scores", which is an artifact_type ENUM VALUE in '
    + 'venture_artifacts.artifact_type_check (database/migrations/20260417_per_screen_unique_index.sql, lib/eva/artifact-types.js:203), '
    + 'not a table -- no namespace conflict. On the cross-domain question: the two-domain asymmetry is REAL (creative_assets is '
    + 'venture-scoped by a direct column; marketing_content_variants only via content_id -> marketing_content.venture_id) and PLANs '
    + 'choice to scope RLS through the creative_assets side is the correct one -- it is the shorter, NOT NULL, directly-indexed path.',

    'D-11 RLS ASYMMETRY WORTH KNOWING (not blocking) -- the two parent tables use DIFFERENT and MUTUALLY INCONSISTENT ownership '
    + 'models, so "follow the parent" is ambiguous and PLAN should say which parent. Live pg_policies: creative_assets_venture_access '
    + 'scopes via ventures.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid()) and is FOR ALL; '
    + 'venture_read_marketing_content_variants scopes via ventures.created_by = auth.uid() and is SELECT-ONLY. These can disagree '
    + 'about the same user. The recommended DDL follows the creative_assets/user_company_access model, which matches both the '
    + 'PRD-cited 20260704_marketlens_owned_audience_caps.sql idiom AND the table the RLS is scoped through -- consistent, and the '
    + 'right call. Flagging only so it is a recorded decision rather than an accident.',

    'D-12 SCHEMA-SHAPE RECOMMENDATIONS accepted into the DDL below. (a) Drop the separate index on creative_asset_id: the '
    + 'UNIQUE (creative_asset_id, variant_id) constraint already creates a btree with creative_asset_id leading, which serves both '
    + 'the RLS IN-subquery and the FR-3 venture filter -- a second index would be pure write cost. Keep an index on variant_id '
    + '(not covered by that unique, and needed for the FR-2 daily_rollups join). (b) created_at TIMESTAMPTZ NOT NULL DEFAULT now() '
    + 'is required by FR-8, whose retention entry needs a timestampColumn; DEFAULT now() is DATABASE-stamped, matching the stated '
    + 'requirement in lib/retention/policies.js that the writer must not supply its own timestamp. (c) metadata JSONB NOT NULL '
    + 'DEFAULT {} matches the idiom on both parents (creative_assets.provenance/brand_source_refs, marketing_content_variants.metadata) '
    + 'and gives FR-3/FR-5 somewhere to record selection bookkeeping without a future ALTER.',

    'D-13 TEST-AUTHORING BLOCKER FOR TS-4, found while seeding fixtures -- INSERT INTO ventures is blocked for a non-provisioned '
    + 'identity by the BEFORE INSERT trigger auto_populate_company_id_trigger -> auto_populate_venture_company_id(), which raises '
    + '42501 "User has no company access. Please contact support to set up your account." This is a TRIGGER, not RLS, so it fires '
    + 'even as postgres/service_role. TS-4 wants to verify live cross-venture RLS isolation on the new table; whoever writes it must '
    + 'either seed user_company_access for the test identity first or reuse one of the 152 existing ventures, because the obvious '
    + '"create two throwaway ventures" fixture WILL fail with a 42501 that looks like an RLS denial and will be misdiagnosed as one.',
  ],
  recommendations: [
    'PLAN: resolve D-4/D-5 EXPLICITLY before EXEC -- add a PRD constraint recording which of the two options is chosen. Recommended: Option 1 (TIER-1 + plain NO ACTION FKs) plus an owned follow-up for the delete_venture() teardown step.',
    'PLAN: amend TR-1 to state the measured reason ON DELETE CASCADE is excluded (FORBIDDEN_TOPLEVEL bans the bare DELETE token) so a future EXEC does not "helpfully" add cascade and silently flip the file to TIER-2.',
    'PLAN: add an acceptance criterion that delete_venture() teardown is verified against a venture that HAS creative_asset_variant_scores rows -- otherwise the D-5 breakage ships green (both parent tables are empty today, so every test passes vacuously).',
    'EXEC: do NOT copy the COMMENT ON TABLE block or the partial index from 20260712_creative_assets.sql -- both are TIER-2 (D-9).',
    'EXEC: run classifyMigration() against the authored file as TS-7 already requires, and additionally assert tier===1 in CI so a later comment edit cannot silently demote it.',
    'EXEC: apply via the handoff pipeline, not the Adam delegated-apply path, which refuses this file as chairman-only despite TIER-1 (D-8).',
    'TESTING: TS-4 fixtures must not INSERT INTO ventures blind -- see D-13 (42501 from a trigger, not RLS).',
  ],
  metadata: {
    gate: 'PLAN_PRD',
    database_analysis: {
      design_informed: true,
      design_execution_id: '38a6c88b-1e7f-4ab4-838c-c2db1e7f32ba',
      design_verdict_incorporated: 'CONDITIONAL_PASS',
      target_database: 'consolidated (dedlbzhpgkmetvhbkyzq)',
      verified_columns: {
        'creative_assets.venture_id': 'uuid NOT NULL, no default, FK ventures(id) ON DELETE CASCADE — direct column CONFIRMED',
        'marketing_content_variants.id': 'uuid NOT NULL DEFAULT gen_random_uuid(), PRIMARY KEY — valid FK target CONFIRMED',
        'creative_assets': '11 columns live (10 original + storage_path from sibling -A)',
        'marketing_content_variants': '10 columns live',
      },
      collision_check: { table: 'creative_asset_variant_scores', to_regclass: null, information_schema_columns: 0, verdict: 'ABSENT — no collision, no partial implementation' },
      tier_classification: {
        candidate_verdict: { tier: 1, reason: 'all_statements_provably_additive' },
        matched_tokens: ['create_table_if_not_exists:creative_asset_variant_scores', 'create_index', 'enable_rls:creative_asset_variant_scores', 'create_policy', 'create_policy'],
        with_on_delete_cascade: { tier: 2, reason: 'forbidden_token_in_residue' },
        with_comment_on_table: { tier: 2, reason: 'unrecognized_or_unsafe_statement' },
        with_partial_index: { tier: 2, reason: 'unrecognized_or_unsafe_statement' },
        tier_gate_enabled_live: true,
        adam_delegatable: { delegatable: false, reason: 'policy_or_rls_chairman_only:enable_rls:creative_asset_variant_scores' },
      },
      corpus_scan: { dir: 'database/migrations', files: 1442, tier1: 30, tier1_with_references: 3, tier1_with_on_delete: 0 },
      live_ddl_probe: { statements_executed: 6, all_ok: true, transaction: 'BEGIN..ROLLBACK', post_rollback_to_regclass: null, leaked: false },
      cascade_probe: { no_action_grandchild: 'BLOCKED 23503', cascade_grandchild: 'SUCCEEDED', implication: 'delete_venture() breaks with a NO ACTION FK once rows exist' },
      live_row_counts: { creative_assets: 0, marketing_content_variants: 0, ventures: 152 },
      inbound_fks_before_this_sd: { creative_assets: 0, marketing_content_variants: 2 },
      chairman_gating: { this_sd_requires_chairman_apply: null, parent_table_sd: 'SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D=true', propagates_via_fk: false },
      blocking_conflict: 'TR-1 (TIER-1) vs cascading referential integrity — mutually exclusive; PLAN must choose',
    },
  },
};

// detailed_analysis is a TEXT column, and storeSubAgentResults deliberately drops
// results.findings (results-storage.js:716 "no findings column exists; content
// deliberately not copied"). Persist the findings as text so the row is not hollow.
results.detailed_analysis =
  'DATABASE (Principal Database Architect) PLAN-phase findings for ' + SD_KEY + '. '
  + results.findings.length + ' findings, persisted as text because results.findings is dropped by the storage layer.'
  + String.fromCharCode(10) + String.fromCharCode(10)
  + results.findings.map((f, i) => 'FINDING ' + (i + 1) + '/' + results.findings.length + ': ' + f).join(String.fromCharCode(10) + String.fromCharCode(10));

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'DATABASE', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('DATABASE', SD_KEY, null, results, { phase: 'PLAN' });
console.log('Stored DATABASE evidence id:', stored.id);
