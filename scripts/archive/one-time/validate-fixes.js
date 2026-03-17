#!/usr/bin/env node

/**
 * LEO Protocol v4.1.3 - Fix Validation Orchestrator
 * Manages the validation loop after EXEC implements fixes
 * Ensures all fixes are properly validated before completion
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { spawn } from 'child_process';

class FixValidationOrchestrator {
  constructor() {
    this.fixRequestsDir = 'test-results/fix-requests';
    this.validationResultsDir = 'test-results/validation-results';
    this.maxRetries = 3;
  }
  
  /**
   * Main validation orchestration
   */
  async validateAllFixes(options = {}) {
    console.log('🔄 Starting fix validation process...');
    console.log('═'.repeat(60));
    
    try {
      // Load fix requests
      const fixRequests = await this.loadFixRequests();
      
      if (fixRequests.length === 0) {
        console.log('ℹ️  No fix requests found to validate');
        return { success: true, results: [] };
      }
      
      console.log(`📋 Found ${fixRequests.length} fixes to validate`);
      
      // Validate each fix
      const validationResults = [];
      let allPassed = true;
      
      for (let i = 0; i < fixRequests.length; i++) {
        const request = fixRequests[i];
        console.log(`\n[${i + 1}/${fixRequests.length}] Validating: ${request.target}`);
        console.log('-'.repeat(40));
        
        const result = await this.validateSingleFix(request, options);
        validationResults.push(result);
        
        if (!result.success) {
          allPassed = false;
          
          if (!options.continueOnFailure) {
            console.log('❌ Validation failed - stopping (use --continue to proceed)');
            break;
          }
        }
      }
      
      // Generate validation report
      const report = await this.generateValidationReport(validationResults, fixRequests);
      
      // Save results
      await this.saveValidationResults(validationResults, report);
      
      // Output summary
      this.outputSummary(validationResults, allPassed);
      
      return {
        success: allPassed,
        results: validationResults,
        report: report
      };
      
    } catch (error) {
      console.error('💥 Validation orchestration failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Load fix requests from directory
   */
  async loadFixRequests() {
    try {
      const jsonFile = path.join(this.fixRequestsDir, 'fix-requests.json');
      const content = await fs.readFile(jsonFile, 'utf8');
      return JSON.parse(content);
    } catch (_error) {
      console.warn('⚠️  Could not load fix-requests.json, scanning directory...');

      // Fallback: scan directory for individual fix request files
      const files = await fs.readdir(this.fixRequestsDir);
      const requests = [];
      
      for (const file of files) {
        if (file.startsWith('fix-request-') && file.endsWith('.md')) {
          // Parse basic info from markdown file
          const content = await fs.readFile(path.join(this.fixRequestsDir, file), 'utf8');
          const targetMatch = content.match(/## Fix Request: (.+)/);
          
          if (targetMatch) {
            requests.push({
              id: file.replace('fix-request-', '').replace('.md', ''),
              target: targetMatch[1],
              file: file
            });
          }
        }
      }
      
      return requests;
    }
  }
  
  /**
   * Validate a single fix
   */
  async validateSingleFix(request, options) {
    const result = {
      id: request.id,
      target: request.target,
      attempts: 0,
      success: false,
      error: null,
      refinements: [],
      timestamp: new Date().toISOString()
    };
    
    // Try validation with retries
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      result.attempts = attempt;
      console.log(`   Attempt ${attempt}/${this.maxRetries}...`);
      
      const validation = await this.runValidation(request.target);
      
      if (validation.success) {
        result.success = true;
        console.log('   ✅ Validation passed!');
        break;
      } else {
        console.log('   ❌ Validation failed');
        
        if (validation.refinedRecommendation) {
          result.refinements.push(validation.refinedRecommendation);
          console.log('   💡 Refined recommendation generated');
          
          if (attempt < this.maxRetries && options.autoApplyRefinements) {
            console.log('   🔧 Applying refinement and retrying...');
            await this.applyRefinement(validation.refinedRecommendation);
            await this.waitForUserConfirmation(options);
          }
        }
        
        result.error = validation.error || 'Validation failed';
      }
    }
    
    return result;
  }
  
  /**
   * Run validation command
   */
  async runValidation(targetName) {
    return new Promise((resolve) => {
      const command = 'node';
      const args = [
        'lib/testing/testing-sub-agent.js',
        '--validate-fix',
        targetName
      ];
      
      console.log(`   Running: ${command} ${args.join(' ')}`);
      
      const child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          // Try to parse refined recommendation from output
          let refinedRecommendation = null;
          try {
            const match = stdout.match(/Refined Fix Recommendation:\n(.+)/s);
            if (match) {
              refinedRecommendation = JSON.parse(match[1]);
            }
          } catch (_e) {
            // Ignore parsing errors
          }
          
          resolve({
            success: false,
            error: stderr || 'Validation failed',
            refinedRecommendation
          });
        }
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }
  
  /**
   * Apply refinement suggestion (placeholder for EXEC action)
   */
  async applyRefinement(refinement) {
    console.log('   📝 Refinement suggestion:');
    console.log(`      ${refinement.summary}`);
    console.log('   ⚠️  Manual application required by EXEC');
    
    // In a real system, this would trigger a handoff to EXEC
    // For now, we just log the suggestion
  }
  
  /**
   * Wait for user confirmation (if interactive)
   */
  async waitForUserConfirmation(options) {
    if (options.interactive) {
      console.log('   ⏸️  Press Enter after applying fix...');
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
    }
  }
  
  /**
   * Generate validation report
   */
  async generateValidationReport(results, _requests) {
    const report = [];
    const timestamp = new Date().toISOString();
    
    report.push('# Fix Validation Report');
    report.push(`**Generated**: ${timestamp}`);
    report.push('**Protocol**: LEO v4.1.3');
    report.push('');
    
    // Summary statistics
    const totalTests = results.length;
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const successRate = totalTests > 0 ? (passed / totalTests * 100).toFixed(1) : 0;
    
    report.push('## Summary');
    report.push(`- **Total Fixes Validated**: ${totalTests}`);
    report.push(`- **Passed**: ${passed} ✅`);
    report.push(`- **Failed**: ${failed} ❌`);
    report.push(`- **Success Rate**: ${successRate}%`);
    report.push('');
    
    // Detailed results
    report.push('## Detailed Results');
    report.push('| Component | Status | Attempts | Notes |');
    report.push('|-----------|--------|----------|-------|');
    
    results.forEach(result => {
      const status = result.success ? '✅ Passed' : '❌ Failed';
      const notes = result.error || (result.refinements.length > 0 ? 'Refinements suggested' : 'OK');
      report.push(`| ${result.target} | ${status} | ${result.attempts} | ${notes} |`);
    });
    report.push('');
    
    // Failed fixes requiring attention
    if (failed > 0) {
      report.push('## ⚠️ Fixes Requiring Attention');
      results.filter(r => !r.success).forEach(result => {
        report.push(`### ${result.target}`);
        report.push(`- **Attempts**: ${result.attempts}`);
        report.push(`- **Error**: ${result.error}`);
        
        if (result.refinements.length > 0) {
          report.push('- **Latest Refinement**:');
          const lastRefinement = result.refinements[result.refinements.length - 1];
          report.push(`  - ${lastRefinement.summary}`);
        }
        report.push('');
      });
    }
    
    // Next steps
    report.push('## Next Steps');
    if (passed === totalTests) {
      report.push('✅ All fixes validated successfully!');
      report.push('- Ready for PLAN verification phase');
      report.push('- No additional fixes required');
    } else {
      report.push('❌ Some fixes still failing:');
      report.push('1. Review failed validations above');
      report.push('2. Apply refined recommendations');
      report.push('3. Re-run validation: `node scripts/validate-fixes.js`');
    }
    report.push('');
    
    report.push('---');
    report.push('*LEO Protocol v4.1.3 - Enhanced Testing Sub-Agent*');
    
    return report.join('\n');
  }
  
  /**
   * Save validation results
   */
  async saveValidationResults(results, report) {
    // Ensure output directory exists
    await fs.mkdir(this.validationResultsDir, { recursive: true });
    
    // Save JSON results
    const jsonFile = path.join(this.validationResultsDir, 'validation-results.json');
    await fs.writeFile(jsonFile, JSON.stringify(results, null, 2));
    
    // Save markdown report
    const reportFile = path.join(this.validationResultsDir, 'validation-report.md');
    await fs.writeFile(reportFile, report);
    
    console.log(`\n📁 Results saved to: ${this.validationResultsDir}`);
  }
  
  /**
   * Output summary to console
   */
  outputSummary(results, allPassed) {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('═'.repeat(60));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (allPassed) {
      console.log('\n🎉 All fixes validated successfully!');
      console.log('Ready for PLAN verification phase.');
    } else {
      console.log('\n⚠️  Some fixes still need attention.');
      console.log('Review the validation report for details.');
      
      // List failed components
      const failedComponents = results.filter(r => !r.success).map(r => r.target);
      console.log('\nFailed components:');
      failedComponents.forEach(comp => console.log(`  - ${comp}`));
    }
    
    console.log('═'.repeat(60));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('LEO Protocol v4.1.3 - Fix Validation Orchestrator');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/validate-fixes.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --continue           Continue validation even if a test fails');
    console.log('  --interactive        Pause for manual fixes between attempts');
    console.log('  --auto-apply         Automatically apply refinement suggestions');
    console.log('  --help               Show this help message');
    console.log('');
    console.log('Output:');
    console.log('  - Validation results in test-results/validation-results/');
    console.log('  - Detailed report with pass/fail status');
    console.log('  - Refinement suggestions for failed validations');
    process.exit(0);
  }
  
  const options = {
    continueOnFailure: args.includes('--continue'),
    interactive: args.includes('--interactive'),
    autoApplyRefinements: args.includes('--auto-apply')
  };
  
  const orchestrator = new FixValidationOrchestrator();
  
  // Enable interactive mode if specified
  if (options.interactive) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  
  orchestrator.validateAllFixes(options)
    .then(result => {
      if (result.success) {
        console.log('\n✅ Validation process completed successfully!');
        process.exit(0);
      } else {
        console.log('\n❌ Validation process completed with failures');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    })
    .finally(() => {
      if (options.interactive) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
    });
}

export default FixValidationOrchestrator;