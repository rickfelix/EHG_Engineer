import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parent SD Data
const parentSdData = {
  id: 'SD-AUTO-COMPLIANCE-ENGINE-001',
  sd_key: 'SD-AUTO-COMPLIANCE-ENGINE-001',
  title: 'Continuous Self-Governance & Agent Compliance Engine + Agent Mgmt UI',
  priority: 'high',
  category: 'governance_automation',
  sd_type: 'infrastructure',
  current_phase: 'LEAD',
  status: 'draft',  // LEO LEAD phase uses 'draft' status per schema constraint
  description: 'Build a Continuous Compliance Engine (CCE) running under EHG_Engineer governance control that continuously verifies CrewAI compliance and database invariants for all stages (1-40) in the EHG app environment without moving governance state into the app. Emits normalized compliance events and exposes read-only REST/edge endpoints for EHG app consumption.',
  rationale: 'Stage 5 review identified L2/L16 compliance gaps that required manual intervention. Governance boundary verification (Stage 5 report) confirmed proper separation but highlighted need for continuous automated compliance checking. CCE automates policy verification across all 40 stages, preventing governance drift and ensuring CrewAI Mandatory (L2) compliance without coupling governance logic into application runtime.',
  scope: 'Governance-side: Policy registry (LEO rules → JSONB), compliance check runner (cron/GitHub Actions), database verification module (L11/L15/L16 patterns), CrewAI registry verifier, event publisher, audit ledger (compliance_checks, compliance_findings, compliance_snapshots). App-side delivery via child SDs: UI Compliance tab in /agent-management (read-only API consumer), background job wiring (daily cron GitHub Action).',
  strategic_objectives: [
    { objective: 'Policy Registry seeded with L1-L16 rules', metric: 'governance_policies table contains 10+ active policies with JSONB specs' },
    { objective: 'Database verification proves L16 compliance', metric: 'CCE verifies recursion_events, crewai_* tables in EHG app DB using correct connection' },
    { objective: 'CrewAI Mandatory Gate operational', metric: 'For each Stage N, at least one required agent or documented exception exists' },
    { objective: 'Compliance snapshots generated', metric: 'compliance_snapshots rows produced with criticalPass and overallPass rates' },
    { objective: 'Read-only API functional', metric: 'GET /api/compliance/summary returns rolled-up lesson status per stage' },
    { objective: 'Child SDs deliver app-side features', metric: 'SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001 and SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001 reach EXEC phase' },
    { objective: 'Boundary integrity maintained', metric: 'Zero governance tables created in EHG app DB; only reads/writes via approved endpoints' }
  ],
  success_criteria: [
    { criterion: 'Policy Registry operational', measure: 'governance_policies seeded with L1,L2,L3,L4,L7,L8,L11,L14,L15,L16 rules in JSONB format' },
    { criterion: 'DB Verification applies L16', measure: 'CCE verifies app tables with correct connection; includes failing-conn test that is corrected' },
    { criterion: 'CrewAI Mandatory Gate', measure: 'Missing agents → compliance_findings.FAIL with evidence; Stage 5 FinancialAnalystAgent detected' },
    { criterion: 'Compliance Snapshot', measure: 'compliance_snapshots row with criticalPass/overallPass; thresholds configurable' },
    { criterion: 'API Authentication', measure: 'Read APIs use service key/signed JWT; governance tables protected by RLS policies' },
    { criterion: 'Feature Flags', measure: 'feature.complianceEngine=true (governance); app UI gated by feature.agentMgmt.complianceTab' },
    { criterion: 'Documentation complete', measure: '70_governance_and_audit.md explains boundary separation and read-only consumption' },
    { criterion: 'Zero cross-contamination', measure: 'No governance tables in EHG app DB; verified via boundary check protocol' }
  ],
  dependencies: [
    { dependency: 'EHG_Engineer governance DB (dedlbzhpgkmetvhbkyzq)', type: 'technical', status: 'complete' },
    { dependency: 'EHG app DB connection config (EHG_POOLER_URL)', type: 'technical', status: 'pending_config' },
    { dependency: 'Stage 5 compliance report and boundary verification', type: 'governance', status: 'complete' },
    { dependency: 'Universal Lessons Framework v1.1 (L1-L16)', type: 'governance', status: 'complete' },
    { dependency: 'CrewAI Compliance Policy v1.0', type: 'governance', status: 'complete' }
  ],
  risks: [
    { risk: 'EHG app DB credentials not configured in EHG_Engineer environment', severity: 'high', mitigation: 'Document EHG_POOLER_URL setup in PRD; add to .env.example' },
    { risk: 'API auth complexity may delay child SD delivery', severity: 'medium', mitigation: 'Start with service-key-only auth; iterate to JWT in Phase C' },
    { risk: 'Compliance checks may trigger false positives initially', severity: 'medium', mitigation: 'Implement dry-run mode first; human review before auto-remediation' },
    { risk: 'Cross-repo boundary violations during implementation', severity: 'low', mitigation: 'Apply Stage 5 boundary verification protocol post-merge' }
  ],
  metadata: {
    program: 'LEO v4.3.0',
    scope_level: 'cross-stage (N=1..40)',
    boundary: {
      governance_repo: 'EHG_Engineer',
      app_repo: 'EHG'
    },
    lessons_applied: ['L1', 'L2', 'L3', 'L4', 'L7', 'L8', 'L11', 'L14', 'L15', 'L16'],
    crewai_policy: 'mandatory',
    spawns_children: true,
    children_planned: [
      'SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001',
      'SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001'
    ],
    telemetry: {
      topics: ['compliance.check', 'compliance.drift', 'agent.health']
    },
    prd_directory: '/docs/strategic_directives/SD-AUTO-COMPLIANCE-ENGINE-001/prd/',
    estimated_effort_hours: 40,
    target_completion: '2025-12-01',
    blocking_items: ['EHG_POOLER_URL configuration'],
    acceptance_criteria_count: 8,
    test_coverage_target: 25
  }
};

console.log('Creating Parent Strategic Directive: SD-AUTO-COMPLIANCE-ENGINE-001');
console.log('═══════════════════════════════════════════════════════════════\n');

const { data: parentData, error: parentError } = await supabase
  .from('strategic_directives_v2')
  .insert([parentSdData])
  .select();

if (parentError) {
  console.error('❌ Failed to insert parent SD:', parentError.message);
  process.exit(1);
}

console.log('✅ Parent SD created successfully');
console.log('ID:', parentData[0].id);
console.log('UUID:', parentData[0].uuid);
console.log('Status:', parentData[0].status);
console.log('Phase:', parentData[0].current_phase);
console.log('\n═══════════════════════════════════════════════════════════════\n');

// Child SD 1: UI
const childUiSdData = {
  id: 'SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001',
  sd_key: 'SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001',
  title: 'Agent Management — Compliance Tab (read-only, powered by CCE)',
  priority: 'high',
  category: 'ui',
  sd_type: 'feature',
  current_phase: 'LEAD',
  status: 'draft',  // LEO LEAD phase uses 'draft' status per schema constraint
  description: 'New Compliance tab under /agent-management page in EHG app. Read-only UI consuming CCE API endpoints from EHG_Engineer. Displays summary cards (Critical %, Overall %, Last Check time), agent table with CrewAI registration status, findings links, and optional "Run Check" button.',
  rationale: 'Provides user-facing visibility into continuous compliance status without embedding governance logic in application code. Maintains governance boundary separation (L16 pattern) while enabling operational transparency.',
  scope: 'UI components only in EHG repo: ComplianceTab.tsx, ComplianceSummaryCards.tsx, AgentRegistrationTable.tsx, API client hooks (useComplianceSummary, useAgentStatus). Consumes GET /api/compliance/summary and GET /api/compliance/agent/:agentKey from EHG_Engineer CCE.',
  strategic_objectives: [
    { objective: 'Compliance tab renders with live data', metric: 'UI displays real-time data from EHG_Engineer CCE API' },
    { objective: 'Zero direct governance DB access', metric: 'No imports of EHG_Engineer connection modules; API-only consumption' },
    { objective: 'Feature flag controlled rollout', metric: 'Gated by feature.agentMgmt.complianceTab flag' }
  ],
  success_criteria: [
    { criterion: 'Summary cards display', measure: 'Critical %, Overall %, Last Check time rendered from API' },
    { criterion: 'Agent table populated', measure: 'Table shows agents with CrewAI registration status, last check timestamp, findings link' },
    { criterion: 'Run Check button functional', measure: 'POST /api/compliance/check triggers on-demand check (optional, gated)' },
    { criterion: 'API-only consumption', measure: 'Zero direct DB queries; all data via CCE endpoints' },
    { criterion: 'E2E tests pass', measure: '5+ E2E scenarios covering summary load, table rendering, mocked API responses' }
  ],
  dependencies: [
    { dependency: 'SD-AUTO-COMPLIANCE-ENGINE-001 (parent)', type: 'technical', status: 'in_progress' },
    { dependency: 'CCE API endpoints operational', type: 'technical', status: 'pending' },
    { dependency: 'Feature flag infrastructure in EHG app', type: 'technical', status: 'complete' }
  ],
  risks: [
    { risk: 'API latency may affect UI responsiveness', severity: 'medium', mitigation: 'Implement client-side caching with stale-while-revalidate pattern' },
    { risk: 'Auth token management complexity', severity: 'low', mitigation: 'Use existing Supabase session tokens; no new auth system required' }
  ],
  metadata: {
    parent: 'SD-AUTO-COMPLIANCE-ENGINE-001',
    target_repo: 'EHG',
    lessons_applied: ['L8', 'L16'],
    estimated_effort_hours: 8,
    prd_directory: '/docs/strategic_directives/SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001/prd/',
    target_components: [
      '/mnt/c/_EHG/ehg/src/components/agent-management/ComplianceTab.tsx',
      '/mnt/c/_EHG/ehg/src/components/agent-management/ComplianceSummaryCards.tsx',
      '/mnt/c/_EHG/ehg/src/components/agent-management/AgentRegistrationTable.tsx',
      '/mnt/c/_EHG/ehg/src/hooks/useComplianceSummary.ts'
    ],
    acceptance_criteria_count: 5,
    test_coverage_target: 10
  }
};

console.log('Creating Child SD 1: SD-AUTO-COMPLIANCE-AGENT-REGISTRY-UI-001');

const { data: childUiData, error: childUiError } = await supabase
  .from('strategic_directives_v2')
  .insert([childUiSdData])
  .select();

if (childUiError) {
  console.error('❌ Failed to insert child UI SD:', childUiError.message);
  process.exit(1);
}

console.log('✅ Child UI SD created successfully');
console.log('ID:', childUiData[0].id);
console.log('UUID:', childUiData[0].uuid);
console.log('\n═══════════════════════════════════════════════════════════════\n');

// Child SD 2: Jobs
const childJobsSdData = {
  id: 'SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001',
  sd_key: 'SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001',
  title: 'Compliance Trigger Hooks & On-Demand Check',
  priority: 'high',
  category: 'automation',
  sd_type: 'infrastructure',
  current_phase: 'LEAD',
  status: 'draft',  // LEO LEAD phase uses 'draft' status per schema constraint
  description: 'Minimal GitHub Action / serverless function in EHG repo to call CCE POST /api/compliance/check endpoint after deploys or on nightly schedule. Enables continuous compliance verification without embedding governance logic in application runtime.',
  rationale: 'Automates compliance verification triggers from EHG app deployment lifecycle while maintaining governance boundary. Ensures CCE runs compliance checks after code changes that might affect agent registration or database schemas.',
  scope: 'GitHub Actions workflow in EHG repo (.github/workflows/compliance-check.yml), scheduled cron trigger (nightly), on-demand workflow_dispatch trigger, rate-limiting (max 10 checks/hour), authentication via service key.',
  strategic_objectives: [
    { objective: 'Nightly compliance checks operational', metric: 'GitHub Action runs nightly at 02:00 UTC' },
    { objective: 'Post-deploy triggers configured', metric: 'Compliance check runs after successful EHG app deployments' },
    { objective: 'Rate limiting prevents abuse', metric: 'Max 10 compliance checks/hour enforced via API' }
  ],
  success_criteria: [
    { criterion: 'GitHub Action succeeds', measure: 'Workflow completes successfully; POST /api/compliance/check returns 200' },
    { criterion: 'Events visible in governance DB', measure: 'compliance_checks table shows entries with triggered_by="cron" or "deploy"' },
    { criterion: 'Rate limiting enforced', measure: 'API returns 429 Too Many Requests after threshold exceeded' },
    { criterion: 'Auth secure', measure: 'Service key stored in GitHub Secrets; never committed to repo' },
    { criterion: 'Failure notifications', measure: 'Slack/email alert sent on compliance check failures' }
  ],
  dependencies: [
    { dependency: 'SD-AUTO-COMPLIANCE-ENGINE-001 (parent)', type: 'technical', status: 'in_progress' },
    { dependency: 'CCE POST /api/compliance/check endpoint', type: 'technical', status: 'pending' },
    { dependency: 'GitHub Actions infrastructure in EHG repo', type: 'technical', status: 'complete' }
  ],
  risks: [
    { risk: 'Service key exposure if not properly secured', severity: 'high', mitigation: 'Use GitHub Secrets; add security scanning to PR checks' },
    { risk: 'Excessive checks may overload CCE', severity: 'medium', mitigation: 'Implement rate limiting at API level with 10 checks/hour cap' }
  ],
  metadata: {
    parent: 'SD-AUTO-COMPLIANCE-ENGINE-001',
    target_repo: 'EHG',
    lessons_applied: ['L11', 'L16'],
    estimated_effort_hours: 4,
    prd_directory: '/docs/strategic_directives/SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001/prd/',
    target_files: [
      '/mnt/c/_EHG/ehg/.github/workflows/compliance-check.yml'
    ],
    acceptance_criteria_count: 5,
    test_coverage_target: 3
  }
};

console.log('Creating Child SD 2: SD-AUTO-COMPLIANCE-JOBS-ACTIONS-001');

const { data: childJobsData, error: childJobsError } = await supabase
  .from('strategic_directives_v2')
  .insert([childJobsSdData])
  .select();

if (childJobsError) {
  console.error('❌ Failed to insert child Jobs SD:', childJobsError.message);
  process.exit(1);
}

console.log('✅ Child Jobs SD created successfully');
console.log('ID:', childJobsData[0].id);
console.log('UUID:', childJobsData[0].uuid);
console.log('\n═══════════════════════════════════════════════════════════════\n');

console.log('SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log('✅ Parent SD:', parentData[0].id);
console.log('✅ Child SD 1 (UI):', childUiData[0].id);
console.log('✅ Child SD 2 (Jobs):', childJobsData[0].id);
console.log('\nNext Steps:');
console.log('1. Create PRD files for parent SD using add-prd-to-database.js');
console.log('2. Create PRD files for child SDs');
console.log('3. Execute LEAD→PLAN handoffs via unified-handoff-system.js');
console.log('4. Configure EHG_POOLER_URL environment variable');
console.log('═══════════════════════════════════════════════════════════════');

process.exit(0);
