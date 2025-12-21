/**
 * Phase 6: LAUNCH & LEARN - Venture Lifecycle E2E Tests (Stages 21-25)
 *
 * Tests the deployment and optimization phase:
 * - Stage 21: QA & UAT (SD_REQUIRED, requires: test_plan, uat_report)
 * - Stage 22: Deployment & Infrastructure (SD_REQUIRED, requires: deployment_runbook)
 * - Stage 23: Production Launch (DECISION_GATE, requires: launch_checklist)
 * - Stage 24: Analytics & Feedback (requires: analytics_dashboard)
 * - Stage 25: Optimization & Scale (SD_REQUIRED, requires: optimization_roadmap)
 *
 * Test coverage requirement: minimum 80% as per lifecycle_stage_config
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 6: LAUNCH & LEARN (Stages 21-25)', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase6 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 6 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 20,
        description: 'Testing LAUNCH & LEARN phase lifecycle'
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
  // STAGE 21: QA & UAT (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 21: QA & UAT', () => {
    test('S21-001: should advance to Stage 21', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 21 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S21-002: should create test_plan with 80% coverage target', async () => {
      // Requirement: test_coverage_min: 0.80
      const testPlan = {
        coverage_targets: {
          unit: 0.85,
          integration: 0.75,
          e2e: 0.60,
          overall_minimum: 0.80
        },
        test_suites: [
          {
            name: 'Unit Tests',
            framework: 'Jest',
            test_count: 245,
            coverage: 0.87,
            passing: 243,
            failing: 2
          },
          {
            name: 'Integration Tests',
            framework: 'Jest + Supertest',
            test_count: 78,
            coverage: 0.76,
            passing: 78,
            failing: 0
          },
          {
            name: 'E2E Tests',
            framework: 'Playwright',
            test_count: 42,
            coverage: 0.65,
            passing: 40,
            failing: 2
          }
        ],
        critical_paths: [
          { path: 'User Registration → Login → Create Venture', status: 'passing' },
          { path: 'Venture Creation → Stage Advancement → Document Upload', status: 'passing' },
          { path: 'Payment Flow → Subscription Activation', status: 'passing' }
        ],
        overall_coverage: 0.82,
        meets_requirement: true
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'test_plan',
          title: 'Test Plan',
          content: testPlan,
          status: 'complete'
        });

      expect(error).toBeNull();

      // Validate 80% minimum coverage requirement
      expect(testPlan.overall_coverage).toBeGreaterThanOrEqual(0.80);
    });

    test('S21-003: should create uat_report artifact', async () => {
      const uatReport = {
        uat_summary: {
          total_scenarios: 35,
          passed: 33,
          failed: 1,
          blocked: 1,
          pass_rate: 0.943
        },
        testers: [
          { name: 'Product Manager', scenarios_tested: 15, issues_found: 2 },
          { name: 'Customer Success', scenarios_tested: 12, issues_found: 1 },
          { name: 'Beta Customer', scenarios_tested: 8, issues_found: 0 }
        ],
        critical_issues: [
          {
            id: 'UAT-001',
            severity: 'medium',
            description: 'Slow load time on venture list with 100+ items',
            status: 'fixed',
            resolution: 'Added pagination'
          }
        ],
        sign_off: {
          product_owner: { approved: true, date: new Date().toISOString() },
          qa_lead: { approved: true, date: new Date().toISOString() },
          stakeholder: { approved: true, date: new Date().toISOString() }
        },
        ready_for_launch: true
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'uat_report',
          title: 'UAT Report',
          content: uatReport,
          status: 'complete'
        });

      expect(error).toBeNull();
      expect(uatReport.ready_for_launch).toBe(true);
    });
  });

  // =========================================================================
  // STAGE 22: Deployment & Infrastructure (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 22: Deployment & Infrastructure', () => {
    test('S22-001: should advance to Stage 22', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 22 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S22-002: should create deployment_runbook artifact', async () => {
      const deploymentRunbook = {
        infrastructure: {
          provider: 'AWS',
          region: 'us-east-1',
          resources: [
            { type: 'ECS Cluster', name: 'ventureforge-prod', status: 'running' },
            { type: 'RDS PostgreSQL', name: 'ventureforge-db', status: 'running' },
            { type: 'ElastiCache Redis', name: 'ventureforge-cache', status: 'running' },
            { type: 'S3 Bucket', name: 'ventureforge-assets', status: 'active' },
            { type: 'CloudFront', name: 'ventureforge-cdn', status: 'deployed' }
          ]
        },
        deployment_process: {
          steps: [
            { order: 1, name: 'Run test suite', command: 'npm run test', required: true },
            { order: 2, name: 'Build production', command: 'npm run build', required: true },
            { order: 3, name: 'Push to ECR', command: 'docker push', required: true },
            { order: 4, name: 'Update ECS service', command: 'aws ecs update-service', required: true },
            { order: 5, name: 'Run health check', command: 'curl /health', required: true },
            { order: 6, name: 'Run smoke tests', command: 'npm run test:smoke', required: true }
          ],
          rollback_procedure: {
            trigger: 'Health check failure or >1% error rate',
            steps: [
              'Revert ECS task definition to previous version',
              'Verify health check passes',
              'Notify on-call engineer',
              'Create incident ticket'
            ]
          }
        },
        monitoring: {
          uptime: { tool: 'AWS CloudWatch', target: 0.999 },
          alerts: [
            { name: 'High Error Rate', threshold: '>1% 5xx', action: 'PagerDuty' },
            { name: 'High Latency', threshold: 'p95 > 500ms', action: 'Slack' },
            { name: 'CPU High', threshold: '>80%', action: 'Auto-scale' }
          ],
          dashboards: ['Main Operations', 'API Performance', 'Database Health']
        },
        backup_recovery: {
          database: { frequency: 'hourly', retention: '30 days', tested: true },
          files: { frequency: 'daily', retention: '90 days', tested: true },
          disaster_recovery: { rpo: '1 hour', rto: '4 hours', tested: true }
        }
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'deployment_runbook',
          title: 'Deployment Runbook',
          content: deploymentRunbook,
          status: 'complete'
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 23: Production Launch (Decision Gate)
  // =========================================================================
  test.describe('Stage 23: Production Launch', () => {
    test('S23-001: should advance to Stage 23', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 23 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S23-002: should create launch_checklist artifact', async () => {
      const launchChecklist = {
        pre_launch: {
          items: [
            { task: 'All tests passing', status: 'complete', owner: 'QA' },
            { task: 'Security audit passed', status: 'complete', owner: 'Security' },
            { task: 'Performance targets met', status: 'complete', owner: 'Engineering' },
            { task: 'Documentation complete', status: 'complete', owner: 'Tech Writer' },
            { task: 'Marketing materials ready', status: 'complete', owner: 'Marketing' },
            { task: 'Support team trained', status: 'complete', owner: 'Support' },
            { task: 'Rollback plan tested', status: 'complete', owner: 'DevOps' },
            { task: 'Legal review complete', status: 'complete', owner: 'Legal' }
          ],
          all_complete: true
        },
        launch_day: {
          timeline: [
            { time: '06:00', task: 'Final deployment to production', owner: 'DevOps' },
            { time: '07:00', task: 'Smoke tests', owner: 'QA' },
            { time: '08:00', task: 'Enable feature flags', owner: 'Engineering' },
            { time: '09:00', task: 'Press release goes live', owner: 'Marketing' },
            { time: '09:00', task: 'Product Hunt launch', owner: 'Marketing' },
            { time: '09:00', task: 'Email to waitlist', owner: 'Marketing' },
            { time: '12:00', task: 'First metrics review', owner: 'Product' },
            { time: '18:00', task: 'End of day review', owner: 'All' }
          ],
          war_room: {
            location: 'Virtual - Slack #launch-day',
            participants: ['CEO', 'CTO', 'Product', 'Engineering', 'Support']
          }
        },
        post_launch: {
          day_1: ['Monitor error rates', 'Respond to support tickets', 'Social media monitoring'],
          week_1: ['Daily metrics review', 'User feedback collection', 'Bug prioritization'],
          month_1: ['Cohort analysis', 'Feature usage review', 'Roadmap adjustment']
        },
        decision_gate: {
          go_no_go: 'GO',
          decided_by: 'CEO',
          decided_at: new Date().toISOString(),
          conditions: []
        }
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'launch_checklist',
          title: 'Launch Checklist',
          content: launchChecklist,
          status: 'complete'
        });

      expect(error).toBeNull();

      // Verify all pre-launch items complete
      expect(launchChecklist.pre_launch.all_complete).toBe(true);
      expect(launchChecklist.decision_gate.go_no_go).toBe('GO');
    });
  });

  // =========================================================================
  // STAGE 24: Analytics & Feedback
  // =========================================================================
  test.describe('Stage 24: Analytics & Feedback', () => {
    test('S24-001: should advance to Stage 24', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 24 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S24-002: should create analytics_dashboard artifact', async () => {
      const analyticsDashboard = {
        metrics: {
          acquisition: {
            signups: { total: 1250, weekly_growth: 0.15 },
            activation_rate: 0.68,
            traffic_sources: {
              organic: 0.35,
              product_hunt: 0.25,
              referral: 0.20,
              paid: 0.15,
              direct: 0.05
            }
          },
          engagement: {
            dau: 420,
            wau: 890,
            mau: 1100,
            dau_mau_ratio: 0.38,
            session_duration_avg: 12.5,
            features_used_avg: 4.2
          },
          retention: {
            day_1: 0.72,
            day_7: 0.45,
            day_30: 0.28,
            cohort_analysis: 'improving'
          },
          revenue: {
            mrr: 15000,
            arr: 180000,
            arpu: 89,
            ltv: 534,
            cac: 125,
            ltv_cac_ratio: 4.27
          }
        },
        feedback: {
          nps: 42,
          csat: 4.2,
          feature_requests: [
            { feature: 'API access', votes: 45 },
            { feature: 'Mobile app', votes: 38 },
            { feature: 'Integrations', votes: 32 }
          ],
          pain_points: [
            { issue: 'Onboarding complexity', mentions: 12 },
            { issue: 'Missing export feature', mentions: 8 }
          ]
        },
        experiments: {
          active: [
            { name: 'New onboarding flow', variant: 'B winning', lift: 0.23 }
          ],
          completed: [
            { name: 'Pricing page redesign', result: 'implemented', conversion_lift: 0.15 }
          ]
        }
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'analytics_dashboard',
          title: 'Analytics Dashboard',
          content: analyticsDashboard,
          status: 'complete'
        });

      expect(error).toBeNull();

      // Validate key metrics are tracked
      expect(analyticsDashboard.metrics.revenue.ltv_cac_ratio).toBeGreaterThan(3);
    });
  });

  // =========================================================================
  // STAGE 25: Optimization & Scale (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 25: Optimization & Scale', () => {
    test('S25-001: should advance to Stage 25 (final stage)', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 25 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S25-002: should create optimization_roadmap artifact', async () => {
      const optimizationRoadmap = {
        growth_initiatives: {
          q1: [
            { initiative: 'SEO optimization', expected_impact: '+30% organic traffic', status: 'planned' },
            { initiative: 'Referral program', expected_impact: '+20% signups', status: 'planned' }
          ],
          q2: [
            { initiative: 'Enterprise sales push', expected_impact: '+50% ARR', status: 'planned' },
            { initiative: 'API launch', expected_impact: '+15% retention', status: 'planned' }
          ]
        },
        technical_improvements: [
          { area: 'Performance', current: 'p95 450ms', target: 'p95 200ms', priority: 'high' },
          { area: 'Scalability', current: '1000 concurrent', target: '10000 concurrent', priority: 'medium' },
          { area: 'Cost optimization', current: '$5k/month', target: '$3k/month', priority: 'medium' }
        ],
        product_expansion: {
          v2_features: ['Mobile app', 'Advanced analytics', 'Team collaboration'],
          new_markets: ['EU expansion', 'Enterprise tier'],
          partnerships: ['Accelerator integrations', 'VC tool integrations']
        },
        success_metrics: {
          target_mrr: 50000,
          target_users: 5000,
          target_nps: 50,
          timeline: '12 months'
        },
        risks_and_mitigations: [
          { risk: 'Market saturation', probability: 0.3, mitigation: 'Differentiation through AI' },
          { risk: 'Key person dependency', probability: 0.4, mitigation: 'Documentation and hiring' }
        ]
      };

      const { error } = await supabase
        .from('venture_documents')
        .insert({
          venture_id: testVentureId,
          document_type: 'optimization_roadmap',
          title: 'Optimization Roadmap',
          content: optimizationRoadmap,
          status: 'complete'
        });

      expect(error).toBeNull();
    });

    test('S25-003: should complete full venture lifecycle (Stage 25)', async () => {
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      expect(venture.current_lifecycle_stage).toBe(25);

      // Verify all Phase 6 artifacts exist
      const { data: artifacts } = await supabase
        .from('venture_documents')
        .select('document_type')
        .eq('venture_id', testVentureId)
        .in('document_type', [
          'test_plan',
          'uat_report',
          'deployment_runbook',
          'launch_checklist',
          'analytics_dashboard',
          'optimization_roadmap'
        ]);

      expect(artifacts?.length).toBe(6);
    });
  });
});
