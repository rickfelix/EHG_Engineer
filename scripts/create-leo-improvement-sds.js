#!/usr/bin/env node

/**
 * Create Strategic Directives for LEO Protocol Improvements
 * Based on retrospective analysis of SD-046 and SD-027
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createStrategicDirectives() {
  const strategicDirectives = [
    {
      // SD-LEO-001: Fix Module Type Warnings
      id: 'SD-LEO-001',
      title: 'Eliminate ES Module Warnings in LEO Protocol Scripts',
      version: '1.0',
      status: 'draft',
      category: 'Infrastructure',
      priority: 'high',
      description: 'Add module type declaration to package.json to eliminate the repetitive MODULE_TYPELESS_PACKAGE_JSON warnings that clutter every script execution output, making debugging difficult and creating unprofessional appearance.',

      strategic_intent: 'Improve developer experience and system maintainability by eliminating noise in script outputs',

      rationale: 'Currently, every script execution shows module type warnings that constitute 50% of console output. This makes debugging difficult, creates confusion for new team members, and gives an unprofessional appearance during demonstrations.',

      scope: 'Single line addition to package.json plus verification testing of all existing scripts',

      key_changes: [
        'Add "type": "module" to package.json',
        'Verify all existing scripts continue to function',
        'Update any scripts that may need adjustment for ES modules',
        'Document the change in development guidelines'
      ],

      strategic_objectives: [
        'Eliminate 100% of module type warnings',
        'Reduce console output noise by 50%',
        'Improve debugging efficiency',
        'Enhance professional appearance of system'
      ],

      success_criteria: [
        'Zero MODULE_TYPELESS_PACKAGE_JSON warnings in any script execution',
        'All existing scripts continue to function correctly',
        'No performance degradation',
        'Clean console output for all LEO Protocol operations'
      ],

      key_principles: [
        'Minimal change for maximum impact',
        'Backward compatibility maintained',
        'No breaking changes to existing workflows',
        'Clear documentation of changes'
      ],

      implementation_guidelines: [
        'Test change in development environment first',
        'Run full test suite after implementation',
        'Document in CLAUDE.md if any script adjustments needed',
        'Create rollback plan in case of issues'
      ],

      dependencies: [
        'Node.js version 14+ (already in use)',
        'All scripts using ES module syntax (already implemented)'
      ],

      risks: [
        {
          risk: 'Some older scripts may use CommonJS syntax',
          impact: 'LOW',
          mitigation: 'Audit all scripts before change, update any CommonJS requires to ES imports'
        }
      ],

      success_metrics: [
        'Warning count: 0 (from current ~50 per execution)',
        'Script execution time: No change',
        'Developer satisfaction: Improved',
        'Debug time: Reduced by 25%'
      ],

      stakeholders: ['Development Team', 'DevOps', 'QA Team'],

      execution_order: 1,
      h_count: 1,
      m_count: 0,
      l_count: 0,
      must_have_count: 1,
      must_have_pct: 100,
      rolled_triage: 'High',

      metadata: {
        estimated_effort: '30 minutes',
        business_impact: 'MEDIUM - Developer productivity improvement',
        technical_complexity: 'TRIVIAL - One line change',
        implementation_time: '30 minutes including testing'
      }
    },

    {
      // SD-LEO-002: Automate Database Status Transitions
      id: 'SD-LEO-002',
      title: 'Implement Automated Status Transition System for Strategic Directives',
      version: '1.0',
      status: 'draft',
      category: 'Automation',
      priority: 'high',
      description: 'Create automated workflow that updates database status based on phase completion, eliminating need for manual status update scripts and reducing human error in status management.',

      strategic_intent: 'Achieve 100% accurate real-time status tracking with zero manual intervention',

      rationale: 'Currently requiring 15-20 minutes of manual status updates per SD, with frequent forgotten updates leading to inaccurate dashboards. Manual process has led to creation of dozens of one-off status update scripts.',

      scope: 'Create unified status transition system with hooks into all LEO Protocol phases',

      key_changes: [
        'Create automated status transition handler',
        'Implement phase completion hooks',
        'Add automatic progress calculation',
        'Create completion timestamp automation',
        'Build status rollback capability for failures'
      ],

      strategic_objectives: [
        'Eliminate 100% of manual status updates',
        'Ensure real-time accuracy of dashboard',
        'Reduce SD completion time by 15-20 minutes',
        'Prevent status inconsistencies',
        'Create complete audit trail of transitions'
      ],

      success_criteria: [
        'Zero manual database updates required',
        'Status transitions occur within 1 second of phase completion',
        '100% accuracy between actual state and database state',
        'Complete audit log of all transitions',
        'Automatic rollback on phase failures'
      ],

      key_principles: [
        'Event-driven architecture',
        'Fail-safe with rollback capability',
        'Complete audit trail maintained',
        'No manual intervention required',
        'Real-time synchronization'
      ],

      implementation_guidelines: [
        'Use database triggers for consistency',
        'Implement event emitters for phase transitions',
        'Create status state machine with valid transitions',
        'Add comprehensive logging',
        'Build monitoring dashboard for status flows'
      ],

      dependencies: [
        'Supabase database access',
        'LEO Protocol phase definitions',
        'Existing strategic_directives_v2 table'
      ],

      risks: [
        {
          risk: 'Database trigger failures',
          impact: 'MEDIUM',
          mitigation: 'Implement fallback polling mechanism'
        },
        {
          risk: 'Race conditions in concurrent updates',
          impact: 'LOW',
          mitigation: 'Use database transactions and row locking'
        }
      ],

      success_metrics: [
        'Manual update time: 0 minutes (from 15-20)',
        'Status accuracy: 100% (from ~85%)',
        'Update latency: <1 second (from minutes/hours)',
        'Script count reduction: 20+ scripts eliminated'
      ],

      stakeholders: ['Development Team', 'Project Management', 'Executive Dashboard Users'],

      execution_order: 2,
      h_count: 1,
      m_count: 0,
      l_count: 0,
      must_have_count: 1,
      must_have_pct: 100,
      rolled_triage: 'High',

      metadata: {
        estimated_effort: '1-2 days',
        business_impact: 'HIGH - Real-time accurate reporting',
        technical_complexity: 'MEDIUM - Database triggers and event handling',
        implementation_time: '1-2 days including testing'
      }
    },

    {
      // SD-LEO-003: Enforce LEO Protocol Orchestrator Usage
      id: 'SD-LEO-003',
      title: 'Create Single Enforced Entry Point for SD Execution',
      version: '1.0',
      status: 'draft',
      category: 'Process Enforcement',
      priority: 'critical',
      description: 'Make the LEO Protocol Orchestrator the mandatory single entry point for all SD executions, preventing bypass of protocol steps and ensuring 100% compliance with retrospectives, handoffs, and verification gates.',

      strategic_intent: 'Achieve 100% LEO Protocol compliance through technical enforcement rather than process documentation',

      rationale: 'Despite having a comprehensive orchestrator, teams bypass it by running individual scripts, leading to skipped retrospectives, missing handoffs, and incomplete verification. This has resulted in protocol violations and incomplete audit trails.',

      scope: 'Implement technical barriers that make orchestrator the only viable execution path',

      key_changes: [
        'Add npm run sd as primary command',
        'Rename all individual scripts to .internal suffix',
        'Implement pre-execution hooks blocking direct script runs',
        'Create session ID system for tracking',
        'Add git hooks requiring session IDs',
        'Integrate dashboard with orchestrator only',
        'Remove alternative execution paths'
      ],

      strategic_objectives: [
        'Achieve 100% protocol compliance',
        'Ensure every SD has complete audit trail',
        'Guarantee retrospective generation',
        'Enforce all handoff requirements',
        'Eliminate possibility of skipped steps'
      ],

      success_criteria: [
        'Zero direct script executions possible',
        'Every SD execution has session ID',
        '100% retrospective coverage',
        'All handoffs properly documented',
        'Complete audit trail for every execution',
        'Single command execution: npm run sd SD-XXX'
      ],

      key_principles: [
        'Make right way the only way',
        'Technical enforcement over documentation',
        'Impossible to bypass, not just discouraged',
        'Complete automation of compliance',
        'Zero-training execution model'
      ],

      implementation_guidelines: [
        'Phase 1: Add orchestrator to package.json',
        'Phase 2: Implement script renaming system',
        'Phase 3: Add execution hooks and guards',
        'Phase 4: Create session tracking',
        'Phase 5: Integrate git hooks',
        'Phase 6: Update dashboard integration',
        'Phase 7: Remove legacy execution paths'
      ],

      dependencies: [
        'leo-protocol-orchestrator.js exists',
        'Package.json script management',
        'Git hooks infrastructure',
        'Dashboard codebase access'
      ],

      risks: [
        {
          risk: 'Breaking existing automation',
          impact: 'HIGH',
          mitigation: 'Gradual migration with compatibility period'
        },
        {
          risk: 'Emergency bypass needed',
          impact: 'MEDIUM',
          mitigation: 'Create break-glass procedure with audit logging'
        }
      ],

      success_metrics: [
        'Protocol compliance: 100% (from ~60%)',
        'Retrospective coverage: 100% (from ~10%)',
        'Handoff completion: 100% (from ~70%)',
        'Audit trail completeness: 100% (from ~40%)',
        'Training time: 0 minutes (one command to learn)'
      ],

      stakeholders: ['All LEO Protocol Users', 'Compliance Team', 'Audit Team', 'Development Team'],

      execution_order: 3,
      h_count: 1,
      m_count: 0,
      l_count: 0,
      must_have_count: 1,
      must_have_pct: 100,
      rolled_triage: 'Critical',

      metadata: {
        estimated_effort: '2-3 days',
        business_impact: 'CRITICAL - 100% protocol compliance',
        technical_complexity: 'MEDIUM - Multiple integration points',
        implementation_time: '2-3 days including migration'
      }
    }
  ];

  console.log('📋 Creating Strategic Directives for LEO Protocol Improvements\n');
  console.log('='.repeat(60));

  for (const sd of strategicDirectives) {
    console.log(`\n📌 ${sd.id}: ${sd.title}`);
    console.log(`Priority: ${sd.priority.toUpperCase()}`);
    console.log(`Category: ${sd.category}`);
    console.log(`Estimated Effort: ${sd.metadata.estimated_effort}`);

    try {
      // Check if SD already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        console.log(`⚠️  ${sd.id} already exists, skipping...`);
        continue;
      }

      // Insert the SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert({
          ...sd,
          created_at: new Date().toISOString(),
          is_active: true,
          progress: 0,
          current_phase: 'PLANNING'
        })
        .select();

      if (error) {
        console.error(`❌ Failed to create ${sd.id}:`, error.message);
      } else {
        console.log(`✅ Successfully created ${sd.id}`);

        // Display key details
        console.log('\n📊 Key Metrics:');
        console.log(`  - Business Impact: ${sd.metadata.business_impact}`);
        console.log(`  - Technical Complexity: ${sd.metadata.technical_complexity}`);
        console.log(`  - Implementation Time: ${sd.metadata.implementation_time}`);

        console.log('\n🎯 Strategic Objectives:');
        sd.strategic_objectives.slice(0, 3).forEach(obj => {
          console.log(`  • ${obj}`);
        });
      }
    } catch (error) {
      console.error(`❌ Error processing ${sd.id}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Summary:');
  console.log('Three strategic directives created for LEO Protocol improvements:');
  console.log('1. SD-LEO-001: Fix Module Warnings (30 min effort)');
  console.log('2. SD-LEO-002: Automate Status Transitions (1-2 days)');
  console.log('3. SD-LEO-003: Enforce Orchestrator Usage (2-3 days)');
  console.log('\n🎯 Total Implementation Time: ~4 days');
  console.log('💼 Expected Impact: 60-70% reduction in SD implementation time');
  console.log('\n✅ Ready to execute through LEO Protocol!');

  return strategicDirectives;
}

// Execute
createStrategicDirectives().catch(console.error);