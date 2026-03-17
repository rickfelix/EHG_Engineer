#!/usr/bin/env node

/**
 * Seed RAID Items for SD-VIF-REFINE-001
 * Connects Recursive Refinement Loop with RAID tracking framework
 *
 * RAID = Risks, Assumptions, Issues, Dependencies
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Use EHG database (where raid_log table exists)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function seedRAIDItems() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Seed RAID Items for SD-VIF-REFINE-001                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const raidItems = [
    // RISKS
    {
      type: 'Risk',
      title: 'Quality Metric Inconsistency',
      description: 'Quality scores may vary between intelligence analysis runs, leading to unreliable convergence detection and incorrect iteration decisions.',
      severity_index: 8, // High impact (scale 1-10)
      status: 'MITIGATED',
      mitigation_strategy: 'Use deterministic quality calculation algorithm in recursionLoop.ts. Average STA + GCIA scores. Validate with unit tests.',
      category: 'Technical',
      owner: 'EXEC',
      venture_id: null, // System-level risk
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        impact: 'HIGH',
        probability: 0.3,
        mitigation_status: 'IMPLEMENTED',
        implementation_file: 'src/services/recursionLoop.ts:calculateQualityDelta()'
      }
    },
    {
      type: 'Risk',
      title: 'Chairman Override Abuse',
      description: 'Chairman may frequently skip refinement iterations to save time, undermining the quality improvement process and reducing venture success rates.',
      severity_index: 6, // Medium impact
      status: 'MONITORING',
      mitigation_strategy: 'Log all skip actions to raid_log. Track skip rate in ideation_experiments table. Alert if skip rate >30%.',
      category: 'Process',
      owner: 'LEAD',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        impact: 'MEDIUM',
        probability: 0.4,
        monitoring_metric: 'skip_rate',
        threshold_alert: 0.30,
        implementation_file: 'src/services/recursionLoop.ts:skipRefinement()'
      }
    },
    {
      type: 'Risk',
      title: 'Performance Degradation with Large Quality Evaluations',
      description: 'Intelligence analysis (STA + GCIA) may take >30 seconds for complex ventures, causing iteration timeouts and poor user experience.',
      severity_index: 4, // Low impact
      status: 'ACCEPTED',
      mitigation_strategy: 'Async processing with progress indicators. Cache quality evaluation results. Set 30s timeout per iteration.',
      category: 'Performance',
      owner: 'EXEC',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        impact: 'LOW',
        probability: 0.2,
        timeout_threshold_ms: 30000,
        implementation_file: 'src/services/recursionLoop.ts:RECURSION_RULES.ITERATION_TIMEOUT_MS'
      }
    },

    // ASSUMPTIONS
    {
      type: 'Assumption',
      title: 'Intelligence Agents Provide Reliable Quality Scores',
      description: 'Assumes STA and GCIA agents return consistent, reliable quality scores between 0-100 that accurately reflect venture quality.',
      severity_index: 7,
      status: 'ACTIVE',
      validation_approach: 'Monitor quality score variance across multiple runs. Validate against manual quality assessments.',
      category: 'Technical',
      owner: 'PLAN',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        dependency: 'SD-VIF-INTEL-001',
        validation_required: true,
        validation_file: 'tests/e2e/recursive-refinement.spec.ts:US-001'
      }
    },
    {
      type: 'Assumption',
      title: 'Tier 2 Ventures Benefit from Refinement',
      description: 'Assumes that deep research (Tier 2) ventures gain significant quality improvement from 2 iterations, justifying the additional time cost.',
      severity_index: 6,
      status: 'ACTIVE',
      validation_approach: 'Track median quality delta for Tier 2 ventures. Target +15-20% improvement.',
      category: 'Business',
      owner: 'LEAD',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        target_improvement_pct: 15,
        monitoring_metric: 'quality_improvement_median',
        tier: 2
      }
    },

    // DEPENDENCIES
    {
      type: 'Dependency',
      title: 'SD-VIF-TIER-001: Tiered Ideation Engine',
      description: 'Requires tier classification system to identify Tier 2 (deep research) ventures that should use recursive refinement.',
      severity_index: 9, // Critical dependency
      status: 'RESOLVED',
      resolution_details: 'SD-VIF-TIER-001 completed and deployed. Tier metadata available in ventures.metadata.tier.',
      category: 'Strategic Directive',
      owner: 'PLAN',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        dependency_sd: 'SD-VIF-TIER-001',
        dependency_status: 'COMPLETED',
        integration_point: 'src/components/ventures/VentureCreationDialog.tsx:217'
      }
    },
    {
      type: 'Dependency',
      title: 'SD-VIF-INTEL-001: Intelligence Agents',
      description: 'Requires STA and GCIA intelligence agents to provide quality scores for each iteration.',
      severity_index: 9,
      status: 'RESOLVED',
      resolution_details: 'SD-VIF-INTEL-001 completed. Intelligence agents integrated via IntelligenceDrawer component.',
      category: 'Strategic Directive',
      owner: 'PLAN',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        dependency_sd: 'SD-VIF-INTEL-001',
        dependency_status: 'COMPLETED',
        integration_point: 'src/pages/VentureDetailEnhanced.tsx:handleAnalysisComplete()'
      }
    },
    {
      type: 'Dependency',
      title: 'Ventures Table Metadata JSONB Field',
      description: 'Requires ventures.metadata JSONB column to store recursion_state for iteration tracking.',
      severity_index: 10, // Blocking
      status: 'RESOLVED',
      resolution_details: 'Ventures table has metadata JSONB column. RecursionState interface defined in recursionLoop.ts.',
      category: 'Database',
      owner: 'DATABASE',
      venture_id: null,
      metadata: {
        sd_id: 'SD-VIF-REFINE-001',
        table: 'ventures',
        column: 'metadata',
        type: 'JSONB',
        schema_location: 'src/services/recursionLoop.ts:RecursionState'
      }
    }
  ];

  console.log(`Inserting ${raidItems.length} RAID items...`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const item of raidItems) {
    try {
      const { error } = await supabase
        .from('raid_log')
        .insert({
          ...item,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error(`❌ Failed to insert ${item.type}: ${item.title}`);
        console.error(`   Error: ${error.message}`);
        errorCount++;
      } else {
        console.log(`✅ ${item.type}: ${item.title} (Severity: ${item.severity_index}/10)`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Exception inserting ${item.title}:`, error.message);
      errorCount++;
    }
  }

  console.log('');
  console.log('═'.repeat(65));
  console.log('📊 RAID Seeding Summary');
  console.log('─'.repeat(65));
  console.log(`Total Items: ${raidItems.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('');
  console.log('RAID Breakdown:');
  console.log(`  - Risks: 3`);
  console.log(`  - Assumptions: 2`);
  console.log(`  - Issues: 0 (logged dynamically during execution)`);
  console.log(`  - Dependencies: 3`);
  console.log('');
  console.log('Dynamic RAID Logging (Runtime):');
  console.log('  - Issue logged when quality <10% (escalation trigger)');
  console.log('  - Action logged when Chairman skips refinement');
  console.log('  - Decision logged when Chairman approves/rejects');
  console.log('');
}

seedRAIDItems().catch(console.error);
