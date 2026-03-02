#!/usr/bin/env node

/**
 * LEO Product Requirements Document (PRD) Validator
 * Validates PRDs follow LEO Protocol standards and are properly linked to SDs
 * For use by LEAD and PLAN agents when creating/reviewing PRDs
 *
 * This is a thin wrapper that delegates to modular components in:
 * scripts/modules/prd-validator/
 */

import fs from 'fs';
import PRDValidator from './modules/prd-validator/index.js';

// CLI interface
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: leo-prd-validator <file.md> [options]

Options:
  --fix          Attempt to auto-fix common issues
  --strict       Use strict validation (fail on warnings)
  --template     Generate a PRD template file

Examples:
  node scripts/leo-prd-validator.js docs/product-requirements/PRD-001.md
  node scripts/leo-prd-validator.js PRD-001.md --fix
  node scripts/leo-prd-validator.js --template docs/templates/PRD-template.md

PRD Validation Checks:
  - All required sections present
  - Proper user story format
  - Requirements have IDs
  - Links to Strategic Directive
  - Vision QA for UI work
  - Testability score
  - Completeness score
`);
    process.exit(0);
  }

  // Generate template mode
  if (args[0] === '--template') {
    const outputPath = args[1] || 'PRD-template.md';
    PRDValidator.generateTemplate(outputPath);
    process.exit(0);
  }

  const validator = new PRDValidator();
  const filePath = args[0];
  const shouldAutoFix = args.includes('--fix');
  const strict = args.includes('--strict');

  if (shouldAutoFix) {
    validator.autoFix(filePath);
    console.log('\n' + '-'.repeat(50));
    console.log('Validating fixed document...\n');
  }

  const valid = validator.validateFile(filePath);

  if (!valid || (strict && validator.validate(fs.readFileSync(filePath, 'utf8')).warnings.length > 0)) {
    process.exit(1);
  }
}

export default PRDValidator;
