#!/usr/bin/env node

/**
 * Create PRD for SD-VENTURE-UNIFICATION-001
 * Per LEO Protocol v4.3.0 - PLAN Phase PRD Creation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role to bypass RLS
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-VENTURE-UNIFICATION-001...\n');

  // Get SD data
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VENTURE-UNIFICATION-001')
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  console.log('✅ SD found:', sd.title);
  console.log('   UUID:', sd.uuid_id);

  // Get Epic Execution Sequences
  const { data: ees, error: eesError } = await supabase
    .from('execution_sequences_v2')
    .select('*')
    .eq('directive_id', 'SD-VENTURE-UNIFICATION-001')
    .order('sequence_number');

  if (eesError) {
    console.error('❌ EES fetch error:', eesError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${ees.length} Epic Execution Sequences\n`);

  // Create PRD
  const prdId = 'PRD-VENTURE-UNIFICATION-001';

  const prd = {
    id: prdId,
    directive_id: 'SD-VENTURE-UNIFICATION-001',
    sd_uuid: sd.uuid_id,
    title: sd.title,
    version: '1.0',
    status: 'planning',
    category: sd.category || 'feature',
    priority: sd.priority,

    // Executive Summary
    executive_summary: `# Executive Summary

**Product**: Unified Venture Creation System with Intelligent Dependency-Driven Recursion

**Strategic Directive**: SD-VENTURE-UNIFICATION-001 (CRITICAL Priority)

**Problem Statement**: Two parallel venture creation systems exist with zero integration:
- 3-Step Wizard (modern, uses ventures table)
- 40-Stage Workflow (comprehensive, uses ideas table, NO ROUTE)
- No smart recursion when downstream stages invalidate upstream decisions

**Solution**: Unify systems with intelligent dependency-driven recursion that automatically detects quality issues and routes back to fix root causes.

**Business Value**:
- 20-30% reduction in post-launch pivots (better upfront planning)
- 40% reduction in Chairman manual oversight (automated quality gates)
- 70%+ venture success rate at 12 months (up from 55% baseline)
- 8-12 hours to complete all 40 stages (Tier 2 equivalent)

**Timeline**: 11 weeks across 5 implementation phases (${ees.length} EES)
**Total Effort**: ~144-166 hours

**Key Innovation**: Dependency-driven recursion (not simple iteration) - when Stage 5 detects ROI <15%, system automatically recurses to Stage 3 to fix business model.`,

    // Content: Technical Requirements
    content: `# Product Requirements Document
## PRD-VENTURE-UNIFICATION-001

---

## 1. OVERVIEW

**SD Reference**: SD-VENTURE-UNIFICATION-001
**PRD Version**: 1.0
**Status**: Planning
**Created**: ${new Date().toISOString().split('T')[0]}

---

## 2. SUCCESS CRITERIA (From SD)

${sd.success_criteria.map((sc, idx) => `
### SC-${String(idx + 1).padStart(3, '0')}: ${sc.criterion}
- **Priority**: ${sc.priority}
- **Measure**: ${sc.measure}
- **Type**: ${sc.id.split('-')[0] === 'SC' ? 'Functional' : 'Non-Functional'}
`).join('\n')}

---

## 3. EPIC EXECUTION SEQUENCES

${ees.map(e => `
### ${e.title}
**Timeline**: ${e.timeline_notes || 'TBD'}
**Status**: ${e.status}
**Sequence**: ${e.sequence_number}/5

**Description**: ${e.description || 'See strategic directive for details'}

**Deliverables**: ${Array.isArray(e.deliverables) ? e.deliverables.length : 0} items
**Dependencies**: ${Array.isArray(e.dependencies) ? e.dependencies.length : 0} items
`).join('\n')}

---

## 4. SCOPE

### In Scope
${sd.scope.split('INCLUDED IN SCOPE:')[1]?.split('EXCLUDED FROM SCOPE:')[0] || sd.scope.substring(0, 1000)}

### Out of Scope
${sd.scope.split('EXCLUDED FROM SCOPE:')[1]?.split('SYSTEMS AFFECTED:')[0] || 'See SD for exclusions'}

---

## 5. TECHNICAL ARCHITECTURE

### Database Changes
- **New Table**: recursion_events (tracks all recursion occurrences)
- **Schema Updates**: ventures table (workflow columns)
- **Migration**: ideas → ventures.metadata (zero data loss requirement)

**See**: /mnt/c/_EHG/EHG/supabase/migrations/2025110 3_*.sql

### Application Components
- **recursionEngine.ts**: Core recursion detection service
- **RecursionHistoryUI**: Display recursion timeline
- **VentureCreationPage.tsx**: Wizard bridge to Stage 4
- **CompleteWorkflowOrchestrator.tsx**: Route registration, stage management
- **Stage components** (1-40): Recursion trigger integration

---

## 6. TESTING STRATEGY

### Tier 1: Smoke Tests (MANDATORY)
- Wizard → Stage 4 auto-launch
- All 40 stages accessible
- Basic recursion trigger (FIN-001)
- Database migration validation

### Tier 2: Comprehensive E2E (REQUIRED for Approval)
- All 10 success criteria validated
- All CRITICAL recursion paths (FIN-001, TECH-001, MKT-001/002, RISK-001)
- Loop prevention (3x recursion → escalation)
- Chairman approval workflow
- Performance (<100ms recursion detection)
- Backward compatibility (existing ventures)

**E2E Framework**: Playwright
**Coverage Target**: 100% user story coverage

---

## 7. COMPONENT SIZING

**Target**: 300-600 LOC per component (LEO Protocol guideline)

**Component Breakdown**:
- recursionEngine.ts: ~500 LOC (20-25 scenarios, threshold logic)
- RecursionHistoryUI: ~300 LOC (timeline display, explanations)
- VentureCreationPage bridge: ~100 LOC (redirect logic)
- CompleteWorkflowOrchestrator: ~200 LOC (route + start param)
- Stage components (updates): ~50 LOC each × 40 = 2,000 LOC

**Total Estimated**: ~3,100 LOC across 40+ components

---

## 8. DEPENDENCIES

${sd.dependencies.map((dep, idx) => `
${idx + 1}. **${dep.name || dep.description}**: ${dep.type}
   ${dep.rationale || ''}
`).join('\n')}

---

## 9. RISKS & MITIGATION

${sd.risks.map((risk, idx) => `
### Risk ${idx + 1}: ${risk.description}
- **Severity**: ${risk.severity}
- **Category**: ${risk.category || 'Technical'}
- **Mitigation**: ${risk.mitigation}
`).join('\n')}

---

## 10. IMPLEMENTATION PHASES (${ees.length} Phases)

${ees.map((e, idx) => `
### Phase ${idx + 1}: ${e.title.replace(/^Phase \d+: /, '')}
- **Duration**: ${e.timeline_notes}
- **Status**: ${e.status}
- **Deliverables**: ${JSON.parse(e.deliverables || '[]').length} items
- **Dependencies**: ${JSON.parse(e.dependencies || '[]').length} items
`).join('\n')}

---

## 11. ACCEPTANCE CRITERIA SUMMARY

Total Success Criteria: ${sd.success_criteria.length}
- CRITICAL Priority: ${sd.success_criteria.filter(sc => sc.priority === 'CRITICAL').length}
- HIGH Priority: ${sd.success_criteria.filter(sc => sc.priority === 'HIGH').length}
- MEDIUM Priority: ${sd.success_criteria.filter(sc => sc.priority === 'MEDIUM').length}

**All criteria must pass for approval** (no partial delivery)

---

## 12. QUALITY GATES

### PLAN Phase Gates
- ✅ Database verification complete (database-agent)
- ✅ PRD created in database
- ⏳ User stories auto-generated (10 from success criteria)
- ⏳ PRD enrichment (v4.3.0 automated learning)
- ⏳ Component sizing validated (300-600 LOC)
- ⏳ Testing strategy defined (Tier 1 + Tier 2)

### EXEC Phase Gates
- Dual testing (unit + E2E) MANDATORY
- 100% user story E2E coverage
- CI/CD green
- <100ms recursion detection (performance requirement)
- Zero data loss validation (migration)
- Backward compatibility verified

---

## 13. STAKEHOLDERS

${sd.stakeholders?.map((sh, idx) => `
${idx + 1}. **${sh.name || sh.role}**: ${sh.role || 'Stakeholder'}
   ${sh.engagement || ''}
`).join('\n') || '- Chairman (primary approver)\n- PLAN Agent (PRD creation)\n- EXEC Agent (implementation)\n- QA Director (testing validation)'}

---

## 14. NEXT STEPS

1. **User Story Generation**: Auto-generate from 10 success criteria
2. **PRD Enrichment**: Run automated learning pipeline (v4.3.0)
3. **Component Sizing Review**: Validate 300-600 LOC targets
4. **Testing Strategy Finalization**: Define E2E test suite structure
5. **PLAN→EXEC Handoff**: Transfer to implementation phase

---

**PRD Status**: Planning (to be updated to 'approved' after enrichment)
**Progress**: 0% (implementation not started)
**Created By**: PLAN Agent
**Protocol Version**: LEO v4.3.0
`,

    // Progress tracking
    progress: 0,
    phase: 'planning',
    created_by: 'PLAN',

    // Metadata
    metadata: {
      protocol_version: 'v4.3.0',
      ees_count: ees.length,
      success_criteria_count: sd.success_criteria?.length || 0,
      total_estimated_hours: '144-166',
      timeline_weeks: 11,
      database_migrations_required: true,
      backward_compatibility_required: true
    }
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert({
        ...prd,
        metadata: JSON.stringify(prd.metadata)
      })
      .select()
      .single();

    if (error) {
      console.error('❌ PRD creation error:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log('✅ PRD Created Successfully!\n');
    console.log('PRD ID:', data.id);
    console.log('Title:', data.title);
    console.log('Status:', data.status);
    console.log('Priority:', data.priority);
    console.log('Progress:', data.progress + '%');

    console.log('\n📋 Next Steps:');
    console.log('1. Auto-generate user stories from 10 success criteria');
    console.log('2. Run PRD enrichment: node scripts/enrich-prd-with-research.js', prdId);
    console.log('3. Validate component sizing (300-600 LOC targets)');
    console.log('4. Define E2E test suite structure');
    console.log('5. Create PLAN→EXEC handoff');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createPRD();
