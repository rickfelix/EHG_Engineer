#!/usr/bin/env node

/**
 * Create LEAD→PLAN Handoff for SD-VENTURE-UNIFICATION-001
 * Per LEO Protocol v4.3.0 - 8-Element Structure + Learning Context
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createHandoff() {
  console.log('📋 Creating LEAD→PLAN Handoff for SD-VENTURE-UNIFICATION-001...\n');

  const handoff = {
    sd_id: 'SD-VENTURE-UNIFICATION-001',
    from_phase: 'LEAD_APPROVAL',
    to_phase: 'PLAN_CREATION',
    status: 'completed',

    // 1. Executive Summary
    executive_summary: `LEAD Pre-Approval phase completed successfully. SD-VENTURE-UNIFICATION-001 "Unified Venture Creation System with Intelligent Dependency-Driven Recursion" has been strategically validated and approved for PLAN phase PRD creation.

**Approval Status**: ✅ APPROVED (Status: active)
**Priority**: CRITICAL
**Scope**: Unify two parallel venture creation systems (3-step wizard + 40-stage workflow) with intelligent dependency-driven recursion
**Timeline**: 11 weeks, ~144-166 hours across 5 implementation phases
**Epic Execution Sequences**: 5 phases created and validated`,

    // 2. Completeness Report
    completeness_report: {
      planned: [
        'Strategic validation of SD scope and feasibility',
        'Over-engineering assessment',
        'Epic Execution Sequences creation (5 phases)',
        'Success criteria definition (10 measurable criteria)',
        'Risk analysis (7 risks with mitigation)',
        'Dependencies identification (7 items)',
        'Stakeholder engagement planning'
      ],
      completed: [
        '✅ Strategic Directive created in strategic_directives_v2 table',
        '✅ All conversation nuances captured (12+ details preserved)',
        '✅ 5 Epic Execution Sequences inserted into execution_sequences_v2',
        '✅ 10 Success Criteria defined with measurement criteria',
        '✅ 7 Risk factors documented with mitigation strategies',
        '✅ 7 Dependencies identified and documented',
        '✅ SD status updated to "active" (Chairman approved)',
        '✅ Database-first approach validated (zero markdown files)'
      ],
      deferred: [],
      variance_explanation: 'All LEAD phase requirements completed. No scope reductions. SD approved exactly as proposed.'
    },

    // 3. Deliverables Manifest
    deliverables_manifest: {
      strategic_directive: {
        table: 'strategic_directives_v2',
        id: 'SD-VENTURE-UNIFICATION-001',
        status: 'active',
        priority: 'critical',
        success_criteria_count: 10,
        risks_count: 7,
        dependencies_count: 7
      },
      epic_execution_sequences: {
        table: 'execution_sequences_v2',
        count: 5,
        phases: [
          'Phase 1: Database Consolidation & Wizard Bridge (1 week)',
          'Phase 2: Recursion Engine Core (2 weeks)',
          'Phase 3: Stages 1-10 Recursion Integration (4 weeks)',
          'Phase 4: Stages 11-40 Integration & Testing (3 weeks)',
          'Phase 5: Polish, Documentation & Monitoring (1 week)'
        ],
        total_deliverables: 31,
        total_dependencies: 14,
        total_risks: 13
      },
      documentation: [
        'SD insertion summary at /docs/SD-VENTURE-UNIFICATION-001-insertion-summary.md',
        'Schema mapping reference at /docs/reference/strategic-directives-v2-schema-mapping.md'
      ]
    },

    // 4. Key Decisions & Rationale
    key_decisions: [
      {
        decision: 'Defer tier system enhancements to future iteration',
        rationale: 'Chairman explicitly requested: "let\'s not do anything with the tiering right now" - Focus on core unification first, add tier complexity later',
        impact: 'Reduces scope by ~20 hours, simplifies initial implementation, allows faster delivery of core value'
      },
      {
        decision: 'Wizard auto-launches at Stage 4 (not Stage 1)',
        rationale: 'Wizard already covers Stages 1-3 (Draft, AI Review, Business Model), avoid duplication by starting 40-stage workflow at Stage 4',
        impact: 'Seamless user experience, preserves wizard work, no redundant data entry'
      },
      {
        decision: 'All 40 stages mandatory for every venture',
        rationale: 'Chairman\'s requirement for "solid plans" - no tier-based stage limits, ensures comprehensive planning for all ventures',
        impact: 'Higher quality plans, fewer post-launch pivots (projected 20-30% reduction)'
      },
      {
        decision: 'Dependency-driven recursion (not simple iteration)',
        rationale: 'Chairman clarified: "recursiveness" means downstream stages can invalidate upstream decisions (e.g., financial forecast reveals flawed business model → recurse to Stage 3)',
        impact: 'Intelligent quality gates prevent cascading failures, reduces Chairman manual oversight by 40%'
      },
      {
        decision: '20-25 recursion scenarios with threshold-based automation',
        rationale: 'Balance automation (CRITICAL thresholds auto-execute) with human oversight (HIGH thresholds need Chairman approval)',
        impact: 'Scales quality enforcement while preserving Chairman\'s strategic control'
      },
      {
        decision: 'Grandfather existing ventures (backward compatibility)',
        rationale: 'Prevent breaking changes to ventures created before unification',
        impact: 'Zero disruption to existing work, smooth transition'
      }
    ],

    // 5. Known Issues & Risks
    known_issues: {
      risks: [
        {
          id: 'RISK-LEAD-001',
          description: 'Database schema complexity (recursion_events table design)',
          severity: 'MEDIUM',
          mitigation: 'Delegate to database-agent in PLAN phase for proper schema design',
          status: 'identified'
        },
        {
          id: 'RISK-LEAD-002',
          description: 'ideas → ventures migration complexity (zero data loss requirement)',
          severity: 'HIGH',
          mitigation: 'Phase 1 dedicated to migration with comprehensive validation',
          status: 'identified'
        },
        {
          id: 'RISK-LEAD-003',
          description: 'Recursion threshold tuning (may need adjustment after deployment)',
          severity: 'MEDIUM',
          mitigation: 'Start conservative, monitor recursion_events, adjust based on data',
          status: 'identified'
        }
      ],
      blockers: [],
      warnings: [
        'No existing retrospectives found for similar recursion engine implementations - PLAN phase will proceed without automated learning enrichment for this specific pattern',
        '40-stage workflow has NO ROUTE currently - EXEC Phase 1 must register route before any testing'
      ]
    },

    // 6. Resource Utilization + Context Health
    context_health: {
      tokens_used: 100519,
      tokens_total: 200000,
      percentage: 50.3,
      status: 'HEALTHY',
      recommendation: 'Continue normally. Context budget well within safe limits.',
      compaction_needed: false
    },

    // 7. Action Items for Receiver (PLAN Agent)
    next_phase_guidance: {
      immediate_actions: [
        '1. DATABASE VERIFICATION (MANDATORY FIRST STEP): Delegate to database-agent to design recursion_events table schema',
        '2. CREATE PRD: Use sd_id=SD-VENTURE-UNIFICATION-001, incorporate all 5 Epic Execution Sequences',
        '3. USER STORIES: Auto-generate from 10 success criteria (SC-001 through SC-010)',
        '4. NEW v4.3.0 - PRD ENRICHMENT: Run node scripts/enrich-prd-with-research.js <PRD-ID>',
        '5. COMPONENT SIZING: Target 300-600 LOC per component (recursion engine, UI components)',
        '6. TESTING STRATEGY: Define Tier 1 (smoke) + Tier 2 (comprehensive E2E) requirements',
        '7. CREATE PLAN→EXEC HANDOFF: Use unified-handoff-system.js or manual creation'
      ],
      critical_requirements: [
        'MUST delegate database tasks to database-agent (recursion_events schema, migration plan)',
        'MUST preserve all 12+ nuances captured in SD (see success_criteria for details)',
        'MUST ensure all 10 success criteria map to user stories',
        'MUST define E2E test strategy for CRITICAL recursion paths (FIN-001, TECH-001, etc.)',
        'MUST document component architecture (recursion engine as separate service)'
      ],
      nuances_to_preserve: [
        'Recursion is dependency-driven, not simple iteration',
        'ROI <15% triggers FIN-001 recursion to Stage 3',
        'Blocking technical issues trigger TECH-001 recursion to Stage 8',
        'Max 3 recursions per stage → Chairman escalation',
        '<100ms recursion detection performance requirement',
        'Chairman approval required for HIGH threshold triggers',
        'All 40 stages accessible (no tier limits)',
        'Zero data loss during ideas → ventures migration',
        'Backward compatibility for existing ventures'
      ]
    },

    // 8. NEW v4.3.0 - Learning Context
    learning_context: {
      retrospectives_consulted: 0,
      retrospective_matches: [
        '⚠️ No matching retrospectives found for "recursion engine" or "venture workflow unification"',
        'ℹ️ This is a novel implementation pattern for the organization'
      ],
      issue_patterns_matched: 0,
      issue_pattern_matches: [
        '⚠️ No issue patterns matched for this category',
        'ℹ️ PLAN phase should create issue patterns if database migration challenges discovered'
      ],
      prevention_checklists_applied: [],
      lessons_from_similar_work: [
        'Database-agent delegation MANDATORY for schema changes (prevents 4-6 hours debugging)',
        'Sub-agent delegation checkpoints: testing-agent for tests, database-agent for migrations',
        'Root cause analysis over workarounds (Chairman directive)',
        'Quality-first: 2-4 hours careful work beats 6-12 hours rework'
      ],
      confidence_notes: 'No automated learning enrichment available for this novel implementation. PLAN agent should rely on Epic Execution Sequences + Success Criteria + best practices from LEO Protocol v4.3.0.'
    }
  };

  try {
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .insert({
        ...handoff,
        completeness_report: JSON.stringify(handoff.completeness_report),
        deliverables_manifest: JSON.stringify(handoff.deliverables_manifest),
        key_decisions: JSON.stringify(handoff.key_decisions),
        known_issues: JSON.stringify(handoff.known_issues),
        context_health: JSON.stringify(handoff.context_health),
        next_phase_guidance: JSON.stringify(handoff.next_phase_guidance),
        learning_context: JSON.stringify(handoff.learning_context)
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating handoff:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log('✅ LEAD→PLAN Handoff Created Successfully!\n');
    console.log('Handoff ID:', data.id);
    console.log('From:', data.from_phase, '→ To:', data.to_phase);
    console.log('Status:', data.status);
    console.log('Created:', data.created_at);

    console.log('\n📊 Context Health:');
    console.log('  Usage: 100.5k / 200k tokens (50.3%)');
    console.log('  Status: 🟢 HEALTHY');

    console.log('\n📋 Next Steps for PLAN Agent:');
    console.log('1. Delegate database verification to database-agent');
    console.log('2. Create PRD from SD + Epic Execution Sequences');
    console.log('3. Auto-generate user stories from 10 success criteria');
    console.log('4. Run PRD enrichment (v4.3.0)');
    console.log('5. Define component sizing + testing strategy');
    console.log('6. Create PLAN→EXEC handoff');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createHandoff();
