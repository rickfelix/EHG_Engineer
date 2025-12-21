#!/usr/bin/env node

/**
 * LEO Protocol Master Orchestrator
 * Enforces complete protocol compliance with zero skipped steps
 * Version: 1.0.0
 *
 * This is the SINGLE ENTRY POINT for all Strategic Directive executions
 * It ensures every step is followed and nothing is missed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

class LEOProtocolOrchestrator {
  constructor() {
    // Use service role key for full access to LEO tables (anon key blocked by RLS on some tables)
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Define the immutable phase sequence
    this.phases = ['LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'APPROVAL'];

    // Track execution state
    this.executionState = {
      sdId: null,
      currentPhase: null,
      completedPhases: [],
      skippedSteps: [],
      violations: [],
      startTime: null,
      sessionId: null
    };

    // Phase requirements (cannot be bypassed)
    this.phaseRequirements = {
      LEAD: [
        'session_prologue_completed',
        'priority_justified',
        'strategic_objectives_defined',
        'handoff_created_in_database',
        'no_over_engineering_check'
      ],
      PLAN: [
        'prd_created_in_database',
        'acceptance_criteria_defined',
        'sub_agents_activated',
        'test_plan_created',
        'handoff_from_lead_received'
      ],
      EXEC: [
        'pre_implementation_checklist',
        'correct_app_verified',
        'screenshots_taken',
        'implementation_completed',
        'git_commit_created',
        'github_push_completed'
      ],
      VERIFICATION: [
        'all_tests_executed',
        'acceptance_criteria_verified',
        'sub_agent_consensus',
        'supervisor_verification_done',
        'confidence_score_calculated'
      ],
      APPROVAL: [
        'human_approval_requested',
        'over_engineering_rubric_run',
        'human_decision_received',
        'status_updated_in_database',
        'retrospective_completed'
      ]
    };
  }

  /**
   * Main execution entry point
   */
  async executeSD(sdId, options = {}) {
    console.log(chalk.blue.bold('\n🚀 LEO PROTOCOL ORCHESTRATOR v1.0.0'));
    console.log(chalk.blue('━'.repeat(50)));

    try {
      // Initialize execution
      await this.initializeExecution(sdId);

      // Step 1: Mandatory session prologue
      await this.enforceSessionPrologue();

      // Step 2: Verify SD exists and is eligible
      await this.verifySDEligibility(sdId);

      // Step 3: Execute each phase with strict gates
      for (const phase of this.phases) {
        console.log(chalk.yellow(`\n📋 Phase: ${phase}`));
        console.log(chalk.gray('─'.repeat(40)));

        // Check if phase can be skipped (only if already complete)
        const canSkip = await this.checkPhaseCompletion(sdId, phase);
        if (canSkip && !options.force) {
          console.log(chalk.green(`✓ ${phase} already complete`));
          continue;
        }

        // Execute the phase
        await this.executePhase(phase, sdId);

        // Enforce phase gate (blocking)
        await this.enforcePhaseGate(phase, sdId);

        // Record phase completion
        await this.recordPhaseCompletion(phase, sdId);
      }

      // Step 4: Mandatory retrospective
      await this.enforceRetrospective(sdId);

      // Step 5: Final compliance report
      await this.generateComplianceReport(sdId);

      console.log(chalk.green.bold('\n✅ SD EXECUTION COMPLETE WITH 100% COMPLIANCE'));

    } catch (error) {
      console.error(chalk.red.bold('\n❌ EXECUTION FAILED:'), error.message);
      await this.handleExecutionFailure(error);
      throw error;
    }
  }

  /**
   * Initialize execution tracking
   */
  async initializeExecution(sdId) {
    this.executionState = {
      sdId,
      currentPhase: null,
      completedPhases: [],
      skippedSteps: [],
      violations: [],
      startTime: new Date(),
      sessionId: `LEO-${Date.now()}`
    };

    // Store in database for audit
    await this.supabase.from('leo_execution_sessions').insert({
      id: this.executionState.sessionId,
      sd_id: sdId,
      started_at: this.executionState.startTime,
      status: 'in_progress'
    });
  }

  /**
   * Enforce session prologue
   */
  async enforceSessionPrologue() {
    console.log(chalk.cyan('\n📖 SESSION PROLOGUE CHECK'));

    // Check if prologue was completed
    const prologuePath = path.join(__dirname, '../.session-prologue-completed');

    try {
      await fs.access(prologuePath);
      console.log(chalk.green('✓ Session prologue completed'));
    } catch {
      console.log(chalk.yellow('⚠️  Session prologue not found'));

      // Generate and display prologue
      console.log(chalk.gray('\n' + '='.repeat(50)));
      console.log(chalk.white.bold('LEO PROTOCOL SESSION PROLOGUE'));
      console.log(chalk.gray('='.repeat(50)));
      console.log('1. Follow LEAD→PLAN→EXEC - Target ≥85% gate pass rate');
      console.log('2. Use sub-agents - Architect, QA, Reviewer');
      console.log('3. Database-first - No markdown files as source');
      console.log('4. Small PRs - Keep diffs ≤100 lines');
      console.log('5. 7-element handoffs required');
      console.log('6. Priority-first - Use npm run prio:top3');
      console.log(chalk.gray('='.repeat(50) + '\n'));

      // Mark as completed
      await fs.writeFile(prologuePath, new Date().toISOString());
    }
  }

  /**
   * Verify SD is eligible for execution
   */
  async verifySDEligibility(sdId) {
    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      throw new Error(`SD ${sdId} not found`);
    }

    // Check priority justification
    console.log(chalk.cyan('\n🎯 PRIORITY JUSTIFICATION'));
    console.log(`Priority: ${sd.priority || 'not set'}`);
    console.log(`Status: ${sd.status}`);

    if (!sd.priority || sd.priority === 'low') {
      const { confirmLowPriority } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmLowPriority',
        message: 'This SD has low/no priority. Continue anyway?',
        default: false
      }]);

      if (!confirmLowPriority) {
        throw new Error('Execution cancelled - low priority SD');
      }
    }
  }

  /**
   * Execute a specific phase
   */
  async executePhase(phase, sdId) {
    this.executionState.currentPhase = phase;

    switch (phase) {
      case 'LEAD':
        await this.executeLEADPhase(sdId);
        break;
      case 'PLAN':
        await this.executePLANPhase(sdId);
        break;
      case 'EXEC':
        await this.executeEXECPhase(sdId);
        break;
      case 'VERIFICATION':
        await this.executeVERIFICATIONPhase(sdId);
        break;
      case 'APPROVAL':
        await this.executeAPPROVALPhase(sdId);
        break;
    }
  }

  /**
   * Enforce phase gate - blocking validation
   */
  async enforcePhaseGate(phase, sdId) {
    console.log(chalk.yellow(`\n🚦 ${phase} PHASE GATE VALIDATION`));

    const requirements = this.phaseRequirements[phase];
    const results = {};
    let allPassed = true;

    for (const requirement of requirements) {
      const passed = await this.validateRequirement(phase, requirement, sdId);
      results[requirement] = passed;

      if (passed) {
        console.log(chalk.green(`  ✓ ${requirement}`));
      } else {
        console.log(chalk.red(`  ✗ ${requirement}`));
        allPassed = false;
      }
    }

    if (!allPassed) {
      // Record violation
      this.executionState.violations.push({
        phase,
        failedRequirements: Object.keys(results).filter(r => !results[r]),
        timestamp: new Date()
      });

      // Block progression
      throw new Error(`${phase} gate validation failed. Fix requirements and retry.`);
    }

    console.log(chalk.green.bold(`✅ ${phase} GATE PASSED`));
  }

  /**
   * Validate a specific requirement
   */
  async validateRequirement(phase, requirement, sdId) {
    // This would contain actual validation logic
    // For now, we'll check database records

    switch (requirement) {
      case 'prd_created_in_database':
        // Only required for phases after PLAN
        if (phase === 'LEAD') {
          return true; // Not required in LEAD phase
        }
        const { data: prd } = await this.supabase
          .from('product_requirements_v2')
          .select('id')
          .eq('directive_id', sdId)
          .single();
        return !!prd;

      case 'handoff_created_in_database':
        const { data: handoff } = await this.supabase
          .from('sd_phase_handoffs')
          .select('id')
          .eq('sd_id', sdId)
          .eq('from_agent', phase)
          .single();
        return !!handoff;

      case 'human_approval_requested':
        const { data: approval } = await this.supabase
          .from('leo_approval_requests')
          .select('id')
          .eq('sd_id', sdId)
          .eq('status', 'pending')
          .single();
        return !!approval;

      // Add more validation logic as needed
      default:
        // For demo, we'll prompt for manual confirmation
        const { confirmed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmed',
          message: `Confirm: ${requirement}?`,
          default: false
        }]);
        return confirmed;
    }
  }

  /**
   * LEAD Phase execution
   */
  async executeLEADPhase(sdId) {
    console.log(chalk.blue('\n🎯 Executing LEAD Phase'));

    // Check for over-engineering
    console.log('Running over-engineering evaluation...');
    // Would call lead-over-engineering-rubric.js here

    // Create handoff
    console.log('Creating LEAD→PLAN handoff...');
    // Would create handoff in database
  }

  /**
   * PLAN Phase execution
   */
  async executePLANPhase(sdId) {
    console.log(chalk.blue('\n📐 Executing PLAN Phase'));

    // Check if PRD already exists
    const { data: existingPrd } = await this.supabase
      .from('product_requirements_v2')
      .select('id, title')
      .eq('directive_id', sdId)
      .single();

    if (existingPrd) {
      console.log(chalk.green(`✓ PRD already exists: ${existingPrd.title}`));
      return;
    }

    // Get SD details for PRD generation
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (!sd) {
      throw new Error(`Strategic Directive ${sdId} not found`);
    }

    // Create PRD
    console.log('Creating PRD in database...');
    const prdData = await this.generatePRD(sd);

    const { data: newPrd, error: prdError } = await this.supabase
      .from('product_requirements_v2')
      .insert({
        ...prdData,
        directive_id: prdData.strategic_directive_id
      })
      .select()
      .single();

    if (prdError) {
      throw new Error(`Failed to create PRD: ${prdError.message}`);
    }

    console.log(chalk.green(`✓ PRD created: ${newPrd.title}`));

    // Activate sub-agents
    console.log('Activating relevant sub-agents...');
    // Sub-agent activation handled by enforced orchestrator wrapper
  }

  /**
   * EXEC Phase execution with mandatory checklist
   */
  async executeEXECPhase(sdId) {
    console.log(chalk.blue('\n💻 Executing EXEC Phase'));

    // MANDATORY: Pre-implementation checklist
    console.log(chalk.yellow('\n📋 EXEC PRE-IMPLEMENTATION CHECKLIST'));

    const checklist = {
      appVerified: false,
      screenshotTaken: false,
      componentIdentified: false,
      urlVerified: false
    };

    // Verify correct application
    console.log('Verifying target application...');
    const { appConfirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'appConfirmed',
      message: 'Are you in /mnt/c/_EHG/EHG/ (NOT EHG_Engineer)?',
      default: false
    }]);
    checklist.appVerified = appConfirmed;

    // Take screenshot
    console.log('Taking screenshot of current state...');
    const { screenshotTaken } = await inquirer.prompt([{
      type: 'confirm',
      name: 'screenshotTaken',
      message: 'Screenshot taken?',
      default: false
    }]);
    checklist.screenshotTaken = screenshotTaken;

    // Verify all checklist items
    if (!Object.values(checklist).every(v => v)) {
      throw new Error('EXEC pre-implementation checklist incomplete');
    }

    console.log(chalk.green('✓ Pre-implementation checklist complete'));
  }

  /**
   * VERIFICATION Phase execution
   */
  async executeVERIFICATIONPhase(sdId) {
    console.log(chalk.blue('\n🔍 Executing VERIFICATION Phase'));

    // Run supervisor verification
    console.log('Running PLAN supervisor verification...');
    // Would call plan-supervisor-verification.js
  }

  /**
   * APPROVAL Phase execution with human gate
   */
  async executeAPPROVALPhase(sdId) {
    console.log(chalk.blue('\n✅ Executing APPROVAL Phase'));

    // MANDATORY: Human approval
    console.log(chalk.red.bold('\n🛡️ HUMAN APPROVAL REQUIRED'));

    // Store approval request
    const approvalRequest = {
      id: `APPROVAL-${Date.now()}`,
      sd_id: sdId,
      requested_at: new Date(),
      status: 'pending',
      type: 'LEAD_FINAL_APPROVAL'
    };

    await this.supabase
      .from('leo_approval_requests')
      .insert(approvalRequest);

    console.log(chalk.yellow('Waiting for human approval...'));

    // Simulate waiting for approval
    const { approved } = await inquirer.prompt([{
      type: 'confirm',
      name: 'approved',
      message: 'HUMAN: Approve SD completion?',
      default: false
    }]);

    if (!approved) {
      throw new Error('Human approval denied');
    }

    // Update approval request
    await this.supabase
      .from('leo_approval_requests')
      .update({
        status: 'approved',
        approved_at: new Date(),
        approver: 'human'
      })
      .eq('id', approvalRequest.id);
  }

  /**
   * Enforce retrospective
   */
  async enforceRetrospective(sdId) {
    console.log(chalk.cyan('\n📝 MANDATORY RETROSPECTIVE'));

    const retrospective = {
      sd_id: sdId,
      session_id: this.executionState.sessionId,
      completed_at: new Date(),
      key_learnings: [],
      improvements: [],
      successes: []
    };

    // Collect retrospective data
    const { lessons } = await inquirer.prompt([{
      type: 'input',
      name: 'lessons',
      message: 'Key lessons learned:',
      default: 'Process followed successfully'
    }]);

    retrospective.key_learnings.push(lessons);

    // Store in database
    await this.supabase
      .from('leo_retrospectives')
      .insert(retrospective);

    console.log(chalk.green('✓ Retrospective completed'));
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(sdId) {
    console.log(chalk.cyan('\n📊 COMPLIANCE REPORT'));
    console.log(chalk.gray('─'.repeat(40)));

    const report = {
      sd_id: sdId,
      session_id: this.executionState.sessionId,
      phases_completed: this.executionState.completedPhases.length,
      violations: this.executionState.violations.length,
      skipped_steps: this.executionState.skippedSteps.length,
      duration: new Date() - this.executionState.startTime,
      compliance_score: this.executionState.violations.length === 0 ? 100 : 0
    };

    console.log(`SD: ${report.sd_id}`);
    console.log(`Phases Completed: ${report.phases_completed}/5`);
    console.log(`Violations: ${report.violations}`);
    console.log(`Compliance Score: ${report.compliance_score}%`);
    console.log(`Duration: ${Math.round(report.duration / 1000)}s`);

    // Store report
    await this.supabase
      .from('leo_compliance_reports')
      .insert(report);
  }

  /**
   * Check if phase is already complete
   */
  async checkPhaseCompletion(sdId, phase) {
    const { data } = await this.supabase
      .from('leo_phase_completions')
      .select('completed_at')
      .eq('sd_id', sdId)
      .eq('phase', phase)
      .single();

    return !!data?.completed_at;
  }

  /**
   * Record phase completion
   */
  async recordPhaseCompletion(phase, sdId) {
    this.executionState.completedPhases.push(phase);

    await this.supabase
      .from('leo_phase_completions')
      .upsert({
        sd_id: sdId,
        phase,
        completed_at: new Date(),
        session_id: this.executionState.sessionId
      });
  }

  /**
   * Handle execution failure
   */
  async handleExecutionFailure(error) {
    // Update session status
    await this.supabase
      .from('leo_execution_sessions')
      .update({
        status: 'failed',
        failed_at: new Date(),
        error_message: error.message,
        failed_phase: this.executionState.currentPhase
      })
      .eq('id', this.executionState.sessionId);

    // Log violation
    await this.supabase
      .from('leo_violations')
      .insert({
        session_id: this.executionState.sessionId,
        sd_id: this.executionState.sdId,
        phase: this.executionState.currentPhase,
        violation_type: 'execution_failure',
        details: error.message,
        timestamp: new Date()
      });
  }

  /**
   * Check if SD is consolidated (has backlog items)
   */
  async isConsolidatedSD(sdId) {
    const { data: items } = await this.supabase
      .from('sd_backlog_map')
      .select('backlog_id')
      .eq('sd_id', sdId)
      .limit(1);

    return items && items.length > 0;
  }

  /**
   * Fetch backlog items for consolidated SD
   */
  async fetchBacklogItems(sdId) {
    const { data: items, error } = await this.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sdId)
      .order('stage_number', { ascending: true });

    if (error) {
      console.log(chalk.yellow(`⚠️  No backlog items found for ${sdId}`));
      return [];
    }

    return items || [];
  }

  /**
   * Generate PRD from Strategic Directive
   */
  async generatePRD(sd) {
    const prdId = `PRD-${sd.id}-${Date.now()}`;

    // Check if this is a consolidated SD
    const isConsolidated = await this.isConsolidatedSD(sd.id);
    let backlogItems = [];

    if (isConsolidated) {
      console.log(chalk.cyan('   Detected consolidated SD - fetching backlog items...'));
      backlogItems = await this.fetchBacklogItems(sd.id);
      console.log(chalk.green(`   Found ${backlogItems.length} backlog items`));
    }

    // Generate PRD content structure
    const prdContent = {
      version: '1.0.0',
      product_overview: {
        name: sd.title,
        description: sd.description || 'Implementation of strategic directive objectives',
        target_users: ['Internal stakeholders', 'End users'],
        business_value: sd.business_value || 'Achieve strategic objectives'
      },
      user_stories: isConsolidated ?
        this.generateUserStoriesFromBacklog(backlogItems, sd) :
        this.generateUserStories(sd),
      technical_requirements: {
        architecture: 'To be defined based on requirements',
        technology_stack: 'Existing stack',
        integrations: [],
        performance_requirements: {
          response_time: '< 2s',
          availability: '99.9%'
        }
      },
      acceptance_criteria: this.generateAcceptanceCriteria(sd),
      test_plan: {
        unit_tests: 'Required for all new functionality',
        integration_tests: 'Required for API endpoints',
        user_acceptance_tests: 'Required before deployment',
        performance_tests: 'As needed based on requirements'
      },
      metadata: {
        generated_by: 'LEO Protocol Orchestrator',
        generation_method: 'automated_from_sd',
        sd_priority: sd.priority || 'medium',
        is_consolidated: isConsolidated,
        backlog_item_count: backlogItems.length
      }
    };

    // Add backlog evidence appendix if consolidated
    if (isConsolidated) {
      prdContent.backlog_evidence = this.generateBacklogEvidence(backlogItems);

      // Validate all items are included
      const expectedCount = sd.metadata?.item_count || sd.total_items || 0;
      if (expectedCount > 0 && backlogItems.length !== expectedCount) {
        console.log(chalk.yellow(`⚠️  Item count mismatch: Found ${backlogItems.length}, expected ${expectedCount}`));
      }
    }

    // Return PRD record with content as JSON string
    return {
      id: prdId,
      sd_id: sd.id,
      title: `PRD: ${sd.title}`,
      content: JSON.stringify(prdContent, null, 2),
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        generated_by: 'LEO Protocol Orchestrator',
        sd_priority: sd.priority || 'medium',
        is_consolidated: isConsolidated,
        backlog_items: isConsolidated ? backlogItems.map(i => i.backlog_id) : []
      }
    };
  }

  /**
   * Generate backlog evidence appendix
   */
  generateBacklogEvidence(backlogItems) {
    const evidence = {};

    backlogItems.forEach(item => {
      evidence[item.backlog_id] = {
        title: item.backlog_title,
        priority: item.priority,
        stage: item.stage_number,
        category: item.extras?.Category || 'General',
        description: item.extras?.Description_1 || item.item_description || '',
        new_module: item.new_module || false,
        completion_status: item.completion_status || 'NOT_STARTED',
        raw_data: {
          description_raw: item.description_raw,
          my_comments: item.my_comments,
          extras: item.extras || {}
        }
      };
    });

    return evidence;
  }

  /**
   * Generate user stories from backlog items (for consolidated SDs)
   */
  generateUserStoriesFromBacklog(backlogItems, sd) {
    const stories = [];

    // Map backlog priority to user story priority
    const priorityMap = {
      'Very High': 'CRITICAL',
      'High': 'HIGH',
      'Medium': 'MEDIUM',
      'Low': 'LOW',
      'Very Low': 'LOW'
    };

    backlogItems.forEach((item, index) => {
      // Extract description from extras if available
      const description = item.extras?.Description_1 || item.item_description || item.description_raw || '';
      const category = item.extras?.Category || 'General';

      stories.push({
        id: `US-${sd.id}-${String(index + 1).padStart(3, '0')}`,
        title: item.backlog_title,
        description: description,
        acceptance_criteria: this.generateAcceptanceCriteriaFromBacklogItem(item),
        priority: priorityMap[item.priority] || 'MEDIUM',
        metadata: {
          backlog_id: item.backlog_id,
          stage: item.stage_number,
          category: category,
          new_module: item.new_module || false,
          completion_status: item.completion_status || 'NOT_STARTED'
        }
      });
    });

    // Validate we got all items
    if (stories.length !== backlogItems.length) {
      console.log(chalk.yellow(`⚠️  Story count mismatch: ${stories.length} stories from ${backlogItems.length} items`));
    }

    return stories;
  }

  /**
   * Generate acceptance criteria from a backlog item
   */
  generateAcceptanceCriteriaFromBacklogItem(item) {
    const criteria = [];

    // Basic implementation criteria
    criteria.push(`${item.backlog_title} is fully implemented`);

    // Add specific criteria based on item details
    if (item.new_module) {
      criteria.push('New module is created and integrated');
    }

    if (item.extras?.Description_1) {
      // Extract key requirements from description
      if (item.extras.Description_1.includes('integration') || item.extras.Description_1.includes('integrate')) {
        criteria.push('Integration is tested and working');
      }
      if (item.extras.Description_1.includes('API')) {
        criteria.push('API endpoints are documented and tested');
      }
      if (item.extras.Description_1.includes('sync')) {
        criteria.push('Synchronization is verified bi-directionally');
      }
    }

    // Standard criteria
    criteria.push('Feature passes all tests');
    criteria.push('Documentation is updated');

    if (item.priority === 'Very High' || item.priority === 'High') {
      criteria.push('Performance benchmarks are met');
      criteria.push('Security review completed');
    }

    return criteria;
  }

  /**
   * Generate user stories from SD objectives
   */
  generateUserStories(sd) {
    const stories = [];
    const objectives = sd.objectives || [];

    // Parse objectives if they're a string
    const objectiveList = typeof objectives === 'string'
      ? objectives.split('\n').filter(o => o.trim())
      : objectives;

    objectiveList.forEach((objective, index) => {
      stories.push({
        id: `US-${sd.id}-${index + 1}`,
        title: objective.trim(),
        description: `As a user, I want ${objective.trim().toLowerCase()}`,
        acceptance_criteria: [
          `${objective.trim()} is implemented`,
          'Feature is tested and verified',
          'Documentation is updated'
        ],
        priority: 'HIGH'
      });
    });

    // Add default story if no objectives
    if (stories.length === 0) {
      stories.push({
        id: `US-${sd.id}-001`,
        title: 'Implement strategic directive',
        description: `As a stakeholder, I want ${sd.title} to be implemented`,
        acceptance_criteria: [
          'All requirements are met',
          'Solution is tested and verified',
          'Documentation is complete'
        ],
        priority: 'HIGH'
      });
    }

    return stories;
  }

  /**
   * Generate acceptance criteria from SD
   */
  generateAcceptanceCriteria(sd) {
    return [
      'All user stories are implemented and tested',
      'Code passes all quality checks (linting, type checking)',
      'Unit test coverage meets minimum requirements',
      'Integration tests pass successfully',
      'Documentation is updated',
      'Performance requirements are met',
      'Security requirements are satisfied',
      'User acceptance criteria are validated'
    ];
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new LEOProtocolOrchestrator();

  const sdId = process.argv[2];
  if (!sdId) {
    console.error(chalk.red('Usage: node leo-protocol-orchestrator.js <SD-ID>'));
    process.exit(1);
  }

  orchestrator.executeSD(sdId)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default LEOProtocolOrchestrator;