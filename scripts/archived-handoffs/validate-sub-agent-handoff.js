#!/usr/bin/env node

/**
 * LEO Protocol v4.1.1 - Sub-Agent Handoff Validation System
 * Validates handoff communications comply with LEO Protocol standards
 * Ensures all 7 mandatory elements are present and properly formatted
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

class HandoffValidator {
  constructor() {
    // LEO Protocol v4.1.1 mandatory handoff elements
    this.mandatoryElements = [
      {
        name: 'Executive Summary',
        pattern: /## 1\. EXECUTIVE SUMMARY/i,
        tokenLimit: 200,
        required: true
      },
      {
        name: 'Scope & Requirements', 
        pattern: /## 2\. SCOPE & REQUIREMENTS/i,
        required: true
      },
      {
        name: 'Context Package',
        pattern: /## 3\. CONTEXT PACKAGE/i,
        required: true
      },
      {
        name: 'Deliverables Manifest',
        pattern: /## 4\. DELIVERABLES MANIFEST/i,
        required: true
      },
      {
        name: 'Success Criteria & Validation',
        pattern: /## 5\. SUCCESS CRITERIA & VALIDATION/i,
        required: true
      },
      {
        name: 'Resource Allocation',
        pattern: /## 6\. RESOURCE ALLOCATION/i,
        required: true
      },
      {
        name: 'Handoff Requirements',
        pattern: /## 7\. HANDOFF REQUIREMENTS/i,
        required: true
      }
    ];
    
    this.validationRules = {
      hasFromToHeaders: /\*\*From\*\*:.*\*\*To\*\*:/s,
      hasDateHeader: /\*\*Date\*\*:/,
      hasPRDReference: /\*\*PRD Reference\*\*:/,
      hasActivationTrigger: /\*\*Activation Trigger\*\*:/,
      hasHandoffStatus: /HANDOFF STATUS/i,
      hasChecklistItems: /- \[ \]/,
      hasDeliverablesPaths: /\*\*.*\*\*: `.*`/
    };
  }

  /**
   * Validate a single handoff file
   */
  async validateHandoff(handoffPath) {
    console.log(`🔍 Validating handoff: ${handoffPath}`);
    
    try {
      const content = await fs.readFile(handoffPath, 'utf8');
      const validation = this.performValidation(content, handoffPath);
      
      return validation;
      
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to read handoff file: ${error.message}`],
        warnings: [],
        score: 0
      };
    }
  }

  /**
   * Perform comprehensive validation of handoff content
   */
  performValidation(content, filePath) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      score: 0,
      details: {
        elementCheck: {},
        formatCheck: {},
        contentCheck: {}
      }
    };

    // Check mandatory elements
    this.validateMandatoryElements(content, validation);
    
    // Check format compliance
    this.validateFormat(content, validation);
    
    // Check content quality
    this.validateContent(content, validation);
    
    // Calculate overall score
    validation.score = this.calculateScore(validation);
    
    // Determine if valid
    validation.valid = validation.errors.length === 0;
    
    return validation;
  }

  /**
   * Validate all 7 mandatory elements are present
   */
  validateMandatoryElements(content, validation) {
    console.log('   📋 Checking mandatory elements...');
    
    for (const element of this.mandatoryElements) {
      const found = element.pattern.test(content);
      validation.details.elementCheck[element.name] = found;
      
      if (!found && element.required) {
        validation.errors.push(`Missing mandatory element: ${element.name}`);
      }
      
      // Check token limits for Executive Summary
      if (element.name === 'Executive Summary' && found) {
        const summarySection = this.extractSection(content, element.pattern);
        if (summarySection && element.tokenLimit) {
          const tokenCount = this.estimateTokens(summarySection);
          if (tokenCount > element.tokenLimit) {
            validation.warnings.push(
              `Executive Summary exceeds ${element.tokenLimit} token limit (estimated: ${tokenCount})`
            );
          }
        }
      }
    }
  }

  /**
   * Validate format compliance
   */
  validateFormat(content, validation) {
    console.log('   📝 Checking format compliance...');
    
    for (const [ruleName, pattern] of Object.entries(this.validationRules)) {
      const passed = pattern.test(content);
      validation.details.formatCheck[ruleName] = passed;
      
      if (!passed) {
        switch (ruleName) {
          case 'hasFromToHeaders':
            validation.errors.push('Missing From/To headers in proper format');
            break;
          case 'hasDateHeader':
            validation.errors.push('Missing Date header');
            break;
          case 'hasPRDReference':
            validation.errors.push('Missing PRD Reference');
            break;
          case 'hasActivationTrigger':
            validation.errors.push('Missing Activation Trigger');
            break;
          case 'hasHandoffStatus':
            validation.errors.push('Missing HANDOFF STATUS declaration');
            break;
          case 'hasChecklistItems':
            validation.warnings.push('No checklist items found - ensure actionable items are present');
            break;
          case 'hasDeliverablesPaths':
            validation.warnings.push('Deliverable paths may not be properly formatted');
            break;
        }
      }
    }
  }

  /**
   * Validate content quality
   */
  validateContent(content, validation) {
    console.log('   🎯 Checking content quality...');
    
    // Check for placeholder content
    const placeholders = [
      '[ISO Date]', '[PRD-ID]', '[Specific trigger phrase]', 
      '[Critical/High/Medium/Low]', '[X hours]', '[X tokens]'
    ];
    
    for (const placeholder of placeholders) {
      if (content.includes(placeholder)) {
        validation.errors.push(`Placeholder not replaced: ${placeholder}`);
      }
    }
    
    // Check for sub-agent specific content
    const subAgentTypes = ['testing', 'security', 'performance', 'design', 'database'];
    let hasSubAgentContent = false;
    
    for (const type of subAgentTypes) {
      if (content.toLowerCase().includes(type)) {
        hasSubAgentContent = true;
        validation.details.contentCheck.subAgentType = type;
        break;
      }
    }
    
    if (!hasSubAgentContent) {
      validation.warnings.push('No clear sub-agent type identified in content');
    }
    
    // Check for specific activation triggers
    const commonTriggers = [
      'coverage', 'e2e', 'authentication', 'encryption', 'responsive', 
      'WCAG', 'performance', 'optimization', 'schema', 'migration'
    ];
    
    let hasTriggerContent = false;
    for (const trigger of commonTriggers) {
      if (content.toLowerCase().includes(trigger)) {
        hasTriggerContent = true;
        break;
      }
    }
    
    if (!hasTriggerContent) {
      validation.warnings.push('No clear activation triggers identified');
    }
    
    // Check deadline/timeline presence
    if (!content.includes('deadline') && !content.includes('within') && !content.includes('Complete')) {
      validation.warnings.push('No clear timeline or deadline specified');
    }
  }

  /**
   * Extract section content by pattern
   */
  extractSection(content, pattern) {
    const lines = content.split('\n');
    let inSection = false;
    let section = '';
    
    for (const line of lines) {
      if (pattern.test(line)) {
        inSection = true;
        continue;
      }
      
      if (inSection) {
        if (line.startsWith('## ')) {
          break; // Next section started
        }
        section += line + '\n';
      }
    }
    
    return section.trim();
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate validation score
   */
  calculateScore(validation) {
    const totalElements = this.mandatoryElements.length;
    const presentElements = Object.values(validation.details.elementCheck).filter(Boolean).length;
    
    const totalFormatRules = Object.keys(this.validationRules).length;
    const passedFormatRules = Object.values(validation.details.formatCheck).filter(Boolean).length;
    
    const elementScore = (presentElements / totalElements) * 70;
    const formatScore = (passedFormatRules / totalFormatRules) * 30;
    
    // Deduct points for errors
    const errorPenalty = validation.errors.length * 5;
    const warningPenalty = validation.warnings.length * 2;
    
    return Math.max(0, Math.round(elementScore + formatScore - errorPenalty - warningPenalty));
  }

  /**
   * Validate all handoff files in a directory
   */
  async validateAllHandoffs(directory = 'handoffs/sub-agents') {
    console.log(`🔍 Validating all handoffs in: ${directory}`);
    
    try {
      const files = await fs.readdir(directory);
      const handoffFiles = files.filter(file => file.endsWith('-handoff.md'));
      
      const results = [];
      
      for (const file of handoffFiles) {
        const filePath = path.join(directory, file);
        const validation = await this.validateHandoff(filePath);
        
        results.push({
          file: filePath,
          ...validation
        });
      }
      
      return this.generateSummaryReport(results);
      
    } catch (error) {
      console.error(`❌ Failed to validate handoffs: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Generate summary report for multiple validations
   */
  generateSummaryReport(results) {
    const summary = {
      totalFiles: results.length,
      validFiles: results.filter(r => r.valid).length,
      invalidFiles: results.filter(r => !r.valid).length,
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      results: results
    };
    
    return summary;
  }

  /**
   * Output validation results
   */
  outputResults(results, options = {}) {
    if (Array.isArray(results.results)) {
      // Multiple file validation
      console.log('\n📊 Handoff Validation Summary:');
      console.log('='.repeat(50));
      console.log(`📄 Total Files: ${results.totalFiles}`);
      console.log(`✅ Valid Files: ${results.validFiles}`);
      console.log(`❌ Invalid Files: ${results.invalidFiles}`);
      console.log(`📈 Average Score: ${results.averageScore.toFixed(1)}/100`);
      
      if (results.invalidFiles > 0) {
        console.log('\n❌ Files with Issues:');
        for (const result of results.results.filter(r => !r.valid)) {
          console.log(`   📄 ${result.file} (Score: ${result.score}/100)`);
          for (const error of result.errors) {
            console.log(`      🔴 ${error}`);
          }
        }
      }
      
      if (options.showWarnings) {
        const filesWithWarnings = results.results.filter(r => r.warnings.length > 0);
        if (filesWithWarnings.length > 0) {
          console.log('\n⚠️ Files with Warnings:');
          for (const result of filesWithWarnings) {
            console.log(`   📄 ${result.file}`);
            for (const warning of result.warnings) {
              console.log(`      🟡 ${warning}`);
            }
          }
        }
      }
      
    } else {
      // Single file validation
      console.log('\n📊 Handoff Validation Result:');
      console.log('='.repeat(50));
      console.log(`📄 File: ${results.file || 'Unknown'}`);
      console.log(`✅ Valid: ${results.valid ? 'Yes' : 'No'}`);
      console.log(`📈 Score: ${results.score}/100`);
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        for (const error of results.errors) {
          console.log(`   🔴 ${error}`);
        }
      }
      
      if (results.warnings.length > 0) {
        console.log('\n⚠️ Warnings:');
        for (const warning of results.warnings) {
          console.log(`   🟡 ${warning}`);
        }
      }
    }
  }

  /**
   * Command line interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    
    if (args[0] === '--help' || args.length === 0) {
      console.log('LEO Protocol v4.1.1 - Sub-Agent Handoff Validator');
      console.log('');
      console.log('Validates handoff communications comply with LEO Protocol standards.');
      console.log('Ensures all 7 mandatory elements are present and properly formatted.');
      console.log('');
      console.log('Usage:');
      console.log('  node scripts/validate-sub-agent-handoff.js <file>      # Validate single file');
      console.log('  node scripts/validate-sub-agent-handoff.js --all       # Validate all handoffs');
      console.log('  node scripts/validate-sub-agent-handoff.js --help      # Show help');
      console.log('');
      console.log('Options:');
      console.log('  --warnings     Show warnings in output');
      console.log('  --save-report  Save detailed JSON report');
      process.exit(0);
    }
    
    const validator = new HandoffValidator();
    const options = {
      showWarnings: args.includes('--warnings'),
      saveReport: args.includes('--save-report')
    };
    
    try {
      let results;
      
      if (args[0] === '--all') {
        results = await validator.validateAllHandoffs();
      } else {
        const filePath = args[0];
        results = await validator.validateHandoff(filePath);
        results.file = filePath;
      }
      
      validator.outputResults(results, options);
      
      if (options.saveReport) {
        const reportFile = 'reports/handoff-validation-report.json';
        await fs.mkdir('reports', { recursive: true });
        await fs.writeFile(reportFile, JSON.stringify(results, null, 2));
        console.log(`\n💾 Detailed report saved: ${reportFile}`);
      }
      
      // Exit with appropriate code
      const hasErrors = Array.isArray(results.results) 
        ? results.invalidFiles > 0 
        : !results.valid;
        
      process.exit(hasErrors ? 1 : 0);
      
    } catch (error) {
      console.error('💥 Validation failed:', error.message);
      process.exit(1);
    }
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  HandoffValidator.runCLI();
}

export default HandoffValidator;