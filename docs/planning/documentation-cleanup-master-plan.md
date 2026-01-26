# Documentation Organizational Assessment & Cleanup Plan

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: documentation, cleanup, organization, plan

### Plan Details
- **SD Type**: documentation
- **Complexity**: High (2,516 files across 58 folders)
- **Estimated Scope**: Multi-phase reorganization with protocol updates
- **Risk Level**: Medium (bulk file moves, potential broken links)

---

## Executive Summary

This plan addresses the comprehensive cleanup and reorganization of 2,516 documentation files across 58 folders in the `docs/` directory. Based on the assessment, the documentation health score is 45/100, requiring significant intervention.

**Key Problems Identified**:
1. 48 SD completion reports misplaced at root
2. 72 files in prohibited locations (src/, lib/, scripts/, tests/)
3. 38+ duplicate database documentation files
4. 30+ files using undocumented numeric-prefix naming
5. ~1000+ files missing required metadata (40-60%)
6. Large folders without sub-categorization (reference/: 93 files, features/: 80 files)
7. Duplicate folder names (architecture/ vs 01_architecture/, strategic_directives/ vs strategic-directives/)

**User Requirements**:
- Create clear rubrics for file placement to prevent ambiguity
- Consolidate duplicate database docs to canonical set
- Rename numeric-prefixed files to kebab-case
- Update Document Management Protocol with: enforcement rules, sub-categorization guidance, formalized metadata requirements, cleanup procedures

---

## Phase 1: Discovery & Rubric Development

### 1.1 File Placement Rubric Creation

**Objective**: Create unambiguous decision tree for "where does this file go?"

**Approach**: Develop a rubric with the following decision criteria:

```
DECISION TREE FOR FILE PLACEMENT:

1. Is it an SD completion/status report?
   → YES: docs/summaries/sd-sessions/[SD-TYPE]/[SD-KEY]-[STATUS].md
      Examples:
      - LEAD_APPROVAL_COMPLETE.md → docs/summaries/sd-sessions/database/SD-DB-001-lead-approved.md
      - DATABASE_CONNECTION_ISSUE_SD-VISION-V2-003.md → docs/summaries/sd-sessions/feature/SD-VISION-V2-003-issue-resolved.md

   RATIONALE: Status reports are session artifacts, not permanent documentation.
   Sub-folder by SD type for easier discovery.

2. Is it a retrospective/lessons learned?
   → YES: docs/retrospectives/[SD-KEY]-retro.md

   RATIONALE: Already defined in standards, enforce strictly.

3. Is it database-related (schema, migration, RLS)?
   → YES: Apply secondary decision:
      - Schema documentation → docs/database/schema/
      - Migration notes → docs/database/migrations/
      - RLS policies → docs/database/rls/
      - Patterns/best practices → docs/reference/database/
      - Architecture overview → docs/01_architecture/database-architecture.md (ONE canonical file)

   RATIONALE: Database docs were fragmented across 38+ files. This creates clear boundaries.
   NO DUPLICATES: One schema doc, one architecture doc, migration-specific notes only.

4. Is it testing-related?
   → YES: Apply secondary decision:
      - Testing protocols/standards → docs/03_protocols_and_standards/testing-governance.md
      - How to write tests (guide) → docs/guides/testing/
      - Test strategy/coverage → docs/05_testing/strategy/
      - E2E test documentation → docs/05_testing/e2e/
      - Unit test documentation → docs/05_testing/unit/
      - QA campaigns → docs/05_testing/campaigns/

   RATIONALE: Testing docs were spread across 18+ files. Sub-categorize by purpose.

5. Is it a protocol/standard (LEO, governance, workflow)?
   → YES: docs/03_protocols_and_standards/[PROTOCOL-NAME]_v[VERSION].md

   RATIONALE: Already well-defined, but ensure version consistency.

6. Is it API documentation?
   → YES: docs/02_api/[kebab-case-name].md

   RATIONALE: Keep flat for now, API docs are manageable at current scale.

7. Is it feature documentation?
   → YES: Apply sub-categorization if >50 files total:
      - User-facing features → docs/04_features/user-features/
      - Backend features → docs/04_features/backend/
      - Integrations → docs/04_features/integrations/
      - AEGIS-specific → docs/04_features/aegis/

   RATIONALE: 80 files in flat structure is hard to navigate.

8. Is it a guide/how-to?
   → YES: Apply secondary decision:
      - Database guides → docs/guides/database/
      - Testing guides → docs/guides/testing/
      - Development guides → docs/guides/development/
      - Deployment guides → docs/guides/deployment/
      - LEO Protocol guides → docs/guides/leo-protocol/

   RATIONALE: 61 flat files need sub-categorization by topic.

9. Is it a quick reference/cheatsheet/pattern?
   → YES: Apply secondary decision:
      - Database patterns → docs/reference/database/
      - Validation patterns → docs/reference/validation/
      - Schema references → docs/reference/schema/
      - Command references → docs/reference/commands/
      - Sub-agent patterns → docs/reference/sub-agents/

   RATIONALE: 93 flat files need sub-categorization by domain.

10. Is it architecture documentation?
    → YES: docs/01_architecture/[component-name].md

    RATIONALE: Keep flat, architecture docs should be high-level overviews.

11. Is it deployment/operations?
    → YES: docs/06_deployment/[deployment-topic].md

    RATIONALE: Keep flat for now, limited scale.

12. Is it archived/deprecated?
    → YES: docs/archive/[year]/[category]/[filename].md

    RATIONALE: Organize archive by year and category to prevent clutter.
```

**Ambiguity Resolution Rules**:
- If a file fits multiple categories, choose based on PRIMARY purpose
- If still unclear, default to most specific category (e.g., database guide → guides/database/ not database/)
- Cross-reference from other relevant locations using symlinks or README links

### 1.2 Metadata Standards Audit

**Create validation script**: `scripts/validate-doc-metadata.js`

**Validation Rules**:
```javascript
REQUIRED_METADATA_FIELDS = [
  'Category',      // Must be from approved list
  'Status',        // Draft|Review|Approved|Deprecated
  'Version',       // Semver: X.Y.Z
  'Author',        // Name or Sub-Agent code
  'Last Updated',  // YYYY-MM-DD format
  'Tags'           // Comma-separated, at least 2 tags
];

APPROVED_CATEGORIES = [
  'Architecture',
  'API',
  'Guide',
  'Protocol',
  'Report',
  'Reference',
  'Database',
  'Testing',
  'Feature',
  'Deployment'
];
```

**Output**: CSV report of all files missing metadata with recommended values

### 1.3 Duplicate Detection Algorithm

**Create script**: `scripts/detect-duplicate-docs.js`

**Detection Methods**:
1. **Exact filename matches** (different paths)
2. **Fuzzy title matching** (>80% similarity)
3. **Content similarity** (>70% using cosine similarity on first 500 words)
4. **Keyword overlap** (database, schema, migration, etc. in same file)

**Output**: JSON report grouping potential duplicates with merge recommendations

---

## Phase 2: Automated Cleanup Execution

### 2.1 Root Directory Cleanup

**Script**: `scripts/cleanup-root-docs.js`

**Actions**:
1. Scan root directory for all .md files (exclude CLAUDE*.md, README.md)
2. Classify each file using rubric from Phase 1.1
3. Generate move plan (old path → new path)
4. Prompt for confirmation
5. Execute moves
6. Update any internal cross-references
7. Generate commit with file move manifest

**Target**: Move 48 files from root to appropriate locations

### 2.2 Prohibited Location Cleanup

**Script**: `scripts/cleanup-prohibited-locations.js`

**Locations to scan**:
- `src/` (1 file: src/db/loader/README.md)
- `lib/` (4 files in lib/agents/)
- `scripts/` (52 files in scripts/archive/codex-integration/)
- `tests/` (15 files)

**Actions**:
1. For each prohibited location, scan for .md files
2. Apply rubric to determine correct destination
3. Generate move plan
4. Confirm with user
5. Execute moves
6. Clean up empty directories

**Target**: Move 72 files from prohibited locations

### 2.3 Database Documentation Consolidation

**Script**: `scripts/consolidate-database-docs.js`

**Strategy**: Reduce 38+ database files to **8 canonical files**:

1. **docs/database/schema/schema-overview.md** (ONE file)
   - Merge: database_schema.md, aegis-schema.md, stage20-compliance-schema.md, database-schema-overview.md (multiple)
   - Content: Complete ERD, table definitions, relationships
   - Status: Approved

2. **docs/database/migrations/migration-guide.md** (ONE file)
   - Merge: All migration-how-to guides
   - Content: How to create, apply, rollback migrations
   - Status: Approved

3. **docs/database/migrations/migration-log.md** (RUNNING LOG)
   - Merge: Individual migration reports
   - Content: Table with: Date | Migration | Author | Notes
   - Status: Living document

4. **docs/database/rls/rls-policy-guide.md** (ONE file)
   - Merge: All RLS policy documentation
   - Content: RLS patterns, security model, policy examples
   - Status: Approved

5. **docs/reference/database/database-patterns.md** (ONE file)
   - Merge: database-agent-patterns.md and similar
   - Content: Best practices, patterns, anti-patterns
   - Status: Approved

6. **docs/reference/database/validation-patterns.md** (ONE file)
   - Merge: validation-enforcement.md and related
   - Content: Validation rules, check constraints, triggers
   - Status: Approved

7. **docs/01_architecture/database-architecture.md** (ONE file)
   - Merge: High-level architecture docs
   - Content: Design decisions, scalability, trade-offs
   - Status: Approved

8. **docs/guides/database/database-connection-guide.md** (ONE file)
   - Merge: database-connection.md and troubleshooting
   - Content: How to connect, common issues, troubleshooting
   - Status: Approved

**Archive remaining files**: Move other 30+ files to `docs/archive/2026/database/` for reference

### 2.4 Testing Documentation Consolidation

**Script**: `scripts/consolidate-testing-docs.js`

**Strategy**: Reduce 18+ testing files to **6 canonical files**:

1. **docs/03_protocols_and_standards/testing-governance.md** (ONE file)
   - Merge: LEO_v4.4.2_testing_governance.md and similar protocols
   - Content: Testing requirements per SD type, governance, gates

2. **docs/05_testing/strategy/test-strategy.md** (ONE file)
   - Merge: testing_qa.md, testing_qa_enhanced.md
   - Content: Overall test strategy, coverage goals

3. **docs/05_testing/e2e/e2e-guide.md** (ONE file)
   - Merge: All E2E-related guides
   - Content: How to write E2E tests, patterns, Playwright usage

4. **docs/05_testing/unit/unit-test-guide.md** (ONE file)
   - Merge: Unit test documentation
   - Content: Unit test patterns, mocking, coverage

5. **docs/05_testing/campaigns/campaign-reports.md** (RUNNING LOG)
   - Merge: real-testing-campaign.md and similar reports
   - Content: Table of testing campaigns with results

6. **docs/guides/testing/testing-quickstart.md** (ONE file)
   - Merge: Quick-start testing guides
   - Content: How to get started testing locally

**Archive remaining files**: Move to `docs/archive/2026/testing/`

### 2.5 Numeric-Prefix Renaming

**Script**: `scripts/rename-numeric-prefixed-files.js`

**Target**: 30+ files like `01a_draft_idea.md`, `04c_competitive_kpi_tracking.md`

**Conversion Rules**:
```
01a_draft_idea.md → draft-idea.md
04c_competitive_kpi_tracking.md → competitive-kpi-tracking.md
13b_exit_readiness_tracking.md → exit-readiness-tracking.md
```

**Actions**:
1. Scan for pattern: `^\d+[a-z]?_.*\.md$`
2. Generate new kebab-case name (remove numeric prefix, convert underscores to hyphens)
3. Check for conflicts
4. Generate rename manifest
5. Update all cross-references in other files
6. Execute renames

**Risk Mitigation**: Create git branch `docs/numeric-prefix-cleanup` before execution

### 2.6 Folder Structure Rationalization

**Actions**:

1. **Merge duplicate folders**:
   - `architecture/` → merge into `01_architecture/`, delete `architecture/`
   - `strategic-directives/` → merge into `strategic_directives/`, delete `strategic-directives/`

2. **Consolidate underutilized folders** (<5 files):
   - `agents/` → merge into `docs/reference/sub-agents/`
   - `approvals/` → merge into `docs/summaries/sd-sessions/`
   - `brainstorming/` → merge into `docs/archive/2026/drafts/`
   - `cli/` → merge into `docs/reference/commands/`
   - `design-analysis/` → merge into `docs/01_architecture/`
   - `discovery/` → merge into `docs/research/`
   - `doctrine/` → merge into `docs/03_protocols_and_standards/`
   - `drafts/` → merge into `docs/archive/2026/drafts/`
   - `EHG/`, `EHG_Engineering/` → merge into `docs/04_features/` or archive
   - `examples/` → merge into relevant docs as inline examples
   - `implementation/` → merge into `docs/summaries/implementations/`
   - `parking-lot/` → merge into `docs/archive/2026/drafts/`
   - `product-requirements/` → archive (PRDs should be in database)
   - `specs/` → merge into `docs/02_api/` or `docs/01_architecture/`
   - `stages/` → merge into `docs/04_features/` or clarify purpose

3. **Create sub-folders for large directories**:
   - `docs/reference/` → `docs/reference/{database, validation, schema, commands, sub-agents}/`
   - `docs/guides/` → `docs/guides/{database, testing, development, deployment, leo-protocol}/`
   - `docs/04_features/` → `docs/04_features/{user-features, backend, integrations, aegis}/`

**Outcome**: Reduce from 58 folders to ~25 well-organized folders

### 2.7 Metadata Injection

**Script**: `scripts/inject-doc-metadata.js`

**Actions**:
1. Read CSV report from Phase 1.2
2. For each file missing metadata:
   - Detect category from file path and content
   - Generate metadata block with defaults:
     - Status: Draft (safe default)
     - Version: 1.0.0 (initial)
     - Author: DOCMON (sub-agent)
     - Last Updated: [file modification date]
     - Tags: [extracted from content using keyword analysis]
3. Inject metadata block at top of file (after title)
4. Generate commit with metadata injection manifest

**Target**: Add metadata to ~1000+ files

### 2.8 Cross-Reference Validation & Repair

**Script**: `scripts/validate-doc-links.js`

**Actions**:
1. Scan all .md files for markdown links: `[text](path)`
2. For each internal link (not starting with http):
   - Resolve relative path
   - Check if target file exists
   - If moved in Phase 2, update link to new location
3. Generate report of broken links
4. Auto-fix links where new location is known
5. Flag unresolvable links for manual review

**Output**:
- `docs/summaries/broken-links-report.md` with links that need manual fix
- Git commit with auto-fixed links

---

## Phase 3: Protocol Enhancement

### 3.1 Update DOCUMENTATION_STANDARDS.md

**Enhancements**:

1. **Add Sub-Categorization Guidance** (new section):
```markdown
### 7. Sub-Categorization Rules

Apply sub-categorization when a folder contains >50 files OR has distinct sub-domains:

| Folder | Sub-Categorization Trigger | Sub-Folder Pattern |
|--------|---------------------------|-------------------|
| reference/ | >50 files OR multiple domains | {database, validation, schema, commands, sub-agents}/ |
| guides/ | >50 files OR multiple domains | {database, testing, development, deployment, leo-protocol}/ |
| 04_features/ | >50 files OR clear feature groupings | {user-features, backend, integrations, aegis}/ |
| 05_testing/ | Multiple test types | {strategy, e2e, unit, campaigns}/ |
| database/ | Built-in structure | {schema, migrations, rls}/ |

**Rationale**: Folders with >50 files become difficult to navigate. Sub-categorization improves discoverability.

**When NOT to sub-categorize**:
- Folders with <30 files and no clear groupings
- Architecture docs (should be high-level overviews)
- API docs (flat structure preferred for API references)
```

2. **Add Enforcement Rules** (new section):
```markdown
### 8. Automated Enforcement

The following validations MUST pass before documentation changes are committed:

| Rule | Validation | Tool |
|------|-----------|------|
| Location Compliance | No .md files in src/, lib/, scripts/, tests/, public/ | `npm run docs:validate-location` |
| Root Directory Limit | Max 10 .md files at root (CLAUDE*.md, README.md, CHANGELOG.md only) | `npm run docs:validate-root` |
| Metadata Completeness | 100% of docs have required metadata header | `npm run docs:validate-metadata` |
| Naming Convention | All files use kebab-case (except UPPERCASE standards) | `npm run docs:validate-naming` |
| Link Integrity | 0 broken internal cross-references | `npm run docs:validate-links` |
| Duplicate Detection | No files with >70% content similarity | `npm run docs:detect-duplicates` |

**Pre-commit Hook**: Install with `npm run install-doc-hooks`

**CI/CD Integration**: Documentation validation runs on all PRs touching .md files
```

3. **Formalize Metadata Requirements** (update section 2):
```markdown
### 2. Document Headers (STRICT ENFORCEMENT)

**CRITICAL**: Every markdown file MUST include this metadata header. Files without metadata will FAIL validation.

```markdown
# Document Title

## Metadata
- **Category**: Guide
- **Status**: Deprecated
- **Version**: [X.Y.Z] (semver)
- **Author**: [Name or Sub-Agent code]
- **Last Updated**: [YYYY-MM-DD]
- **Tags**: [minimum 2 tags, comma-separated]

## Overview
[Required: 1-2 sentence summary of document purpose]
```

**Validation Rules**:
- `Category` must be from approved list
- `Status` must be one of four values
- `Version` must follow semver (X.Y.Z)
- `Last Updated` must be valid date in YYYY-MM-DD format
- `Tags` must have at least 2 tags

**Auto-Generation**: Use `npm run docs:generate-metadata <filepath>` to auto-generate metadata block from content analysis.
```

4. **Add Cleanup Procedures** (new section):
```markdown
### 9. Documentation Lifecycle & Cleanup

**Obsolescence Policy**:
- **Draft** docs not updated in 90 days → Auto-archive or prompt for review
- **Review** docs not updated in 60 days → Auto-change to Draft or Deprecated
- **Approved** docs not updated in 180 days → Flag for freshness review
- **Deprecated** docs older than 1 year → Auto-archive

**Archive Rules**:
- Archive path: `docs/archive/{YEAR}/{CATEGORY}/`
- Archive metadata: Add `Archived-Date` and `Archived-Reason` fields
- Archive index: Maintain `docs/archive/README.md` with archive catalog

**Duplicate Resolution**:
- When duplicate detected (>70% similarity):
  1. Identify canonical version (newest, most complete, approved status)
  2. Merge unique content from duplicates into canonical
  3. Archive duplicates with cross-reference to canonical
  4. Update all cross-references to point to canonical

**Deletion Policy**:
- NEVER delete documentation without archiving first
- Exception: Generated artifacts (CI reports, temporary status files) can be deleted after 30 days
```

### 3.2 Create New Validation Scripts

**Scripts to create**:

1. `scripts/validate-doc-location.js`
   - Scan all .md files
   - Check none are in prohibited locations
   - Check root has ≤10 files
   - Output: Pass/fail with violations list

2. `scripts/validate-doc-metadata.js`
   - Scan all .md files
   - Parse metadata headers
   - Validate required fields and formats
   - Output: Pass/fail with violations CSV

3. `scripts/validate-doc-naming.js`
   - Scan all .md files
   - Check naming convention (kebab-case or approved exceptions)
   - Output: Pass/fail with violations list

4. `scripts/validate-doc-links.js`
   - Scan all markdown links
   - Check all internal links resolve
   - Output: Pass/fail with broken links report

5. `scripts/detect-duplicate-docs.js`
   - Scan all .md files
   - Calculate content similarity
   - Output: JSON of potential duplicates grouped by similarity

6. `scripts/generate-doc-metadata.js <filepath>`
   - Analyze file content
   - Detect category, extract keywords for tags
   - Generate metadata block
   - Insert at top of file

**NPM Script Integration** (add to package.json):
```json
{
  "scripts": {
    "docs:validate": "npm run docs:validate-location && npm run docs:validate-metadata && npm run docs:validate-naming && npm run docs:validate-links",
    "docs:validate-location": "node scripts/validate-doc-location.js",
    "docs:validate-metadata": "node scripts/validate-doc-metadata.js",
    "docs:validate-naming": "node scripts/validate-doc-naming.js",
    "docs:validate-links": "node scripts/validate-doc-links.js",
    "docs:detect-duplicates": "node scripts/detect-duplicate-docs.js",
    "docs:generate-metadata": "node scripts/generate-doc-metadata.js",
    "docs:health-report": "node scripts/doc-health-report.js",
    "install-doc-hooks": "node scripts/install-doc-validation-hooks.js"
  }
}
```

### 3.3 Create Pre-Commit Hook

**Script**: `scripts/install-doc-validation-hooks.js`

**Hook Content** (`.git/hooks/pre-commit`):
```bash
#!/bin/bash

# Check if any .md files are being committed
md_files=$(git diff --cached --name-only --diff-filter=ACM | grep '\.md$')

if [ -n "$md_files" ]; then
  echo "📝 Documentation changes detected, running validation..."

  # Run validation scripts
  npm run docs:validate-location
  if [ $? -ne 0 ]; then
    echo "❌ Location validation failed. Commit aborted."
    exit 1
  fi

  npm run docs:validate-metadata
  if [ $? -ne 0 ]; then
    echo "❌ Metadata validation failed. Commit aborted."
    exit 1
  fi

  npm run docs:validate-naming
  if [ $? -ne 0 ]; then
    echo "❌ Naming validation failed. Commit aborted."
    exit 1
  fi

  echo "✅ Documentation validation passed!"
fi

exit 0
```

### 3.4 Update /document Command

**File**: `.claude/commands/document.md`

**Updates**:

1. Add Phase 0.0 to load standards from canonical source (already exists in current version)

2. Update Phase 0 validation to use new validation scripts:
```markdown
#### 0.2 Run Automated Validation

Before ANY file operation, run validation suite:

```bash
npm run docs:validate
```

If validation fails:
1. Review violations report
2. Fix violations OR justify exception
3. Re-run validation
4. Only proceed when validation passes
```

3. Add Phase 4.5: Duplicate Detection Check
```markdown
#### 4.5 Duplicate Detection (After Existing Doc Discovery)

After searching for existing documentation, run duplicate detection:

```bash
npm run docs:detect-duplicates --topic="SEARCH_KEYWORDS"
```

If duplicates found:
1. Identify canonical version (newest, approved, most complete)
2. **DO NOT CREATE NEW FILE** - edit canonical version
3. Note duplicates for later consolidation
4. Report in validation summary
```

---

## Phase 4: Continuous Monitoring & Reporting

### 4.1 Documentation Health Dashboard

**Script**: `scripts/doc-health-report.js`

**Metrics to Track**:
1. **Organization Score**: % of docs in correct location (target: 95%)
2. **Completeness Score**: % with required metadata (target: 100%)
3. **Freshness Score**: % updated in last 90 days (target: 80%)
4. **Link Health**: % of working cross-references (target: 100%)
5. **Duplication Rate**: % of files with duplicates (target: <5%)
6. **Sub-Categorization Score**: % of large folders with sub-folders (target: 100%)

**Output**: Markdown report saved to `docs/summaries/doc-health-reports/[DATE]-health-report.md`

**Frequency**: Run weekly (automated via GitHub Actions)

### 4.2 GitHub Actions Workflow

**File**: `.github/workflows/doc-validation.yml`

**Workflow**:
```yaml
name: Documentation Validation

on:
  pull_request:
    paths:
      - '**.md'
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Validate Location
        run: npm run docs:validate-location
      - name: Validate Metadata
        run: npm run docs:validate-metadata
      - name: Validate Naming
        run: npm run docs:validate-naming
      - name: Validate Links
        run: npm run docs:validate-links
      - name: Detect Duplicates
        run: npm run docs:detect-duplicates
      - name: Generate Health Report
        run: npm run docs:health-report
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: doc-health-report
          path: docs/summaries/doc-health-reports/*.md
```

### 4.3 DOCMON Sub-Agent Automation

**Update**: `scripts/docmon-analysis.js` → `scripts/docmon-automated-audit.js`

**New Capabilities**:
1. **Scheduled Audits**: Run weekly, detect drift from standards
2. **Auto-Remediation**: Fix simple violations automatically (metadata injection, link fixes)
3. **Escalation**: Create GitHub issues for violations requiring human review
4. **Learning Mode**: Track common violations, suggest protocol updates

**Integration**: Triggered by GitHub Actions weekly

---

## Critical Files to Modify

| File Path | Change Type | Purpose |
|-----------|-------------|---------|
| `docs/03_protocols_and_standards/DOCUMENTATION_STANDARDS.md` | Major Update | Add sections 7, 8, 9 (sub-categorization, enforcement, cleanup) |
| `.claude/commands/document.md` | Minor Update | Add validation steps, duplicate detection |
| `package.json` | Addition | Add npm scripts for validation |
| `.github/workflows/doc-validation.yml` | Create New | CI/CD validation |
| `.git/hooks/pre-commit` | Create New | Pre-commit validation |
| `scripts/validate-doc-location.js` | Create New | Location validation |
| `scripts/validate-doc-metadata.js` | Create New | Metadata validation |
| `scripts/validate-doc-naming.js` | Create New | Naming validation |
| `scripts/validate-doc-links.js` | Create New | Link validation |
| `scripts/detect-duplicate-docs.js` | Create New | Duplicate detection |
| `scripts/generate-doc-metadata.js` | Create New | Auto-metadata generation |
| `scripts/doc-health-report.js` | Create New | Health dashboard |
| `scripts/cleanup-root-docs.js` | Create New | Root cleanup automation |
| `scripts/cleanup-prohibited-locations.js` | Create New | Prohibited location cleanup |
| `scripts/consolidate-database-docs.js` | Create New | Database doc consolidation |
| `scripts/consolidate-testing-docs.js` | Create New | Testing doc consolidation |
| `scripts/rename-numeric-prefixed-files.js` | Create New | Numeric prefix renaming |
| `scripts/docmon-automated-audit.js` | Major Update | Enhanced DOCMON automation |

---

## Verification & Testing

### Pre-Execution Validation

1. **Dry-Run Mode**: All cleanup scripts MUST support `--dry-run` flag
   - Shows what would be moved/changed without executing
   - Generates preview manifest for review
   - User confirms before actual execution

2. **Backup Strategy**: Before bulk operations:
   - Create git branch: `docs/cleanup-[PHASE-NAME]`
   - Create archive snapshot: `docs/archive/pre-cleanup-snapshot/`
   - Document rollback procedure

### Post-Execution Validation

1. **Run Full Validation Suite**:
   ```bash
   npm run docs:validate
   ```
   Target: 100% pass rate

2. **Generate Health Report**:
   ```bash
   npm run docs:health-report
   ```
   Target: Score >90/100 (vs current 45/100)

3. **Manual Spot-Checks**:
   - Verify 10 random files have correct metadata
   - Verify 10 random cross-references resolve correctly
   - Verify folder structure matches standards
   - Verify no files in prohibited locations

4. **Link Validation**:
   ```bash
   npm run docs:validate-links
   ```
   Target: 0 broken links

### Success Criteria

| Metric | Current | Target | Validation Method |
|--------|---------|--------|-------------------|
| Files in root | 53 | ≤10 | `npm run docs:validate-location` |
| Files in prohibited locations | 72 | 0 | `npm run docs:validate-location` |
| Database doc files | 38+ | 8 | Manual count in `docs/database/` |
| Testing doc files | 18+ | 6 | Manual count in `docs/05_testing/` |
| Folders at docs root | 58 | ~25 | Manual count |
| Files with metadata | ~40% | 100% | `npm run docs:validate-metadata` |
| Broken links | Unknown | 0 | `npm run docs:validate-links` |
| Duplicate files | ~50+ | <5% | `npm run docs:detect-duplicates` |
| Health Score | 45/100 | >90/100 | `npm run docs:health-report` |

---

## Execution Timeline

**Estimated Duration**: 8-12 hours (split across multiple sessions)

| Phase | Duration | Dependencies | Deliverable |
|-------|----------|--------------|-------------|
| 1. Discovery & Rubric | 2 hours | None | Decision tree, validation scripts created |
| 2.1-2.2 Root & Prohibited Cleanup | 1.5 hours | Phase 1 | 120 files moved to correct locations |
| 2.3 Database Consolidation | 2 hours | Phase 1 | 38 files → 8 canonical files |
| 2.4 Testing Consolidation | 1.5 hours | Phase 1 | 18 files → 6 canonical files |
| 2.5 Numeric Renaming | 1 hour | Phase 1 | 30 files renamed to kebab-case |
| 2.6 Folder Rationalization | 1.5 hours | Phase 2.1-2.5 | 58 folders → 25 folders |
| 2.7 Metadata Injection | 2 hours | Phase 2.6 | 1000+ files with metadata |
| 2.8 Link Validation | 1 hour | Phase 2.7 | Broken links fixed |
| 3. Protocol Enhancement | 1.5 hours | Phase 2 | Updated standards & validation |
| 4. Monitoring Setup | 1 hour | Phase 3 | CI/CD & automation active |

**Parallelization Opportunities**:
- Phase 2.3 and 2.4 can run in parallel (database & testing consolidation)
- Phase 2.7 can start during Phase 2.6 (metadata injection while folders being organized)

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broken links after moves | High | Medium | Automated link validation & repair script |
| Lost content during consolidation | Low | High | Archive originals before merging, dry-run mode |
| Incorrect file categorization | Medium | Medium | Manual review of rubric decisions, dry-run preview |
| Git conflicts in large move commits | Medium | Low | Separate commits per phase, clear commit messages |
| User confusion from reorganization | Medium | Medium | Update README with "Where did X go?" migration guide |
| Validation scripts have bugs | Medium | Low | Test on sample subset first, manual spot-checks |

---

## Open Questions for User

None - user has provided clear direction on all key decisions.

---

## Next Steps After Plan Approval

1. Create git branch: `docs/organizational-cleanup`
2. Execute Phase 1 (Discovery & Rubric Development)
3. Run dry-run of Phase 2.1 (Root Cleanup) for user review
4. Upon approval, execute full Phase 2 cleanup
5. Update protocols in Phase 3
6. Set up monitoring in Phase 4
7. Generate before/after health report comparison
8. Create PR with comprehensive documentation of changes

---

**Plan Version**: 1.0
**Created**: 2026-01-26
**Assessment Input**: 2,516 files across 58 folders, health score 45/100
**Target Outcome**: Well-organized documentation with health score >90/100, clear rubrics, automated enforcement
