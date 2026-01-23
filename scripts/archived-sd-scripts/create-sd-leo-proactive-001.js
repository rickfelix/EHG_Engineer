#!/usr/bin/env node

/**
 * LEAD Agent: Create Strategic Directive for LEO Protocol v4.4 Proactive SD Proposal System
 * Following LEO Protocol v4.3.3 database_first
 *
 * This is a META-SD: Using LEO Protocol to improve LEO Protocol's SD creation workflow
 *
 * Inspiration: Kath Korevec's "Proactive Agents" (Google Labs)
 * - Shift from reactive (user creates) to proactive (AI proposes, user approves)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createProactiveSDProposalDirective() {
  console.log('🎯 LEAD Agent: Creating Strategic Directive for LEO Protocol v4.4');
  console.log('================================================================');
  console.log('📋 Meta-Enhancement: Proactive SD Proposal System');
  console.log('');

  const sdId = 'SD-LEO-PROACTIVE-001';
  const now = new Date().toISOString();

  // Check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, status')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .maybeSingle();

  if (existing) {
    console.log(`⚠️  SD ${sdId} already exists with status: ${existing.status}`);
    console.log('   To reset: DELETE FROM strategic_directives_v2 WHERE legacy_id = \'' + sdId + '\';');
    return;
  }

  // Generate UUID for id
  const uuid = crypto.randomUUID();

  // Strategic Directive data (database-first, no files)
  const strategicDirective = {
    id: uuid,
    sd_key: uuid, // Required field, same as id
    legacy_id: sdId,
    title: 'LEO Protocol v4.4: Proactive SD Proposal System',
    version: '1.0',
    status: 'draft', // Start in draft for proper LEAD validation
    current_phase: 'LEAD',
    category: 'infrastructure', // Protocol enhancement
    priority: 'high',
    sd_type: 'infrastructure', // LEO Protocol tooling, not customer-facing

    description: `Evolve the LEO Protocol from reactive SD creation (user defines scope → creates SD) to proactive SD proposal (AI observes signals → proposes SD → user approves). This is a META-ENHANCEMENT - using the LEO Protocol to improve the LEO Protocol's own SD initiation workflow.

Key Innovation: Shift from "user creates SDs" to "AI proposes SDs, user approves" based on Kath Korevec's Proactive Agents pattern (Google Labs).

Problem Solved: The biggest friction in LEO Protocol is scope uncertainty at SD creation. Users struggle to define scope before exploring the codebase.

Solution: Observer agents monitor signals (retrospectives, code health, dependencies) and proactively propose SDs. Proposals flow through normal LEAD validation after approval.`,

    strategic_intent: 'Address the root cause of SD creation friction (scope uncertainty) by having AI pre-explore and propose SDs, shifting user role from "creator" to "approver" while maintaining governance.',

    rationale: 'The biggest friction in LEO Protocol is scope uncertainty at SD creation. By having AI observe signals and pre-propose SDs, we reduce cognitive load while maintaining governance (proposals still go through LEAD validation).',

    scope: `LEO Protocol Enhancement:
- Extends LEAD phase with proactive proposal generation
- New sd_proposals table integrated with strategic_directives_v2
- Observer Edge Functions for retrospectives, code health, dependencies
- Multi-channel surfacing (Claude Code terminal, web UI, SD queue)
- Learning system via dismissal tracking`,

    // Strategic objectives as JSONB array
    strategic_objectives: [
      'Reduce SD creation friction by 50%+ through AI-generated proposals',
      'Surface recurring issues from retrospectives proactively before they cause more failures',
      'Proactively identify security vulnerabilities (CVEs) and tech debt before escalation',
      'Create a learning system that improves proposal quality over time via dismissal feedback',
      'Maintain protocol compliance - all proposals flow through normal LEAD validation'
    ],

    // Success criteria as JSONB array
    success_criteria: [
      'SD creation time reduced by 50%+ (measured: intent → draft SD)',
      '>60% proposal approval rate within 30 days',
      'All 3 observer types (retrospective, code health, dependency) generating proposals',
      'Dismissal rate decreases over 30 days (learning effect verified)',
      'Proposals integrate with existing chairman_alerts, system_events, agent_execution_traces'
    ],

    // Key changes
    key_changes: [
      'New sd_proposals table with tiered urgency (critical/medium/low)',
      'Observer Edge Functions for signal monitoring',
      'Multi-channel proposal surfacing (terminal + web UI)',
      'fn_create_sd_from_proposal() for idempotent approval',
      'Learning system with dismissal reason tracking',
      'Integration with chairman_alerts for critical proposals'
    ],

    // Key principles
    key_principles: [
      'Database-first (proposals in sd_proposals table)',
      'Non-blocking (proposals are suggestions, never halt work)',
      'Deterministic dedupe (same signal → same dedupe_key)',
      'Tiered expiration (critical=7d, medium=14d, low=30d)',
      'Hardened RLS (fn_is_chairman() for reads, service_role for writes)',
      'Proactive, not reactive (AI proposes, user approves)'
    ],

    // Metadata
    metadata: {
      created_by: 'LEAD',
      created_at: now,
      protocol_version: 'v4.3.3',
      target_version: 'v4.4',
      source: 'Kath Korevec Proactive Agents (Google Labs) + OpenAI + Antigravity review',
      complexity: 'HIGH',
      is_meta_enhancement: true,
      inspiration: {
        video: 'Proactive Agents – Kath Korevec, Google Labs',
        url: 'https://www.youtube.com/watch?v=v3u8xc0zLec',
        key_patterns: ['Observer pattern', 'Approve vs Create', 'Tiered urgency', 'Learning from dismissals']
      },
      reviewers: ['OpenAI', 'Antigravity'],
      refinements_applied: [
        'Hardened RLS to fn_is_chairman()',
        'Partial unique index for dedupe (allows re-propose after expiry)',
        'Idempotent approval function with FOR UPDATE lock',
        'Tiered expiration by urgency level',
        'Integration with chairman_alerts for critical proposals',
        'Confidence scoring with 5 weighted factors'
      ],
      implementation_phases: [
        { phase: 1, name: 'Database & Core', items: ['sd_proposals table', 'RLS policies', 'fn_create_sd_from_proposal', 'v_proposal_learning view'] },
        { phase: 2, name: 'Observer Agents', items: ['Retrospective observer', 'Code health observer', 'Dependency observer', 'pg_cron scheduling'] },
        { phase: 3, name: 'Claude Code Integration', items: ['Session init query', 'Proposal display', 'approve/dismiss commands'] },
        { phase: 4, name: 'Web UI', items: ['Proposal inbox page', 'Inline queue proposals', 'API endpoints'] },
        { phase: 5, name: 'Learning & Refinement', items: ['Dismissal analytics', 'Confidence tuning'] }
      ]
    },

    target_application: 'EHG_Engineer',
    is_active: true,
    progress_percentage: 0
  };

  // Insert into database
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(strategicDirective)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('   Details:', error.details);
    process.exit(1);
  }

  console.log('✅ Strategic Directive created successfully!');
  console.log('');
  console.log('📋 SD Details:');
  console.log(`   ID: ${data.legacy_id || data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Phase: ${data.current_phase}`);
  console.log(`   Type: ${data.sd_type}`);
  console.log(`   Priority: ${data.priority}`);
  console.log('');
  console.log('📝 Next Steps (LEO Protocol):');
  console.log('1. Review SD in LEAD phase validation');
  console.log('2. Run LEAD-TO-PLAN handoff when approved:');
  console.log(`   node scripts/phase-preflight.js --phase PLAN --sd-id ${sdId}`);
  console.log(`   node scripts/handoff.js execute LEAD-TO-PLAN ${sdId}`);
  console.log('');
  console.log('🎯 This is a META-SD: Improving LEO Protocol\'s own SD creation workflow');
}

createProactiveSDProposalDirective().catch(console.error);
