#!/usr/bin/env node
/**
 * DOCMON CLI - Documentation Monitor
 * Strunkian Writing Rules Enforcement for Documentation
 *
 * Usage:
 *   node scripts/docmon.js                    # Validate changed docs (PR/pre-push mode)
 *   node scripts/docmon.js --all              # Validate all docs (full scan)
 *   node scripts/docmon.js --file <path>      # Validate specific file
 *   node scripts/docmon.js --help             # Show help
 *
 * Exit Codes:
 *   0 = Success (no violations)
 *   1 = Blacklist violations found
 *   2 = Passive voice violations found
 *   3 = Verbosity violations found
 */

import fs from 'fs';
import path from 'path';
// SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001: execFileSync, NOT execSync and NOT spawnSync.
// execFileSync takes an argv ARRAY and never involves a shell, which is the whole fix. It is also
// the only drop-in for the contract this file relies on: like execSync it returns stdout as a
// string and THROWS on a non-zero exit. Three separate catches here depend on that throw — the
// merge-base fallbacks to 'HEAD~1', the getChangedFiles fallback to a full scan, and
// getBeforeWordCount's `return 0 // New file`. spawnSync returns {stdout,stderr,status} and does
// NOT throw, so swapping it in would silently stop ALL THREE from ever firing.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { minimatch } from 'minimatch';

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
const allMode = args.includes('--all');
const fileMode = args.includes('--file');
const jsonMode = args.includes('--json');
const specificFile = fileMode ? args[args.indexOf('--file') + 1] : null;

if (helpMode) {
  console.log(`
DOCMON CLI - Documentation Monitor (Strunkian Writing Rules)

Usage:
  node scripts/docmon.js                    Validate changed docs (PR/pre-push mode)
  node scripts/docmon.js --all              Validate all docs (full scan)
  node scripts/docmon.js --file <path>      Validate specific file
  node scripts/docmon.js --json             Output results as JSON
  node scripts/docmon.js --help             Show this help

Exit Codes:
  0 = Success (no violations)
  1 = Blacklist violations found
  2 = Passive voice violations found
  3 = Verbosity violations found

Configuration:
  Rules defined in: .strunkian-rules.json
`);
  process.exit(0);
}

/**
 * Get files changed in current diff
 * @returns {string[]} Array of changed file paths
 */
// SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001.
//
// ONE RUNNER, NOT A FIX PER CALL SITE. Every git invocation in this file goes through here, so no
// future call can reintroduce a shell by forgetting an argument. That is the stated principle at
// lib/gates/operator-contract/harness-adapter.js:81-84, carried across rather than re-derived.
//
// --literal-pathspecs IS LOAD-BEARING HERE, unlike in the sibling lint. getChangedLines passes the
// filename as a PATHSPEC after `--`, and `--` ends OPTION parsing WITHOUT disabling PATHSPEC MAGIC:
// git still reads `:(glob)` and `:(literal)` as SYNTAX in an argument after `--`. MEASURED: with
// argv-ization alone, a :(glob)-prefixed filename makes git return an EMPTY diff and throw NOTHING,
// so the file becomes INVISIBLE to the Strunkian gate. Argv-safety alone would therefore have
// converted this RCE into SILENT EVASION — worse than the defect, because a gate that can be made
// to see nothing is worse than one that crashes. This is SEC-R1 from PR #6872 recurring verbatim.
//
// Applied in the RUNNER, so it also covers `git show` below, where it is INERT (a <rev>:<path>
// object name is a single argv token, not a pathspec). Kept uniform on purpose: excluding it there
// would need per-call-site logic, which is exactly the fragility the runner principle warns about.
const runGit = (args) => execFileSync('git', ['--literal-pathspecs', ...args], { encoding: 'utf-8' });

function getChangedFiles() {
  try {
    // Try to get merge base for PR context
    let mergeBase;
    try {
      mergeBase = runGit(['merge-base', 'origin/main', 'HEAD']).trim();
    } catch {
      // Fallback to HEAD~1 for local pre-push
      mergeBase = 'HEAD~1';
    }

    // -z is NUL-delimited AND suppresses git's path quoting. Beyond the shell fix it closes a
    // latent parsing bug: a filename containing a literal NEWLINE is legal in a git tree, and the
    // old split('\n') never recovered it — git C-QUOTES such a name to "we\nird.md", so the parser
    // produced ONE CONFIDENTLY WRONG path rather than obvious fragments. No .trim() per entry now:
    // with NUL delimiters the bytes BETWEEN separators ARE the path, and trimming would corrupt a
    // filename that legitimately begins or ends with a space.
    const diff = runGit(['diff', '--name-only', '-z', `${mergeBase}...HEAD`]);
    return diff.split('\0').filter(Boolean);
  } catch {
    console.warn('⚠️ Could not get git diff, scanning all files...');
    return getAllDocFiles();
  }
}

/**
 * Get all documentation files
 * @returns {string[]} Array of file paths
 */
function getAllDocFiles() {
  const files = [];
  const patterns = RULES.filePatterns.documentation.include;
  const excludePatterns = RULES.filePatterns.documentation.exclude;

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

      // Check excludes
      if (excludePatterns.some(p => minimatch(relativePath, p))) continue;

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        // Check includes
        if (patterns.some(p => minimatch(relativePath, p))) {
          files.push(relativePath);
        }
      }
    }
  }

  scanDir(process.cwd());
  return files;
}

/**
 * Filter files to only documentation files
 * @param {string[]} files - All files
 * @returns {string[]} Documentation files only
 */
function filterDocFiles(files) {
  const patterns = RULES.filePatterns.documentation.include;
  const excludePatterns = RULES.filePatterns.documentation.exclude;

  return files.filter(file => {
    const relativePath = file.replace(/\\/g, '/');

    // Check excludes first
    if (excludePatterns.some(p => minimatch(relativePath, p))) return false;

    // Check includes
    return patterns.some(p => minimatch(relativePath, p));
  });
}

/**
 * Get changed lines for a file (line numbers that were added/modified)
 * @param {string} filePath - Path to file
 * @returns {Set<number>} Set of changed line numbers (1-indexed)
 */
function getChangedLines(filePath) {
  try {
    let mergeBase;
    try {
      mergeBase = runGit(['merge-base', 'origin/main', 'HEAD']).trim();
    } catch {
      mergeBase = 'HEAD~1';
    }

    // SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001. This was a live RCE: the filename was interpolated
    // inside double quotes in a shell string. Double quotes do NOT save you — under POSIX sh they
    // suppress `;` and `&` while $(...) and backticks STILL EXPAND inside them, and an embedded `"`
    // ends the quoting and re-arms everything else. `filePath` comes from getChangedFiles above,
    // i.e. any name an attacker can commit, and this runs on ubuntu on every PR touching docs/ or
    // *.md — and unconditionally on every developer push via .husky/pre-push.
    //
    // The path is now its own argv element after `--`, so no SHELL parses it, and the runner's
    // --literal-pathspecs stops GIT from parsing it as pathspec syntax. Both are required: the
    // first closes execution, the second closes the silent-evasion hole the first opens.
    const diff = runGit(['diff', '-U0', `${mergeBase}...HEAD`, '--', filePath]);
    const changedLines = new Set();

    // Parse unified diff to get line numbers
    const hunkRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let match;

    while ((match = hunkRegex.exec(diff)) !== null) {
      const startLine = parseInt(match[1], 10);
      const lineCount = match[2] ? parseInt(match[2], 10) : 1;

      for (let i = 0; i < lineCount; i++) {
        changedLines.add(startLine + i);
      }
    }

    return changedLines;
  } catch {
    // If can't get diff, treat all lines as changed (new file)
    return null; // null means all lines
  }
}

/**
 * Remove code blocks from content for word counting
 * @param {string} content - Markdown content
 * @returns {string} Content without code
 */
function removeCodeBlocks(content) {
  // Remove fenced code blocks
  let result = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  result = result.replace(/`[^`]+`/g, '');
  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');
  return result;
}

/**
 * Count words in prose content
 * @param {string} content - Content to count
 * @returns {number} Word count
 */
function countWords(content) {
  const prose = removeCodeBlocks(content);
  const words = prose.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Check for blacklisted words
 * @param {string} content - Content to check
 * @param {number} lineOffset - Starting line number
 * @param {Set<number>|null} changedLines - Lines that were changed (null = all)
 * @returns {Array} Array of violations
 */
function checkBlacklist(content, lineOffset, changedLines) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = lineOffset + i;

    // Only check changed lines if we have that info
    if (changedLines !== null && !changedLines.has(lineNum)) continue;

    const line = lines[i];

    for (const word of RULES.blacklist.words) {
      // Word boundary aware matching
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const suggestions = RULES.blacklist.suggestions[word.toLowerCase()];
        violations.push({
          type: 'blacklist',
          line: lineNum,
          column: match.index + 1,
          word: match[0],
          message: `Blacklisted word "${match[0]}" found`,
          suggestion: suggestions ? `Use instead: ${suggestions.join(', ')}` : 'Remove or replace'
        });
      }
    }
  }

  return violations;
}

/**
 * Check for passive voice patterns
 * @param {string} content - Content to check
 * @param {number} lineOffset - Starting line number
 * @param {Set<number>|null} changedLines - Lines that were changed
 * @returns {Array} Array of violations
 */
function checkPassiveVoice(content, lineOffset, changedLines) {
  if (!RULES.passiveVoice.enabled) return [];

  const violations = [];
  const lines = content.split('\n');
  let ignoreNextParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = lineOffset + i;
    const line = lines[i];

    // Check for ignore directive
    if (line.includes(RULES.passiveVoice.allowlistDirective)) {
      ignoreNextParagraph = true;
      continue;
    }

    // Reset ignore on blank line (paragraph boundary)
    if (line.trim() === '') {
      ignoreNextParagraph = false;
      continue;
    }

    if (ignoreNextParagraph) continue;

    // Only check changed lines
    if (changedLines !== null && !changedLines.has(lineNum)) continue;

    // Skip code blocks and code lines
    if (line.trim().startsWith('```') || line.trim().startsWith('`')) continue;
    if (line.includes('`')) continue; // Skip lines with inline code

    // Check for passive voice pattern: be-verb + past participle
    for (const beVerb of RULES.passiveVoice.beVerbs) {
      // Pattern: be-verb followed by a word ending in -ed or -en
      const regex = new RegExp(`\\b(${beVerb})\\s+(\\w+(?:ed|en))\\b`, 'gi');
      let match;

      while ((match = regex.exec(line)) !== null) {
        // Check if there's an explicit agent (by the...) - that makes it acceptable
        const hasAgent = RULES.passiveVoice.agentPatterns.some(p =>
          line.toLowerCase().includes(p)
        );

        if (!hasAgent) {
          violations.push({
            type: 'passive',
            line: lineNum,
            column: match.index + 1,
            pattern: `"${match[1]} ${match[2]}"`,
            message: `Passive voice detected: "${match[1]} ${match[2]}"`,
            suggestion: 'Rewrite in active voice (subject performs the action)'
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Check for verbosity patterns
 * @param {string} content - Content to check
 * @param {number} lineOffset - Starting line number
 * @param {Set<number>|null} changedLines - Lines that were changed
 * @returns {Array} Array of violations
 */
function checkVerbosity(content, lineOffset, changedLines) {
  if (!RULES.verbosity.enabled) return [];

  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = lineOffset + i;
    const line = lines[i].toLowerCase();

    // Only check changed lines
    if (changedLines !== null && !changedLines.has(lineNum)) continue;

    // Skip code lines
    if (lines[i].trim().startsWith('```') || lines[i].trim().startsWith('`')) continue;

    // Count filler phrases in this line
    const foundPhrases = [];
    for (const phrase of RULES.verbosity.fillerPhrases) {
      if (line.includes(phrase.toLowerCase())) {
        foundPhrases.push(phrase);
      }
    }

    // Only flag if multiple filler phrases (per config)
    if (foundPhrases.length >= RULES.verbosity.minPhrasesToFlag) {
      const suggestions = foundPhrases.map(p => {
        const s = RULES.verbosity.suggestions[p.toLowerCase()];
        return s ? `"${p}" → ${s}` : `Remove "${p}"`;
      });

      violations.push({
        type: 'verbosity',
        line: lineNum,
        column: 1,
        phrases: foundPhrases,
        message: `Wordy: ${foundPhrases.length} filler phrases found`,
        suggestion: suggestions.join('; ')
      });
    }
  }

  return violations;
}

/**
 * Get before word count from merge base
 * @param {string} filePath - Path to file
 * @returns {number} Word count before changes
 */
function getBeforeWordCount(filePath) {
  try {
    let mergeBase;
    try {
      mergeBase = runGit(['merge-base', 'origin/main', 'HEAD']).trim();
    } catch {
      mergeBase = 'HEAD~1';
    }

    // SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001. The WORST sink in this file: no quoting at all, so
    // `;` `&` `|` were live under sh in addition to $(...) and backticks. It is also SILENT — the
    // catch below returns 0 and the file is simply treated as new — so an injected payload left no
    // trace in the output. The <rev>:<path> OBJECT-NAME form is a SINGLE argv token, so argv
    // conversion alone fully closes this one; the runner's --literal-pathspecs is inert here.
    const beforeContent = runGit(['show', `${mergeBase}:${filePath}`]);
    return countWords(beforeContent);
  } catch {
    return 0; // New file
  }
}

/**
 * Validate a single file
 * @param {string} filePath - Path to file
 * @param {boolean} checkAllLines - Whether to check all lines or just changed
 * @returns {Object} Validation result
 */
function validateFile(filePath, checkAllLines = false) {
  if (!fs.existsSync(filePath)) {
    return { filePath, error: 'File not found', violations: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const changedLines = checkAllLines ? null : getChangedLines(filePath);

  const blacklistViolations = checkBlacklist(content, 1, changedLines);
  const passiveViolations = checkPassiveVoice(content, 1, changedLines);
  const verbosityViolations = checkVerbosity(content, 1, changedLines);

  const afterWords = countWords(content);
  const beforeWords = checkAllLines ? afterWords : getBeforeWordCount(filePath);

  let percentChange = 'N/A';
  if (beforeWords > 0) {
    percentChange = Math.round(((beforeWords - afterWords) / beforeWords) * 100);
  }

  return {
    filePath,
    violations: [...blacklistViolations, ...passiveViolations, ...verbosityViolations],
    efficiencyScore: {
      beforeWords,
      afterWords,
      percentChange
    }
  };
}

/**
 * Main function
 */
async function main() {
  if (!jsonMode) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  DOCMON - Documentation Monitor (Strunkian Writing Rules)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  }

  let filesToCheck = [];

  if (specificFile) {
    filesToCheck = [specificFile];
    if (!jsonMode) console.log('Mode: Single file validation');
  } else if (allMode) {
    filesToCheck = getAllDocFiles();
    if (!jsonMode) console.log('Mode: Full scan (all documentation files)');
  } else {
    const changedFiles = getChangedFiles();
    filesToCheck = filterDocFiles(changedFiles);
    if (!jsonMode) console.log('Mode: Changed files only (PR/pre-push)');
  }

  if (!jsonMode) {
    console.log(`Files to scan: ${filesToCheck.length}`);
    console.log('');
  }

  if (filesToCheck.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify({ summary: { filesScanned: 0, totalViolations: 0 }, results: [] }, null, 2));
    } else {
      console.log('✅ No documentation files to check');
    }
    process.exit(0);
  }

  const results = [];
  let totalViolations = 0;
  let blacklistCount = 0;
  let passiveCount = 0;
  let verbosityCount = 0;

  for (const file of filesToCheck) {
    const result = validateFile(file, allMode || !!specificFile);
    results.push(result);

    for (const v of result.violations) {
      totalViolations++;
      if (v.type === 'blacklist') blacklistCount++;
      if (v.type === 'passive') passiveCount++;
      if (v.type === 'verbosity') verbosityCount++;
    }
  }

  // Output results
  if (jsonMode) {
    console.log(JSON.stringify({
      summary: {
        filesScanned: filesToCheck.length,
        totalViolations,
        blacklistViolations: blacklistCount,
        passiveViolations: passiveCount,
        verbosityViolations: verbosityCount
      },
      results
    }, null, 2));
  } else {
    // Human-readable output
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('  Efficiency Scores (Word Counts)');
    console.log('─────────────────────────────────────────────────────────────────');

    for (const result of results) {
      if (!result.efficiencyScore) continue;
      const { beforeWords, afterWords, percentChange } = result.efficiencyScore;
      const pct = typeof percentChange === 'number' ? `${percentChange}%` : percentChange;
      console.log(`  ${result.filePath}: ${beforeWords} words → ${afterWords} words (${pct} change)`);
    }

    console.log('');

    if (totalViolations > 0) {
      console.log('─────────────────────────────────────────────────────────────────');
      console.log('  Violations Found');
      console.log('─────────────────────────────────────────────────────────────────');

      for (const result of results) {
        if (result.violations.length === 0) continue;

        console.log(`\n  📄 ${result.filePath}`);

        for (const v of result.violations) {
          const icon = v.type === 'blacklist' ? '🚫' : v.type === 'passive' ? '📝' : '💬';
          console.log(`     ${icon} Line ${v.line}: ${v.message}`);
          console.log(`        → ${v.suggestion}`);
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Files scanned:      ${filesToCheck.length}`);
    console.log(`  Total violations:   ${totalViolations}`);
    console.log(`    Blacklist:        ${blacklistCount}`);
    console.log(`    Passive voice:    ${passiveCount}`);
    console.log(`    Verbosity:        ${verbosityCount}`);
    console.log('');
  }

  // Exit with appropriate code
  if (blacklistCount > 0) {
    if (!jsonMode) console.log('❌ FAILED: Blacklist violations found');
    process.exit(1);
  } else if (passiveCount > 0) {
    if (!jsonMode) console.log('⚠️  WARNINGS: Passive voice detected (not blocking)');
    process.exit(0); // Passive voice is warning only
  } else if (verbosityCount > 0) {
    if (!jsonMode) console.log('⚠️  WARNINGS: Verbosity detected (not blocking)');
    process.exit(0); // Verbosity is warning only
  } else {
    if (!jsonMode) console.log('✅ PASSED: No Strunkian violations found');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
