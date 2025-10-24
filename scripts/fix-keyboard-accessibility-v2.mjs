#!/usr/bin/env node

/**
 * Fix Category 2: Keyboard Navigation Issues (WCAG 2.1.1)
 * 
 * Strategy: Convert clickable divs to button elements OR add keyboard accessibility
 * - For simple interactive divs: Add tabIndex, role, and onKeyDown
 * - For complex layouts: Keep div but add full keyboard support
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const COMPONENT_DIR = path.join(ROOT_DIR, 'src/client/src/components');

async function fixClickableDiv(content, startLine, elementLines) {
  const lines = content.split('\n');
  
  // Find the div opening tag line
  const divLineIndex = startLine - 1;
  let divLine = lines[divLineIndex];
  
  // Check if already has keyboard accessibility
  const nextFewLines = lines.slice(divLineIndex, divLineIndex + 5).join(' ');
  const hasTabIndex = /tabIndex\s*=/.test(nextFewLines);
  const hasKeyDown = /onKeyDown\s*=/.test(nextFewLines);
  
  if (hasTabIndex && hasKeyDown) {
    return { content, fixed: false, reason: 'already-accessible' };
  }
  
  // Check if this is an overlay (backdrop)
  const isOverlay = divLine.includes('fixed inset-0') && divLine.includes('bg-black bg-opacity');
  if (isOverlay) {
    return { content, fixed: false, reason: 'overlay-skip' };
  }
  
  // Add keyboard attributes to the div line
  if (!hasTabIndex) {
    divLine = divLine.replace(/<(div|motion\.div)/, '<$1 tabIndex="0"');
  }
  
  if (!divLine.includes('role=')) {
    divLine = divLine.replace(/<(div|motion\.div)/, '<$1 role="button"');
  }
  
  // Find the onClick line and add onKeyDown
  let onClickLineIndex = -1;
  for (let i = divLineIndex; i < Math.min(divLineIndex + 10, lines.length); i++) {
    if (lines[i].includes('onClick=')) {
      onClickLineIndex = i;
      break;
    }
  }
  
  if (onClickLineIndex >= 0 && !hasKeyDown) {
    const onClickLine = lines[onClickLineIndex];
    const indent = onClickLine.match(/^\s*/)[0];
    
    // Extract the onClick handler
    const onClickMatch = onClickLine.match(/onClick=\{(.+?)\}(?:\s|$)/);
    if (onClickMatch) {
      const handler = onClickMatch[1];
      
      // Add onKeyDown on the next line
      const keyDownLine = `${indent}onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (${handler})(e); } }}`;
      lines.splice(onClickLineIndex + 1, 0, keyDownLine);
    }
  }
  
  lines[divLineIndex] = divLine;
  
  return {
    content: lines.join('\n'),
    fixed: true,
    reason: 'keyboard-added'
  };
}

async function processFile(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  const originalContent = content;
  
  // Find all clickable divs
  const pattern = /<(div|motion\.div)[^>]*?$/gm;
  const lines = content.split('\n');
  const fixes = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for div opening tag
    if (/<(div|motion\.div)/.test(line) && !/<button/.test(line)) {
      // Check next few lines for onClick
      const nextLines = lines.slice(i, i + 10).join(' ');
      if (/onClick\s*=/.test(nextLines)) {
        const result = await fixClickableDiv(content, i + 1, nextLines);
        if (result.fixed) {
          content = result.content;
          fixes.push({ line: i + 1, reason: result.reason });
        }
      }
    }
  }
  
  if (content !== originalContent) {
    await fs.writeFile(filePath, content, 'utf8');
    return fixes.length;
  }
  
  return 0;
}

async function scanAndFix(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      const subResults = await scanAndFix(fullPath);
      results.push(...subResults);
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
      const fixCount = await processFile(fullPath);
      if (fixCount > 0) {
        results.push({
          file: path.relative(ROOT_DIR, fullPath),
          fixes: fixCount
        });
      }
    }
  }
  
  return results;
}

async function main() {
  console.log('🔧 Fixing Category 2: Keyboard Navigation Issues (WCAG 2.1.1)\n');
  
  const results = await scanAndFix(COMPONENT_DIR);
  
  console.log(`\n✨ Summary:`);
  console.log(`   - Files fixed: ${results.length}`);
  console.log(`   - Total fixes applied: ${results.reduce((sum, r) => sum + r.fixes, 0)}`);
  
  if (results.length > 0) {
    console.log('\n📝 Fixed files:');
    results.forEach(r => {
      console.log(`   - ${r.file}: ${r.fixes} fix(es)`);
    });
  }
  
  console.log('\n✅ Keyboard accessibility fixes complete!');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
