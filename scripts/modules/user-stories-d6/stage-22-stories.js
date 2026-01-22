/**
 * User Stories for Stage 22: Deployment & Infrastructure
 * Part of SD-VISION-TRANSITION-001D6 (Stages 21-25: LAUNCH & LEARN)
 *
 * @module stage-22-stories
 */

export const stage22Stories = [
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-022001',
    title: 'Deployment Dashboard and Management',
    user_role: 'DevOps Engineer',
    user_want: 'deploy ventures to production environments and monitor deployment status',
    user_benefit: 'I can safely deploy to production with real-time status tracking and rollback capability',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-22-001-1',
        scenario: 'Happy path - Deploy to production',
        given: 'Venture UAT is approved AND deployment runbook exists',
        when: 'User selects "Production" environment AND clicks "Deploy" AND confirms deployment',
        then: 'Deployment initiated AND status updates in real-time AND deployment progress shown AND completion notification sent'
      },
      {
        id: 'AC-22-001-2',
        scenario: 'Happy path - View deployment history',
        given: 'Venture has 3 previous deployments',
        when: 'User clicks "Deployment History" tab',
        then: 'All deployments listed with timestamp, environment, status AND latest deployment highlighted AND rollback option available for each'
      },
      {
        id: 'AC-22-001-3',
        scenario: 'Happy path - Rollback deployment',
        given: 'Production deployment has issues AND previous version available',
        when: 'User clicks "Rollback" on previous deployment AND confirms rollback',
        then: 'Rollback initiated AND previous version restored AND health checks run AND rollback completion confirmed'
      },
      {
        id: 'AC-22-001-4',
        scenario: 'Error path - Deploy without UAT approval',
        given: 'Venture UAT is not approved',
        when: 'User attempts to deploy to production',
        then: 'System blocks deployment AND shows error "UAT approval required before production deployment" AND user redirected to UAT section'
      },
      {
        id: 'AC-22-001-5',
        scenario: 'Edge case - Monitor deployment health checks',
        given: 'Deployment is in progress',
        when: 'Health checks run automatically',
        then: 'Health check results displayed (API response, database connectivity, service status) AND deployment pauses if health check fails AND alert sent to team'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Deployment dashboard UI implemented',
      'Real-time deployment status tracking working',
      'Rollback functionality operational',
      'Health check monitoring integrated',
      'E2E test US-D6-22-001 passing'
    ]),
    implementation_context: 'Integrate with existing deployment infrastructure. Store deployment records in venture_stage_work with work_type = "deployment". Use WebSocket or SSE for real-time status updates. Health checks should ping venture endpoints and report status.',
    architecture_references: JSON.stringify({
      deployment_infrastructure: [
        'Existing deployment scripts/pipelines',
        'Health check endpoints'
      ],
      patterns_to_follow: [
        'Real-time status updates (WebSocket/SSE)',
        'Deployment record tracking',
        'Rollback workflow pattern'
      ],
      integration_points: [
        'venture_stage_work table (deployment records)',
        'Deployment pipeline API',
        'Health check service'
      ]
    }),
    example_code_patterns: JSON.stringify({
      deployment_record: `
const deployment = {
  venture_id: ventureId,
  stage_number: 22,
  work_type: 'deployment',
  work_data: {
    environment: 'production',
    version: 'v1.0.0',
    deployed_at: new Date().toISOString(),
    deployed_by: userId,
    status: 'in_progress',
    health_checks: { api: 'pending', db: 'pending', services: 'pending' }
  }
};
      `,
      health_check: `
const runHealthChecks = async (ventureId) => {
  const checks = await Promise.all([
    checkAPI(ventureId),
    checkDatabase(ventureId),
    checkServices(ventureId)
  ]);
  return { api: checks[0], db: checks[1], services: checks[2] };
};
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-22-001-deployment-dashboard.spec.ts',
      test_cases: [
        { id: 'TC-22-001-1', scenario: 'Deploy to production successfully', priority: 'P0' },
        { id: 'TC-22-001-2', scenario: 'Block deployment without UAT', priority: 'P0' },
        { id: 'TC-22-001-3', scenario: 'Rollback deployment', priority: 'P1' },
        { id: 'TC-22-001-4', scenario: 'Health check monitoring', priority: 'P1' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-022002',
    title: 'Automated Runbook Generation',
    user_role: 'DevOps Engineer',
    user_want: 'auto-generate deployment runbooks with rollback procedures and emergency contacts',
    user_benefit: 'I have comprehensive deployment documentation without manual runbook creation',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-22-002-1',
        scenario: 'Happy path - Generate deployment runbook',
        given: 'Venture is ready for deployment AND venture metadata is complete',
        when: 'System triggers runbook generation during deployment preparation',
        then: 'deployment_runbook artifact created in venture_artifacts AND runbook includes deployment steps, rollback procedures, emergency contacts AND runbook visible in artifacts list'
      },
      {
        id: 'AC-22-002-2',
        scenario: 'Happy path - Runbook includes rollback procedures',
        given: 'Deployment runbook is generated',
        when: 'User views runbook',
        then: 'Rollback section present with step-by-step instructions AND database rollback scripts included AND service restart procedures documented AND rollback validation steps listed'
      },
      {
        id: 'AC-22-002-3',
        scenario: 'Happy path - Configure emergency contacts',
        given: 'User is configuring deployment settings',
        when: 'User adds emergency contacts (on-call engineer, product owner, infrastructure lead) AND saves configuration',
        then: 'Contacts stored in venture metadata AND contacts included in generated runbook AND contact information visible in deployment dashboard'
      },
      {
        id: 'AC-22-002-4',
        scenario: 'Edge case - Generate runbook with incident response playbooks',
        given: 'Runbook generation includes incident templates',
        when: 'Runbook is generated',
        then: 'Incident response playbooks included for common scenarios (service down, data corruption, performance degradation) AND escalation procedures documented'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Runbook generation implemented',
      'Artifact stored in venture_artifacts',
      'Rollback procedures included',
      'Emergency contacts configurable',
      'E2E test US-D6-22-002 passing'
    ]),
    implementation_context: 'Generate runbook as Markdown or PDF artifact. Use template-based generation with venture-specific data interpolation. Store emergency contacts in venture metadata JSONB field. Follow existing artifact generation patterns.',
    architecture_references: JSON.stringify({
      similar_artifacts: [
        'UAT report generation (Stage 21)',
        'Business plan generation (Stage 1)'
      ],
      patterns_to_follow: [
        'Template-based artifact generation',
        'venture_artifacts table usage',
        'Metadata storage in JSONB'
      ],
      integration_points: [
        'venture_artifacts table',
        'ventures table (metadata field)',
        'Template rendering service'
      ]
    }),
    example_code_patterns: JSON.stringify({
      runbook_generation: `
const runbookContent = {
  deployment_steps: [...],
  rollback_procedures: [...],
  emergency_contacts: venture.metadata.emergency_contacts || [],
  incident_playbooks: [
    { scenario: 'Service Down', steps: [...] },
    { scenario: 'Data Corruption', steps: [...] }
  ]
};

await supabase.from('venture_artifacts').insert({
  venture_id: ventureId,
  artifact_type: 'deployment_runbook',
  content: runbookContent
});
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-22-002-runbook-generation.spec.ts',
      test_cases: [
        { id: 'TC-22-002-1', scenario: 'Generate runbook with all sections', priority: 'P0' },
        { id: 'TC-22-002-2', scenario: 'Configure emergency contacts', priority: 'P1' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-022003',
    title: 'Infrastructure Provisioning Configuration',
    user_role: 'DevOps Engineer',
    user_want: 'configure monitoring, alerting, and auto-scaling rules for venture deployment',
    user_benefit: 'I can ensure proper infrastructure monitoring and automatic scaling without manual configuration',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-22-003-1',
        scenario: 'Happy path - Configure monitoring',
        given: 'User is on Infrastructure Configuration page',
        when: 'User configures monitoring for CPU, memory, response time AND sets thresholds AND saves configuration',
        then: 'Monitoring config stored AND monitoring dashboard shows configured metrics AND alerts ready to trigger'
      },
      {
        id: 'AC-22-003-2',
        scenario: 'Happy path - Configure alert thresholds',
        given: 'Monitoring is configured',
        when: 'User sets alert thresholds (CPU > 80%, response time > 2s) AND specifies notification channels (email, Slack) AND saves',
        then: 'Alert rules created AND notifications configured AND test alert can be triggered AND alert status visible in dashboard'
      },
      {
        id: 'AC-22-003-3',
        scenario: 'Happy path - Configure auto-scaling',
        given: 'User wants automatic scaling',
        when: 'User enables auto-scaling AND sets min instances = 2, max = 10 AND sets scale-up trigger (CPU > 70%) AND sets scale-down trigger (CPU < 30%) AND saves',
        then: 'Auto-scaling rules configured AND scaling events logged AND infrastructure dashboard shows scaling status'
      },
      {
        id: 'AC-22-003-4',
        scenario: 'Edge case - Infrastructure health dashboard',
        given: 'Infrastructure is provisioned AND monitoring active',
        when: 'User views infrastructure health dashboard',
        then: 'Current resource utilization shown (CPU, memory, network) AND alert status displayed AND scaling history visible AND cost estimate provided'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Infrastructure config UI implemented',
      'Monitoring configuration working',
      'Alert threshold configuration functional',
      'Auto-scaling rules configurable',
      'E2E test US-D6-22-003 passing'
    ]),
    implementation_context: 'Store infrastructure config in venture metadata or venture_stage_work. Integrate with existing monitoring tools (Prometheus, Datadog, etc.). Use infrastructure-as-code principles for provisioning. Dashboard should query infrastructure APIs for real-time status.',
    architecture_references: JSON.stringify({
      infrastructure_tools: [
        'Monitoring service (Prometheus/Datadog)',
        'Auto-scaling service (Kubernetes HPA/AWS Auto Scaling)',
        'Alert notification service'
      ],
      patterns_to_follow: [
        'Infrastructure-as-code configuration',
        'Real-time infrastructure monitoring',
        'Alert rule management'
      ],
      integration_points: [
        'ventures table metadata',
        'Monitoring service API',
        'Infrastructure provisioning API'
      ]
    }),
    example_code_patterns: JSON.stringify({
      infrastructure_config: `
const infraConfig = {
  monitoring: {
    metrics: ['cpu', 'memory', 'response_time'],
    thresholds: { cpu: 80, memory: 85, response_time: 2000 }
  },
  alerting: {
    channels: ['email', 'slack'],
    rules: [
      { metric: 'cpu', threshold: 80, action: 'notify' }
    ]
  },
  autoscaling: {
    enabled: true,
    min_instances: 2,
    max_instances: 10,
    scale_up_trigger: { metric: 'cpu', threshold: 70 },
    scale_down_trigger: { metric: 'cpu', threshold: 30 }
  }
};

await supabase.from('ventures').update({
  metadata: { ...venture.metadata, infrastructure: infraConfig }
}).eq('id', ventureId);
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-22-003-infrastructure-config.spec.ts',
      test_cases: [
        { id: 'TC-22-003-1', scenario: 'Configure monitoring and alerts', priority: 'P0' },
        { id: 'TC-22-003-2', scenario: 'Configure auto-scaling rules', priority: 'P1' }
      ]
    })
  }
];
