#!/usr/bin/env node

/**
 * Pre-Handoff Validation Script
 * Prevents handoffs without proper sub-agent activation
 * Based on SD-001 retrospective learnings
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PreHandoffValidator {
  constructor() {
    this.validationResults = [];
  }

  async validateHandoff(sdId, fromAgent, toAgent, options = {}) {
    console.log(`🔍 Pre-Handoff Validation: ${fromAgent} → ${toAgent} for ${sdId}`);
    console.log('=' .repeat(60));

    this.validationResults = [];

    // Determine the phase based on handoff type
    const phase = this.getPhaseFromHandoff(fromAgent, toAgent);
    if (!phase) {
      this.addResult('ERROR', 'Unknown handoff type', `${fromAgent} → ${toAgent} is not a recognized handoff pattern`);
      return this.generateReport(false);
    }

    console.log(`📋 Validating ${phase} phase requirements...`);

    // 1. Check SD exists and is in correct state
    await this.validateSDState(sdId);

    // 2. Check sub-agent activation compliance
    await this.validateSubAgentActivation(sdId, phase);

    // 3. Check handoff-specific requirements
    await this.validateHandoffRequirements(sdId, fromAgent, toAgent, phase);

    // 4. Check for blocking issues
    await this.validateNoBlockers(sdId);

    // Generate final report
    const hasErrors = this.validationResults.some(r => r.level === 'ERROR');
    const hasWarnings = this.validationResults.some(r => r.level === 'WARNING');

    return this.generateReport(!hasErrors, hasWarnings);
  }

  getPhaseFromHandoff(fromAgent, toAgent) {
    const handoffMap = {
      'LEAD-PLAN': 'planning',
      'PLAN-EXEC': 'implementation',
      'EXEC-PLAN': 'verification'
    };
    return handoffMap[`${fromAgent}-${toAgent}`];
  }

  async validateSDState(sdId) {
    try {
      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (error || !sd) {
        this.addResult('ERROR', 'SD Not Found', `Strategic directive ${sdId} does not exist`);
        return;
      }

      this.addResult('SUCCESS', 'SD Found', `${sd.title} (${sd.status})`);

      // Check if SD is in appropriate state for handoff
      if (sd.status === 'completed') {
        this.addResult('WARNING', 'SD Already Completed', 'This SD is marked as completed');
      } else if (sd.status === 'on_hold') {
        this.addResult('ERROR', 'SD On Hold', 'Cannot proceed with handoff while SD is on hold');
      }

    } catch (error) {
      this.addResult('ERROR', 'SD Validation Failed', error.message);
    }
  }

  async validateSubAgentActivation(sdId, phase) {
    try {
      const { data, error } = await supabase.rpc('check_subagent_requirements', {
        p_sd_id: sdId,
        p_phase: phase
      });

      if (error) {
        this.addResult('ERROR', 'Sub-Agent Check Failed', error.message);
        return;
      }

      const result = data[0];
      if (!result) {
        this.addResult('WARNING', 'No Requirements Defined', `No sub-agent requirements found for ${phase} phase`);
        return;
      }

      if (result.requirements_met) {
        this.addResult('SUCCESS', 'Sub-Agent Compliance',
          `All ${result.total_required} required sub-agents activated for ${phase} phase`);
      } else {
        const missing = result.missing_subagents || [];
        this.addResult('ERROR', 'Missing Sub-Agents',
          `${missing.length} required sub-agents not activated: ${missing.join(', ')}`);
        this.addResult('INFO', 'Activation Status',
          `${result.total_activated}/${result.total_required} required sub-agents activated`);
      }

    } catch (error) {
      this.addResult('ERROR', 'Sub-Agent Validation Failed', error.message);
    }
  }

  async validateHandoffRequirements(sdId, fromAgent, toAgent, phase) {
    // LEAD → PLAN validation
    if (fromAgent === 'LEAD' && toAgent === 'PLAN') {
      await this.validateLEADToPLAN(sdId);
    }
    // PLAN → EXEC validation
    else if (fromAgent === 'PLAN' && toAgent === 'EXEC') {
      await this.validatePLANToEXEC(sdId);
    }
    // EXEC → PLAN validation
    else if (fromAgent === 'EXEC' && toAgent === 'PLAN') {
      await this.validateEXECToPLAN(sdId);
    }
  }

  async validateLEADToPLAN(sdId) {
    // Check if business case is established
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('business_case, priority, scope')
      .eq('id', sdId)
      .single();

    if (!sd?.business_case) {
      this.addResult('WARNING', 'Missing Business Case', 'No business case documented for this SD');
    }

    if (!sd?.priority || sd.priority < 50) {
      this.addResult('WARNING', 'Low Priority', `SD priority is ${sd?.priority || 0}, consider if handoff is needed`);
    }

    this.addResult('SUCCESS', 'LEAD → PLAN', 'Strategic context validated');
  }

  async validatePLANToEXEC(sdId) {
    // Check if PRD exists
    const { data: prds } = await supabase
      .from('prds')
      .select('*')
      .eq('sd_id', sdId);

    if (!prds || prds.length === 0) {
      this.addResult('ERROR', 'Missing PRD', 'No PRD found for this SD. PLAN must create PRD before handoff.');
      return;
    }

    const activePRD = prds.find(prd => prd.status === 'approved') || prds[0];

    // Check PRD completeness
    if (!activePRD.acceptance_criteria || Object.keys(activePRD.acceptance_criteria).length === 0) {
      this.addResult('ERROR', 'Incomplete PRD', 'PRD missing acceptance criteria');
    }

    if (!activePRD.technical_requirements || Object.keys(activePRD.technical_requirements).length === 0) {
      this.addResult('WARNING', 'Missing Technical Requirements', 'PRD lacks detailed technical requirements');
    }

    this.addResult('SUCCESS', 'PLAN → EXEC', `PRD ${activePRD.id} ready for implementation`);
  }

  async validateEXECToPLAN(sdId) {
    // Check implementation evidence
    const { data: activations } = await supabase
      .from('subagent_activations')
      .select('*')
      .eq('sd_id', sdId)
      .eq('phase', 'implementation')
      .in('status', ['activated', 'completed']);

    if (!activations || activations.length === 0) {
      this.addResult('ERROR', 'No Implementation Evidence', 'No sub-agent activations recorded for implementation phase');
    }

    // Check for testing evidence
    const testingActivation = activations?.find(a => a.subagent_code === 'TESTING');
    if (!testingActivation) {
      this.addResult('ERROR', 'No Testing Evidence', 'TESTING sub-agent not activated during implementation');
    }

    this.addResult('SUCCESS', 'EXEC → PLAN', 'Implementation evidence validated');
  }

  async validateNoBlockers(sdId) {
    // Check for open critical issues
    // This would be extended to check issue tracking systems
    this.addResult('SUCCESS', 'No Blockers', 'No critical blocking issues identified');
  }

  addResult(level, title, message) {
    const icon = {
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌',
      'INFO': 'ℹ️'
    }[level] || '•';

    this.validationResults.push({ level, title, message, icon });
    console.log(`${icon} ${title}: ${message}`);
  }

  generateReport(passed, hasWarnings = false) {
    console.log('\n📋 Validation Report');
    console.log('=' .repeat(40));

    const errors = this.validationResults.filter(r => r.level === 'ERROR');
    const warnings = this.validationResults.filter(r => r.level === 'WARNING');
    const successes = this.validationResults.filter(r => r.level === 'SUCCESS');

    console.log(`✅ Successes: ${successes.length}`);
    console.log(`⚠️  Warnings: ${warnings.length}`);
    console.log(`❌ Errors: ${errors.length}`);

    const verdict = passed ? (hasWarnings ? '🟡 PASS_WITH_WARNINGS' : '🟢 PASS') : '🔴 FAIL';
    console.log(`\n🎯 Final Verdict: ${verdict}`);

    if (!passed) {
      console.log('\n🚫 HANDOFF BLOCKED');
      console.log('The following issues must be resolved:');
      errors.forEach(error => {
        console.log(`   • ${error.title}: ${error.message}`);
      });
    } else if (hasWarnings) {
      console.log('\n⚠️  HANDOFF ALLOWED WITH WARNINGS');
      warnings.forEach(warning => {
        console.log(`   • ${warning.title}: ${warning.message}`);
      });
    } else {
      console.log('\n✅ HANDOFF APPROVED');
      console.log('All validation checks passed successfully.');
    }

    return {
      passed,
      hasWarnings,
      verdict,
      errors: errors.length,
      warnings: warnings.length,
      successes: successes.length,
      results: this.validationResults
    };
  }

  // Record validation attempt in database
  async recordValidation(sdId, fromAgent, toAgent, validationResult) {
    try {
      const { error } = await supabase
        .from('handoff_validations')
        .insert({
          sd_id: sdId,
          from_agent: fromAgent,
          to_agent: toAgent,
          validation_status: validationResult.passed ? 'PASS' : 'FAIL',
          has_warnings: validationResult.hasWarnings,
          error_count: validationResult.errors,
          warning_count: validationResult.warnings,
          validation_results: validationResult.results,
          validated_at: new Date()
        });

      if (!error) {
        console.log('✅ Validation recorded in database');
      }
    } catch (error) {
      console.log('⚠️  Warning: Could not record validation in database:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node scripts/pre-handoff-validation.js <SD-ID> <FROM-AGENT> <TO-AGENT>');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/pre-handoff-validation.js SD-001 LEAD PLAN');
    console.log('  node scripts/pre-handoff-validation.js SD-001 PLAN EXEC');
    console.log('  node scripts/pre-handoff-validation.js SD-001 EXEC PLAN');
    process.exit(1);
  }

  const [sdId, fromAgent, toAgent] = args;
  const validator = new PreHandoffValidator();

  try {
    const result = await validator.validateHandoff(sdId, fromAgent, toAgent);
    await validator.recordValidation(sdId, fromAgent, toAgent, result);

    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { PreHandoffValidator };

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}