#!/usr/bin/env node
/**
 * Create Gate 0 Orchestrator SD with 6 Children
 * Based on /learn findings from SD-LEO-REFACTOR-LARGE-FILES-002 protocol bypass
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // 1. Create the ORCHESTRATOR
  const orchestrator = {
    id: 'SD-LEO-GATE0-001',
    sd_key: 'SD-LEO-GATE0-001',
    title: 'Gate 0: Workflow Entry Enforcement (Orchestrator)',
    description: 'Add enforcement mechanisms to prevent code shipping when SDs have not properly entered the LEO Protocol workflow. Root Cause: The LEO Protocol has excellent gates ONCE in the workflow, but no gate preventing work OUTSIDE the workflow. Code can be shipped while SDs sit dormant in draft status.',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'high',
    sd_type: 'infrastructure',
    category: 'leo_protocol',
    progress_percentage: 0,
    key_changes: [
      'Child 1: Pre-commit hook for SD phase validation',
      'Child 2: CLAUDE_EXEC.md sd:status requirement',
      'Child 3: LOC threshold trigger (>500 LOC)',
      'Child 4: verify-sd-phase.js script (Gate 0)',
      'Child 5: GitHub Action for PR merge validation',
      'Child 6: Orchestrator progress calculation fix'
    ],
    success_criteria: [
      'All 6 children completed through full LEO Protocol',
      'Protocol bypass from SD-LEO-REFACTOR-LARGE-FILES-002 cannot be reproduced',
      'Pre-commit, pre-merge, and pre-implementation gates all active'
    ],
    dependencies: [],
    created_at: new Date().toISOString(),
    rationale: 'Discovered during /learn analysis that SD-LEO-REFACTOR-LARGE-FILES-002 shipped 4,000+ LOC across 29 modules while all 23 child SDs remained in draft status with zero handoffs. The LEO Protocol has no "Gate 0" to prevent work outside the workflow.',
    scope: 'LEO Protocol enforcement mechanisms: pre-commit hooks, GitHub Actions, verification scripts, documentation updates, and progress calculation fixes.',
    version: '1.0.0',
    target_application: 'EHG',
    complexity_level: 'moderate',
    human_verification_status: 'pending',
    relationship_type: 'parent',
    strategic_objectives: ['Prevent protocol bypass', 'Ensure SD workflow activation before implementation'],
    key_principles: ['No code without active SD', 'Gate 0 blocks unauthorized work'],
    implementation_guidelines: 'Each child SD must go through full LEAD→PLAN→EXEC workflow. This orchestrator exists to prevent the exact bypass pattern we discovered.',
    risks: [{ risk: 'False positives blocking legitimate emergency fixes', mitigation: 'Provide documented bypass for emergencies' }],
    success_metrics: [{ metric: 'Protocol bypass rate', target: '0%' }],
    stakeholders: ['LEO Protocol', 'Development Team'],
    smoke_test_steps: ['Attempt commit with draft SD - should be blocked', 'Attempt PR merge with draft SD - should be blocked'],
    delivers_capabilities: ['Gate 0 enforcement'],
    modifies_capabilities: ['Pre-commit validation', 'PR merge validation'],
    deprecates_capabilities: []
  };

  const { data: orchData, error: orchError } = await supabase
    .from('strategic_directives_v2')
    .insert(orchestrator)
    .select()
    .single();

  if (orchError) {
    console.error('Error creating orchestrator:', orchError.message);
    return;
  }

  console.log('✅ ORCHESTRATOR CREATED: ' + orchData.id);

  // 2. Create the 6 CHILDREN
  const children = [
    {
      id: 'SD-LEO-GATE0-PRECOMMIT-001',
      title: 'Pre-commit Hook: SD Phase Validation',
      description: 'Problem: SDs were created in database but implementation proceeded without activating the workflow. Solution: Add a pre-commit hook that checks if any SD referenced in commit messages is still in draft status. Block commits until LEAD-TO-PLAN handoff is executed.',
      key_changes: [
        'Modify .husky/pre-commit to check SD phase',
        'Parse commit message for SD-XXX-NNN pattern',
        'Query database for SD status',
        'Block if status=draft or current_phase=LEAD_APPROVAL'
      ],
      success_criteria: [
        'Commit blocked when SD in message is in draft status',
        'Commit allowed when SD is in EXEC phase',
        'Clear error message explains what to do'
      ]
    },
    {
      id: 'SD-LEO-GATE0-CLAUDEEXEC-001',
      title: 'CLAUDE_EXEC.md: Mandatory sd:status Check',
      description: "Problem: Work was labeled as 'Child 8, 9, 10' in conversation but these weren't actual database children being processed through LEO. Solution: When working on orchestrator children, always run npm run sd:status <SD-ID> before implementation to verify the SD is in EXEC phase.",
      key_changes: [
        'Update CLAUDE_EXEC.md with mandatory pre-implementation check',
        'Add sd:status command as first step in EXEC phase',
        'Document the naming illusion anti-pattern'
      ],
      success_criteria: [
        'CLAUDE_EXEC.md contains mandatory sd:status requirement',
        'Clear warning about child naming without database activation'
      ]
    },
    {
      id: 'SD-LEO-GATE0-LOCTHRESHOLD-001',
      title: 'LOC Threshold Trigger for Large Changes',
      description: 'Problem: Refactoring work feels low risk so protocol gets skipped. But 4,000+ LOC changed across 29 modules. Solution: Add LOC threshold trigger - any change >500 LOC MUST have an active SD in EXEC phase.',
      key_changes: [
        'Add LOC counting to pre-commit hook',
        'Trigger SD validation for changes >500 LOC',
        'Allow bypass with explicit flag for emergencies'
      ],
      success_criteria: [
        'Changes >500 LOC require SD in EXEC phase',
        'Clear threshold documented in CLAUDE_EXEC.md',
        'Emergency bypass available but logged'
      ]
    },
    {
      id: 'SD-LEO-GATE0-VERIFYSCRIPT-001',
      title: 'verify-sd-phase.js Script (Gate 0)',
      description: 'Problem: No check at implementation start to verify SD is workflow-activated. Solution: Add node scripts/verify-sd-phase.js <SD-ID> as mandatory first step in EXEC phase. Should BLOCK if SD is still in draft/LEAD_APPROVAL.',
      key_changes: [
        'Create scripts/verify-sd-phase.js',
        'Query database for SD status and phase',
        'Return clear PASS/BLOCK result',
        'Integrate with handoff.js workflow'
      ],
      success_criteria: [
        'Script exists and validates SD phase',
        'BLOCK returned for draft/LEAD_APPROVAL SDs',
        'PASS returned for EXEC phase SDs'
      ]
    },
    {
      id: 'SD-LEO-GATE0-GHACTION-001',
      title: 'GitHub Action: PR Merge SD Validation',
      description: 'Problem: PRs #430-432 merged while corresponding SDs were still in draft. Solution: Add GitHub Action that queries database for SD status before allowing merge. If SD in commit message is not in EXEC phase, block merge.',
      key_changes: [
        'Create .github/workflows/sd-validation.yml',
        'Parse PR commits for SD references',
        'Query Supabase for SD phase',
        'Block merge if SD not in EXEC or later phase'
      ],
      success_criteria: [
        'GitHub Action runs on PR merge attempts',
        'Merge blocked if SD in draft/LEAD_APPROVAL',
        'Clear failure message in PR checks'
      ]
    },
    {
      id: 'SD-LEO-GATE0-ORCHPROGRESS-001',
      title: 'Orchestrator Progress Calculation Fix',
      description: 'Problem: Parent orchestrator shows 50% progress but 0/23 children actually completed through protocol. Solution: Change orchestrator progress calculation to be based on child handoff completions. progress = (children_with_PLAN-TO-LEAD / total_children) * 100',
      key_changes: [
        'Modify orchestrator progress calculation in sd-next.js',
        'Base progress on child PLAN-TO-LEAD handoff count',
        'Add visual indicator for children with code but no handoffs'
      ],
      success_criteria: [
        'Orchestrator progress reflects actual child LEO completion',
        'Progress shows 0% when no children have completed PLAN-TO-LEAD',
        'Warning displayed for state mismatch (code shipped but SD incomplete)'
      ]
    }
  ];

  for (const child of children) {
    const childData = {
      id: child.id,
      sd_key: child.id,
      title: child.title,
      description: child.description,
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      priority: 'medium',
      sd_type: 'infrastructure',
      category: 'leo_protocol',
      progress_percentage: 0,
      parent_sd_id: 'SD-LEO-GATE0-001',
      key_changes: child.key_changes,
      success_criteria: child.success_criteria,
      dependencies: [],
      created_at: new Date().toISOString(),
      rationale: 'Part of Gate 0 enforcement to prevent protocol bypass. See parent SD-LEO-GATE0-001 for full context.',
      scope: child.description,
      version: '1.0.0',
      target_application: 'EHG',
      complexity_level: 'moderate',
      human_verification_status: 'pending',
      relationship_type: 'child',
      strategic_objectives: ['Implement Gate 0 enforcement component'],
      key_principles: ['No code without active SD'],
      implementation_guidelines: 'Follow full LEAD→PLAN→EXEC workflow.',
      risks: [],
      success_metrics: [],
      stakeholders: ['LEO Protocol'],
      smoke_test_steps: [],
      delivers_capabilities: [],
      modifies_capabilities: [],
      deprecates_capabilities: []
    };

    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .insert(childData);

    if (childError) {
      console.error('❌ Error creating ' + child.id + ': ' + childError.message);
    } else {
      console.log('  ✅ CHILD CREATED: ' + child.id);
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ORCHESTRATOR SD CREATED WITH 6 CHILDREN');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Orchestrator: SD-LEO-GATE0-001');
  console.log('  Title: Gate 0: Workflow Entry Enforcement');
  console.log('');
  console.log('  Children:');
  console.log('    1. SD-LEO-GATE0-PRECOMMIT-001   - Pre-commit Hook');
  console.log('    2. SD-LEO-GATE0-CLAUDEEXEC-001  - CLAUDE_EXEC.md Update');
  console.log('    3. SD-LEO-GATE0-LOCTHRESHOLD-001 - LOC Threshold');
  console.log('    4. SD-LEO-GATE0-VERIFYSCRIPT-001 - verify-sd-phase.js');
  console.log('    5. SD-LEO-GATE0-GHACTION-001    - GitHub Action');
  console.log('    6. SD-LEO-GATE0-ORCHPROGRESS-001 - Orchestrator Progress');
  console.log('');
  console.log('  Next Steps:');
  console.log('    1. Run: npm run sd:next');
  console.log('    2. Start with first child: SD-LEO-GATE0-PRECOMMIT-001');
  console.log('    3. Execute LEAD-TO-PLAN handoff for each child');
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(console.error);
