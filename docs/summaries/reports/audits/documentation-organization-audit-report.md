# Documentation Organization Audit Report


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, migration

**Generated**: 2025-10-19
**Auditor**: DOCMON (Information Architecture Lead Sub-Agent)
**Scope**: Comprehensive analysis of documentation structure and organization

---

## Executive Summary

The EHG_Engineer codebase contains **557 markdown files** across multiple directories with significant organizational issues affecting discoverability, maintainability, and consistency. This audit identifies **critical**, **high**, **medium**, and **low** priority issues requiring immediate attention.

**Key Metrics**:
- Total markdown files in `/docs`: 557
- Markdown files in project root: 54
- Temporary files needing cleanup: 11+
- Duplicate guide directories: 2 (`/docs/03_guides` and `/docs/guides`)
- Status/completion docs in wrong location: 20+
- CLAUDE context files scattered across 4+ locations

---

## Critical Priority Issues

### 1. Incorrect Project README
**File**: `/mnt/c/_EHG/EHG_Engineer/README.md`
**Issue**: Root README is the Supabase CLI documentation, NOT EHG_Engineer project documentation
**Impact**: New developers/contributors get completely wrong project information
**Fix**: Replace with actual EHG_Engineer project README

**Recommended Action**:
```bash
# Rename wrong README
mv README.md SUPABASE_CLI_README.md

# Use existing project README from docs
cp ../../guides/EHG_ENGINEER_README.md README.md
# OR create new comprehensive README
```

### 2. Duplicate Guide Directories
**Locations**:
- `/docs/03_guides/` (6 files)
- `/docs/guides/` (11 files)

**Issue**: Two separate directories for guides with different content
**Duplicate Files**:
- `AI_GUIDE.md` exists in both but with different content (124 vs 229 lines)
- `PROJECT_REGISTRATION_GUIDE.md` exists in both

**Impact**:
- Confusion about which is authoritative
- Risk of updating wrong version
- Maintenance overhead

**Recommended Action**:
```bash
# Consolidate into /docs/guides/ (more discoverable)
# 1. Merge unique content from /docs/03_guides/ into /docs/guides/
# 2. Resolve AI_GUIDE.md conflict (keep longer/newer version)
# 3. Remove /docs/03_guides/ directory
# 4. Update all references
```

### 3. Session Status Files in Project Root
**Count**: 54 markdown files in root directory
**Issue**: Status files, summaries, and temporary session notes polluting project root

**Examples**:
- `CHECKPOINT2_STATUS.md`
- `SD-DATA-INTEGRITY-001-IMPLEMENTATION-STATUS.md`
- `SD-EVA-MEETING-002_SESSION_STATUS.md`
- `SD-NAV-REFACTOR-001_SESSION_STATUS.md`
- `CONTEXT_MANAGEMENT_IMPLEMENTATION_COMPLETE.md`
- `DATABASE_MIGRATION_COMPLETE.md`

**Impact**:
- Project root cluttered and unprofessional
- Hard to find important configuration files
- Poor first impression for new developers

**Recommended Action**:
```bash
# Move to appropriate docs subdirectories:
# - *_STATUS.md → /docs/summaries/
# - *_COMPLETE.md → /docs/summaries/
# - *_SUMMARY.md → /docs/summaries/
# - SD-*_SESSION_STATUS.md → /docs/summaries/sd-sessions/
# - temp-*.md → /docs/archive/temp/ (or delete if obsolete)
```

---

## High Priority Issues

### 4. Temporary Files in Production Codebase
**Files**:
```
/temp-api-access-and-clarifications.md
/temp-backlog-exception-sd-video-variant-001.md
/temp-exec-remediation-plan-sd-board-002.md
/temp-plan-verification-verdict-sd-board-002.md
/temp-sd-scope-update-manual.md
/temp-sub-agent-aggregated-summary.md
/temp-sub-agent-database-architect-assessment.md
/temp-sub-agent-design-assessment.md
/temp-sub-agent-systems-analyst-assessment.md
/temp-subagent-issues-to-fix.md
/TEST_INFRASTRUCTURE_SUMMARY.md
```

**Issue**: 11+ temporary files in root with "temp-" prefix
**Impact**:
- Indicates incomplete cleanup
- May contain outdated information
- Clutters repository

**Recommended Action**:
```bash
# Review each temp file:
# - If still needed → move to /docs/archive/temp/ with date prefix
# - If obsolete → delete
# - If valuable → integrate into proper documentation
```

### 5. Backup Files in Repository
**Count**: 40+ `.backup` files
**Locations**:
- `/scripts/*.backup` (38 files)
- `/CLAUDE.md.backup`
- `/package.json.bak`
- `/database/migrations/*.backup`

**Issue**: Backup files committed to git (git already provides versioning)
**Impact**:
- Repository bloat
- Confusion about which version to use
- Poor git hygiene

**Recommended Action**:
```bash
# Add to .gitignore:
*.backup
*.bak
*.old
*.tmp

# Remove from repository:
git rm **/*.backup **/*.bak
```

### 6. CLAUDE Context Files Scattered
**Locations**:
- `/CLAUDE.md`, `/CLAUDE_CORE.md`, `/CLAUDE_EXEC.md`, `/CLAUDE_LEAD.md`, `/CLAUDE_PLAN.md` (root)
- `/docs/01_architecture/CLAUDE-PLAN.md`
- `/docs/02_api/CLAUDE-API.md`, `/docs/02_api/CLAUDE-DOCUMENTATION.md`
- `/docs/04_features/CLAUDE-*.md` (9 files)
- `/docs/05_testing/CLAUDE-TESTING.md`
- `/docs/guides/CLAUDE-LEO.md`
- `/.claude/` directory with agents

**Issue**: CLAUDE context files in 6+ different locations
**Impact**:
- Hard to find relevant context
- Duplication risk
- Inconsistent naming (CLAUDE.md vs CLAUDE-*.md)

**Recommended Action**:
```bash
# Standardize location:
# 1. Keep /.claude/ directory for agent definitions
# 2. Keep /CLAUDE*.md in root (these are generated from database)
# 3. Move /docs/**/CLAUDE-*.md to /.claude/context/ or /docs/reference/
# 4. Update references in generation scripts
```

---

## Medium Priority Issues

### 7. Inconsistent Directory Naming
**Issue**: Mix of numbered and non-numbered directories in `/docs`

**Current Structure**:
```
/docs/01_architecture/       (numbered)
/docs/02_api/                (numbered)
/docs/03_guides/             (numbered - DUPLICATE)
/docs/03_protocols_and_standards/ (numbered)
/docs/04_features/           (numbered)
/docs/05_testing/            (numbered)
/docs/06_deployment/         (numbered)
/docs/analysis/              (not numbered)
/docs/guides/                (not numbered)
/docs/reference/             (not numbered)
/docs/summaries/             (not numbered)
/docs/troubleshooting/       (not numbered)
```

**Impact**: Unclear organizational hierarchy
**Recommended Action**: Decide on convention (numbered vs semantic) and apply consistently

### 8. Status/Summary File Fragmentation
**Issue**: Status and summary files in multiple locations

**Locations**:
- `/docs/` root (117 files including many statuses)
- `/docs/summaries/` (dedicated directory)
- Project root (20+ status files)
- `/docs/reference/context-optimization/` (PHASE summaries)

**Recommended Action**: Consolidate all to `/docs/summaries/` with subdirectories:
```
/docs/summaries/
  /sd-sessions/          (SD-specific status files)
  /implementations/      (*_COMPLETE.md files)
  /migrations/           (migration summaries)
  /phase-reports/        (PHASE*.md files)
```

### 9. Missing README Files in Key Directories
**Directories Without READMEs**:
- `/database/migrations/`
- `/.claude/agents/`
- `/docs/analysis/`
- `/docs/database/`
- `/docs/handoffs/`
- `/docs/issues/`
- `/docs/migrations/`
- `/docs/product-requirements/`

**Impact**: Developers don't understand directory purpose
**Recommended Action**: Add README.md to each directory explaining:
- Purpose
- File naming conventions
- When to add files here
- Related directories

### 10. Handoff Documentation Scattered
**Issue**: Handoff-related docs in multiple locations

**Files**:
```
/docs/02_api/HANDOFF-LEAD-PLAN-2025-001.md
/docs/03_protocols_and_standards/LEO_v4.1_SUB_AGENT_HANDOFFS.md
/docs/04_features/HANDOFF-PLAN-EXEC-2025-001.md
/docs/EXEC-TO-PLAN-HANDOFF-SD-2025-0904-JSY-FIX-COMPLETE.md
/docs/handoffs/ (directory exists but may have more)
/docs/reference/unified-handoff-system.md
/docs/reference/handoff-rls-bypass-pattern.md
/docs/reference/handoff-rls-patterns.md
/docs/handoff-resilience-guide.md
```

**Recommended Action**: Consolidate to `/docs/handoffs/` with subdirectories:
```
/docs/handoffs/
  /templates/           (handoff templates)
  /completed/           (historical handoffs)
  /patterns/            (RLS patterns, resilience guides)
  README.md             (unified handoff system overview)
```

---

## Low Priority Issues

### 11. Duplicate Content in docs/EHG vs docs/EHG_Engineering
**Issue**: Two separate application documentation directories
**Impact**: Minor confusion about which is which
**Recommended Action**: Add README clarifying:
- `docs/EHG/` = Customer-facing EHG application docs
- `docs/EHG_Engineering/` = Management dashboard docs

### 12. Archive Directory Needs Organization
**Current**: `/docs/archive/` has minimal structure
**Recommended**: Add subdirectories:
```
/docs/archive/
  /deprecated-features/
  /old-protocols/
  /temp/                (temporary files moved from root)
  /superseded/          (docs replaced by newer versions)
```

### 13. Research Directory Structure
**Current**: `/docs/research/stages/` has 40 numbered brief files (01_brief.md - 40_brief.md)
**Issue**: Unclear what these briefs represent
**Recommended**: Add `/docs/research/README.md` explaining stage system

### 14. Testing Documentation Split
**Issue**: Testing docs in two locations:
- `/docs/05_testing/`
- `/docs/testing/`

**Recommended Action**: Consolidate to `/docs/05_testing/`

### 15. Workflow Documentation
**Issue**: `/docs/workflow/` directory exists but relationship to other docs unclear
**Recommended**: Clarify relationship to `/docs/03_protocols_and_standards/`

---

## Recommended Information Architecture

### Proposed Directory Structure
```
/EHG_Engineer/
├── README.md                           (FIXED: Actual project README)
├── CONTRIBUTING.md                     (Keep)
├── CHANGELOG.md                        (Keep)
├── CLAUDE.md                           (Keep: Router to CLAUDE_*.md)
├── CLAUDE_CORE.md                      (Keep: Generated from DB)
├── CLAUDE_EXEC.md                      (Keep: Generated from DB)
├── CLAUDE_LEAD.md                      (Keep: Generated from DB)
├── CLAUDE_PLAN.md                      (Keep: Generated from DB)
│
├── .claude/                            (Agent context - keep separate)
│   ├── agents/
│   │   ├── README.md                   (ADD: Agent system overview)
│   │   ├── *.md                        (Agent definitions)
│   ├── commands/                       (Keep)
│   └── backups/                        (Keep)
│
├── docs/
│   ├── README.md                       (UPDATE: Better directory guide)
│   │
│   ├── 01_architecture/                (Keep)
│   ├── 02_api/                         (Keep, remove CLAUDE-*.md)
│   ├── 03_protocols_and_standards/     (Keep)
│   ├── 04_features/                    (Keep, remove CLAUDE-*.md)
│   ├── 05_testing/                     (Keep + merge /testing/)
│   ├── 06_deployment/                  (Keep)
│   │
│   ├── guides/                         (CONSOLIDATED from 03_guides)
│   │   ├── README.md
│   │   └── *.md
│   │
│   ├── reference/                      (Keep + add CLAUDE context)
│   │   ├── README.md                   (ADD)
│   │   ├── context/                    (NEW: CLAUDE-*.md files)
│   │   └── *.md
│   │
│   ├── summaries/                      (EXPANDED)
│   │   ├── README.md
│   │   ├── sd-sessions/                (NEW: SD status files)
│   │   ├── implementations/            (NEW: *_COMPLETE.md)
│   │   ├── migrations/                 (NEW: Migration summaries)
│   │   └── *.md
│   │
│   ├── handoffs/                       (REORGANIZED)
│   │   ├── README.md                   (ADD)
│   │   ├── templates/
│   │   ├── completed/
│   │   └── patterns/
│   │
│   ├── troubleshooting/                (Keep)
│   ├── retrospectives/                 (Keep)
│   ├── operations/                     (Keep)
│   ├── reports/                        (Keep)
│   ├── research/                       (Keep + add README)
│   ├── analysis/                       (Keep + add README)
│   ├── migrations/                     (Keep + add README)
│   ├── issues/                         (Keep + add README)
│   ├── lessons-learned/                (Keep)
│   ├── templates/                      (Keep)
│   ├── database/                       (Keep + add README)
│   ├── examples/                       (Keep)
│   │
│   ├── archive/                        (REORGANIZED)
│   │   ├── README.md
│   │   ├── temp/                       (NEW: temp-*.md files)
│   │   ├── deprecated-features/
│   │   └── superseded/
│   │
│   ├── EHG/                            (Keep + clarify)
│   └── EHG_Engineering/                (Keep + clarify)
│
└── [other directories unchanged]
```

---

## Action Plan

### Phase 1: Critical Fixes (Immediate)
1. **Fix Project README** (1 hour)
   - Replace root README.md with actual project documentation
   - Move Supabase CLI readme to appropriate location

2. **Consolidate Guide Directories** (2 hours)
   - Merge `/docs/03_guides/` into `/docs/guides/`
   - Resolve duplicate file conflicts
   - Update all references

3. **Clean Project Root** (3 hours)
   - Move 54 status/summary files to `/docs/summaries/`
   - Organize into subdirectories
   - Update any scripts that reference these files

### Phase 2: High Priority (Within 1 Week)
4. **Remove Backup Files** (1 hour)
   - Update .gitignore
   - Remove .backup, .bak files from repository
   - Verify git history has backups if needed

5. **Handle Temporary Files** (2 hours)
   - Review each temp-*.md file
   - Archive or delete as appropriate
   - Document decisions

6. **Organize CLAUDE Context** (2 hours)
   - Decide on CLAUDE-*.md file location
   - Move to standardized location
   - Update generation scripts

### Phase 3: Medium Priority (Within 2 Weeks)
7. **Add Missing READMEs** (3 hours)
   - Create README.md for 9 directories
   - Document purpose and conventions
   - Add navigation links

8. **Consolidate Handoff Docs** (2 hours)
   - Reorganize `/docs/handoffs/`
   - Move scattered handoff docs
   - Update references

9. **Standardize Directory Naming** (1 hour)
   - Decide on numbered vs semantic
   - Rename if necessary
   - Update references

### Phase 4: Low Priority (Within 1 Month)
10. **Consolidate Testing Docs** (1 hour)
11. **Organize Archive Directory** (1 hour)
12. **Document Research Structure** (1 hour)
13. **Clarify EHG vs EHG_Engineering** (30 min)

---

## Naming Convention Standards

### Recommended Conventions

**File Naming**:
```
# Good examples:
database-migration-guide.md          (kebab-case for guides)
SD-DATA-INTEGRITY-001-summary.md     (SD-ID prefix for SD-specific)
retrospective-2025-10-15.md          (ISO date for time-based)
CLAUDE_CORE.md                       (SCREAMING_SNAKE for generated)

# Avoid:
temp-something.md                    (use archive/temp/)
RANDOM_CAPS.md                       (inconsistent)
file-name-v2-final-FINAL.md         (version control does this)
```

**Directory Naming**:
```
# Good:
/docs/guides/                        (semantic, lowercase)
/docs/01_architecture/              (numbered + semantic)

# Avoid:
/docs/03_guides/                    (numbered but duplicates /guides/)
/docs/Guides/                       (inconsistent casing)
```

---

## Documentation Completeness Assessment

### Well-Documented Areas
- LEO Protocol (comprehensive, auto-generated)
- Sub-agent system (good coverage)
- Database architecture (good schema documentation)
- Testing infrastructure (well documented)

### Under-Documented Areas
- **Directory purposes** (missing READMEs)
- **Migration history** (migrations/ directory not explained)
- **Research stage system** (40 brief files unexplained)
- **Handoff workflow** (scattered documentation)
- **Archive contents** (no index of what's archived)

### Missing Documentation
- **Onboarding guide** for new developers
- **Architecture decision records** (ADRs)
- **Deployment runbook** (deployment docs exist but scattered)
- **Incident response** procedures
- **Rollback procedures** for migrations

---

## Documentation Quality Issues

### Consistency Issues
1. **Format inconsistency**: Mix of technical docs, status updates, and guides
2. **Tone inconsistency**: Some formal, some casual session notes
3. **Structure inconsistency**: No standard template for similar doc types

### Accessibility Issues
1. **No clear entry point**: docs/README.md exists but could be better
2. **Deep nesting**: Some docs 5+ levels deep
3. **Broken links**: Likely (not audited but probable given reorganizations)
4. **Search difficulty**: 557 files hard to search without good organization

### Maintenance Issues
1. **Dated content**: Many "COMPLETE" files that may be stale
2. **No ownership**: Unclear who maintains which docs
3. **No review process**: No indication docs are reviewed/updated

---

## Recommendations for Ongoing Maintenance

### 1. Documentation Review Process
```markdown
# Add to CONTRIBUTING.md:

## Documentation Standards

- Update docs in same PR as code changes
- Add README.md to any new directory
- Use semantic file naming (kebab-case)
- No temporary files in root
- Status updates go in /docs/summaries/
```

### 2. Automated Checks
```bash
# Add to CI/CD:
# - Check for temp-*.md files in root
# - Check for .backup files
# - Verify all directories have README.md
# - Check for broken internal links
```

### 3. Quarterly Documentation Audit
- Review and archive completed status files
- Update outdated documentation
- Check for duplicate content
- Verify README files are current

### 4. Documentation Generation
- Continue auto-generating CLAUDE*.md from database
- Consider auto-generating:
  - Directory index pages
  - Cross-reference maps
  - Documentation metrics dashboard

---

## Priority Summary

### Critical (Fix Immediately)
1. **Project README is wrong** - Replace with actual project docs
2. **Duplicate guide directories** - Merge /docs/03_guides/ into /docs/guides/
3. **54 files in project root** - Move to /docs/summaries/

### High (Fix This Week)
4. **Temporary files** - Archive or delete 11 temp-*.md files
5. **Backup files** - Remove 40+ .backup files from git
6. **CLAUDE context scattered** - Standardize location

### Medium (Fix This Month)
7. **Directory naming** - Standardize numbered vs semantic
8. **Missing READMEs** - Add to 9 directories
9. **Handoff docs scattered** - Consolidate to /docs/handoffs/
10. **Status file fragmentation** - Organize /docs/summaries/

### Low (Ongoing)
11-15. Various organizational improvements

---

## Success Metrics

After implementing recommendations:

1. **Project root cleanliness**: <10 markdown files in root
2. **Documentation discoverability**: All directories have README.md
3. **Consistency**: Single guide directory, consistent naming
4. **Maintainability**: No temp/backup files in repository
5. **Navigation**: Clear information hierarchy

---

## Next Steps

1. **Review this audit** with team/stakeholders
2. **Prioritize** based on immediate needs
3. **Create SD** for documentation reorganization (if needed)
4. **Execute Phase 1** critical fixes
5. **Schedule** remaining phases
6. **Document decisions** in ADR or retrospective

---

**Audit Completed**: 2025-10-19
**Estimated Effort**: 20-25 hours total across all phases
**Risk**: Low (mostly file moves, high review/testing recommended)
**Impact**: High (significantly improves developer experience)
