#!/usr/bin/env node
/**
 * EXEC Commit Message Gate
 * Strunkian Writing Rules Enforcement for Commit Messages
 *
 * Usage:
 *   node scripts/exec-commit-gate.js <commit-msg-file>    # Git commit-msg hook
 *   node scripts/exec-commit-gate.js --message "<msg>"    # Direct validation
 *   node scripts/exec-commit-gate.js --pr-range <base>    # CI: validate PR commits
 *   node scripts/exec-commit-gate.js --help               # Show help
 *
 * Exit Codes:
 *   0 = Success (no violations)
 *   1 = Blacklist violations found
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Strunkian rules configuration
const RULES_PATH = path.join(__dirname, '..', '.strunkian-rules.json');
let RULES;

try {
  RULES = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
} catch (error) {
  console.error('❌ Failed to load .strunkian-rules.json:', error.message);
  process.exit(1);
}

// CLI arguments
const args = process.argv.slice(2);
const helpMode = args.includes('--help') || args.includes('-h');
const directMessage = args.includes('--message');
const prMode = args.includes('--pr-range');

if (helpMode) {
  console.log(`
EXEC Commit Message Gate (Strunkian Writing Rules)

Usage:
  node scripts/exec-commit-gate.js <commit-msg-file>    Git commit-msg hook
  node scripts/exec-commit-gate.js --message "<msg>"    Direct validation
  node scripts/exec-commit-gate.js --pr-range <base>    CI: validate PR commits
  node scripts/exec-commit-gate.js --help               Show this help

Exit Codes:
  0 = Success (no violations)
  1 = Blacklist violations found

Configuration:
  Rules defined in: .strunkian-rules.json
`);
  process.exit(0);
}

/**
 * Check commit message for blacklisted words
 * @param {string} message - Commit message
 * @returns {Array} Array of violations
 */
function checkBlacklist(message) {
  const violations = [];
  const lines = message.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const word of RULES.blacklist.words) {
      // Word boundary aware matching
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const suggestions = RULES.blacklist.suggestions[word.toLowerCase()];
        violations.push({
          line: lineNum,
          column: match.index + 1,
          word: match[0],
          suggestion: suggestions ? suggestions.join(', ') : 'remove or replace'
        });
      }
    }
  }

  return violations;
}

/**
 * Validate a single commit message
 * @param {string} message - Commit message
 * @param {string} [commitHash] - Optional commit hash for context
 * @returns {Object} Validation result
 */
function validateMessage(message, commitHash = null) {
  const violations = checkBlacklist(message);

  return {
    commitHash,
    message: message.split('\n')[0], // First line only for display
    violations
  };
}

/**
 * Get commit messages from PR range
 * @param {string} base - Base ref (e.g., origin/main)
 * @returns {Array} Array of {hash, message} objects
 */
function getCommitsInRange(base) {
  try {
    const log = execSync(`git log --format="%H|||%B<<<COMMIT>>>" ${base}..HEAD`, { encoding: 'utf-8' });
    const commits = log.split('<<<COMMIT>>>').filter(c => c.trim());

    return commits.map(c => {
      const [hash, ...messageParts] = c.split('|||');
      return {
        hash: hash.trim(),
        message: messageParts.join('|||').trim()
      };
    });
  } catch (error) {
    console.error('❌ Failed to get commits:', error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  let messagesToCheck = [];

  if (directMessage) {
    // Direct message validation
    const msgIndex = args.indexOf('--message') + 1;
    const message = args[msgIndex];

    if (!message) {
      console.error('❌ No message provided after --message');
      process.exit(1);
    }

    messagesToCheck = [{ hash: null, message }];
    console.log('Validating commit message...\n');

  } else if (prMode) {
    // PR range validation (CI mode)
    const baseIndex = args.indexOf('--pr-range') + 1;
    const base = args[baseIndex] || 'origin/main';

    console.log(`Validating commits from ${base} to HEAD...\n`);
    messagesToCheck = getCommitsInRange(base);

    if (messagesToCheck.length === 0) {
      console.log('✅ No commits to check');
      process.exit(0);
    }

  } else if (args[0] && fs.existsSync(args[0])) {
    // Git commit-msg hook mode
    const commitMsgFile = args[0];
    const message = fs.readFileSync(commitMsgFile, 'utf-8');
    messagesToCheck = [{ hash: null, message }];

  } else {
    console.error('❌ No commit message file or --message provided');
    console.log('Usage: node scripts/exec-commit-gate.js <commit-msg-file>');
    console.log('       node scripts/exec-commit-gate.js --message "your message"');
    process.exit(1);
  }

  // Validate all messages
  const results = messagesToCheck.map(({ hash, message }) =>
    validateMessage(message, hash)
  );

  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);

  // Output results
  if (totalViolations > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  EXEC Commit Gate - VIOLATIONS FOUND');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const result of results) {
      if (result.violations.length === 0) continue;

      const hashDisplay = result.commitHash
        ? `Commit ${result.commitHash.substring(0, 7)}`
        : 'Commit message';

      console.log(`📝 ${hashDisplay}: "${result.message}"`);

      for (const v of result.violations) {
        console.log(`   🚫 Line ${v.line}, Col ${v.column}: Blacklisted word "${v.word}"`);
        console.log(`      → Use instead: ${v.suggestion}`);
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`❌ BLOCKED: ${totalViolations} blacklisted word(s) found`);
    console.log('');
    console.log('Please reword your commit message(s) to avoid:');
    RULES.blacklist.words.forEach(w => console.log(`  - ${w}`));
    console.log('');
    console.log('For squash/rebase instructions, see:');
    console.log('  git rebase -i origin/main');
    console.log('═══════════════════════════════════════════════════════════════');

    process.exit(1);

  } else {
    console.log('✅ PASSED: No blacklisted words in commit message(s)');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
