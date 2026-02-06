#!/usr/bin/env node

/**
 * Create Twin-Flywheel Strategic Directives
 *
 * Creates 2 Strategic Directives for twin-flywheel architecture governance:
 * - SD-FEEDBACK-MOAT-001: Automation Feedback Loop → Data Moat
 * - SD-USA-LAYER-001: Universal Service Abstraction Layer
 *
 * Based on Strategic Imperatives Validation Analysis (2025-10-27)
 * Priority: Medium (both)
 * Category: Architecture (both)
 * Theme: twin_flywheels
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const strategicDirectives = [
  // SD 1: Automation Feedback Loop → Data Moat
  {
    id: 'SD-FEEDBACK-MOAT-001',
    sd_key: 'FEEDBACK-MOAT-001',
    title: 'Automation Feedback Loop → Data Moat',
    version: '1.0',
    status: 'draft',
    category: 'architecture',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'PLAN',
    description: 'Transform EHG\'s automation feedback mechanism into a self-reinforcing data moat by capturing structured human-in-the-loop signals for model fine-tuning. Current completion: ~70%. Remaining gaps: Supabase migration deployment, inline feedback UX, and training-data export pipeline.',
    strategic_intent: 'Create a proprietary "AI CEO MBA" dataset enabling supervised fine-tuning from real venture decisions. Operationalize the feedback loop to continuously improve automation confidence through Chairman approvals, rejections, and modifications.',
    rationale: 'The automationEngine and automation_* schema are implemented but not deployed. Feedback collection exists but lacks inline UX and JSON diff capture for edit-based approvals. No ETL pipeline to transform feedback into training pairs. Closing these gaps creates a defensible data moat - real venture decision patterns that competitors cannot replicate.',
    scope: 'EHG automation infrastructure: (1) Deploy automation_* tables via migration, (2) Add inline feedback controls with JSON diff capture, (3) Build ETL script for [prompt → completion] export, (4) Define and track feedback KPIs.',
    strategic_objectives: [
      'Deploy Supabase migration for automation_rules, automation_feedback, automation_history, automation_patterns, automation_learning_queue tables',
      'Implement inline Approve/Reject/Modify controls at decision points (venture cards, stage gates)',
      'Add JSON diff capture for MODIFY events to capture field-level edits as implicit feedback',
      'Build ETL script to export [prompt → completion] training pairs with model_version_hash for fine-tuning',
      'Define and track 3 KPIs: Feedback Density (signals per venture), Correction-to-Approval Ratio, Learning Velocity (confidence delta per 10 feedbacks)',
      'Add real-time confidence meters to venture cards (color-coded: red <60%, yellow 60-85%, green 85%+)'
    ],
    success_criteria: [
      'All automation_* tables deployed with RLS policies active',
      'Chairman can approve/reject/modify automation recommendations in <3 clicks',
      'JSON diff captured for 100% of MODIFY events',
      'ETL script exports training pairs in JSONL format compatible with OpenAI/Anthropic fine-tuning APIs',
      'Feedback Density ≥2 signals per venture (average across portfolio)',
      'Learning Velocity shows confidence increases of +5-10% after 10 agree feedbacks',
      'Confidence meters visible on all venture cards without performance degradation'
    ],
    key_changes: [
      'Create migration: /ehg/supabase/migrations/YYYYMMDD_deploy_automation_learning_schema.sql (from /database/schema/automation_learning_schema.sql)',
      'Extend VentureCard component: add inline feedback buttons (Approve/Reject/Modify)',
      'Extend AutomationInsightsPanel: add JSON diff capture logic for MODIFY workflow',
      'Create scripts/export-automation-training-data.js: ETL for [prompt → completion] pairs',
      'Add automation_feedback.payload_diff column (JSONB)',
      'Add automation_rules.model_version_hash column (VARCHAR)',
      'Create ConfidenceMeterBadge component for visual confidence display'
    ],
    key_principles: [
      'Database-first: All feedback in automation_feedback table, no local storage',
      'Non-blocking UX: Feedback controls should not interrupt Chairman workflow',
      'Privacy-first: No PII in training exports, only metadata and decisions',
      'Versioning: Track model_version_hash to correlate feedback with training iterations',
      'Incremental deployment: Deploy migration → UX → ETL in sequence'
    ],
    metadata: {
      theme: 'twin_flywheels',
      confidence_gate: 85,
      owner: 'EVA',
      completion_level: 70,
      architecture_type: 'data_moat',
      kpis: [
        { name: 'Feedback Density', target: '≥2 signals/venture', current: 'TBD' },
        { name: 'Correction-to-Approval Ratio', target: '≤0.15', current: 'TBD' },
        { name: 'Learning Velocity', target: '+5-10% per 10 feedbacks', current: 'TBD' }
      ],
      estimated_effort: {
        migration_pr: '<1 day',
        inline_ux_pr: '1 day',
        etl_pr: '1 day',
        total: '2-4 days (3 PRs)'
      },
      dependencies: [
        'automation_learning_schema.sql (exists in /database/schema/)',
        'automationEngine.ts (557 LOC, complete)',
        'AutomationInsightsPanel.tsx (partial implementation)'
      ],
      risks: [
        { risk: 'Migration schema drift from in-memory rules', mitigation: 'Sync schema → code before deployment' },
        { risk: 'Inline UX slows down venture cards', mitigation: 'Lazy-load feedback components' },
        { risk: 'ETL exports PII accidentally', mitigation: 'Whitelist-only field extraction' }
      ]
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // SD 2: Universal Service Abstraction Layer
  {
    id: 'SD-USA-LAYER-001',
    sd_key: 'USA-LAYER-001',
    title: 'Universal Service Abstraction (USA) Layer',
    version: '1.0',
    status: 'draft',
    category: 'architecture',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'LEAD',
    description: 'Expand AIServiceManager into a complete Universal Service Abstraction Layer governing all third-party integrations (LLMs, databases, VCS, APIs) to achieve vendor independence and enforce governance. Current coverage: ~30%. Ports & Adapters pattern proven in video-generation/ but not consistently used. 60% of services make direct vendor calls.',
    strategic_intent: 'Achieve a fully portable, testable, and auditable integration layer across all external dependencies under LEO governance. Create governance shield preventing vendor lock-in, enabling rapid provider swaps, and providing centralized observability.',
    rationale: 'Current architecture has exemplary abstraction (IVideoGenerationService) but it\'s isolated. AIServiceManager only abstracts LLMs, not databases/VCS/APIs. 60% of services bypass abstractions entirely (direct supabase.from() calls, fetch() to OpenAI). No mock adapters or dependency injection for testing. This creates vendor lock-in, makes provider swaps risky, and prevents local simulation.',
    scope: 'EHG integration architecture: (1) Define core port interfaces (IDatabaseService, IVCSService, ILLMService), (2) Implement production adapters (Supabase, GitHub, OpenAI, Claude), (3) Refactor AIServiceManager → UniversalServiceManager, (4) Migrate top 10 services to use ports, (5) Add ESLint enforcement.',
    strategic_objectives: [
      'Define port interfaces: IDatabaseService (CRUD + transactions), ILLMService (generateResponse + streaming), IVCSService (commit, PR, issues)',
      'Implement adapters: SupabaseDatabaseAdapter, PostgresDatabaseAdapter (future), OpenAILLMAdapter, ClaudeLLMAdapter, GitHubVCSAdapter',
      'Refactor AIServiceManager (178 LOC) → UniversalServiceManager with facade pattern for all adapter types',
      'Migrate top 10 services from direct vendor calls to port interfaces (priority: automationEngine, evaAdvanced, customerIntelligence)',
      'Add ESLint rule to forbid direct imports from @supabase/supabase-js, openai, @octokit/* (force port usage)',
      'Create mock adapters for local testing: MockDatabaseAdapter, MockLLMAdapter, MockVCSAdapter'
    ],
    success_criteria: [
      'All 3 core port interfaces defined with TypeScript contracts',
      'All 5 production adapters implemented and unit tested',
      'UniversalServiceManager manages LLM + Database + VCS adapters from single facade',
      'Top 10 services refactored (adapter coverage ≥70%)',
      'ESLint rule active: zero direct vendor imports in new code',
      'Swap-Time-to-Parity ≤4 hours (time to replace Supabase with Postgres, or OpenAI with Claude)',
      'Governance Latency ≤50ms overhead per adapter call (measured via instrumentation)'
    ],
    key_changes: [
      'Create src/lib/ports/IDatabaseService.ts (CRUD interface)',
      'Create src/lib/ports/ILLMService.ts (generateResponse, streamResponse)',
      'Create src/lib/ports/IVCSService.ts (commit, createPR, listIssues)',
      'Create src/lib/adapters/SupabaseDatabaseAdapter.ts implementing IDatabaseService',
      'Create src/lib/adapters/OpenAILLMAdapter.ts implementing ILLMService',
      'Create src/lib/adapters/ClaudeLLMAdapter.ts implementing ILLMService',
      'Create src/lib/adapters/GitHubVCSAdapter.ts implementing IVCSService',
      'Refactor src/lib/ai/ai-service-manager.ts → universal-service-manager.ts',
      'Create .eslintrc override: no-restricted-imports for vendor SDKs',
      'Create src/lib/adapters/mocks/ directory with MockDatabaseAdapter, MockLLMAdapter'
    ],
    key_principles: [
      'Ports over implementations: Services depend on interfaces, not concrete adapters',
      'Dependency injection: Adapters injected via constructor, not hardcoded',
      'Fail-fast validation: Adapters validate inputs before vendor calls',
      'Observability-first: All adapter calls instrumented with metrics (latency, errors, retries)',
      'Backward compatibility: Refactor incrementally, maintain parallel paths during migration'
    ],
    metadata: {
      theme: 'twin_flywheels',
      confidence_gate: 85,
      owner: 'EVA',
      completion_level: 30,
      architecture_type: 'governance_shield',
      adapter_coverage: 40, // percent of services using abstraction
      kpis: [
        { name: 'Adapter Coverage %', target: '≥70%', current: '40%' },
        { name: 'Swap-Time-to-Parity', target: '≤4 hours', current: 'Unknown (no swaps attempted)' },
        { name: 'Governance Latency', target: '≤50ms per call', current: 'TBD (instrumentation needed)' }
      ],
      estimated_effort: {
        phase_a_ports: '3 days (2 PRs)',
        phase_b_adapters: '5 days (3 PRs)',
        phase_c_migrations: '1 week (3 PRs)',
        total: '2-3 weeks (8 PRs)'
      },
      dependencies: [
        'IVideoGenerationService.ts (gold standard example)',
        'AIServiceManager.ts (178 LOC, LLM-only abstraction)',
        'Direct vendor calls in 19 services (automation, eva, intelligence)'
      ],
      risks: [
        { risk: 'Adapter overhead adds latency', mitigation: 'Profile before/after, optimize hot paths' },
        { risk: 'Services resist refactoring', mitigation: 'Start with services already using interfaces' },
        { risk: 'ESLint rule breaks existing code', mitigation: 'Add rule as warning first, then error after migrations' }
      ],
      phased_rollout: [
        'Phase A (Week 1): Define 3 port interfaces, validate with team',
        'Phase B (Week 2): Implement 5 production adapters with unit tests',
        'Phase C (Week 3): Refactor top 10 services, add ESLint enforcement'
      ]
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function createDirectives() {
  console.log('📋 Creating Twin-Flywheel Strategic Directives...\n');

  const results = {
    directives: [],
    prds: [],
    errors: []
  };

  for (const directive of strategicDirectives) {
    console.log(`\n🎯 Creating ${directive.id}...`);

    try {
      // Insert Strategic Directive
      const { data: sdData, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .insert(directive)
        .select()
        .single();

      if (sdError) {
        console.error(`❌ Error creating ${directive.id}:`, sdError.message);
        results.errors.push({ id: directive.id, error: sdError.message });
        continue;
      }

      console.log(`✅ Created SD: ${sdData.id} (uuid: ${sdData.uuid_id})`);
      results.directives.push(sdData);

      // Create linked PRD
      const prdId = `PRD-${directive.id}`;
      const prdTitle = `Product Requirements: ${directive.title}`;

      const prdData = {
        id: prdId,
        directive_id: directive.id,
        sd_uuid: sdData.uuid_id,
        title: prdTitle,
        status: 'planning',
        category: 'architecture',
        priority: 'medium',
        executive_summary: directive.description,
        phase: directive.current_phase.toLowerCase(),
        created_by: 'PLAN',
        plan_checklist: [
          { text: 'PRD created and linked to SD', checked: true },
          { text: 'Strategic objectives mapped to technical specs', checked: false },
          { text: 'Port/adapter interfaces designed', checked: false },
          { text: 'Implementation approach documented', checked: false },
          { text: 'Test scenarios defined', checked: false },
          { text: 'Acceptance criteria established', checked: false },
          { text: 'Risk mitigation strategies documented', checked: false },
          { text: 'Timeline and milestones set', checked: false }
        ],
        exec_checklist: [
          { text: 'Development environment setup', checked: false },
          { text: 'Core functionality implemented', checked: false },
          { text: 'Unit tests written (≥80% coverage)', checked: false },
          { text: 'E2E tests completed', checked: false },
          { text: 'Code review completed', checked: false },
          { text: 'Documentation updated', checked: false }
        ],
        validation_checklist: [
          { text: 'All acceptance criteria met', checked: false },
          { text: 'Performance benchmarks validated', checked: false },
          { text: 'Security review completed', checked: false },
          { text: 'Architecture review passed', checked: false },
          { text: 'Deployment readiness confirmed', checked: false }
        ],
        acceptance_criteria: directive.success_criteria,
        functional_requirements: directive.strategic_objectives.map((obj, idx) => ({
          id: `FR-${idx + 1}`,
          requirement: obj,
          priority: idx < 3 ? 'HIGH' : 'MEDIUM'
        })),
        test_scenarios: [
          {
            id: 'TS-1',
            scenario: directive.id.includes('FEEDBACK')
              ? 'Verify automation_feedback table captures approve/reject/modify signals'
              : 'Verify services can swap adapters without code changes',
            test_type: 'integration'
          },
          {
            id: 'TS-2',
            scenario: directive.id.includes('FEEDBACK')
              ? 'Verify ETL exports training pairs in correct JSONL format'
              : 'Verify mock adapters work in test environment',
            test_type: 'unit'
          },
          {
            id: 'TS-3',
            scenario: directive.id.includes('FEEDBACK')
              ? 'Verify confidence meters render without performance degradation'
              : 'Verify ESLint rule prevents direct vendor imports',
            test_type: 'e2e'
          }
        ],
        metadata: {
          ...directive.metadata,
          linked_sd_id: directive.id,
          linked_sd_uuid: sdData.uuid_id
        },
        progress: 10,
        content: `# Product Requirements Document

## Strategic Directive
${directive.id}: ${directive.title}

## Executive Summary
${directive.description}

## Strategic Intent
${directive.strategic_intent}

## Rationale
${directive.rationale}

## Scope
${directive.scope}

## Strategic Objectives
${directive.strategic_objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

## Success Criteria
${directive.success_criteria.map((crit, i) => `${i + 1}. ${crit}`).join('\n')}

## Key Changes
${(Array.isArray(directive.key_changes) ? directive.key_changes : []).map((change, i) => `${i + 1}. ${change}`).join('\n')}

## Key Principles
${directive.key_principles.map((prin, i) => `${i + 1}. ${prin}`).join('\n')}

## KPIs
${directive.metadata.kpis.map(kpi => `- **${kpi.name}**: Target ${kpi.target}, Current ${kpi.current}`).join('\n')}

## Estimated Effort
${Object.entries(directive.metadata.estimated_effort).map(([phase, effort]) => `- **${phase}**: ${effort}`).join('\n')}

## Risks & Mitigation
${directive.metadata.risks.map(r => `- **Risk**: ${r.risk}\n  **Mitigation**: ${r.mitigation}`).join('\n')}

---
*Generated: ${new Date().toISOString()}*
*Phase: ${directive.current_phase}*
*Priority: ${directive.priority.toUpperCase()}*
*Theme: twin_flywheels*
`
      };

      const { data: prdInserted, error: prdError } = await supabase
        .from('product_requirements_v2')
        .insert(prdData)
        .select()
        .single();

      if (prdError) {
        console.error(`❌ Error creating PRD for ${directive.id}:`, prdError.message);
        results.errors.push({ id: prdId, error: prdError.message });
        continue;
      }

      console.log(`✅ Created PRD: ${prdInserted.id}`);
      results.prds.push(prdInserted);

    } catch (error) {
      console.error(`❌ Unexpected error for ${directive.id}:`, error.message);
      results.errors.push({ id: directive.id, error: error.message });
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY\n' + '='.repeat(60));
  console.log(`\n✅ Directives Created: ${results.directives.length}`);
  results.directives.forEach(d => {
    console.log(`   - ${d.id} (${d.title})`);
    console.log(`     UUID: ${d.uuid_id}`);
    console.log(`     Priority: ${d.priority.toUpperCase()}`);
    console.log(`     Category: ${d.category}`);
    console.log(`     Phase: ${d.current_phase}`);
  });

  console.log(`\n✅ PRDs Created: ${results.prds.length}`);
  results.prds.forEach(p => {
    console.log(`   - ${p.id} (${p.title})`);
    console.log(`     Linked to: ${p.directive_id}`);
    console.log(`     Status: ${p.status}`);
    console.log(`     Progress: ${p.progress}%`);
  });

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors: ${results.errors.length}`);
    results.errors.forEach(e => {
      console.log(`   - ${e.id}: ${e.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Twin-Flywheel directives creation complete!\n');
  console.log('📋 Tag Assignment Confirmation:');
  console.log('   - theme: twin_flywheels ✅');
  console.log('   - confidence_gate: 85 ✅');
  console.log('   - owner: EVA ✅');
  console.log('   - category: architecture ✅');
  console.log('   - priority: medium ✅');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Review SDs in EHG_Engineer dashboard');
  console.log('   2. Trigger PLAN phase for PRD enrichment');
  console.log('   3. Begin LEAD pre-approval validation');
}

createDirectives().catch(console.error);
