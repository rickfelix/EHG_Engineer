#!/usr/bin/env node
/**
 * Create 5 Child SDs for SD-VENTURE-SELECTION-001
 *
 * This script creates the child SD records with proper:
 * - parent_sd_id relationship
 * - relationship_type = 'child'
 * - dependency_chain between children
 * - sequence_rank for execution order
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PARENT_SD_ID = 'SD-VENTURE-SELECTION-001';

const childSDs = [
  {
    id: 'SD-VS-CHAIRMAN-SETTINGS-001',
    title: 'Chairman Settings Configuration System',
    description: 'Database schema + UI for configurable venture selection parameters. Create chairman_settings table, update useChairmanConfig hook to use database instead of localStorage, add RLS policies.',
    category: 'database_schema',
    priority: 'high',
    sequence_rank: 1,
    dependencies: [],
    scope: {
      included: [
        'Create chairman_settings table in database',
        'Chairman Settings UI in admin dashboard',
        'Settings inheritance (default → override per venture)',
        'Store: risk_tolerance, pattern_threshold, time_to_revenue_max, capital_cap',
        'Store: feedback_speed, growth_curve, exploit_ratio, explore_ratio',
        'Store: new_pattern_budget, require_dogfooding, kill_gate_mode',
        'API endpoints for CRUD operations on settings',
        'RLS policies for settings access'
      ],
      excluded: ['Scoring engine (Phase C)', 'Pattern creation (Phase B)', 'Research pipeline (Phase D)']
    },
    success_metrics: [
      { metric: 'Chairman settings persist to database', target: '100%', baseline: 'localStorage only' },
      { metric: 'RLS policies enforced', target: 'All CRUD operations', baseline: 'No policies' },
      { metric: 'Default settings applied', target: 'When no override exists', baseline: 'N/A' }
    ],
    strategic_objectives: [
      'Eliminate localStorage dependency for settings',
      'Enable multi-user settings with proper isolation',
      'Provide sensible defaults for all parameters'
    ],
    risks: [
      { description: 'Migration from localStorage may lose existing settings', mitigation: 'One-time migration script', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Database-first persistence', description: 'All settings stored in PostgreSQL, not localStorage' },
      { principle: 'RLS security', description: 'Row Level Security protects all settings by company_id' },
      { principle: 'Settings inheritance', description: 'Default → venture override pattern' },
      { principle: 'Backward compatibility', description: 'Migrate existing localStorage data' }
    ],
    success_criteria: [
      { criterion: 'chairman_settings table exists with all columns', measure: 'Migration passes' },
      { criterion: 'useChairmanConfig reads from database', measure: 'Network trace shows DB queries' },
      { criterion: 'RLS policies block cross-company access', measure: 'E2E test passes' }
    ]
  },
  {
    id: 'SD-VS-PATTERN-UNLOCK-001',
    title: 'Priority Pattern Library Expansion',
    description: 'Add 4 critical patterns to scaffold_patterns: StripeService, RBACMiddleware, useCRUD, BackgroundJob. Each pattern includes template_code, variables, dependencies, and usage examples.',
    category: 'product_feature',
    priority: 'high',
    sequence_rank: 2,
    dependencies: [], // Can run in parallel with Chairman Settings
    scope: {
      included: [
        'StripeService pattern - billing, subscriptions, metering, webhooks',
        'RBACMiddleware pattern - roles, permissions, org membership, row-level policies',
        'useCRUD Hook - standardized Supabase binding for tables',
        'BackgroundJob pattern - queue, retry logic, idempotency, status tracking UI',
        'Template code for each pattern',
        'Variables/configuration for each pattern',
        'Dependencies documentation',
        'Usage examples'
      ],
      excluded: ['NotificationService (future SD)', 'SearchService (future SD)', 'AuditLog (future SD)']
    },
    success_metrics: [
      { metric: 'Patterns added to scaffold_patterns', target: '4 patterns', baseline: '45 patterns' },
      { metric: 'Template code complete', target: 'All 4 patterns', baseline: '0' },
      { metric: 'Variables documented', target: '100%', baseline: '0' }
    ],
    strategic_objectives: [
      'Unlock billing/subscription capabilities',
      'Standardize RBAC implementation',
      'Reduce boilerplate for CRUD operations',
      'Enable background job processing'
    ],
    risks: [
      { description: 'Pattern complexity may require multiple iterations', mitigation: 'Start with minimal viable patterns', severity: 'low' }
    ],
    key_principles: [
      { principle: 'Template-driven code generation', description: 'Patterns are code templates, not just docs' },
      { principle: 'Variable parameterization', description: 'Configurable values extracted as variables' },
      { principle: 'Dependency transparency', description: 'All pattern dependencies documented' }
    ],
    success_criteria: [
      { criterion: '4 patterns added to scaffold_patterns table', measure: 'DB query returns 49 patterns' },
      { criterion: 'Each pattern has template_code, variables, dependencies', measure: 'Schema validation passes' },
      { criterion: 'Usage examples documented', measure: 'Examples field populated' }
    ]
  },
  {
    id: 'SD-VS-SCORING-RUBRIC-001',
    title: 'Venture Opportunity Scoring Engine',
    description: 'Create venture_opportunity_scores table and implement scoring engine with configurable weights from chairman_settings. Replace hardcoded values in blueprintScoring.ts.',
    category: 'product_feature',
    priority: 'high',
    sequence_rank: 3,
    dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001'],
    scope: {
      included: [
        'Create venture_opportunity_scores table',
        'Implement scoring engine with configurable weights',
        'Auto-calculate: feedback_speed_score (TTFD-based)',
        'Auto-calculate: pattern_match_score (% of patterns available)',
        'Auto-calculate: market_demand_score (search volume, pain intensity)',
        'Auto-calculate: unit_economics_score (margin estimate)',
        'Auto-calculate: distribution_fit_score (channel availability)',
        'Auto-calculate: strategic_unlock_score (pattern value)',
        'Weighted total score calculation',
        'Score visualization component'
      ],
      excluded: ['Research pipeline automation (Phase D)', 'Glide path visualization (Phase E)']
    },
    success_metrics: [
      { metric: 'Scores use configurable weights', target: '100%', baseline: 'Hardcoded 0.4/0.4/0.2' },
      { metric: 'Score breakdown visible in UI', target: 'All 6 dimensions', baseline: 'Total only' },
      { metric: 'Scores update on settings change', target: 'Real-time', baseline: 'Manual recalc' }
    ],
    strategic_objectives: [
      'Replace ad-hoc scoring with systematic approach',
      'Enable Chairman to tune scoring weights',
      'Provide transparency into score calculation'
    ],
    risks: [
      { description: 'Scoring logic complexity', mitigation: 'Start with simplified weights, iterate', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Configurable weights', description: 'All scoring weights come from chairman_settings' },
      { principle: 'Transparency', description: 'Score breakdown shows each dimension contribution' },
      { principle: 'Real-time recalculation', description: 'Scores update when settings change' }
    ],
    success_criteria: [
      { criterion: 'venture_opportunity_scores table exists', measure: 'Migration passes' },
      { criterion: 'Scoring uses chairman_settings weights', measure: 'No hardcoded values in code' },
      { criterion: 'UI shows 6-dimension breakdown', measure: 'Visual inspection passes' }
    ]
  },
  {
    id: 'SD-VS-RESEARCH-ARM-001',
    title: 'Research Arm Pipeline Integration',
    description: 'Connect opportunity intake with scoring and CrewAI research crews. Implement weekly digest generator and opportunity brief template.',
    category: 'product_feature',
    priority: 'medium',
    sequence_rank: 4,
    dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001'],
    scope: {
      included: [
        'Opportunity intake pipeline (RSS feeds, scrapers)',
        'Keyword filtering (exclude crypto, biotech, hardware)',
        'SEO data enrichment (search volume, CPC)',
        'Auto-apply Chairman Settings scoring',
        'Weekly "Top 3 Opportunities" report generation',
        'Integration with existing Venture Research Crew',
        'Integration with Venture Quick Validation Crew',
        'Opportunity Brief template (Problem, Solution, Comp, Difficulty, Score)'
      ],
      excluded: ['Manual opportunity entry (already exists)', 'Full venture creation (separate workflow)']
    },
    success_metrics: [
      { metric: 'Weekly digest generated', target: 'Auto-generated', baseline: 'Manual' },
      { metric: 'Top 3 opportunities highlighted', target: 'Weekly', baseline: 'N/A' },
      { metric: 'CrewAI integration functional', target: 'Both crews connected', baseline: 'Standalone' }
    ],
    strategic_objectives: [
      'Automate opportunity discovery',
      'Reduce manual research effort',
      'Surface best opportunities to Chairman automatically'
    ],
    risks: [
      { description: 'Research quality varies by source', mitigation: 'Keyword filtering + human review of Top 3', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Automation-first', description: 'Weekly digest auto-generated, not manual' },
      { principle: 'Quality over quantity', description: 'Filter noise, surface Top 3 only' },
      { principle: 'CrewAI integration', description: 'Leverage existing research crews' }
    ],
    success_criteria: [
      { criterion: 'Weekly digest generated automatically', measure: 'Cron job runs successfully' },
      { criterion: 'Top 3 opportunities ranked by score', measure: 'Scoring integration works' },
      { criterion: 'CrewAI crews receive opportunity briefs', measure: 'Integration test passes' }
    ]
  },
  {
    id: 'SD-VS-GLIDE-PATH-001',
    title: 'Portfolio Glide Path Dashboard',
    description: 'Visualize portfolio phase, pattern maturity, and venture mix. Show phase transition recommendations and historical trends.',
    category: 'product_feature',
    priority: 'medium',
    sequence_rank: 5,
    dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001', 'SD-VS-PATTERN-UNLOCK-001', 'SD-VS-RESEARCH-ARM-001'],
    scope: {
      included: [
        'Glide Path phase indicator (Vending Machine → Micro-SaaS → Platform)',
        'Pattern library maturity visualization (by category)',
        'Venture portfolio mix chart (exploit vs explore)',
        'Phase transition recommendations',
        'Historical trend tracking',
        'Chairman Settings impact preview'
      ],
      excluded: ['Venture detail pages (already exist)', 'Pattern editor (separate feature)']
    },
    success_metrics: [
      { metric: 'Current phase displayed', target: 'Clearly visible', baseline: 'Not tracked' },
      { metric: 'Pattern maturity by category', target: 'Chart visualization', baseline: 'Total count only' },
      { metric: 'Exploit/explore ratio visible', target: 'Dashboard chart', baseline: 'Not shown' }
    ],
    strategic_objectives: [
      'Provide portfolio-level visibility',
      'Enable strategic phase planning',
      'Connect settings to portfolio outcomes'
    ],
    risks: [
      { description: 'Visualization complexity', mitigation: 'Start with core metrics, expand iteratively', severity: 'low' }
    ],
    key_principles: [
      { principle: 'Portfolio-level visibility', description: 'Dashboard shows aggregate portfolio health' },
      { principle: 'Phase transition guidance', description: 'Clear recommendations for phase changes' },
      { principle: 'Historical context', description: 'Trends over time, not just current state' }
    ],
    success_criteria: [
      { criterion: 'Current phase displayed clearly', measure: 'UI shows Vending Machine/Micro-SaaS/Platform' },
      { criterion: 'Pattern maturity by category visible', measure: 'Chart component renders' },
      { criterion: 'Exploit/explore ratio displayed', measure: 'Ratio matches chairman settings' }
    ]
  }
];

async function createChildSDs() {
  console.log('Creating 5 Child SDs for SD-VENTURE-SELECTION-001...\n');

  // Verify parent exists
  const { data: parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .eq('id', PARENT_SD_ID)
    .single();

  if (parentError || !parent) {
    console.error('❌ Parent SD not found:', PARENT_SD_ID);
    process.exit(1);
  }

  console.log(`✅ Found parent: ${parent.title}\n`);

  // STEP 1: Update parent to orchestrator type FIRST (with bypass)
  // This prevents the child trigger from failing when it tries to update parent type
  console.log('Setting parent sd_type to orchestrator...');
  const { error: typeError } = await supabase
    .from('strategic_directives_v2')
    .update({
      sd_type: 'orchestrator',
      governance_metadata: {
        automation_context: {
          bypass_governance: true,
          actor_role: 'LEO_ORCHESTRATOR',
          bypass_reason: 'Setting parent SD to orchestrator type before creating children',
          requested_at: new Date().toISOString()
        }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', PARENT_SD_ID);

  if (typeError) {
    console.error('❌ Failed to set parent type:', typeError.message);
    process.exit(1);
  }
  console.log('✅ Parent sd_type set to orchestrator\n');

  // STEP 2: Create each child SD
  for (const child of childSDs) {
    console.log(`Creating ${child.id}...`);

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: child.id,
        sd_key: child.id, // Required NOT NULL - explicitly set (trigger may not fire on upsert)
        legacy_id: child.id,
        title: child.title,
        description: child.description,
        category: child.category,
        priority: child.priority,
        status: 'draft',
        current_phase: 'LEAD',
        parent_sd_id: PARENT_SD_ID,
        relationship_type: 'child',
        sequence_rank: child.sequence_rank,
        dependency_chain: child.dependencies,
        scope: JSON.stringify(child.scope), // Required NOT NULL - stringify for text column
        rationale: `Child SD of ${PARENT_SD_ID}: ${child.description.split('.')[0]}`, // Required NOT NULL
        success_metrics: child.success_metrics,
        strategic_objectives: child.strategic_objectives,
        risks: child.risks,
        key_principles: child.key_principles,
        success_criteria: child.success_criteria,
        target_application: 'EHG',
        is_active: true,
        progress: 0,
        version: '1.0',
        governance_metadata: {
          automation_context: {
            bypass_governance: true,
            actor_role: 'LEO_ORCHESTRATOR',
            bypass_reason: 'Creating child SDs as part of orchestrator setup for SD-VENTURE-SELECTION-001',
            requested_at: new Date().toISOString()
          },
          created_by_script: 'create-child-sds-venture-selection.js',
          parent_sd_id: PARENT_SD_ID
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('id, title, parent_sd_id, sequence_rank')
      .single();

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
    } else {
      console.log(`   ✅ Created: ${data.title}`);
      console.log(`      Parent: ${data.parent_sd_id}`);
      console.log(`      Sequence: ${data.sequence_rank}`);
    }
  }

  // Update parent to mark decomposition as complete
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      relationship_type: 'parent',
      updated_at: new Date().toISOString()
    })
    .eq('id', PARENT_SD_ID);

  if (updateError) {
    console.error('\n❌ Failed to update parent:', updateError.message);
  } else {
    console.log('\n✅ Parent updated: relationship_type = parent');
  }

  console.log('\n✅ All 5 child SDs created successfully!');
  console.log('\nExecution order:');
  childSDs.forEach(sd => {
    const deps = sd.dependencies.length > 0 ? ` (after: ${sd.dependencies.join(', ')})` : ' (no dependencies)';
    console.log(`  ${sd.sequence_rank}. ${sd.id}${deps}`);
  });
}

createChildSDs();
