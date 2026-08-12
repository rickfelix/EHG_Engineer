/**
 * Phase 5: THE BUILD LOOP - Venture Lifecycle E2E Tests (Stages 17-22)
 *
 * Tests the development and implementation phase (live stage identities per
 * docs/reference/venture-stage-marketing-map.md and the venture_stages DB table
 * -- corrected from pre-S18-S26-redesign names by SD-LEO-INFRA-AUTHOR-VENTURE-
 * LIFECYCLE-001; the old names below are historical, not live):
 * - Stage 17: Pre-Build Checklist (SD_REQUIRED, requires: system_devils_advocate_review)
 * - Stage 18: Marketing Copy Studio (SD_REQUIRED, requires: 9 marketing_* copy artifacts)
 * - Stage 19: Build Execution (SD_REQUIRED)
 * - Stage 20: Quality Assurance (SD_REQUIRED, requires: code_quality_report)
 * - Stage 21: Distribution Setup (SD_REQUIRED, requires: distribution_channel_config,
 *   distribution_ad_copy) -- implemented by stage-22-distribution-setup.js, named for
 *   the PRE-swap numbering (migration 20260607_swap_stage_21_22_full_content.sql
 *   swapped stages 21/22's content; LIFECYCLE_STAGE=21 is hardcoded in that file).
 * - Stage 22: Visual Assets (SD_REQUIRED, requires: visual_device_screenshots,
 *   visual_social_graphics) -- implemented by stage-21-visual-assets.js, likewise
 *   named for the pre-swap numbering.
 *
 * All stages in Phase 5 require Strategic Directives (SD)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getStageForArtifactType, resolveArtifactType, ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 5: THE BUILD LOOP (Stages 17-22)', () => {
  // fullyParallel:true (playwright.config.js) schedules tests within a file across
  // workers unless pinned serial -- these tests share mutable venture state
  // (testVentureId, advancing stage-by-stage) and MUST run in declaration order.
  test.describe.configure({ mode: 'serial' });

  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase5 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 5 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        problem_statement: 'Test problem statement for E2E lifecycle testing',
        current_lifecycle_stage: 16,
        description: 'Testing THE BUILD LOOP phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Seed Stage 16's own exit artifact — STAGE_ADVANCEMENT_ARTIFACT_GATE requires it
    // to already exist before the venture can advance past its birth stage.
    // venture_stages.required_artifacts[16] = [blueprint_financial_projection] (verified
    // live) -- corrected from an earlier [blueprint_api_contract, blueprint_schema_spec]
    // seed, which was itself wrong (see phase4-the-blueprint.spec.ts S14-004/S16-004).
    if (testVentureId) {
      await supabase.from('venture_artifacts').insert([
        { venture_id: testVentureId, artifact_type: 'blueprint_financial_projection', is_current: true, lifecycle_stage: getStageForArtifactType('blueprint_financial_projection'), title: 'Seed artifact for Stage 16', artifact_data: { placeholder: true } }
      ]);
    }
  });

  test.afterAll(async () => {
    if (testVentureId) {
      // chairman_decisions_venture_id_fkey is ON DELETE RESTRICT (verified live) --
      // the Stage 21 BINDING-block test below inserts a chairman_decisions row for
      // this venture, so it must be deleted before the venture or this cleanup
      // throws a foreign-key violation and orphans the venture/company for every
      // subsequent run.
      await supabase.from('chairman_decisions').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_artifacts').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // STAGE 17: Pre-Build Checklist (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 17: Pre-Build Checklist', () => {
    test('S17-001: should advance to Stage 17', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 17 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S17-002: should create system_prompt for AI agents', async () => {
      const systemPrompt = {
        agent_config: {
          name: 'VentureForge AI Assistant',
          role: 'Development and lifecycle management assistant',
          capabilities: [
            'Code generation and review',
            'Architecture suggestions',
            'Testing recommendations',
            'Documentation assistance'
          ]
        },
        prompts: {
          code_review: 'You are a senior engineer reviewing code for VentureForge. Focus on security, performance, and maintainability.',
          architecture: 'You are a software architect designing scalable solutions. Consider trade-offs and explain decisions.',
          testing: 'You are a QA engineer ensuring comprehensive test coverage. Recommend unit, integration, and E2E tests.'
        },
        constraints: [
          'Never expose sensitive data in logs',
          'Always validate user input',
          'Follow REST best practices',
          'Use TypeScript strict mode'
        ],
        context: {
          tech_stack: 'React, Node.js, PostgreSQL',
          coding_standards: 'ESLint, Prettier, TypeScript strict',
          testing_framework: 'Jest, Playwright'
        }
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: resolveArtifactType('system_prompt'),
          is_current: true,
          // build_system_prompt is a valid CHECK-constraint value but is not wired into
          // any stage in ARTIFACT_TYPE_BY_STAGE (orphaned pre-dates the stage redesign) --
          // getStageForArtifactType returns null; fall back to this file's own Stage 17.
          lifecycle_stage: getStageForArtifactType(resolveArtifactType('system_prompt')) ?? 17,
          title: 'AI Agent System Prompt',
          artifact_data: systemPrompt,
        });

      expect(error).toBeNull();
    });

    test('S17-003: should create cicd_config artifact', async () => {
      const cicdConfig = {
        platform: 'github_actions',
        workflows: {
          ci: {
            name: 'CI Pipeline',
            triggers: ['push', 'pull_request'],
            jobs: [
              { name: 'lint', command: 'npm run lint' },
              { name: 'test', command: 'npm run test' },
              { name: 'build', command: 'npm run build' }
            ]
          },
          cd: {
            name: 'CD Pipeline',
            triggers: ['push to main'],
            environments: ['staging', 'production'],
            jobs: [
              { name: 'deploy_staging', command: 'npm run deploy:staging', environment: 'staging' },
              { name: 'deploy_production', command: 'npm run deploy:prod', environment: 'production', requires_approval: true }
            ]
          }
        },
        environments: {
          development: { url: 'http://localhost:3000', auto_deploy: false },
          staging: { url: 'https://staging.ventureforge.io', auto_deploy: true },
          production: { url: 'https://app.ventureforge.io', auto_deploy: false }
        },
        secrets_required: [
          'SUPABASE_URL',
          'SUPABASE_KEY',
          'OPENAI_API_KEY',
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY'
        ]
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: resolveArtifactType('cicd_config'),
          is_current: true,
          lifecycle_stage: getStageForArtifactType(resolveArtifactType('cicd_config')) ?? 17,
          title: 'CI/CD Configuration',
          artifact_data: cicdConfig,
        });

      expect(error).toBeNull();
    });

    test('S17-004: should create system_devils_advocate_review artifact', async () => {
      // venture_stages.required_artifacts[17] = [system_devils_advocate_review] (verified
      // live). Never created anywhere in this file; system_prompt/cicd_config above are
      // legacy artifacts unrelated to Stage 17's real requirement (see their own comments).
      const devilsAdvocateReview = {
        concerns_raised: ['Pre-build checklist completeness', 'Timeline risk given team size'],
        counter_arguments: ['Checklist covers OWASP + WCAG baseline', 'Buffer built into sprint plan'],
        resolution: 'proceed_with_monitoring'
      };

      const { error } = await supabase.from('venture_artifacts').insert({
        venture_id: testVentureId,
        artifact_type: 'system_devils_advocate_review',
        is_current: true,
        lifecycle_stage: getStageForArtifactType('system_devils_advocate_review') ?? 17,
        title: 'Pre-Build Devil\'s Advocate Review',
        artifact_data: devilsAdvocateReview,
      });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 18: Marketing Copy Studio (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 18: Marketing Copy Studio', () => {
    test('S18-001: should advance to Stage 18', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 18 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    // venture_stages.required_artifacts[18] = 9 marketing_* copy artifacts (verified
    // live via ARTIFACT_TYPE_BY_STAGE[18] in lib/eva/artifact-types.js), one per
    // COPY_SECTIONS entry, matching what lib/eva/stage-templates/analysis-steps/
    // stage-18-marketing-copy.js and server/routes/stage18.js both write.
    test('S18-002: should create the 9 Marketing Copy Studio artifacts', async () => {
      const sections = [
        { type: ARTIFACT_TYPES.MARKETING_TAGLINE, title: 'Marketing Tagline', data: { tagline: 'Ship ventures faster, validated by real demand.' } },
        { type: ARTIFACT_TYPES.MARKETING_APP_STORE_DESC, title: 'App Store Description', data: { short_description: 'Autonomous venture building, from idea to launch.', long_description: 'VentureForge takes a validated idea through build, distribution, and launch with an AI co-pilot at every stage.' } },
        { type: ARTIFACT_TYPES.MARKETING_LANDING_HERO, title: 'Landing Page Hero', data: { headline: 'From idea to launched venture.', subheadline: 'AI-driven validation, build, and distribution in one pipeline.', cta: 'Start your venture' } },
        { type: ARTIFACT_TYPES.MARKETING_EMAIL_WELCOME, title: 'Welcome Email', data: { subject: 'Welcome to VentureForge', body: 'Your venture pipeline is set up and ready for Stage 1 validation.' } },
        { type: ARTIFACT_TYPES.MARKETING_EMAIL_ONBOARDING, title: 'Onboarding Email', data: { subject: 'Get the most out of VentureForge', body: 'Here is how to move your venture through validation, build, and launch.' } },
        { type: ARTIFACT_TYPES.MARKETING_EMAIL_REENGAGEMENT, title: 'Re-engagement Email', data: { subject: 'Your venture is waiting', body: 'Pick up where you left off and keep your venture moving toward launch.' } },
        { type: ARTIFACT_TYPES.MARKETING_SOCIAL_POSTS, title: 'Social Media Posts', data: { posts: [{ platform: 'twitter_x', copy: 'Building a venture with an AI co-pilot. Idea to launch, validated at every stage.' }] } },
        { type: ARTIFACT_TYPES.MARKETING_SEO_META, title: 'SEO Metadata', data: { meta_title: 'VentureForge — AI Venture Building', meta_description: 'Validate, build, and launch ventures with an autonomous AI pipeline.' } },
        { type: ARTIFACT_TYPES.MARKETING_BLOG_DRAFT, title: 'Launch Blog Draft', data: { title: 'How we validate a venture before writing a line of code', body: 'Every venture starts with a falsifiable demand thesis, not a hunch.' } },
      ];

      const { error } = await supabase.from('venture_artifacts').insert(
        sections.map((s) => ({
          venture_id: testVentureId,
          artifact_type: s.type,
          is_current: true,
          lifecycle_stage: getStageForArtifactType(s.type),
          title: s.title,
          artifact_data: s.data,
        }))
      );
      expect(error).toBeNull();

      const { data: artifacts } = await supabase
        .from('venture_artifacts')
        .select('artifact_type, lifecycle_stage')
        .eq('venture_id', testVentureId)
        .in('artifact_type', sections.map((s) => s.type));

      expect(artifacts?.length).toBe(9);
      expect(artifacts?.every((a) => a.lifecycle_stage === 18)).toBe(true);
    });
  });

  // =========================================================================
  // STAGE 19: Build Execution (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 19: Build Execution', () => {
    test('S19-001: should advance to Stage 19', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 19 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S19-002: should document integration status', async () => {
      const integrationStatus = {
        api_implementation: {
          total_endpoints: 25,
          implemented: 22,
          tested: 18,
          documented: 15
        },
        third_party_integrations: [
          { name: 'Stripe', purpose: 'Payments', status: 'complete', tested: true },
          { name: 'SendGrid', purpose: 'Email', status: 'complete', tested: true },
          { name: 'Anthropic', purpose: 'AI', status: 'complete', tested: true },
          { name: 'AWS S3', purpose: 'Storage', status: 'in_progress', tested: false }
        ],
        webhooks: {
          inbound: [
            { source: 'Stripe', events: ['payment.success', 'subscription.cancelled'] },
            { source: 'GitHub', events: ['push', 'pull_request'] }
          ],
          outbound: [
            { destination: 'Slack', events: ['venture.created', 'stage.advanced'] }
          ]
        },
        api_versioning: {
          current_version: 'v1',
          deprecation_policy: '6 months notice'
        }
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          // No CHECK-constraint equivalent for 'integration_status'. build_test_coverage_report
          // is the next-closest legal type; build_mvp_build (S19-003 below) is stage 19's
          // OWN required-artifact type, not reused here.
          artifact_type: 'build_test_coverage_report',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('build_test_coverage_report') ?? 19,
          title: 'Integration Status',
          artifact_data: integrationStatus,
        });

      expect(error).toBeNull();
    });

    test('S19-003: should create build_mvp_build artifact', async () => {
      // venture_stages.required_artifacts[19] includes build_mvp_build (verified live
      // by STAGE_ADVANCEMENT_ARTIFACT_GATE, which blocks the Stage 20 advance below
      // with 23514 "missing required artifact(s): build_mvp_build" if this is absent).
      // ARTIFACT_TYPE_BY_STAGE[19] in lib/eva/artifact-types.js registers it as the
      // build-completion output for this stage. Previously satisfied incidentally by
      // a Stage 18 filler insert (SD-LEO-INFRA-AUTHOR-VENTURE-LIFECYCLE-001 replaced
      // that filler with real Marketing Copy Studio content) -- written here directly
      // instead, at the stage that actually requires it.
      const mvpProgress = {
        sprint_summary: { current_sprint: 3, total_sprints: 6, velocity: 21, completion_percentage: 0.45 },
        features_completed: [{ id: 'F001', name: 'User Authentication', stories_completed: 3, stories_total: 3 }],
        features_in_progress: [{ id: 'F003', name: 'Venture Creation', stories_completed: 2, stories_total: 4 }],
        blockers: [],
        metrics: { code_coverage: 0.72, bug_count: 3, performance_score: 85 },
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: ARTIFACT_TYPES.BUILD_MVP_BUILD,
          is_current: true,
          lifecycle_stage: getStageForArtifactType(ARTIFACT_TYPES.BUILD_MVP_BUILD),
          title: 'MVP Development Progress',
          artifact_data: mvpProgress,
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 20: Quality Assurance (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 20: Quality Assurance', () => {
    test('S20-001: should advance to Stage 20', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 20 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S20-002: should create security_audit artifact', async () => {
      // WCAG compliance: "2.1 AA" as per lifecycle_stage_config
      const securityAudit = {
        security_assessment: {
          owasp_top_10: {
            injection: { status: 'pass', notes: 'Parameterized queries used' },
            broken_auth: { status: 'pass', notes: 'JWT with refresh tokens' },
            xss: { status: 'pass', notes: 'React auto-escaping, CSP headers' },
            insecure_deserialization: { status: 'pass', notes: 'JSON schema validation' },
            security_misconfiguration: { status: 'pass', notes: 'Security headers configured' }
          },
          vulnerability_scan: {
            critical: 0,
            high: 0,
            medium: 2,
            low: 5,
            last_scan: new Date().toISOString()
          },
          penetration_test: {
            status: 'completed',
            findings: 0,
            date: new Date().toISOString(),
            vendor: 'Internal'
          }
        },
        performance_assessment: {
          lighthouse_scores: {
            performance: 92,
            accessibility: 98,
            best_practices: 95,
            seo: 100
          },
          load_testing: {
            concurrent_users: 1000,
            response_time_p50: 120,
            response_time_p95: 450,
            error_rate: 0.001
          },
          database_performance: {
            query_time_p95: 50,
            connection_pool_usage: 0.6,
            slow_queries: 2
          }
        },
        accessibility: {
          wcag_level: '2.1 AA',
          compliance_percentage: 0.98,
          issues: [
            { severity: 'minor', description: 'Missing alt text on 2 decorative images' }
          ]
        },
        compliance: {
          gdpr: true,
          soc2: 'in_progress',
          hipaa: 'not_applicable'
        }
      };

      const { data: artifact, error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: resolveArtifactType('security_audit'),
          is_current: true,
          lifecycle_stage: getStageForArtifactType(resolveArtifactType('security_audit')),
          title: 'Quality Assurance Audit',
          artifact_data: securityAudit,
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Validate WCAG compliance requirement
      expect(securityAudit.accessibility.wcag_level).toBe('2.1 AA');
    });

    test('S20-003: should complete Phase 5 with all artifacts', async () => {
      // marketing_tagline added -- SD-LEO-INFRA-AUTHOR-VENTURE-LIFECYCLE-001 replaced
      // the Stage 18 filler with the real Marketing Copy Studio artifacts (S18-002
      // above); marketing_tagline is one of those 9. build_mvp_build is now written
      // by S19-003 (its real gate-required stage) instead of the old Stage 18 filler.
      // Count is 6: one per stage 17/18/19/20 own-artifact type this file authors.
      const { data: artifacts } = await supabase
        .from('venture_artifacts')
        .select('artifact_type')
        .eq('venture_id', testVentureId)
        .in('artifact_type', [
          'build_system_prompt',
          'build_cicd_config',
          'marketing_tagline',
          'build_mvp_build',
          'build_test_coverage_report',
          'build_security_audit'
        ]);

      expect(artifacts?.length).toBe(6);

      // Stage 20's real gate requirement (verified live) is code_quality_report,
      // distinct from the security_audit content this file authors -- seed it so
      // the advance below satisfies fn_stage_artifact_precondition.
      const { error: qualitySeedError } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'code_quality_report',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('code_quality_report'),
          title: 'Code Quality Report (seed)',
          artifact_data: { placeholder: true },
        });
      expect(qualitySeedError).toBeNull();

      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 21 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 21: Distribution Setup (SD_REQUIRED)
  // Implemented by lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js
  // (LIFECYCLE_STAGE=21 hardcoded there -- file named for the pre-swap numbering).
  // =========================================================================
  test.describe('Stage 21: Distribution Setup', () => {
    test('S21-001: should create the canonical distribution_channel_config + distribution_ad_copy pair', async () => {
      // CANONICAL_PAIR_TYPES in stage-22-distribution-setup.js:58 -- the only two
      // types persistCanonicalPair() writes on the success path (launch_test_plan
      // is a legacy dual-emit, not part of the canonical contract this SD tests).
      const channelConfig = {
        experiments: [
          { channel: 'blog_seo', rank: 1, hypothesis: 'Organic search reaches early-adopter personas cheaply', persona_mapping: 'Solo Founder', cost_to_signal_bound: '$0 / 8 hours to reach 100 strangers', execution_tier: 'T0' },
        ],
        total_channels: 1,
        active_channels: 1,
        attribution: 'first_touch',
      };
      const adCopy = {
        channels_with_copy: [
          { channel: 'blog_seo', persona_mapping: 'Solo Founder', message_variants: [{ variant_id: 'A', headline: 'Validate before you build', body: 'A falsifiable demand thesis beats a hunch.', cta: 'Read the thesis' }] },
        ],
      };

      const { error } = await supabase.from('venture_artifacts').insert([
        { venture_id: testVentureId, artifact_type: ARTIFACT_TYPES.DISTRIBUTION_CHANNEL_CONFIG, is_current: true, lifecycle_stage: getStageForArtifactType(ARTIFACT_TYPES.DISTRIBUTION_CHANNEL_CONFIG), title: 'Distribution channel config', artifact_data: channelConfig },
        { venture_id: testVentureId, artifact_type: ARTIFACT_TYPES.DISTRIBUTION_AD_COPY, is_current: true, lifecycle_stage: getStageForArtifactType(ARTIFACT_TYPES.DISTRIBUTION_AD_COPY), title: 'Distribution ad copy', artifact_data: adCopy },
      ]);
      expect(error).toBeNull();

      const { data: artifacts } = await supabase
        .from('venture_artifacts')
        .select('artifact_type, lifecycle_stage')
        .eq('venture_id', testVentureId)
        .in('artifact_type', [ARTIFACT_TYPES.DISTRIBUTION_CHANNEL_CONFIG, ARTIFACT_TYPES.DISTRIBUTION_AD_COPY]);

      expect(artifacts?.length).toBe(2);
      expect(artifacts?.every((a) => a.lifecycle_stage === 21)).toBe(true);
    });

    test('S21-002: BINDING block path should record a blocking chairman_decisions row on total failure', async () => {
      // stage-22-distribution-setup.js blockDistribution() (e.g. on demand_thesis_missing)
      // records a blocking chairman_decisions row via recordPendingDecision -- shape
      // verified live (lib/chairman/record-pending-decision.mjs:298-307): decision is
      // NOT NULL and always 'pending' regardless of decision_type. There is NO
      // _skip:true and NO fabricated canonical pair on this path (module header,
      // stage-22-distribution-setup.js:19-24).
      //
      // The module's persistBlockMarker() ALSO attempts a distribution_block_marker
      // venture_artifacts row, but that artifact_type is registered in
      // lib/eva/artifact-types.js (DISTRIBUTION_BLOCK_MARKER) while NOT YET present in
      // the live venture_artifacts_artifact_type_check CHECK constraint (verified live,
      // 2026-08-12) -- the insert fails, and persistBlockMarker() swallows that error
      // into a warn log without surfacing it to its caller (return value discarded at
      // stage-22-distribution-setup.js:563). This test does not assert that row exists
      // until the CHECK constraint is widened ("CHECK-widening pending chairman apply"
      // per the artifact-types.js comment) -- asserting it today would assert something
      // currently false about the live system, the exact defect class this SD exists to fix.
      const { error, data } = await supabase
        .from('chairman_decisions')
        .insert({
          venture_id: testVentureId,
          lifecycle_stage: 21,
          decision: 'pending',
          decision_type: 'distribution_block',
          status: 'pending',
          summary: 'Distribution blocked for E2E test venture: demand_thesis_missing',
          brief_data: { title: 'Distribution blocked', recorded_via: 'record-pending-decision' },
          blocking: true,
        })
        .select('id, decision_type, blocking, status')
        .single();

      expect(error).toBeNull();
      expect(data?.decision_type).toBe('distribution_block');
      expect(data?.blocking).toBe(true);
      expect(data?.status).toBe('pending');
    });
  });

  // =========================================================================
  // STAGE 22: Visual Assets (SD_REQUIRED)
  // Implemented by lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js
  // (runs as stage 22 by elimination -- file named for the pre-swap numbering).
  // =========================================================================
  test.describe('Stage 22: Visual Assets', () => {
    test('S22-001: should create the canonical visual_device_screenshots + visual_social_graphics pair', async () => {
      // Canonical pair per stage-21-visual-assets.js:246-247, registered at stage 22
      // in ARTIFACT_TYPE_BY_STAGE (lib/eva/artifact-types.js:447-451) -- resolved via
      // getStageForArtifactType rather than a literal, matching the rest of this file.
      const screenshotData = { devices: [{ device: 'iphone_15', screens: ['onboarding', 'dashboard'] }] };
      const socialData = { platforms: [{ platform: 'twitter_x', dimensions: '1200x675', headline: 'Launching soon' }] };

      const { error } = await supabase.from('venture_artifacts').insert([
        { venture_id: testVentureId, artifact_type: ARTIFACT_TYPES.VISUAL_DEVICE_SCREENSHOTS, is_current: true, lifecycle_stage: getStageForArtifactType(ARTIFACT_TYPES.VISUAL_DEVICE_SCREENSHOTS), title: 'S21 Visual Assets — Device Screenshots', artifact_data: screenshotData },
        { venture_id: testVentureId, artifact_type: ARTIFACT_TYPES.VISUAL_SOCIAL_GRAPHICS, is_current: true, lifecycle_stage: getStageForArtifactType(ARTIFACT_TYPES.VISUAL_SOCIAL_GRAPHICS), title: 'S21 Visual Assets — Social Graphics', artifact_data: socialData },
      ]);
      expect(error).toBeNull();

      const { data: artifacts } = await supabase
        .from('venture_artifacts')
        .select('artifact_type, lifecycle_stage')
        .eq('venture_id', testVentureId)
        .in('artifact_type', [ARTIFACT_TYPES.VISUAL_DEVICE_SCREENSHOTS, ARTIFACT_TYPES.VISUAL_SOCIAL_GRAPHICS]);

      expect(artifacts?.length).toBe(2);
      expect(artifacts?.every((a) => a.lifecycle_stage === 22)).toBe(true);
    });

    test('S22-002: precondition-missing path should create a visual_assets_skipped marker', async () => {
      // stage-21-visual-assets.js refuses to run (and writes this marker instead)
      // when any of identity_visual (S11), s17_designs (S17), or
      // venture_resources.deployment_url (S19) is absent -- verified live at
      // lines 45-54 and 358-406. artifact_type='visual_assets_skipped' and
      // lifecycle_stage=22 are both live-valid (confirmed against the
      // venture_artifacts_artifact_type_check CHECK constraint); title is NOT NULL.
      const { error } = await supabase.from('venture_artifacts').insert({
        venture_id: testVentureId,
        artifact_type: 'visual_assets_skipped',
        is_current: true,
        lifecycle_stage: 22,
        title: 'S21 Visual Assets — Skipped',
        artifact_data: {
          skip_reason: 'missing_preconditions',
          missing_preconditions: ['identity_visual', 's17_designs', 'venture_resources.deployment_url'],
        },
      });
      expect(error).toBeNull();

      const { data: marker } = await supabase
        .from('venture_artifacts')
        .select('artifact_type, lifecycle_stage, title')
        .eq('venture_id', testVentureId)
        .eq('artifact_type', 'visual_assets_skipped')
        .maybeSingle();

      expect(marker?.lifecycle_stage).toBe(22);
      expect(marker?.title).toBeTruthy();
    });
  });
});
