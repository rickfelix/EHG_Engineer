#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D';
const PRD_ID = 'PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D';
const SD_ID = 'c1fb207e-9823-4b07-a48f-263178f2f962';

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Apply a syntax-corrected, idempotent video_prompts migration so the live /creative-media route stops erroring',
    user_role: 'Authenticated EHG user with venture access who opens the nav-linked /creative-media page',
    user_want: 'The video_prompts table to actually exist in the consolidated database with RLS enabled and at least one working policy, instead of the current state where the migration was never applied because it contains `CREATE POLICY IF NOT EXISTS` (a clause PostgreSQL does not support on CREATE POLICY) and an unqualified `ventures` reference',
    user_benefit: 'PromptLibrary.tsx, VenturePromptPanel.tsx and VideoPromptStudio.tsx stop failing with a table-not-found error, which is the single live production defect this SD actually unblocks',
    priority: 'critical',
    status: 'ready',
    story_points: 3,
    acceptance_criteria: [
      'AC-1: video_prompts exists in the consolidated DB — verified by to_regclass(\'public.video_prompts\') IS NOT NULL AND a pg_policies count > 0 for the table AND relrowsecurity = true (existence alone is not sufficient evidence)',
      'AC-2: Navigating to /creative-media as an authenticated test user with venture access loads PromptLibrary without a PGRST205/table-not-found error',
      'AC-3: Re-running the migration a second time does not error — DROP POLICY IF EXISTS guards precede each CREATE POLICY and CREATE TABLE IF NOT EXISTS guards the table (TS-7)',
      'AC-4: Every reference to the ventures table inside the migration is schema-qualified as public.ventures',
    ],
    definition_of_done: [
      'Corrected migration committed under EHG_Engineer database/migrations/',
      'Migration applied to the consolidated DB in a single transaction',
      'to_regclass + pg_policies + relrowsecurity readback pasted as evidence (not a success return value)',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'The source file is ehg/supabase/migrations/20251004030000_create_video_prompts_table.sql, verified never-applied by the DATABASE sub-agent (evidence 04433ba0-7de4-43a5-a404-6001b70e5662). Do not "fix" it in place in the ehg repo only — the applied artifact belongs in EHG_Engineer database/migrations/ so the consolidated DB has a single migration lineage.',
    implementation_approach: 'Copy the original migration, replace each `CREATE POLICY IF NOT EXISTS x` with `DROP POLICY IF EXISTS x ON public.video_prompts; CREATE POLICY x`, schema-qualify public.ventures, wrap in BEGIN/COMMIT, apply, then read back to_regclass + pg_policies count + relrowsecurity.',
    implementation_context: JSON.stringify({
      technical_approach: 'Author a corrected migration in EHG_Engineer database/migrations/ that (a) replaces the unsupported `CREATE POLICY IF NOT EXISTS` clause with `DROP POLICY IF EXISTS ... ON public.video_prompts;` followed by a bare `CREATE POLICY`, (b) schema-qualifies every `ventures` reference as `public.ventures`, (c) guards the table with CREATE TABLE IF NOT EXISTS, and (d) runs as a single transaction. Apply it to the consolidated DB, then verify with a readback query selecting to_regclass(\'public.video_prompts\'), count(*) from pg_policies where tablename=\'video_prompts\' and schemaname=\'public\', and relrowsecurity from pg_class — never assert existence from the apply command\'s exit code.',
      files_to_create: [
        'EHG_Engineer database/migrations/<timestamp>_create_video_prompts_table_corrected.sql',
      ],
      files_to_modify: [
        'ehg/supabase/migrations/20251004030000_create_video_prompts_table.sql (mark superseded / align with the applied version so the two repos do not diverge)',
      ],
      dependencies: [
        'public.ventures table (referenced by the RLS policies)',
        'DATABASE sub-agent evidence 04433ba0-7de4-43a5-a404-6001b70e5662 (never-applied + invalid-syntax finding)',
        'ehg/src/components/creative-media/PromptLibrary.tsx, VenturePromptPanel.tsx, VideoPromptStudio.tsx (the consumers that currently fail)',
      ],
      integration_points: [
        'Consolidated Supabase project (shared by EHG_Engineer and ehg)',
        'Live nav-linked /creative-media route in the ehg app',
      ],
      edge_cases: [
        'Migration partially applied previously (table present, policies absent) — the DROP POLICY IF EXISTS + CREATE POLICY shape must converge from that state too',
        'PGRST205 schema-cache staleness after apply is cache, not absence — re-check via pg_tables/to_regclass rather than the PostgREST client',
      ],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-1', 'TS-7'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['EHG_Engineer database/migrations/', 'ehg/supabase/migrations/20251004030000_create_video_prompts_table.sql'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-1' },
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Record an ADR deferring the creative_media_assets / creative_campaigns / research_creative_workflows migration instead of applying it',
    user_role: 'Future engineer picking up the creative-media schema question',
    user_want: 'An explicit, findable decision record stating that the creative_media_rd_integration migration (and its undeclared rd_department_schema prerequisite) was deliberately NOT applied in this SD, with the reason and the trigger condition for revisiting',
    user_benefit: 'The next person does not re-discover the same blocked FK chain from scratch, and does not apply a migration that would create a third divergent data model in direct opposition to this SD\'s reconcile objective',
    priority: 'high',
    status: 'ready',
    story_points: 2,
    acceptance_criteria: [
      'AC-1: An ADR exists (docs/adr/ file or PRD metadata block) explicitly recording that creative_media_assets, creative_campaigns, research_creative_workflows AND the undeclared prerequisite ehg/supabase/migrations/20251004210000_rd_department_schema.sql are DEFERRED, not applied, in this SD',
      'AC-2: The ADR names both specific reasons — (i) the consumers are unrouted orphans today (creative-media-automation.tsx has zero references in ehg/src/routes/, ehg/src/App.tsx, ehg/src/config/), and (ii) creative_media_assets duplicates creative_assets with a different PK (asset_id vs id) and no shared campaign/tenancy model — and names the revisit trigger (a consumer page becomes routed, OR a follow-on SD explicitly re-evaluates)',
      'AC-3: A repo-wide grep confirms no code shipped in this SD reads from or writes to creative_media_assets, creative_campaigns, or research_creative_workflows',
    ],
    definition_of_done: [
      'ADR committed and linked from the PRD',
      'Grep evidence for AC-3 captured in the handoff',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Deliberate non-work. The value is the durable record, so the ADR must be in a place a future grep will find (docs/adr/), not only in a handoff comment. DESIGN evidence 8fda6dec-d2fa-4262-a592-6fdd0f493612 and DATABASE evidence 04433ba0-7de4-43a5-a404-6001b70e5662 are the citations.',
    implementation_approach: 'Write the ADR from the two sub-agent evidence rows, then run the AC-3 grep across both repos and paste the zero-hit result.',
    implementation_context: JSON.stringify({
      technical_approach: 'Author an ADR file recording the defer decision with its two reasons and its revisit trigger, citing DATABASE evidence 04433ba0-7de4-43a5-a404-6001b70e5662 (FK chain fails at first statement; missing rd_research_findings/rd_research_requests) and DESIGN evidence 8fda6dec-d2fa-4262-a592-6fdd0f493612 (unrouted consumers). Then prove the negative with a two-repo grep for the three table names across src/ and lib/, capturing the zero-hit output as evidence.',
      files_to_create: [
        'EHG_Engineer docs/adr/<nnnn>-defer-creative-media-assets-schema.md',
      ],
      files_to_modify: [
        'product_requirements_v2 metadata for PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (link to the ADR)',
      ],
      dependencies: [
        'DATABASE sub-agent evidence 04433ba0-7de4-43a5-a404-6001b70e5662',
        'DESIGN sub-agent evidence 8fda6dec-d2fa-4262-a592-6fdd0f493612',
        'ehg/supabase/migrations/20251004210000_rd_department_schema.sql (the undeclared prerequisite, ~255 lines / 5 tables / 10 policies)',
      ],
      integration_points: [
        'ehg/src/services/CreativeMediaIntegrationService.ts (would-be consumer, currently unreachable)',
        'ehg/src/components/creative-media/ContentGenerationEngine.tsx, VideoProductionPipeline.tsx, CreativeOptimization.tsx (unrouted)',
      ],
      edge_cases: [
        'A grep that finds only the ADR text itself mentioning the table names must not be read as a code reference — scope the AC-3 grep to src/ and lib/, excluding docs/',
        'Asserting absence requires measuring: run the grep, do not infer zero hits from the DESIGN report alone',
      ],
      estimated_effort: 'small',
    }),
    test_scenarios: [],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['EHG_Engineer docs/adr/', 'ehg/supabase/migrations/20251004210000_rd_department_schema.sql'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-2' },
  },
  {
    story_key: `${SD_KEY}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add a nullable campaign_id uuid column to creative_assets so sibling variants from one generation run can be grouped',
    user_role: 'Backend service persisting a batch of generated video variants',
    user_want: 'A first-class nullable campaign_id uuid column (with a partial index) on the unified creative_assets table, rather than a jsonb provenance blob or a brand-new campaign table',
    user_benefit: 'Variants from one generation run are groupable by a typed uuid that the database itself rejects malformed values for — jsonb would silently accept the exact unvalidated string-id format this SD exists to remove, and a new table would add another RLS tenant-scoping surface',
    priority: 'high',
    status: 'ready',
    story_points: 2,
    acceptance_criteria: [
      'AC-1: creative_assets has a nullable campaign_id of type uuid, added by an additive migration (no data backfill, no NOT NULL, no default)',
      'AC-2: A partial index exists on creative_assets(campaign_id) WHERE campaign_id IS NOT NULL',
      'AC-3: An INSERT attempting campaign_id = \'campaign-1730000000000\' is rejected by the database with a uuid cast error (proves the type, not just the column name, is doing the work)',
      'AC-4: Existing creative_assets rows and existing queries are unaffected — the column is additive and nullable',
    ],
    definition_of_done: [
      'Migration committed under EHG_Engineer database/migrations/ and applied',
      'information_schema.columns readback for campaign_id (data_type=uuid, is_nullable=YES) pasted as evidence',
      'pg_indexes readback for the partial index pasted as evidence',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'DATABASE sub-agent recommended the typed column over jsonb provenance specifically because jsonb cannot reject the current `campaign-${Date.now()}` string format. This story is the schema half of FR-3; US-004 is the code half.',
    implementation_approach: 'ALTER TABLE public.creative_assets ADD COLUMN IF NOT EXISTS campaign_id uuid; CREATE INDEX IF NOT EXISTS ... ON public.creative_assets (campaign_id) WHERE campaign_id IS NOT NULL; then read back from information_schema.columns and pg_indexes.',
    implementation_context: JSON.stringify({
      technical_approach: 'Additive migration: ALTER TABLE public.creative_assets ADD COLUMN IF NOT EXISTS campaign_id uuid, plus CREATE INDEX IF NOT EXISTS idx_creative_assets_campaign_id ON public.creative_assets (campaign_id) WHERE campaign_id IS NOT NULL. Idempotent by construction. Verify by querying information_schema.columns (data_type, is_nullable) and pg_indexes (indexdef contains the WHERE clause) — not by trusting the apply command exit code. Explicitly do NOT add a campaigns table and do NOT model provenance as jsonb.',
      files_to_create: [
        'EHG_Engineer database/migrations/<timestamp>_add_campaign_id_to_creative_assets.sql',
      ],
      files_to_modify: [],
      dependencies: [
        'public.creative_assets (existing unified seam table)',
        'DATABASE sub-agent recommendation in FR-3 (typed uuid column over jsonb/new-table alternatives)',
      ],
      integration_points: [
        'lib/creative/ asset write paths in EHG_Engineer',
        'ehg/src/services/video-generation/RunwayVideoService.ts (the first writer, US-004)',
      ],
      edge_cases: [
        'Column may already exist from a partial prior apply — IF NOT EXISTS guards make re-application safe',
        'PGRST205 / stale PostgREST schema cache immediately after apply is cache staleness, not a missing column',
      ],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-2'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['EHG_Engineer database/migrations/'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-3' },
  },
  {
    story_key: `${SD_KEY}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Wire RunwayVideoService to persist each generated variant as a creative_assets row with a real UUID and a shared campaign_id',
    user_role: 'User of the video variant testing UI',
    user_want: 'Generated video variants to survive a page refresh, because RunwayVideoService actually writes them to creative_assets instead of returning in-memory objects with minted string ids like `campaign-${Date.now()}` and `${campaignId}-variant-N`',
    user_benefit: 'Work is not silently lost on refresh (VideoVariantTesting.tsx:48 holds variants in useState today and nothing persists), and every downstream consumer reads one canonical row set instead of ephemeral component state',
    priority: 'high',
    status: 'ready',
    story_points: 5,
    acceptance_criteria: [
      'AC-1: A generation run producing N variants creates exactly N creative_assets rows, each with a valid uuid id and the same non-null campaign_id (TS-2)',
      'AC-2: RunwayVideoService.ts contains zero occurrences of `campaign-${Date.now()}` or `-variant-` string-id construction; campaign_id is produced by a real uuid generator (crypto.randomUUID or DB default), not string concatenation',
      'AC-3: A repo-wide grep across ehg/src/ finds no remaining code path that assigns a non-UUID string to a creative_assets id or campaign_id',
      'AC-4: Reloading VideoVariantTesting.tsx after a generation run shows the same variant set (persistence is observable from the UI, not only from the DB)',
    ],
    definition_of_done: [
      'RunwayVideoService writes through the server-side bridge surface (US-006), not a browser-side .from() call',
      'Integration test covering TS-2 passes',
      'Post-write DB readback (N rows, distinct uuid ids, one shared campaign_id) captured as evidence',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'DESIGN sub-agent verified RunwayVideoService.ts makes zero supabase.from() calls today and mints non-UUID ids at RunwayVideoService.ts:44, :92 and :109. FR-4 (US-005) must land first — this story is the write path that arms the latent cross-tenant RLS gap.',
    implementation_approach: 'Generate one campaign_id uuid per run; for each variant call the server-side bridge write entry point with {campaign_id, storage/asset fields}; let the DB mint the row id (uuid default) or pass crypto.randomUUID(); delete the string-id minting lines.',
    implementation_context: JSON.stringify({
      technical_approach: 'Introduce a single uuid campaignId = crypto.randomUUID() per generation run inside RunwayVideoService. Replace the three string-id minting sites (RunwayVideoService.ts:44, :92, :109) with real uuids. For each generated variant, call the FR-5 server-side bridge write entry point (service-role Edge Function) with the variant payload plus campaignId, so the browser never issues a direct .from(\'creative_assets\').insert(). After the batch, the service returns the persisted rows (with their DB-assigned uuid ids) to the caller so VideoVariantTesting renders persisted data rather than ephemeral objects.',
      files_to_create: [
        'ehg/src/services/video-generation/RunwayVideoService.persistence.test.ts',
      ],
      files_to_modify: [
        'ehg/src/services/video-generation/RunwayVideoService.ts (lines ~44, ~92, ~109 — replace minted string ids; add persistence call)',
        'ehg/src/components/creative-media/VideoVariantTesting.tsx (consume persisted rows returned by the service)',
      ],
      dependencies: [
        'US-003: creative_assets.campaign_id uuid column must exist first',
        'US-005: the creative_asset_variant_scores RLS fix must be applied before this write path ships',
        'US-006: the server-side bridge write entry point',
        'lib/creative/variant-scoring-bridge.js (EHG_Engineer, child C seam)',
      ],
      integration_points: [
        'public.creative_assets (unified seam table)',
        'Supabase Edge Function bridge surface (service-role)',
        'Runway generation API client inside RunwayVideoService',
      ],
      edge_cases: [
        'Partial batch failure — N variants generated but only M persisted; the run must not leave a half-written campaign silently reported as complete',
        'Generation succeeds but persistence is rejected by RLS — must surface an error, not fall back to in-memory state (that regression would restore the exact defect being fixed)',
        'Retry of a failed run must not duplicate rows under the same campaign_id',
      ],
      estimated_effort: 'medium',
    }),
    test_scenarios: ['TS-2'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['ehg/src/services/video-generation/RunwayVideoService.ts', 'ehg/src/components/creative-media/VideoVariantTesting.tsx'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-3' },
  },
  {
    story_key: `${SD_KEY}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Close the missing variant_id RLS constraint on creative_asset_variant_scores before any new write path ships',
    user_role: 'Tenant whose variant rows must not be writable by another tenant',
    user_want: 'The RLS policy on creative_asset_variant_scores to constrain BOTH creative_asset_id AND variant_id, because the live cavs_venture_access policy constrains only creative_asset_id and never mentions variant_id',
    user_benefit: 'A cross-tenant write of (own_asset, other_tenant_variant) — which a DATABASE sub-agent live harness successfully planted — is blocked, and the associated NO ACTION FK DoS on a victim\'s later DELETE (23503) is removed. The table is empty today so the gap is latent; this SD\'s FR-3 write path is what would arm it.',
    priority: 'critical',
    status: 'ready',
    story_points: 3,
    acceptance_criteria: [
      'AC-1: cavs_variant_matches_venture exists in pg_proc (it is confirmed absent today) AND the RLS policy on creative_asset_variant_scores references both creative_asset_id and variant_id — verified by reading pg_policies.qual/with_check text, not by reading the migration file',
      'AC-2: A live two-sided harness re-test of the same shape the DATABASE sub-agent used confirms the cross-tenant (own_asset, other_tenant_variant) INSERT is BLOCKED with 42501 — and the same harness confirms the legitimate (own_asset, own_variant) INSERT still SUCCEEDS (one-sided blocking proves nothing)',
      'AC-3: The chairman-gated ceremony for database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql is completed and logged BEFORE any US-004 / US-006 code path performing a real write is deployed',
    ],
    definition_of_done: [
      'Chairman-gated ceremony run through the standard path and logged',
      'pg_proc + pg_policies readback pasted as evidence',
      'Two-sided harness output (42501 on cross-tenant, success on same-tenant) pasted as evidence',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'The fix already exists as EHG_Engineer database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql. DATABASE sub-agent verified this independently with its own two-sided harness (evidence 04433ba0-7de4-43a5-a404-6001b70e5662) — this is NOT a repeat of DESIGN\'s incorrect with_check=NULL framing. Do not re-derive the finding; verify the fix.',
    implementation_approach: 'Run the existing chairman-gated migration through the standard ceremony, then verify with pg_proc/pg_policies readback plus a two-sided authenticated-client insert harness.',
    implementation_context: JSON.stringify({
      technical_approach: 'Apply EHG_Engineer database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql via the standard chairman-gated ceremony (do not hand-apply, do not bypass). The migration creates cavs_variant_matches_venture() and replaces the cavs_venture_access policy so the USING/WITH CHECK expressions constrain variant_id as well as creative_asset_id. Verification is two-part: (1) structural readback from pg_proc (function present) and pg_policies (qual + with_check text mention variant_id); (2) behavioural two-sided harness using an authenticated (not service-role, not SET ROLE) client that attempts a cross-tenant insert and expects 42501, and a same-tenant insert that must still succeed.',
      files_to_create: [
        'EHG_Engineer tests/security/creative-asset-variant-scores-rls.test.js (two-sided harness)',
      ],
      files_to_modify: [
        'EHG_Engineer database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql (only if the ceremony surfaces a defect)',
      ],
      dependencies: [
        'Chairman-gated apply ceremony (standard path)',
        'public.creative_asset_variant_scores, public.creative_assets, public.marketing_content_variants',
        'user_company_access tenancy model',
        'DATABASE sub-agent evidence 04433ba0-7de4-43a5-a404-6001b70e5662',
      ],
      integration_points: [
        'Blocks the FR-3 (US-004) and FR-5 (US-006) write paths — sequencing is a hard requirement, not a preference',
      ],
      edge_cases: [
        'A service-role client bypasses RLS entirely — the harness MUST use a real authenticated client or it measures nothing',
        'SET ROLE is not an anon/authenticated simulation; do not substitute it for a real JWT-backed client',
        'A 42501 denial short-circuits before schema validation, so a passing block test can hide a payload defect — pair it with the succeeding same-tenant insert',
        'Both FKs are NO ACTION: confirm the victim-DELETE 23503 DoS path is also closed by the constraint, not merely the INSERT',
      ],
      estimated_effort: 'medium',
    }),
    test_scenarios: ['TS-3'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['EHG_Engineer database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-4' },
  },
  {
    story_key: `${SD_KEY}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Route VideoVariantTesting reads and writes through a server-side scoring bridge instead of a direct client .from() call',
    user_role: 'Authenticated user who has user_company_access to a venture but is not its ventures.created_by',
    user_want: 'Variant scoring data to be fetched and written through a service-role server surface that normalizes ownership, instead of a browser-side supabase.from() call that inherits whichever RLS model the table happens to use',
    user_benefit: 'I actually see my data. ventures.created_by is NULL on all 152 live ventures, so the marketing_content_variants policy returns zero rows unconditionally for every authenticated user with no error — a direct client-side embedded join would silently render "no data" for everyone while looking like it works',
    priority: 'high',
    status: 'ready',
    story_points: 8,
    acceptance_criteria: [
      'AC-1: VideoVariantTesting.tsx contains zero direct supabase.from() calls against creative_asset_variant_scores, creative_assets, or marketing_content_variants — verified by grep of the file, all reads/writes go through the bridge surface',
      'AC-2: A user in the company-access model who is NOT the venture creator still receives correct, non-empty scoring data (TS-5) — proving the bridge normalizes across both ownership models rather than inheriting either one',
      'AC-3: The winner/scoring VideoVariantTesting.tsx displays matches child C\'s daily_rollups-derived Thompson-sampler output from selectAssetVariant() exactly for the same variant set (TS-4) — single source of truth, satisfying the SD\'s success_criteria #3',
      'AC-4: PerformanceDashboard.tsx requires zero changes (confirmed presentational-only, zero supabase/useQuery/useMutation references) — if it needed changes, the bridge boundary was drawn in the wrong place',
      'AC-5: An empty result from the bridge is distinguishable in the UI from an authorization failure (a silent empty render is the exact failure mode this story exists to prevent)',
    ],
    definition_of_done: [
      'Bridge entry point exposed as an Edge Function under supabase/functions/ and callable from the ehg app',
      'VideoVariantTesting.tsx swapped from useState to the bridge-backed hook (~40 LOC changed)',
      'TS-4 and TS-5 integration tests pass',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Two incompatible ownership models are in play: creative_assets / creative_asset_variant_scores scope via user_company_access, while marketing_content_variants scopes via ventures.created_by (NULL on all 152 ventures). Both repos share the Supabase project, so the Edge Function may live in either supabase/functions/ directory. VideoVariantTesting.tsx:48 useState<Campaign[]>([]) is the line being replaced.',
    implementation_approach: 'Extend lib/creative/variant-scoring-bridge.js with an EHG-callable entry point, expose it as a service-role Edge Function that resolves venture access via user_company_access, and replace VideoVariantTesting.tsx\'s useState with a hook that calls it.',
    implementation_context: JSON.stringify({
      technical_approach: 'Extend EHG_Engineer lib/creative/variant-scoring-bridge.js (child C\'s existing seam) with an EHG-callable entry point that (a) takes a caller JWT, (b) resolves the caller\'s venture access from user_company_access server-side — deliberately NOT from ventures.created_by, which is NULL on all 152 live ventures and therefore returns zero rows for everyone with no error — and (c) returns the daily_rollups-derived Thompson-sampler scoring from selectAssetVariant(). Expose it as a Supabase Edge Function (either repo\'s supabase/functions/, since both repos share the project) running with the service-role key so RLS ownership divergence is normalized in one place. In ehg, replace VideoVariantTesting.tsx:48 useState<Campaign[]>([]) with a hook that calls the Edge Function for both read (scores) and write (FR-3 variant persistence). PerformanceDashboard.tsx stays untouched — it is presentational-only with zero supabase/useQuery/useMutation references.',
      files_to_create: [
        'supabase/functions/variant-scoring-bridge/index.ts (Edge Function wrapper, service-role)',
        'ehg/src/hooks/useVariantScoring.ts (bridge-backed hook replacing the ephemeral useState)',
      ],
      files_to_modify: [
        'EHG_Engineer lib/creative/variant-scoring-bridge.js (add EHG-callable entry point)',
        'ehg/src/components/creative-media/VideoVariantTesting.tsx (~40 LOC: swap useState for the hook)',
      ],
      dependencies: [
        'US-005: RLS fix must be applied before this write path ships',
        'US-003 / US-004: campaign_id column and the RunwayVideoService write path',
        'lib/creative/variant-scoring-bridge.js selectAssetVariant() (Thompson sampler over daily_rollups)',
        'user_company_access (the ownership model the bridge normalizes to)',
      ],
      integration_points: [
        'public.creative_asset_variant_scores, public.creative_assets, public.marketing_content_variants',
        'daily_rollups (child C scoring input)',
        'Shared Supabase project spanning EHG_Engineer and ehg',
      ],
      edge_cases: [
        'ventures.created_by is NULL for all 152 ventures — any code path that falls back to it returns a silently-empty result that looks like "no data yet"; the bridge must never read it',
        'Bridge returns zero rows legitimately (new venture, no variants) vs. returns zero rows because authorization failed — these must be distinguishable to the caller and in the UI',
        'Service-role Edge Function bypasses RLS, so the venture-access check is the ONLY tenancy boundary — it must be verified two-sided (authorized caller sees data, unauthorized caller is refused)',
        'Scoring drift: if the component ever recomputes a winner locally it reintroduces the parallel calculation this story removes',
      ],
      estimated_effort: 'large',
    }),
    test_scenarios: ['TS-4', 'TS-5'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['EHG_Engineer lib/creative/variant-scoring-bridge.js', 'ehg/src/components/creative-media/VideoVariantTesting.tsx', 'ehg/src/components/creative-media/PerformanceDashboard.tsx'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-5' },
  },
  {
    story_key: `${SD_KEY}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add /video-variants to both live navigation surfaces so the wired-up component is reachable without typing a URL',
    user_role: 'Authenticated EHG user browsing the app through its navigation',
    user_want: '/video-variants to appear in both navigationTaxonomy.ts and ModernNavigationSidebar.tsx — the only two nav surfaces that exist — instead of remaining a URL-only orphan with zero nav entries',
    user_benefit: 'The component this SD keeps and wires up (FR-5) is actually usable by a real user, and the FR-5/FR-6 smoke test becomes executable at all',
    priority: 'medium',
    status: 'ready',
    story_points: 2,
    acceptance_criteria: [
      'AC-1: /video-variants appears in ehg/src/data/navigationTaxonomy.ts under an appropriate section',
      'AC-2: /video-variants appears and is clickable in ehg/src/components/navigation/ModernNavigationSidebar.tsx',
      'AC-3: A nav-click test reaches VideoVariantTesting.tsx without typing the URL directly (TS-6)',
      'AC-4: Both surfaces are updated — a taxonomy-only entry that never renders in the sidebar (or vice versa) does not satisfy this story',
    ],
    definition_of_done: [
      'Both nav files modified',
      'TS-6 e2e nav-click test passes',
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'DESIGN sub-agent confirmed /video-variants has zero nav entries in either surface today. The delete-instead option was considered per precedent SD-EHG-PRODUCT-UIUX-REMEDIATION-001-E-E and rejected, because this SD\'s success_criteria #3 requires the component to be a working reconciled UI, not a removed one.',
    implementation_approach: 'Add the route entry to navigationTaxonomy.ts, add the matching sidebar item to ModernNavigationSidebar.tsx, then assert reachability with a Playwright nav-click spec.',
    implementation_context: JSON.stringify({
      technical_approach: 'Add a /video-variants entry to ehg/src/data/navigationTaxonomy.ts under the creative/media section following the existing entry shape, and add the corresponding clickable item to ehg/src/components/navigation/ModernNavigationSidebar.tsx. Both surfaces are required — the taxonomy is data and the sidebar is the renderer, and updating only one produces an entry that exists but never appears (or appears but is not classified). Prove reachability with a Playwright spec that clicks through navigation rather than calling page.goto(\'/video-variants\'), since a goto-based test would pass even with zero nav entries.',
      files_to_create: [
        'ehg/tests/e2e/video-variants-nav.spec.ts',
      ],
      files_to_modify: [
        'ehg/src/data/navigationTaxonomy.ts',
        'ehg/src/components/navigation/ModernNavigationSidebar.tsx',
      ],
      dependencies: [
        'US-006: the component must be functional before making it discoverable, or nav exposes a broken page',
        'Existing route registration for /video-variants (route exists; only nav entries are missing)',
      ],
      integration_points: [
        'ehg/src/components/creative-media/VideoVariantTesting.tsx (the nav destination)',
        'ehg app router',
      ],
      edge_cases: [
        'A Playwright test using page.goto() instead of a nav click passes even when both nav entries are absent — the test must click',
        'Role/permission-gated nav sections: confirm the entry renders for the test identity used in TS-6',
        'Sidebar section ordering/collapse state may hide the entry without removing it — assert visibility, not just presence in the DOM',
      ],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-6'],
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    architecture_references: ['ehg/src/data/navigationTaxonomy.ts', 'ehg/src/components/navigation/ModernNavigationSidebar.tsx'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'pending',
    metadata: { fr_id: 'FR-6' },
  },
];

// depends_on / blocks are uuid[] columns, so they are resolved from story_key
// after insert (a story cannot reference a sibling's uuid before it exists).
const GRAPH = {
  [`${SD_KEY}:US-003`]: { depends_on: [], blocks: [`${SD_KEY}:US-004`] },
  [`${SD_KEY}:US-004`]: { depends_on: [`${SD_KEY}:US-003`, `${SD_KEY}:US-005`], blocks: [] },
  [`${SD_KEY}:US-005`]: { depends_on: [], blocks: [`${SD_KEY}:US-004`, `${SD_KEY}:US-006`] },
  [`${SD_KEY}:US-006`]: { depends_on: [`${SD_KEY}:US-005`], blocks: [] },
  [`${SD_KEY}:US-007`]: { depends_on: [`${SD_KEY}:US-006`], blocks: [] },
};

async function main() {
  const { data, error } = await supabase.from('user_stories').insert(stories).select('id, story_key, title');
  if (error) throw error;
  console.log('Inserted user stories:', JSON.stringify(data, null, 2));

  const byKey = Object.fromEntries(data.map((r) => [r.story_key, r.id]));
  for (const [key, edges] of Object.entries(GRAPH)) {
    const payload = {
      depends_on: edges.depends_on.map((k) => byKey[k]),
      blocks: edges.blocks.map((k) => byKey[k]),
    };
    const { error: upErr } = await supabase.from('user_stories').update(payload).eq('id', byKey[key]);
    if (upErr) throw upErr;
    console.log(`Linked ${key}: depends_on=${payload.depends_on.length} blocks=${payload.blocks.length}`);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
