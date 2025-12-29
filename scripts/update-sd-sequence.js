#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Logical Execution Sequence for 25 Strategic Directives
 *
 * TIER 1: FOUNDATION (1-8) - Must come first, enables everything else
 * - Database schema, testing infrastructure, error handling, core platform audit
 *
 * TIER 2: INFRASTRUCTURE (9-13) - Build on foundation, required for features
 * - Backend completion, data integration, component cleanup
 *
 * TIER 3: FEATURE RECONNECTION (14-20) - Core user-facing features
 * - Venture workflows, AI features, navigation, UI connections
 *
 * TIER 4: ENHANCEMENTS (21-25) - Polish and optimization
 * - UX improvements, accessibility, documentation, observability
 */

const sequenceMapping = [
  // ============================================================
  // TIER 1: FOUNDATION (1-8)
  // Critical infrastructure that enables all other work
  // ============================================================

  {
    id: 'SD-DATA-001',
    sequence_rank: 1,
    rationale: 'FIRST: Database schema must be complete before ANY feature work. Missing tables block multiple features (analytics_exports, performance_cycle, synergy_opportunities).'
  },

  {
    id: 'SD-QUALITY-001',
    sequence_rank: 2,
    rationale: 'SECOND: Testing infrastructure must exist BEFORE building/fixing features. Prevents regressions and provides safety net for all subsequent work.'
  },

  {
    id: 'SD-RELIABILITY-001',
    sequence_rank: 3,
    rationale: 'THIRD: Error boundaries prevent catastrophic failures. Must exist before exposing hidden features to users.'
  },

  {
    id: 'SD-RECONNECT-001',
    sequence_rank: 4,
    rationale: 'FOURTH: Core platform audit identifies all disconnected features. Provides roadmap for subsequent reconnection work (RECONNECT-002 through RECONNECT-015).'
  },

  {
    id: 'SD-RECONNECT-005',
    sequence_rank: 5,
    rationale: 'FIFTH: Resolve duplicate components (VentureCreateDialog conflicts) before building features. Prevents choosing wrong component.'
  },

  {
    id: 'SD-RECONNECT-004',
    sequence_rank: 6,
    rationale: 'SIXTH: Database-UI integration assessment identifies which tables need UI. Informs RECONNECT-007, RECONNECT-008, BACKEND-002.'
  },

  {
    id: 'SD-RECONNECT-008',
    sequence_rank: 7,
    rationale: 'SEVENTH: Service layer audit identifies orphaned services. Must complete before building UI layers in TIER 3.'
  },

  {
    id: 'SD-BACKEND-003',
    sequence_rank: 8,
    rationale: 'EIGHTH: Evaluate all placeholder features BEFORE building new features. Prevents wasted effort on features that should be removed.'
  },

  // ============================================================
  // TIER 2: INFRASTRUCTURE (9-13)
  // Backend and architecture work that enables feature reconnection
  // ============================================================

  {
    id: 'SD-BACKEND-001',
    sequence_rank: 9,
    rationale: 'NINTH: Complete critical backend stubs (EVA Voice WebSocket, Export APIs) needed by RECONNECT-002, EXPORT-001, RECONNECT-015.'
  },

  {
    id: 'SD-BACKEND-002',
    sequence_rank: 10,
    rationale: 'TENTH: Replace mock data with real APIs. Required before users can use Global Search, Incident Management, Policy Management features.'
  },

  {
    id: 'SD-RECONNECT-007',
    sequence_rank: 11,
    rationale: 'ELEVENTH: Integrate disconnected component libraries (Parallel Exploration, Business Agents, Knowledge Management). Creates reusable components for TIER 3 features.'
  },

  {
    id: 'SD-RECONNECT-003',
    sequence_rank: 12,
    rationale: 'TWELFTH: Audit 63 stage components to determine access patterns. Required before fixing Venture Creation Workflow (RECONNECT-002) and Navigation (RECONNECT-006).'
  },

  {
    id: 'SD-REALTIME-001',
    sequence_rank: 13,
    rationale: 'THIRTEENTH: Systematic real-time sync across all tables. Enables collaborative features needed by RECONNECT-011, RECONNECT-012, RECONNECT-013.'
  },

  // ============================================================
  // TIER 3: FEATURE RECONNECTION (14-20)
  // User-facing features that deliver immediate business value
  // ============================================================

  {
    id: 'SD-RECONNECT-002',
    sequence_rank: 14,
    rationale: 'FOURTEENTH: Fix critical venture creation workflow. Highest user impact, depends on RECONNECT-003 (stage audit), RECONNECT-005 (component cleanup), BACKEND-001 (voice APIs).'
  },

  {
    id: 'SD-RECONNECT-006',
    sequence_rank: 15,
    rationale: 'FIFTEENTH: Navigation enhancement makes all reconnected features discoverable. Should come after RECONNECT-002 so venture workflow is accessible.'
  },

  {
    id: 'SD-RECONNECT-011',
    sequence_rank: 16,
    rationale: 'SIXTEENTH: Chairman Decision Analytics (AI learning system). High business value, depends on REALTIME-001 (collaborative features), RELIABILITY-001 (error handling).'
  },

  {
    id: 'SD-RECONNECT-012',
    sequence_rank: 17,
    rationale: 'SEVENTEENTH: AI Predictive Analytics Dashboard (ML forecasting). Complements RECONNECT-011, depends on DATA-001 (complete schema), BACKEND-002 (real APIs).'
  },

  {
    id: 'SD-EXPORT-001',
    sequence_rank: 18,
    rationale: 'EIGHTEENTH: Analytics Export UI (connects 609 LOC engine). Depends on BACKEND-001 (export APIs), RECONNECT-012 (analytics data sources).'
  },

  {
    id: 'SD-RECONNECT-013',
    sequence_rank: 19,
    rationale: 'NINETEENTH: Intelligent Automation Control Center. Depends on RECONNECT-011 (AI decisions), REALTIME-001 (live updates), BACKEND-002 (real data).'
  },

  {
    id: 'SD-RECONNECT-015',
    sequence_rank: 20,
    rationale: 'TWENTIETH: Global Voice & Translation (99+ languages). Depends on BACKEND-001 (voice WebSocket), RECONNECT-002 (voice workflow integration).'
  },

  // ============================================================
  // TIER 4: ENHANCEMENTS (21-25)
  // Polish, optimization, and user experience improvements
  // ============================================================

  {
    id: 'SD-UX-001',
    sequence_rank: 21,
    rationale: 'TWENTY-FIRST: First-run onboarding (connects FirstRunWizard). Should come after navigation and core features are accessible (RECONNECT-006, RECONNECT-002).'
  },

  {
    id: 'SD-RECONNECT-009',
    sequence_rank: 22,
    rationale: 'TWENTY-SECOND: Feature documentation and discovery. Should document features AFTER they are reconnected (TIER 3 complete).'
  },

  {
    id: 'SD-ACCESSIBILITY-001',
    sequence_rank: 23,
    rationale: 'TWENTY-THIRD: WCAG 2.1 AA compliance. Should come after features are functional, applies systematic accessibility patterns across all UIs.'
  },

  {
    id: 'SD-RECONNECT-014',
    sequence_rank: 24,
    rationale: 'TWENTY-FOURTH: System Observability Suite (monitoring/performance dashboards). Quick win but lower priority - observability for completed features.'
  },

  {
    id: 'SD-RECONNECT-010',
    sequence_rank: 25,
    rationale: 'TWENTY-FIFTH: Automated connectivity testing. Should be LAST - prevents future regressions after all features are reconnected and tested.'
  }
];

async function updateSequence() {
  console.log('Strategic Directive Sequence Ranking');
  console.log('='.repeat(120));
  console.log('');
  console.log('Updating sequence_rank for all 25 Strategic Directives based on dependency analysis...');
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const mapping of sequenceMapping) {
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        sequence_rank: mapping.sequence_rank,
        updated_at: new Date().toISOString()
      })
      .eq('id', mapping.id)
      .select('id, title, sequence_rank')
      .single();

    if (error) {
      console.error(`❌ FAILED: ${mapping.id} - ${error.message}`);
      errorCount++;
    } else {
      console.log(`✅ [${String(data.sequence_rank).padStart(2, '0')}] ${data.id.padEnd(22)} | ${data.title.substring(0, 60)}`);
      successCount++;
    }
  }

  console.log('');
  console.log('='.repeat(120));
  console.log('');
  console.log('EXECUTION TIERS:');
  console.log('');

  console.log('TIER 1: FOUNDATION (Sequence 1-8)');
  console.log('  Critical infrastructure that enables all other work');
  sequenceMapping.filter(m => m.sequence_rank >= 1 && m.sequence_rank <= 8).forEach(m => {
    console.log(`  [${String(m.sequence_rank).padStart(2, '0')}] ${m.id} - ${m.rationale}`);
  });
  console.log('');

  console.log('TIER 2: INFRASTRUCTURE (Sequence 9-13)');
  console.log('  Backend and architecture work that enables feature reconnection');
  sequenceMapping.filter(m => m.sequence_rank >= 9 && m.sequence_rank <= 13).forEach(m => {
    console.log(`  [${String(m.sequence_rank).padStart(2, '0')}] ${m.id} - ${m.rationale}`);
  });
  console.log('');

  console.log('TIER 3: FEATURE RECONNECTION (Sequence 14-20)');
  console.log('  User-facing features that deliver immediate business value');
  sequenceMapping.filter(m => m.sequence_rank >= 14 && m.sequence_rank <= 20).forEach(m => {
    console.log(`  [${String(m.sequence_rank).padStart(2, '0')}] ${m.id} - ${m.rationale}`);
  });
  console.log('');

  console.log('TIER 4: ENHANCEMENTS (Sequence 21-25)');
  console.log('  Polish, optimization, and user experience improvements');
  sequenceMapping.filter(m => m.sequence_rank >= 21 && m.sequence_rank <= 25).forEach(m => {
    console.log(`  [${String(m.sequence_rank).padStart(2, '0')}] ${m.id} - ${m.rationale}`);
  });
  console.log('');

  console.log('='.repeat(120));
  console.log('SUMMARY:');
  console.log(`  ✅ Successfully updated: ${successCount}`);
  console.log(`  ❌ Failed to update: ${errorCount}`);
  console.log(`  📊 Total SDs: ${sequenceMapping.length}`);
  console.log('');

  if (successCount === sequenceMapping.length) {
    console.log('✅ SUCCESS: All Strategic Directives now have logical sequence ranking');
    console.log('');
    console.log('NEXT STEPS:');
    console.log('  1. Dashboard will now show SDs in dependency order');
    console.log('  2. Execute TIER 1 (Foundation) first before any feature work');
    console.log('  3. Each tier builds on previous tier completions');
  } else {
    console.log('⚠️  WARNING: Some updates failed. Check errors above.');
  }
}

updateSequence().catch(console.error);
