#!/usr/bin/env node

/**
 * LEO Protocol v4.0 Boundary Check System
 * Validates EXEC Agent stays within PRD scope
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

class BoundaryChecker {
  constructor() {
    this.prdPath = this.findPRD();
    this.prdContent = this.prdPath ? fs.readFileSync(this.prdPath, 'utf8') : '';
  }

  findPRD() {
    const prdDirs = ['docs/prds', 'prds'];
    for (const dir of prdDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.startsWith('PRD-') && f.endsWith('.md'));
        if (files.length > 0) {
          return path.join(dir, files[files.length - 1]); // Latest PRD
        }
      }
    }
    return null;
  }

  checkFeature(feature) {
    console.log('\n🔍 LEO Protocol v4.0 - Boundary Check');
    console.log('=' .repeat(50));
    console.log(`📝 Feature: ${feature}`);
    
    if (!this.prdContent) {
      console.log('⚠️  No PRD found - Cannot validate boundaries');
      return { approved: false, reason: 'No PRD available' };
    }

    // Step 1: Is this in the PRD?
    const inPRD = this.isInPRD(feature);
    console.log(`\n1️⃣  Is this in the PRD? ${inPRD ? '✅ YES' : '❌ NO'}`);

    // Step 2: Is this in scope?
    const inScope = inPRD || this.isReasonableExtension(feature);
    console.log(`2️⃣  Is this in scope? ${inScope ? '✅ YES' : '❌ NO'}`);

    // Step 3: Is creative addition valuable?
    const creativeBenefit = this.assessCreativeValue(feature);
    console.log(`3️⃣  Is creative addition valuable? ${creativeBenefit ? '✅ YES' : '❌ NO'}`);

    // Decision logic
    if (inPRD) {
      console.log('\n✅ APPROVED - Feature explicitly in PRD');
      return { approved: true, reason: 'In PRD scope' };
    }

    if (!inScope && !creativeBenefit) {
      console.log('\n❌ REJECTED - Out of scope and no creative value');
      console.log('🚧 LEO Protocol v4.0: EXEC must stay within PRD boundaries');
      return { approved: false, reason: 'Boundary violation' };
    }

    if (creativeBenefit && !inScope) {
      console.log('\n⚠️  NEEDS APPROVAL - Creative addition requires human approval');
      console.log('📋 Please get approval before implementing this feature');
      return { approved: false, reason: 'Requires human approval', needsApproval: true };
    }

    console.log('\n✅ APPROVED - Within reasonable scope');
    return { approved: true, reason: 'Reasonable extension' };
  }

  isInPRD(feature) {
    const keywords = feature.toLowerCase().split(/\s+/);
    const prdLower = this.prdContent.toLowerCase();
    
    // Check if at least 60% of keywords appear in PRD
    const matches = keywords.filter(keyword => 
      prdLower.includes(keyword) && keyword.length > 2
    );
    
    return matches.length / keywords.length >= 0.6;
  }

  isReasonableExtension(feature) {
    // Common reasonable extensions that don't require approval
    const reasonablePatterns = [
      /error handling/i,
      /accessibility/i,
      /responsive/i,
      /performance/i,
      /security/i,
      /validation/i,
      /logging/i
    ];

    return reasonablePatterns.some(pattern => pattern.test(feature));
  }

  assessCreativeValue(feature) {
    // Simple heuristic for creative value
    const creativeIndicators = [
      /enhance/i,
      /improve/i,
      /optimize/i,
      /better/i,
      /additional/i,
      /extra/i
    ];

    return creativeIndicators.some(pattern => pattern.test(feature));
  }

  showPRDSummary() {
    if (!this.prdContent) {
      console.log('❌ No PRD found');
      return;
    }

    console.log('\n📋 Current PRD Summary:');
    console.log('=' .repeat(30));
    
    // Extract key sections
    const sections = ['executive summary', 'technical requirements', 'acceptance criteria'];
    
    sections.forEach(section => {
      const regex = new RegExp(`#{1,3}\\s*${section}[^#]*`, 'gi');
      const match = this.prdContent.match(regex);
      if (match) {
        const content = match[0].substring(0, 200) + '...';
        console.log(`\n${section.toUpperCase()}:\n${content}`);
      }
    });
  }
}

// CLI Interface
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
🚧 LEO Protocol v4.0 Boundary Checker

Usage:
  node boundary-check.js check "feature description"  # Check if feature is in scope
  node boundary-check.js prd                          # Show PRD summary
  node boundary-check.js validate                     # Interactive validation

Examples:
  node boundary-check.js check "add mobile responsive design"
  node boundary-check.js check "add user authentication system"
  `);
  process.exit(1);
}

const checker = new BoundaryChecker();

switch (command) {
  case 'check':
    const feature = args.slice(1).join(' ');
    if (!feature) {
      console.error('❌ Please provide a feature description');
      process.exit(1);
    }
    const result = checker.checkFeature(feature);
    process.exit(result.approved ? 0 : 1);
    break;
    
  case 'prd':
    checker.showPRDSummary();
    break;
    
  case 'validate':
    console.log('\n🔍 Interactive Boundary Validation');
    console.log('Type features to validate (empty line to exit):\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const validateNext = () => {
      rl.question('Feature: ', (feature) => {
        if (!feature.trim()) {
          rl.close();
          return;
        }
        checker.checkFeature(feature);
        validateNext();
      });
    };
    
    validateNext();
    break;
    
  default:
    console.error(`❌ Unknown command: ${command}`);
    process.exit(1);
}