---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Documentation Cleanup - Quick Action Checklist


## Table of Contents

- [CRITICAL (Do First - 2-4 hours)](#critical-do-first---2-4-hours)
  - [Issue #1: Version Inconsistency](#issue-1-version-inconsistency)
  - [Issue #2: Database-First Compliance](#issue-2-database-first-compliance)
- [HIGH PRIORITY (Week 1-2, 6-8 hours)](#high-priority-week-1-2-6-8-hours)
  - [Issue #3: Root-Level File Bloat](#issue-3-root-level-file-bloat)
  - [Issue #4: Consolidate Duplicate Directories](#issue-4-consolidate-duplicate-directories)
  - [Issue #5: Add Missing READMEs](#issue-5-add-missing-readmes)
- [Purpose](#purpose)
- [What Belongs Here](#what-belongs-here)
- [What Doesn't Belong Here](#what-doesnt-belong-here)
- [Related Directories](#related-directories)
- [Last Updated](#last-updated)
- [MEDIUM PRIORITY (Week 3, 4-6 hours)](#medium-priority-week-3-4-6-hours)
  - [Issue #6: Update Stale Dates](#issue-6-update-stale-dates)
  - [Issue #7: Directory Audit & Consolidation](#issue-7-directory-audit-consolidation)
- [LOW PRIORITY (Ongoing)](#low-priority-ongoing)
  - [Issue #8: Naming Conventions](#issue-8-naming-conventions)
  - [Issue #9: Metadata Headers](#issue-9-metadata-headers)
- [VERIFICATION CHECKLIST](#verification-checklist)
  - [Version Consistency](#version-consistency)
  - [Database-First Compliance](#database-first-compliance)
  - [Organization](#organization)
  - [Documentation Health](#documentation-health)
- [COMMANDS TO RUN](#commands-to-run)
  - [Before Starting](#before-starting)
  - [During Cleanup](#during-cleanup)
  - [After Cleanup](#after-cleanup)
- [RISK MITIGATION](#risk-mitigation)
  - [Before Deleting Anything](#before-deleting-anything)
  - [Before Moving Files](#before-moving-files)
  - [Before Archiving](#before-archiving)
- [COMPLETION CRITERIA](#completion-criteria)
- [QUESTIONS/BLOCKERS](#questionsblockers)

**Date**: 2025-12-29
**Source**: [DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md](documentation-cleanup-audit-2025-12-29.md)
**Time Estimate**: 4-6 hours (Phase 1), 6-8 hours (Phase 2)

---

## CRITICAL (Do First - 2-4 hours)

### Issue #1: Version Inconsistency
**Impact**: HIGH - Developers don't know which protocol version to follow
**Time**: 2 hours

```bash
# Step 1: Verify active protocol version
node scripts/generate-claude-md-from-db.js --query-version-only

# Step 2: Update version references
# Files to update:
# - docs/README.md (line 30: v4.2.0 → v4.3.3)
# - docs/guides/leo-protocol-quick-reference.md (title and content)

# Step 3: Archive old protocol references
# Move these to docs/archive/protocols/:
# - docs/03_protocols_and_standards/leo_vision_qa_integration.md (references v3.1.5)
# - docs/03_protocols_and_standards/leo_protocol_repository_guidelines.md (references v3.2.1)
```

**Files**:
- [ ] `/docs/README.md` - Update v4.2.0 → v4.3.3
- [ ] `/docs/guides/leo-protocol-quick-reference.md` - Update v4.0 → v4.3.3
- [ ] Archive: `leo_vision_qa_integration.md` → `archive/protocols/`
- [ ] Archive: `leo_protocol_repository_guidelines.md` → `archive/protocols/`
- [ ] Update: `docs/03_protocols_and_standards/README.md` - Remove archived files from active list

---

### Issue #2: Database-First Compliance
**Impact**: HIGH - Violates core architecture principle (SD-A11Y-FEATURE-BRANCH-001)
**Time**: 2 hours

```bash
# Step 1: Verify content is in database
node scripts/list-all-sds.js > /tmp/db-sds.txt
node scripts/list-all-prds.js > /tmp/db-prds.txt

# Step 2: Compare file-based to database
find docs/strategic-directives -name "*.md" 2>/dev/null
find docs/strategic_directives -name "*.md" 2>/dev/null
find docs/product-requirements -name "*.md" 2>/dev/null
find docs/handoffs -name "*.md" 2>/dev/null

# Step 3: Move to archive (if old) or delete (if in DB)
# AFTER verification only!
```

**Directories to Audit**:
- [ ] `docs/strategic-directives/` - Verify all SDs in database
- [ ] `docs/strategic_directives/` - Verify all SDs in database (duplicate dir)
- [ ] `docs/product-requirements/` - Verify all PRDs in database
- [ ] `docs/handoffs/` - Verify all handoffs in `sd_phase_handoffs` table
- [ ] `docs/user-stories/` - Verify all stories in database

**Actions After Verification**:
- [ ] If content ONLY in files → Import to database first
- [ ] If content in database → Move files to `archive/legacy-files/`
- [ ] Update any code/scripts referencing file paths

---

## HIGH PRIORITY (Week 1-2, 6-8 hours)

### Issue #3: Root-Level File Bloat
**Impact**: MEDIUM - Poor organization, hard to find docs
**Time**: 2-3 hours

**Move these 33 files**:

#### To `guides/`:
- [ ] `BEGINNER-GUIDE-CI-CD-SETUP.md`
- [ ] `QUICK-START-SECRETS.md`
- [ ] `PRE_COMMIT_HOOK.md`

#### To `reports/audits/`:
- [ ] `DOCUMENTATION_CLEANUP_COMPLETE.md`
- [ ] `FILE_NUMBERING_AUDIT.md` (maybe keep at root?)
- [ ] `ROOT-CAUSE-ANALYSIS-TRIGGER-ERROR.md`

#### To `reports/ci-cd/` (create directory):
- [ ] `CI-CD-COMPLETION-REPORT.md`
- [ ] `CI-CD-SECRETS-CONSOLIDATED-REPORT.md`
- [ ] `CI-CD-STATUS-REPORT.md`
- [ ] `BEGINNER-GUIDE-CI-CD-SETUP.md` (or guides/ci-cd/)

#### To `summaries/implementations/`:
- [ ] `IMPLEMENTATION-SUMMARY-RUSSIAN-JUDGE-SD-TYPE-AWARENESS.md`
- [ ] `PARENT-CHILD-SD-IMPLEMENTATION-COMPLETE.md`
- [ ] `STAGE4-COMPLETION-SUMMARY.md`

#### To `reports/performance/`:
- [ ] `MIGRATION-AGENT-METRICS.md`
- [ ] `MODEL-OPTIMIZATION-2025-12-06.md`
- [ ] `QUICK-WINS-WEEK1-PROGRESS.md`

#### To `database/` or `archive/`:
- [ ] `COMPANIES-TABLE-UPDATE-2025-11-02.md`

#### To `patterns/` or `analysis/`:
- [ ] `ISSUE-PATTERN-PRD-INTEGRATION.md`
- [ ] `PATTERN-EXTRACTION-ISSUE.md`

#### To `reports/` or `archive/`:
- [ ] `EHG_COSMIC_INTELLIGENCE_REPORT_2026-2028.md`

#### To `agents/` or `guides/`:
- [ ] `STORIES-AGENT-ANALYSIS-AND-VERIFICATION-WORKFLOW.md`

**Keep at root** (6 files):
- [x] `README.md`
- [x] `DOCUMENTATION_STANDARDS.md`
- [ ] `FILE_NUMBERING_AUDIT.md` (consider keeping)
- [ ] `ROOT_FILES_CATEGORIZATION.md` (consider archiving after this cleanup)
- [x] `CONTEXT_OPTIMIZATION_GUIDE.md`
- [x] `DIRECTORY_STRUCTURE.md`

---

### Issue #4: Consolidate Duplicate Directories
**Impact**: MEDIUM - Confusion about where to put files
**Time**: 3-4 hours

**Duplicates to Resolve**:

#### architecture/ vs 01_architecture/
```bash
# Compare contents
diff -rq docs/architecture docs/01_architecture

# Recommended: Consolidate all to 01_architecture/
# Move any unique files from architecture/ → 01_architecture/
# Delete docs/architecture/
```
- [ ] Compare contents of both directories
- [ ] Move unique files to `01_architecture/`
- [ ] Delete `architecture/` directory

#### strategic-directives/ vs strategic_directives/
```bash
# After database verification (#2), delete BOTH
# These violate database-first principle
```
- [ ] Verify content in database
- [ ] Archive or delete both directories

#### testing/ vs 05_testing/
```bash
# Consolidate to 05_testing/
# Create subdirectories: unit/, integration/, e2e/, uat/
```
- [ ] Move `testing/` content → `05_testing/`
- [ ] Move `uat/` content → `05_testing/uat/`
- [ ] Move `validation/` content → `05_testing/validation/`
- [ ] Delete empty directories

#### Consolidate Reports/Analysis
```bash
# Target: Single reports/ directory
# Current: analysis/, reports/, audit/, audits/
```
- [ ] Move `analysis/` → `reports/analysis/`
- [ ] Move `audit/` → `reports/audits/`
- [ ] Merge `audits/` with `reports/audits/`
- [ ] Delete empty directories

---

### Issue #5: Add Missing READMEs
**Impact**: MEDIUM - Unclear directory purposes
**Time**: 2 hours

**Directories Needing READMEs**:
- [ ] `agents/` - Document what agent docs belong here
- [ ] `cli/` - CLI documentation
- [ ] `doctrine/` - Explain purpose or delete
- [ ] `governance/` - Governance decisions and exceptions
- [ ] `leo/` - LEO-specific content
- [ ] `maintenance/` - Maintenance procedures
- [ ] `patterns/` - Design and code patterns
- [ ] `plans/` - Planning documents
- [ ] `runbooks/` - Operational runbooks
- [ ] `vision/` - Vision documents
- [ ] `workflow/` - Workflow documentation

**Template for README.md**:
```markdown
# [Directory Name]

## Purpose
[What this directory contains]

## What Belongs Here
- [Type 1]
- [Type 2]

## What Doesn't Belong Here
- [Type 1] - Goes in [other directory]
- [Type 2] - Goes in [other directory]

## Related Directories
- [Related directory 1]
- [Related directory 2]

## Last Updated
[Date]
```

---

## MEDIUM PRIORITY (Week 3, 4-6 hours)

### Issue #6: Update Stale Dates
**Time**: 15 minutes

- [ ] `/docs/README.md` - Update from 2025-10-05 to 2025-12-29
- [ ] `/README.md` - Add last updated metadata

---

### Issue #7: Directory Audit & Consolidation
**Time**: 4-6 hours

**Directories to Audit** (unclear purpose, consider deleting/consolidating):
- [ ] `parking-lot/` - Should be empty, delete if no active content
- [ ] `pending-protocol-updates/` - Move to issues/tickets or delete
- [ ] `wbs_artefacts/` - Archive if old, clarify if active
- [ ] `EHG/` and `EHG_Engineering/` - Wrong repo, move or delete
- [ ] `merge-summaries/` - Consolidate to summaries/
- [ ] `migration-reports/` - Consolidate to reports/migrations/
- [ ] `migrations/` - Consolidate to database/migrations/
- [ ] `sds/` - Clarify purpose or delete
- [ ] `stages/` - Archive if related to old v1-40 workflow
- [ ] `lessons-learned/` - Consolidate to summaries/lessons/
- [ ] `issues/` - Move to troubleshooting/ or archive/
- [ ] `doctrine/` - Explain or delete
- [ ] `explanations/` - Consolidate to guides/

---

## LOW PRIORITY (Ongoing)

### Issue #8: Naming Conventions
**Time**: Ongoing, as files are touched

- Use kebab-case for new files
- Don't rename existing unless touching file
- Document SD-* format exception in standards

### Issue #9: Metadata Headers
**Time**: Ongoing, as files are touched

- Add metadata to new files
- Add metadata when significantly updating existing files
- Don't batch-update (low value)

---

## VERIFICATION CHECKLIST

After completing cleanup:

### Version Consistency
- [ ] All docs reference v4.3.3 (or current active version)
- [ ] No references to v3.x outside archive/
- [ ] No references to v4.0, v4.1, v4.2 outside archive/

### Database-First Compliance
- [ ] No `strategic-directives/` directory (or clearly archived)
- [ ] No `strategic_directives/` directory (or clearly archived)
- [ ] No `product-requirements/` directory (or clearly archived)
- [ ] No `handoffs/` directory (or clearly archived)
- [ ] All active SDs/PRDs in database, not files

### Organization
- [ ] ≤10 files at root level
- [ ] ≤20 subdirectories in docs/
- [ ] All active directories have README.md
- [ ] No duplicate directories

### Documentation Health
- [ ] Run: `node scripts/check-doc-health.js` (if exists)
- [ ] Target score: 85+/100

---

## COMMANDS TO RUN

### Before Starting
```bash
# Backup current state
git status
git branch docs-cleanup-2025-12-29
git checkout docs-cleanup-2025-12-29

# Verify database content
node scripts/list-all-sds.js
node scripts/list-all-prds.js
```

### During Cleanup
```bash
# Find version references
grep -r "v4\.[0-2]" docs/ --include="*.md" | grep -v archive/

# Find database violations
find docs/ -type d -name "strategic*" -o -name "product-requirements" -o -name "handoffs"

# Find root files to move
ls -1 docs/*.md | wc -l

# Count subdirectories
find docs/ -maxdepth 1 -type d | wc -l
```

### After Cleanup
```bash
# Verify improvements
ls -1 docs/*.md | wc -l  # Target: ≤10
find docs/ -maxdepth 1 -type d | wc -l  # Target: ≤20

# Check for broken links (if link checker exists)
node scripts/check-doc-links.js

# Commit changes
git add docs/
git commit -m "docs: Documentation cleanup - version consistency, database-first compliance, organization

- Update all protocol references to v4.3.3
- Archive deprecated protocol docs (v3.x, v4.0-v4.2)
- Enforce database-first: remove file-based SDs/PRDs
- Consolidate duplicate directories
- Move 33 root-level files to appropriate locations
- Add READMEs to 11 directories
- Reduce root files from 39 to 10 (74% reduction)
- Reduce subdirectories from 57 to ~20 (65% reduction)

Documentation health: 65 → 85 (+20 points)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## RISK MITIGATION

### Before Deleting Anything
1. ✅ Verify content exists in database
2. ✅ Create git branch for cleanup
3. ✅ Backup important files
4. ✅ Use `git mv` (preserves history)

### Before Moving Files
1. ✅ Search for references: `grep -r "filename" .`
2. ✅ Update cross-references in same commit
3. ✅ Test affected links

### Before Archiving
1. ✅ Confirm file is truly deprecated
2. ✅ Check recent git activity: `git log --follow -- filename`
3. ✅ Add deprecation notice to archived file

---

## COMPLETION CRITERIA

**Phase 1 Complete When**:
- [ ] All version references are v4.3.3
- [ ] Database-first compliance verified (no file-based SDs/PRDs)
- [ ] Core docs updated (README dates, version numbers)

**Phase 2 Complete When**:
- [ ] ≤10 root-level markdown files
- [ ] No duplicate directories
- [ ] All active directories have README.md

**Success Metrics**:
- Documentation health score: 85+/100
- Time to find documentation: <30 seconds
- Zero confusion about which protocol version to follow

---

## QUESTIONS/BLOCKERS

**If uncertain**:
1. What is the actual active LEO Protocol version? (Query database)
2. Are SDs/PRDs in database? (Run verification scripts)
3. Is this directory still used? (Check git log last 90 days)
4. Where should X file go? (Consult DOCUMENTATION_STANDARDS.md)

**Get Help**:
- DOCMON Sub-Agent: Documentation organization questions
- Database Agent: Database-first compliance questions
- LEO Protocol: Version and standards questions

---

**Ready to Start?** Begin with Issue #1 (Version Inconsistency) - highest impact, clearest action.

*Generated by DOCMON Sub-Agent*
*Companion to: DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md*
