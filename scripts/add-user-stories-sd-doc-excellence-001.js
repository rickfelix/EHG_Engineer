#!/usr/bin/env node
/**
 * Add User Stories for SD-DOC-EXCELLENCE-001
 * Documentation Excellence Initiative - Comprehensive Cleanup & Gap Resolution
 *
 * Creates user stories for comprehensive documentation improvement initiative.
 *
 * Functional Requirements Mapping:
 * - FR-1: Version consistency (v4.3.3 enforcement) → US-001
 * - FR-2: Database-first compliance verification → US-002
 * - FR-3: Root-level cleanup (43+ files → ≤10) → US-003
 * - FR-4: Navigation indexes creation → US-004
 * - FR-5: Directory consolidation (57 → ≤20) → US-005
 * - FR-6: Broken link fixes → US-006
 *
 * Context:
 * Documentation health score regressed from 75/100 to 65/100 with critical issues:
 * - Version inconsistency across 6+ files
 * - File-based SDs/PRDs violating database-first principle
 * - 53 root-level files making navigation difficult
 * - ~10% broken cross-references
 * - Missing indexes for 60+ guides and 70+ references
 *
 * Expected Outcome:
 * - Documentation health score ≥85/100
 * - New developer navigation time <5 minutes (currently 15-20 min)
 * - 100% version consistency with LEO Protocol v4.3.3
 * - Complete database-first compliance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-DOC-EXCELLENCE-001';
const PRD_ID = 'PRD-SD-DOC-EXCELLENCE-001';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Update all documentation to reference LEO Protocol v4.3.3 consistently',
    user_role: 'Developer',
    user_want: 'All documentation references the current LEO Protocol version (v4.3.3) consistently',
    user_benefit: 'Avoid confusion from outdated version references and ensure accurate protocol implementation',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Version consistency - All outdated references removed',
        given: 'Documentation contains references to v3.x, v4.0, v4.1, v4.2',
        when: 'Documentation cleanup is executed',
        then: 'grep -r "v4.[0-2]" docs/ returns 0 results AND grep -r "v3\\." docs/ returns 0 results (excluding archive/)'
      },
      {
        id: 'AC-001-2',
        scenario: 'CLAUDE*.md files updated',
        given: 'CLAUDE*.md files are the primary protocol documentation',
        when: 'Version update is complete',
        then: 'All CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md reference v4.3.3 AND include correct protocol ID: leo-v4-3-3-ui-parity'
      },
      {
        id: 'AC-001-3',
        scenario: 'Protocol guides updated',
        given: 'Protocol guides document LEO workflow',
        when: 'Version update is complete',
        then: 'docs/03_protocols_and_standards/ files reference v4.3.3 AND DOCUMENTATION_MAP.md shows v4.3.3 as current version'
      },
      {
        id: 'AC-001-4',
        scenario: 'Version validation script',
        given: 'Need to prevent future version drift',
        when: 'Validation is run',
        then: 'Version validation script created that checks for outdated version references AND exits with error if found'
      },
      {
        id: 'AC-001-5',
        scenario: 'Archive outdated versions',
        given: 'Old version documentation may have historical value',
        when: 'Cleanup is performed',
        then: 'Outdated version documentation moved to docs/archive/ with clear version labels'
      }
    ],
    definition_of_done: [
      'All v3.x, v4.0, v4.1, v4.2 references removed from active docs',
      'All CLAUDE*.md files reference v4.3.3',
      'Protocol guides reference v4.3.3',
      'Version validation script created',
      'Outdated docs archived with version labels',
      'grep validation passes (0 outdated references)',
      'Git commit with clear version update message',
      'Updated files listed in commit message'
    ],
    technical_notes: 'Use grep -r to find all version references. Update protocol ID to leo-v4-3-3-ui-parity. Archive old versions to docs/archive/. Create validation script for future CI/CD integration.',
    implementation_approach: '1. Find all version references: grep -rn "v4\\.[0-2]\\|v3\\." docs/ --include="*.md" > version_audit.txt. 2. Review each file and update to v4.3.3. 3. Update CLAUDE*.md files with correct protocol ID. 4. Move outdated docs to archive/. 5. Create version validation script. 6. Run validation to confirm.',
    implementation_context: 'This is critical for protocol accuracy. New developers following outdated version docs will implement incorrect workflows. Version consistency is foundation for documentation health score improvement (target: 85+/100).',
    architecture_references: [
      'CLAUDE.md - Main protocol documentation',
      'CLAUDE_CORE.md - Core protocol definitions',
      'CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md - Phase-specific docs',
      'docs/03_protocols_and_standards/ - Protocol guides',
      'docs/DOCUMENTATION_MAP.md - Documentation index'
    ],
    example_code_patterns: {
      grep_search: `# Find all outdated version references
grep -rn "v4\\.[0-2]\\|v3\\." docs/ --include="*.md" --exclude-dir=archive > version_audit.txt

# Verify specific version references
grep -r "LEO Protocol v4\\.3\\.3" docs/CLAUDE*.md

# Find protocol ID references
grep -r "leo-v4-" docs/ --include="*.md"`,
      validation_script: `#!/bin/bash
# scripts/validate-documentation-version.sh
# Validates all documentation references current LEO Protocol version

CURRENT_VERSION="v4.3.3"
CURRENT_PROTOCOL_ID="leo-v4-3-3-ui-parity"

echo "Validating documentation version consistency..."

# Check for outdated version references (excluding archive/)
OUTDATED=$(grep -r "v4\\.[0-2]\\|v3\\." docs/ --include="*.md" --exclude-dir=archive)

if [ ! -z "$OUTDATED" ]; then
  echo "❌ ERROR: Outdated version references found:"
  echo "$OUTDATED"
  exit 1
fi

# Verify CLAUDE*.md files reference current version
for file in CLAUDE.md CLAUDE_CORE.md CLAUDE_LEAD.md CLAUDE_PLAN.md CLAUDE_EXEC.md; do
  if ! grep -q "$CURRENT_VERSION" "$file"; then
    echo "❌ ERROR: $file does not reference $CURRENT_VERSION"
    exit 1
  fi
done

echo "✅ All documentation references current version: $CURRENT_VERSION"
exit 0`
    },
    testing_scenarios: [
      { scenario: 'Grep validation for outdated versions', type: 'validation', priority: 'P0' },
      { scenario: 'CLAUDE*.md files reference v4.3.3', type: 'validation', priority: 'P0' },
      { scenario: 'Protocol ID consistency check', type: 'validation', priority: 'P1' },
      { scenario: 'Validation script execution', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: null, // Documentation SD - no E2E tests required
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Verify database-first compliance and remove file-based strategic data',
    user_role: 'Operations',
    user_want: 'Strategic directives, PRDs, and handoffs stored exclusively in database (not markdown files)',
    user_benefit: 'Single source of truth for strategic data, preventing data drift and synchronization issues',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Database verification - All strategic data exists',
        given: 'File-based directories exist: docs/strategic-directives/, docs/product-requirements/, docs/handoffs/',
        when: 'Database query is executed',
        then: 'strategic_directives_v2 table contains all SDs from files AND product_requirements_v2 table contains all PRDs from files AND sd_phase_handoffs table contains all handoffs from files'
      },
      {
        id: 'AC-002-2',
        scenario: 'Backup creation before deletion',
        given: 'File-based directories will be removed',
        when: 'Backup is created',
        then: 'Archive created at docs/archive/strategic-data-backup-YYYY-MM-DD/ with complete copies of directories AND backup includes verification report'
      },
      {
        id: 'AC-002-3',
        scenario: 'File directories removed',
        given: 'Database verification passed AND backup created',
        when: 'Cleanup is executed',
        then: 'docs/strategic-directives/ directory does not exist AND docs/product-requirements/ directory does not exist AND docs/handoffs/ directory does not exist'
      },
      {
        id: 'AC-002-4',
        scenario: 'Documentation updated to reference database',
        given: 'File-based references exist in documentation',
        when: 'Documentation is updated',
        then: 'All references point to database queries (SELECT FROM strategic_directives_v2) AND no references to markdown files in removed directories'
      },
      {
        id: 'AC-002-5',
        scenario: 'Database-first validation script',
        given: 'Need to prevent future file-based violations',
        when: 'Validation script is created',
        then: 'Script checks for strategic-directives/, product-requirements/, handoffs/ directories AND exits with error if found'
      }
    ],
    definition_of_done: [
      'Database verification query executed and documented',
      'All strategic data confirmed in database',
      'Backup created in docs/archive/',
      'docs/strategic-directives/ removed',
      'docs/product-requirements/ removed',
      'docs/handoffs/ removed',
      'Documentation updated to reference database',
      'Database-first validation script created',
      'Git commit with verification report',
      'Backup includes count comparison (files vs DB rows)'
    ],
    technical_notes: 'Query strategic_directives_v2, product_requirements_v2, sd_phase_handoffs tables to verify all data exists. Create comprehensive backup before deletion. Update all documentation references to use database queries instead of file paths.',
    implementation_approach: '1. Query database for SD/PRD/handoff counts. 2. Compare with file counts in directories. 3. Generate verification report. 4. Create timestamped backup in archive/. 5. Update documentation references. 6. Remove directories. 7. Create validation script. 8. Commit with verification evidence.',
    implementation_context: 'This is critical database-first enforcement. File-based strategic data violates core protocol principle and causes synchronization issues. Must verify database completeness before deletion to prevent data loss.',
    architecture_references: [
      'database/schema/strategic_directives_v2.sql - SD table schema',
      'database/schema/product_requirements_v2.sql - PRD table schema',
      'database/schema/sd_phase_handoffs.sql - Handoff table schema',
      'docs/02_api/14_development_preparation.md - Database-first guidelines',
      'CLAUDE_CORE.md - Database-first principle documentation'
    ],
    example_code_patterns: {
      verification_query: `-- scripts/verify-database-first-compliance.sql
-- Verify all strategic data exists in database

-- Count strategic directives
SELECT
  COUNT(*) as sd_count,
  COUNT(DISTINCT status) as status_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM strategic_directives_v2;

-- Count PRDs
SELECT
  COUNT(*) as prd_count,
  COUNT(DISTINCT status) as status_count
FROM product_requirements_v2;

-- Count handoffs
SELECT
  COUNT(*) as handoff_count,
  COUNT(DISTINCT from_phase) as from_phases,
  COUNT(DISTINCT to_phase) as to_phases
FROM sd_phase_handoffs;

-- List all SDs for verification
SELECT id, sd_key, title, status, phase
FROM strategic_directives_v2
ORDER BY created_at DESC;`,
      verification_script: `#!/usr/bin/env node
// scripts/verify-database-first-compliance.js
// Verifies all strategic data in database before removing file directories

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabaseFirst() {
  console.log('🔍 Verifying database-first compliance...\\n');

  // Count database records
  const { count: sdCount } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true });

  const { count: prdCount } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true });

  const { count: handoffCount } = await supabase
    .from('sd_phase_handoffs')
    .select('*', { count: 'exact', head: true });

  console.log('📊 Database Records:');
  console.log(\`   Strategic Directives: \${sdCount}\`);
  console.log(\`   PRDs: \${prdCount}\`);
  console.log(\`   Handoffs: \${handoffCount}\\n\`);

  // Count file-based records (if directories exist)
  const sdDir = 'docs/strategic-directives';
  const prdDir = 'docs/product-requirements';
  const handoffDir = 'docs/handoffs';

  let sdFileCount = 0, prdFileCount = 0, handoffFileCount = 0;

  if (fs.existsSync(sdDir)) {
    sdFileCount = fs.readdirSync(sdDir).filter(f => f.endsWith('.md')).length;
  }
  if (fs.existsSync(prdDir)) {
    prdFileCount = fs.readdirSync(prdDir).filter(f => f.endsWith('.md')).length;
  }
  if (fs.existsSync(handoffDir)) {
    handoffFileCount = fs.readdirSync(handoffDir).filter(f => f.endsWith('.md')).length;
  }

  console.log('📁 File-Based Records:');
  console.log(\`   Strategic Directives: \${sdFileCount}\`);
  console.log(\`   PRDs: \${prdFileCount}\`);
  console.log(\`   Handoffs: \${handoffFileCount}\\n\`);

  // Verification
  const verified = sdCount >= sdFileCount &&
                   prdCount >= prdFileCount &&
                   handoffCount >= handoffFileCount;

  if (verified) {
    console.log('✅ Database-first compliance verified');
    console.log('   All file-based data exists in database');
    console.log('   Safe to remove file directories\\n');
    return true;
  } else {
    console.log('❌ Database-first compliance verification FAILED');
    console.log('   Database may be missing records from files');
    console.log('   DO NOT remove file directories\\n');
    return false;
  }
}

verifyDatabaseFirst().then(verified => {
  process.exit(verified ? 0 : 1);
});`,
      validation_script: `#!/bin/bash
# scripts/validate-database-first.sh
# Prevents file-based strategic data directories

echo "Validating database-first compliance..."

VIOLATIONS=""

if [ -d "docs/strategic-directives" ]; then
  VIOLATIONS="${VIOLATIONS}docs/strategic-directives/ directory exists\\n"
fi

if [ -d "docs/product-requirements" ]; then
  VIOLATIONS="${VIOLATIONS}docs/product-requirements/ directory exists\\n"
fi

if [ -d "docs/handoffs" ]; then
  VIOLATIONS="${VIOLATIONS}docs/handoffs/ directory exists\\n"
fi

if [ ! -z "$VIOLATIONS" ]; then
  echo -e "❌ ERROR: Database-first violations found:"
  echo -e "$VIOLATIONS"
  echo "Strategic data must be in database, not markdown files"
  exit 1
fi

echo "✅ Database-first compliance verified"
exit 0`
    },
    testing_scenarios: [
      { scenario: 'Database record counts vs file counts', type: 'validation', priority: 'P0' },
      { scenario: 'Backup creation and verification', type: 'validation', priority: 'P0' },
      { scenario: 'Directory removal validation', type: 'validation', priority: 'P0' },
      { scenario: 'Database-first validation script execution', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: null,
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Reorganize root-level markdown files to reduce clutter',
    user_role: 'Developer',
    user_want: 'Root-level documentation limited to ≤10 essential files for easy navigation',
    user_benefit: 'Quickly find important documentation without overwhelming clutter',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Root-level file categorization',
        given: '53 root-level markdown files exist in docs/',
        when: 'Categorization analysis is performed',
        then: 'All files categorized into: Essential (≤10), Architecture, Operations, Testing, Archive, or Other AND categorization documented in migration plan'
      },
      {
        id: 'AC-003-2',
        scenario: 'Essential files remain in root',
        given: 'Categorization is complete',
        when: 'Reorganization is executed',
        then: 'Root-level retains only: README.md, DOCUMENTATION_MAP.md, FOR_NEW_DEVELOPERS.md, FOR_LEO_USERS.md, FOR_OPERATIONS.md, and ≤5 other critical files'
      },
      {
        id: 'AC-003-3',
        scenario: 'Non-essential files moved to subdirectories',
        given: '43+ files need to move from root',
        when: 'Migration is executed',
        then: 'Architecture files moved to 01_architecture/ AND Operations files moved to 04_operations/ AND Testing files moved to 05_testing/ AND Deprecated files moved to archive/'
      },
      {
        id: 'AC-003-4',
        scenario: 'Cross-references updated in same commit',
        given: 'Files are being moved to new locations',
        when: 'Cross-references are updated',
        then: 'All internal links updated to new file paths AND git commit includes both file moves and reference updates AND no broken links introduced'
      },
      {
        id: 'AC-003-5',
        scenario: 'Root-level file count validation',
        given: 'Reorganization is complete',
        when: 'File count validation is run',
        then: 'find docs -maxdepth 1 -name "*.md" | wc -l returns ≤10 AND validation passes'
      }
    ],
    definition_of_done: [
      'All 53 root files categorized with justification',
      'Root-level files ≤10',
      'Essential files identified and documented',
      'Non-essential files moved to appropriate subdirectories',
      'All cross-references updated in same commit',
      'File move mapping documented (old path → new path)',
      'No broken internal links (validated by US-006)',
      'Git commit includes file moves + reference updates',
      'Migration plan documented for rollback if needed'
    ],
    technical_notes: 'Use git mv to preserve file history. Update cross-references in same commit to maintain link integrity. Create migration plan with old→new path mapping. Use find to validate root-level file count.',
    implementation_approach: '1. Audit all 53 root files and categorize. 2. Define essential files (≤10) to remain in root. 3. Create subdirectories if needed. 4. Use git mv for each file move. 5. Update cross-references in same commit. 6. Run find validation. 7. Document migration mapping.',
    implementation_context: 'Root-level clutter is major navigation issue for new developers (15-20 min to find docs, target <5 min). Essential files provide clear entry points. Organized subdirectories enable faster discovery. Must preserve git history via git mv.',
    architecture_references: [
      'docs/DOCUMENTATION_MAP.md - Current documentation index',
      'docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md - Reorganization plan',
      'docs/01_architecture/ - Architecture documentation target',
      'docs/04_operations/ - Operations documentation target',
      'docs/05_testing/ - Testing documentation target',
      'docs/archive/ - Deprecated documentation target'
    ],
    example_code_patterns: {
      categorization_script: `#!/bin/bash
# scripts/categorize-root-level-docs.sh
# Categorizes all root-level markdown files

echo "📋 Categorizing root-level documentation files..."

# Essential files (remain in root)
ESSENTIAL=(
  "README.md"
  "DOCUMENTATION_MAP.md"
  "FOR_NEW_DEVELOPERS.md"
  "FOR_LEO_USERS.md"
  "FOR_OPERATIONS.md"
)

# List all root markdown files
ROOT_FILES=$(find docs -maxdepth 1 -name "*.md")

echo "\\n📊 Current root-level files: $(echo "$ROOT_FILES" | wc -l)"
echo "\\nEssential files (remain in root):"
for file in "\${ESSENTIAL[@]}"; do
  if [ -f "docs/$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (missing)"
  fi
done

echo "\\nFiles to categorize and move:"
for file in $ROOT_FILES; do
  basename=$(basename "$file")
  is_essential=false

  for essential in "\${ESSENTIAL[@]}"; do
    if [ "$basename" == "$essential" ]; then
      is_essential=true
      break
    fi
  done

  if [ "$is_essential" == "false" ]; then
    echo "  - $basename"
  fi
done`,
      migration_script: `#!/bin/bash
# scripts/migrate-root-level-docs.sh
# Moves non-essential root-level docs to subdirectories

declare -A MIGRATIONS=(
  # Architecture files
  ["ARCHITECTURE.md"]="01_architecture/"
  ["SYSTEM_DESIGN.md"]="01_architecture/"

  # Operations files
  ["DEPLOYMENT.md"]="04_operations/"
  ["MONITORING.md"]="04_operations/"

  # Testing files
  ["TESTING_STRATEGY.md"]="05_testing/"

  # Archive files (outdated)
  ["OLD_PROTOCOL_V3.md"]="archive/"
)

echo "🚀 Migrating root-level documentation files..."

for file in "\${!MIGRATIONS[@]}"; do
  src="docs/$file"
  dest_dir="docs/\${MIGRATIONS[$file]}"

  if [ -f "$src" ]; then
    echo "Moving $file → $dest_dir"

    # Create destination directory if needed
    mkdir -p "$dest_dir"

    # Use git mv to preserve history
    git mv "$src" "$dest_dir"
  fi
done

echo "\\n✅ Migration complete"
echo "\\n📊 New root-level file count: $(find docs -maxdepth 1 -name "*.md" | wc -l)"`,
      validation_script: `#!/bin/bash
# scripts/validate-root-level-count.sh
# Validates root-level markdown file count ≤10

MAX_ROOT_FILES=10
ROOT_COUNT=$(find docs -maxdepth 1 -name "*.md" | wc -l)

echo "Validating root-level file count..."
echo "Current count: $ROOT_COUNT"
echo "Maximum allowed: $MAX_ROOT_FILES"

if [ "$ROOT_COUNT" -le "$MAX_ROOT_FILES" ]; then
  echo "✅ Root-level file count validation passed"
  exit 0
else
  echo "❌ ERROR: Too many root-level files ($ROOT_COUNT > $MAX_ROOT_FILES)"
  echo "Files:"
  find docs -maxdepth 1 -name "*.md"
  exit 1
fi`
    },
    testing_scenarios: [
      { scenario: 'Root-level file count ≤10', type: 'validation', priority: 'P0' },
      { scenario: 'Essential files remain in root', type: 'validation', priority: 'P0' },
      { scenario: 'Git history preserved (git mv used)', type: 'validation', priority: 'P1' },
      { scenario: 'Cross-references updated correctly', type: 'validation', priority: 'P0' }
    ],
    e2e_test_path: null,
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create comprehensive navigation indexes for guides and references',
    user_role: 'Developer',
    user_want: 'Categorized indexes of all guides and references for easy discovery',
    user_benefit: 'Find relevant documentation in <5 minutes instead of 15-20 minutes',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Guides index creation',
        given: '60+ guides exist without central index',
        when: 'docs/guides/README.md is created',
        then: 'All guides categorized by topic (Getting Started, Development, Testing, Operations, etc.) AND each category has description AND links to all guides in category AND table of contents for quick navigation'
      },
      {
        id: 'AC-004-2',
        scenario: 'References index creation',
        given: '70+ reference docs exist without central index',
        when: 'docs/reference/README.md is created',
        then: 'All references categorized by type (API, Database, Architecture, etc.) AND each category has description AND links to all references in category AND table of contents for quick navigation'
      },
      {
        id: 'AC-004-3',
        scenario: 'Index metadata and organization',
        given: 'Indexes need to be maintainable',
        when: 'Index structure is defined',
        then: 'Each index includes: Purpose statement, Category descriptions, Alphabetical sorting within categories, Last updated timestamp, AND contribution guidelines'
      },
      {
        id: 'AC-004-4',
        scenario: 'Role-based entry points link to indexes',
        given: 'FOR_NEW_DEVELOPERS.md, FOR_LEO_USERS.md, FOR_OPERATIONS.md exist',
        when: 'Entry points are updated',
        then: 'Each entry point links to relevant sections of guides/references indexes AND provides context for when to use each index'
      },
      {
        id: 'AC-004-5',
        scenario: 'Index completeness validation',
        given: 'All guides and references should be indexed',
        when: 'Validation is run',
        then: 'No orphaned guides (not in index) AND no orphaned references (not in index) AND validation script confirms 100% coverage'
      }
    ],
    definition_of_done: [
      'docs/guides/README.md created with categorized index',
      'docs/reference/README.md created with categorized index',
      '60+ guides properly categorized',
      '70+ references properly categorized',
      'Each index has purpose statement',
      'Categories have descriptions',
      'Alphabetical sorting within categories',
      'Last updated timestamps',
      'Contribution guidelines included',
      'Entry points (FOR_*.md) link to indexes',
      'Index completeness validation script created',
      'No orphaned documentation files'
    ],
    technical_notes: 'Use consistent category structure across both indexes. Link from DOCUMENTATION_MAP.md to both indexes. Create validation script to detect orphaned files. Include last updated timestamps for maintenance.',
    implementation_approach: '1. Audit all files in docs/guides/ and docs/reference/. 2. Define category taxonomy (Getting Started, API, Database, etc.). 3. Create README.md templates. 4. Categorize all files. 5. Generate markdown index with links. 6. Update entry points to link to indexes. 7. Create validation script.',
    implementation_context: 'Navigation time is critical UX metric (currently 15-20 min, target <5 min). Categorized indexes are foundation for discoverability. Entry points guide users to right index. Validation prevents future drift.',
    architecture_references: [
      'docs/DOCUMENTATION_MAP.md - Master documentation index',
      'docs/FOR_NEW_DEVELOPERS.md - New developer entry point',
      'docs/FOR_LEO_USERS.md - LEO user entry point',
      'docs/FOR_OPERATIONS.md - Operations entry point',
      'docs/guides/ - All how-to guides',
      'docs/reference/ - All reference documentation'
    ],
    example_code_patterns: {
      guides_index_template: `# Documentation Guides Index

**Purpose**: Comprehensive index of all how-to guides for developers, LEO users, and operators.

**Last Updated**: 2025-12-29

**How to Use**: Browse by category or use Ctrl+F to search for keywords.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Operations](#operations)
- [LEO Protocol](#leo-protocol)
- [Database](#database)
- [Contributing](#contributing)

---

## Getting Started

Guides for new developers and first-time contributors.

- [Getting Started Guide](./getting-started.md) - First steps for new developers
- [Development Environment Setup](./dev-environment-setup.md) - Local setup instructions
- [First Contribution Guide](./first-contribution.md) - Make your first contribution

## Development

Guides for active development work.

- [Code Review Guidelines](./code-review.md) - How to review pull requests
- [Component Development Guide](./component-development.md) - Building React components
- [TypeScript Best Practices](./typescript-best-practices.md) - TypeScript coding standards

## Testing

Guides for writing and running tests.

- [E2E Testing Guide](./e2e-testing.md) - Writing end-to-end tests with Playwright
- [Unit Testing Guide](./unit-testing.md) - Writing unit tests with Jest
- [Test Coverage Guide](./test-coverage.md) - Achieving comprehensive test coverage

## Operations

Guides for deployment and monitoring.

- [Deployment Guide](./deployment.md) - Deploying to production
- [Monitoring Guide](./monitoring.md) - System monitoring and alerting
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions

## LEO Protocol

Guides for working with the LEO Protocol.

- [LEO Protocol Overview](./leo-protocol-overview.md) - Understanding the LEO workflow
- [Sub-Agent Integration Guide](./sub-agent-integration.md) - Working with sub-agents
- [Phase Handoff Guide](./phase-handoff.md) - Managing phase transitions

## Database

Guides for database work.

- [Database Schema Guide](./database-schema.md) - Understanding the schema
- [Migration Guide](./database-migrations.md) - Creating and running migrations
- [RLS Policy Guide](./rls-policies.md) - Writing row-level security policies

---

## Contributing to This Index

To add a new guide:
1. Create the guide in docs/guides/
2. Add entry to appropriate category above
3. Maintain alphabetical order within category
4. Update "Last Updated" timestamp
5. Run validation: \`npm run docs:validate\`

**Maintainers**: PLAN Agent, Documentation Team`,
      references_index_template: `# Reference Documentation Index

**Purpose**: Comprehensive index of all reference documentation including APIs, database schemas, and architecture specs.

**Last Updated**: 2025-12-29

**How to Use**: Browse by category or use Ctrl+F to search for specific references.

---

## Table of Contents

- [API Reference](#api-reference)
- [Database Reference](#database-reference)
- [Architecture Reference](#architecture-reference)
- [LEO Protocol Reference](#leo-protocol-reference)
- [Testing Reference](#testing-reference)

---

## API Reference

REST API and GraphQL endpoint documentation.

- [API Overview](./api-overview.md) - API architecture and patterns
- [Authentication API](./auth-api.md) - Authentication endpoints
- [Strategic Directives API](./sd-api.md) - SD management endpoints
- [Ventures API](./ventures-api.md) - Venture management endpoints

## Database Reference

Database schemas, tables, and functions.

- [Database Schema Overview](./database-schema-overview.md) - Complete schema documentation
- [Strategic Directives Table](./strategic-directives-table.md) - strategic_directives_v2 schema
- [User Stories Table](./user-stories-table.md) - user_stories schema
- [RLS Policies Reference](./rls-policies-reference.md) - All RLS policies

## Architecture Reference

System architecture and design patterns.

- [Architecture Overview](./architecture-overview.md) - System architecture
- [Frontend Architecture](./frontend-architecture.md) - React/Next.js architecture
- [Backend Architecture](./backend-architecture.md) - API server architecture
- [Database Architecture](./database-architecture.md) - Supabase architecture

## LEO Protocol Reference

LEO Protocol specifications and sub-agent details.

- [LEO Protocol Specification](./leo-protocol-spec.md) - Complete protocol spec
- [Sub-Agent Directory](./sub-agent-directory.md) - All 13+ sub-agents
- [Quality Gates Reference](./quality-gates.md) - Phase gate requirements
- [Handoff System Reference](./handoff-system.md) - Unified handoff system

## Testing Reference

Testing specifications and patterns.

- [E2E Test Patterns](./e2e-test-patterns.md) - Playwright test patterns
- [Unit Test Patterns](./unit-test-patterns.md) - Jest test patterns
- [Mock Data Reference](./mock-data.md) - Test data and fixtures

---

## Contributing to This Index

To add a new reference:
1. Create the reference in docs/reference/
2. Add entry to appropriate category above
3. Maintain alphabetical order within category
4. Update "Last Updated" timestamp
5. Run validation: \`npm run docs:validate\`

**Maintainers**: PLAN Agent, Documentation Team`,
      validation_script: `#!/usr/bin/env node
// scripts/validate-documentation-indexes.js
// Validates guides and references are properly indexed

import fs from 'fs';
import path from 'path';

function validateIndex(directory, indexFile) {
  console.log(\`\\n🔍 Validating \${directory} index...\\n\`);

  // Get all markdown files in directory (excluding README.md)
  const files = fs.readdirSync(directory)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => path.basename(f, '.md'));

  // Read index file
  const indexContent = fs.readFileSync(indexFile, 'utf8');

  // Check for orphaned files
  const orphaned = files.filter(file => {
    // Check if file is referenced in index
    const referenced = indexContent.includes(\`(\${file}.md)\`) ||
                       indexContent.includes(\`/\${file}.md\`);
    return !referenced;
  });

  if (orphaned.length > 0) {
    console.log(\`❌ ERROR: \${orphaned.length} orphaned files (not in index):\`);
    orphaned.forEach(file => console.log(\`   - \${file}.md\`));
    return false;
  }

  console.log(\`✅ All \${files.length} files properly indexed\`);
  return true;
}

// Validate guides index
const guidesValid = validateIndex(
  'docs/guides',
  'docs/guides/README.md'
);

// Validate references index
const referencesValid = validateIndex(
  'docs/reference',
  'docs/reference/README.md'
);

if (guidesValid && referencesValid) {
  console.log('\\n✅ All documentation indexes validated successfully\\n');
  process.exit(0);
} else {
  console.log('\\n❌ Documentation index validation failed\\n');
  process.exit(1);
}`
    },
    testing_scenarios: [
      { scenario: 'Guides index completeness', type: 'validation', priority: 'P0' },
      { scenario: 'References index completeness', type: 'validation', priority: 'P0' },
      { scenario: 'No orphaned files validation', type: 'validation', priority: 'P0' },
      { scenario: 'Entry points link to indexes', type: 'validation', priority: 'P1' }
    ],
    e2e_test_path: null,
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Consolidate duplicate directories and reduce total count',
    user_role: 'Developer',
    user_want: 'Streamlined directory structure with ≤20 subdirectories and no duplicates',
    user_benefit: 'Easier navigation and clearer information architecture',
    priority: 'medium',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Directory audit and duplication analysis',
        given: '57 subdirectories exist with potential duplicates (architecture/, testing/)',
        when: 'Directory audit is performed',
        then: 'All directories categorized AND duplicates identified AND merge plan created AND target structure ≤20 subdirectories'
      },
      {
        id: 'AC-005-2',
        scenario: 'Duplicate directory consolidation',
        given: 'Duplicate directories identified (e.g., architecture/ and 01_architecture/)',
        when: 'Consolidation is executed',
        then: 'Content from duplicate directories merged into canonical directory AND all cross-references updated AND git history preserved via git mv AND no content lost'
      },
      {
        id: 'AC-005-3',
        scenario: 'Directory count reduction',
        given: 'Current subdirectory count is 57',
        when: 'Consolidation is complete',
        then: 'Subdirectory count ≤20 AND validation script confirms count AND all merged directories documented'
      },
      {
        id: 'AC-005-4',
        scenario: 'README.md in all directories',
        given: '11+ directories lack README.md files',
        when: 'README creation is complete',
        then: 'Every subdirectory has README.md with purpose, contents list, and navigation links'
      },
      {
        id: 'AC-005-5',
        scenario: 'Directory structure documentation',
        given: 'New directory structure is established',
        when: 'Documentation is updated',
        then: 'DOCUMENTATION_MAP.md reflects new structure AND DOCUMENTATION_STRUCTURE_ASSESSMENT.md updated AND directory structure rationale documented'
      }
    ],
    definition_of_done: [
      'All 57 directories audited and categorized',
      'Duplicate directories identified and documented',
      'Merge plan created with old→new path mappings',
      'Duplicate content merged into canonical directories',
      'Subdirectory count ≤20',
      'All directories have README.md files',
      'Cross-references updated for merged directories',
      'Git history preserved (git mv used)',
      'Directory count validation script created',
      'DOCUMENTATION_MAP.md updated',
      'DOCUMENTATION_STRUCTURE_ASSESSMENT.md updated'
    ],
    technical_notes: 'Identify duplicate directories via naming analysis (architecture vs 01_architecture). Use git mv to preserve history when merging. Create README.md template for consistent structure. Validate final count with find command.',
    implementation_approach: '1. Audit all 57 subdirectories. 2. Identify duplicates and overlaps. 3. Define canonical directory structure (≤20). 4. Create merge plan. 5. Use git mv to merge content. 6. Create READMEs for all directories. 7. Update cross-references. 8. Validate final count.',
    implementation_context: 'Directory proliferation makes navigation difficult. 57 subdirectories overwhelming for new developers. Target ≤20 provides better organization while maintaining clarity. README in each directory aids discovery.',
    architecture_references: [
      'docs/DOCUMENTATION_MAP.md - Current directory mapping',
      'docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md - Structure analysis',
      'docs/01_architecture/ - Canonical architecture directory',
      'docs/05_testing/ - Canonical testing directory'
    ],
    example_code_patterns: {
      directory_audit_script: `#!/bin/bash
# scripts/audit-documentation-directories.sh
# Audits all documentation subdirectories

echo "📋 Auditing documentation directory structure..."

# Count subdirectories
SUBDIR_COUNT=$(find docs -mindepth 1 -maxdepth 1 -type d | wc -l)
echo "\\nTotal subdirectories: $SUBDIR_COUNT"
echo "Target: ≤20\\n"

# List all subdirectories
echo "All subdirectories:"
find docs -mindepth 1 -maxdepth 1 -type d | sort

# Identify potential duplicates
echo "\\n\\nPotential duplicate directories:"
echo "(directories with similar names)"

# Check for architecture duplicates
if [ -d "docs/architecture" ] && [ -d "docs/01_architecture" ]; then
  echo "  - architecture/ and 01_architecture/ (DUPLICATE)"
fi

# Check for testing duplicates
if [ -d "docs/testing" ] && [ -d "docs/05_testing" ]; then
  echo "  - testing/ and 05_testing/ (DUPLICATE)"
fi

# Check for directories without README
echo "\\n\\nDirectories without README.md:"
for dir in docs/*/; do
  if [ ! -f "\${dir}README.md" ]; then
    echo "  - $(basename "$dir")"
  fi
done`,
      consolidation_script: `#!/bin/bash
# scripts/consolidate-documentation-directories.sh
# Consolidates duplicate directories

declare -A MERGES=(
  # Merge old directories into numbered canonical directories
  ["docs/architecture"]="docs/01_architecture"
  ["docs/testing"]="docs/05_testing"
  ["docs/api"]="docs/02_api"
)

echo "🚀 Consolidating duplicate directories..."

for src in "\${!MERGES[@]}"; do
  dest="\${MERGES[$src]}"

  if [ -d "$src" ]; then
    echo "\\nMerging $src → $dest"

    # Create destination if needed
    mkdir -p "$dest"

    # Move all files from source to destination (preserve history)
    for file in "$src"/*; do
      if [ -f "$file" ]; then
        filename=$(basename "$file")

        # Check if file exists in destination
        if [ -f "$dest/$filename" ]; then
          echo "  ⚠️  Conflict: $filename exists in both directories"
          echo "     Manual merge required"
        else
          git mv "$file" "$dest/"
          echo "  ✓ Moved $filename"
        fi
      fi
    done

    # Remove empty source directory
    if [ -z "$(ls -A "$src")" ]; then
      rmdir "$src"
      echo "  ✓ Removed empty directory $src"
    fi
  fi
done

echo "\\n✅ Consolidation complete"
echo "\\n📊 New subdirectory count: $(find docs -mindepth 1 -maxdepth 1 -type d | wc -l)"`,
      readme_template: `# [Directory Name]

**Purpose**: [Brief description of what this directory contains]

**Target Audience**: [Who should use this documentation]

---

## Contents

### Category 1
- [Document 1](./doc1.md) - Brief description
- [Document 2](./doc2.md) - Brief description

### Category 2
- [Document 3](./doc3.md) - Brief description

---

## Quick Links

- [Parent Documentation Map](../DOCUMENTATION_MAP.md)
- [Related Directory](../related-directory/)

---

**Last Updated**: [Date]
**Maintainers**: [Team/Agent name]`,
      validation_script: `#!/bin/bash
# scripts/validate-directory-structure.sh
# Validates documentation directory structure

MAX_SUBDIRS=20
SUBDIR_COUNT=$(find docs -mindepth 1 -maxdepth 1 -type d | wc -l)

echo "Validating directory structure..."
echo "Current subdirectory count: $SUBDIR_COUNT"
echo "Maximum allowed: $MAX_SUBDIRS"

# Check subdirectory count
if [ "$SUBDIR_COUNT" -le "$MAX_SUBDIRS" ]; then
  echo "✅ Subdirectory count validation passed"
else
  echo "❌ ERROR: Too many subdirectories ($SUBDIR_COUNT > $MAX_SUBDIRS)"
  exit 1
fi

# Check for README.md in all directories
echo "\\nValidating README.md files..."
MISSING_README=""

for dir in docs/*/; do
  if [ ! -f "\${dir}README.md" ]; then
    MISSING_README="$MISSING_README\\n  $(basename "$dir")"
  fi
done

if [ -z "$MISSING_README" ]; then
  echo "✅ All directories have README.md"
else
  echo "❌ ERROR: Directories missing README.md:"
  echo -e "$MISSING_README"
  exit 1
fi

echo "\\n✅ Directory structure validation passed"
exit 0`
    },
    testing_scenarios: [
      { scenario: 'Subdirectory count ≤20', type: 'validation', priority: 'P0' },
      { scenario: 'All directories have README.md', type: 'validation', priority: 'P0' },
      { scenario: 'No duplicate directories remain', type: 'validation', priority: 'P1' },
      { scenario: 'Git history preserved after merges', type: 'validation', priority: 'P1' }
    ],
    e2e_test_path: null,
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-DOC-EXCELLENCE-001:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Identify and fix all broken cross-references in documentation',
    user_role: 'Developer',
    user_want: 'All internal documentation links resolve correctly with zero broken references',
    user_benefit: 'Seamless navigation between documentation without dead ends or 404s',
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Broken link identification',
        given: '~10% of cross-references are broken',
        when: 'markdown-link-check is run',
        then: 'All broken internal links identified AND broken link report generated with file locations AND line numbers for each broken link'
      },
      {
        id: 'AC-006-2',
        scenario: 'Broken link categorization',
        given: 'Broken links identified',
        when: 'Links are categorized',
        then: 'Links categorized as: File moved (update path), File deleted (remove link), Typo (fix path), External link (skip or update)'
      },
      {
        id: 'AC-006-3',
        scenario: 'Internal link fixes',
        given: 'Broken internal links categorized',
        when: 'Fixes are applied',
        then: 'All file-moved links updated to new paths AND all deleted-file links removed or replaced AND all typos corrected'
      },
      {
        id: 'AC-006-4',
        scenario: 'Link validation passes',
        given: 'All broken links fixed',
        when: 'markdown-link-check is run again',
        then: 'markdown-link-check passes with 0 errors for internal links AND validation report shows 100% success rate'
      },
      {
        id: 'AC-006-5',
        scenario: 'CI/CD integration for link checking',
        given: 'Need to prevent future broken links',
        when: 'CI/CD workflow is created',
        then: 'GitHub Actions workflow created that runs markdown-link-check on all PRs AND fails PR if broken internal links detected'
      }
    ],
    definition_of_done: [
      'markdown-link-check run on all documentation',
      'Broken link report generated',
      'All broken internal links categorized',
      'File-moved links updated to new paths',
      'Deleted-file links removed or replaced',
      'Typo links corrected',
      'markdown-link-check passes with 0 internal link errors',
      'CI/CD workflow created for link validation',
      'Broken link fix summary documented',
      'Git commit with before/after link counts'
    ],
    technical_notes: 'Use markdown-link-check for validation. Focus on internal links (relative paths). External links may be skipped or checked separately. Create .mlc-config.json to configure link checking behavior.',
    implementation_approach: '1. Install markdown-link-check. 2. Run on all docs/ files. 3. Generate broken link report. 4. Categorize each broken link. 5. Fix systematically by category. 6. Re-run validation. 7. Create CI/CD workflow. 8. Document fixes.',
    implementation_context: 'Broken links frustrate developers and reduce documentation usefulness. ~10% broken rate is significant. Fixing links completes documentation cleanup (FR-1 through FR-6). CI/CD integration prevents future regression.',
    architecture_references: [
      'docs/DOCUMENTATION_MAP.md - Master index with many cross-references',
      'docs/guides/README.md - Guides index (US-004)',
      'docs/reference/README.md - References index (US-004)',
      '.github/workflows/ - CI/CD workflow directory'
    ],
    example_code_patterns: {
      link_check_config: `{
  "ignorePatterns": [
    {
      "pattern": "^https?://localhost"
    },
    {
      "pattern": "^https?://127.0.0.1"
    }
  ],
  "replacementPatterns": [
    {
      "pattern": "^/",
      "replacement": "{{BASEURL}}/"
    }
  ],
  "httpHeaders": [
    {
      "urls": ["https://example.com"],
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  ],
  "timeout": "20s",
  "retryOn429": true,
  "retryCount": 5,
  "fallbackRetryDelay": "30s",
  "aliveStatusCodes": [200, 206]
}`,
      link_check_script: `#!/bin/bash
# scripts/check-documentation-links.sh
# Checks all documentation for broken links

echo "🔍 Checking documentation links..."

# Install markdown-link-check if not present
if ! command -v markdown-link-check &> /dev/null; then
  echo "Installing markdown-link-check..."
  npm install -g markdown-link-check
fi

# Create config file
cat > .mlc-config.json <<EOF
{
  "ignorePatterns": [
    {
      "pattern": "^https?://localhost"
    }
  ],
  "timeout": "20s",
  "retryOn429": true
}
EOF

# Find all markdown files and check links
TOTAL_FILES=0
BROKEN_LINKS=0
BROKEN_FILES=""

for file in $(find docs -name "*.md"); do
  TOTAL_FILES=$((TOTAL_FILES + 1))

  echo "\\nChecking: $file"

  if ! markdown-link-check "$file" -c .mlc-config.json -q; then
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
    BROKEN_FILES="$BROKEN_FILES\\n  - $file"
  fi
done

echo "\\n\\n📊 Link Check Summary:"
echo "  Total files: $TOTAL_FILES"
echo "  Files with broken links: $BROKEN_LINKS"

if [ $BROKEN_LINKS -eq 0 ]; then
  echo "\\n✅ All documentation links valid!"
  exit 0
else
  echo "\\n❌ Broken links found in:"
  echo -e "$BROKEN_FILES"
  exit 1
fi`,
      ci_workflow: `name: Documentation Link Validation

on:
  pull_request:
    paths:
      - 'docs/**/*.md'
      - '*.md'

jobs:
  link-check:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install markdown-link-check
        run: npm install -g markdown-link-check

      - name: Check documentation links
        run: |
          find docs -name "*.md" | while read file; do
            echo "Checking: $file"
            markdown-link-check "$file" -c .mlc-config.json
          done

      - name: Report results
        if: failure()
        run: |
          echo "❌ Broken links detected in documentation"
          echo "Please fix broken links before merging"
          exit 1`,
      fix_tracking: `# Broken Link Fix Tracking

## Summary
- Total broken links: [COUNT]
- Categories:
  - File moved: [COUNT]
  - File deleted: [COUNT]
  - Typo: [COUNT]
  - External: [COUNT]

## File Moved (Update Path)
- [ ] docs/guide.md:15 - \`../old/path.md\` → \`../01_architecture/path.md\`
- [ ] docs/ref.md:42 - \`./moved.md\` → \`../guides/moved.md\`

## File Deleted (Remove Link)
- [ ] docs/index.md:23 - Remove link to deleted \`old-file.md\`
- [ ] docs/guide.md:56 - Replace with archive link or remove

## Typo (Fix Path)
- [ ] docs/api.md:12 - \`./databse.md\` → \`./database.md\`
- [ ] docs/guide.md:34 - \`../refrence/\` → \`../reference/\`

## Progress
- [x] Broken links identified
- [ ] Links categorized
- [ ] File-moved links fixed
- [ ] Deleted-file links removed
- [ ] Typos corrected
- [ ] Validation passed
- [ ] CI/CD workflow created`
    },
    testing_scenarios: [
      { scenario: 'markdown-link-check passes with 0 errors', type: 'validation', priority: 'P0' },
      { scenario: 'All internal links resolve correctly', type: 'validation', priority: 'P0' },
      { scenario: 'CI/CD workflow catches broken links in PRs', type: 'integration', priority: 'P1' },
      { scenario: 'External links handled appropriately', type: 'validation', priority: 'P2' }
    ],
    e2e_test_path: null,
    e2e_test_status: 'not_required',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists (support both UUID and legacy_id)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, sd_key, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID},sd_key.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Error:', sdError?.message);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    // Use the UUID for foreign key references
    const sdUuid = sdData.id;

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdUuid}`);
    console.log(`   SD Key: ${sdData.sd_key || 'N/A'}\n`);

    // Verify PRD exists
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title')
      .eq('id', PRD_ID)
      .single();

    if (prdError || !prdData) {
      console.log(`⚠️  PRD ${PRD_ID} not found in database`);
      console.log('   Creating user stories without PRD link (can be linked later)');
    } else {
      console.log(`✅ Found PRD: ${prdData.title}\n`);
    }

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists in user_stories
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid  // Replace string SD_ID with actual UUID
        };

        const { data: _data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error adding ${story.story_key}:`, error.message);
          console.error(`   Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`✅ Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Exception adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Success: ${successCount}/${userStories.length}`);
    console.log(`   Skipped: ${skipCount}/${userStories.length}`);
    console.log(`   Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log('\n✨ All user stories added successfully for SD-DOC-EXCELLENCE-001!');
      console.log('\n📋 Next Steps:');
      console.log(`   1. Review stories: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
      console.log('   2. Validate INVEST criteria: Check independence, estimability, testability');
      console.log('   3. Review PRD alignment: Check FR-1 through FR-6 coverage');
      console.log('   4. Begin EXEC implementation in phases');
      console.log('\n📐 Implementation Order (3 Phases):');
      console.log('   Phase 1 (Critical - 4-6 hours):');
      console.log('     - US-001: Version consistency (v4.3.3 enforcement)');
      console.log('     - US-002: Database-first compliance verification');
      console.log('   Phase 2 (Organization - 6-8 hours):');
      console.log('     - US-003: Root-level cleanup (53 → ≤10 files)');
      console.log('     - US-004: Navigation indexes creation');
      console.log('     - US-005: Directory consolidation (57 → ≤20)');
      console.log('   Phase 3 (Gap Resolution - 6-8 hours):');
      console.log('     - US-006: Broken link fixes');
      console.log('\n🎯 Target Metrics:');
      console.log('   - Documentation health score: 65 → 85+ (current regressed from 75)');
      console.log('   - Navigation time: 15-20 min → <5 min');
      console.log('   - Version consistency: 100% (LEO Protocol v4.3.3)');
      console.log('   - Database-first compliance: 100%');
      console.log('   - Root-level files: 53 → ≤10');
      console.log('   - Subdirectories: 57 → ≤20');
      console.log('   - Broken links: ~10% → 0%');
      console.log('\n📚 Documentation Type: This is a DOCUMENTATION SD (no E2E tests required)');
      console.log('   Validation via: grep, find, markdown-link-check, DOCMON sub-agent');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
