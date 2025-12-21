#!/usr/bin/env node

/**
 * Automated Accessibility Fixer
 * Adds aria-labels to buttons and inputs missing them across the codebase
 * For SD-VWC-PHASE1-001 WCAG 2.1 AA compliance
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Configuration
const BASE_PATH = '/mnt/c/_EHG/EHG/src/components';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Counters
let filesScanned = 0;
let filesModified = 0;
let buttonsFixed = 0;
let inputsFixed = 0;

// Helper to extract button text content
function extractButtonText(buttonTag) {
  // Remove JSX expressions and extract plain text
  const textMatch = buttonTag.match(/>(.*?)</s);
  if (!textMatch) return null;

  const text = textMatch[1]
    .replace(/{.*?}/g, '') // Remove JSX expressions
    .replace(/<[^>]+>/g, '') // Remove nested tags
    .trim();

  return text.length > 0 && text.length < 50 ? text : null;
}

// Helper to generate aria-label from context
function generateAriaLabel(element, surroundingContext) {
  // Check for existing descriptive props
  if (element.includes('aria-label') || element.includes('aria-labelledby')) {
    return null;
  }

  // For buttons, try to extract text content
  if (element.startsWith('<Button')) {
    const textContent = extractButtonText(surroundingContext);
    if (textContent) {
      return null; // Has text content, doesn't need aria-label
    }

    // Check for common icon patterns
    if (element.includes('Play') || surroundingContext.includes('<Play')) {
      return 'aria-label="Play"';
    }
    if (element.includes('Pause') || surroundingContext.includes('<Pause')) {
      return 'aria-label="Pause"';
    }
    if (element.includes('Settings') || surroundingContext.includes('<Settings')) {
      return 'aria-label="Settings"';
    }
    if (element.includes('Edit') || surroundingContext.includes('<Edit')) {
      return 'aria-label="Edit"';
    }
    if (element.includes('Delete') || surroundingContext.includes('<Trash')) {
      return 'aria-label="Delete"';
    }
    if (element.includes('Save') || surroundingContext.includes('<Save')) {
      return 'aria-label="Save"';
    }
    if (element.includes('Close') || surroundingContext.includes('<X')) {
      return 'aria-label="Close"';
    }
    if (element.includes('Search') || surroundingContext.includes('<Search')) {
      return 'aria-label="Search"';
    }
    if (element.includes('Filter') || surroundingContext.includes('<Filter')) {
      return 'aria-label="Filter"';
    }
    if (element.includes('Download') || surroundingContext.includes('<Download')) {
      return 'aria-label="Download"';
    }
    if (element.includes('Upload') || surroundingContext.includes('<Upload')) {
      return 'aria-label="Upload"';
    }
    if (element.includes('Refresh') || surroundingContext.includes('<RefreshCw')) {
      return 'aria-label="Refresh"';
    }

    // Generic fallback
    return 'aria-label="Action button"';
  }

  // For inputs without labels
  if (element.startsWith('<Input') && !element.includes('placeholder')) {
    // Check if there's a Label element before it
    if (surroundingContext.includes('<Label')) {
      return null; // Has a label
    }
    return 'aria-label="Input field"';
  }

  // For selects
  if (element.startsWith('<select') && !surroundingContext.includes('<label')) {
    return 'aria-label="Select option"';
  }

  // For textareas
  if (element.startsWith('<Textarea') && !surroundingContext.includes('<Label')) {
    return 'aria-label="Text area"';
  }

  return null;
}

// Process a single file
function processFile(filePath) {
  filesScanned++;

  if (VERBOSE && filesScanned % 50 === 0) {
    console.log(`Progress: ${filesScanned} files scanned...`);
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let fileButtonsFixed = 0;
  let fileInputsFixed = 0;

  // Pattern 1: Buttons without aria-label
  const buttonPattern = /<Button\s+(?![^>]*aria-label)([^>]*?)>/g;
  let match;
  const replacements = [];

  while ((match = buttonPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const props = match[1];

    // Get surrounding context (100 chars before and after)
    const startIdx = Math.max(0, match.index - 100);
    const endIdx = Math.min(content.length, match.index + fullMatch.length + 100);
    const context = content.substring(startIdx, endIdx);

    const ariaLabel = generateAriaLabel(fullMatch, context);
    if (ariaLabel) {
      // Insert aria-label before the closing >
      const newButton = fullMatch.slice(0, -1) + ` ${ariaLabel}>`;
      replacements.push({ old: fullMatch, new: newButton, type: 'button' });
    }
  }

  // Pattern 2: Inputs without aria-label or placeholder
  const inputPattern = /<Input\s+(?![^>]*(?:aria-label|aria-labelledby|placeholder))([^>]*?)\/>/g;
  while ((match = inputPattern.exec(content)) !== null) {
    const fullMatch = match[0];

    // Get surrounding context
    const startIdx = Math.max(0, match.index - 200);
    const context = content.substring(startIdx, match.index + fullMatch.length);

    // Check if there's a <Label> before this input
    if (!context.includes('<Label')) {
      const ariaLabel = generateAriaLabel(fullMatch, context);
      if (ariaLabel) {
        const newInput = fullMatch.slice(0, -3) + ` ${ariaLabel} />`;
        replacements.push({ old: fullMatch, new: newInput, type: 'input' });
      }
    }
  }

  // Pattern 3: Switch components without aria-label
  const switchPattern = /<Switch\s+(?![^>]*aria-label)([^>]*?)\/>/g;
  while ((match = switchPattern.exec(content)) !== null) {
    const fullMatch = match[0];

    // Get surrounding context to find the Label
    const startIdx = Math.max(0, match.index - 200);
    const context = content.substring(startIdx, match.index + fullMatch.length);

    // Extract label text if available
    const labelMatch = context.match(/<Label[^>]*>(.*?)<\/Label>/s);
    if (labelMatch) {
      const labelText = labelMatch[1].replace(/<[^>]+>/g, '').trim();
      if (labelText && labelText.length < 100) {
        const ariaLabel = `aria-label="${labelText}"`;
        const newSwitch = fullMatch.slice(0, -3) + ` ${ariaLabel} />`;
        replacements.push({ old: fullMatch, new: newSwitch, type: 'switch' });
      }
    }
  }

  // Apply replacements
  for (const replacement of replacements) {
    content = content.replace(replacement.old, replacement.new);
    modified = true;

    if (replacement.type === 'button') {
      fileButtonsFixed++;
      buttonsFixed++;
    } else if (replacement.type === 'input') {
      fileInputsFixed++;
      inputsFixed++;
    } else if (replacement.type === 'switch') {
      inputsFixed++;
    }
  }

  if (modified) {
    filesModified++;

    if (VERBOSE) {
      console.log(`✓ ${path.relative(BASE_PATH, filePath)}: ${fileButtonsFixed} buttons, ${fileInputsFixed} inputs`);
    }

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

// Main execution
async function main() {
  console.log('🔍 Starting accessibility fixes...');
  console.log(`Base path: ${BASE_PATH}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}\n`);

  // Find all .tsx files
  const files = await glob(`${BASE_PATH}/**/*.tsx`);
  console.log(`Found ${files.length} component files\n`);

  // Process each file
  for (const file of files) {
    try {
      processFile(file);
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`Files scanned: ${filesScanned}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Buttons fixed: ${buttonsFixed}`);
  console.log(`Inputs/switches fixed: ${inputsFixed}`);
  console.log(`Total fixes: ${buttonsFixed + inputsFixed}`);

  if (DRY_RUN) {
    console.log('\n⚠️  This was a dry run. No files were modified.');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Accessibility fixes applied!');
    console.log('Next: Run DESIGN sub-agent to validate improvements.');
  }
}

main().catch(console.error);
