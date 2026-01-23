#!/usr/bin/env node

/**
 * Create Parent SD: SD-VENTURE-SELECTION-001
 * Configurable Venture Selection Framework with Chairman Settings
 *
 * Origin: Triangulation Research (OpenAI + Gemini + Claude Code)
 * Research Document: docs/prompts/triangulation-venture-selection-unified.md
 *
 * This is a PARENT SD that will spawn 5 child SDs:
 * - Phase A: SD-VS-CHAIRMAN-SETTINGS-001 (Configuration System)
 * - Phase B: SD-VS-SCORING-RUBRIC-001 (Scoring Engine)
 * - Phase C: SD-VS-PATTERN-UNLOCK-001 (Pattern Library Expansion)
 * - Phase D: SD-VS-RESEARCH-ARM-001 (Research Pipeline)
 * - Phase E: SD-VS-GLIDE-PATH-001 (Portfolio Dashboard)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createVentureSelectionSD() {
  console.log('Creating Parent SD: SD-VENTURE-SELECTION-001...\n');

  const childSDs = [
    {
      id: 'SD-VS-CHAIRMAN-SETTINGS-001',
      title: 'Chairman Settings Configuration System',
      phase: 'A',
      priority: 'high',
      purpose: 'Database schema + UI for configurable venture selection parameters',
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
        excluded: [
          'Scoring engine (Phase B)',
          'Pattern creation (Phase C)',
          'Research pipeline (Phase D)'
        ]
      },
      dependencies: [],
      blocks: ['SD-VS-SCORING-RUBRIC-001', 'SD-VS-RESEARCH-ARM-001', 'SD-VS-GLIDE-PATH-001'],
      deliverables: [
        'chairman_settings database table with schema',
        'ChairmanSettings UI component',
        'Settings API endpoints',
        'Default settings seed data',
        'RLS policies'
      ],
      success_criteria: [
        'Chairman can view and edit settings via UI',
        'Settings persist to database',
        'Default values applied when no override exists',
        'Settings accessible via API'
      ],
      estimated_effort: 'Small (1 session)',
      pattern_unlocks: 0
    },
    {
      id: 'SD-VS-SCORING-RUBRIC-001',
      title: 'Venture Opportunity Scoring Engine',
      phase: 'B',
      priority: 'high',
      purpose: 'Automated scoring based on feedback speed, pattern match, market demand',
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
          'Integration with existing Venture Research Crew (CrewAI)',
          'Score visualization component'
        ],
        excluded: [
          'Research pipeline automation (Phase D)',
          'Glide path visualization (Phase E)'
        ]
      },
      dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001'],
      blocks: ['SD-VS-RESEARCH-ARM-001', 'SD-VS-GLIDE-PATH-001'],
      deliverables: [
        'venture_opportunity_scores table',
        'ScoringService pattern',
        'Score calculation API',
        'OpportunityScoreCard UI component',
        'Integration with Venture Research Crew'
      ],
      success_criteria: [
        'Opportunities receive automated scores',
        'Scores update when Chairman Settings change',
        'Weights configurable via settings',
        'Scores visible in opportunity review UI'
      ],
      estimated_effort: 'Medium (1-2 sessions)',
      pattern_unlocks: 1
    },
    {
      id: 'SD-VS-PATTERN-UNLOCK-001',
      title: 'Priority Pattern Library Expansion',
      phase: 'C',
      priority: 'high',
      purpose: 'Add critical patterns identified by triangulation: billing, RBAC, CRUD hook, background jobs',
      scope: {
        included: [
          'StripeService pattern - billing, subscriptions, metering, webhooks',
          'RBACMiddleware pattern - roles, permissions, org membership, row-level policies',
          'useCRUD Hook - standardized Supabase binding for tables (from Gemini insight)',
          'BackgroundJob pattern - queue, retry logic, idempotency, status tracking UI',
          'Template code for each pattern',
          'Variables/configuration for each pattern',
          'Dependencies documentation',
          'Usage examples'
        ],
        excluded: [
          'NotificationService (future SD)',
          'SearchService (future SD)',
          'WebhookHandler (covered partially by StripeService)',
          'AuditLog (future SD)'
        ]
      },
      dependencies: [],
      blocks: ['SD-VS-GLIDE-PATH-001'],
      deliverables: [
        'StripeService in scaffold_patterns table',
        'RBACMiddleware in scaffold_patterns table',
        'useCRUD hook in scaffold_patterns table',
        'BackgroundJob in scaffold_patterns table',
        'Pattern documentation for each'
      ],
      success_criteria: [
        'All 4 patterns have working template code',
        'Patterns can be instantiated via Genesis pipeline',
        'Each pattern has documented variables',
        'Dependencies clearly listed'
      ],
      estimated_effort: 'Medium (2 sessions)',
      pattern_unlocks: 4
    },
    {
      id: 'SD-VS-RESEARCH-ARM-001',
      title: 'Research Arm Pipeline Integration',
      phase: 'D',
      priority: 'medium',
      purpose: 'Connect opportunity intake → scoring → Chairman presentation',
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
        excluded: [
          'Manual opportunity entry (already exists)',
          'Full venture creation (separate workflow)'
        ]
      },
      dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001'],
      blocks: ['SD-VS-GLIDE-PATH-001'],
      deliverables: [
        'PipelineService pattern',
        'Opportunity intake automation',
        'Weekly digest generator',
        'OpportunityBrief template',
        'CrewAI integration hooks'
      ],
      success_criteria: [
        'Opportunities auto-ingested from configured sources',
        'Scoring applied automatically',
        'Weekly report generated and accessible',
        'Top 3 opportunities highlighted for Chairman'
      ],
      estimated_effort: 'Medium (1-2 sessions)',
      pattern_unlocks: 1
    },
    {
      id: 'SD-VS-GLIDE-PATH-001',
      title: 'Portfolio Glide Path Dashboard',
      phase: 'E',
      priority: 'medium',
      purpose: 'Visualize phase progress, pattern maturity, venture mix',
      scope: {
        included: [
          'Glide Path phase indicator (Vending Machine → Micro-SaaS → Platform)',
          'Pattern library maturity visualization (by category)',
          'Venture portfolio mix chart (exploit vs explore)',
          'Phase transition recommendations',
          'Historical trend tracking',
          'Chairman Settings impact preview'
        ],
        excluded: [
          'Venture detail pages (already exist)',
          'Pattern editor (separate feature)'
        ]
      },
      dependencies: ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001', 'SD-VS-PATTERN-UNLOCK-001', 'SD-VS-RESEARCH-ARM-001'],
      blocks: [],
      deliverables: [
        'GlidePathDashboard component',
        'PatternMaturityChart component',
        'PortfolioMixChart component',
        'PhaseTransitionAdvisor component'
      ],
      success_criteria: [
        'Current phase clearly displayed',
        'Pattern maturity visible by category',
        'Exploit/explore ratio visualized',
        'Recommendations for phase transitions shown'
      ],
      estimated_effort: 'Medium (1-2 sessions)',
      pattern_unlocks: 0
    }
  ];

  const strategicDirective = {
    // ========================================================================
    // REQUIRED FIELDS
    // ========================================================================
    id: 'SD-VENTURE-SELECTION-001',

    title: 'Configurable Venture Selection Framework with Chairman Settings',

    description: 'Implement a data-driven, configurable venture selection system that prioritizes incremental progress business models (vending machine concept), leverages pattern library maturity assessment, and enables strategic glide path adjustments over time. This framework emerged from triangulation research across three AI systems (OpenAI, Gemini, Claude Code) analyzing optimal venture selection strategies for EHG.',

    rationale: 'Current venture selection is ad-hoc without systematic scoring or configuration. Triangulation research identified key insights: (1) Prioritize "transaction #1" businesses over power-law models, (2) Pattern library maturity determines build feasibility, (3) Chairman needs configurable parameters for risk tolerance and portfolio balance, (4) Research arm should continuously surface scored opportunities. This SD implements a framework to operationalize these insights.',

    scope: JSON.stringify({
      included: [
        'Chairman Settings configuration system (database + UI)',
        'Venture opportunity scoring engine with configurable weights',
        'Priority pattern library expansion (4 critical patterns)',
        'Research arm pipeline integration with existing CrewAI crews',
        'Portfolio glide path dashboard visualization'
      ],
      excluded: [
        'Venture creation workflow (exists)',
        'Full pattern library rebuild (future)',
        'External API integrations beyond scoring enrichment',
        'Mobile app support'
      ],
      boundaries: [
        'Uses existing Venture Research Crew and Quick Validation Crew',
        'Builds on existing scaffold_patterns infrastructure',
        'Integrates with existing admin dashboard'
      ]
    }),

    category: 'product_feature',

    priority: 'high',

    status: 'draft',

    // ========================================================================
    // LEO PROTOCOL COMPLIANCE FIELDS
    // ========================================================================
    sd_key: 'SD-VENTURE-SELECTION-001',

    target_application: 'EHG',

    current_phase: 'LEAD',

    sd_type: 'feature',

    strategic_intent: 'Enable systematic, data-driven venture selection that maximizes learning speed through incremental progress models while building pattern library maturity over a defined glide path.',

    strategic_objectives: [
      'Implement configurable Chairman Settings for venture selection parameters',
      'Create automated scoring engine based on feedback speed, pattern match, and market demand',
      'Add 4 critical unlock patterns: StripeService, RBACMiddleware, useCRUD, BackgroundJob',
      'Integrate research arm pipeline with existing CrewAI infrastructure',
      'Visualize portfolio glide path and pattern maturity progress'
    ],

    success_criteria: [
      'Chairman can configure selection parameters via UI',
      'Opportunities receive automated scores based on configurable weights',
      'Pattern library expanded with 4 production-ready patterns',
      'Weekly opportunity digest generated automatically',
      'Glide path phase and pattern maturity visible in dashboard'
    ],

    key_changes: [
      'New chairman_settings table in database',
      'New venture_opportunity_scores table',
      'New scoring engine service',
      '4 new patterns in scaffold_patterns table',
      'Research pipeline automation',
      'Glide path dashboard components'
    ],

    key_principles: [
      'Incremental progress over power-law: Prioritize ventures with immediate feedback',
      'Pattern-first: Assess pattern distance before committing to ventures',
      'Configurable: Chairman can adjust parameters as strategy evolves',
      'Data-driven: Score opportunities systematically, not gut-feel',
      'Glide path: Start conservative, increase risk as patterns mature',
      'Triangulation-validated: Framework derived from multi-AI research consensus'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // ========================================================================
    // OPTIONAL FIELDS
    // ========================================================================
    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'Existing Venture Research Crew (CrewAI) must be operational',
      'Existing Venture Quick Validation Crew (CrewAI) must be operational',
      'Existing scaffold_patterns table and Genesis infrastructure',
      'Admin dashboard for UI components'
    ],

    risks: [
      {
        description: 'Scoring weights may not reflect actual venture success predictors',
        mitigation: 'Make weights configurable, iterate based on outcome data',
        severity: 'medium'
      },
      {
        description: 'Pattern unlock scope creep (trying to add too many patterns)',
        mitigation: 'Strictly limit to 4 patterns in this SD, defer others',
        severity: 'low'
      },
      {
        description: 'Research pipeline may surface low-quality opportunities',
        mitigation: 'Keyword filtering + human review of Top 3',
        severity: 'medium'
      },
      {
        description: 'Chairman Settings complexity could overwhelm users',
        mitigation: 'Provide sensible defaults, advanced settings hidden initially',
        severity: 'low'
      }
    ],

    success_metrics: [
      { metric: 'Time to evaluate new opportunity', target: '< 5 minutes', baseline: 'ad-hoc process' },
      { metric: 'Pattern library growth', target: '4 new patterns', baseline: '45 patterns' },
      { metric: 'Opportunity digest automation', target: 'Weekly auto-generated', baseline: 'Manual' },
      { metric: 'Scoring alignment with Chairman intuition', target: '≥80%', baseline: 'No scoring' },
      { metric: 'Glide path visibility', target: 'Phase visible and actionable', baseline: 'Not tracked' }
    ],

    implementation_guidelines: [
      'Start with Chairman Settings (Phase A) - foundational for all others',
      'Scoring Engine (Phase B) depends on settings being available',
      'Pattern Unlock (Phase C) can run in parallel with A/B',
      'Research Arm (Phase D) requires both settings and scoring',
      'Glide Path (Phase E) is the final integration layer',
      'Each child SD goes through full LEAD→PLAN→EXEC',
      'Reference research: docs/prompts/triangulation-venture-selection-unified.md'
    ],

    metadata: {
      origin: 'Triangulation Research (OpenAI + Gemini + Claude Code)',
      research_document: 'docs/prompts/triangulation-venture-selection-unified.md',
      triangulation_date: '2026-01-01',

      // Triangulation consensus
      triangulation_consensus: {
        incremental_over_power_law: 'All three prioritize transaction #1 businesses',
        pattern_library_state: 'UI mature, logic patterns weak - scaffolds exist but not battle-tested',
        exploit_explore_ratio: '70-75% exploit, 25-30% explore',
        risk_tolerance_default: 35,
        pattern_threshold_default: 75,
        time_to_revenue_default: 21,
        priority_unlocks: ['StripeService', 'RBACMiddleware', 'useCRUD', 'BackgroundJob']
      },

      // Chairman Settings defaults (from synthesis)
      chairman_settings_defaults: {
        risk_tolerance: 35,
        pattern_threshold: 75,
        time_to_revenue_max: 21,
        feedback_speed: 8,
        growth_curve: 'linear',
        capital_cap: 2000,
        new_pattern_budget: 2,
        exploit_ratio: 75,
        explore_ratio: 25,
        require_dogfooding: true,
        kill_gate_mode: 'advisory'
      },

      // Scoring rubric (from synthesis)
      scoring_rubric: {
        feedback_speed: { weight: 25, description: 'TTFD < 7d = 25, > 60d = 0' },
        pattern_match: { weight: 20, description: '>80% = 20, <50% = 0' },
        market_demand: { weight: 20, description: 'Clear buyer + pain = 20' },
        unit_economics: { weight: 15, description: '>70% margin = 15' },
        distribution_fit: { weight: 10, description: 'Channel exists = 10' },
        strategic_unlock: { weight: 10, description: 'New pattern value = 10' }
      },

      // Glide path phases (from Gemini)
      glide_path: [
        { phase: 'Vending Machines', months: '1-6', risk: 25, pattern_threshold: 85, focus: 'Cash + validate patterns' },
        { phase: 'Micro-SaaS', months: '6-12', risk: 45, pattern_threshold: 70, focus: 'Subscription revenue' },
        { phase: 'Platform Bets', months: '12+', risk: 60, pattern_threshold: 55, focus: 'Ecosystem leverage' }
      ],

      // Clone opportunities identified (from all three)
      clone_opportunities: [
        { name: 'PDF Chat', difficulty: 'Low', pattern_distance: 25 },
        { name: 'Background Remover', difficulty: 'Medium', pattern_distance: 30 },
        { name: 'Notion-to-Website', difficulty: 'Medium', pattern_distance: 40 },
        { name: 'Link-in-Bio', difficulty: 'Low', pattern_distance: 20 },
        { name: 'Screenshot Beautifier', difficulty: 'Low', pattern_distance: 20 },
        { name: 'YouTube Summarizer', difficulty: 'Low', pattern_distance: 25 },
        { name: 'JSON/CSV Converter', difficulty: 'Ultra-low', pattern_distance: 10 }
      ],

      // Child SD definitions
      child_sds: childSDs,
      child_count: childSDs.length,

      // Dependency graph
      dependency_graph: {
        'SD-VS-CHAIRMAN-SETTINGS-001': [],
        'SD-VS-SCORING-RUBRIC-001': ['SD-VS-CHAIRMAN-SETTINGS-001'],
        'SD-VS-PATTERN-UNLOCK-001': [],
        'SD-VS-RESEARCH-ARM-001': ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001'],
        'SD-VS-GLIDE-PATH-001': ['SD-VS-CHAIRMAN-SETTINGS-001', 'SD-VS-SCORING-RUBRIC-001', 'SD-VS-PATTERN-UNLOCK-001', 'SD-VS-RESEARCH-ARM-001']
      },

      // Execution order
      execution_order: [
        'SD-VS-CHAIRMAN-SETTINGS-001',
        'SD-VS-PATTERN-UNLOCK-001',
        'SD-VS-SCORING-RUBRIC-001',
        'SD-VS-RESEARCH-ARM-001',
        'SD-VS-GLIDE-PATH-001'
      ],

      // Total pattern unlocks across all children
      total_pattern_unlocks: 6,

      // Existing infrastructure leveraged
      existing_infrastructure: [
        'Venture Research Crew (CrewAI)',
        'Venture Quick Validation Crew (CrewAI)',
        'scaffold_patterns table (45 patterns)',
        'Admin dashboard',
        'Genesis pipeline'
      ]
    }
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${strategicDirective.id} already exists. Updating...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ SD ${strategicDirective.id} updated successfully!`);
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ SD ${strategicDirective.id} created successfully!`);
    console.log('\n' + '═'.repeat(70));
    console.log('📊 STRATEGIC DIRECTIVE DETAILS');
    console.log('═'.repeat(70));
    console.log(`ID:                 ${data.id}`);
    console.log(`Title:              ${data.title}`);
    console.log(`Priority:           ${data.priority}`);
    console.log(`Status:             ${data.status}`);
    console.log(`Target Application: ${data.target_application}`);
    console.log(`Current Phase:      ${data.current_phase}`);
    console.log(`SD Type:            ${data.sd_type}`);
    console.log('═'.repeat(70));

    console.log('\n📋 CHILD SDs (5 total):');
    childSDs.forEach((child, i) => {
      console.log(`   ${i+1}. [Phase ${child.phase}] ${child.id}`);
      console.log(`      Title: ${child.title}`);
      console.log(`      Pattern Unlocks: ${child.pattern_unlocks}`);
    });

    console.log('\n🔧 CHAIRMAN SETTINGS DEFAULTS:');
    const defaults = strategicDirective.metadata.chairman_settings_defaults;
    console.log(`   Risk Tolerance:     ${defaults.risk_tolerance}/100`);
    console.log(`   Pattern Threshold:  ${defaults.pattern_threshold}%`);
    console.log(`   Time to Revenue:    ${defaults.time_to_revenue_max} days`);
    console.log(`   Exploit/Explore:    ${defaults.exploit_ratio}/${defaults.explore_ratio}`);

    console.log('\n📈 GLIDE PATH PHASES:');
    strategicDirective.metadata.glide_path.forEach(phase => {
      console.log(`   ${phase.phase} (Months ${phase.months}): Risk ${phase.risk}, Threshold ${phase.pattern_threshold}%`);
    });

    console.log('\n🎯 Next Steps:');
    console.log('1. Run LEAD validation: node lib/sub-agent-executor.js VALIDATION SD-VENTURE-SELECTION-001');
    console.log('2. Create PRD: node scripts/add-prd-to-database.js SD-VENTURE-SELECTION-001');
    console.log('3. Get LEAD approval for parent SD');
    console.log('4. During PLAN phase, decompose into child SDs');
    console.log('\n📄 Research Document: docs/prompts/triangulation-venture-selection-unified.md');

    return data;

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }
}

// Run if executed directly
createVentureSelectionSD()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
