#!/usr/bin/env node

/**
 * Orchestrator Preflight Check
 *
 * Displays workflow requirements for orchestrator parent SDs and their children
 * before autonomous work begins. This is a process-layer guardrail that surfaces
 * the SD-type validation requirements BEFORE Claude starts working.
 *
 * Usage:
 *   node scripts/orchestrator-preflight.js SD-XXX-001
 *   node scripts/orchestrator-preflight.js SD-XXX-001 --confirm
 *
 * Purpose:
 *   - Prevents efficiency bias from overriding workflow requirements
 *   - Makes SD-type requirements visible upfront (not just at completion validation)
 *   - Forces explicit acknowledgment before autonomous orchestrator work
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SD Type Validation Profiles (from database trigger logic)
const SD_TYPE_PROFILES = {
  feature: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 85,
    description: 'Full validation (UI, E2E, integration)'
  },
  database: {
    prd_required: true,
    e2e_required: false,
    min_handoffs: 3,
    threshold: 75,
    description: 'Schema-focused, may skip UI-dependent E2E'
  },
  infrastructure: {
    prd_required: true,
    e2e_required: false,
    min_handoffs: 3,
    threshold: 80,
    description: 'Tooling/protocols, reduced code validation'
  },
  security: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 90,
    description: 'Higher bar for security-critical work'
  },
  documentation: {
    prd_required: false,
    e2e_required: false,
    min_handoffs: 2,
    threshold: 60,
    description: 'No code changes, minimal validation'
  },
  orchestrator: {
    prd_required: false,
    e2e_required: false,
    min_handoffs: 2,
    threshold: 70,
    description: 'Coordination layer, user stories in children'
  },
  refactor: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 80,
    description: 'Behavior preservation focus'
  },
  bugfix: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 3,
    threshold: 80,
    description: 'Targeted fix validation'
  },
  performance: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 85,
    description: 'Measurable impact verification'
  }
};

async function getOrchestrator(sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('legacy_id', sdId)
    .single();

  if (error) {
    // Try by id column
    const { data: byId, error: byIdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (byIdError) {
      console.error(`Error fetching SD: ${byIdError.message}`);
      return null;
    }
    return byId;
  }
  return data;
}

async function getChildren(parentId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('parent_sd_id', parentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error fetching children: ${error.message}`);
    return [];
  }
  return data || [];
}

async function getHandoffCount(sdId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id')
    .eq('sd_id', sdId);

  if (error) return 0;
  return data?.length || 0;
}

async function hasPRD(sdId) {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdId)
    .single();

  return !error && data;
}

function getProfile(sdType) {
  return SD_TYPE_PROFILES[sdType] || SD_TYPE_PROFILES.feature;
}

function formatStatus(status) {
  const icons = {
    draft: '📝',
    pending: '⏳',
    lead_approved: '✓',
    in_progress: '🔄',
    completed: '✅',
    blocked: '🚫'
  };
  return `${icons[status] || '?'} ${status}`;
}

async function printPreflightReport(parent, children) {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  ORCHESTRATOR PREFLIGHT CHECK');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Parent: ${parent.legacy_id || parent.id}`);
  console.log(`Title:  ${parent.title}`);
  console.log(`Type:   ${parent.sd_type || 'orchestrator'}`);
  console.log(`Status: ${formatStatus(parent.status)}`);
  console.log(`Children: ${children.length} found`);
  console.log('');
  console.log('CHILD WORKFLOW REQUIREMENTS (per SD type):');
  console.log('─'.repeat(60));

  for (const child of children) {
    const profile = getProfile(child.sd_type);
    const handoffs = await getHandoffCount(child.legacy_id || child.id);
    const prdExists = await hasPRD(child.legacy_id || child.id);

    console.log('');
    console.log(`${child.legacy_id || child.id} (${child.sd_type || 'feature'})`);
    console.log(`  Title: ${child.title.substring(0, 50)}${child.title.length > 50 ? '...' : ''}`);
    console.log(`  Status: ${formatStatus(child.status)}`);
    console.log(`  PRD: ${profile.prd_required ? (prdExists ? '✅ exists' : '❌ REQUIRED') : '⏭️ skip'}`);
    console.log(`  E2E: ${profile.e2e_required ? 'required' : 'skip'}`);
    console.log(`  Handoffs: ${handoffs}/${profile.min_handoffs} min`);
    console.log(`  Gate Threshold: ${profile.threshold}%`);
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  WORKFLOW VERIFICATION REQUIRED');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Each child SD requires INDEPENDENT workflow per its SD type:');
  console.log('');
  console.log('  - LEAD approval (validates THIS child\'s scope)');
  console.log('  - PRD creation (if required by sd_type)');
  console.log('  - Full handoff chain (count varies by sd_type)');
  console.log('  - Implementation merged to main');
  console.log('  - Retrospective created');
  console.log('  - Database status = \'completed\' (trigger validates per sd_type)');
  console.log('');

  const totalCycles = children.length;
  console.log(`Total: ${totalCycles} children × individual LEAD→PLAN→EXEC cycles`);
  console.log('');
  console.log('═'.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const sdId = args.find(a => !a.startsWith('-'));

  if (!sdId) {
    console.log('Usage: node scripts/orchestrator-preflight.js <SD-ID>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/orchestrator-preflight.js SD-UAT-PLATFORM-001');
    process.exit(1);
  }

  console.log(`Checking orchestrator status for: ${sdId}`);

  // Fetch parent SD
  const parent = await getOrchestrator(sdId);
  if (!parent) {
    console.error(`SD not found: ${sdId}`);
    process.exit(1);
  }

  // Fetch children
  const children = await getChildren(parent.id);

  if (children.length === 0) {
    console.log('');
    console.log(`${sdId} is not an orchestrator (no children found)`);
    console.log('Standard SD workflow applies.');
    process.exit(0);
  }

  // Print preflight report (visibility layer - no confirmation needed)
  await printPreflightReport(parent, children);

  // Always proceed with full workflow - no confirmation needed
  console.log('');
  console.log('PROCEEDING: Full LEAD→PLAN→EXEC workflow for each child.');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Preflight check failed:', err.message);
  process.exit(1);
});
