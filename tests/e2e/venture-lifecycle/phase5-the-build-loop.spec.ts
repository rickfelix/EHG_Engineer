/**
 * Phase 5: THE BUILD LOOP - Venture Lifecycle E2E Tests (Stages 17-20)
 *
 * Tests the development and implementation phase:
 * - Stage 17: Environment & Agent Config (SD_REQUIRED, requires: system_prompt, cicd_config)
 * - Stage 18: MVP Development Loop (SD_REQUIRED)
 * - Stage 19: Integration & API Layer (SD_REQUIRED)
 * - Stage 20: Security & Performance (SD_REQUIRED, requires: security_audit)
 *
 * All stages in Phase 5 require Strategic Directives (SD)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 5: THE BUILD LOOP (Stages 17-20)', () => {
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
        current_lifecycle_stage: 16,
        description: 'Testing THE BUILD LOOP phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;
  });

  test.afterAll(async () => {
    if (testVentureId) {
      await supabase.from('venture_documents').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // STAGE 17: Environment & Agent Config (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 17: Environment & Agent Config', () => {
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
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'system_prompt',
          title: 'AI Agent System Prompt',
          content: systemPrompt,
          status: 'complete'
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
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'cicd_config',
          title: 'CI/CD Configuration',
          content: cicdConfig,
          status: 'complete'
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 18: MVP Development Loop (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 18: MVP Development Loop', () => {
    test('S18-001: should advance to Stage 18', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 18 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S18-002: should track MVP development progress', async () => {
      const mvpProgress = {
        sprint_summary: {
          current_sprint: 3,
          total_sprints: 6,
          velocity: 21,
          completion_percentage: 0.45
        },
        features_completed: [
          { id: 'F001', name: 'User Authentication', stories_completed: 3, stories_total: 3 },
          { id: 'F002', name: 'Dashboard', stories_completed: 5, stories_total: 5 }
        ],
        features_in_progress: [
          { id: 'F003', name: 'Venture Creation', stories_completed: 2, stories_total: 4 },
          { id: 'F004', name: 'Document Management', stories_completed: 1, stories_total: 6 }
        ],
        blockers: [],
        tech_debt: [
          { item: 'Refactor auth service', priority: 'medium', estimated_effort: '2 days' }
        ],
        metrics: {
          code_coverage: 0.72,
          bug_count: 3,
          performance_score: 85
        }
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'mvp_progress',
          title: 'MVP Development Progress',
          content: mvpProgress,
          status: 'in_progress'
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 19: Integration & API Layer (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 19: Integration & API Layer', () => {
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
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'integration_status',
          title: 'Integration Status',
          content: integrationStatus,
          status: 'complete'
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 20: Security & Performance (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 20: Security & Performance', () => {
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
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'security_audit',
          title: 'Security & Performance Audit',
          content: securityAudit,
          status: 'complete'
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      // Validate WCAG compliance requirement
      expect(securityAudit.accessibility.wcag_level).toBe('2.1 AA');
    });

    test('S20-003: should complete Phase 5 with all artifacts', async () => {
      const { data: artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .in('document_type', [
          'system_prompt',
          'cicd_config',
          'mvp_progress',
          'integration_status',
          'security_audit'
        ]);

      expect(artifacts?.length).toBe(5);

      // Ready for Phase 6 (Stage 21)
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 21 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });
});
