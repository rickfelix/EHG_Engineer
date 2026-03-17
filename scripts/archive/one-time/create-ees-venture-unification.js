#!/usr/bin/env node

/**
 * Create Epic Execution Sequences for SD-VENTURE-UNIFICATION-001
 * Per LEO Protocol v4.2.0 - 5 implementation phases
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createEpicExecutionSequences() {
  console.log('📋 Creating Epic Execution Sequences for SD-VENTURE-UNIFICATION-001...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Epic Execution Sequences (5 phases)
  const sequences = [
    {
      id: 'EES-VENTURE-UNIF-001-P1',
      directive_id: 'SD-VENTURE-UNIFICATION-001',
      title: 'Phase 1: Database Consolidation & Wizard Bridge',
      description: `Consolidate ideas and ventures tables, create wizard→workflow bridge.

KEY DELIVERABLES:
- ventures table schema updates (workflow_started_at, recursion_state, etc.)
- ideas → ventures.metadata migration script with zero data loss validation
- VentureCreationPage.tsx modification: redirect to /ventures/{id}/workflow?start=4
- CompleteWorkflowOrchestrator.tsx: register route, accept start parameter
- Backward compatibility: grandfather existing ventures
- Migration rollback plan

CRITICAL NUANCES:
✓ Zero data loss (SC-006) - row count match, JSON schema validation
✓ Grandfathered ventures (SC-009) - no breaking changes to existing data
✓ Auto-launch at Stage 4 (SC-001) - seamless wizard→workflow transition`,
      sequence_number: 1,
      status: 'planned',
      phase: 'Database + Integration',
      phase_description: 'Foundation work to unify the two parallel systems',
      planned_start: null,
      planned_end: null,
      timeline_notes: '1 week, ~12-16 hours',
      progress: 0,
      deliverables: [
        { name: 'ventures table schema updates', type: 'migration', required: true },
        { name: 'ideas→ventures migration script', type: 'migration', required: true },
        { name: 'VentureCreationPage.tsx bridge', type: 'code', required: true },
        { name: 'CompleteWorkflowOrchestrator route', type: 'code', required: true },
        { name: 'Migration validation tests', type: 'test', required: true },
        { name: 'Rollback procedure', type: 'documentation', required: true }
      ],
      dependencies: [
        { id: 'DEP-001', description: 'Database backup before migration', type: 'prerequisite' },
        { id: 'DEP-002', description: 'Chairman approval for schema changes', type: 'approval' }
      ],
      blockers: [],
      metadata: {
        risks: [
          { id: 'RISK-P1-001', description: 'Data loss during migration', severity: 'HIGH', mitigation: 'Comprehensive validation, row-by-row verification' },
          { id: 'RISK-P1-002', description: 'Breaking changes to existing ventures', severity: 'HIGH', mitigation: 'Grandfathering strategy, backward compat tests' }
        ]
      }
    },
    {
      id: 'EES-VENTURE-UNIF-001-P2',
      directive_id: 'SD-VENTURE-UNIFICATION-001',
      title: 'Phase 2: Recursion Engine Core',
      description: `Build smart recursion engine with dependency-driven trigger detection.

KEY DELIVERABLES:
- recursionEngine.ts service (20-25 dependency scenarios)
- recursion_events table schema and migration
- Threshold system (CRITICAL auto-execute, HIGH needs approval, MEDIUM, LOW)
- Loop prevention logic (max 3 recursions/stage → Chairman escalation)
- Integration with existing validationFramework.ts
- FIN-001, TECH-001, MKT-001/002, RISK-001 scenario implementations

CRITICAL NUANCES:
✓ Dependency-driven (not simple iteration) - downstream invalidates upstream
✓ 20-25 recursion scenarios (SC-008) - documented with triggers/thresholds
✓ <100ms detection (SC-007) - performance requirement for recursion logic
✓ Loop prevention (SC-005) - max 3 recursions → Chairman escalation
✓ Threshold automation - CRITICAL auto-recurse, HIGH needs Chairman approval`,
      sequence_number: 2,
      status: 'planned',
      phase: 'Recursion Engine',
      phase_description: 'Core intelligence for dependency-driven recursion',
      planned_start: null,
      planned_end: null,
      timeline_notes: '2 weeks, ~16-24 hours',
      progress: 0,
      deliverables: [
        { name: 'recursionEngine.ts service', type: 'code', required: true },
        { name: 'recursion_events table migration', type: 'migration', required: true },
        { name: 'Threshold configuration system', type: 'code', required: true },
        { name: 'Loop prevention logic', type: 'code', required: true },
        { name: '20-25 recursion scenarios', type: 'documentation', required: true },
        { name: 'Unit tests for all scenarios', type: 'test', required: true }
      ],
      dependencies: [
        { id: 'DEP-P2-001', description: 'Phase 1 completion (database consolidated)', type: 'prerequisite' },
        { id: 'DEP-P2-002', description: 'Existing validationFramework.ts', type: 'integration' },
        { id: 'DEP-P2-003', description: 'Stage dependency mapping (all 40 stages)', type: 'research' }
      ],
      blockers: [],
      metadata: {
        risks: [
          { id: 'RISK-P2-001', description: 'Infinite recursion loops', severity: 'MEDIUM', mitigation: 'Max 3 recursions/stage, escalation to Chairman' },
          { id: 'RISK-P2-002', description: 'Performance degradation', severity: 'LOW', mitigation: 'Async detection, caching, <100ms requirement' },
          { id: 'RISK-P2-003', description: 'Threshold tuning complexity', severity: 'MEDIUM', mitigation: 'Start conservative, adjust based on data' }
        ]
      }
    },
    {
      id: 'EES-VENTURE-UNIF-001-P3',
      directive_id: 'SD-VENTURE-UNIFICATION-001',
      title: 'Phase 3: Stages 1-10 Recursion Integration',
      description: `Integrate recursion detection into first 10 stages of workflow.

KEY DELIVERABLES:
- Stage1-Stage10 component updates (recursion triggers in onComplete)
- FIN-001 implementation in Stage5ProfitabilityForecasting
- TECH-001 implementation in Stage10TechnicalReview
- MKT-001/002 implementations in Stage6/7
- E2E tests for CRITICAL recursion paths (SC-010)
- Recursion history UI component
- Chairman approval workflow for HIGH thresholds

CRITICAL NUANCES:
✓ FIN-001: ROI <15% → recurse to Stage 3 (SC-003)
✓ TECH-001: Blocking issues → recurse to Stage 8 (SC-004)
✓ E2E test coverage (SC-010) - all CRITICAL paths must have tests
✓ Recursion history UI (SC-010) - visible timeline with explanations
✓ Chairman override capability - can approve/reject HIGH threshold triggers`,
      sequence_number: 3,
      status: 'planned',
      phase: 'Stage Integration (1-10)',
      phase_description: 'Apply recursion logic to first 10 workflow stages',
      planned_start: null,
      planned_end: null,
      timeline_notes: '4 weeks, ~40-50 hours',
      progress: 0,
      deliverables: [
        { name: 'Stage 1-10 recursion integration', type: 'code', required: true },
        { name: 'FIN-001 scenario (Stage 5)', type: 'code', required: true },
        { name: 'TECH-001 scenario (Stage 10)', type: 'code', required: true },
        { name: 'MKT-001/002 scenarios (Stage 6/7)', type: 'code', required: true },
        { name: 'Recursion history UI component', type: 'code', required: true },
        { name: 'Chairman approval workflow', type: 'code', required: true },
        { name: 'E2E tests for CRITICAL paths', type: 'test', required: true }
      ],
      dependencies: [
        { id: 'DEP-P3-001', description: 'Phase 2 completion (recursion engine ready)', type: 'prerequisite' },
        { id: 'DEP-P3-002', description: 'All 40 stage components exist', type: 'verification' },
        { id: 'DEP-P3-003', description: 'Chairman availability for approval testing', type: 'stakeholder' }
      ],
      blockers: [],
      metadata: {
        risks: [
          { id: 'RISK-P3-001', description: 'Stage component breaking changes', severity: 'MEDIUM', mitigation: 'Backward compat tests, careful onComplete integration' },
          { id: 'RISK-P3-002', description: 'Chairman overwhelm with approvals', severity: 'MEDIUM', mitigation: 'Auto-approve CRITICAL, only HIGH needs approval' },
          { id: 'RISK-P3-003', description: 'E2E test complexity', severity: 'MEDIUM', mitigation: 'Playwright best practices, automated recursion path testing' }
        ]
      }
    },
    {
      id: 'EES-VENTURE-UNIF-001-P4',
      directive_id: 'SD-VENTURE-UNIFICATION-001',
      title: 'Phase 4: Stages 11-40 Integration & Full Testing',
      description: `Extend recursion to remaining 30 stages, comprehensive testing.

KEY DELIVERABLES:
- Stage11-Stage40 recursion integration (reuse patterns from Phase 3)
- Additional recursion scenarios (RISK-001, etc.)
- Complete E2E test suite (all CRITICAL + HIGH paths)
- Performance validation (<100ms recursion detection)
- User acceptance testing (UAT) with Chairman
- Recursion analytics (optional, deferred if time-constrained)

CRITICAL NUANCES:
✓ All 40 stages accessible (SC-002) - no tier-based limits enforced
✓ Pattern reuse from Stages 1-10 - accelerated integration
✓ Complete E2E coverage - validate all recursion scenarios work end-to-end
✓ Performance gates (SC-007) - 95th percentile <100ms under load
✓ UAT validation - Chairman tests real-world scenarios`,
      sequence_number: 4,
      status: 'planned',
      phase: 'Stage Integration (11-40) + Testing',
      phase_description: 'Complete integration across all stages, full test coverage',
      planned_start: null,
      planned_end: null,
      timeline_notes: '3 weeks, ~60 hours',
      progress: 0,
      deliverables: [
        { name: 'Stage 11-40 recursion integration', type: 'code', required: true },
        { name: 'Additional recursion scenarios', type: 'code', required: true },
        { name: 'Complete E2E test suite', type: 'test', required: true },
        { name: 'Performance validation tests', type: 'test', required: true },
        { name: 'UAT test plan and execution', type: 'test', required: true },
        { name: 'Recursion analytics (optional)', type: 'code', required: false }
      ],
      dependencies: [
        { id: 'DEP-P4-001', description: 'Phase 3 completion (Stages 1-10 working)', type: 'prerequisite' },
        { id: 'DEP-P4-002', description: 'E2E test infrastructure (Playwright)', type: 'tooling' },
        { id: 'DEP-P4-003', description: 'Performance testing environment', type: 'infrastructure' }
      ],
      blockers: [],
      metadata: {
        risks: [
          { id: 'RISK-P4-001', description: 'Timeline compression (30 stages)', severity: 'LOW', mitigation: 'Pattern reuse from Phase 3, parallel implementation' },
          { id: 'RISK-P4-002', description: 'Test coverage gaps', severity: 'MEDIUM', mitigation: 'Automated E2E generation, comprehensive test plan' },
          { id: 'RISK-P4-003', description: 'Performance bottlenecks', severity: 'LOW', mitigation: 'Async processing, caching, profiling' }
        ]
      }
    },
    {
      id: 'EES-VENTURE-UNIF-001-P5',
      directive_id: 'SD-VENTURE-UNIFICATION-001',
      title: 'Phase 5: Polish, Documentation & Monitoring',
      description: `Final polish, comprehensive documentation, production monitoring.

KEY DELIVERABLES:
- User guide: Understanding recursion (why it happens, what to do)
- Technical documentation: Recursion engine architecture
- Recursion scenario reference (20-25 scenarios with examples)
- Production monitoring (recursion event tracking)
- Chairman dashboard (recursion history, approval queue)
- Retrospective: Lessons learned from unification

CRITICAL NUANCES:
✓ Documentation completeness (SC-008) - all scenarios documented
✓ User-facing guidance - explain recursion in plain language
✓ Chairman tools - easy approval workflow, clear recursion history
✓ Monitoring setup - track recursion frequency, patterns, escalations
✓ Knowledge capture - document for future similar work`,
      sequence_number: 5,
      status: 'planned',
      phase: 'Documentation + Monitoring',
      phase_description: 'Production readiness, documentation, ongoing monitoring',
      planned_start: null,
      planned_end: null,
      timeline_notes: '1 week, ~16 hours (ongoing monitoring)',
      progress: 0,
      deliverables: [
        { name: 'User guide: Recursion system', type: 'documentation', required: true },
        { name: 'Technical documentation', type: 'documentation', required: true },
        { name: 'Recursion scenario reference', type: 'documentation', required: true },
        { name: 'Production monitoring setup', type: 'code', required: true },
        { name: 'Chairman dashboard enhancements', type: 'code', required: true },
        { name: 'Retrospective document', type: 'documentation', required: true }
      ],
      dependencies: [
        { id: 'DEP-P5-001', description: 'Phase 4 completion (all stages working)', type: 'prerequisite' },
        { id: 'DEP-P5-002', description: 'Production deployment environment', type: 'infrastructure' },
        { id: 'DEP-P5-003', description: 'Monitoring tools (e.g., Sentry, LogRocket)', type: 'tooling' }
      ],
      blockers: [],
      metadata: {
        risks: [
          { id: 'RISK-P5-001', description: 'Documentation drift', severity: 'LOW', mitigation: 'Living documentation, regular updates' },
          { id: 'RISK-P5-002', description: 'Monitoring overhead', severity: 'LOW', mitigation: 'Efficient logging, sampling for high-volume events' }
        ]
      }
    }
  ];

  try {
    console.log(`📝 Inserting ${sequences.length} Epic Execution Sequences...\n`);

    for (const seq of sequences) {
      const { data: _data, error } = await supabase
        .from('execution_sequences_v2')
        .insert({
          id: seq.id,
          directive_id: seq.directive_id,
          title: seq.title,
          description: seq.description,
          sequence_number: seq.sequence_number,
          status: seq.status,
          phase: seq.phase,
          phase_description: seq.phase_description,
          planned_start: seq.planned_start,
          planned_end: seq.planned_end,
          timeline_notes: seq.timeline_notes,
          progress: seq.progress,
          deliverables: seq.deliverables,
          dependencies: seq.dependencies,
          blockers: seq.blockers,
          metadata: seq.metadata
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error inserting ${seq.id}:`, error.message);
        console.error('Details:', error);
        continue;
      }

      console.log(`✅ ${seq.id}: ${seq.title}`);
      console.log(`   Phase: ${seq.phase}`);
      console.log(`   Timeline: ${seq.timeline_notes}`);
      console.log(`   Deliverables: ${seq.deliverables.length} items`);
      console.log('');
    }

    // Verify insertion
    const { data: verifyData, error: verifyError } = await supabase
      .from('execution_sequences_v2')
      .select('id, title, sequence_number, status')
      .eq('directive_id', 'SD-VENTURE-UNIFICATION-001')
      .order('sequence_number');

    if (verifyError) {
      console.error('❌ Verification error:', verifyError.message);
    } else {
      console.log('✅ All Epic Execution Sequences created successfully!\n');
      console.log('📋 Verification:');
      verifyData.forEach(seq => {
        console.log(`   ${seq.sequence_number}. [${seq.status}] ${seq.title}`);
      });

      console.log('\n📝 Next Steps (LEO Protocol):');
      console.log('1. Review Epic Execution Sequences in dashboard');
      console.log('2. PLAN agent creates PRD from these epics');
      console.log('3. Generate user stories from success criteria');
      console.log('4. Update SD status to "active" when Chairman approves:');
      console.log('   UPDATE strategic_directives_v2 SET status = \'active\' WHERE id = \'SD-VENTURE-UNIFICATION-001\';');
    }

  } catch (error) {
    console.error('❌ Error creating Epic Execution Sequences:', error.message);
    process.exit(1);
  }
}

createEpicExecutionSequences();
