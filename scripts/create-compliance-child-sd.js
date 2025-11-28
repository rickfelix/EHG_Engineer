#!/usr/bin/env node
/**
 * SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001
 * FR-4: Child SD Automation
 *
 * Automatically creates Strategic Directives for compliance violations.
 * Groups violations by root cause before creating SDs to prevent duplicates.
 *
 * Usage:
 *   node scripts/create-compliance-child-sd.js [--check-id=<uuid>] [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse command line arguments
const args = process.argv.slice(2);
const checkIdArg = args.find(a => a.startsWith('--check-id='))?.split('=')[1];
const dryRun = args.includes('--dry-run');

// Violation grouping rules
const VIOLATION_GROUPS = {
  'CREWAI-001': {
    group: 'crewai_agents',
    title: 'Implement CrewAI Agent Registration',
    priority: 'high',
    category: 'governance_automation'
  },
  'CREWAI-002': {
    group: 'crewai_crews',
    title: 'Implement CrewAI Crew Configuration',
    priority: 'high',
    category: 'governance_automation'
  },
  'CREWAI-003': {
    group: 'crewai_assignments',
    title: 'Implement CrewAI Agent-Crew Assignments',
    priority: 'medium',
    category: 'governance_automation'
  },
  'DOSSIER-001': {
    group: 'dossier',
    title: 'Create Stage Dossier Documentation',
    priority: 'medium',
    category: 'documentation'
  },
  'SESSION-001': {
    group: 'session_routing',
    title: 'Configure Session Routing',
    priority: 'low',
    category: 'infrastructure'
  }
};

async function getLatestComplianceCheck() {
  if (checkIdArg) {
    const { data, error } = await supabase
      .from('compliance_checks')
      .select('*')
      .eq('id', checkIdArg)
      .single();

    if (error) {
      throw new Error(`Check not found: ${checkIdArg}`);
    }
    return data;
  }

  // Get most recent completed check
  const { data, error } = await supabase
    .from('compliance_checks')
    .select('*')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No completed compliance checks found');
  }

  return data;
}

async function getViolationsForCheck(checkId) {
  const { data, error } = await supabase
    .from('compliance_violations')
    .select('*')
    .eq('check_id', checkId)
    .eq('status', 'open')
    .order('severity', { ascending: true });

  if (error) {
    throw new Error(`Failed to get violations: ${error.message}`);
  }

  return data || [];
}

async function checkExistingSD(groupKey, affectedStages) {
  // Check if an SD already exists for this violation group
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, metadata')
    .contains('metadata', { compliance_group: groupKey })
    .in('status', ['draft', 'active', 'in_progress']);

  if (error) {
    console.warn(`Warning: Could not check existing SDs: ${error.message}`);
    return null;
  }

  // Check if any existing SD covers the same stages
  for (const sd of data || []) {
    const existingStages = sd.metadata?.affected_stages || [];
    const overlap = affectedStages.filter(s => existingStages.includes(s));
    if (overlap.length > 0) {
      return sd;
    }
  }

  return null;
}

async function groupViolations(violations) {
  // Group violations by rule_id and collect affected stages
  const groups = {};

  for (const violation of violations) {
    const config = VIOLATION_GROUPS[violation.rule_id];
    if (!config) {
      console.log(`Skipping unknown rule: ${violation.rule_id}`);
      continue;
    }

    const groupKey = config.group;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        config,
        violations: [],
        stages: new Set(),
        severities: new Set()
      };
    }

    groups[groupKey].violations.push(violation);
    groups[groupKey].stages.add(violation.stage_number);
    groups[groupKey].severities.add(violation.severity);
  }

  return groups;
}

function determinePriority(severities) {
  if (severities.has('critical')) return 'critical';
  if (severities.has('high')) return 'high';
  if (severities.has('medium')) return 'medium';
  return 'low';
}

async function createSD(groupKey, group, checkId) {
  const affectedStages = Array.from(group.stages).sort((a, b) => a - b);
  const priority = determinePriority(group.severities);

  // Check for duplicates
  const existingSD = await checkExistingSD(groupKey, affectedStages);
  if (existingSD) {
    console.log(`   Existing SD found: ${existingSD.id} - skipping`);

    // Update violation records with existing SD reference
    for (const violation of group.violations) {
      await supabase
        .from('compliance_violations')
        .update({
          remediation_sd_id: existingSD.id,
          notes: `Linked to existing SD ${existingSD.id}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', violation.id);
    }

    return { skipped: true, existingSD };
  }

  // Generate SD ID
  const sdId = `SD-COMPLIANCE-${groupKey.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  // Build SD content
  const stageList = affectedStages.join(', ');
  const title = `${group.config.title} for Stages ${stageList}`;
  const description = `
Automatically generated by Compliance Check Orchestrator.

## Summary
Compliance violations detected for ${group.violations.length} stage(s) requiring ${group.config.title.toLowerCase()}.

## Affected Stages
${affectedStages.map(s => `- Stage ${s}`).join('\n')}

## Violations
${group.violations.map(v => `- Stage ${v.stage_number}: ${v.description}`).join('\n')}

## Source
- Compliance Check ID: ${checkId}
- Rule ID: ${group.violations[0].rule_id}
- Detection Date: ${new Date().toISOString()}

## References
- [CrewAI Compliance Policy](/docs/workflow/crewai_compliance_policy.md)
- [Stage Dossier Guidelines](/docs/workflow/critique/)
`.trim();

  const sdData = {
    id: sdId,
    title,
    description,
    scope: `Implement ${group.config.title.toLowerCase()} for ${affectedStages.length} stage(s)`,
    category: group.config.category,
    priority,
    status: 'draft',
    current_phase: 'LEAD',
    progress_percentage: 0,
    sd_type: 'infrastructure',
    target_application: 'EHG',
    success_metrics: [
      `All ${affectedStages.length} affected stages pass compliance check`,
      'CrewAI components registered in database',
      'Dossier specifications met'
    ],
    key_principles: [
      'Minimal scope - only fix violations identified',
      'Follow existing CrewAI patterns',
      'Document any exceptions if needed'
    ],
    metadata: {
      compliance_group: groupKey,
      affected_stages: affectedStages,
      source_check_id: checkId,
      spawned_from_compliance: true,
      crewai_compliance_status: 'non_compliant',
      violation_count: group.violations.length,
      auto_generated: true,
      generated_at: new Date().toISOString()
    }
  };

  if (dryRun) {
    console.log('   [DRY RUN] Would create SD:');
    console.log(`   ID: ${sdId}`);
    console.log(`   Title: ${title}`);
    console.log(`   Priority: ${priority}`);
    console.log(`   Stages: ${stageList}`);
    return { dryRun: true, sdData };
  }

  // Insert SD
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, title, status')
    .single();

  if (error) {
    throw new Error(`Failed to create SD: ${error.message}`);
  }

  // Update violations with SD reference
  for (const violation of group.violations) {
    await supabase
      .from('compliance_violations')
      .update({
        remediation_sd_id: data.id,
        status: 'acknowledged',
        notes: `Remediation SD created: ${data.id}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', violation.id);
  }

  return { created: true, sd: data };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('COMPLIANCE CHILD SD AUTOMATION');
  console.log('='.repeat(70));

  if (dryRun) {
    console.log('Mode: DRY RUN (no changes will be made)');
  }

  // Get compliance check
  console.log('\nFetching compliance check...');
  const check = await getLatestComplianceCheck();
  console.log(`Check ID: ${check.id}`);
  console.log(`Run ID: ${check.run_id}`);
  console.log(`Failed stages: ${check.failed}`);

  // Get open violations
  console.log('\nFetching open violations...');
  const violations = await getViolationsForCheck(check.id);
  console.log(`Open violations: ${violations.length}`);

  if (violations.length === 0) {
    console.log('\nNo open violations - no SDs to create');
    return;
  }

  // Group violations
  console.log('\nGrouping violations by root cause...');
  const groups = await groupViolations(violations);
  const groupCount = Object.keys(groups).length;
  console.log(`Violation groups: ${groupCount}`);

  // Create SDs for each group
  console.log('\nProcessing violation groups...');
  const results = {
    created: [],
    skipped: [],
    errors: []
  };

  for (const [groupKey, group] of Object.entries(groups)) {
    console.log(`\n[${groupKey}] ${group.config.title}`);
    console.log(`   Violations: ${group.violations.length}`);
    console.log(`   Stages: ${Array.from(group.stages).join(', ')}`);

    try {
      const result = await createSD(groupKey, group, check.id);

      if (result.skipped) {
        results.skipped.push({ groupKey, existingSD: result.existingSD.id });
      } else if (result.dryRun) {
        results.created.push({ groupKey, sdId: result.sdData.id, dryRun: true });
      } else if (result.created) {
        results.created.push({ groupKey, sdId: result.sd.id });
        console.log(`   ✅ Created SD: ${result.sd.id}`);
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.errors.push({ groupKey, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`SDs Created: ${results.created.length}`);
  console.log(`Skipped (existing): ${results.skipped.length}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.created.length > 0) {
    console.log('\nCreated SDs:');
    results.created.forEach(r => {
      console.log(`  - ${r.sdId} ${r.dryRun ? '(dry run)' : ''}`);
    });
  }

  if (results.skipped.length > 0) {
    console.log('\nSkipped (existing SD covers violations):');
    results.skipped.forEach(r => {
      console.log(`  - ${r.groupKey} → ${r.existingSD}`);
    });
  }

  console.log('='.repeat(70) + '\n');

  return results;
}

main()
  .then(results => {
    if (results?.errors?.length > 0) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
