#!/usr/bin/env node
/**
 * Add User Stories for SD-LEO-GEMINI-001
 * LEO Protocol Enhancement: Discovery Gate & Quality Improvements
 *
 * Infrastructure enhancement with 5 functional requirements:
 * - FR-1: Discovery Gate - Mandatory exploration before PRD creation (≥5 file reads)
 * - FR-2: Exploration Audit - PLAN→EXEC validation (≥3 file reads in exploration_summary)
 * - FR-3: Negative Constraints Block - Anti-pattern documentation in CLAUDE_*.md files
 * - FR-4: Self-Critique Pre-Flight - Agent confidence scoring before handoffs
 * - FR-5: PRD Template Scaffolding - Skeleton structure in PLAN prompts
 *
 * INVEST Criteria Applied:
 * - Independent: Each story focuses on specific gate or documentation enhancement
 * - Negotiable: Implementation details (thresholds, formats) can be refined
 * - Valuable: Each reduces PRD revision cycles and improves quality
 * - Estimable: Story points based on complexity (2-5 points)
 * - Small: All completable in 1-2 days
 * - Testable: Given-When-Then acceptance criteria for all validation gates
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-LEO-GEMINI-001';
const PRD_ID = 'PRD-SD-LEO-GEMINI-001';

// User stories following INVEST criteria with enhanced context engineering
// story_key format: {SD-ID}:US-XXX (required by valid_story_key constraint)
const userStories = [
  {
    story_key: 'SD-LEO-GEMINI-001:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Discovery Gate - Mandatory Codebase Exploration Before PRD Creation',
    user_role: 'PLAN Agent',
    user_want: 'Validation gate that requires ≥5 file reads before allowing PRD creation',
    user_benefit: 'Ensures PRDs are written with actual codebase context rather than assumptions, reducing requirement gaps and revision cycles',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Discovery gate passes with sufficient exploration',
        given: 'PLAN agent has read 5 or more unique files during PLAN phase AND exploration_log tracks file paths and timestamps',
        when: 'Agent attempts to create PRD using add-prd-to-database.js',
        then: 'Discovery gate check passes AND PRD creation proceeds AND exploration_log is stored in PRD metadata'
      },
      {
        id: 'AC-001-2',
        scenario: 'Error path - Discovery gate blocks insufficient exploration',
        given: 'PLAN agent has read only 3 files during PLAN phase',
        when: 'Agent attempts to create PRD',
        then: 'Discovery gate check fails AND actionable error message displayed: "Discovery gate failed: Only 3 files explored, minimum 5 required. Read more files to understand context." AND PRD creation is blocked'
      },
      {
        id: 'AC-001-3',
        scenario: 'Exploration log tracking',
        given: 'PLAN agent reads files during PRD creation',
        when: 'Agent uses Read tool to examine codebase',
        then: 'Exploration log captures: file_path, timestamp, file_type AND log persists across agent session AND duplicates are not double-counted'
      },
      {
        id: 'AC-001-4',
        scenario: 'Override mechanism - Bypass with justification',
        given: 'PLAN agent has insufficient exploration but has valid reason',
        when: 'Agent runs add-prd-to-database.js with --skip-discovery flag and --reason parameter',
        then: 'Discovery gate is bypassed AND reason is logged in PRD metadata.discovery_override AND warning issued "Discovery gate bypassed: [reason]"'
      },
      {
        id: 'AC-001-5',
        scenario: 'Exploration quality check',
        given: 'PLAN agent has read exactly 5 files',
        when: 'Discovery gate evaluates file types',
        then: 'Warning issued if all 5 files are documentation (.md) AND recommendation shown "Consider exploring code files (.ts, .js, .tsx) for implementation context"'
      }
    ],
    definition_of_done: [
      'phase-preflight.js or add-prd-to-database.js updated with discovery gate validation',
      'Exploration log tracking implemented (file paths, timestamps, counts)',
      'Error messages provide actionable guidance',
      '--skip-discovery override flag with required --reason parameter',
      'Exploration log stored in PRD metadata.exploration_log field',
      'Unit tests for discovery gate validation pass',
      'E2E test: PRD creation blocked with <5 files'
    ],
    technical_notes: 'Discovery gate prevents "hallucinated requirements" where agents write PRDs based on assumptions. Tracks Read tool usage during PLAN phase. Edge cases: Agent reads same file multiple times (count as 1), agent reads generated files vs source files (differentiate), agent explores irrelevant files (quality check), session timeout causing exploration log loss (persistence).',
    implementation_approach: 'Add pre-validation hook to add-prd-to-database.js that queries exploration log. Create exploration log tracker that intercepts Read tool calls during PLAN phase. Store log in PRD metadata for audit trail. Implement --skip-discovery flag with reason logging.',
    implementation_context: 'FR-1: Foundation for evidence-based PRD creation. Addresses root cause "agents don\'t explore before writing". Must integrate with existing add-prd-to-database.js workflow without breaking backward compatibility.',
    architecture_references: [
      'scripts/add-prd-to-database.js - PRD creation entry point (add discovery gate here)',
      'scripts/modules/handoff/db/PRDRepository.js - PRD database operations',
      'lib/prd-schema-validator.js - PRD validation logic',
      'Database: product_requirements_v2.metadata - Store exploration_log as JSONB',
      'CLAUDE_PLAN.md - Document discovery requirements for PLAN agents'
    ],
    example_code_patterns: {
      discovery_gate: `// In add-prd-to-database.js, before PRD creation
async function validateDiscoveryGate(explorationLog, options = {}) {
  const uniqueFiles = new Set(explorationLog.map(e => e.file_path));
  const fileCount = uniqueFiles.size;
  const threshold = 5;

  if (fileCount < threshold) {
    if (options.skipDiscovery) {
      console.warn(\`⚠️  Discovery gate BYPASSED: \${options.reason}\`);
      return {
        passed: true,
        bypassed: true,
        reason: options.reason
      };
    }

    throw new Error(
      \`Discovery gate failed: Only \${fileCount} files explored, minimum \${threshold} required.\\n\` +
      \`Read more files to understand context. Explored:\\n\` +
      explorationLog.map(e => \`  - \${e.file_path}\`).join('\\n')
    );
  }

  // Quality check: warn if all files are documentation
  const codeFiles = explorationLog.filter(e =>
    e.file_path.match(/\\.(ts|js|tsx|jsx)$/)
  );

  if (codeFiles.length === 0) {
    console.warn(
      '⚠️  Warning: All explored files are documentation (.md).\\n' +
      'Consider exploring code files (.ts, .js, .tsx) for implementation context.'
    );
  }

  return { passed: true, fileCount, explorationLog };
}`,
      exploration_tracker: `// Exploration log tracker (conceptual - intercepts Read tool)
class ExplorationLogTracker {
  constructor() {
    this.log = [];
  }

  recordFileRead(filePath) {
    const entry = {
      file_path: filePath,
      timestamp: new Date().toISOString(),
      file_type: this.getFileType(filePath)
    };

    // Don't double-count duplicate reads
    const exists = this.log.some(e => e.file_path === filePath);
    if (!exists) {
      this.log.push(entry);
    }

    return this.log;
  }

  getFileType(filePath) {
    if (filePath.match(/\\.(ts|tsx)$/)) return 'typescript';
    if (filePath.match(/\\.(js|jsx)$/)) return 'javascript';
    if (filePath.match(/\\.md$/)) return 'documentation';
    if (filePath.match(/\\.sql$/)) return 'database';
    return 'other';
  }

  getSummary() {
    return {
      total_files: this.log.length,
      by_type: this.groupByType(),
      files: this.log
    };
  }

  groupByType() {
    return this.log.reduce((acc, entry) => {
      acc[entry.file_type] = (acc[entry.file_type] || 0) + 1;
      return acc;
    }, {});
  }
}`,
      prd_metadata_storage: `// Store exploration log in PRD metadata
const explorationSummary = explorationTracker.getSummary();

const prdData = {
  // ... other PRD fields
  metadata: {
    exploration_log: explorationSummary,
    discovery_gate: {
      passed: true,
      threshold: 5,
      actual: explorationSummary.total_files,
      timestamp: new Date().toISOString()
    }
  }
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdData);`
    },
    testing_scenarios: [
      { scenario: 'Discovery gate passes with 5+ file reads', type: 'unit', priority: 'P0' },
      { scenario: 'Discovery gate blocks with <5 file reads', type: 'unit', priority: 'P0' },
      { scenario: 'Exploration log tracks unique files correctly', type: 'unit', priority: 'P1' },
      { scenario: '--skip-discovery flag bypasses gate with reason', type: 'integration', priority: 'P1' },
      { scenario: 'Warning issued for documentation-only exploration', type: 'unit', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Exploration Audit - PLAN→EXEC Handoff Validation Gate',
    user_role: 'Handoff System',
    user_want: 'Validation at PLAN→EXEC handoff that audits exploration performed during PLAN phase',
    user_benefit: 'Ensures EXEC agents receive PRDs backed by documented codebase exploration, reducing implementation confusion and "where do I put this?" questions',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Comprehensive exploration documented',
        given: 'PRD contains exploration_summary field with ≥10 file references AND each file has documented findings',
        when: 'PLAN→EXEC handoff executes via PlanToExecExecutor',
        then: 'Exploration audit passes with "COMPREHENSIVE" rating AND handoff proceeds AND audit results logged in handoff_records.validation_details'
      },
      {
        id: 'AC-002-2',
        scenario: 'Warning path - Minimal exploration (3-5 files)',
        given: 'PRD contains exploration_summary with 4 file references',
        when: 'PLAN→EXEC handoff executes',
        then: 'Exploration audit passes with "MINIMAL" rating AND warning issued "Exploration is minimal (4 files). EXEC may need additional context." AND handoff proceeds with warning flag'
      },
      {
        id: 'AC-002-3',
        scenario: 'Error path - Insufficient exploration (<3 files)',
        given: 'PRD contains exploration_summary with only 2 file references',
        when: 'PLAN→EXEC handoff executes',
        then: 'Exploration audit FAILS AND handoff is BLOCKED AND error message "Exploration audit failed: Only 2 files documented, minimum 3 required. Update exploration_summary in PRD." AND handoff_records.status = "rejected"'
      },
      {
        id: 'AC-002-4',
        scenario: 'Quality check - Findings documentation',
        given: 'PRD exploration_summary references 5 files',
        when: 'Audit checks findings for each file',
        then: 'Each file reference must include: file_path, purpose, and key_findings AND error if any file lacks findings: "File [path] has no documented findings"'
      },
      {
        id: 'AC-002-5',
        scenario: 'Exploration summary format validation',
        given: 'PRD has exploration_summary field',
        when: 'Audit validates format',
        then: 'exploration_summary must be JSONB array with schema: [{ file_path, purpose, key_findings, read_timestamp }] AND error if format invalid'
      }
    ],
    definition_of_done: [
      'PlanToExecExecutor.js updated with exploration audit validation',
      'Exploration audit checks: file count (≥3), findings documentation, format validation',
      'Audit ratings: COMPREHENSIVE (≥10), ADEQUATE (6-9), MINIMAL (3-5), INSUFFICIENT (<3)',
      'Handoff blocked if INSUFFICIENT, warning if MINIMAL',
      'Audit results stored in handoff_records.validation_details',
      'Unit tests for audit logic pass',
      'E2E test: PLAN→EXEC handoff blocked with insufficient exploration'
    ],
    technical_notes: 'Exploration audit validates that PLAN agents actually explored codebase and documented findings. Complements US-001 (discovery gate) by validating documentation quality. Edge cases: exploration_summary field missing (reject), exploration_summary empty array (reject), file_path references non-existent files (warn but don\'t block), findings are generic/unhelpful (future enhancement: NLP quality check).',
    implementation_approach: 'Add validateExplorationAudit() function to PlanToExecExecutor.js. Query PRD.exploration_summary from database. Validate array length, schema, and findings quality. Return audit rating and details. Block handoff if rating is INSUFFICIENT.',
    implementation_context: 'FR-2: Quality gate at handoff transition. Prevents "blind handoffs" where EXEC receives PRDs without exploration evidence. Works in tandem with US-001 discovery gate.',
    architecture_references: [
      'scripts/modules/handoff/executors/PlanToExecExecutor.js - PLAN→EXEC handoff executor',
      'scripts/modules/handoff/HandoffOrchestrator.js - Handoff orchestration',
      'Database: product_requirements_v2.exploration_summary - Exploration documentation (JSONB)',
      'Database: handoff_records.validation_details - Audit results storage',
      'scripts/handoff.js - Manual handoff CLI entry point'
    ],
    example_code_patterns: {
      exploration_audit: `// In PlanToExecExecutor.js
async function validateExplorationAudit(prdId) {
  // 1. Fetch PRD exploration_summary
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('exploration_summary, metadata')
    .eq('id', prdId)
    .single();

  if (!prd.exploration_summary) {
    return {
      passed: false,
      rating: 'INSUFFICIENT',
      error: 'exploration_summary field missing from PRD. Document codebase exploration.'
    };
  }

  // 2. Validate format (JSONB array)
  if (!Array.isArray(prd.exploration_summary)) {
    return {
      passed: false,
      rating: 'INSUFFICIENT',
      error: 'exploration_summary must be array of file references'
    };
  }

  const fileCount = prd.exploration_summary.length;

  // 3. Check file count thresholds
  if (fileCount < 3) {
    return {
      passed: false,
      rating: 'INSUFFICIENT',
      error: \`Exploration audit failed: Only \${fileCount} files documented, minimum 3 required.\`
    };
  }

  // 4. Validate findings for each file
  const missingFindings = prd.exploration_summary.filter(
    f => !f.key_findings || f.key_findings.trim() === ''
  );

  if (missingFindings.length > 0) {
    return {
      passed: false,
      rating: 'INSUFFICIENT',
      error: \`Files missing findings: \${missingFindings.map(f => f.file_path).join(', ')}\`
    };
  }

  // 5. Determine rating
  let rating;
  if (fileCount >= 10) rating = 'COMPREHENSIVE';
  else if (fileCount >= 6) rating = 'ADEQUATE';
  else rating = 'MINIMAL'; // 3-5 files

  return {
    passed: true,
    rating,
    fileCount,
    warning: rating === 'MINIMAL' ?
      \`Exploration is minimal (\${fileCount} files). EXEC may need additional context.\` : null
  };
}`,
      handoff_integration: `// In PlanToExecExecutor.execute()
async execute(handoffRequest) {
  // ... existing validation logic

  // NEW: Exploration audit
  const auditResult = await validateExplorationAudit(handoffRequest.prd_id);

  if (!auditResult.passed) {
    return {
      success: false,
      rejected: true,
      reasonCode: 'EXPLORATION_AUDIT_FAILED',
      message: auditResult.error,
      validation_details: {
        exploration_audit: auditResult
      }
    };
  }

  if (auditResult.warning) {
    console.warn(\`⚠️  \${auditResult.warning}\`);
  }

  console.log(\`✅ Exploration audit passed: \${auditResult.rating} (\${auditResult.fileCount} files)\`);

  // Store audit results in handoff record
  const handoff = await this.createHandoffRecord({
    ...handoffRequest,
    validation_details: {
      exploration_audit: auditResult
    }
  });

  // ... continue with handoff
}`,
      exploration_summary_schema: `// Expected exploration_summary schema
[
  {
    file_path: 'scripts/add-prd-to-database.js',
    purpose: 'PRD creation entry point - understand validation flow',
    key_findings: 'Uses prd-schema-validator.js for validation. Requires all FR fields populated. No discovery gate currently.',
    read_timestamp: '2025-12-12T10:30:00Z'
  },
  {
    file_path: 'lib/prd-schema-validator.js',
    purpose: 'PRD validation logic - understand required fields',
    key_findings: 'Validates functional_requirements min 3 items. Checks acceptance_criteria structure. No exploration validation.',
    read_timestamp: '2025-12-12T10:32:00Z'
  },
  // ... more entries
]`
    },
    testing_scenarios: [
      { scenario: 'Audit passes with ≥10 files (COMPREHENSIVE)', type: 'unit', priority: 'P0' },
      { scenario: 'Audit warns with 3-5 files (MINIMAL)', type: 'unit', priority: 'P0' },
      { scenario: 'Audit blocks with <3 files (INSUFFICIENT)', type: 'unit', priority: 'P0' },
      { scenario: 'Audit validates findings for each file', type: 'unit', priority: 'P1' },
      { scenario: 'E2E: PLAN→EXEC handoff blocked by insufficient exploration', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Negative Constraints Block - CLAUDE_CORE.md Anti-Patterns',
    user_role: 'All Agents',
    user_want: 'Consolidated list of prohibited behaviors and anti-patterns in CLAUDE_CORE.md under <negative_constraints> XML block',
    user_benefit: 'Clear "don\'t do this" guidance prevents common mistakes and protocol violations across all phases',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Negative constraints block structure',
        given: 'CLAUDE_CORE.md is being updated',
        when: 'Agent reads negative constraints section',
        then: '<negative_constraints> XML block contains: constraint_id, prohibited_behavior, why_prohibited, correct_alternative AND constraints organized by category (database, workflow, documentation, etc.)'
      },
      {
        id: 'AC-003-2',
        scenario: 'Global constraints coverage',
        given: 'Negative constraints block is populated',
        when: 'Reviewing global anti-patterns',
        then: 'Includes constraints for: "No markdown files as source of truth", "No skipping handoff gates", "No direct database updates without scripts", "No bypassing validation", "No creating multiple PRDs per SD"'
      },
      {
        id: 'AC-003-3',
        scenario: 'Constraint format with alternatives',
        given: 'Each constraint is documented',
        when: 'Agent reads constraint',
        then: 'Format includes: ❌ DON\'T (prohibited behavior) + ⚠️ WHY (reason) + ✅ DO (correct alternative) AND example showing before/after'
      },
      {
        id: 'AC-003-4',
        scenario: 'Cross-reference to violations',
        given: 'Constraint documents common mistake',
        when: 'Constraint references past issues',
        then: 'Includes link to retrospective or lessons learned (e.g., "See SD-TEST-MOCK-001 validation gap") AND frequency indicator (common, occasional, rare)'
      },
      {
        id: 'AC-003-5',
        scenario: 'Searchability and discoverability',
        given: 'Agent needs to check if behavior is prohibited',
        when: 'Searching CLAUDE_CORE.md for constraint',
        then: 'Constraints have searchable tags (e.g., #database, #handoff, #validation) AND table of contents links to constraint categories'
      }
    ],
    definition_of_done: [
      'CLAUDE_CORE.md updated with <negative_constraints> XML block',
      'Minimum 10 global constraints documented',
      'Each constraint follows ❌ DON\'T / ⚠️ WHY / ✅ DO format',
      'Constraints categorized: database, workflow, documentation, validation, testing',
      'Cross-references to retrospectives for context',
      'Table of contents for constraint categories',
      'Markdown validation passes (proper XML syntax)'
    ],
    technical_notes: 'Negative constraints complement positive instructions by explicitly stating anti-patterns. Reduces cognitive load by providing clear "avoid this" guidance. Edge cases: Constraint conflicts with positive instruction (resolve in favor of constraint), constraint is outdated (versioning needed), constraint is too vague (requires specificity).',
    implementation_approach: 'Add <negative_constraints> section to CLAUDE_CORE.md after Session Prologue. Group constraints by category with XML tags for structure. Include real examples from retrospectives. Use clear formatting (emoji + bold) for scannability.',
    implementation_context: 'FR-3: Documentation enhancement for all agents. Complements existing positive instructions with explicit prohibitions. Based on "Vibe Coding" research finding that negative examples prevent mistakes.',
    architecture_references: [
      'CLAUDE_CORE.md - Core protocol instructions (add negative_constraints block)',
      'docs/retrospectives/ - Past issues to extract constraint examples',
      'docs/lessons-learned/ - Anti-pattern documentation',
      'CLAUDE_PLAN.md - Phase-specific constraints (FR-3 continuation)',
      'CLAUDE_EXEC.md - Phase-specific constraints (FR-3 continuation)'
    ],
    example_code_patterns: {
      negative_constraints_block: `## <negative_constraints>

### Database & Data Management

#### NC-001: No Markdown Files as Source of Truth
- ❌ **DON'T**: Store critical data in markdown files (user stories, PRDs, SD tracking)
- ⚠️ **WHY**: Markdown files are not queryable, not transactional, and cause data duplication/sync issues
- ✅ **DO**: Store all data in Supabase database tables. Use markdown for documentation only.
- **Example Violation**: Creating user-stories.md instead of inserting to user_stories table
- **Reference**: LEO Protocol v4.x database-first architecture
- **Frequency**: Common (top anti-pattern)

#### NC-002: No Direct Database Updates Without Scripts
- ❌ **DON'T**: Run raw SQL UPDATE/INSERT statements via Supabase dashboard or psql
- ⚠️ **WHY**: Bypasses validation, no audit trail, breaks integrity constraints
- ✅ **DO**: Create migration scripts in database/migrations/ or use process scripts (add-prd-to-database.js)
- **Example Violation**: \`UPDATE strategic_directives_v2 SET status = 'completed'\` (should use complete-sd.js)
- **Reference**: Database governance policy
- **Frequency**: Occasional

#### NC-003: No Multiple PRDs Per Strategic Directive
- ❌ **DON'T**: Create multiple PRDs for one SD (e.g., PRD-001-A, PRD-001-B)
- ⚠️ **WHY**: 1:1 relationship enforced by schema. Causes foreign key violations.
- ✅ **DO**: One SD = One PRD. Use PRD versioning (version field) for revisions.
- **Example Violation**: Attempting to create PRD-SD-FOO-001 and PRD-SD-FOO-002 for same SD
- **Reference**: product_requirements_v2 schema, fk_prd_sd_id constraint
- **Frequency**: Rare

### Workflow & Handoffs

#### NC-004: No Skipping Handoff Gates
- ❌ **DON'T**: Bypass handoff validation gates (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
- ⚠️ **WHY**: Gates enforce quality, prevent incomplete work, ensure protocol compliance
- ✅ **DO**: Fix validation failures and re-submit handoff. Use override flags only with documented reason.
- **Example Violation**: Manually changing SD phase from PLAN to EXEC without handoff
- **Reference**: Unified Handoff System (scripts/handoff.js)
- **Frequency**: Occasional

#### NC-005: No Implementation Work in PLAN Phase
- ❌ **DON'T**: Write code, create components, or modify implementation during PLAN phase
- ⚠️ **WHY**: PLAN phase is for requirements and design only. Implementation is EXEC phase responsibility.
- ✅ **DO**: Document requirements, create PRD, define acceptance criteria. Implement in EXEC phase.
- **Example Violation**: Creating React components while writing PRD
- **Reference**: CLAUDE_PLAN.md phase boundaries
- **Frequency**: Common (scope creep)

### Validation & Quality

#### NC-006: No Bypassing Validation Without Reason
- ❌ **DON'T**: Use --skip-validation flags without documented justification
- ⚠️ **WHY**: Validation catches errors early. Skipping creates technical debt and future failures.
- ✅ **DO**: Fix validation errors. Only skip with --reason flag for exceptional cases (prototype, urgent fix).
- **Example Violation**: \`node add-prd-to-database.js --skip-validation\` (no reason)
- **Reference**: Validation enforcement policy
- **Frequency**: Occasional

</negative_constraints>`,
      constraint_template: `#### NC-XXX: [Constraint Title]
- ❌ **DON'T**: [Prohibited behavior - specific and actionable]
- ⚠️ **WHY**: [Concrete reason - technical or process impact]
- ✅ **DO**: [Correct alternative - specific action to take instead]
- **Example Violation**: [Real or realistic example of the anti-pattern]
- **Reference**: [Link to relevant docs, schema, or retrospective]
- **Frequency**: [Common / Occasional / Rare]`
    },
    testing_scenarios: [
      { scenario: 'Negative constraints block renders correctly in markdown', type: 'manual', priority: 'P1' },
      { scenario: 'All constraints follow standard format', type: 'manual', priority: 'P1' },
      { scenario: 'XML tags are properly closed', type: 'unit', priority: 'P2' },
      { scenario: 'Cross-references to retrospectives are valid links', type: 'manual', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Negative Constraints Block - CLAUDE_PLAN.md Phase-Specific Anti-Patterns',
    user_role: 'PLAN Agent',
    user_want: 'PLAN-phase-specific negative constraints documenting prohibited behaviors during PRD creation and planning',
    user_benefit: 'Clear boundaries prevent PLAN agents from implementation work, premature decisions, and incomplete exploration',
    priority: 'high',
    story_points: 2,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'PLAN phase constraint coverage',
        given: 'CLAUDE_PLAN.md negative_constraints block is populated',
        when: 'Reviewing PLAN-specific anti-patterns',
        then: 'Includes constraints for: "No implementation code", "No premature technology choices", "No skipping exploration", "No vague acceptance criteria", "No missing test scenarios"'
      },
      {
        id: 'AC-004-2',
        scenario: 'Implementation boundary constraint',
        given: 'Constraint NC-PLAN-001 documents implementation boundary',
        when: 'PLAN agent reads constraint',
        then: 'Clearly states: ❌ DON\'T write code, create components, or modify files AND ✅ DO document requirements, design patterns, and implementation approach (text only)'
      },
      {
        id: 'AC-004-3',
        scenario: 'Exploration requirement constraint',
        given: 'Constraint NC-PLAN-003 documents exploration requirement',
        when: 'PLAN agent reads constraint',
        then: 'States: ❌ DON\'T write PRD without reading codebase AND ✅ DO explore ≥5 files and document findings AND references US-001 discovery gate'
      },
      {
        id: 'AC-004-4',
        scenario: 'Acceptance criteria quality constraint',
        given: 'Constraint NC-PLAN-004 documents AC quality',
        when: 'PLAN agent writes acceptance criteria',
        then: 'States: ❌ DON\'T write vague criteria like "Feature works" AND ✅ DO use Given-When-Then format with specific inputs/outputs AND provide example from user_stories table'
      },
      {
        id: 'AC-004-5',
        scenario: 'Cross-reference to EXEC phase',
        given: 'PLAN constraints reference handoff',
        when: 'Constraint mentions EXEC responsibilities',
        then: 'Links to CLAUDE_EXEC.md for EXEC-phase constraints AND clarifies handoff boundary'
      }
    ],
    definition_of_done: [
      'CLAUDE_PLAN.md updated with <negative_constraints> section',
      'Minimum 8 PLAN-specific constraints documented',
      'Constraints follow same format as CLAUDE_CORE.md (❌ DON\'T / ⚠️ WHY / ✅ DO)',
      'References to US-001 (discovery gate) and US-002 (exploration audit)',
      'Examples of good vs bad PRD sections',
      'Cross-links to CLAUDE_EXEC.md for handoff boundary',
      'Markdown validation passes'
    ],
    technical_notes: 'PLAN-specific constraints complement global constraints with phase-focused anti-patterns. Prevents scope creep (PLAN doing EXEC work) and ensures quality handoffs. Edge cases: Constraint conflicts with time pressure (emphasize quality over speed), agent interprets "design" as implementation (clarify with examples).',
    implementation_approach: 'Add <negative_constraints> section to CLAUDE_PLAN.md after PRD creation instructions. Focus on: implementation boundaries, exploration requirements, PRD quality standards, handoff preparation. Use same XML structure as CLAUDE_CORE.md.',
    implementation_context: 'FR-3 continuation: Phase-specific constraints for PLAN. Addresses common PLAN mistakes: premature implementation, insufficient exploration, vague requirements.',
    architecture_references: [
      'CLAUDE_PLAN.md - PLAN phase instructions (add negative_constraints block)',
      'CLAUDE_CORE.md - Global constraints (reference for format)',
      'CLAUDE_EXEC.md - EXEC constraints (cross-reference for handoff boundary)',
      'scripts/add-prd-to-database.js - PRD creation workflow',
      'lib/prd-schema-validator.js - PRD validation rules'
    ],
    example_code_patterns: {
      plan_constraints: `## <negative_constraints phase="PLAN">

### Implementation Boundaries

#### NC-PLAN-001: No Implementation Code in PLAN Phase
- ❌ **DON'T**: Write TypeScript/JavaScript code, create React components, modify source files
- ⚠️ **WHY**: PLAN phase is requirements/design only. Implementation is EXEC phase responsibility.
- ✅ **DO**: Document implementation_approach in text. Describe what code should do, not how to write it.
- **Example Violation**: Creating \`src/components/NewFeature.tsx\` during PLAN phase
- **Handoff**: EXEC agent will implement based on your PRD
- **Frequency**: Common

#### NC-PLAN-002: No Premature Technology Decisions
- ❌ **DON'T**: Lock into specific libraries or tools without researching alternatives
- ⚠️ **WHY**: Technology choices should be made with codebase context, not assumptions
- ✅ **DO**: Document technology_stack options with pros/cons. Let EXEC choose with implementation context.
- **Example Violation**: Requiring "Use Zustand for state management" when codebase uses React Context
- **Frequency**: Occasional

### Exploration Requirements

#### NC-PLAN-003: No PRD Creation Without Codebase Exploration
- ❌ **DON'T**: Write PRD based on assumptions or feature description alone
- ⚠️ **WHY**: Leads to missed requirements, architecture mismatches, implementation gaps
- ✅ **DO**: Read ≥5 relevant files before writing PRD. Document findings in exploration_summary.
- **Example Violation**: Creating PRD for "Add user authentication" without reading existing auth code
- **Reference**: US-001 Discovery Gate enforces this requirement
- **Frequency**: Common (top PLAN anti-pattern)

### PRD Quality Standards

#### NC-PLAN-004: No Vague Acceptance Criteria
- ❌ **DON'T**: Write generic criteria like "Feature works correctly" or "User can access feature"
- ⚠️ **WHY**: Untestable criteria lead to implementation ambiguity and validation failures
- ✅ **DO**: Use Given-When-Then format with specific inputs, actions, and expected outputs
- **Example**:
  - ❌ BAD: "User can create venture"
  - ✅ GOOD: "Given user is authenticated AND on Ventures page, When user clicks 'Create Venture' AND fills required fields AND clicks Submit, Then venture is created in database AND user sees success message AND venture appears in list"
- **Frequency**: Common

#### NC-PLAN-005: No Missing Test Scenarios
- ❌ **DON'T**: Document only happy path scenarios, ignoring error cases and edge cases
- ⚠️ **WHY**: Incomplete test coverage leads to bugs in production and failed E2E tests
- ✅ **DO**: Include test_scenarios for: happy path (1+), error paths (2+), edge cases (1+)
- **Example Violation**: "User creates venture successfully" (no validation error scenario)
- **Reference**: test_scenarios field in PRD schema
- **Frequency**: Common

</negative_constraints>`
    },
    testing_scenarios: [
      { scenario: 'PLAN constraints section renders correctly', type: 'manual', priority: 'P1' },
      { scenario: 'All constraints are PLAN-specific (not general)', type: 'manual', priority: 'P1' },
      { scenario: 'Cross-references to US-001 and US-002 are valid', type: 'manual', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Negative Constraints Block - CLAUDE_EXEC.md Phase-Specific Anti-Patterns',
    user_role: 'EXEC Agent',
    user_want: 'EXEC-phase-specific negative constraints documenting prohibited behaviors during implementation',
    user_benefit: 'Clear boundaries prevent scope creep, requirement changes, and PRD modifications during EXEC phase',
    priority: 'high',
    story_points: 2,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'EXEC phase constraint coverage',
        given: 'CLAUDE_EXEC.md negative_constraints block is populated',
        when: 'Reviewing EXEC-specific anti-patterns',
        then: 'Includes constraints for: "No scope creep", "No modifying PRD during EXEC", "No skipping tests", "No direct DB changes", "No bypassing code review"'
      },
      {
        id: 'AC-005-2',
        scenario: 'Scope boundary constraint',
        given: 'Constraint NC-EXEC-001 documents scope boundary',
        when: 'EXEC agent reads constraint',
        then: 'States: ❌ DON\'T add features not in PRD functional_requirements AND ✅ DO implement exactly what PRD specifies, request PLAN revision if scope unclear'
      },
      {
        id: 'AC-005-3',
        scenario: 'PRD modification constraint',
        given: 'Constraint NC-EXEC-002 prohibits PRD changes',
        when: 'EXEC agent discovers requirement gap',
        then: 'States: ❌ DON\'T modify PRD during EXEC phase AND ✅ DO create handoff back to PLAN for requirement clarification AND provides handoff workflow'
      },
      {
        id: 'AC-005-4',
        scenario: 'Test coverage constraint',
        given: 'Constraint NC-EXEC-003 requires tests',
        when: 'EXEC agent implements feature',
        then: 'States: ❌ DON\'T skip E2E tests or mark "will add later" AND ✅ DO create E2E test for each user story before marking complete AND references e2e_test_path requirement'
      },
      {
        id: 'AC-005-5',
        scenario: 'Database change constraint',
        given: 'Constraint NC-EXEC-005 governs DB changes',
        when: 'EXEC agent needs schema change',
        then: 'States: ❌ DON\'T run manual SQL or bypass migrations AND ✅ DO create migration script in database/migrations/ AND test with rollback'
      }
    ],
    definition_of_done: [
      'CLAUDE_EXEC.md updated with <negative_constraints> section',
      'Minimum 8 EXEC-specific constraints documented',
      'Constraints follow standard format (❌ DON\'T / ⚠️ WHY / ✅ DO)',
      'References to E2E test requirements and handoff workflows',
      'Examples of scope creep vs legitimate implementation decisions',
      'Cross-links to CLAUDE_PLAN.md for requirement clarifications',
      'Markdown validation passes'
    ],
    technical_notes: 'EXEC-specific constraints prevent common implementation anti-patterns: scope creep, requirement changes mid-implementation, skipping tests, manual database changes. Edge cases: Bug discovered during EXEC that requires schema change (create migration, don\'t modify manually), PRD has conflicting requirements (handoff back to PLAN, don\'t interpret).',
    implementation_approach: 'Add <negative_constraints> section to CLAUDE_EXEC.md after implementation guidelines. Focus on: scope boundaries, PRD immutability, test requirements, database governance, code quality. Use same XML structure as CLAUDE_CORE.md and CLAUDE_PLAN.md.',
    implementation_context: 'FR-3 continuation: Phase-specific constraints for EXEC. Addresses common EXEC mistakes: scope creep, skipping tests, modifying requirements during implementation.',
    architecture_references: [
      'CLAUDE_EXEC.md - EXEC phase instructions (add negative_constraints block)',
      'CLAUDE_PLAN.md - PLAN constraints (cross-reference for requirement changes)',
      'scripts/modules/handoff/executors/ExecToPlanExecutor.js - EXEC→PLAN handoff for requirement clarifications',
      'database/migrations/ - Migration script location',
      'tests/e2e/ - E2E test location and naming convention'
    ],
    example_code_patterns: {
      exec_constraints: `## <negative_constraints phase="EXEC">

### Scope Management

#### NC-EXEC-001: No Scope Creep - Implement PRD Only
- ❌ **DON'T**: Add features, fields, or functionality not specified in PRD functional_requirements
- ⚠️ **WHY**: Scope creep causes timeline delays, untested code, and validation failures
- ✅ **DO**: Implement exactly what PRD specifies. If scope is unclear, create EXEC→PLAN handoff for clarification.
- **Example Violation**: Adding "user profile picture upload" when PRD only specifies "user profile creation"
- **Handoff**: Use \`node scripts/handoff.js --from EXEC --to PLAN\` for requirement questions
- **Frequency**: Very Common (top EXEC anti-pattern)

#### NC-EXEC-002: No Modifying PRD During Implementation
- ❌ **DON'T**: Update PRD functional_requirements, acceptance_criteria, or test_scenarios during EXEC phase
- ⚠️ **WHY**: PRD is approved contract. Changes require PLAN review and validation.
- ✅ **DO**: Document implementation notes in deliverables table. Request PRD revision via handoff if needed.
- **Example Violation**: Updating PRD acceptance_criteria because implementation revealed edge case
- **Correct Flow**: EXEC→PLAN handoff → PLAN updates PRD → PLAN→EXEC handoff with revised PRD
- **Frequency**: Occasional

### Testing Requirements

#### NC-EXEC-003: No Skipping E2E Tests
- ❌ **DON'T**: Mark user story complete without E2E test or with "TODO: Add test later"
- ⚠️ **WHY**: E2E tests are required for EXEC→PLAN handoff validation. Skipping blocks completion.
- ✅ **DO**: Create E2E test for each user story. Update e2e_test_path in user_stories table.
- **Example Violation**: Implementing US-001 feature without tests/e2e/US-001-*.spec.ts
- **Reference**: US-001 from SD-VIF-INTEL-001 mapping requirement
- **Frequency**: Common

#### NC-EXEC-004: No Manual Testing Only
- ❌ **DON'T**: Rely on manual browser testing without automated E2E test
- ⚠️ **WHY**: Manual testing is not repeatable, not auditable, and doesn't prevent regressions
- ✅ **DO**: Create Playwright E2E test that covers all acceptance criteria. Manual testing is supplement only.
- **Example**: Test must programmatically verify "success message shown" not just "I saw it work"
- **Frequency**: Occasional

### Database Governance

#### NC-EXEC-005: No Manual Database Changes
- ❌ **DON'T**: Run raw SQL via Supabase dashboard or psql to modify schema/data
- ⚠️ **WHY**: No audit trail, no rollback, bypasses constraints and validation
- ✅ **DO**: Create migration script in database/migrations/ for schema changes. Use process scripts for data changes.
- **Example Violation**: \`ALTER TABLE ventures ADD COLUMN new_field TEXT\` (should be migration)
- **Correct**: Create database/migrations/20251212_add_venture_new_field.sql
- **Frequency**: Occasional

</negative_constraints>`
    },
    testing_scenarios: [
      { scenario: 'EXEC constraints section renders correctly', type: 'manual', priority: 'P1' },
      { scenario: 'All constraints are EXEC-specific', type: 'manual', priority: 'P1' },
      { scenario: 'Handoff workflow references are accurate', type: 'manual', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Self-Critique Pre-Flight - Agent Confidence Scoring Before Handoffs',
    user_role: 'Handoff System',
    user_want: 'Prompt agents for self-assessment (confidence score, gaps, assumptions) before handoff validation',
    user_benefit: 'Surfaces issues early through agent reflection, reducing validation failures and improving handoff quality',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - High confidence self-critique',
        given: 'Agent initiates handoff via HandoffOrchestrator',
        when: 'Orchestrator prompts for self-critique before validation',
        then: 'Agent provides: confidence_score (1-10), identified_gaps (array), assumptions_made (array) AND confidence_score ≥7 AND handoff proceeds to validation'
      },
      {
        id: 'AC-006-2',
        scenario: 'Low confidence triggers additional validation',
        given: 'Agent provides self-critique with confidence_score = 5',
        when: 'Orchestrator evaluates confidence',
        then: 'Additional validation questions prompted: "What specific areas are you uncertain about?", "What additional exploration would help?", "Should this handoff be delayed?" AND responses stored in handoff_records.metadata.self_critique'
      },
      {
        id: 'AC-006-3',
        scenario: 'Self-critique format validation',
        given: 'Agent submits self-critique',
        when: 'Orchestrator validates format',
        then: 'Required fields: confidence_score (1-10), identified_gaps (string[]), assumptions_made (string[]) AND optional: uncertainty_areas, additional_exploration_needed AND error if format invalid'
      },
      {
        id: 'AC-006-4',
        scenario: 'Self-critique storage for retrospectives',
        given: 'Self-critique is collected',
        when: 'Handoff is created in database',
        then: 'Self-critique stored in handoff_records.metadata.self_critique for audit AND available for retrospective analysis AND queryable for pattern detection'
      },
      {
        id: 'AC-006-5',
        scenario: 'Self-critique prompts are phase-specific',
        given: 'Handoff is PLAN→EXEC',
        when: 'Self-critique is prompted',
        then: 'Prompts include PLAN-specific questions: "Is exploration comprehensive?", "Are all FRs testable?", "Is PRD complete?" AND different prompts for EXEC→PLAN: "Are all tests passing?", "Is implementation complete?", "Are deliverables documented?"'
      }
    ],
    definition_of_done: [
      'HandoffOrchestrator.js updated with self-critique prompt before validation',
      'Self-critique schema defined: confidence_score, identified_gaps, assumptions_made',
      'Low confidence (<7) triggers additional validation questions',
      'Self-critique stored in handoff_records.metadata.self_critique',
      'Phase-specific prompts for PLAN→EXEC, EXEC→PLAN, PLAN→LEAD',
      'Unit tests for self-critique validation pass',
      'Integration test: Handoff with low confidence shows additional questions'
    ],
    technical_notes: 'Self-critique leverages agent reflection capabilities to surface issues before formal validation. Based on "Vibe Coding" research showing self-critique improves output quality. Edge cases: Agent always scores high confidence (pattern detection), agent provides vague gaps (prompt for specificity), agent skips self-critique (make required), self-critique conflicts with validation results (both are valuable).',
    implementation_approach: 'Add promptSelfCritique() method to HandoffOrchestrator before executeHandoff(). Prompt agent for confidence score and reflection. Store in handoff_records.metadata. If confidence <7, prompt follow-up questions. Continue to validation regardless (self-critique is informational, not blocking).',
    implementation_context: 'FR-4: Quality improvement through agent reflection. Surfaces uncertainty and gaps early, improving handoff quality. Provides data for retrospectives on agent confidence vs actual outcomes.',
    architecture_references: [
      'scripts/modules/handoff/HandoffOrchestrator.js - Handoff orchestration (add self-critique prompt)',
      'Database: handoff_records.metadata - Store self-critique (JSONB)',
      'scripts/handoff.js - CLI entry point for manual handoffs',
      'Database: governance_audit_log - Audit trail for self-critiques',
      'lib/retrospective-analysis.js - Analyze self-critique patterns (future enhancement)'
    ],
    example_code_patterns: {
      self_critique_prompt: `// In HandoffOrchestrator.js
async promptSelfCritique(fromPhase, toPhase) {
  console.log('\\n--- Self-Critique Pre-Flight Check ---');
  console.log('Before proceeding with validation, please assess your work:\\n');

  const prompts = this.getPhaseSpecificPrompts(fromPhase, toPhase);

  console.log('Phase-Specific Reflection:');
  prompts.forEach((prompt, idx) => {
    console.log(\`  \${idx + 1}. \${prompt}\`);
  });

  console.log('\\nProvide self-critique (JSON format):');
  console.log('{');
  console.log('  "confidence_score": 8,  // 1-10 (1=very uncertain, 10=very confident)');
  console.log('  "identified_gaps": ["Missing edge case for X", "Unclear requirement Y"],');
  console.log('  "assumptions_made": ["Assumed Z based on codebase pattern"],');
  console.log('  "uncertainty_areas": ["Not sure about performance impact"]  // optional');
  console.log('}\\n');

  // In automated flow, this would be agent response
  // In manual flow, this prompts human/agent for input
  const selfCritique = await this.collectSelfCritique();

  return selfCritique;
}`,
      phase_specific_prompts: `getPhaseSpecificPrompts(fromPhase, toPhase) {
  const promptMap = {
    'PLAN_TO_EXEC': [
      'Is codebase exploration comprehensive (≥5 files with documented findings)?',
      'Are all functional requirements testable and complete?',
      'Is PRD complete with no "TBD" or "TODO" sections?',
      'Are acceptance criteria specific with Given-When-Then format?',
      'Are all assumptions documented and validated?'
    ],
    'EXEC_TO_PLAN': [
      'Are all E2E tests passing (not skipped or marked TODO)?',
      'Is implementation scope exactly what PRD specified (no scope creep)?',
      'Are all deliverables documented with evidence?',
      'Are there any known bugs or edge cases not addressed?',
      'Is rollback tested (can changes be reverted cleanly)?'
    ],
    'PLAN_TO_LEAD': [
      'Is PRD complete and ready for final approval?',
      'Are all PLAN verification sub-agents run with passing results?',
      'Are test strategies defined for all user stories?',
      'Is implementation approach validated against architecture?',
      'Are all dependencies and risks documented?'
    ]
  };

  const key = \`\${fromPhase}_TO_\${toPhase}\`;
  return promptMap[key] || [
    'Is your work complete and ready for handoff?',
    'What gaps or uncertainties remain?',
    'What assumptions did you make?'
  ];
}`,
      self_critique_validation: `async validateSelfCritique(selfCritique) {
  const errors = [];

  // Required fields
  if (!selfCritique.confidence_score) {
    errors.push('confidence_score is required (1-10)');
  }

  if (selfCritique.confidence_score < 1 || selfCritique.confidence_score > 10) {
    errors.push('confidence_score must be between 1 and 10');
  }

  if (!Array.isArray(selfCritique.identified_gaps)) {
    errors.push('identified_gaps must be array of strings');
  }

  if (!Array.isArray(selfCritique.assumptions_made)) {
    errors.push('assumptions_made must be array of strings');
  }

  if (errors.length > 0) {
    throw new Error(\`Self-critique validation failed:\\n\${errors.join('\\n')}\`);
  }

  // Low confidence follow-up
  if (selfCritique.confidence_score < 7) {
    console.warn('\\n⚠️  Low confidence detected. Additional validation recommended.\\n');

    const followUp = await this.promptLowConfidenceFollowUp(selfCritique);
    selfCritique.low_confidence_follow_up = followUp;
  }

  return selfCritique;
}`,
      storage_in_handoff: `// Store self-critique in handoff_records
const handoffRecord = await supabase
  .from('handoff_records')
  .insert({
    sd_id: sdId,
    from_phase: fromPhase,
    to_phase: toPhase,
    status: 'pending',
    metadata: {
      self_critique: {
        confidence_score: selfCritique.confidence_score,
        identified_gaps: selfCritique.identified_gaps,
        assumptions_made: selfCritique.assumptions_made,
        uncertainty_areas: selfCritique.uncertainty_areas || [],
        timestamp: new Date().toISOString()
      }
    }
  })
  .select()
  .single();`
    },
    testing_scenarios: [
      { scenario: 'Self-critique prompt displays before validation', type: 'integration', priority: 'P0' },
      { scenario: 'Low confidence (<7) triggers follow-up questions', type: 'unit', priority: 'P1' },
      { scenario: 'Self-critique stored in handoff_records.metadata', type: 'integration', priority: 'P1' },
      { scenario: 'Phase-specific prompts shown for different handoffs', type: 'unit', priority: 'P1' },
      { scenario: 'Invalid self-critique format rejected', type: 'unit', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-LEO-GEMINI-001:US-007',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'PRD Template Scaffolding - Skeleton Structure in CLAUDE_PLAN.md',
    user_role: 'PLAN Agent',
    user_want: 'PRD template with section headers, guiding questions, and field requirements in CLAUDE_PLAN.md',
    user_benefit: 'Reduces cognitive load during PRD creation, ensures completeness, and provides clear guidance on what to write in each section',
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'PRD scaffold structure',
        given: 'CLAUDE_PLAN.md contains PRD template section',
        when: 'PLAN agent reads template',
        then: 'Template includes section headers for: executive_summary, business_context, technical_context, functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, implementation_approach AND each section has 2-3 guiding questions'
      },
      {
        id: 'AC-007-2',
        scenario: 'Guiding questions for each section',
        given: 'PRD template section for functional_requirements',
        when: 'Agent reads guiding questions',
        then: 'Questions include: "What must the system DO (not how)?", "What are user-facing behaviors?", "What are measurable acceptance criteria for each FR?" AND questions prompt thinking without prescribing answers'
      },
      {
        id: 'AC-007-3',
        scenario: 'Field requirement references',
        given: 'PRD template documents required fields',
        when: 'Agent reviews requirements',
        then: 'Template references prd-schema-validator.js constraints: "functional_requirements minimum 3 items", "acceptance_criteria required for each FR", "test_scenarios minimum 1" AND links to validation script'
      },
      {
        id: 'AC-007-4',
        scenario: 'Example snippets for complex fields',
        given: 'PRD template includes examples',
        when: 'Agent needs format guidance',
        then: 'Examples provided for: functional_requirements JSONB structure, acceptance_criteria with Given-When-Then, test_scenarios array AND examples are copy-paste-ready with placeholder values'
      },
      {
        id: 'AC-007-5',
        scenario: 'Template completeness checklist',
        given: 'PRD template includes checklist',
        when: 'Agent finishes PRD',
        then: 'Checklist includes: "All required fields populated?", "Minimum 3 FRs defined?", "All FRs have acceptance criteria?", "Test scenarios cover happy path + errors + edge cases?", "Implementation approach is text-only (no code)?"'
      }
    ],
    definition_of_done: [
      'CLAUDE_PLAN.md updated with PRD Template Scaffolding section',
      'Section headers for all 8+ major PRD fields',
      'Guiding questions (2-3) for each section',
      'Field requirements referenced from prd-schema-validator.js',
      'Example snippets for functional_requirements, acceptance_criteria, test_scenarios',
      'PRD completeness checklist with 5+ items',
      'Template is copy-paste ready (markdown code blocks)',
      'Markdown validation passes'
    ],
    technical_notes: 'PRD scaffolding reduces cognitive load by providing structure and prompts. Based on "Vibe Coding" research that scaffolds improve quality and speed. Edge cases: Template becomes outdated when schema changes (link to validator), agent copies template without customizing (emphasize "adapt to context"), template is too prescriptive (balance guidance with flexibility).',
    implementation_approach: 'Add "PRD Template Scaffolding" section to CLAUDE_PLAN.md after PRD creation instructions. Include collapsible details for each section to avoid overwhelming. Reference prd-schema-validator.js for authoritative requirements. Provide examples with clear placeholders.',
    implementation_context: 'FR-5: Reduces cognitive load for PLAN agents creating PRDs. Ensures completeness and consistency across PRDs. Complements discovery gate (US-001) and exploration audit (US-002) by guiding what to document.',
    architecture_references: [
      'CLAUDE_PLAN.md - PLAN phase instructions (add PRD template section)',
      'lib/prd-schema-validator.js - PRD validation rules (reference for field requirements)',
      'scripts/add-prd-to-database.js - PRD creation script',
      'Database: product_requirements_v2 schema - All PRD fields',
      'docs/reference/schema/engineer/tables/product_requirements_v2.md - Schema documentation'
    ],
    example_code_patterns: {
      prd_template_section: `## PRD Template Scaffolding

Use this template as a starting point for creating Product Requirements Documents. Adapt each section to your specific Strategic Directive.

### Required Fields Reference

See \`lib/prd-schema-validator.js\` for validation rules:
- **functional_requirements**: Minimum 3 items (checked by \`functional_requirements_min_count\`)
- **acceptance_criteria**: Minimum 1 item per PRD (checked by \`acceptance_criteria_required\`)
- **test_scenarios**: Minimum 1 item (checked by \`test_scenarios_required\`)

---

### 1. Executive Summary

**Guiding Questions**:
- What is this feature/enhancement in 2-3 sentences?
- Why does it matter (business value)?
- What is the expected impact (metrics, user benefit)?

**Format**: 2-3 paragraphs of text

**Example**:
\`\`\`
This PRD defines a discovery gate that requires PLAN agents to explore ≥5 codebase
files before creating a PRD. This prevents "hallucinated requirements" where agents
write PRDs based on assumptions rather than actual codebase understanding.

Expected impact: 30% reduction in PRD revision cycles, fewer "missed requirements"
issues in EXEC phase, and improved first-pass quality scores.
\`\`\`

---

### 2. Functional Requirements

**Guiding Questions**:
- What must the system DO (actions, behaviors)?
- What are user-facing capabilities?
- What are measurable acceptance criteria for each requirement?

**Format**: JSONB array of objects

**Example**:
\`\`\`json
[
  {
    "id": "FR-1",
    "requirement": "Discovery Gate - Mandatory Exploration Before PRD Creation",
    "description": "Add validation to phase-preflight.js that requires ≥5 file reads before allowing PRD creation.",
    "priority": "CRITICAL",
    "acceptance_criteria": [
      "phase-preflight.js checks exploration_log for ≥5 unique file reads",
      "Gate blocks PRD creation if threshold not met",
      "Exploration log tracks: file paths, read timestamps, read counts"
    ]
  },
  {
    "id": "FR-2",
    "requirement": "Exploration Audit - PLAN→EXEC Gate Validation",
    "description": "Add validation to PLAN→EXEC handoff that audits exploration performed during PLAN phase.",
    "priority": "CRITICAL",
    "acceptance_criteria": [
      "PlanToExecExecutor validates exploration_summary field exists",
      "Exploration summary must reference ≥3 specific files",
      "Handoff fails with clear error if threshold not met"
    ]
  }
]
\`\`\`

---

### 3. Test Scenarios

**Guiding Questions**:
- What are happy path scenarios (expected success)?
- What are error path scenarios (validation, failures)?
- What are edge cases (boundary conditions, rare cases)?

**Format**: JSONB array of objects

**Example**:
\`\`\`json
[
  {
    "id": "TS-001",
    "scenario": "Happy path - Discovery gate passes with sufficient exploration",
    "test_type": "unit",
    "expected_result": "PRD creation proceeds when ≥5 files explored",
    "priority": "P0"
  },
  {
    "id": "TS-002",
    "scenario": "Error path - Discovery gate blocks insufficient exploration",
    "test_type": "unit",
    "expected_result": "PRD creation blocked with actionable error when <5 files",
    "priority": "P0"
  },
  {
    "id": "TS-003",
    "scenario": "Edge case - Bypass with --skip-discovery flag",
    "test_type": "integration",
    "expected_result": "Gate bypassed with reason logged",
    "priority": "P1"
  }
]
\`\`\`

---

### 4. Implementation Approach

**Guiding Questions**:
- What is the step-by-step approach (text description, not code)?
- What existing patterns should EXEC follow?
- What files/components will be modified?

**Format**: Text (markdown)

**Example**:
\`\`\`
1. Add pre-validation hook to add-prd-to-database.js before PRD insertion
2. Create exploration log tracker that records Read tool usage during PLAN phase
3. Store exploration log in PRD metadata.exploration_log field (JSONB)
4. Implement --skip-discovery flag with required --reason parameter
5. Add validation error messages with actionable guidance
6. Write unit tests for discovery gate validation
\`\`\`

---

### PRD Completeness Checklist

Before submitting PRD, verify:

- [ ] Executive summary answers: What, Why, Impact
- [ ] Minimum 3 functional requirements defined
- [ ] Each FR has acceptance criteria (specific, measurable)
- [ ] Test scenarios cover: happy path (1+), error paths (2+), edge cases (1+)
- [ ] Implementation approach is text-only (no code)
- [ ] Technical requirements specify constraints/technologies
- [ ] Acceptance criteria use Given-When-Then format where applicable
- [ ] All "TBD" or "TODO" sections resolved
- [ ] Exploration summary documents ≥5 files with findings (US-001 requirement)

---

### Validation

Run validation before creating PRD:
\`\`\`bash
node lib/prd-schema-validator.js <prd-data.json>
\`\`\`

Common validation failures:
- "functional_requirements_min_count": Need ≥3 functional requirements
- "acceptance_criteria_required": Missing acceptance_criteria field
- "test_scenarios_required": Missing test_scenarios field
`
    },
    testing_scenarios: [
      { scenario: 'PRD template section renders correctly in CLAUDE_PLAN.md', type: 'manual', priority: 'P1' },
      { scenario: 'All major PRD fields have scaffolding', type: 'manual', priority: 'P1' },
      { scenario: 'Example JSON snippets are valid', type: 'unit', priority: 'P2' },
      { scenario: 'Checklist items align with prd-schema-validator.js', type: 'manual', priority: 'P2' }
    ],
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log('📋 Creating user stories for SD-LEO-GEMINI-001...\n');

  // Check if stories already exist
  const { data: existing, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('❌ Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('⚠️  User stories already exist for this SD:');
    existing.forEach(s => console.log('   -', s.story_key));
    console.log('\n💡 To recreate, first delete existing stories:');
    console.log(`   DELETE FROM user_stories WHERE sd_id = '${SD_ID}';`);
    process.exit(0);
  }

  // Insert stories
  const { data: inserted, error: insertError } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (insertError) {
    console.error('❌ Error inserting user stories:', insertError.message);
    console.error('   Details:', insertError);
    process.exit(1);
  }

  console.log('✅ Successfully created', inserted.length, 'user stories:\n');

  let totalPoints = 0;
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  inserted.forEach(story => {
    console.log(`   ${story.story_key}: ${story.title}`);
    console.log(`     Priority: ${story.priority} | Points: ${story.story_points}`);
    console.log(`     AC Count: ${story.acceptance_criteria?.length || 0}`);
    console.log('');
    totalPoints += story.story_points || 0;
    priorityCounts[story.priority] = (priorityCounts[story.priority] || 0) + 1;
  });

  console.log('--- Summary ---');
  console.log(`Total Stories: ${inserted.length}`);
  console.log(`Total Story Points: ${totalPoints}`);
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}`);

  console.log('\n--- Priority Breakdown ---');
  console.log(`  Critical: ${priorityCounts.critical} stories`);
  console.log(`  High: ${priorityCounts.high} stories`);
  console.log(`  Medium: ${priorityCounts.medium} stories`);
  console.log(`  Low: ${priorityCounts.low} stories`);

  console.log('\n--- Functional Requirement Mapping ---');
  console.log('  FR-1 (Discovery Gate) → US-001');
  console.log('  FR-2 (Exploration Audit) → US-002');
  console.log('  FR-3 (Negative Constraints CORE) → US-003');
  console.log('  FR-3 (Negative Constraints PLAN) → US-004');
  console.log('  FR-3 (Negative Constraints EXEC) → US-005');
  console.log('  FR-4 (Self-Critique) → US-006');
  console.log('  FR-5 (PRD Template) → US-007');

  console.log('\n--- Implementation Order (Recommended) ---');
  console.log('  1. US-007 (PRD Template) - Documentation foundation');
  console.log('  2. US-003, US-004, US-005 (Negative Constraints) - Documentation (parallel)');
  console.log('  3. US-001 (Discovery Gate) - Validation gate in add-prd-to-database.js');
  console.log('  4. US-002 (Exploration Audit) - Validation gate in PlanToExecExecutor');
  console.log('  5. US-006 (Self-Critique) - Handoff enhancement');

  console.log('\n--- INVEST Quality Check ---');
  console.log('  ✅ Independent - Each story targets different component/phase');
  console.log('  ✅ Negotiable - Thresholds (5 files, 3 files, confidence 7) can be tuned');
  console.log('  ✅ Valuable - Each reduces PRD revision cycles and improves quality');
  console.log('  ✅ Estimable - Story points assigned (2-5 points)');
  console.log('  ✅ Small - All stories completable in 1-2 days');
  console.log('  ✅ Testable - Given-When-Then acceptance criteria for validation gates');

  console.log('\n--- Context Engineering (BMAD Enhancement) ---');
  console.log('  ✅ Architecture references provided for all stories');
  console.log('  ✅ Example code patterns included (validation gates, templates)');
  console.log('  ✅ Testing scenarios defined (unit, integration, manual, e2e)');
  console.log('  ✅ Implementation approach specified');
  console.log('  ✅ Edge cases documented');

  console.log('\n--- Expected Impact ---');
  console.log('  📉 Reduced PRD revision cycles (30% reduction target)');
  console.log('  📉 Fewer "missed requirements" issues in EXEC phase');
  console.log('  📈 Improved first-pass quality scores from validation');
  console.log('  📈 Better handoff quality through self-critique');
  console.log('  📖 Clearer agent guidance through negative constraints');

  console.log('\n--- Next Steps ---');
  console.log('1. Review stories in database or via query');
  console.log('2. Verify PRD-SD-LEO-GEMINI-001 exists and is complete');
  console.log('3. Implement in recommended order (documentation first, then gates)');
  console.log('4. Test discovery gate blocks PRD creation with <5 files');
  console.log('5. Test exploration audit blocks handoff with <3 files');
  console.log('6. Validate self-critique appears in handoff flow');
}

addUserStories().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
