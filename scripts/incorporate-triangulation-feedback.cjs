#!/usr/bin/env node
/**
 * Incorporate Triangulation Feedback into Strategic Directives
 *
 * Updates the 3 parent SDs with findings from the AI review triangulation:
 * - OpenAI, AntiGravity (Gemini), Claude Code independent reviews
 *
 * Run: node scripts/incorporate-triangulation-feedback.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Triangulation findings for each SD
const triangulationData = {
  'SD-GENESIS-COMPLETE-001': {
    completion_estimate: {
      antigravity: 30,
      openai: 40,
      claude: 35,
      consensus: 35,
      previous_estimate: 50,
      delta: -15
    },
    critical_blockers: [
      {
        id: 'BLOCKER-001',
        title: 'generatePRD() is STUBBED',
        description: 'Returns hardcoded template at genesis-pipeline.js:190-211, not LLM-generated',
        severity: 'critical',
        file: 'ehg/scripts/genesis/genesis-pipeline.js',
        line: '190-211',
        all_three_confirm: true
      },
      {
        id: 'BLOCKER-002',
        title: 'Schema Mismatch Between Repos',
        description: 'Engineer DB simulation_sessions missing columns: updated_at, ratified_at, soul_extraction_id, vercel_deployment_id, deployed_at, deployment_error',
        severity: 'critical',
        source: 'openai',
        all_three_confirm: false
      },
      {
        id: 'BLOCKER-003',
        title: 'Stage 16/17 Vocabulary Collision',
        description: 'Genesis "Stage 16/17" (soul extraction) ≠ Venture Workflow "Stage 16/17" (AI CEO Agent). CompleteWorkflowOrchestrator imports Stage16AICEOAgent, not soul-extractor',
        severity: 'architectural',
        all_three_confirm: true
      },
      {
        id: 'BLOCKER-004',
        title: 'production-generator Methods Empty',
        description: 'generateComponents(), generatePages(), generateTypes(), generateServices(), generateConfig() all return empty arrays',
        severity: 'critical',
        file: 'ehg/scripts/genesis/production-generator.js',
        line: '443-478',
        all_three_confirm: true
      }
    ],
    incorrect_assumptions: [
      {
        assumption: 'Architecture is sound',
        reality: 'Two parallel tracks that dont connect: CLI Genesis scripts vs React Workflow Orchestrator'
      },
      {
        assumption: 'Stage 16/17 scripts just need wiring',
        reality: 'They are completely different systems with different purposes'
      },
      {
        assumption: 'PRDs just need connecting',
        reality: 'PRD generation is completely stubbed - no LLM integration exists'
      }
    ],
    action_items: [
      'Create SD-GENESIS-DATAMODEL-001 to fix schema alignment FIRST',
      'Document stage vocabulary: Genesis stages vs Venture lifecycle stages',
      'Add RBAC/authentication to /api/genesis/ratify endpoint',
      'Implement OpenAI/Claude PRD generation with provider abstraction',
      'Complete production-generator methods for all file types'
    ],
    user_stories_enhanced: [
      {
        sd: 'SD-GENESIS-PRD-001',
        story: 'As a Solo Operator, I want to input a raw idea and receive a structured PRD with functional requirements, user stories, and data model',
        acceptance_criteria: [
          'Input accepts freeform text (1-500 words)',
          'Output is PRD with: title, executive_summary, functional_requirements[], user_stories[], data_model',
          'Uses OpenAI GPT-4 or Claude for generation',
          'Includes confidence score for each section',
          'Provider abstraction allows switching between OpenAI/Gemini/Claude',
          'PRD quality scoring before scaffolding (rubric)'
        ],
        source: 'triangulation_consensus'
      },
      {
        sd: 'SD-GENESIS-DATAMODEL-001',
        story: 'As a Developer, I want simulation_sessions schema to match what genesis-pipeline.js, vercel-deploy.js, and ratify.ts actually write',
        acceptance_criteria: [
          'simulation_sessions has updated_at, ratified_at, and deployment metadata columns',
          'epistemic_status constraint includes statuses used in code (ratified, rejected, deployment_failed)',
          'Inserts/updates succeed without silent failures',
          'FK relationships enforced (ventures.simulation_id, soul_extractions.simulation_id)'
        ],
        source: 'openai_finding'
      }
    ],
    prd_additions: {
      security: 'Add Supabase RLS + middleware auth check to all Genesis endpoints. /api/genesis/ratify currently has NO authentication.',
      schema_changes: [
        'ALTER TABLE simulation_sessions ADD COLUMN updated_at TIMESTAMPTZ',
        'ALTER TABLE simulation_sessions ADD COLUMN ratified_at TIMESTAMPTZ',
        'ALTER TABLE simulation_sessions ADD COLUMN soul_extraction_id UUID',
        'ALTER TABLE simulation_sessions ADD COLUMN vercel_deployment_id TEXT',
        'ALTER TABLE simulation_sessions ADD COLUMN deployed_at TIMESTAMPTZ',
        'ALTER TABLE simulation_sessions ADD COLUMN deployment_error TEXT',
        'ALTER TABLE simulation_sessions DROP CONSTRAINT IF EXISTS simulation_sessions_epistemic_status_check',
        'ALTER TABLE simulation_sessions ADD CONSTRAINT simulation_sessions_epistemic_status_check CHECK (epistemic_status IN (simulation, official, archived, incinerated, ratified, rejected, deployment_failed))'
      ]
    }
  },

  'SD-VENTURE-SELECTION-001': {
    completion_estimate: {
      antigravity: 60,
      openai: 60,
      claude: 55,
      consensus: 58,
      previous_estimate: 60,
      delta: -2
    },
    critical_blockers: [
      {
        id: 'BLOCKER-001',
        title: 'Chairman Settings Table Missing',
        description: 'chairman_dashboard_config table does not exist in DB. useChairmanConfig falls back to localStorage (error code 42P01)',
        severity: 'critical',
        file: 'ehg/src/hooks/useChairmanConfig.ts',
        line: '81-91',
        source: 'openai'
      },
      {
        id: 'BLOCKER-002',
        title: 'Scoring Weights Hardcoded',
        description: 'blueprintScoring.ts uses hardcoded weights (0.4/0.4/0.2), not configurable by Chairman',
        severity: 'high',
        file: 'ehg/src/services/blueprintScoring.ts',
        line: '96-99'
      },
      {
        id: 'BLOCKER-003',
        title: 'Missing Critical Patterns',
        description: '2 of 4 critical patterns MISSING: StripeService, BackgroundJob. CRUDService and AuthService exist.',
        severity: 'high',
        all_three_confirm: true
      }
    ],
    pattern_library_status: {
      total_patterns: 45,
      existing: ['CRUDService', 'AuthService', 'AuthMiddleware (Python)', 'useFetch', 'useDebounce'],
      missing: ['StripeService', 'BackgroundJob'],
      by_type: {
        component: 17,
        page: 8,
        hook: 3,
        service: 3,
        api_route: 3,
        layout: 3,
        rls_policy: 3,
        migration: 3,
        database_table: 2
      }
    },
    action_items: [
      'Create chairman_dashboard_config table migration FIRST',
      'Add scoring weights to Chairman Settings UI',
      'Create StripeService scaffold pattern',
      'Create BackgroundJob scaffold pattern',
      'Replace hardcoded weights in blueprintScoring.ts with DB config'
    ],
    user_stories_enhanced: [
      {
        sd: 'SD-VS-CHAIRMAN-SETTINGS-001',
        story: 'As a Chairman, I want selection settings stored in the database, so my preferences persist across devices',
        acceptance_criteria: [
          'chairman_dashboard_config table exists in DB migrations',
          'RLS restricts to auth.uid()',
          'UI reads/writes without localStorage fallback',
          'Risk Tolerance dropdown (Conservative/Moderate/Aggressive)',
          'Maximum Concurrent Ventures numeric input (1-32)',
          'Portfolio Balance sliders (% Vending Machine, % Micro-SaaS, % Platform)'
        ],
        source: 'triangulation_consensus'
      },
      {
        sd: 'SD-VS-SCORING-RUBRIC-001',
        story: 'As a Chairman, I want configurable scoring weights, so selection matches my current strategy',
        acceptance_criteria: [
          'UI exposes weights for market_size, technical_feasibility, chairman_fit',
          'Weights are stored per user/company',
          'Scoring engine uses stored weights (not hardcoded)',
          'Score history tracking for trend analysis',
          'Default weights: 0.3/0.4/0.3'
        ],
        source: 'triangulation_consensus'
      }
    ]
  },

  'SD-BLIND-SPOTS-001': {
    completion_estimate: {
      antigravity: 40,
      openai: 45,
      claude: 35,
      consensus: 40,
      previous_estimate: 40,
      delta: 0
    },
    eva_status: {
      completion: 70,
      evidence: [
        'evaEventBus.ts: 764 lines, full DLQ, retry, replay',
        'evaTaskContracts.ts: Task contract system',
        'briefing.ts: Health + decisions + budget warnings API',
        'DB tables: eva_events, eva_decisions, eva_ventures exist'
      ],
      verdict: 'EVA core is robust but managing ventures that dont exist'
    },
    non_eva_status: {
      legal_compliance: { completion: 10, evidence: 'ComplianceTab exists, no Series LLC logic' },
      pricing_patterns: { completion: 30, evidence: 'Stage15PricingStrategy exists' },
      failure_learning: { completion: 5, evidence: 'failure_patterns table empty' },
      skills_inventory: { completion: 5, evidence: 'skills_inventory table empty' },
      pattern_deprecation: { completion: 0, evidence: 'No lifecycle management found' }
    },
    key_insight: 'We have an Operating System (EVA) with no Apps (Ventures). Fix Genesis first.',
    action_items: [
      'Pause EVA deepening until Genesis produces ventures',
      'Focus on EVA Dashboard (32-tile health grid) once ventures exist',
      'Treat legal/pricing/failure as "pattern packs" EVA can recommend',
      'Build alert escalation (P0/P1/P2) with rate limiting'
    ],
    user_stories_enhanced: [
      {
        sd: 'SD-EVA-DASHBOARD-001',
        story: 'As a Chairman, I want a 32-tile grid showing all ventures with traffic light colors (Green/Yellow/Red)',
        acceptance_criteria: [
          'Grid displays up to 32 venture tiles',
          'Colors: Green (healthy), Yellow (warning), Red (critical)',
          'Status determined by: uptime, revenue trend, support tickets',
          'Click tile opens venture detail panel',
          'Health calculated every 15 minutes',
          'State changes trigger EVA events (SYSTEM_HEALTH_CHANGE)'
        ],
        source: 'triangulation_consensus'
      }
    ]
  }
};

async function incorporateFeedback() {
  console.log('Incorporating triangulation feedback into SDs...\n');

  for (const [sdKey, feedback] of Object.entries(triangulationData)) {
    console.log(`\n=== Updating ${sdKey} ===`);

    // Get current SD
    const { data: sd, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_key', sdKey)
      .single();

    if (fetchError || !sd) {
      console.log(`  ERROR: Could not fetch ${sdKey}: ${fetchError?.message}`);
      continue;
    }

    // Merge triangulation findings into metadata
    const updatedMetadata = {
      ...sd.metadata,
      triangulation_review: {
        date: '2026-01-01',
        reviewers: ['OpenAI GPT-4', 'AntiGravity (Gemini)', 'Claude Code (Opus 4.5)'],
        completion_estimate: feedback.completion_estimate,
        critical_blockers: feedback.critical_blockers,
        incorrect_assumptions: feedback.incorrect_assumptions,
        action_items: feedback.action_items,
        user_stories_enhanced: feedback.user_stories_enhanced,
        prd_additions: feedback.prd_additions,
        pattern_library_status: feedback.pattern_library_status,
        eva_status: feedback.eva_status,
        non_eva_status: feedback.non_eva_status,
        key_insight: feedback.key_insight
      }
    };

    // Update progress_percentage based on consensus
    const progressPercentage = feedback.completion_estimate?.consensus || sd.progress_percentage;

    // Update the SD
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        progress_percentage: progressPercentage,
        updated_at: new Date().toISOString()
      })
      .eq('sd_key', sdKey);

    if (updateError) {
      console.log(`  ERROR updating ${sdKey}: ${updateError.message}`);
    } else {
      console.log(`  Updated ${sdKey}:`);
      console.log(`    - Progress: ${progressPercentage}%`);
      console.log(`    - Blockers: ${feedback.critical_blockers?.length || 0}`);
      console.log(`    - Action items: ${feedback.action_items?.length || 0}`);
      console.log(`    - Enhanced stories: ${feedback.user_stories_enhanced?.length || 0}`);
    }
  }

  // Also update the children definitions with blocking info
  console.log('\n=== Updating child SD priorities ===');

  // Get SD-GENESIS-COMPLETE-001 and update its children order
  const { data: genesisSd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', 'SD-GENESIS-COMPLETE-001')
    .single();

  if (genesisSd?.metadata?.children_definitions) {
    const children = genesisSd.metadata.children_definitions;

    // Add DATAMODEL as first child if not present, or mark it as priority
    const hasDataModel = children.some(c => c.sd_key?.includes('DATAMODEL'));

    if (!hasDataModel) {
      // Insert SD-GENESIS-DATAMODEL-001 as first child
      const dataModelChild = {
        sd_key: 'SD-GENESIS-DATAMODEL-001',
        title: 'Genesis Data Model Alignment',
        description: 'Align simulation_sessions schema between Engineer DB and EHG app. MUST be done FIRST per triangulation.',
        priority: 1,
        blocking: true,
        triangulation_note: 'OpenAI identified schema mismatch - silent failures in production if not fixed'
      };

      children.unshift(dataModelChild);

      // Update priorities of other children
      children.forEach((child, idx) => {
        if (child.sd_key !== 'SD-GENESIS-DATAMODEL-001') {
          child.priority = (child.priority || idx) + 1;
        }
      });

      const { error: childUpdateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          metadata: {
            ...genesisSd.metadata,
            children_definitions: children
          }
        })
        .eq('sd_key', 'SD-GENESIS-COMPLETE-001');

      if (!childUpdateError) {
        console.log('  Added SD-GENESIS-DATAMODEL-001 as priority blocker');
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('Triangulation feedback incorporated into:');
  console.log('  - SD-GENESIS-COMPLETE-001 (35% complete, 4 blockers)');
  console.log('  - SD-VENTURE-SELECTION-001 (58% complete, 3 blockers)');
  console.log('  - SD-BLIND-SPOTS-001 (40% complete, EVA ready but idle)');
  console.log('\nKey action: Fix Genesis first. EVA is waiting for ventures to manage.');
}

incorporateFeedback().catch(console.error);
