#!/usr/bin/env node

/**
 * Create SD-UI-PARITY-001: IDEATION Stages 1-6 UI Component Backfill
 *
 * Purpose: Backfill missing UI components for IDEATION pipeline Stages 1-6
 * to achieve ≥80% UI coverage and unblock Stage 7.
 *
 * Reference: LEO Protocol v4.3.3 - UI Parity Governance
 * Assessment: IDEATION_UI_UX_ASSESSMENT_REPORT.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createUIParitySD() {
  console.log('📋 Creating SD-UI-PARITY-001: IDEATION Stages 1-6 UI Component Backfill\n');

  const sdId = 'SD-UI-PARITY-001';

  // Check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .eq('id', sdId)
    .single();

  if (existing) {
    console.log(`⚠️  SD ${sdId} already exists:`);
    console.log(`   Title: ${existing.title}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\nTo update, delete first or use a different ID.');
    return;
  }

  // Create the Strategic Directive (using only valid columns from schema)
  const sdData = {
    id: sdId,
    legacy_id: sdId,
    sd_key: 'SD-UI-PARITY-001',
    title: 'IDEATION Stages 1-6 UI Component Backfill',
    status: 'draft',
    category: 'technical',
    priority: 'critical',
    sd_type: 'feature',
    current_phase: 'LEAD',
    target_application: 'EHG',
    description: `Backfill missing UI components for IDEATION pipeline Stages 1-6 to achieve ≥80% UI coverage.

**Problem Statement:**
- Backend contracts are complete (517/517 tests passing)
- ~70% of UI components are missing
- ~40% of stage output data has no UI representation
- Stage 7 is BLOCKED until UI coverage achieved (LEO v4.3.3)

**Reference Documents:**
- IDEATION_UI_UX_ASSESSMENT_REPORT.md (comprehensive analysis)
- LEO Protocol v4.3.3 - UI Parity Governance

**Total Scope:**
- 25 components across 6 stages
- ~150 hours estimated effort
- 4 phases over ~8 weeks`,

    rationale: `1. **Governance Compliance**: LEO Protocol v4.3.3 mandates UI Parity
2. **Stage 7 Blocker**: Cannot proceed to Strategy Formulation without UI coverage
3. **Human Inspectability**: Stakeholders cannot review stage outputs without UI
4. **Decision Transparency**: GO/NO_GO/REVISE decisions must be visible`,

    scope: `**In Scope:**
- Phase 1: Foundation components (ScoreBar, DecisionBadge, ConfidenceRing, AlertList, FindingsList, StageOutputCard)
- Phase 2: Critical stage components (GateDecisionBanner, FinalRecommendation, BlockerChecklist, PerspectivePanel, RiskRankingList, StageOutputViewer)
- Phase 3: Stage-specific enhancements (Stage 1-6 specialized components)
- Phase 4: Polish & Integration (remaining P2 components, testing)

**Out of Scope:**
- Stage 7+ UI components (future SDs)
- Backend changes (already complete)
- Mobile-specific layouts (desktop-first)`,

    strategic_objectives: JSON.stringify([
      'Achieve ≥80% UI coverage for Stages 1-6',
      'Unblock Stage 7 (Strategy Formulation)',
      'Implement StageOutputViewer master component',
      'Create 25 reusable design system components',
      'Ensure human inspectability of all stage outputs'
    ]),

    success_metrics: JSON.stringify([
      { metric: 'UI Coverage', target: '≥80%', current: '~30%' },
      { metric: 'Components Implemented', target: '25', current: '0' },
      { metric: 'E2E Tests Passing', target: '100%', current: 'N/A' },
      { metric: 'Stage 7 Unblocked', target: 'true', current: 'false' }
    ]),

    dependencies: JSON.stringify([
      'IDEATION backend contracts (COMPLETE)',
      'Shadcn/UI component library (AVAILABLE)',
      'Recharts for data visualization (AVAILABLE)'
    ]),

    risks: JSON.stringify([
      {
        risk: 'Large scope (150 hours) may cause delays',
        likelihood: 'Medium',
        impact: 'High',
        mitigation: 'Break into 4 child SDs for phased delivery'
      },
      {
        risk: 'Backend contract changes during implementation',
        likelihood: 'Low',
        impact: 'Medium',
        mitigation: 'Backend is frozen, contracts locked'
      },
      {
        risk: 'Design inconsistency across stages',
        likelihood: 'Medium',
        impact: 'Medium',
        mitigation: 'Foundation phase establishes shared components first'
      }
    ]),

    success_criteria: JSON.stringify([
      'All P0 (Critical) components implemented and tested',
      'StageOutputViewer displays all 6 stages correctly',
      'Decision visibility: GO/NO_GO/REVISE prominently displayed',
      'Risk visibility: All red_flags and blockers surfaced',
      'Score interpretation: Threshold context visible',
      'Cross-stage consistency: Same data rendered same way',
      'E2E tests verify component rendering',
      'UI coverage ≥80% verified by automated check'
    ]),

    created_by: 'LEAD',
    is_active: true,
    progress: 0,
    sequence_rank: 1,
    version: '1.0',
    metadata: JSON.stringify({
      created_from: 'SD-LEO-v4.3.3-UI-PARITY governance analysis',
      reference_document: '/mnt/c/_EHG/ehg/docs/IDEATION_UI_UX_ASSESSMENT_REPORT.md',
      governance_trigger: 'Stage 7 Hard Block',
      ui_coverage_target: '80%',
      component_count: 25,
      phase_count: 4,
      estimated_effort_hours: 150
    })
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error.message);
    console.error(error);
    process.exit(1);
  }

  console.log('✅ SD-UI-PARITY-001 created successfully!');
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Phase: ${data.current_phase}`);
  console.log(`   Priority: ${data.priority}`);
  console.log(`   Effort: ${data.estimated_effort_hours} hours`);

  console.log('\n📝 Next Steps:');
  console.log('1. LEAD approval required (current status: pending_lead_approval)');
  console.log('2. After LEAD approval, create PRD with: node scripts/add-prd-to-database.js SD-UI-PARITY-001');
  console.log('3. Consider creating child SDs for phased delivery:');
  console.log('   - SD-UI-PARITY-001A: Foundation (~31 hours)');
  console.log('   - SD-UI-PARITY-001B: Critical (~38 hours)');
  console.log('   - SD-UI-PARITY-001C: Enhancement (~49 hours)');
  console.log('   - SD-UI-PARITY-001D: Polish (~32 hours)');
}

createUIParitySD().catch(console.error);
