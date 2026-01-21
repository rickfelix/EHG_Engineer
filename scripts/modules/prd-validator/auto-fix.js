/**
 * Auto-Fix Functionality for PRD Validator
 * Attempts to automatically fix common PRD issues
 */

import fs from 'fs';

import { REQUIRED_SECTIONS } from './validation-config.js';

/**
 * Auto-fix common issues in a PRD file
 * @param {string} filePath - Path to PRD file
 * @returns {boolean} Whether any fixes were applied
 */
function autoFix(filePath) {
  console.log('\nAttempting auto-fix...\n');

  let content = fs.readFileSync(filePath, 'utf8');
  let fixed = false;
  const fixes = [];

  // Add PRD ID if missing
  if (!content.match(/PRD[-_][A-Z0-9-]+/i)) {
    const timestamp = Date.now().toString().slice(-6);
    const prdId = `PRD-${timestamp}`;
    content = `# Product Requirements Document: ${prdId}\n\n${content}`;
    fixes.push(`Added PRD ID: ${prdId}`);
    fixed = true;
  }

  // Add metadata section if missing
  if (!content.includes('## Metadata') && !content.includes('## Document Information')) {
    const metadataSection = `## Document Information\n\n- **PRD ID**: ${content.match(/PRD[-_][A-Z0-9-]+/i)?.[0] || 'PRD-DRAFT'}\n- **Version**: 1.0.0\n- **Status**: Draft\n- **Created**: ${new Date().toISOString().split('T')[0]}\n- **Author**: [To be filled]\n\n`;

    const titleEnd = content.indexOf('\n\n');
    if (titleEnd > -1) {
      content = content.slice(0, titleEnd + 2) + metadataSection + content.slice(titleEnd + 2);
      fixes.push('Added Document Information section');
      fixed = true;
    }
  }

  // Add Vision QA section for UI work
  const hasUIWork = /UI|interface|frontend|component/i.test(content);
  const hasVisionQA = /Vision QA/i.test(content);

  if (hasUIWork && !hasVisionQA) {
    const vqSection = '\n## Vision QA Requirements\n\n**Status**: REQUIRED\n\n**Test Goals**:\n- [ ] All UI components render correctly\n- [ ] Forms validate properly\n- [ ] Responsive design works on mobile/tablet/desktop\n- [ ] Accessibility standards met (WCAG 2.1 AA)\n\n**Configuration**:\n```json\n{\n  "appId": "APP-001",\n  "maxIterations": 30,\n  "costLimit": 2.00,\n  "viewports": ["desktop", "mobile"],\n  "checkAccessibility": true\n}\n```\n';

    const successIndex = content.search(/##.*Success Criteria/i);
    if (successIndex > -1) {
      content = content.slice(0, successIndex) + vqSection + '\n' + content.slice(successIndex);
    } else {
      content += vqSection;
    }
    fixes.push('Added Vision QA Requirements section');
    fixed = true;
  }

  // Add template for missing required sections
  const requiredTemplates = {
    'Executive Summary': '\n## Executive Summary\n\n[Provide a brief overview of the product/feature being specified]\n\n',
    'Problem Statement': '\n## Problem Statement\n\n[Describe the problem this product/feature solves]\n\n',
    'User Stories': '\n## User Stories\n\n- As a [user type], I want [feature], so that [benefit]\n- As a [user type], I want [feature], so that [benefit]\n\n',
    'Success Criteria': '\n## Success Criteria\n\n- [ ] [Measurable success metric]\n- [ ] [Measurable success metric]\n\n'
  };

  REQUIRED_SECTIONS.forEach(section => {
    if (!section.pattern.test(content) && requiredTemplates[section.name]) {
      content += requiredTemplates[section.name];
      fixes.push(`Added template for: ${section.name}`);
      fixed = true;
    }
  });

  if (fixed) {
    // Create backup
    const backupPath = filePath.replace('.md', '.backup.md');
    fs.copyFileSync(filePath, backupPath);

    // Save fixed content
    fs.writeFileSync(filePath, content);

    console.log('Auto-fix completed!');
    console.log('\nFixes applied:');
    fixes.forEach(fix => console.log(`   - ${fix}`));
    console.log(`\nBackup saved: ${backupPath}`);

    return true;
  } else {
    console.log('No auto-fixable issues found');
    return false;
  }
}

export { autoFix };
