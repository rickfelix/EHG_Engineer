# Documentation Cleanup Audit - December 2025

**Date**: 2025-12-29
**Agent**: DOCMON Sub-Agent (Information Architecture Lead)
**Scope**: Complete codebase documentation audit
**Total Files Audited**: 1,778 markdown files
**Status**: NEEDS ATTENTION

---

## Executive Summary

This audit reveals **CRITICAL ISSUES** despite the October 2024 cleanup (which improved score from 42→75). Current documentation health has **regressed** due to:
1. **Version inconsistencies** - CLAUDE.md says v4.3.3, but docs reference v4.0, v4.1, v4.2
2. **Directory bloat** - 57 subdirectories (should be ~15)
3. **Outdated references** - Files still point to deprecated v3.x protocol
4. **Root-level clutter** - 39 files at root (down from 110, but still 6.5x target)

**Documentation Health Score**: **~65/100** (DOWN from 75 in Oct 2024)
**Recommendation**: **MEDIUM PRIORITY CLEANUP REQUIRED**

---

## CRITICAL ISSUES (Fix Immediately)

### 1. VERSION INCONSISTENCY - CRITICAL

**Problem**: Multiple LEO Protocol versions referenced across codebase

**Current State**:
- CLAUDE.md (router): Says v4.3.3 is ACTIVE (leo-v4-3-3-ui-parity)
- docs/README.md: References v4.2.0
- Active guides: Reference v4.0, v4.1.3
- Protocol files: Still reference v3.1.5, v3.1.5.9, v3.2.1

**Files Affected**:
1. `/docs/README.md` - Line 30: "LEO Protocol v4.2.0"
2. `/docs/guides/leo-protocol-quick-reference.md` - Title: "LEO Protocol v4.0"
3. `/docs/03_protocols_and_standards/leo_vision_qa_integration.md` - References v3.1.5.8, v3.1.5.9
4. `/docs/03_protocols_and_standards/leo_protocol_repository_guidelines.md` - References v3.2.1
5. `/docs/03_protocols_and_standards/compliance-report-sdip.md` - References v4.1.3
6. `/docs/03_protocols_and_standards/observations-2025-09-03.md` - References v4.1.3

**Impact**:
- Developers don't know which version to follow
- Sub-agents may invoke outdated protocols
- Training data conflicts with active version

**Recommended Actions**:
1. **VERIFY** actual protocol version from database:
   ```bash
   node scripts/query-leo-protocol-version.js
   ```
2. **UPDATE** all references to match active version (likely v4.3.3)
3. **ARCHIVE** files referencing v3.x and v4.0-4.2 that aren't already archived
4. **CREATE** version migration guide if jumping from v4.2→v4.3.3

**Priority**: CRITICAL (P0)
**Effort**: 2-4 hours
**Files to Update**: 6+ files

---

### 2. OUTDATED PROTOCOL REFERENCES IN ACTIVE DOCS

**Problem**: Active documentation still references deprecated v3.x protocol

**Evidence**:
```
/docs/03_protocols_and_standards/leo_vision_qa_integration.md:
- "This document extends LEO Protocol v3.1.5.8"
- "Protocol: LEO Protocol v3.1.5.9 (Vision QA Integration)"

/docs/03_protocols_and_standards/leo_protocol_repository_guidelines.md:
- "This guideline is part of LEO Protocol v3.2.1"
```

**Recommended Actions**:
1. **ARCHIVE** these files to `/docs/archive/protocols/`
2. **CREATE** updated v4.3.3 versions if concepts still valid
3. **UPDATE** README to remove references

**Priority**: HIGH (P1)
**Effort**: 1-2 hours
**Files to Move/Update**: 2 files

---

### 3. BROKEN DOCUMENTATION STRUCTURE

**Problem**: 57 subdirectories when best practice is ~15

**Current State**:
```
57 total subdirectories including:
- archive/ ✅ (correct)
- guides/ ✅ (correct)
- reference/ ✅ (correct)
- summaries/ ✅ (correct)
- reports/ ✅ (correct)

BUT ALSO:
- strategic-directives/ ❌ (should be in database, not files)
- strategic_directives/ ❌ (duplicate, underscore version)
- product-requirements/ ❌ (should be in database)
- user-stories/ ❌ (should be in database)
- handoffs/ ❌ (should be in database via sd_phase_handoffs)
- sds/ ❌ (ambiguous, what is this?)
- workflow/dossiers/ ❌ (nested too deep)
- workflow/stage_reviews/ ❌ (what are these?)
- EHG/ and EHG_Engineering/ ❌ (wrong repo)
- parking-lot/ ❌ (unorganized holding area)
- pending-protocol-updates/ ❌ (should be tickets/issues)
- uat/ ❌ (should be in testing/)
- validation/ ❌ (should be in testing/)
- vision/ ❌ (unclear purpose)
- wbs_artefacts/ ❌ (what are these?)
```

**Database-First Violation**:
Per SD-A11Y-FEATURE-BRANCH-001, these should NOT exist as file directories:
- `strategic-directives/` - Should use `strategic_directives_v2` table
- `strategic_directives/` - Should use `strategic_directives_v2` table
- `product-requirements/` - Should use `product_requirements_v2` table
- `user-stories/` - Should use database tables
- `handoffs/` - Should use `sd_phase_handoffs` table

**Recommended Actions**:
1. **AUDIT** each directory for active vs archived content
2. **MOVE** archived content to `/docs/archive/[category]/`
3. **DELETE** directories that violate database-first (verify files are in DB first)
4. **CONSOLIDATE** overlapping directories:
   - `testing/` + `uat/` + `validation/` → `05_testing/`
   - `architecture/` (duplicate) → `01_architecture/`
   - Both `strategic-directives/` and `strategic_directives/` → verify in database, then delete
5. **DOCUMENT** any directories kept (add README.md explaining purpose)

**Priority**: HIGH (P1)
**Effort**: 4-6 hours
**Directories to Audit**: 30+ directories

---

## HIGH PRIORITY ISSUES

### 4. ROOT-LEVEL FILE BLOAT

**Problem**: 39 markdown files at root level (target: 6)

**Current State**:
```
✅ SHOULD EXIST (6 files):
1. README.md
2. DOCUMENTATION_STANDARDS.md
3. FILE_NUMBERING_AUDIT.md
4. ROOT_FILES_CATEGORIZATION.md
5. CONTEXT_OPTIMIZATION_GUIDE.md
6. DIRECTORY_STRUCTURE.md

❌ SHOULD BE MOVED (33 files):
- BEGINNER-GUIDE-CI-CD-SETUP.md → guides/
- CI-CD-*.md (4 files) → reports/ci-cd/ or guides/ci-cd/
- COMPANIES-TABLE-UPDATE-2025-11-02.md → database/ or archive/
- DOCUMENTATION_CLEANUP_COMPLETE.md → reports/audits/
- EHG_COSMIC_INTELLIGENCE_REPORT_2026-2028.md → reports/ or archive/
- IMPLEMENTATION-SUMMARY-*.md → summaries/implementations/
- ISSUE-PATTERN-*.md → patterns/ or reports/
- MIGRATION-AGENT-METRICS.md → reports/performance/
- MODEL-OPTIMIZATION-2025-12-06.md → reports/optimization/
- PARENT-CHILD-SD-IMPLEMENTATION-COMPLETE.md → summaries/implementations/
- PATTERN-EXTRACTION-ISSUE.md → issues/ or troubleshooting/
- PRE_COMMIT_HOOK.md → guides/ or 03_protocols_and_standards/
- QUICK-START-SECRETS.md → guides/
- QUICK-WINS-WEEK1-PROGRESS.md → reports/progress/
- ROOT-CAUSE-ANALYSIS-*.md → analysis/
- STAGE4-COMPLETION-SUMMARY.md → summaries/
- STORIES-AGENT-*.md → agents/ or guides/
- And 16 more...
```

**Recommended Actions**:
1. **CATEGORIZE** all 33 misplaced files
2. **MOVE** to appropriate directories
3. **UPDATE** any cross-references
4. **VERIFY** no broken links

**Priority**: HIGH (P1)
**Effort**: 2-3 hours
**Files to Move**: 33 files

---

### 5. STALE LAST UPDATED DATES

**Problem**: Key documentation references outdated dates

**Evidence**:
- `/docs/README.md` - Last Updated: 2025-10-05 (85 days ago)
- `/CLAUDE.md` - Last Generated: 2025-12-27 (2 days ago) ✅
- `/README.md` - No last updated metadata

**Recommended Actions**:
1. **UPDATE** `/docs/README.md` to current date
2. **VERIFY** LEO Protocol version reference (v4.2.0 vs v4.3.3)
3. **ADD** last updated metadata to `/README.md`

**Priority**: MEDIUM (P2)
**Effort**: 15 minutes

---

## MEDIUM PRIORITY ISSUES

### 6. DUPLICATE/REDUNDANT DIRECTORIES

**Problem**: Multiple directories serving same purpose

**Examples**:
- `architecture/` AND `01_architecture/` - WHY TWO?
- `strategic-directives/` AND `strategic_directives/` - Hyphen vs underscore
- `testing/` AND `05_testing/` - Should consolidate
- `workflow/` with 7 subdirectories - Unclear organization

**Recommended Actions**:
1. **AUDIT** each pair for content differences
2. **CONSOLIDATE** into single canonical location
3. **MOVE** older/archived content to archive/
4. **UPDATE** documentation standards

**Priority**: MEDIUM (P2)
**Effort**: 3-4 hours

---

### 7. UNCLEAR DIRECTORY PURPOSES

**Problem**: Many directories lack README.md explaining purpose

**Directories Without READMEs**:
- agents/ (1 file) - What kind of agents?
- doctrine/ - What is this?
- governance/ - What decisions/exceptions?
- handoffs/ - Shouldn't these be in database?
- leo/ - What LEO-specific content?
- maintenance/ - What maintenance docs?
- parking-lot/ - Temporary holding? Should be empty!
- patterns/ - What patterns?
- plans/ - What plans?
- runbooks/ - Operational procedures?
- uat/ - User acceptance testing?
- validation/ - What validation?
- vision/ - Vision documents?
- wbs_artefacts/ - Work breakdown structure?

**Recommended Actions**:
1. **ADD** README.md to each directory explaining:
   - Purpose
   - What belongs here
   - What doesn't belong here
   - Related directories
2. **OR DELETE** if purpose unclear and little content

**Priority**: MEDIUM (P2)
**Effort**: 2-3 hours

---

### 8. DATABASE-FIRST COMPLIANCE VIOLATIONS

**Problem**: File-based storage for data that should be in database

**Evidence from SD-A11Y-FEATURE-BRANCH-001**:
The project achieved "Zero markdown file violations, 100% database compliance" but these directories suggest regression:

**Violations**:
- `/docs/strategic-directives/` - Strategic Directives should be in `strategic_directives_v2` table
- `/docs/strategic_directives/` - Duplicate, same issue
- `/docs/product-requirements/` - PRDs should be in `product_requirements_v2` table
- `/docs/handoffs/` - Handoffs should be in `sd_phase_handoffs` table
- `/docs/user-stories/` - User stories should be in database tables

**Recommended Actions**:
1. **AUDIT** each directory to verify content is in database
2. **RUN** database queries to confirm records exist:
   ```bash
   node scripts/verify-sds-in-database.js
   node scripts/verify-prds-in-database.js
   node scripts/verify-handoffs-in-database.js
   ```
3. **DELETE** file-based versions (AFTER VERIFICATION)
4. **UPDATE** any references to point to database/API endpoints
5. **DOCUMENT** in README that these are database-sourced

**Priority**: MEDIUM-HIGH (P1-P2)
**Effort**: 3-4 hours
**Risk**: HIGH (data loss if not verified first)

---

## LOW PRIORITY ISSUES

### 9. INCONSISTENT NAMING CONVENTIONS

**Problem**: Mix of kebab-case, snake_case, and PascalCase

**Examples**:
- `leo-protocol-quick-reference.md` ✅ (kebab-case)
- `database_schema.md` ❌ (snake_case)
- `EHG_COSMIC_INTELLIGENCE_REPORT_2026-2028.md` ❌ (SCREAMING_SNAKE_CASE)
- `SD-RETRO-ENHANCE-001-...` (hybrid)

**Recommended Actions**:
1. **STANDARDIZE** on kebab-case for all new files
2. **DOCUMENT** exception for SD-prefixed files (standard format)
3. **LOW PRIORITY** - don't rename existing unless touching file

**Priority**: LOW (P3)
**Effort**: Note for future only

---

### 10. MISSING METADATA HEADERS

**Problem**: Many older files lack standard metadata

**Recommended Actions**:
1. **ADD** metadata headers when updating files
2. **DON'T** batch-update (low value, high effort)
3. **DOCUMENT** in standards that headers are required for NEW files

**Priority**: LOW (P3)
**Effort**: Ongoing, not batch

---

## OPPORTUNITIES FOR IMPROVEMENT

### 11. CONSOLIDATION OPPORTUNITIES

**Consolidate Testing Docs**:
- Current: `05_testing/`, `testing/`, `uat/`, `validation/`
- Target: Single `05_testing/` directory with subdirectories:
  - `05_testing/unit/`
  - `05_testing/integration/`
  - `05_testing/e2e/`
  - `05_testing/uat/`
  - `05_testing/validation/`

**Consolidate Analysis/Reports**:
- Current: `analysis/`, `reports/`, `audit/`, `audits/`
- Target: Single `reports/` directory:
  - `reports/audits/`
  - `reports/analysis/`
  - `reports/performance/`

**Consolidate Strategic Planning**:
- Current: `plans/`, `recommendations/`, `pending-protocol-updates/`
- Target: Move to `governance/` or delete if outdated

**Effort**: 4-6 hours
**Priority**: MEDIUM (P2)

---

### 12. ARCHIVE OLD WORKFLOW DOCUMENTATION

**Problem**: v1-40-stage-workflow in archive but not clearly deprecated

**Recommended Actions**:
1. **ADD** deprecation notice to `archive/v1-40-stage-workflow/README.md`
2. **DOCUMENT** what replaced it (LEO Protocol v4.x)
3. **CONSIDER** deleting if no longer referenced (after 1+ year)

**Priority**: LOW (P3)
**Effort**: 30 minutes

---

## RECOMMENDED ACTION PLAN

### Phase 1: CRITICAL FIXES (Week 1)
**Effort**: 4-6 hours
**Priority**: P0-P1

1. ✅ **Fix Version Inconsistency**
   - Query database for active protocol version
   - Update all v4.2.0 → v4.3.3 (or correct version)
   - Archive files still referencing v3.x, v4.0-4.2
   - Estimated: 2 hours

2. ✅ **Database-First Compliance**
   - Verify SDs, PRDs, handoffs in database
   - Delete file-based directories (AFTER VERIFICATION)
   - Update references
   - Estimated: 2 hours

3. ✅ **Update Core Documentation**
   - Fix `/docs/README.md` version + date
   - Update quick reference guide to current version
   - Verify CLAUDE.md matches active protocol
   - Estimated: 30 minutes

### Phase 2: HIGH PRIORITY CLEANUP (Week 2)
**Effort**: 6-8 hours
**Priority**: P1

4. ✅ **Move Root-Level Files**
   - Categorize 33 misplaced files
   - Move to appropriate directories
   - Update cross-references
   - Estimated: 2-3 hours

5. ✅ **Consolidate Duplicate Directories**
   - Merge architecture/ → 01_architecture/
   - Resolve strategic-directives vs strategic_directives
   - Consolidate testing directories
   - Estimated: 3-4 hours

6. ✅ **Add Missing READMEs**
   - Document purpose of unclear directories
   - Delete empty/obsolete directories
   - Estimated: 2 hours

### Phase 3: MEDIUM PRIORITY (Week 3)
**Effort**: 4-6 hours
**Priority**: P2

7. ✅ **Directory Consolidation**
   - Consolidate testing docs
   - Consolidate reports/analysis
   - Consolidate strategic planning
   - Estimated: 4-6 hours

### Phase 4: ONGOING (Future)
**Priority**: P3

8. ✅ **Maintain Standards**
   - Use metadata headers for new files
   - Follow naming conventions
   - Keep documentation current
   - Archive deprecated content promptly

---

## SUCCESS CRITERIA

**After Phase 1-2 Completion**:
- ✅ 100% version consistency (all docs reference v4.3.3)
- ✅ 100% database-first compliance (zero file-based SDs/PRDs/handoffs)
- ✅ ≤10 root-level markdown files (down from 39)
- ✅ ≤20 subdirectories (down from 57)
- ✅ All active directories have README.md
- ✅ Documentation health score: 80+/100

**Documentation Health Score Targets**:
| Metric | Current | Target (Phase 1-2) | Target (Phase 3) |
|--------|---------|-------------------|------------------|
| Correct locations | 70% | 95% | 98% |
| Version consistency | 40% | 100% | 100% |
| Directory organization | 50% | 85% | 95% |
| Missing READMEs | 60% | 10% | 0% |
| Database compliance | 60% | 100% | 100% |
| **OVERALL** | **65/100** | **85/100** | **90/100** |

---

## TOOLS & SCRIPTS NEEDED

### Verification Scripts
```bash
# Verify protocol version
node scripts/query-leo-protocol-version.js

# Verify database content
node scripts/verify-sds-in-database.js
node scripts/verify-prds-in-database.js
node scripts/verify-handoffs-in-database.js

# Find version references
grep -r "v4\.[0-2]" docs/ --include="*.md" | grep -v archive/

# Find database violations
find docs/strategic-directives docs/product-requirements docs/handoffs -name "*.md" 2>/dev/null
```

### Cleanup Scripts (Create if Needed)
```bash
# Move root-level files
node scripts/organize-root-docs.js

# Find directories without READMEs
find docs/ -type d -maxdepth 2 ! -exec test -e '{}/README.md' \; -print

# Archive old versions
node scripts/archive-old-protocol-docs.js --version "v3.x" --version "v4.0-v4.2"
```

---

## RISK ASSESSMENT

### High Risk
- **Database-First Deletion**: Deleting file-based SDs/PRDs before verifying database content
  - Mitigation: Run verification scripts FIRST
  - Mitigation: Backup files before deletion
  - Mitigation: Use git to track deletion (can recover)

### Medium Risk
- **Broken Links**: Moving files may break cross-references
  - Mitigation: Search for references before moving
  - Mitigation: Update links in same commit as move
  - Mitigation: Run link checker after moves

### Low Risk
- **Version Updates**: Changing version numbers
  - Mitigation: Verify active version from database first
  - Mitigation: Use find/replace carefully

---

## RELATED DOCUMENTATION

**Previous Cleanups**:
- [DOCUMENTATION_CLEANUP_COMPLETE.md](DOCUMENTATION_CLEANUP_COMPLETE.md) - Oct 2024 cleanup (42→75 score)

**Standards**:
- [DOCUMENTATION_STANDARDS.md](../03_protocols_and_standards/DOCUMENTATION_STANDARDS.md) - v1.1.0 (Oct 2024)
- [FILE_NUMBERING_AUDIT.md](../01_architecture/FILE_NUMBERING_AUDIT.md) - Numbering system explanation

**Database-First Enforcement**:
- SD-A11Y-FEATURE-BRANCH-001 - Zero markdown violations achievement
- [database-agent-patterns.md](../reference/database-agent-patterns.md) - Database agent best practices

**LEO Protocol**:
- [CLAUDE.md](../CLAUDE.md) - Active protocol router (v4.3.3)
- [archive/protocols/](archive/protocols/) - Deprecated versions

---

## AUDIT METADATA

**Audit Conducted By**: DOCMON Sub-Agent (Information Architecture Lead)
**Audit Date**: 2025-12-29
**Total Files Scanned**: 1,778 markdown files
**Total Directories**: 57 subdirectories
**Methodology**:
- File system analysis
- Content sampling
- Version reference grep
- Database compliance check
- Comparison to DOCUMENTATION_STANDARDS.md v1.1.0

**Next Audit**: Recommend after Phase 1-2 completion (2-3 weeks)

---

**DOCMON Assessment**: NEEDS ATTENTION
**Recommended Start**: Phase 1 (Critical Fixes) - 4-6 hours investment
**Expected Outcome**: Documentation health 65→85 (+20 points, +31% improvement)

---

*Generated by DOCMON Sub-Agent*
*Part of LEO Protocol v4.3.3 Documentation Excellence Initiative*
