#!/usr/bin/env node

/**
 * LEO Strategic Directive Validator
 * Validates strategic directives follow LEO Protocol standards
 * For use by LEAD agents when creating/modifying strategic directives
 */

const fs = require('fs');
const path = require('path');

class SDValidator {
  constructor() {
    this.requiredSections = [
      { name: 'Strategic Directive', pattern: /^#.*Strategic Directive|^##.*Strategic Directive/m },
      { name: 'Objective', pattern: /^#{1,3}.*Objective|^\*\*Objective\*\*/m },
      { name: 'Scope', pattern: /^#{1,3}.*Scope|^\*\*Scope\*\*/m },
      { name: 'Requirements', pattern: /^#{1,3}.*Requirements|^\*\*Requirements\*\*/m },
      { name: 'Success Criteria', pattern: /^#{1,3}.*Success Criteria|^\*\*Success Criteria\*\*/m }
    ];
    
    this.recommendedSections = [
      { name: 'Vision QA Status', pattern: /Vision QA Status|Vision QA:/mi },
      { name: 'Timeline', pattern: /^#{1,3}.*Timeline|^\*\*Timeline\*\*/m },
      { name: 'Resources', pattern: /^#{1,3}.*Resources|^\*\*Resources\*\*/m },
      { name: 'Risks', pattern: /^#{1,3}.*Risk|^\*\*Risk/m },
      { name: 'Dependencies', pattern: /^#{1,3}.*Dependencies|^\*\*Dependencies\*\*/m }
    ];
    
    this.visionQAStatuses = [
      'MANDATORY',
      'REQUIRED', 
      'RECOMMENDED',
      'OPTIONAL',
      'NOT_APPLICABLE'
    ];
  }

  /**
   * Validate a strategic directive file
   */
  validateFile(filePath) {
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║     Strategic Directive Validator v1.0        ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
    
    console.log(`📄 File: ${filePath}\n`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const results = this.validate(content);
    
    // Display results
    this.displayResults(results);
    
    // Save validation report
    if (results.score < 100) {
      const reportPath = this.saveReport(filePath, results);
      console.log(`\n📋 Validation report saved: ${reportPath}`);
    }
    
    return results.valid;
  }

  /**
   * Validate strategic directive content
   */
  validate(content) {
    const results = {
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      suggestions: [],
      sections: {
        required: {},
        recommended: {}
      },
      metadata: {}
    };
    
    // Check required sections
    this.requiredSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.required[section.name] = found;
      
      if (!found) {
        results.errors.push(`Missing required section: ${section.name}`);
        results.valid = false;
        results.score -= 15;
      }
    });
    
    // Check recommended sections
    this.recommendedSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.recommended[section.name] = found;
      
      if (!found) {
        results.warnings.push(`Missing recommended section: ${section.name}`);
        results.score -= 5;
      }
    });
    
    // Extract and validate metadata
    this.validateMetadata(content, results);
    
    // Check Vision QA status
    this.validateVisionQA(content, results);
    
    // Check structure and formatting
    this.validateStructure(content, results);
    
    // Ensure score doesn't go below 0
    results.score = Math.max(0, results.score);
    
    return results;
  }

  /**
   * Validate metadata (SD ID, dates, etc.)
   */
  validateMetadata(content, results) {
    // Check for SD ID
    const sdIdMatch = content.match(/SD-\d{3,4}[A-Z]?/);
    if (sdIdMatch) {
      results.metadata.sdId = sdIdMatch[0];
    } else {
      results.warnings.push('No SD ID found (expected format: SD-XXX)');
      results.score -= 5;
    }
    
    // Check for dates
    const dateMatch = content.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      results.metadata.date = dateMatch[0];
    }
    
    // Check for author/role attribution
    if (content.includes('LEAD Agent') || content.includes('Strategic Lead')) {
      results.metadata.author = 'LEAD Agent';
    }
    
    // Check for related PRD
    const prdMatch = content.match(/PRD[-_][A-Z0-9-]+/i);
    if (prdMatch) {
      results.metadata.relatedPRD = prdMatch[0];
    } else {
      results.suggestions.push('Consider linking to a Product Requirements Document (PRD)');
    }
  }

  /**
   * Validate Vision QA configuration
   */
  validateVisionQA(content, results) {
    let visionQAFound = false;
    let validStatus = false;
    
    // Check for Vision QA status
    const vqMatch = content.match(/Vision QA Status[:\s]+([A-Z_]+)/i);
    if (vqMatch) {
      visionQAFound = true;
      const status = vqMatch[1].toUpperCase();
      
      if (this.visionQAStatuses.includes(status)) {
        validStatus = true;
        results.metadata.visionQAStatus = status;
      } else {
        results.errors.push(`Invalid Vision QA status: ${status}. Must be one of: ${this.visionQAStatuses.join(', ')}`);
        results.score -= 10;
      }
    }
    
    // Check if UI work is mentioned but Vision QA is missing
    const hasUIWork = /UI|interface|frontend|component|screen|page|form|button/i.test(content);
    if (hasUIWork && !visionQAFound) {
      results.warnings.push('UI work detected but no Vision QA status specified');
      results.suggestions.push('Add Vision QA Status: REQUIRED or MANDATORY for UI-related work');
      results.score -= 5;
    }
    
    // Validate Vision QA configuration if present
    if (visionQAFound && validStatus) {
      const configMatch = content.match(/```json\s*\n([^`]+vision[^`]+)\n```/);
      if (configMatch) {
        try {
          const config = JSON.parse(configMatch[1]);
          if (!config.appId) {
            results.warnings.push('Vision QA config missing appId');
          }
          if (!config.costLimit) {
            results.suggestions.push('Consider adding costLimit to Vision QA config');
          }
          results.metadata.visionQAConfig = config;
        } catch {
          results.warnings.push('Invalid Vision QA JSON configuration');
        }
      } else if (results.metadata.visionQAStatus !== 'NOT_APPLICABLE') {
        results.suggestions.push('Consider adding Vision QA configuration JSON');
      }
    }
  }

  /**
   * Validate document structure
   */
  validateStructure(content, results) {
    const lines = content.split('\n');
    
    // Check for proper markdown headers
    const headers = lines.filter(l => l.startsWith('#'));
    if (headers.length < 3) {
      results.warnings.push('Document lacks sufficient structure (< 3 headers)');
      results.score -= 5;
    }
    
    // Check for task breakdown
    const hasTasks = /Task \d+|EES-|Epic \d+|Phase \d+/i.test(content);
    if (!hasTasks) {
      results.suggestions.push('Consider breaking down work into numbered tasks or epics');
    }
    
    // Check for acceptance criteria
    const hasAcceptance = /acceptance criteria|definition of done|DoD/i.test(content);
    if (!hasAcceptance) {
      results.suggestions.push('Consider adding explicit acceptance criteria');
    }
    
    // Check line length (readability)
    const longLines = lines.filter(l => l.length > 120).length;
    if (longLines > 10) {
      results.suggestions.push(`${longLines} lines exceed 120 characters (impacts readability)`);
    }
    
    // Check for verification mentions
    if (!content.includes('verif')) {
      results.suggestions.push('Consider mentioning verification approach');
    }
  }

  /**
   * Display validation results
   */
  displayResults(results) {
    console.log('═══════════════════════════════════════════════');
    console.log(`VALIDATION SCORE: ${results.score}/100 ${this.getGrade(results.score)}`);
    console.log(`STATUS: ${results.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log('═══════════════════════════════════════════════\n');
    
    // Required sections
    console.log('📋 Required Sections:');
    Object.entries(results.sections.required).forEach(([section, found]) => {
      console.log(`   ${found ? '✅' : '❌'} ${section}`);
    });
    
    // Recommended sections
    console.log('\n📝 Recommended Sections:');
    Object.entries(results.sections.recommended).forEach(([section, found]) => {
      console.log(`   ${found ? '✅' : '⚠️'} ${section}`);
    });
    
    // Metadata
    if (Object.keys(results.metadata).length > 0) {
      console.log('\n🏷️ Metadata:');
      Object.entries(results.metadata).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          console.log(`   ${key}: ${value}`);
        }
      });
    }
    
    // Errors
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    // Warnings
    if (results.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      results.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }
    
    // Suggestions
    if (results.suggestions.length > 0) {
      console.log('\n💡 Suggestions:');
      results.suggestions.forEach(suggestion => {
        console.log(`   • ${suggestion}`);
      });
    }
  }

  /**
   * Get letter grade for score
   */
  getGrade(score) {
    if (score >= 95) return '🌟 A+';
    if (score >= 90) return '⭐ A';
    if (score >= 85) return '✨ B+';
    if (score >= 80) return '✓ B';
    if (score >= 75) return '⚡ C+';
    if (score >= 70) return '🔸 C';
    return '⚠️ D';
  }

  /**
   * Save validation report
   */
  saveReport(filePath, results) {
    const reportDir = path.join('docs', 'validation-reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath, '.md');
    const reportPath = path.join(reportDir, `${basename}-validation-${timestamp}.json`);
    
    const report = {
      file: filePath,
      timestamp: new Date().toISOString(),
      results
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  /**
   * Auto-fix common issues
   */
  autoFix(filePath) {
    console.log('\n🔧 Attempting auto-fix...\n');
    
    let content = fs.readFileSync(filePath, 'utf8');
    let fixed = false;
    
    // Add missing SD ID if not present
    if (!content.match(/SD-\d{3,4}/)) {
      const sdId = `SD-${String(Date.now()).slice(-3)}`;
      content = `# Strategic Directive: ${sdId}\n\n${content}`;
      console.log(`✓ Added SD ID: ${sdId}`);
      fixed = true;
    }
    
    // Add Vision QA status for UI work
    const hasUIWork = /UI|interface|frontend|component/i.test(content);
    const hasVisionQA = /Vision QA Status/i.test(content);
    
    if (hasUIWork && !hasVisionQA) {
      const vqSection = `\n## Vision QA Status\n\n**Status:** REQUIRED\n\n`;
      const scopeIndex = content.indexOf('## Scope');
      if (scopeIndex > -1) {
        content = content.slice(0, scopeIndex) + vqSection + content.slice(scopeIndex);
        console.log('✓ Added Vision QA Status section');
        fixed = true;
      }
    }
    
    if (fixed) {
      const backupPath = filePath.replace('.md', '.backup.md');
      fs.copyFileSync(filePath, backupPath);
      fs.writeFileSync(filePath, content);
      console.log(`\n✅ File fixed and saved`);
      console.log(`📄 Backup: ${backupPath}`);
      return true;
    } else {
      console.log('ℹ️ No auto-fixable issues found');
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
Usage: leo-sd-validator <file.md> [options]

Options:
  --fix     Attempt to auto-fix common issues
  --strict  Use strict validation (fail on warnings)

Examples:
  node scripts/leo-sd-validator.js docs/strategic-directives/SD-001.md
  node scripts/leo-sd-validator.js SD-001.md --fix
`);
    process.exit(1);
  }
  
  const validator = new SDValidator();
  const filePath = args[0];
  const autoFix = args.includes('--fix');
  const strict = args.includes('--strict');
  
  if (autoFix) {
    validator.autoFix(filePath);
  }
  
  const valid = validator.validateFile(filePath);
  
  if (!valid || (strict && validator.validate(fs.readFileSync(filePath, 'utf8')).warnings.length > 0)) {
    process.exit(1);
  }
}

module.exports = SDValidator;