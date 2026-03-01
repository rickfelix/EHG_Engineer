#!/usr/bin/env node

/**
 * Seed Governance Policies (V09 FR-004)
 *
 * Seeds the governance_policies table with organizational hierarchy constraints
 * that enforce depth limits, cross-boundary rules, and approval escalation thresholds.
 *
 * Usage:
 *   node scripts/seed-governance-policies.js           # Preview (dry-run)
 *   node scripts/seed-governance-policies.js --execute  # Insert into database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOVERNANCE_POLICIES = [
  {
    policy_key: 'GOV-DEPTH-LIMIT',
    title: 'Maximum Hierarchy Depth Limit',
    description: 'Prevents SD hierarchies from exceeding 6 levels deep. Deeper nesting indicates decomposition issues.',
    policy_type: 'hierarchy_constraint',
    enforcement_level: 'blocking',
    rule: {
      type: 'max_depth',
      max_depth: 6,
      applies_to: 'all_sd_types',
      action_on_violation: 'block_creation'
    },
    is_active: true
  },
  {
    policy_key: 'GOV-CROSS-BOUNDARY',
    title: 'Cross-Hierarchy Dependency Boundary',
    description: 'Dependencies crossing hierarchy boundaries (different parent chains) require explicit approval. Prevents invisible coupling.',
    policy_type: 'dependency_constraint',
    enforcement_level: 'warning',
    rule: {
      type: 'cross_boundary_dependency',
      require_same_ancestor: false,
      max_cross_boundary_depth: 3,
      action_on_violation: 'warn_and_log'
    },
    is_active: true
  },
  {
    policy_key: 'GOV-APPROVAL-ESCALATION',
    title: 'Approval Escalation for Deep Changes',
    description: 'Changes at depth >= 4 require parent orchestrator acknowledgment before LEAD-FINAL-APPROVAL.',
    policy_type: 'approval_constraint',
    enforcement_level: 'advisory',
    rule: {
      type: 'escalation_threshold',
      depth_threshold: 4,
      escalation_target: 'parent_orchestrator',
      action_on_violation: 'log_advisory'
    },
    is_active: true
  },
  {
    policy_key: 'GOV-CHILD-CAP',
    title: 'Maximum Children Per Orchestrator',
    description: 'Limits orchestrator fan-out to 15 direct children. Wider trees should decompose into sub-orchestrators.',
    policy_type: 'hierarchy_constraint',
    enforcement_level: 'warning',
    rule: {
      type: 'max_children',
      max_children: 15,
      applies_to: 'orchestrator',
      action_on_violation: 'warn_and_log'
    },
    is_active: true
  },
  {
    policy_key: 'GOV-ORPHAN-PREVENTION',
    title: 'Orphaned SD Prevention',
    description: 'Active SDs whose parent is cancelled or completed must be reviewed. Prevents orphaned work items.',
    policy_type: 'lifecycle_constraint',
    enforcement_level: 'blocking',
    rule: {
      type: 'parent_lifecycle_check',
      trigger_on: ['parent_cancelled', 'parent_completed'],
      child_statuses_affected: ['draft', 'active', 'in_progress'],
      action_on_violation: 'block_and_notify'
    },
    is_active: true
  }
];

async function seedPolicies(execute = false) {
  console.log('\n📋 Governance Policies Seed Script (V09 FR-004)');
  console.log('═'.repeat(55));

  if (!execute) {
    console.log('  Mode: DRY-RUN (use --execute to insert)\n');
  } else {
    console.log('  Mode: EXECUTE\n');
  }

  // Check if table exists by querying it
  const { data: existing, error: checkError } = await supabase
    .from('governance_policies')
    .select('policy_key')
    .limit(100);

  if (checkError) {
    // Table might not exist — create it first
    console.log(`  ⚠️  governance_policies table not found (${checkError.message})`);
    console.log('  The table will be created when V09 migration runs.');
    console.log('\n  Policies to seed:');
    for (const policy of GOVERNANCE_POLICIES) {
      console.log(`    - ${policy.policy_key}: ${policy.title} [${policy.enforcement_level}]`);
    }
    console.log(`\n  Total: ${GOVERNANCE_POLICIES.length} policies`);
    console.log('═'.repeat(55) + '\n');
    return;
  }

  const existingKeys = new Set((existing || []).map(p => p.policy_key));

  let inserted = 0;
  let skipped = 0;

  for (const policy of GOVERNANCE_POLICIES) {
    if (existingKeys.has(policy.policy_key)) {
      console.log(`  ⏭️  ${policy.policy_key} — already exists`);
      skipped++;
      continue;
    }

    if (execute) {
      const { error: insertError } = await supabase
        .from('governance_policies')
        .insert({
          ...policy,
          rule: policy.rule,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.log(`  ❌ ${policy.policy_key} — ${insertError.message}`);
      } else {
        console.log(`  ✅ ${policy.policy_key} — inserted [${policy.enforcement_level}]`);
        inserted++;
      }
    } else {
      console.log(`  📝 ${policy.policy_key}: ${policy.title} [${policy.enforcement_level}]`);
      console.log(`     ${policy.description.substring(0, 80)}`);
    }
  }

  console.log(`\n  Summary: ${inserted} inserted, ${skipped} skipped, ${GOVERNANCE_POLICIES.length} total`);
  console.log('═'.repeat(55) + '\n');
}

const execute = process.argv.includes('--execute');
seedPolicies(execute).catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
