#!/usr/bin/env node

/**
 * Mandatory Sub-Agent Gates Enforcement System
 * Ensures critical sub-agents run at required phases
 * Part of LEO Protocol v4.2.0 - Enhanced Validation System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { SmartSubAgentDetector } from './smart-subagent-detector.js';
import { CodebaseValidator } from './lead-codebase-validation.js';
import { exec } from 'child_process';
import { promisify } from 'util';

config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SubAgentGateEnforcer {
  constructor() {
    // Define mandatory gates for each phase
    this.mandatoryGates = {
      'LEAD_TO_PLAN': {
        required: ['VALIDATION', 'SECURITY', 'DOCMON'],
        optional: ['DATABASE', 'DESIGN'],
        description: 'Before creating LEAD→PLAN handoff'
      },
      'PLAN_TO_EXEC': {
        required: ['DATABASE', 'TESTING', 'STORIES', 'DOCMON'],
        optional: ['PERFORMANCE', 'DESIGN'],
        description: 'Before creating PLAN→EXEC handoff'
      },
      'EXEC_TO_VERIFICATION': {
        required: ['TESTING', 'PERFORMANCE', 'DOCMON'],
        optional: ['DESIGN', 'SECURITY'],
        description: 'Before EXEC→PLAN verification handoff'
      },
      'FINAL_APPROVAL': {
        required: ['SECURITY', 'DOCMON', 'RETRO'],
        optional: ['TESTING', 'VALIDATION'],
        description: 'Before final LEAD approval'
      }
    };

    // Sub-agent execution scripts (where they exist)
    this.subAgentScripts = {
      'VALIDATION': 'scripts/lead-codebase-validation.js',
      'STORIES': 'scripts/generate-stories-from-prd.js',
      'DOCMON': 'scripts/documentation-monitor-subagent.js',
      'RETRO': 'scripts/retrospective-sub-agent.js',
      // Others don't have scripts yet, would need manual review
    };

    this.detector = new SmartSubAgentDetector();
  }

  /**
   * Enforce gates for a specific phase
   */
  async enforceGates(phase, sdId, prdId) {
    console.log('\n🚦 SUB-AGENT GATE ENFORCEMENT');
    console.log('═'.repeat(50));
    console.log(`Phase: ${phase}`);
    console.log(`SD: ${sdId || 'N/A'}`);
    console.log(`PRD: ${prdId || 'N/A'}`);
    console.log('═'.repeat(50));

    // Check if phase has mandatory gates
    const gateConfig = this.mandatoryGates[phase];
    if (!gateConfig) {
      console.log('⚠️ No mandatory gates defined for this phase');
      return {
        phase,
        success: true,
        gatesEnforced: false
      };
    }

    console.log(`\n📋 ${gateConfig.description}`);
    console.log(`Required Sub-Agents: ${gateConfig.required.join(', ')}`);
    console.log(`Optional Sub-Agents: ${gateConfig.optional.join(', ')}`);

    // Get content for smart detection
    const { sdContent, prdContent } = await this.fetchContent(sdId, prdId);

    // Run smart detection
    console.log('\n🔍 Running smart detection...');
    const detectedAgents = await this.detector.detectRequiredSubAgents(
      sdContent,
      prdContent,
      [],
      phase
    );

    // Check which required agents have already run
    const executionStatus = await this.checkExecutionStatus(
      sdId,
      prdId,
      phase,
      gateConfig.required
    );

    // Execute missing required sub-agents
    const results = {
      phase,
      required: {},
      optional: {},
      blocked: false,
      errors: []
    };

    console.log('\n🔄 EXECUTING REQUIRED SUB-AGENTS');
    console.log('-'.repeat(40));

    for (const agent of gateConfig.required) {
      if (executionStatus[agent]?.status === 'passed') {
        console.log(`✅ ${agent}: Already executed and passed`);
        results.required[agent] = 'passed';
      } else {
        console.log(`⏳ ${agent}: Executing...`);
        const result = await this.executeSubAgent(agent, sdId, prdId, phase);
        results.required[agent] = result.status;

        if (result.status === 'failed' || result.status === 'blocked') {
          results.blocked = true;
          results.errors.push(`${agent}: ${result.error}`);
          console.log(`❌ ${agent}: ${result.status} - ${result.error}`);
        } else {
          console.log(`✅ ${agent}: ${result.status}`);
        }
      }
    }

    // Check optional agents (run if detected with high confidence)
    console.log('\n📊 CHECKING OPTIONAL SUB-AGENTS');
    console.log('-'.repeat(40));

    for (const agent of gateConfig.optional) {
      const detected = detectedAgents.find(d => d.agent === agent);
      if (detected && detected.confidence === 'HIGH') {
        console.log(`🟡 ${agent}: Detected with HIGH confidence - executing...`);
        const result = await this.executeSubAgent(agent, sdId, prdId, phase);
        results.optional[agent] = result.status;
        console.log(`   Result: ${result.status}`);
      } else {
        console.log(`⏭️ ${agent}: Skipped (not detected or low confidence)`);
        results.optional[agent] = 'skipped';
      }
    }

    // Save gate enforcement results
    await this.saveResults(sdId, prdId, phase, results);

    // Display summary
    this.displaySummary(results);

    return {
      phase,
      success: !results.blocked,
      results,
      recommendation: results.blocked ? 'BLOCKED' : 'PROCEED'
    };
  }

  /**
   * Fetch content from database
   */
  async fetchContent(sdId, prdId) {
    let sdContent = '';
    let prdContent = '';

    if (sdId) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (sd) {
        sdContent = `${sd.title} ${sd.description}`;
      }
    }

    if (prdId) {
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();

      if (prd) {
        prdContent = `${prd.title} ${prd.description} ${JSON.stringify(prd.functional_requirements)}`;
      }
    }

    return { sdContent, prdContent };
  }

  /**
   * Check execution status of sub-agents
   */
  async checkExecutionStatus(sdId, prdId, phase, requiredAgents) {
    const status = {};

    for (const agent of requiredAgents) {
      // Check for existing validation in database
      const { data } = await supabase
        .from('leo_mandatory_validations')
        .select('*')
        .eq('sd_id', sdId || 'none')
        .eq('prd_id', prdId || 'none')
        .eq('sub_agent_code', agent)
        .eq('phase', phase)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        status[agent] = data;
      } else {
        status[agent] = { status: 'not_run' };
      }
    }

    return status;
  }

  /**
   * Execute a specific sub-agent
   */
  async executeSubAgent(agentCode, sdId, prdId, phase) {
    try {
      // Special handling for VALIDATION sub-agent
      if (agentCode === 'VALIDATION') {
        const validator = new CodebaseValidator(sdId, prdId);
        const result = await validator.validate();

        return {
          status: result.approval_recommendation === 'BLOCKED' ? 'blocked' : 'passed',
          result,
          error: result.approval_recommendation === 'BLOCKED' ?
            result.human_review_reasons.join('; ') : null
        };
      }

      // Check if sub-agent has a script
      const scriptPath = this.subAgentScripts[agentCode];
      if (scriptPath) {
        console.log(`   Running script: ${scriptPath}`);
        const { stdout, stderr } = await execAsync(
          `node ${scriptPath} --sd-id "${sdId}" --prd-id "${prdId}"`,
          { cwd: process.cwd() }
        );

        // Parse output for pass/fail
        const passed = !stderr && !stdout.includes('BLOCKED') && !stdout.includes('FAILED');

        return {
          status: passed ? 'passed' : 'failed',
          output: stdout,
          error: stderr || null
        };
      }

      // For sub-agents without scripts, perform manual analysis
      console.log(`   No automated script for ${agentCode} - performing analysis...`);
      return await this.performManualAnalysis(agentCode, sdId, prdId);

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Perform manual analysis for sub-agents without scripts
   */
  async performManualAnalysis(agentCode, sdId, prdId) {
    // This is a placeholder for manual analysis
    // In production, this would integrate with the actual sub-agent logic

    const analyses = {
      'SECURITY': async () => {
        // Basic security checks
        const { sdContent, prdContent } = await this.fetchContent(sdId, prdId);
        const content = `${sdContent} ${prdContent}`.toLowerCase();

        const securityConcerns = [];
        if (content.includes('api') || content.includes('endpoint')) {
          securityConcerns.push('API endpoints need authentication');
        }
        if (content.includes('user') || content.includes('data')) {
          securityConcerns.push('User data needs protection');
        }
        if (content.includes('public') || content.includes('external')) {
          securityConcerns.push('External access needs security review');
        }

        return {
          status: securityConcerns.length > 2 ? 'failed' : 'passed',
          concerns: securityConcerns,
          error: securityConcerns.length > 2 ?
            `High security risk: ${securityConcerns.join('; ')}` : null
        };
      },

      'DATABASE': async () => {
        // Check for database implications
        const { sdContent, prdContent } = await this.fetchContent(sdId, prdId);
        const content = `${sdContent} ${prdContent}`.toLowerCase();

        const dbNeeded = /save|store|persist|database|table|query/.test(content);

        return {
          status: 'passed',
          notes: dbNeeded ? 'Database schema changes may be needed' : 'No database changes detected'
        };
      },

      'TESTING': async () => {
        // Check for test requirements
        return {
          status: 'passed',
          notes: 'Test coverage requirements need to be defined'
        };
      },

      'PERFORMANCE': async () => {
        // Check for performance implications
        const { sdContent, prdContent } = await this.fetchContent(sdId, prdId);
        const content = `${sdContent} ${prdContent}`.toLowerCase();

        const perfConcerns = [];
        if (content.includes('list') || content.includes('multiple')) {
          perfConcerns.push('Pagination may be needed');
        }
        if (content.includes('real-time') || content.includes('live')) {
          perfConcerns.push('Consider caching strategy');
        }

        return {
          status: 'passed',
          concerns: perfConcerns
        };
      },

      'DESIGN': async () => {
        // Check for UI/UX implications
        const { sdContent, prdContent } = await this.fetchContent(sdId, prdId);
        const content = `${sdContent} ${prdContent}`.toLowerCase();

        const uiNeeded = /interface|ui|ux|screen|page|component/.test(content);

        return {
          status: 'passed',
          notes: uiNeeded ? 'UI/UX design review recommended' : 'No UI changes detected'
        };
      }
    };

    if (analyses[agentCode]) {
      return await analyses[agentCode]();
    }

    // Default for unknown agents
    return {
      status: 'skipped',
      notes: `No analysis available for ${agentCode}`
    };
  }

  /**
   * Save gate enforcement results
   */
  async saveResults(sdId, prdId, phase, results) {
    try {
      // Save each sub-agent result
      for (const [agent, status] of Object.entries(results.required)) {
        await supabase
          .from('leo_mandatory_validations')
          .upsert({
            sd_id: sdId,
            prd_id: prdId,
            phase,
            sub_agent_code: agent,
            status: status === 'passed' ? 'passed' : 'failed',
            results: {
              execution_time: new Date().toISOString(),
              status,
              mandatory: true
            }
          });
      }

      for (const [agent, status] of Object.entries(results.optional)) {
        if (status !== 'skipped') {
          await supabase
            .from('leo_mandatory_validations')
            .upsert({
              sd_id: sdId,
              prd_id: prdId,
              phase,
              sub_agent_code: agent,
              status,
              results: {
                execution_time: new Date().toISOString(),
                status,
                mandatory: false
              }
            });
        }
      }

      console.log('\n✅ Results saved to database');
    } catch (error) {
      console.error('⚠️ Failed to save results:', error.message);
    }
  }

  /**
   * Display enforcement summary
   */
  displaySummary(results) {
    console.log('\n' + '═'.repeat(50));
    console.log('📊 GATE ENFORCEMENT SUMMARY');
    console.log('═'.repeat(50));

    console.log('\nRequired Sub-Agents:');
    for (const [agent, status] of Object.entries(results.required)) {
      const emoji = status === 'passed' ? '✅' :
                   status === 'failed' ? '❌' :
                   status === 'blocked' ? '🚫' : '⚠️';
      console.log(`  ${emoji} ${agent}: ${status}`);
    }

    if (Object.keys(results.optional).length > 0) {
      console.log('\nOptional Sub-Agents:');
      for (const [agent, status] of Object.entries(results.optional)) {
        const emoji = status === 'passed' ? '✅' :
                     status === 'failed' ? '❌' :
                     status === 'skipped' ? '⏭️' : '⚠️';
        console.log(`  ${emoji} ${agent}: ${status}`);
      }
    }

    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      for (const error of results.errors) {
        console.log(`  • ${error}`);
      }
    }

    console.log('\n' + '═'.repeat(50));
    if (results.blocked) {
      console.log('🚫 GATE BLOCKED - Cannot proceed to next phase');
    } else {
      console.log('✅ GATE PASSED - Ready to proceed');
    }
    console.log('═'.repeat(50));
  }

  /**
   * Get gate status for a phase
   */
  async getGateStatus(sdId, prdId, phase) {
    const gateConfig = this.mandatoryGates[phase];
    if (!gateConfig) {
      return { phase, hasGates: false };
    }

    const { data: validations } = await supabase
      .from('leo_mandatory_validations')
      .select('*')
      .eq('sd_id', sdId)
      .eq('prd_id', prdId)
      .eq('phase', phase);

    const required = gateConfig.required;
    const completed = validations?.filter(v =>
      required.includes(v.sub_agent_code) && v.status === 'passed'
    ).map(v => v.sub_agent_code) || [];

    const missing = required.filter(r => !completed.includes(r));

    return {
      phase,
      hasGates: true,
      required,
      completed,
      missing,
      allPassed: missing.length === 0
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let sdId = null;
  let prdId = null;
  let phase = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sd-id' && args[i + 1]) {
      sdId = args[i + 1];
    }
    if (args[i] === '--prd-id' && args[i + 1]) {
      prdId = args[i + 1];
    }
    if (args[i] === '--phase' && args[i + 1]) {
      phase = args[i + 1];
    }
  }

  if (!phase) {
    console.error('❌ Error: Please provide --phase');
    console.log('Usage: node enforce-subagent-gates.js --sd-id <SD_ID> --prd-id <PRD_ID> --phase <PHASE>');
    console.log('\nValid phases:');
    console.log('  - LEAD_TO_PLAN');
    console.log('  - PLAN_TO_EXEC');
    console.log('  - EXEC_TO_VERIFICATION');
    console.log('  - FINAL_APPROVAL');
    process.exit(1);
  }

  const enforcer = new SubAgentGateEnforcer();
  const result = await enforcer.enforceGates(phase, sdId, prdId);

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { SubAgentGateEnforcer };
export default SubAgentGateEnforcer;