#!/usr/bin/env node

/**
 * Fix Category 2 Accessibility Issues: Keyboard Navigation
 *
 * Targets:
 * - KEYBOARD_TRAP (WCAG 2.1.1): Add tabindex and keyboard handlers to clickable divs
 * - Viewport meta tag verification
 *
 * Pattern:
 * - Find: <div ... onClick={...}>
 * - Add: tabIndex="0" role="button" onKeyDown={handleKeyDown}
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Component files to check
const COMPONENT_DIR = path.join(ROOT_DIR, 'src/client/src/components');

// Keyboard event handler template
const KEYBOARD_HANDLER = `
  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback(event);
    }
  };
`;

async function findClickableDivs(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: <div ... onClick={...} without tabIndex
    if (line.includes('<div') && line.includes('onClick=') && !line.includes('tabIndex')) {
      // Check if it's not a button element
      if (!line.includes('<button')) {
        issues.push({
          line: i + 1,
          content: line.trim(),
          type: 'MISSING_TABINDEX'
        });
      }
    }

    // Pattern 2: <div ... onClick={...} with tabIndex but no keyboard handler
    if (line.includes('<div') && line.includes('onClick=') && line.includes('tabIndex') && !line.includes('onKeyDown')) {
      issues.push({
        line: i + 1,
        content: line.trim(),
        type: 'MISSING_KEYBOARD_HANDLER'
      });
    }
  }

  return issues;
}

async function fixFile(filePath, issues) {
  if (issues.length === 0) return { fixed: 0, file: filePath };

  let content = await fs.readFile(filePath, 'utf8');
  let fixCount = 0;

  // Add keyboard handler if not present
  if (!content.includes('handleKeyDown')) {
    // Find the component function declaration
    const funcMatch = content.match(/^(function|const|export\s+(default\s+)?function)\s+(\w+)/m);
    if (funcMatch) {
      const funcStart = content.indexOf(funcMatch[0]);
      const firstBrace = content.indexOf('{', funcStart);

      // Insert handleKeyDown after first opening brace
      content = content.slice(0, firstBrace + 1) + '\n' + KEYBOARD_HANDLER + content.slice(firstBrace + 1);
      fixCount++;
    }
  }

  // Fix each clickable div
  for (const issue of issues) {
    if (issue.type === 'MISSING_TABINDEX') {
      // Add tabIndex="0", role="button", and onKeyDown
      const originalLine = issue.content;

      // Find the onClick handler
      const onClickMatch = originalLine.match(/onClick=\{([^}]+)\}/);
      if (onClickMatch) {
        const handler = onClickMatch[1];

        // Build the fixed line
        let fixedLine = originalLine;

        // Add tabIndex if missing
        if (!fixedLine.includes('tabIndex')) {
          fixedLine = fixedLine.replace('<div', '<div tabIndex="0"');
        }

        // Add role if missing
        if (!fixedLine.includes('role=')) {
          fixedLine = fixedLine.replace('<div', '<div role="button"');
        }

        // Add onKeyDown if missing
        if (!fixedLine.includes('onKeyDown')) {
          fixedLine = fixedLine.replace(
            /onClick=\{([^}]+)\}/,
            `onClick={$1} onKeyDown={(e) => handleKeyDown(e, $1)}`
          );
        }

        content = content.replace(originalLine, fixedLine);
        fixCount++;
      }
    }
  }

  // Write the fixed content
  await fs.writeFile(filePath, content, 'utf8');

  return { fixed: fixCount, file: path.basename(filePath) };
}

async function scanDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subResults = await scanDirectory(fullPath);
      results.push(...subResults);
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
      const issues = await findClickableDivs(fullPath);
      if (issues.length > 0) {
        results.push({
          file: fullPath,
          issues: issues
        });
      }
    }
  }

  return results;
}

async function checkViewportMetaTag() {
  const indexPath = path.join(ROOT_DIR, 'src/client/index.html');
  const content = await fs.readFile(indexPath, 'utf8');

  const hasViewport = content.includes('<meta name="viewport"');
  return {
    present: hasViewport,
    path: indexPath
  };
}

async function main() {
  console.log('🔍 Scanning for Category 2 Accessibility Issues (Keyboard Navigation)...\n');

  // Check viewport meta tag
  console.log('1️⃣ Checking viewport meta tag...');
  const viewport = await checkViewportMetaTag();
  if (viewport.present) {
    console.log('   ✅ Viewport meta tag is present\n');
  } else {
    console.log('   ❌ Viewport meta tag is MISSING\n');
  }

  // Scan components
  console.log('2️⃣ Scanning component files...');
  const results = await scanDirectory(COMPONENT_DIR);

  console.log(`   Found ${results.length} files with keyboard accessibility issues\n`);

  // Fix each file
  let totalFixed = 0;
  console.log('3️⃣ Fixing issues...\n');

  for (const result of results) {
    const fixResult = await fixFile(result.file, result.issues);
    totalFixed += fixResult.fixed;
    console.log(`   ✅ Fixed ${fixResult.fixed} issues in ${fixResult.file}`);
  }

  console.log(`\n✨ Summary:`);
  console.log(`   - Files analyzed: ${results.length}`);
  console.log(`   - Issues fixed: ${totalFixed}`);
  console.log(`   - Viewport meta tag: ${viewport.present ? 'OK' : 'MISSING'}`);
  console.log('\n✅ Category 2 fixes complete!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
