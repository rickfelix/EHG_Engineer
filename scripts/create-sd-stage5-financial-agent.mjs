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

// Insert Strategic Directive
const sdData = {
  id: 'SD-STAGE5-FINANCIAL-AGENT-REGISTRATION-001',
  sd_key: 'SD-STAGE5-FINANCIAL-AGENT-REGISTRATION-001',
  title: 'Register FinancialAnalystAgent for Stage 5 CrewAI Compliance',
  priority: 'high',
  category: 'crewai',
  sd_type: 'infrastructure',  // CrewAI agent registration = infrastructure work
  current_phase: 'LEAD',
  status: 'draft',
  description: 'Implement and register FinancialAnalystAgent in CrewAI registry to achieve L2 (CrewAI Mandatory) compliance for Stage 5 - Profitability Forecasting. Agent will automate ROI calculation and FIN-001 recursion trigger detection per dossier prescription.',
  rationale: 'Stage 5 review identified L2 (CrewAI Mandatory) non-compliance: FinancialAnalystAgent NOT registered in crewai_agents table despite dossier prescription for AI-driven ROI calculation. Infrastructure exists (tables deployed), but 0 agents registered. Current manual calculation works but violates automation mandate.',
  scope: 'Implement FinancialAnalystAgent in agent-platform, register in crewai_agents table, integrate with Stage5ROIValidator.tsx via service layer, add failure fallback, implement test coverage (unit + integration + E2E), update Stage 5 review documentation to reflect compliance.',
  strategic_objectives: [
    { objective: 'Create FinancialAnalystAgent in agent-platform', metric: 'Agent file exists at /mnt/c/_EHG/ehg/agent-platform/app/agents/financial_analyst.py' },
    { objective: 'Register agent in CrewAI registry', metric: 'SELECT COUNT(*) FROM crewai_agents WHERE name=\'FinancialAnalystAgent\' returns 1' },
    { objective: 'Service layer integration', metric: 'financialAnalystService.ts exists and routes to agent' },
    { objective: 'UI integration', metric: 'Stage5ROIValidator.tsx invokes agent via service layer' },
    { objective: 'Test coverage complete', metric: 'Unit (3) + Integration (5) + E2E (8) tests passing' },
    { objective: 'Failure fallback implemented', metric: 'Banner shows on agent failure, logs to recursion_events' },
    { objective: 'Documentation updated', metric: 'All 4 Stage 5 review docs updated with agent evidence' }
  ],
  success_criteria: [
    { criterion: 'Agent registered', measure: 'crewai_agents table contains FinancialAnalystAgent record' },
    { criterion: 'Service integration', measure: 'financialAnalystService.ts routes finance session types to agent' },
    { criterion: 'UI invocation', measure: 'Stage5ROIValidator.tsx uses service layer, no direct OpenAI calls' },
    { criterion: 'Results persistence', measure: 'venture_drafts.research_results JSONB contains agent output with version tag' },
    { criterion: 'Failure fallback', measure: 'UI banner + recursion_events log on agent failure' },
    { criterion: 'Test coverage', measure: '16 total tests passing (3 unit + 5 integration + 8 E2E)' },
    { criterion: 'L2 compliance', measure: 'GAP-2 marked RESOLVED in Stage 5 review docs' }
  ],
  dependencies: [
    { dependency: 'Database tables deployed (recursion_events, crewai_agents, crewai_crews, crewai_tasks)', type: 'technical', status: 'complete' },
    { dependency: 'Stage5ROIValidator.tsx exists', type: 'technical', status: 'complete' },
    { dependency: 'CrewAI 1.3.0 installed in agent-platform', type: 'technical', status: 'complete' },
    { dependency: 'Stage 5 review documentation', type: 'governance', status: 'complete' }
  ],
  risks: [
    { risk: 'Agent integration may require refactoring ROI calculation logic', severity: 'low', mitigation: 'Reference existing agent patterns from Stage 2/4' },
    { risk: 'CrewAI 1.3.0 compatibility issues', severity: 'low', mitigation: 'Verify version in agent-platform venv' },
    { risk: 'E2E tests may fail initially', severity: 'medium', mitigation: 'Implement failure fallback first, then iterate on agent logic' }
  ],
  metadata: {
    source_stage: 5,
    source_stage_name: 'Stage 5 — Profitability Forecasting',
    spawned_from_review: true,
    review_date: '2025-11-07',
    review_decision_file: '/docs/workflow/stage_reviews/stage-05/04_decision_record.md',
    crewai_compliance_policy_version: 'v1.0',
    lessons_applied: ['L2', 'L8', 'L11', 'L15', 'L16'],
    gap_addressed: 'GAP-2',
    compliance_impact: 'L2_CrewAI_Mandatory',
    estimated_effort_hours: 4,
    blocking_full_approval: true,
    implementation_files: [
      '/mnt/c/_EHG/ehg/agent-platform/app/agents/financial_analyst.py',
      '/mnt/c/_EHG/ehg/src/services/crewai/financialAnalystService.ts',
      '/mnt/c/_EHG/ehg/src/components/ventures/Stage5ROIValidator.tsx',
      '/mnt/c/_EHG/ehg/tests/e2e/finance-agent-path.spec.ts'
    ],
    acceptance_criteria_count: 7,
    test_coverage_target: 16
  }
};

console.log('Creating Strategic Directive: SD-STAGE5-FINANCIAL-AGENT-REGISTRATION-001');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert([sdData])
  .select();

if (error) {
  console.error('❌ Failed to insert SD:', error.message);
  process.exit(1);
}

console.log('✅ Strategic Directive created successfully');
console.log('ID:', data[0].id);
console.log('UUID:', data[0].uuid);
console.log('Status:', data[0].status);
console.log('Phase:', data[0].current_phase);
console.log('\nNext Steps:');
console.log('1. Create PRD: node scripts/add-prd-to-database.js SD-STAGE5-FINANCIAL-AGENT-REGISTRATION-001');
console.log('2. Transition to PLAN phase via unified-handoff-system.js');
console.log('3. Implement agent in agent-platform');
console.log('4. Register agent via scan_agents_to_database.py');
console.log('5. Integrate with Stage5ROIValidator.tsx');
console.log('6. Run E2E tests and update Stage 5 review docs');

process.exit(0);
