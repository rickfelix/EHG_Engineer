#!/usr/bin/env node
/**
 * Validate Implementation Target
 * Ensures developers are in the correct application directory before implementing features
 */

import chalk from 'chalk';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ImplementationValidator {
  constructor() {
    this.currentDir = process.cwd();
    this.ehgEngineerPath = '/mnt/c/_EHG/EHG_Engineer';
    this.ehgAppPath = '/mnt/c/_EHG/ehg';
  }

  checkCurrentLocation() {
    const normalizedPath = this.currentDir.replace(/\\/g, '/');

    const location = {
      isInEhgEngineer: normalizedPath.includes('EHG_Engineer'),
      isInEhgApp: normalizedPath.includes('/ehg') && !normalizedPath.includes('EHG_Engineer'),
      currentPath: normalizedPath
    };

    return location;
  }

  checkGitRemote() {
    try {
      const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      return {
        remote,
        isEhgEngineer: remote.includes('EHG_Engineer'),
        isEhgApp: remote.includes('/ehg.git') && !remote.includes('EHG_Engineer')
      };
    } catch (error) {
      return { remote: null, isEhgEngineer: false, isEhgApp: false };
    }
  }

  checkForPRD() {
    // Check if there's a PRD context (could be enhanced to check for actual PRD ID)
    const hasPrdContext = process.env.CURRENT_PRD || process.argv.includes('--prd');
    return hasPrdContext;
  }

  validateForImplementation() {
    console.log(chalk.blue.bold('\n🔍 Implementation Target Validator\n'));
    console.log(chalk.gray('─'.repeat(60)));

    const location = this.checkCurrentLocation();
    const git = this.checkGitRemote();

    console.log(chalk.cyan('📍 Current Location:'));
    console.log(`   Path: ${chalk.white(location.currentPath)}`);

    if (git.remote) {
      console.log(`   Git Remote: ${chalk.white(git.remote)}`);
    }

    console.log(chalk.gray('─'.repeat(60)));

    // Determine the context
    if (location.isInEhgEngineer) {
      console.log(chalk.yellow.bold('\n⚠️  WARNING: You are in EHG_Engineer!\n'));
      console.log(chalk.yellow('This is the management dashboard for:'));
      console.log(chalk.yellow('  • Strategic Directives'));
      console.log(chalk.yellow('  • PRDs'));
      console.log(chalk.yellow('  • Progress Tracking'));
      console.log(chalk.red.bold('\n❌ DO NOT implement customer features here!\n'));

      console.log(chalk.green.bold('✅ For feature implementation, navigate to:'));
      console.log(chalk.green(`   cd ${this.ehgAppPath}\n`));

      console.log(chalk.cyan('📝 Appropriate activities in EHG_Engineer:'));
      console.log('  • View/create Strategic Directives');
      console.log('  • Generate PRDs');
      console.log('  • Update dashboard components');
      console.log('  • Modify LEO Protocol tools\n');

      return false;
    }

    if (location.isInEhgApp) {
      console.log(chalk.green.bold('\n✅ CORRECT: You are in the EHG Application!\n'));
      console.log(chalk.green('This is where you should:'));
      console.log(chalk.green('  • Implement features from PRDs'));
      console.log(chalk.green('  • Fix bugs in the customer app'));
      console.log(chalk.green('  • Add UI components'));
      console.log(chalk.green('  • Update business logic\n'));

      console.log(chalk.cyan('📋 Pre-implementation checklist:'));
      console.log('  ✓ PRD reviewed and understood');
      console.log('  ✓ Target component identified');
      console.log('  ✓ Local dev server running (npm run dev)');
      console.log('  ✓ Database connection verified\n');

      return true;
    }

    // Neither location
    console.log(chalk.red.bold('\n❓ UNKNOWN LOCATION\n'));
    console.log(chalk.red('You are not in either expected application directory.'));
    console.log(chalk.cyan('\nNavigate to one of:'));
    console.log(`  • EHG App (for features): ${chalk.white(this.ehgAppPath)}`);
    console.log(`  • EHG_Engineer (for dashboard): ${chalk.white(this.ehgEngineerPath)}\n`);

    return false;
  }

  showQuickReference() {
    console.log(chalk.blue.bold('\n📚 Quick Reference:\n'));

    const table = [
      ['Task', 'Location', 'Path'],
      ['─────────────────────────', '──────────', '─────────────────────'],
      ['Implement new feature', 'EHG App', '/mnt/c/_EHG/ehg'],
      ['Fix customer bug', 'EHG App', '/mnt/c/_EHG/ehg'],
      ['Update UI components', 'EHG App', '/mnt/c/_EHG/ehg'],
      ['Create Strategic Directive', 'EHG_Engineer', '/mnt/c/_EHG/EHG_Engineer'],
      ['Generate PRD', 'EHG_Engineer', '/mnt/c/_EHG/EHG_Engineer'],
      ['Update dashboard', 'EHG_Engineer', '/mnt/c/_EHG/EHG_Engineer'],
    ];

    table.forEach(row => {
      if (row[0].includes('─')) {
        console.log(chalk.gray(row[0] + ' ' + row[1] + ' ' + row[2]));
      } else if (row[0] === 'Task') {
        console.log(chalk.cyan(row[0].padEnd(30) + row[1].padEnd(15) + row[2]));
      } else {
        console.log(row[0].padEnd(30) + row[1].padEnd(15) + chalk.white(row[2]));
      }
    });

    console.log();
  }
}

// Main execution
function main() {
  const validator = new ImplementationValidator();

  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  const quickCheck = args.includes('--check') || args.includes('-c');

  if (showHelp) {
    console.log(chalk.cyan('Usage: node validate-implementation-target.js [options]'));
    console.log(chalk.cyan('\nOptions:'));
    console.log('  --check, -c    Quick validation check');
    console.log('  --help, -h     Show this help message');
    console.log('\nThis script helps ensure you are in the correct application');
    console.log('directory before implementing features.\n');
    validator.showQuickReference();
    return;
  }

  const isValid = validator.validateForImplementation();

  if (!quickCheck) {
    validator.showQuickReference();
  }

  // Exit with appropriate code
  process.exit(isValid ? 0 : 1);
}

// Export for testing
export { ImplementationValidator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}