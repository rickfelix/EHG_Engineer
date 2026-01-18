#!/usr/bin/env node
/**
 * Create Quality Lifecycle System SDs
 *
 * Creates orchestrator + 5 child SDs for the unified feedback management system.
 * Based on 4 rounds of triangulated design (Claude, OpenAI, Gemini).
 *
 * Source: docs/vision/quality-lifecycle-system.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ORCHESTRATOR_ID = 'SD-QUALITY-LIFECYCLE-001';

const orchestratorSD = {
  id: ORCHESTRATOR_ID,
  title: 'Quality Lifecycle System - Unified Feedback Management',
  description: 'Orchestrator for implementing the Quality Lifecycle System: a unified approach to quality and feedback management spanning five stages (Prevention, Capture, Triage, Resolution, Learning). Features: unified feedback table (issues + enhancements), multi-venture architecture, dual interfaces (CLI /inbox + Web UI /quality), noise control with AI triage, and release planning. Based on 4 rounds of triangulated design (Claude, OpenAI, Gemini).',
  category: 'product_feature',
  priority: 'high',
  sd_type: 'orchestrator',
  scope: JSON.stringify({
    included: [
      'Unified feedback table with type discriminator (issues + enhancements)',
      'Releases table and feedback_sd_map junction table',
      '/inbox CLI command with all subcommands (new, snooze, wontfix, convert, filters)',
      '/quality Web UI section (inbox, backlog, releases, patterns)',
      'Feedback widget (FAB) for EHG application',
      'Triage/prioritization logic (P0-P3 for issues, value/effort for enhancements)',
      'Automatic error capture with deduplication',
      '/uat integration (failures create feedback records)',
      'Risk Router updates for unified feedback table'
    ],
    excluded: [
      'AI Triage (future SD-QUALITY-AI-001) - duplicate detection, pattern matching, auto-suggestions',
      'Venture Template (future SD-QUALITY-VENTURE-001) - package widget for venture reuse'
    ]
  }),
  rationale: 'Current workflow lacks a unified system for tracking issues AND enhancement requests across EHG and future ventures. Triangulation consensus: solo entrepreneur needs ONE inbox, not separate systems. This system provides noise control to prevent feedback fatigue.',
  success_metrics: [
    { metric: 'Unified feedback table operational', target: 'Issues + enhancements in same table', baseline: 'Separate uat_defects attempt' },
    { metric: '/inbox command functional', target: 'All subcommands working', baseline: 'Does not exist' },
    { metric: '/quality Web UI section', target: '4 views: inbox, backlog, releases, patterns', baseline: 'Does not exist' },
    { metric: 'Feedback widget deployed', target: 'FAB in EHG app', baseline: 'Does not exist' },
    { metric: 'Error capture operational', target: 'Auto-captures runtime errors', baseline: 'No capture' }
  ],
  strategic_objectives: [
    'Provide unified quality tracking across EHG and ventures',
    'Enable both developers (CLI) and business users (Web UI) to report/manage feedback',
    'Prevent feedback fatigue through triage and noise control',
    'Bridge gap between feedback capture and SD creation'
  ],
  risks: [
    { description: 'Feedback fatigue from high volume', mitigation: 'Prioritization, snooze, burst grouping, AI triage (future)', severity: 'high' },
    { description: 'Schema changes ripple to features', mitigation: 'Lock DB PRD early; migration review checkpoint', severity: 'medium' },
    { description: 'Web SD scope creep (widget + 4 views)', mitigation: 'Strict sub-tasking; split Widget if >1 week', severity: 'medium' }
  ],
  key_principles: [
    { principle: 'Unified feedback', description: 'One table for issues AND enhancements with type discriminator' },
    { principle: 'Multi-venture architecture', description: 'source_application field enables cross-venture tracking' },
    { principle: 'Dual interfaces', description: 'CLI for developers, Web UI for business users - no parity needed' },
    { principle: 'CLI verifies data model first', description: 'Per triangulation: CLI validates schema before UI investment' }
  ],
  success_criteria: [
    { criterion: 'Feedback persisted via CLI and Web', measure: 'Both interfaces write to same table' },
    { criterion: 'Priority calculation working', measure: 'P0-P3 for issues, high/med/low for enhancements' },
    { criterion: '/uat failures create feedback', measure: 'uat_failure source_type populated' },
    { criterion: 'Error capture operational', measure: 'auto_capture source_type populated' }
  ]
};

const childSDs = [
  {
    id: 'SD-QUALITY-DB-001',
    title: 'Quality Lifecycle Database Foundation',
    description: 'Create unified feedback table, releases table, and feedback_sd_map junction table with all indexes and RLS policies. Export shared priority calculation utilities for use by other SDs.',
    category: 'database_schema',
    priority: 'high',
    sd_type: 'database',
    sequence_rank: 1,
    dependencies: [],
    scope: {
      included: [
        'CREATE TABLE feedback with type discriminator, multi-venture fields, triage fields',
        'CREATE TABLE releases for bundling enhancements into versioned releases',
        'CREATE TABLE feedback_sd_map junction table (many-to-many)',
        'ALTER strategic_directives_v2 ADD target_release_id',
        'All indexes per schema design (type, source_app, status, severity, priority, etc.)',
        'RLS policies for feedback and releases tables',
        'Shared priority calculation utility (exportable function)',
        'Database migration script'
      ],
      excluded: [
        'CLI command implementation (SD-QUALITY-CLI-001)',
        'Triage business logic (SD-QUALITY-TRIAGE-001)'
      ]
    },
    success_metrics: [
      { metric: 'Schema migration passes', target: 'Zero errors', baseline: 'N/A' },
      { metric: 'All indexes created', target: '12+ indexes', baseline: 'N/A' },
      { metric: 'RLS policies active', target: 'Role-based access', baseline: 'N/A' },
      { metric: 'Priority utility exportable', target: 'Used by CLI and UI', baseline: 'N/A' }
    ],
    strategic_objectives: [
      'Establish unified feedback schema per triangulation consensus',
      'Enable multi-venture tracking from day one',
      'Provide shared utilities to prevent duplication'
    ],
    risks: [
      { description: 'Schema changes after other SDs start', mitigation: 'Lock PRD early, migration checkpoint', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Type discriminator', description: "Single table with 'issue' | 'enhancement' type" },
      { principle: 'Multi-venture ready', description: 'source_application field on every record' },
      { principle: 'Junction table', description: 'Many-to-many for SD bundling (2/3 triangulation consensus)' }
    ],
    success_criteria: [
      { criterion: 'Migration applies cleanly', measure: 'No errors' },
      { criterion: 'Can insert both types', measure: 'Issue and enhancement inserts succeed' },
      { criterion: 'Priority calc works', measure: 'Function returns P0-P3 / high-med-low' }
    ]
  },
  {
    id: 'SD-QUALITY-CLI-001',
    title: '/inbox CLI Command Implementation',
    description: 'Create /inbox command with all subcommands for reporting and managing feedback via CLI. Includes aliases /feedback and /issues.',
    category: 'product_feature',
    priority: 'high',
    sd_type: 'feature',
    sequence_rank: 2,
    dependencies: ['SD-QUALITY-DB-001'],
    scope: {
      included: [
        '/inbox - Show all open feedback (prioritized, hide snoozed)',
        '/inbox new - Report a new issue (default type)',
        '/inbox new --type=enhancement - Suggest a new feature',
        '/inbox [ID] - View/update specific feedback',
        '/inbox snooze [ID] [duration] - Snooze feedback',
        '/inbox wontfix [ID] - Mark issue as wont fix',
        '/inbox wontdo [ID] - Mark enhancement as wont do',
        '/inbox convert [ID] - Convert issue <-> enhancement',
        'Filter flags: --issues, --enhance, --mine, --critical, --app, --all',
        'Aliases: /feedback and /issues',
        'AskUserQuestion form for /inbox new with type toggle'
      ],
      excluded: [
        'Database schema (SD-QUALITY-DB-001)',
        'Priority calculation logic (SD-QUALITY-TRIAGE-001)',
        'Web UI (SD-QUALITY-UI-001)'
      ]
    },
    success_metrics: [
      { metric: '/inbox command functional', target: 'All subcommands working', baseline: 'Does not exist' },
      { metric: 'Feedback submitted via CLI', target: 'Creates database record', baseline: 'N/A' },
      { metric: 'Filters work correctly', target: 'All flags filter as expected', baseline: 'N/A' }
    ],
    strategic_objectives: [
      'Provide developer-friendly CLI for feedback management',
      'Enable rapid issue reporting during development',
      'Support power-user workflows with filters'
    ],
    risks: [
      { description: 'Complex subcommand structure', mitigation: 'Clear help output, consistent patterns', severity: 'low' }
    ],
    key_principles: [
      { principle: 'Single entry point', description: '/inbox handles both report (new) and manage (list/view/update)' },
      { principle: 'Type toggle', description: 'Default to issue, explicit flag for enhancement' },
      { principle: 'Aliases for discoverability', description: '/feedback and /issues point to /inbox' }
    ],
    success_criteria: [
      { criterion: '/inbox new creates feedback', measure: 'Database record created' },
      { criterion: 'Filters narrow results', measure: 'Each flag filters correctly' },
      { criterion: 'Aliases work', measure: '/feedback and /issues invoke /inbox' }
    ]
  },
  {
    id: 'SD-QUALITY-TRIAGE-001',
    title: 'Triage & Prioritization Engine',
    description: 'Implement priority calculation, burst grouping for error storms, snooze/ignore logic, and default "My Focus Context" view. Critical filter between Capture and Resolution.',
    category: 'infrastructure',
    priority: 'high',
    sd_type: 'infrastructure',
    sequence_rank: 3,
    dependencies: ['SD-QUALITY-DB-001'],
    scope: {
      included: [
        'Priority calculation: Issues (severity + venture context -> P0-P3)',
        'Priority calculation: Enhancements (value/effort matrix -> high/med/low)',
        'Burst grouping: 100 errors in 1 minute = 1 grouped issue',
        'Snooze logic: 24h, 7d, custom duration',
        'Ignore pattern: Auto-hide matching errors (e.g., generic 404s)',
        'Wont Fix / Wont Do status handling',
        'Default view: "My Focus Context" (P0/P1 issues + high-value enhancements)',
        'Integration with DB priority utility'
      ],
      excluded: [
        'AI Triage suggestions (future SD-QUALITY-AI-001)',
        'CLI display (SD-QUALITY-CLI-001)',
        'Web UI display (SD-QUALITY-UI-001)'
      ]
    },
    success_metrics: [
      { metric: 'Priority correctly calculated', target: 'P0-P3 for issues, high/med/low for enhancements', baseline: 'N/A' },
      { metric: 'Burst grouping prevents flooding', target: '100 errors -> 1 grouped item', baseline: 'No grouping' },
      { metric: 'Snooze hides items correctly', target: 'Hidden until snoozed_until', baseline: 'N/A' }
    ],
    strategic_objectives: [
      'Prevent feedback fatigue (triangulation #1 risk)',
      'Enable focus on high-priority items',
      'Handle error storms gracefully'
    ],
    risks: [
      { description: 'Over-aggressive filtering hides important items', mitigation: 'P0 always visible, clear unsnooze path', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Divergent criteria by type', description: 'Issues use severity, enhancements use value/effort' },
      { principle: 'Noise control is critical', description: 'Solo entrepreneur cannot triage 1000 items' },
      { principle: 'My Focus Context default', description: 'Show only P0/P1 and high-value by default' }
    ],
    success_criteria: [
      { criterion: 'Priority calc matches spec', measure: 'Unit tests pass' },
      { criterion: 'Burst grouping works', measure: 'Integration test with 100 errors' },
      { criterion: 'Snoozed items hidden', measure: 'Query excludes snoozed' }
    ]
  },
  {
    id: 'SD-QUALITY-UI-001',
    title: '/quality Web UI Section & Feedback Widget',
    description: 'Create /quality section in EHG web app with 4 views (inbox, backlog, releases, patterns) plus feedback widget (FAB). Includes API endpoints.',
    category: 'product_feature',
    priority: 'high',
    sd_type: 'feature',
    sequence_rank: 4,
    dependencies: ['SD-QUALITY-DB-001'],
    scope: {
      included: [
        '/quality/inbox - All feedback, unified view with filters (Venture, Type, Priority, Release)',
        '/quality/backlog - Enhancements grouped by venture, drag to schedule',
        '/quality/releases - Timeline view by venture, release cards with progress',
        '/quality/patterns - AI-detected clusters (future: cross-venture patterns)',
        'Feedback widget (FAB) - Bottom-right, opens modal',
        'Feedback form - Type toggle, description, severity/value fields',
        'API endpoints for CRUD operations',
        '"Needs Attention" section for P0/P1',
        'Fatigue Meter visual (per Gemini suggestion)',
        'Cross-links to Governance section'
      ],
      excluded: [
        'Database schema (SD-QUALITY-DB-001)',
        'CLI commands (SD-QUALITY-CLI-001)',
        'Triage logic (SD-QUALITY-TRIAGE-001) - UI just displays',
        'AI pattern detection (future SD-QUALITY-AI-001)'
      ]
    },
    success_metrics: [
      { metric: '/quality section accessible', target: 'Top-level navigation', baseline: 'Does not exist' },
      { metric: 'All 4 views functional', target: 'Inbox, backlog, releases, patterns', baseline: 'N/A' },
      { metric: 'Feedback widget deployed', target: 'FAB visible on all pages', baseline: 'N/A' },
      { metric: 'Feedback submission works', target: 'Creates database record', baseline: 'N/A' }
    ],
    strategic_objectives: [
      'Provide business-friendly Web UI for Chairman and users',
      'Enable feedback submission without leaving workflow',
      'Visualize release planning and backlog'
    ],
    risks: [
      { description: 'Scope creep (4 views + widget)', mitigation: 'Strict sub-tasking; split Widget if >1 week', severity: 'medium' },
      { description: 'UI complexity overwhelms', mitigation: 'Fatigue Meter visual, focus on P0/P1', severity: 'low' }
    ],
    key_principles: [
      { principle: 'Separate from Governance', description: 'Quality = feedback lifecycle, Governance = SD execution' },
      { principle: 'Unified inbox with filters', description: 'Not per-venture navigation (triangulation consensus)' },
      { principle: 'FAB always visible', description: 'Feedback widget in bottom-right corner' }
    ],
    success_criteria: [
      { criterion: 'Widget opens modal', measure: 'Click FAB -> form appears' },
      { criterion: 'Form submits feedback', measure: 'Database record created' },
      { criterion: 'Views load correctly', measure: 'Each /quality/* route renders' }
    ]
  },
  {
    id: 'SD-QUALITY-INT-001',
    title: 'System Integrations (Error Capture, /uat, Risk Router)',
    description: 'Create automatic error capture, integrate /uat failures with feedback table, update Risk Router to read from unified table.',
    category: 'infrastructure',
    priority: 'high',
    sd_type: 'infrastructure',
    sequence_rank: 5,
    dependencies: ['SD-QUALITY-DB-001'],
    scope: {
      included: [
        'Error capture utility for Node.js (global error handler)',
        'Integration into key modules (handoff, validation, database)',
        'Deduplication logic (hash + time window)',
        'Update /uat result-recorder to write to feedback table on FAIL',
        'source_type: uat_failure for /uat failures',
        'Update Risk Router to read from feedback table',
        'Error capture does not crash application (fail-safe)',
        'Browser error capture (for Web UI)',
        '/learn connection: resolved feedback -> pattern detection'
      ],
      excluded: [
        'Database schema (SD-QUALITY-DB-001)',
        'CLI commands (SD-QUALITY-CLI-001)',
        'Web UI (SD-QUALITY-UI-001)'
      ]
    },
    success_metrics: [
      { metric: 'Error capture operational', target: 'Runtime errors logged automatically', baseline: 'No capture' },
      { metric: 'Deduplication working', target: 'Same error -> increment count, not new record', baseline: 'N/A' },
      { metric: '/uat failures create feedback', target: 'uat_failure source_type', baseline: 'Writes to missing table' },
      { metric: 'Risk Router reads from feedback', target: 'Routes defects correctly', baseline: 'Reads from uat_defects' }
    ],
    strategic_objectives: [
      'Ensure no errors are lost (auto-capture)',
      'Unify all feedback sources into single table',
      'Enable Risk Router to work with unified data'
    ],
    risks: [
      { description: 'Integration touches fragile code', mitigation: 'Flag as infrastructure; prioritize tests', severity: 'medium' },
      { description: 'Error capture causes cascading failures', mitigation: 'Fail-safe with try/catch around capture', severity: 'medium' }
    ],
    key_principles: [
      { principle: 'Auto-captured errors always issues', description: "type: 'issue' for all auto-capture" },
      { principle: 'Fail-safe capture', description: 'Error in capture must not crash application' },
      { principle: 'Unified data source', description: 'All feedback sources write to same table' }
    ],
    success_criteria: [
      { criterion: 'Intentional error captured', measure: 'Database record created' },
      { criterion: 'Duplicate error increments count', measure: 'occurrence_count > 1' },
      { criterion: '/uat FAIL creates feedback', measure: 'source_type = uat_failure' }
    ]
  }
];

async function createQualityLifecycleSDs() {
  console.log('Creating Quality Lifecycle System SDs...\n');

  // STEP 1: Create orchestrator SD
  console.log(`Creating orchestrator: ${ORCHESTRATOR_ID}...`);

  const { data: orchData, error: orchError } = await supabase
    .from('strategic_directives_v2')
    .upsert({
      id: orchestratorSD.id,
      sd_key: orchestratorSD.id,
      legacy_id: orchestratorSD.id,
      title: orchestratorSD.title,
      description: orchestratorSD.description,
      category: orchestratorSD.category,
      priority: orchestratorSD.priority,
      sd_type: 'orchestrator',
      status: 'draft',
      current_phase: 'LEAD',
      relationship_type: 'parent',
      scope: orchestratorSD.scope,
      rationale: orchestratorSD.rationale,
      success_metrics: orchestratorSD.success_metrics,
      strategic_objectives: orchestratorSD.strategic_objectives,
      risks: orchestratorSD.risks,
      key_principles: orchestratorSD.key_principles,
      success_criteria: orchestratorSD.success_criteria,
      target_application: 'EHG',
      is_active: true,
      progress: 0,
      version: '1.0',
      governance_metadata: {
        automation_context: {
          bypass_governance: true,
          actor_role: 'LEO_ORCHESTRATOR',
          bypass_reason: 'Creating Quality Lifecycle System orchestrator SD',
          requested_at: new Date().toISOString()
        },
        created_by_script: 'create-quality-lifecycle-sds.js',
        triangulation: {
          rounds: 4,
          reviewers: ['Claude Opus 4.5', 'OpenAI GPT-4o', 'AntiGravity (Gemini)'],
          solo_fit_score: 9,
          consensus: 'Single orchestrator with 5 children'
        }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select('id, title')
    .single();

  if (orchError) {
    console.error(`Failed to create orchestrator: ${orchError.message}`);
    process.exit(1);
  }
  console.log(`Created orchestrator: ${orchData.title}\n`);

  // STEP 2: Create child SDs
  console.log('Creating child SDs...\n');

  for (const child of childSDs) {
    console.log(`Creating ${child.id}...`);

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: child.id,
        sd_key: child.id,
        legacy_id: child.id,
        title: child.title,
        description: child.description,
        category: child.category,
        priority: child.priority,
        sd_type: child.sd_type,
        status: 'draft',
        current_phase: 'LEAD',
        parent_sd_id: ORCHESTRATOR_ID,
        relationship_type: 'child',
        sequence_rank: child.sequence_rank,
        dependency_chain: child.dependencies,
        scope: JSON.stringify(child.scope),
        rationale: `Child SD of ${ORCHESTRATOR_ID}: ${child.description.split('.')[0]}`,
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
            bypass_reason: `Creating child SD for Quality Lifecycle: ${child.id}`,
            requested_at: new Date().toISOString()
          },
          created_by_script: 'create-quality-lifecycle-sds.js',
          parent_sd_id: ORCHESTRATOR_ID
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('id, title, parent_sd_id, sequence_rank')
      .single();

    if (error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.log(`   Created: ${data.title}`);
      console.log(`      Sequence: ${data.sequence_rank}`);
      console.log(`      Dependencies: ${child.dependencies.length > 0 ? child.dependencies.join(', ') : 'none'}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Quality Lifecycle System SDs Created Successfully!');
  console.log('='.repeat(70));
  console.log(`\nOrchestrator: ${ORCHESTRATOR_ID}`);
  console.log('\nChild SDs (execution order):');
  childSDs.forEach(sd => {
    const deps = sd.dependencies.length > 0 ? ` (after: ${sd.dependencies.join(', ')})` : '';
    console.log(`  ${sd.sequence_rank}. ${sd.id} [${sd.sd_type}]${deps}`);
  });

  console.log('\nDependency Graph:');
  console.log('');
  console.log('                        SD-QUALITY-LIFECYCLE-001 (orchestrator)');
  console.log('                                     |');
  console.log('                    +----------------+----------------+');
  console.log('                    |                                 |');
  console.log('                    v                                 |');
  console.log('           SD-QUALITY-DB-001                          |');
  console.log('              (database)                              |');
  console.log('                    |                                 |');
  console.log('      +-------------+-------------+                   |');
  console.log('      |             |             |                   |');
  console.log('      v             v             v                   |');
  console.log(' SD-QUALITY   SD-QUALITY   SD-QUALITY                 |');
  console.log('  -CLI-001   -TRIAGE-001   -INT-001                   |');
  console.log(' (feature)  (infrastructure)(infrastructure)          |');
  console.log('                    |                                 |');
  console.log('                    v                                 |');
  console.log('           SD-QUALITY-UI-001 <------------------------+');
  console.log('              (feature)');
  console.log('');
  console.log('Sequencing: DB first (blocks all), then CLI/Triage/Int in parallel, UI last');
  console.log('\nSD Types:');
  console.log('  - orchestrator: No PRD required, 70% gate threshold');
  console.log('  - database: PRD required, no E2E, 75% gate threshold');
  console.log('  - feature: PRD + E2E required, 85% gate threshold');
  console.log('  - infrastructure: PRD required, no E2E, 80% gate threshold');
  console.log('\nNext steps:');
  console.log('  1. Run: node scripts/orchestrator-preflight.js SD-QUALITY-LIFECYCLE-001');
  console.log('  2. Start LEAD phase on the orchestrator SD');
  console.log('  3. Work children: DB first, then CLI/Triage/Int, UI last');
}

createQualityLifecycleSDs();
