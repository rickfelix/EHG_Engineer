#!/usr/bin/env node

/**
 * PLAN Supervisor Verification Script
 * 
 * Command-line interface for PLAN's supervisor verification capabilities.
 * Ensures all requirements are truly met before marking work as complete.
 * 
 * Usage:
 *   node plan-supervisor-verification.js --prd PRD-ID [options]
 *   node plan-supervisor-verification.js --sd SD-ID [options]
 * 
 * Options:
 *   --level [1|2|3]  Verification depth (1=summary, 2=issues, 3=full)
 *   --force          Override iteration limits
 *   --json           Output as JSON
 */

import PLANVerificationTool from '../lib/agents/plan-verification-tool.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  prd: null,
  sd: null,
  level: 1,
  force: false,
  json: false
};

// Process arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--prd':
      options.prd = args[++i];
      break;
    case '--sd':
      options.sd = args[++i];
      break;
    case '--level':
      options.level = parseInt(args[++i]) || 1;
      break;
    case '--force':
      options.force = true;
      break;
    case '--json':
      options.json = true;
      break;
    case '--help':
      showHelp();
      process.exit(0);
  }
}

function showHelp() {
  console.log(`
🔍 PLAN Supervisor Verification Tool

Usage:
  node plan-supervisor-verification.js --prd PRD-ID [options]
  node plan-supervisor-verification.js --sd SD-ID [options]

Options:
  --prd ID         PRD to verify
  --sd ID          Strategic Directive to verify
  --level [1|2|3]  Verification depth (default: 1)
                   1 = Summary (quick pass/fail)
                   2 = Issues focus (problems only)
                   3 = Full report (comprehensive)
  --force          Override iteration limits
  --json           Output as JSON
  --help           Show this help

Examples:
  node plan-supervisor-verification.js --prd PRD-2025-001
  node plan-supervisor-verification.js --sd SD-VOICE-001 --level 2
  node plan-supervisor-verification.js --prd PRD-2025-001 --level 3 --json
  `);
}

class PLANSupervisorCLI {
  constructor() {
    this.tool = new PLANVerificationTool();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.tool.on('session:created', (session) => {
      if (!options.json) {
        console.log(`✅ Verification session created: ${session.session_id}`);
      }
    });

    this.tool.on('verification:complete', (results) => {
      if (!options.json) {
        console.log(`\n✅ Verification complete!`);
      }
    });

    this.tool.on('verification:error', (error) => {
      if (!options.json) {
        console.error(`\n❌ Verification error: ${error.message}`);
      }
    });
  }

  async run() {
    try {
      // Validate inputs
      if (!options.prd && !options.sd) {
        console.error('❌ Error: Must specify either --prd or --sd');
        showHelp();
        process.exit(1);
      }

      // Get PRD ID (from PRD or SD)
      let prdId = options.prd;
      
      if (options.sd && !prdId) {
        // Lookup PRD from SD
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('metadata')
          .eq('id', options.sd)
          .single();
        
        prdId = sd?.metadata?.prd_id;
        
        if (!prdId) {
          throw new Error(`No PRD associated with SD: ${options.sd}`);
        }
      }

      // Check if we can proceed
      if (!options.force) {
        const { data: canStart } = await supabase
          .rpc('can_start_verification', { p_prd_id: prdId });
        
        if (!canStart) {
          console.error('❌ Cannot start verification:');
          console.error('   - Active verification in progress, OR');
          console.error('   - Maximum iteration limit (3) reached');
          console.error('\n💡 Use --force to override');
          process.exit(1);
        }
      }

      // Show header
      if (!options.json) {
        this.showHeader(prdId);
      }

      // Run verification
      const results = await this.tool.runSupervisorVerification(prdId, {
        sdId: options.sd,
        triggeredBy: 'cli',
        level: options.level
      });

      // Display results
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        this.displayResults(results);
      }

      // Exit with appropriate code
      process.exit(results.verdict === 'pass' ? 0 : 1);

    } catch (error) {
      console.error(`\n❌ Fatal error: ${error.message}`);
      
      if (options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      }
      
      process.exit(1);
    }
  }

  showHeader(prdId) {
    console.log(`
╔════════════════════════════════════════════╗
║     🔍 PLAN SUPERVISOR VERIFICATION        ║
╚════════════════════════════════════════════╝

📋 PRD: ${prdId}
📊 Level: ${options.level} (${this.getLevelName(options.level)})
🕐 Started: ${new Date().toLocaleString()}

Verifying with all sub-agents...
`);
  }

  getLevelName(level) {
    const names = {
      1: 'Summary',
      2: 'Issues Focus',
      3: 'Full Report'
    };
    return names[level] || 'Unknown';
  }

  displayResults(results) {
    console.log('\n' + '═'.repeat(50));
    console.log('VERIFICATION RESULTS');
    console.log('═'.repeat(50));

    // Overall status
    const statusEmoji = {
      pass: '✅',
      fail: '❌',
      conditional_pass: '⚠️',
      escalate: '🔄'
    };

    console.log(`\n📊 Overall Status: ${statusEmoji[results.verdict]} ${results.verdict.toUpperCase()}`);
    console.log(`🎯 Confidence: ${results.confidence_score}%`);
    
    // Requirements
    if (results.requirements_total > 0) {
      const metCount = results.requirements_met?.length || 0;
      const unmetCount = results.requirements_unmet?.length || 0;
      
      console.log(`\n📋 Requirements:`);
      console.log(`   ✅ Met: ${metCount}/${results.requirements_total}`);
      
      if (unmetCount > 0) {
        console.log(`   ❌ Unmet: ${unmetCount}`);
        results.requirements_unmet.forEach(req => {
          console.log(`      - ${req}`);
        });
      }
    }

    // Sub-agent results
    console.log(`\n🤖 Sub-Agent Reports:`);
    
    if (results.sub_agent_results) {
      const agents = Object.entries(results.sub_agent_results)
        .filter(([key]) => !key.startsWith('_')); // Skip internal fields
      
      agents.forEach(([agent, result]) => {
        const status = result.status || 'unknown';
        const confidence = result.confidence || 0;
        const statusIcon = this.getStatusIcon(status);
        
        console.log(`   ${statusIcon} ${agent}: ${status} (${confidence}% confidence)`);
        
        if (options.level >= 2 && result.findings) {
          const findings = typeof result.findings === 'string' 
            ? result.findings 
            : JSON.stringify(result.findings, null, 2);
          console.log(`      └─ ${findings}`);
        }
      });
    }

    // Critical issues
    if (results.critical_issues?.length > 0) {
      console.log(`\n🚨 Critical Issues:`);
      results.critical_issues.forEach(issue => {
        console.log(`   - [${issue.agent}] ${issue.issue}`);
      });
    }

    // Warnings
    if (results.warnings?.length > 0 && options.level >= 2) {
      console.log(`\n⚠️  Warnings:`);
      results.warnings.forEach(warning => {
        console.log(`   - [${warning.agent}] ${warning.warning}`);
      });
    }

    // Recommendations
    if (results.recommendations?.length > 0 && options.level >= 2) {
      console.log(`\n💡 Recommendations:`);
      results.recommendations.forEach(rec => {
        console.log(`   - [${rec.agent}] ${rec.recommendation}`);
      });
    }

    // Final verdict explanation
    console.log(`\n🎯 Final Verdict: ${results.verdict.toUpperCase()}`);
    console.log(`   └─ ${this.getVerdictExplanation(results)}`);

    // Next steps
    console.log(`\n📌 Next Steps:`);
    console.log(this.getNextSteps(results));

    // Footer
    console.log('\n' + '═'.repeat(50));
    console.log(`Session ID: ${results.session_id}`);
    console.log(`Duration: ${results.duration_ms}ms`);
    console.log(`Completed: ${new Date(results.completed_at).toLocaleString()}`);
  }

  getStatusIcon(status) {
    const icons = {
      passed: '✅',
      failed: '❌',
      warning: '⚠️',
      unknown: '❓',
      fallback: '🔄'
    };
    return icons[status] || '•';
  }

  getVerdictExplanation(results) {
    if (results.verdict === 'pass') {
      return 'All requirements met and sub-agents agree';
    } else if (results.verdict === 'fail') {
      if (results.critical_issues?.length > 0) {
        return 'Critical issues must be resolved';
      }
      return 'Requirements not met or critical failures detected';
    } else if (results.verdict === 'conditional_pass') {
      return 'Minor issues exist but not blocking';
    } else if (results.verdict === 'escalate') {
      return 'Cannot reach consensus - escalating to LEAD';
    }
    return 'Unknown verdict reason';
  }

  getNextSteps(results) {
    const steps = [];
    
    switch (results.verdict) {
      case 'pass':
        steps.push('   1. ✅ Work is "done done" - ready for LEAD approval');
        steps.push('   2. 📋 All deliverables verified and complete');
        steps.push('   3. 🚀 Can proceed to production deployment');
        break;
        
      case 'fail':
        steps.push('   1. ❌ Address critical issues identified above');
        steps.push('   2. 🔄 EXEC must fix failing requirements');
        steps.push('   3. 🔍 Re-run verification after fixes');
        break;
        
      case 'conditional_pass':
        steps.push('   1. ⚠️  Review warnings and consider fixes');
        steps.push('   2. 📝 Document known issues for future work');
        steps.push('   3. 🤔 LEAD to decide if acceptable');
        break;
        
      case 'escalate':
        steps.push('   1. 🔄 Escalating to LEAD for manual review');
        steps.push('   2. 📋 Provide detailed context for decision');
        steps.push('   3. ⏳ Await LEAD guidance on how to proceed');
        break;
    }
    
    return steps.join('\n');
  }
}

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new PLANSupervisorCLI();
  cli.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default PLANSupervisorCLI;