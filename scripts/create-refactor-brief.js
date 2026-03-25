#!/usr/bin/env node

/**
 * Create Refactor Brief
 * Generates a lightweight refactoring documentation for cosmetic/structural refactoring SDs
 *
 * Usage: node scripts/create-refactor-brief.js <SD-ID> [--interactive]
 *
 * Purpose: Alternative to full PRD for refactoring SDs with intensity_level = cosmetic | structural
 * - Focuses on current state → desired state
 * - Lists files affected
 * - Documents risk zones
 * - Defines verification criteria
 *
 * Part of: LEO Protocol v4.3.3 Refactoring Workflow Enhancement
 * Created: 2025-12-27
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';

dotenv.config();

const execAsync = promisify(exec);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_REPO_PATH = '../ehg';

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Create Refactor Brief - LEO Protocol v4.3.3

Usage: node scripts/create-refactor-brief.js <SD-ID> [options]

Options:
  --interactive    Prompt for input during creation
  --files <list>   Comma-separated list of files being refactored
  --smell <type>   Code smell being addressed (duplication, long_method, etc.)
  --help           Show this help

Examples:
  node scripts/create-refactor-brief.js SD-REFACTOR-001
  node scripts/create-refactor-brief.js SD-REFACTOR-001 --interactive
  node scripts/create-refactor-brief.js SD-REFACTOR-001 --files "src/a.ts,src/b.ts" --smell "duplication"
    `);
    process.exit(0);
  }

  const sdId = args.find(a => !a.startsWith('--'));
  const interactive = args.includes('--interactive');
  const filesArg = args.find((a, i) => args[i - 1] === '--files');
  const smellArg = args.find((a, i) => args[i - 1] === '--smell');

  if (!sdId) {
    console.error('Error: SD-ID is required');
    process.exit(1);
  }

  console.log(`\n📝 Creating Refactor Brief for ${sdId}...\n`);

  try {
    // 1. Fetch SD details
    const sd = await fetchSDDetails(sdId);
    if (!sd) {
      console.error(`Error: SD not found: ${sdId}`);
      process.exit(1);
    }

    // Validate SD type
    if (sd.sd_type !== 'refactor') {
      console.warn(`⚠️  Warning: SD type is '${sd.sd_type}', not 'refactor'`);
      console.warn('   Refactor Brief is designed for refactoring SDs\n');
    }

    // Validate intensity level
    if (sd.intensity_level === 'architectural') {
      console.error('Error: Architectural intensity requires full PRD, not Refactor Brief');
      console.error('Use: node scripts/add-prd-to-database.js ' + sdId);
      process.exit(1);
    }

    console.log(`   📋 SD: ${sd.title}`);
    console.log(`   📊 Type: ${sd.sd_type}, Intensity: ${sd.intensity_level || 'not set'}`);

    // 2. Gather information
    let briefData = {
      sdId,
      intensity: sd.intensity_level || 'structural',
      currentState: sd.description || '',
      desiredState: '',
      codeSmell: smellArg || '',
      filesAffected: filesArg ? filesArg.split(',').map(f => f.trim()) : [],
      riskZones: {
        circularDependency: false,
        breakingImport: false,
        publicApiChange: false
      },
      verificationCriteria: []
    };

    if (interactive) {
      briefData = await gatherInteractively(briefData);
    } else {
      // Auto-detect files if not provided
      if (briefData.filesAffected.length === 0) {
        briefData.filesAffected = await detectAffectedFiles(sdId);
      }
    }

    // 3. Generate brief content
    const briefContent = generateBriefContent(sd, briefData);

    // 4. Store in database (use UUID from sd record)
    await storeBrief(sd.id, sd.sd_key || sdId, briefContent, briefData);

    console.log('\n✅ Refactor Brief created successfully!');
    console.log('\n📄 Brief stored in product_requirements_v2 with document_type=\'refactor_brief\'');
    console.log(`\n   View with: SELECT content FROM product_requirements_v2 WHERE directive_id = '${sdId}';`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Fetch SD details from database (supports id, sd_key, and sd_key)
 */
async function fetchSDDetails(sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, description, sd_type, intensity_level, status, key_changes, scope')
    .or(`id.eq.${sdId},sd_key.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (error) {
    console.error(`Database error: ${error.message}`);
    return null;
  }

  return data;
}

/**
 * Gather information interactively
 */
async function gatherInteractively(briefData) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log('\n📝 Interactive Refactor Brief Creation\n');

  // Current state
  console.log('Current State (what is being refactored):');
  if (briefData.currentState) {
    console.log(`   Default: ${briefData.currentState.substring(0, 100)}...`);
  }
  const currentStateInput = await question('   Enter description (or press Enter to use default): ');
  if (currentStateInput) briefData.currentState = currentStateInput;

  // Desired state
  const desiredState = await question('\nDesired State (what should it look like after): ');
  briefData.desiredState = desiredState || 'Refactored code with improved structure';

  // Code smell
  console.log('\nCode Smell Types:');
  console.log('   1. duplication');
  console.log('   2. long_method');
  console.log('   3. tight_coupling');
  console.log('   4. deep_nesting');
  console.log('   5. dead_code');
  console.log('   6. other');
  const smellInput = await question('Select code smell (1-6 or enter custom): ');
  const smellMap = { '1': 'duplication', '2': 'long_method', '3': 'tight_coupling', '4': 'deep_nesting', '5': 'dead_code' };
  briefData.codeSmell = smellMap[smellInput] || smellInput || 'other';

  // Files affected
  if (briefData.filesAffected.length === 0) {
    const filesInput = await question('\nFiles affected (comma-separated paths, or Enter to auto-detect): ');
    if (filesInput) {
      briefData.filesAffected = filesInput.split(',').map(f => f.trim());
    } else {
      briefData.filesAffected = await detectAffectedFiles(briefData.sdId);
    }
  }

  // Risk zones
  console.log('\nRisk Zones (y/n for each):');
  const circularRisk = await question('   Circular dependency risk? ');
  briefData.riskZones.circularDependency = circularRisk.toLowerCase() === 'y';

  const importRisk = await question('   Breaking import risk? ');
  briefData.riskZones.breakingImport = importRisk.toLowerCase() === 'y';

  const apiRisk = await question('   Public API change risk? ');
  briefData.riskZones.publicApiChange = apiRisk.toLowerCase() === 'y';

  rl.close();
  return briefData;
}

/**
 * Auto-detect affected files from git changes
 */
async function detectAffectedFiles(sdId) {
  try {
    // Check for branch with SD ID
    const { stdout: branchStdout } = await execAsync(
      `cd "${DEFAULT_REPO_PATH}" && git branch --list "*${sdId}*" 2>/dev/null | head -1`,
      { maxBuffer: 1024 * 1024 }
    );

    const branch = branchStdout.trim().replace('* ', '');

    if (branch) {
      // Get files changed on this branch
      const { stdout } = await execAsync(
        `cd "${DEFAULT_REPO_PATH}" && git diff --name-only main...${branch} 2>/dev/null | head -20`,
        { maxBuffer: 1024 * 1024 }
      );
      return stdout.split('\n').filter(Boolean);
    }

    // Fall back to recently modified files
    const { stdout } = await execAsync(
      `cd "${DEFAULT_REPO_PATH}" && git diff --name-only HEAD~5 2>/dev/null | head -20`,
      { maxBuffer: 1024 * 1024 }
    );
    return stdout.split('\n').filter(Boolean);

  } catch (_error) {
    console.log('   ⚠️  Could not auto-detect files');
    return [];
  }
}

/**
 * Generate Refactor Brief content
 */
function generateBriefContent(sd, briefData) {
  const filesTable = briefData.filesAffected.length > 0
    ? briefData.filesAffected.map(f => `| \`${f}\` | Modify | Low | |`).join('\n')
    : '| _No files identified_ | | | |';

  const riskChecklist = [
    `- [${briefData.riskZones.circularDependency ? 'x' : ' '}] **Circular dependency risk**: ${briefData.riskZones.circularDependency ? 'Yes - needs review' : 'N/A'}`,
    `- [${briefData.riskZones.breakingImport ? 'x' : ' '}] **Breaking import risk**: ${briefData.riskZones.breakingImport ? 'Yes - update importers' : 'N/A'}`,
    `- [${briefData.riskZones.publicApiChange ? 'x' : ' '}] **Public API change risk**: ${briefData.riskZones.publicApiChange ? 'Yes - document migration' : 'N/A'}`
  ].join('\n');

  return `# Refactor Brief: ${sd.id}

## Document Information
| Field | Value |
|-------|-------|
| **SD ID** | ${sd.id} |
| **Title** | ${sd.title} |
| **Intensity** | ${briefData.intensity} |
| **Created** | ${new Date().toISOString().split('T')[0]} |
| **Status** | ${sd.status} |

---

## 1. Current State

### 1.1 Code Location
- **Primary file(s)**: ${briefData.filesAffected.slice(0, 3).map(f => `\`${f}\``).join(', ') || '_To be identified_'}
- **Related files**: ${briefData.filesAffected.length > 3 ? `${briefData.filesAffected.length - 3} additional files` : 'See Files Affected table'}

### 1.2 Current Implementation
${briefData.currentState || sd.description || '_Description from SD_'}

### 1.3 Code Smell / Technical Debt
**Type**: ${briefData.codeSmell || 'Not specified'}

${sd.key_changes ? `**Key Changes Needed**:\n${JSON.stringify(sd.key_changes, null, 2)}` : ''}

---

## 2. Desired State

### 2.1 Proposed Structure
${briefData.desiredState || 'Refactored code with improved structure, readability, and maintainability.'}

### 2.2 Key Changes
- [ ] Identify target code pattern
- [ ] Apply refactoring transformation
- [ ] Update all importers
- [ ] Verify tests pass

### 2.3 Expected Benefits
- Improved readability
- Better maintainability
- Reduced complexity
- Easier testing

---

## 3. Files Affected

| File | Change Type | Risk Level | Notes |
|------|-------------|------------|-------|
${filesTable}

**Total files affected**: ${briefData.filesAffected.length}
**Estimated LOC changed**: _To be calculated_

---

## 4. Risk Zones

### 4.1 Dependency Risks
${riskChecklist}

### 4.2 Public API Risks
- [ ] **Export changes**: ${briefData.riskZones.publicApiChange ? 'Review needed' : 'None expected'}
- [ ] **Function signature changes**: None expected (refactoring only)
- [ ] **Type definition changes**: None expected

### 4.3 Test Risks
- [ ] **Tests needing updates**: None - behavior unchanged
- [ ] **Coverage impact**: Should remain same or improve

---

## 5. Verification Criteria

### 5.1 Pre-Refactor Baseline (capture before changes)
- [ ] All existing tests pass
- [ ] Build succeeds without errors
- [ ] Lint passes without new warnings
- [ ] Current test coverage recorded

### 5.2 Post-Refactor Validation
- [ ] All existing tests pass **without modification**
- [ ] Build succeeds without errors
- [ ] Lint passes without new warnings
- [ ] Test coverage not decreased
- [ ] All import paths resolve correctly
- [ ] No new TypeScript errors

### 5.3 REGRESSION-VALIDATOR Checklist
- [ ] Baseline snapshot captured
- [ ] API signatures documented
- [ ] Import graph analyzed
- [ ] Post-refactor comparison complete
- [ ] Verdict: _Pending_

---

## 6. Rollback Plan

### 6.1 Git Rollback
\`\`\`bash
# If issues discovered after merge:
git revert <commit-hash>
\`\`\`

### 6.2 Manual Rollback Steps
1. Revert the refactoring commits
2. Verify tests pass after revert

---

## 7. Sign-off

| Role | Status | Date |
|------|--------|------|
| LEAD Approval | [ ] Pending | |
| Pre-refactor baseline | [ ] Pending | |
| Post-refactor validation | [ ] Pending | |
| REGRESSION Verdict | [ ] Pending | |

---

*This Refactor Brief was generated by LEO Protocol v4.3.3*
*Template version: 1.0.0*
*Generated: ${new Date().toISOString()}*
`;
}

/**
 * Store brief in database
 * @param {string} sdUuid - The SD's UUID (for foreign key)
 * @param {string} sdKey - The SD's key for display purposes
 * @param {string} content - The brief markdown content
 * @param {object} briefData - Brief metadata
 */
async function storeBrief(sdUuid, sdKey, content, briefData) {
  // Check if PRD already exists
  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('directive_id', sdUuid)
    .single();

  const prdData = {
    directive_id: sdUuid,
    sd_id: sdUuid,
    title: `Refactor Brief: ${sdKey}`,
    content: content,
    document_type: 'refactor_brief',
    status: 'draft',
    // Required: minimum 3 functional requirements per check constraint
    functional_requirements: [
      { id: 'FR-1', requirement: 'Extract target code into separate module', priority: 'high', acceptance_criteria: 'Module exists and is importable' },
      { id: 'FR-2', requirement: 'Maintain existing API signatures', priority: 'critical', acceptance_criteria: 'No breaking changes to public interfaces' },
      { id: 'FR-3', requirement: 'Preserve all existing functionality', priority: 'critical', acceptance_criteria: 'All existing tests pass without modification' }
    ],
    // Required: minimum 1 acceptance criteria per check constraint
    acceptance_criteria: [
      { id: 'AC-1', criteria: 'All existing tests pass without modification', priority: 'critical' },
      { id: 'AC-2', criteria: 'No API signature changes (backward compatible)', priority: 'critical' },
      { id: 'AC-3', criteria: 'Code coverage remains at or above baseline', priority: 'high' },
      { id: 'AC-4', criteria: 'REGRESSION sub-agent returns PASS verdict', priority: 'critical' }
    ],
    // Required: minimum 1 test scenario per check constraint
    test_scenarios: [
      { id: 'TS-1', scenario: 'Run existing test suite', expected_result: 'All tests pass (100%)', test_type: 'regression' },
      { id: 'TS-2', scenario: 'Verify API backward compatibility', expected_result: 'No API signature changes detected', test_type: 'integration' }
    ],
    metadata: {
      intensity: briefData.intensity,
      code_smell: briefData.codeSmell,
      files_affected: briefData.filesAffected,
      risk_zones: briefData.riskZones,
      generated_at: new Date().toISOString(),
      generator: 'create-refactor-brief.js',
      version: '1.0.0'
    }
  };

  if (existing) {
    console.log('   📝 Updating existing PRD entry...');
    const { error } = await supabase
      .from('product_requirements_v2')
      .update(prdData)
      .eq('directive_id', sdUuid);

    if (error) throw new Error(`Failed to update brief: ${error.message}`);
  } else {
    console.log('   📝 Creating new PRD entry...');
    prdData.id = randomUUID();
    const { error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData);

    if (error) throw new Error(`Failed to create brief: ${error.message}`);
  }
}

// Run main
main();
