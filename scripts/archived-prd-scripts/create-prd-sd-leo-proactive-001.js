#!/usr/bin/env node

/**
 * PRD Creation Script for SD-LEO-PROACTIVE-001
 * LEO Protocol v4.4: Proactive SD Proposal System
 *
 * This PRD implements the shift from reactive SD creation to proactive SD proposals
 * based on Kath Korevec's Proactive Agents pattern (Google Labs).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-LEO-PROACTIVE-001';
const PRD_TITLE = 'LEO Protocol v4.4: Proactive SD Proposal System';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch Strategic Directive
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, category, priority')
    .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID}`)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.legacy_id || sdData.id}`);
  console.log(`   Category: ${sdData.category}`);

  // Build PRD Data
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: prdId,
    sd_id: sdData.id,
    directive_id: sdData.legacy_id || sdData.id,

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'infrastructure',
    priority: 'high',

    executive_summary: `
This PRD defines the implementation of a Proactive SD Proposal System for LEO Protocol v4.4, transforming SD creation from a reactive workflow (user creates SDs) to a proactive pattern (AI observes signals and proposes SDs, user approves).

The system addresses the core friction point in LEO Protocol: scope uncertainty at SD creation. Users currently struggle to define scope before exploring the codebase. By having AI observe retrospectives, code health metrics, and dependency vulnerabilities, the system can pre-propose SDs with evidence-backed scope, reducing cognitive load while maintaining governance.

Key capabilities:
- Observer agents monitor three signal types: retrospective patterns, code health degradation, dependency vulnerabilities
- Multi-channel proposal surfacing: Claude Code terminal, web UI inbox, SD queue inline
- Tiered urgency system (critical/medium/low) with appropriate expiration windows
- Learning system that improves proposal quality based on dismissal feedback
- Full integration with existing LEO infrastructure (chairman_alerts, system_events, agent_execution_traces)
    `.trim(),

    business_context: `
**Problem Statement**:
The biggest friction in LEO Protocol is scope uncertainty at SD creation. Users must define scope before they've explored the codebase, leading to:
- Vague initial scopes that require multiple revisions
- Over-scoped SDs that balloon during implementation
- Under-scoped SDs that miss critical work
- Delayed starts while users research before creating SDs

**Business Value**:
- Reduce SD creation time by 50%+ (from intent to draft SD)
- Surface recurring issues proactively before they cause more failures
- Identify security vulnerabilities (CVEs) before escalation
- Capture institutional knowledge from retrospectives automatically
- Reduce cognitive load on users while maintaining governance

**Success Metrics**:
1. SD creation time reduced by 50%+ within 30 days
2. >60% proposal approval rate within 30 days
3. All 3 observer types generating proposals within 7 days
4. Dismissal rate decreases over 30 days (learning effect)
    `.trim(),

    technical_context: `
**Existing Infrastructure to Leverage**:
- issue_patterns table: Stores recurring issues with proven_solutions and success_rate
- retrospectives table: Contains what_needs_improvement, key_learnings, action_items
- agent_execution_traces: Audit trail for observer actions
- system_events: Lifecycle event logging
- chairman_alerts: Critical alert surfacing
- pattern_detection_engine.js: 70% Jaccard similarity matching
- issue_knowledge_base.js: 4-factor weighted scoring (similarity 40%, recency 20%, success 30%, specificity 10%)

**Technical Constraints**:
- Must use database-first architecture (no markdown files as source of truth)
- RLS policies must use fn_is_chairman() for proposal reads
- Observers must use service_role for writes
- Idempotent approval function required to prevent double-SD creation
- Dedupe keys must be deterministic for same signals

**Integration Points**:
- CLAUDE.md generation (scripts/generate-claude-md-from-db.js)
- SD queue display (scripts/sd-next.js)
- Chairman alerts (chairman_alerts table)
- Sub-agent execution tracking (sub_agent_execution_results table)
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create sd_proposals table with full schema',
        description: 'Database table storing all proposal data with proper constraints, indexes, and RLS policies',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Table includes all fields from schema design (id, title, description, proposed_scope, trigger_type, confidence_score, urgency_level, status, dedupe_key, etc.)',
          'Partial unique index on dedupe_key WHERE status IN (pending, seen, snoozed)',
          'RLS policies: fn_is_chairman() for SELECT, service_role for ALL',
          'Tiered expiration: critical=7d, medium=14d, low=30d',
          'FK relationships to strategic_directives_v2 and agent_execution_traces'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Create fn_create_sd_from_proposal() function',
        description: 'Idempotent PostgreSQL function that creates an SD from an approved proposal',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Uses FOR UPDATE row lock to prevent race conditions',
          'Returns existing SD if proposal already approved (idempotent)',
          'Creates SD in draft status (never auto-advances)',
          'Updates proposal with approved status, approved_at timestamp, and created_sd_id FK',
          'Logs PROPOSAL_APPROVED event to system_events'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Create v_proposal_learning analytics view',
        description: 'View for tracking proposal approval rates and learning metrics by trigger type',
        priority: 'HIGH',
        acceptance_criteria: [
          'Groups by trigger_type',
          'Shows total_proposals, approved, dismissed counts',
          'Calculates approval_rate percentage',
          'Shows most_common_dismissal reason',
          'Shows avg_approved_confidence and avg_dismissed_confidence'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Implement Retrospective Pattern Observer',
        description: 'Edge Function that detects recurring patterns across retrospectives and proposes SDs',
        priority: 'HIGH',
        acceptance_criteria: [
          'Queries retrospectives table for published retrospectives',
          'Uses embeddings (text-embedding-3-small) for semantic similarity clustering',
          'Proposes SD when pattern appears 3+ times across distinct SDs',
          'Uses deterministic dedupe_key: retro_pattern:{sha256(sorted_retro_ids)}',
          'Logs to agent_execution_traces and system_events'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Implement Code Health Observer',
        description: 'Webhook-triggered Edge Function that monitors code quality metrics',
        priority: 'HIGH',
        acceptance_criteria: [
          'Parses ESLint, TypeScript, and coverage reports from CI artifacts',
          'Proposes SD when coverage < 60% OR error count delta > 10',
          'Uses weekly dedupe_key: code_health:{metric}:{path}:{weekNumber}',
          'Allows weekly re-proposals for persistent issues'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Implement Dependency Observer',
        description: 'Scheduled Edge Function that monitors npm audit for vulnerabilities',
        priority: 'HIGH',
        acceptance_criteria: [
          'Runs npm audit --json or fetches from cached CI artifact',
          'Proposes SD for severity=high|critical vulnerabilities',
          'Auto-creates chairman_alerts entry for critical CVEs',
          'Uses deterministic dedupe_key: dependency_update:{package}:{cveId}',
          'Sets urgency_level=critical for CVEs'
        ]
      },
      {
        id: 'FR-7',
        requirement: 'Update CLAUDE.md generation to include proposals',
        description: 'Modify session initialization to query and display pending proposals',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Queries sd_proposals WHERE status=pending ORDER BY urgency_level, confidence_score',
          'Displays proposals with urgency badge, title, trigger source, confidence',
          'Shows approve/dismiss commands for each proposal',
          'Limits display to top 5 proposals'
        ]
      },
      {
        id: 'FR-8',
        requirement: 'Add proposal display to SD queue (sd-next.js)',
        description: 'Show proposed SDs inline with the regular SD queue',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Displays "SUGGESTED (Proactive Proposals)" section below active SDs',
          'Shows urgency badge, title, trigger type',
          'Provides approve/dismiss quick actions'
        ]
      },
      {
        id: 'FR-9',
        requirement: 'Create proposal approve/dismiss CLI commands',
        description: 'npm scripts for approving or dismissing proposals from terminal',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'npm run proposal:approve <id> - calls fn_create_sd_from_proposal',
          'npm run proposal:dismiss <id> <reason> - updates status with dismissal_reason',
          'Validates proposal exists and is in approvable state',
          'Displays created SD info on approval'
        ]
      },
      {
        id: 'FR-10',
        requirement: 'Implement confidence scoring algorithm',
        description: '5-factor weighted scoring for proposal confidence',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Evidence strength: 30% (CVE severity, lint error delta, coverage delta)',
          'Recurrence: 25% (count of occurrences across time/SDs)',
          'Freshness: 15% (new signals score higher, stale signals decay)',
          'Blast radius: 15% (modules/services impacted)',
          'Prior feedback: 15% (penalties from dismissals by trigger_type + path)'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'security',
        requirement: 'RLS policies must restrict proposal access to chairman role',
        target_metric: 'Only users passing fn_is_chairman() can view proposals'
      },
      {
        type: 'performance',
        requirement: 'Observer functions must complete within Edge Function timeout',
        target_metric: '<30 seconds per observer execution'
      },
      {
        type: 'reliability',
        requirement: 'Observers must be idempotent and handle retries gracefully',
        target_metric: 'Same signal produces same dedupe_key, no duplicate proposals'
      },
      {
        type: 'scalability',
        requirement: 'Proposal system must handle high proposal volumes',
        target_metric: 'Max 5 pending proposals per trigger type, tiered expiration'
      },
      {
        type: 'usability',
        requirement: 'Proposals must be non-blocking and non-annoying',
        target_metric: '<50% confidence hidden, tiered urgency prevents alert fatigue'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL database schema with RLS',
        description: 'sd_proposals table with proper constraints, indexes, RLS policies, and helper functions',
        dependencies: ['Supabase PostgreSQL', 'fn_is_chairman() function']
      },
      {
        id: 'TR-2',
        requirement: 'Supabase Edge Functions for observers',
        description: 'TypeScript Edge Functions in supabase/functions/ directory',
        dependencies: ['Supabase Edge Functions', 'pg_cron for scheduling']
      },
      {
        id: 'TR-3',
        requirement: 'OpenAI embeddings for semantic similarity',
        description: 'text-embedding-3-small for retrospective clustering',
        dependencies: ['OpenAI API key', 'Existing embedding infrastructure']
      }
    ],

    system_architecture: `
## Architecture Overview

The Proactive SD Proposal System consists of three layers:

### 1. Observer Layer (Signal Detection)
- **Retrospective Pattern Observer**: Supabase Edge Function, triggered daily via pg_cron
- **Code Health Observer**: Supabase Edge Function, triggered via CI webhook
- **Dependency Observer**: Supabase Edge Function, triggered daily via pg_cron

### 2. Proposal Layer (Storage & Scoring)
- **sd_proposals table**: Central storage with lifecycle tracking
- **Confidence scoring**: 5-factor weighted algorithm
- **Deduplication**: Deterministic dedupe_key prevents duplicate proposals
- **Learning system**: Tracks dismissal reasons to improve quality

### 3. Surfacing Layer (User Interface)
- **Claude Code Terminal**: Proposals shown at session start
- **SD Queue (sd-next.js)**: Inline proposal section
- **Web UI**: Proposal inbox page (future)

## Data Flow

\`\`\`
Signal Sources          Observers              Proposals           Surfacing
─────────────          ─────────              ─────────           ─────────
Retrospectives ───────> Retro Observer ─────┐
                                             │
Code Health    ───────> Health Observer ────>│──> sd_proposals ──> CLAUDE.md
(CI webhook)                                 │     table           sd-next.js
                                             │                     Web UI
npm audit      ───────> Dependency Observer ─┘
\`\`\`

## Integration Points

| Existing Component | Integration |
|-------------------|-------------|
| agent_execution_traces | Observer audit trail |
| chairman_alerts | Critical proposal alerts |
| system_events | Proposal lifecycle events |
| issue_patterns | Pattern source for retrospective observer |
| retrospectives | Source data for pattern detection |
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'sd_proposals',
          columns: [
            'id (UUID PK)',
            'venture_id (UUID FK)',
            'target_application (TEXT)',
            'title (VARCHAR 200)',
            'description (TEXT)',
            'proposed_scope (JSONB)',
            'evidence_data (JSONB)',
            'trigger_type (VARCHAR 40)',
            'trigger_source_id (TEXT)',
            'trigger_trace_id (UUID FK)',
            'correlation_id (UUID)',
            'created_by (TEXT)',
            'confidence_score (NUMERIC 3,2)',
            'impact_score (NUMERIC 3,2)',
            'urgency_level (VARCHAR 20)',
            'dedupe_key (TEXT)',
            'status (VARCHAR 20)',
            'seen_at (TIMESTAMPTZ)',
            'approved_at (TIMESTAMPTZ)',
            'dismissed_at (TIMESTAMPTZ)',
            'snoozed_until (TIMESTAMPTZ)',
            'dismissal_reason (VARCHAR 30)',
            'created_sd_id (UUID FK)',
            'linked_alert_id (UUID)',
            'created_at (TIMESTAMPTZ)',
            'expires_at (TIMESTAMPTZ)'
          ],
          relationships: [
            'venture_id -> ventures(id)',
            'trigger_trace_id -> agent_execution_traces(id)',
            'created_sd_id -> strategic_directives_v2(id)'
          ]
        }
      ],
      views: [
        {
          name: 'v_proposal_learning',
          description: 'Analytics view for proposal approval rates by trigger type'
        }
      ],
      functions: [
        {
          name: 'fn_create_sd_from_proposal',
          description: 'Idempotent function to create SD from approved proposal'
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'supabase/functions/observer-retrospectives',
        method: 'POST',
        description: 'Retrospective Pattern Observer Edge Function',
        request: { trigger: 'pg_cron or manual' },
        response: { proposals_created: 'number', errors: 'array' }
      },
      {
        endpoint: 'supabase/functions/observer-code-health',
        method: 'POST',
        description: 'Code Health Observer Edge Function',
        request: { ci_artifact_url: 'string', metrics: 'object' },
        response: { proposals_created: 'number', errors: 'array' }
      },
      {
        endpoint: 'supabase/functions/observer-dependencies',
        method: 'POST',
        description: 'Dependency Observer Edge Function',
        request: { trigger: 'pg_cron' },
        response: { proposals_created: 'number', alerts_created: 'number', errors: 'array' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'Claude Code Terminal Proposal Display',
        description: 'Show pending proposals at session initialization with urgency badges and quick actions',
        wireframe: 'See plan file: /home/rickf/.claude/plans/temporal-leaping-bachman.md'
      },
      {
        component: 'SD Queue Proposal Section',
        description: 'Inline "SUGGESTED" section in sd-next.js output showing proposed SDs',
        wireframe: 'Text-based terminal UI'
      }
    ],

    implementation_approach: `
## Phase 1: Database & Core Infrastructure (Week 1)
1. Create sd_proposals table migration with all columns and constraints
2. Add RLS policies (fn_is_chairman for SELECT, service_role for ALL)
3. Create fn_create_sd_from_proposal() idempotent function
4. Create v_proposal_learning analytics view
5. Add partial unique index on dedupe_key for active proposals

## Phase 2: Observer Agents (Week 2)
6. Implement Retrospective Pattern Observer (Edge Function)
7. Implement Code Health Observer (Edge Function)
8. Implement Dependency Observer (Edge Function)
9. Configure pg_cron scheduled jobs for daily observers
10. Set up CI webhook integration for code health observer

## Phase 3: Claude Code Integration (Week 3)
11. Update generate-claude-md-from-db.js to include proposals section
12. Add proposal display formatting for terminal output
13. Create npm run proposal:approve and proposal:dismiss commands

## Phase 4: Learning & Refinement (Week 4)
14. Implement confidence scoring algorithm
15. Add dismissal reason analytics dashboard
16. Tune confidence thresholds based on initial feedback
    `.trim(),

    technology_stack: [
      'PostgreSQL (Supabase)',
      'Supabase Edge Functions (Deno/TypeScript)',
      'pg_cron (Supabase scheduler)',
      'OpenAI text-embedding-3-small (semantic similarity)',
      'Node.js (CLI scripts)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'fn_is_chairman() function',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'agent_execution_traces table',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'system_events table',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'chairman_alerts table',
        status: 'completed',
        blocker: false
      },
      {
        type: 'external',
        name: 'OpenAI API (embeddings)',
        status: 'completed',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Proposal creation from retrospective pattern',
        description: 'Observer detects recurring pattern across 3+ retrospectives and creates proposal',
        expected_result: 'New proposal in sd_proposals with trigger_type=retrospective_pattern',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Proposal approval creates SD',
        description: 'fn_create_sd_from_proposal creates SD and updates proposal status',
        expected_result: 'New SD in draft status, proposal status=approved with created_sd_id FK',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Idempotent approval handling',
        description: 'Double-approve same proposal returns existing SD without creating duplicate',
        expected_result: 'Same SD ID returned, no new SD created',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Dedupe prevents duplicate proposals',
        description: 'Same signal produces same dedupe_key, partial unique index blocks duplicate',
        expected_result: 'Constraint violation prevents duplicate, no new proposal created',
        test_type: 'unit'
      },
      {
        id: 'TS-5',
        scenario: 'Critical CVE creates chairman alert',
        description: 'Dependency observer detects critical CVE and creates both proposal and alert',
        expected_result: 'Proposal with urgency_level=critical, new entry in chairman_alerts',
        test_type: 'integration'
      },
      {
        id: 'TS-6',
        scenario: 'RLS restricts proposal access',
        description: 'Non-chairman users cannot view proposals',
        expected_result: 'Empty result set for non-chairman authenticated users',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'sd_proposals table created with all schema fields and constraints',
      'RLS policies enforce fn_is_chairman() for reads',
      'fn_create_sd_from_proposal() is idempotent (double-approve returns same SD)',
      'All 3 observers (retrospective, code_health, dependency) can create proposals',
      'Proposals display in CLAUDE.md session initialization',
      'npm run proposal:approve/dismiss commands work correctly',
      'Confidence scoring uses 5-factor weighted algorithm',
      'Critical proposals auto-create chairman_alerts entries',
      'v_proposal_learning view shows approval metrics by trigger_type'
    ],

    performance_requirements: {
      observer_execution_time: '<30s per observer',
      proposal_query_time: '<100ms for pending proposals',
      approval_function_time: '<500ms for fn_create_sd_from_proposal'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'sd_proposals table migration created', checked: false },
      { text: 'RLS policies implemented', checked: false },
      { text: 'fn_create_sd_from_proposal function created', checked: false },
      { text: 'v_proposal_learning view created', checked: false },
      { text: 'Retrospective Observer Edge Function implemented', checked: false },
      { text: 'Code Health Observer Edge Function implemented', checked: false },
      { text: 'Dependency Observer Edge Function implemented', checked: false },
      { text: 'CLAUDE.md generation updated', checked: false },
      { text: 'proposal:approve/dismiss commands created', checked: false },
      { text: 'Integration tests passing', checked: false },
      { text: 'Documentation updated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'Observers successfully generating proposals', checked: false },
      { text: 'Proposal approval workflow tested end-to-end', checked: false }
    ],

    progress: 15,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Clippy problem - proposals become annoying',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Users ignore or disable proposal system',
        mitigation: 'Tiered urgency, hide <50% confidence, dedupe prevents repeats'
      },
      {
        category: 'Technical',
        risk: 'Observer infinite loops',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'System instability, excessive proposals',
        mitigation: 'created_by actor tracking, observers ignore own events, recursion limits'
      },
      {
        category: 'Technical',
        risk: 'Double-approval race condition',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Duplicate SDs created',
        mitigation: 'FOR UPDATE row lock, idempotent function returns existing SD'
      },
      {
        category: 'Security',
        risk: 'Unauthorized access to proposals',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Non-chairman users see sensitive proposal data',
        mitigation: 'RLS hardened to fn_is_chairman(), service_role for observers only'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use database-first architecture',
        impact: 'No markdown files as source of truth for proposals'
      },
      {
        type: 'technical',
        constraint: 'Edge Functions timeout after 30 seconds',
        impact: 'Observers must complete quickly, batch processing for large datasets'
      }
    ],

    assumptions: [
      {
        assumption: 'fn_is_chairman() function already exists',
        validation_method: 'Query pg_proc for function existence'
      },
      {
        assumption: 'OpenAI API is available and has sufficient quota',
        validation_method: 'Test embedding generation during observer implementation'
      },
      {
        assumption: 'pg_cron is available in Supabase project',
        validation_method: 'Check Supabase extensions for pg_cron'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      },
      {
        name: 'LEAD Agent',
        role: 'Strategic Approval',
        involvement_level: 'medium'
      },
      {
        name: 'Chairman',
        role: 'Primary User',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(), // 4 weeks

    metadata: {
      inspiration: {
        video: 'Proactive Agents – Kath Korevec, Google Labs',
        url: 'https://www.youtube.com/watch?v=v3u8xc0zLec',
        key_patterns: ['Observer pattern', 'Approve vs Create', 'Tiered urgency', 'Learning from dismissals']
      },
      reviewers: ['OpenAI', 'Antigravity'],
      target_version: 'LEO Protocol v4.4',
      is_meta_enhancement: true
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Validate PRD Schema
  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // Check for existing PRD
  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Updating existing PRD...');

    const { data: updated, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({
        ...prdData,
        updated_at: new Date().toISOString()
      })
      .eq('id', prdId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update PRD:', updateError.message);
      process.exit(1);
    }

    console.log('\n✅ PRD updated successfully!');
    console.log('='.repeat(70));
    console.log(`   PRD ID: ${updated.id}`);
    console.log(`   Status: ${updated.status}`);
    return;
  }

  // Insert PRD
  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Run STORIES sub-agent to generate user stories');
  console.log('   2. Run DATABASE sub-agent to review schema');
  console.log('   3. Execute PLAN-TO-EXEC handoff when ready');
  console.log(`      node scripts/handoff.js execute PLAN-TO-EXEC ${SD_ID}`);
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
