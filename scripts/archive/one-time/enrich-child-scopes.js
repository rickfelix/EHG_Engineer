#!/usr/bin/env node

/**
 * Enrich child SD scopes with detailed information from the master plan.
 * This is a one-time fix for SD-LEO-DOC-CLEANUP-001 children.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Enriched scopes with specific detail from the plan
const enrichedScopes = {
  'SD-LEO-DOC-CLEANUP-001-A': `Phase 1: Discovery & Rubric Development

DELIVERABLES:
1. File Placement Rubric Decision Tree (12 rules):
   - Rule 1: SD completion reports → docs/summaries/sd-sessions/[SD-TYPE]/
   - Rule 2: Retrospectives → docs/retrospectives/
   - Rule 3: Database docs → docs/database/{schema,migrations,rls}/ or docs/reference/database/
   - Rule 4: Testing docs → docs/05_testing/{strategy,e2e,unit,campaigns}/ or docs/guides/testing/
   - Rule 5: Protocols → docs/03_protocols_and_standards/
   - Rule 6: API docs → docs/02_api/
   - Rule 7: Feature docs → docs/04_features/{user-features,backend,integrations,aegis}/
   - Rule 8: Guides → docs/guides/{database,testing,development,deployment,leo-protocol}/
   - Rule 9: References → docs/reference/{database,validation,schema,commands,sub-agents}/
   - Rule 10: Architecture → docs/01_architecture/
   - Rule 11: Deployment → docs/06_deployment/
   - Rule 12: Archive → docs/archive/[year]/[category]/

2. Validation Scripts:
   - scripts/validate-doc-location.js: Check prohibited locations, root file count
   - scripts/validate-doc-metadata.js: Required fields (Category, Status, Version, Author, Last Updated, Tags)
   - scripts/validate-doc-naming.js: Kebab-case enforcement, numeric prefix detection
   - scripts/detect-duplicate-docs.js: Exact match, fuzzy title (>80%), content similarity (>70%)

3. Update DOCUMENTATION_STANDARDS.md with rubric decision tree

VALIDATION: All 4 scripts created and runnable, rubric documented`,

  'SD-LEO-DOC-CLEANUP-001-B': `Phase 2.1-2.2: Root & Prohibited Location Cleanup

TARGET FILES:
- Root directory: 48 files to move (exclude CLAUDE*.md, README.md, CHANGELOG.md)
- Prohibited locations: 72 files total
  - src/: 1 file (src/db/loader/README.md)
  - lib/: 4 files (lib/agents/)
  - scripts/: 52 files (scripts/archive/codex-integration/)
  - tests/: 15 files

DELIVERABLES:
1. scripts/cleanup-root-docs.js:
   - Scan root for .md files
   - Apply rubric from Child A to classify each file
   - Generate move plan (old path → new path)
   - Support --dry-run flag
   - Update cross-references after moves
   - Generate commit manifest

2. scripts/cleanup-prohibited-locations.js:
   - Scan src/, lib/, scripts/, tests/ for .md files
   - Apply rubric classification
   - Generate move plan with --dry-run support
   - Clean up empty directories after moves

VALIDATION: 0 files in prohibited locations, ≤10 files at root`,

  'SD-LEO-DOC-CLEANUP-001-C': `Phase 2.3-2.4: Database & Testing Documentation Consolidation

DATABASE CONSOLIDATION (38+ files → 8 canonical):
1. docs/database/schema/schema-overview.md
   - Merge: database_schema.md, aegis-schema.md, stage20-compliance-schema.md, database-schema-overview.md
   - Content: Complete ERD, table definitions, relationships

2. docs/database/migrations/migration-guide.md
   - Merge: All migration-how-to guides
   - Content: How to create, apply, rollback migrations

3. docs/database/migrations/migration-log.md (RUNNING LOG)
   - Merge: Individual migration reports
   - Content: Date | Migration | Author | Notes table

4. docs/database/rls/rls-policy-guide.md
   - Merge: All RLS policy documentation

5. docs/reference/database/database-patterns.md
   - Merge: database-agent-patterns.md and similar

6. docs/reference/database/validation-patterns.md
   - Merge: validation-enforcement.md and related

7. docs/01_architecture/database-architecture.md
   - Merge: High-level architecture docs

8. docs/guides/database/database-connection-guide.md
   - Merge: database-connection.md and troubleshooting

TESTING CONSOLIDATION (18+ files → 6 canonical):
1. docs/03_protocols_and_standards/testing-governance.md
2. docs/05_testing/strategy/test-strategy.md
3. docs/05_testing/e2e/e2e-guide.md
4. docs/05_testing/unit/unit-test-guide.md
5. docs/05_testing/campaigns/campaign-reports.md (RUNNING LOG)
6. docs/guides/testing/testing-quickstart.md

Archive remaining files to docs/archive/2026/{database,testing}/

VALIDATION: 8 database files, 6 testing files, originals archived`,

  'SD-LEO-DOC-CLEANUP-001-D': `Phase 2.5-2.6: Naming & Folder Rationalization

NUMERIC PREFIX RENAMING (30+ files):
Pattern: ^\\d+[a-z]?_.*\\.md$ → kebab-case
Examples:
- 01a_draft_idea.md → draft-idea.md
- 04c_competitive_kpi_tracking.md → competitive-kpi-tracking.md
- 13b_exit_readiness_tracking.md → exit-readiness-tracking.md

FOLDER MERGES (duplicate folders):
- architecture/ → merge into 01_architecture/, delete architecture/
- strategic-directives/ → merge into strategic_directives/, delete strategic-directives/

UNDERUTILIZED FOLDER CONSOLIDATION (<5 files each):
- agents/ → docs/reference/sub-agents/
- approvals/ → docs/summaries/sd-sessions/
- brainstorming/ → docs/archive/2026/drafts/
- cli/ → docs/reference/commands/
- design-analysis/ → docs/01_architecture/
- discovery/ → docs/research/
- doctrine/ → docs/03_protocols_and_standards/
- drafts/ → docs/archive/2026/drafts/
- EHG/, EHG_Engineering/ → docs/04_features/ or archive
- examples/ → inline into relevant docs
- implementation/ → docs/summaries/implementations/
- parking-lot/ → docs/archive/2026/drafts/
- product-requirements/ → archive (PRDs in database)
- specs/ → docs/02_api/ or docs/01_architecture/
- stages/ → docs/04_features/ or clarify purpose

SUB-FOLDER CREATION (large directories):
- docs/reference/ → {database, validation, schema, commands, sub-agents}/
- docs/guides/ → {database, testing, development, deployment, leo-protocol}/
- docs/04_features/ → {user-features, backend, integrations, aegis}/

TARGET: 58 folders → ~25 folders

VALIDATION: No numeric prefixes, no duplicate folders, large folders sub-categorized`,

  'SD-LEO-DOC-CLEANUP-001-E': `Phase 2.7-2.8: Metadata Injection & Link Validation

METADATA INJECTION (~1000+ files):
Required fields to inject:
- Category: Auto-detect from path (Architecture|API|Guide|Protocol|Report|Reference|Database|Testing|Feature|Deployment)
- Status: Draft (safe default)
- Version: 1.0.0 (initial)
- Author: DOCMON (sub-agent)
- Last Updated: [file modification date]
- Tags: [extract from content using keyword analysis, minimum 2]

Scripts:
1. scripts/inject-doc-metadata.js
   - Read files missing metadata
   - Auto-detect category from path and content
   - Generate and inject metadata block after title
   - Support --dry-run flag

LINK VALIDATION & REPAIR:
2. scripts/validate-doc-links.js
   - Scan all .md files for markdown links [text](path)
   - Resolve relative paths
   - Check if target exists
   - If moved in earlier phases, update to new location
   - Generate broken-links-report.md for manual fixes
   - Auto-fix where new location is known

VALIDATION: 100% metadata compliance, 0 broken links`,

  'SD-LEO-DOC-CLEANUP-001-F': `Phase 3: Protocol Enhancement

UPDATE DOCUMENTATION_STANDARDS.md with new sections:

SECTION 7 - Sub-Categorization Rules:
- Trigger: folder >50 files OR distinct sub-domains
- reference/ → {database, validation, schema, commands, sub-agents}/
- guides/ → {database, testing, development, deployment, leo-protocol}/
- 04_features/ → {user-features, backend, integrations, aegis}/
- 05_testing/ → {strategy, e2e, unit, campaigns}/
- When NOT to: <30 files, architecture docs, API docs

SECTION 8 - Automated Enforcement:
| Rule | Tool |
| Location Compliance | npm run docs:validate-location |
| Root Directory Limit | npm run docs:validate-root |
| Metadata Completeness | npm run docs:validate-metadata |
| Naming Convention | npm run docs:validate-naming |
| Link Integrity | npm run docs:validate-links |
| Duplicate Detection | npm run docs:detect-duplicates |
- Pre-commit hook installation: npm run install-doc-hooks
- CI/CD: Validation on all PRs touching .md files

SECTION 9 - Documentation Lifecycle & Cleanup:
- Draft not updated 90 days → auto-archive
- Review not updated 60 days → Draft or Deprecated
- Approved not updated 180 days → freshness review
- Deprecated >1 year → auto-archive
- Archive path: docs/archive/{YEAR}/{CATEGORY}/
- Duplicate resolution: identify canonical, merge, archive duplicates

UPDATE .claude/commands/document.md:
- Add Phase 0.2: Run npm run docs:validate before operations
- Add Phase 4.5: Run duplicate detection after existing doc discovery

CREATE pre-commit hook via scripts/install-doc-validation-hooks.js

VALIDATION: Sections 7-9 added, pre-commit hook working, /document updated`,

  'SD-LEO-DOC-CLEANUP-001-G': `Phase 4: Monitoring & Automation Setup

HEALTH DASHBOARD (scripts/doc-health-report.js):
Metrics to track:
1. Organization Score: % docs in correct location (target: 95%)
2. Completeness Score: % with required metadata (target: 100%)
3. Freshness Score: % updated in last 90 days (target: 80%)
4. Link Health: % working cross-references (target: 100%)
5. Duplication Rate: % files with duplicates (target: <5%)
6. Sub-Categorization Score: % large folders with sub-folders (target: 100%)

Output: docs/summaries/doc-health-reports/[DATE]-health-report.md

CI/CD WORKFLOW (.github/workflows/doc-validation.yml):
Triggers: PR touching .md files, weekly Sunday schedule
Jobs:
- Validate Location
- Validate Metadata
- Validate Naming
- Validate Links
- Detect Duplicates
- Generate Health Report
- Upload Report artifact

DOCMON AUTOMATION (scripts/docmon-automated-audit.js):
Enhance with:
1. Scheduled weekly audits
2. Auto-remediation for simple violations (metadata, links)
3. GitHub issue creation for violations needing human review
4. Learning mode: track common violations, suggest protocol updates

VALIDATION: Health report generating, CI/CD workflow active, DOCMON enhanced`
};

async function enrichChildren() {
  console.log('Enriching child SD scopes with plan details...\n');

  for (const [id, scope] of Object.entries(enrichedScopes)) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ scope })
      .eq('id', id);

    if (error) {
      console.log(`❌ Error updating ${id}: ${error.message}`);
    } else {
      console.log(`✅ Enriched: ${id}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All 7 children enriched with detailed scopes from plan');
  console.log('='.repeat(60));
}

enrichChildren().catch(console.error);
