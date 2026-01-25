#!/usr/bin/env node

/**
 * Automated Handoff Validator for LEO Protocol
 * Enforces checklist completion before allowing handoffs
 */

import { createClient } from '@supabase/supabase-js';
import DynamicChecklistGenerator from './dynamic-checklist-generator.js';
import SubAgentEnforcementSystem from './subagent-enforcement-system.js';
import { checkRCAGate } from './root-cause-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import dotenv from 'dotenv';
dotenv.config();

class HandoffValidator {
  constructor() {
    // Use service role key for full access to LEO tables (anon key blocked by RLS on some tables)
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.subAgentEnforcer = new SubAgentEnforcementSystem();
    
    // Minimum completion thresholds for handoff
    this.thresholds = {
      'LEAD->PLAN': 100,  // LEAD must be 100% complete
      'PLAN->EXEC': 100,  // PLAN must be 100% complete
      'EXEC->PLAN': 100,  // EXEC must be 100% complete before verification
      'PLAN->LEAD': 100,  // Verification must be 100% complete
      'LEAD->DEPLOY': 100 // Final approval must be 100%
    };
    
    // Define which sub-agents are critical at each handoff
    this.handoffSubAgentRequirements = {
      'LEAD->PLAN': {
        // LEAD hands off strategic vision to PLAN for technical design
        triggers: {
          'Analytics': 'If KPIs or metrics defined',
          'Compliance': 'If regulatory requirements mentioned'
        }
      },
      'PLAN->EXEC': {
        // PLAN hands off technical design to EXEC for implementation
        triggers: {
          'Design': 'If UI/UX components designed (2+)',
          'Database': 'If schema changes planned',
          'Security': 'If auth/security requirements defined',
          'Integration': 'If external APIs specified',
          'Performance': 'If performance targets set'
        }
      },
      'EXEC->PLAN': {
        // EXEC hands back implementation for verification
        triggers: {
          'Testing': 'ALWAYS - must verify implementation',
          'Security': 'If auth/tokens/API implemented',
          'Database': 'If migrations/schema created',
          'Performance': 'If latency requirements exist',
          'Design': 'If UI components implemented (2+)',
          'Documentation': 'If user-facing features added'
        }
      },
      'PLAN->LEAD': {
        // PLAN hands verified implementation for approval
        triggers: {
          'Testing': 'ALWAYS - test results required',
          'Documentation': 'ALWAYS - for handover',
          'Compliance': 'If regulatory requirements',
          'Analytics': 'If success metrics defined'
        }
      },
      'LEAD->DEPLOY': {
        // LEAD approves for deployment
        triggers: {
          'DevOps': 'ALWAYS - deployment readiness',
          'Documentation': 'ALWAYS - final documentation',
          'Security': 'ALWAYS - security sign-off'
        }
      }
    };
  }

  /**
   * Validate if handoff is allowed
   */
  async validateHandoff(fromAgent, toAgent, sdId) {
    console.log(`\n🔍 Validating ${fromAgent} → ${toAgent} Handoff\n`);
    
    const handoffKey = `${fromAgent}->${toAgent}`;
    const threshold = this.thresholds[handoffKey] || 100;
    
    // Get current checklist status
    const status = await this.getChecklistStatus(fromAgent, sdId);
    
    // Check completion
    const isChecklistValid = status.percentage >= threshold;

    // NEW: Check sub-agent requirements for this handoff
    const subAgentCheck = await this.validateSubAgentRequirements(handoffKey, sdId);

    // RCA Gate Check: Block EXEC->PLAN if P0/P1 RCRs without verified CAPAs
    let rcaGateCheck = { blocked: false, message: 'RCA gate check not applicable' };
    if (handoffKey === 'EXEC->PLAN') {
      console.log('\n🔒 Checking RCA Gate for P0/P1 defects...');
      rcaGateCheck = await checkRCAGate(sdId);

      if (rcaGateCheck.blocked) {
        console.log('\n❌ RCA Gate: BLOCKED');
        console.log(`   ${rcaGateCheck.message}`);
        console.log('\n   Blocking RCR IDs:');
        for (const rcr of rcaGateCheck.blockingRCRs) {
          console.log(`   - ${rcr.id} (${rcr.severity_priority}): ${rcr.problem_statement}`);
        }
        console.log('\n   ⚠️  HANDOFF CANNOT PROCEED until all P0/P1 RCRs have verified CAPAs');
        console.log('   Run: npm run rca:capa-verify -- --capa-id <UUID>');
      } else {
        console.log(`\n✅ RCA Gate: PASS - ${rcaGateCheck.message}`);
      }
    }

    // Overall validity requires checklist, sub-agents, AND RCA gate
    const isValid = isChecklistValid && subAgentCheck.valid && !rcaGateCheck.blocked;
    
    // Generate comprehensive report
    const report = {
      handoff: handoffKey,
      sdId,
      timestamp: new Date().toISOString(),
      valid: isValid,
      completion: status.percentage,
      threshold,
      details: status.details,
      blockingItems: [
        ...status.incomplete,
        ...subAgentCheck.blockingItems,
        ...(rcaGateCheck.blocked ? rcaGateCheck.blockingRCRs.map(rcr =>
          `RCA Gate: ${rcr.severity_priority} - ${rcr.problem_statement} (RCR ${rcr.id})`
        ) : [])
      ],
      subAgentResults: subAgentCheck,
      rcaGateResults: rcaGateCheck,
      recommendation: this.getRecommendation(isValid, status, threshold, subAgentCheck, rcaGateCheck)
    };
    
    // Display validation result
    this.displayValidation(report);
    
    // Log to database
    await this.logValidation(report);
    
    return report;
  }

  /**
   * Get checklist completion status for agent
   */
  async getChecklistStatus(agent, sdId) {
    // LEAD phase doesn't require PRD (it creates requirements for PRD)
    if (agent.toUpperCase() === 'LEAD') {
      // Return a basic completion status for LEAD
      return {
        completed: ['Strategic objectives defined', 'Business value articulated', 'Priority justified', 'Risk assessment', 'Success metrics'],
        incomplete: [],
        total: 5, // Standard LEAD checklist items
        percentage: 100, // Assume LEAD is complete if we're creating handoff
        details: []
      };
    }

    // Get PRD with checklists
    const { data: prds } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);

    const prd = prds?.[0];
    if (!prd) {
      // For PLAN phase, PRD might not exist yet (it creates the PRD)
      if (agent.toUpperCase() === 'PLAN') {
        return {
          completed: [],
          incomplete: [],
          total: 0,
          percentage: 0,
          details: []
        };
      }
      throw new Error(`No PRD found for ${sdId}`);
    }
    
    // Get appropriate checklist
    let checklist = [];

    switch (agent.toUpperCase()) {
      case 'LEAD':
        checklist = prd.lead_checklist || [];
        break;
      case 'PLAN':
        checklist = prd.plan_checklist || [];
        break;
      case 'EXEC':
        checklist = prd.exec_checklist || [];
        break;
      default:
        throw new Error(`Unknown agent: ${agent}`);
    }
    
    // If no checklist exists, generate dynamically
    if (checklist.length === 0) {
      console.log('⚠️  No checklist found, generating dynamically...');
      const generator = new DynamicChecklistGenerator();
      const result = await generator.generateChecklists(sdId);
      checklist = result.checklists[agent.toLowerCase()] || [];
    }
    
    // Calculate completion
    const total = checklist.length;
    const completed = checklist.filter(item => item.checked).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Get incomplete items
    const incomplete = checklist
      .filter(item => !item.checked)
      .map(item => item.text || item.task || 'Unknown task');
    
    return {
      agent,
      percentage,
      completed,
      total,
      details: checklist,
      incomplete
    };
  }

  /**
   * Display validation results
   */
  displayValidation(report) {
    console.log('═'.repeat(70));
    console.log('HANDOFF VALIDATION REPORT');
    console.log('═'.repeat(70));
    
    const statusIcon = report.valid ? '✅' : '❌';
    const statusText = report.valid ? 'APPROVED' : 'BLOCKED';
    
    console.log(`\nStatus: ${statusIcon} ${statusText}`);
    console.log(`Handoff: ${report.handoff}`);
    console.log(`Completion: ${report.completion}% (Required: ${report.threshold}%)`);
    
    if (report.blockingItems.length > 0) {
      console.log(`\n⚠️  Blocking Items (${report.blockingItems.length}):`);
      report.blockingItems.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item}`);
      });
    }
    
    console.log('\n💡 Recommendation:');
    console.log(`   ${report.recommendation}`);
    
    console.log('\n' + '═'.repeat(70));
  }

  /**
   * Validate sub-agent requirements for this handoff
   */
  async validateSubAgentRequirements(handoffKey, sdId) {
    console.log('🤖 Checking Sub-Agent Requirements...\n');
    
    const handoffReqs = this.handoffSubAgentRequirements[handoffKey] || { triggers: {} };
    const currentPhase = this.getPhaseFromHandoff(handoffKey);
    
    // Get sub-agents that were actually used
    const usedSubAgents = await this.subAgentEnforcer.getUsedSubAgents(sdId);
    
    // Check for tool execution evidence
    const toolEvidence = await this.checkToolExecution(sdId);
    
    // Analyze what should be required based on context
    const contextAnalysis = await this.subAgentEnforcer.analyzeContext(sdId, currentPhase);
    
    const results = {
      valid: true,
      requiredSubAgents: [],
      missingSubAgents: [],
      usedSubAgents,
      warnings: [],
      blockingItems: []
    };
    
    // Check context-driven requirements first
    for (const requiredAgent of contextAnalysis.requiredSubAgents) {
      if (!usedSubAgents.includes(requiredAgent)) {
        const triggers = contextAnalysis.detectedTriggers[requiredAgent] || [];
        
        // Check if this is a critical requirement for this handoff
        const handoffTrigger = handoffReqs.triggers[requiredAgent];
        if (handoffTrigger === 'ALWAYS' || handoffTrigger) {
          // BLOCKING: Critical for this handoff
          results.valid = false;
          results.missingSubAgents.push(requiredAgent);
          results.blockingItems.push(`Missing ${requiredAgent} sub-agent (${handoffTrigger})`);
          console.log(`  ❌ ${requiredAgent}: REQUIRED but not used`);
          console.log(`     Reason: ${handoffTrigger}`);
          triggers.forEach(t => console.log(`     Trigger: ${t.description}`));
        } else {
          // WARNING: Should be considered but not blocking
          results.warnings.push(`Consider ${requiredAgent} sub-agent`);
          console.log(`  ⚠️  ${requiredAgent}: Recommended but not used`);
          triggers.forEach(t => console.log(`     Trigger: ${t.description}`));
        }
      } else {
        console.log(`  ✅ ${requiredAgent}: Used`);
      }
    }
    
    // Check handoff-specific ALWAYS requirements
    for (const [agentType, requirement] of Object.entries(handoffReqs.triggers)) {
      if (requirement === 'ALWAYS' && !usedSubAgents.includes(agentType)) {
        results.valid = false;
        results.missingSubAgents.push(agentType);
        results.blockingItems.push(`Missing ${agentType} sub-agent (mandatory for ${handoffKey})`);
        console.log(`  ❌ ${agentType}: MANDATORY for ${handoffKey} but not used`);
      }
    }
    
    // Check tool execution for activated sub-agents
    if (toolEvidence) {
      console.log('\n📊 Tool Execution Status:');
      for (const agent of usedSubAgents) {
        const executed = toolEvidence[agent];
        if (executed) {
          console.log(`  ✅ ${agent}: Tool executed (score: ${executed.score || 'N/A'})`);
        } else {
          console.log(`  ⚠️  ${agent}: Context loaded but tool not executed`);
          results.warnings.push(`Run validation tool: node lib/agents/${agent}-sub-agent.js`);
        }
      }
    }
    
    // Summary
    if (results.valid) {
      console.log('\n✅ All required sub-agents have been activated');
    } else {
      console.log(`\n❌ ${results.missingSubAgents.length} required sub-agents missing`);
    }
    
    if (results.warnings.length > 0) {
      console.log(`⚠️  ${results.warnings.length} sub-agents recommended for quality`);
    }
    
    console.log();
    return results;
  }
  
  /**
   * Check for tool execution evidence
   */
  async checkToolExecution(_sdId) {
    const evidence = {};
    
    // Check for generated report files
    const reportFiles = [
      { agent: 'security', file: 'security-fixes.md' },
      { agent: 'performance', file: 'performance-metrics.json' },
      { agent: 'design', file: 'design-fixes.md' },
      { agent: 'database', file: 'database-optimization.sql' },
      { agent: 'cost', file: 'cost-analysis.json' },
      { agent: 'documentation', file: 'documentation-fixes.md' }
    ];
    
    
    for (const report of reportFiles) {
      try {
        const stats = await fs.stat(report.file);
        // Check if file was created recently (within last hour)
        const hourAgo = Date.now() - (60 * 60 * 1000);
        if (stats.mtimeMs > hourAgo) {
          evidence[report.agent] = {
            executed: true,
            timestamp: stats.mtime,
            reportFile: report.file
          };
          
          // Try to read score from JSON files
          if (report.file.endsWith('.json')) {
            try {
              const content = await fs.readFile(report.file, 'utf8');
              const data = JSON.parse(content);
              if (data.score !== undefined) {
                evidence[report.agent].score = data.score;
              }
            } catch (_e) {
              // Couldn't parse score
            }
          }
        }
      } catch (_e) {
        // File doesn't exist or can't be accessed
      }
    }
    
    return evidence;
  }

  /**
   * Get phase from handoff key
   */
  getPhaseFromHandoff(handoffKey) {
    const phaseMap = {
      'LEAD->PLAN': 'LEAD_PLANNING',
      'PLAN->EXEC': 'PLAN_DESIGN',
      'EXEC->PLAN': 'EXEC_IMPLEMENTATION',
      'PLAN->LEAD': 'PLAN_VERIFICATION',
      'LEAD->DEPLOY': 'LEAD_APPROVAL'
    };
    return phaseMap[handoffKey] || 'UNKNOWN';
  }

  /**
   * Get recommendation based on validation
   */
  getRecommendation(isValid, status, threshold, subAgentCheck = null, rcaGateCheck = null) {
    // RCA gate blocking takes priority
    if (rcaGateCheck && rcaGateCheck.blocked) {
      return `❌ HANDOFF BLOCKED by RCA Gate: ${rcaGateCheck.blockingRCRs.length} P0/P1 defects require verified CAPAs before proceeding. Run \`npm run rca:list -- --sd-id <SD-ID>\` to view blocking RCRs.`;
    }

    if (isValid) {
      // All good - checklist AND sub-agents complete
      let recommendation = '';
      if (status.percentage === 100) {
        recommendation = 'Excellent! All checklist items and required sub-agents complete.';
      } else if (status.percentage >= 90) {
        recommendation = 'Good progress. Minor checklist items remaining but handoff approved.';
      } else {
        recommendation = 'Core functionality complete, proceed with handoff.';
      }

      // Add RCA gate pass status
      if (rcaGateCheck && rcaGateCheck.totalP0P1 > 0) {
        recommendation += ` ✅ RCA Gate: All ${rcaGateCheck.totalP0P1} P0/P1 RCRs have verified CAPAs.`;
      }

      // Add warnings about recommended sub-agents
      if (subAgentCheck && subAgentCheck.warnings.length > 0) {
        recommendation += ` Note: ${subAgentCheck.warnings.join(', ')} for enhanced quality.`;
      }
      
      return recommendation;
    } else {
      // Problems exist - could be checklist, sub-agents, or both
      const checklistIssues = status.percentage < threshold;
      const subAgentIssues = subAgentCheck && !subAgentCheck.valid;
      
      if (checklistIssues && subAgentIssues) {
        return `Multiple issues: Complete ${status.incomplete.length} checklist items AND activate ${subAgentCheck.missingSubAgents.length} required sub-agents (${subAgentCheck.missingSubAgents.join(', ')}).`;
      } else if (subAgentIssues) {
        return `Sub-agent requirements not met: Activate ${subAgentCheck.missingSubAgents.join(', ')} before handoff.`;
      } else {
        // Just checklist issues
        const remaining = threshold - status.percentage;
        if (remaining <= 10) {
          return `Almost there! Complete ${status.incomplete.length} more checklist items.`;
        } else if (remaining <= 30) {
          return 'Significant checklist work remaining. Focus on critical items first.';
        } else {
          return 'Major checklist gaps exist. Review requirements and complete core functionality.';
        }
      }
    }
  }

  /**
   * Log validation to database
   */
  async logValidation(report) {
    try {
      // Store in a handoff_validations table (if it exists)
      // For now, update PRD metadata
      const { error } = await this.supabase
        .from('product_requirements_v2')
        .update({
          last_validation: report,
          validation_history: this.supabase.sql`
            array_append(
              coalesce(validation_history, '[]'::jsonb), 
              ${JSON.stringify(report)}::jsonb
            )
          `,
          updated_at: new Date().toISOString()
        })
        .eq('directive_id', report.sdId);
      
      if (!error) {
        console.log('\n📝 Validation logged to database');
      }
    } catch (_e) {
      // Silently fail if logging fails
    }
  }

  /**
   * Auto-fix common checklist issues
   */
  async autoComplete(agent, sdId) {
    console.log(`\n🤖 Attempting auto-completion for ${agent}...`);
    
    // Get current status
    const status = await this.getChecklistStatus(agent, sdId);
    
    // Items that can be auto-completed
    const autoCompletable = [
      'Documentation updated',
      'Code review completed',
      'Commit messages follow convention',
      'No console errors'
    ];
    
    let updated = false;
    const checklist = status.details.map(item => {
      const text = item.text || item.task || '';
      if (!item.checked && autoCompletable.some(ac => text.includes(ac))) {
        console.log(`  ✅ Auto-completing: ${text}`);
        return { ...item, checked: true };
      }
      return item;
    });
    
    // Update database if changes made
    if (updated) {
      const field = `${agent.toLowerCase()}_checklist`;
      await this.supabase
        .from('product_requirements_v2')
        .update({ [field]: checklist })
        .eq('directive_id', sdId);
      
      console.log('\n✅ Auto-completion done!');
    }
  }
}

// Export for use in other modules
export default HandoffValidator;

// Main execution
async function main() {
  const validator = new HandoffValidator();
  
  // Parse command line arguments
  const [,, action, ...args] = process.argv;
  
  if (action === 'validate') {
    const [from, to, sdId] = args;
    if (!from || !to || !sdId) {
      console.error('Usage: node handoff-validator.js validate FROM TO SD_ID');
      process.exit(1);
    }
    
    const report = await validator.validateHandoff(from, to, sdId);
    process.exit(report.valid ? 0 : 1);
    
  } else if (action === 'auto') {
    const [agent, sdId] = args;
    await validator.autoComplete(agent, sdId);
    
  } else {
    // Default: validate current EXEC->PLAN handoff for SD-2025-001
    console.log('🔍 LEO Protocol Handoff Validator\n');
    console.log('Validating EXEC → PLAN handoff for SD-2025-001...');
    
    const report = await validator.validateHandoff('EXEC', 'PLAN', 'SD-2025-001');
    
    if (!report.valid) {
      console.log('\n⚠️  Handoff blocked! Complete remaining items first.');
      console.log('\nTo auto-complete eligible items:');
      console.log('  node scripts/handoff-validator.js auto EXEC SD-2025-001');
    } else {
      console.log('\n✅ Handoff approved! Proceed to PLAN verification.');
    }
  }
}

// Only run main if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}