# Script Organization Migration Plan

**Version**: 1.0.0
**Date**: 2025-10-26
**Task**: A1.1 - Script Organization Blueprint
**Phase**: Phase 1, Week 1 (Sub-Agent Ecosystem Integration)
**Status**: 📋 PLANNING

## Executive Summary

**Current State**:
- **1,630 scripts** in flat `/scripts/` directory
- **60.7% categorized** (990 scripts) using pattern matching
- **39.3% uncategorized** (640 scripts) requiring manual review
- **Maintenance burden**: Finding scripts is time-consuming
- **Naming collisions**: Risk of duplicate script names
- **No clear ownership**: Difficult to determine script purpose

**Target State**:
- **Hierarchical folder structure** (16 categories)
- **100% categorized** with clear purpose
- **Script inventory** (auto-generated, searchable)
- **Unified CLI** for script discovery and execution
- **Migration tracking** (which scripts moved where)

**Timeline**: 8-12 hours across 2 weeks (Phase 1)

---

## 📊 Current Analysis

### Script Distribution (Top 10 Categories)

| Category | Count | % of Total | Priority |
|----------|-------|------------|----------|
| 1. Handoff | 403 | 24.7% | 🔴 HIGH |
| 2. Verification | 207 | 12.7% | 🔴 HIGH |
| 3. Testing | 118 | 7.2% | 🔴 HIGH |
| 4. Strategic Directives | 83 | 5.1% | 🟡 MEDIUM |
| 5. Addition | 40 | 2.5% | 🟡 MEDIUM |
| 6. Database | 39 | 2.4% | 🟡 MEDIUM |
| 7. LEO Protocol | 31 | 1.9% | 🟡 MEDIUM |
| 8. Sub-Agents | 28 | 1.7% | 🟡 MEDIUM |
| 9. Utility | 21 | 1.3% | 🟢 LOW |
| 10. User Stories | 7 | 0.4% | 🟢 LOW |
| **Uncategorized** | **640** | **39.3%** | 🔴 **CRITICAL** |

### Uncategorized Script Patterns

Analysis of 640 uncategorized scripts reveals additional patterns:

| Pattern | Estimated Count | Description |
|---------|----------------|-------------|
| `apply-*` | ~150 | Migration application scripts |
| `fix-*` | ~80 | Bug fixes and remediations |
| `sync-*` | ~40 | Data synchronization |
| `deploy-*` | ~30 | Deployment scripts |
| `bulk-*` | ~25 | Bulk operations |
| `setup-*` | ~20 | Initial setup/config |
| `cleanup-*` | ~15 | Maintenance scripts |
| `update-*` | ~280 | Update operations (various) |

---

## 📂 Proposed Folder Structure

```
scripts/
│
├── handoff/                    # 403 scripts | LEAD→PLAN, PLAN→EXEC handoffs
│   ├── accept/                 # Handoff acceptance
│   ├── create/                 # Handoff creation
│   └── transition/             # Phase transitions
│
├── verification/               # 207 scripts | Validation and checks
│   ├── gate/                   # Gate verification (4 gates)
│   ├── schema/                 # Schema validation
│   └── completeness/           # Completeness checks
│
├── testing/                    # 118 scripts | Test infrastructure
│   ├── e2e/                    # End-to-end testing
│   ├── unit/                   # Unit testing
│   ├── coverage/               # Coverage enforcement
│   └── uat/                    # User acceptance testing
│
├── strategic-directives/       # 83 scripts | SD management
│   ├── create/                 # SD creation
│   ├── complete/               # SD completion
│   └── query/                  # SD queries
│
├── migrations/                 # ~150 scripts | Database migrations
│   ├── apply/                  # Apply migrations
│   ├── verify/                 # Verify migrations
│   └── rollback/               # Rollback (if needed)
│
├── database/                   # 39 scripts | Database operations
│   ├── schema/                 # Schema updates
│   ├── rls/                    # RLS policies
│   └── queries/                # Database queries
│
├── sub-agents/                 # 28 scripts | Sub-agent management
│   ├── activate/               # Agent activation
│   ├── update/                 # Agent updates
│   └── regenerate/             # Markdown regeneration
│
├── leo-protocol/               # 31 scripts | LEO Protocol
│   ├── activation/             # Protocol activation
│   ├── updates/                # Protocol updates
│   └── configuration/          # Config changes
│
├── user-stories/               # 7 scripts | Story management
│
├── fixes/                      # ~80 scripts | Bug fixes
│   ├── critical/               # Critical fixes
│   ├── standard/               # Standard fixes
│   └── hotfix/                 # Emergency hotfixes
│
├── sync/                       # ~40 scripts | Data synchronization
│   ├── database/               # DB sync
│   ├── files/                  # File sync
│   └── external/               # External API sync
│
├── deployment/                 # ~30 scripts | Deployment
│   ├── staging/                # Staging deployment
│   ├── production/             # Production deployment
│   └── rollback/               # Deployment rollback
│
├── bulk-operations/            # ~25 scripts | Bulk ops
│
├── setup/                      # ~20 scripts | Initial setup
│
├── maintenance/                # ~15 scripts | Cleanup
│   ├── cleanup/                # Data cleanup
│   └── optimization/           # Performance optimization
│
├── utility/                    # 21 scripts | Helper scripts
│   ├── analyze/                # Analysis tools
│   ├── report/                 # Reporting tools
│   └── export/                 # Export utilities
│
├── documentation/              # 5 scripts | Doc generation
│
├── retrospective/              # 3 scripts | Retros
│
├── github/                     # 2 scripts | CI/CD
│
├── update/                     # ~280 scripts | Update operations
│   ├── database/               # DB updates
│   ├── config/                 # Config updates
│   └── content/                # Content updates
│
├── uncategorized/              # Remaining scripts
│
└── archive/                    # Deprecated/old scripts
```

**Total Categories**: 21 (16 primary + 5 meta)

---

## 🎯 Migration Strategy

### Phase 1: Foundation (Week 1, 6-8 hours)

**Goal**: Create infrastructure and migrate high-priority categories

#### Step 1.1: Create Folder Structure (30 min)
```bash
# Run script to create all folders
node scripts/create-folder-structure.cjs
```

**Folders to create**: 21 main folders + subdirectories

#### Step 1.2: Migrate Top 5 Categories (3-4 hours)

**Priority order**:
1. **handoff/** (403 scripts) - Most used
2. **verification/** (207 scripts) - Critical for LEO Protocol
3. **testing/** (118 scripts) - Quality assurance
4. **strategic-directives/** (83 scripts) - Core workflow
5. **migrations/** (~150 scripts) - Database integrity

**Migration script**: `node scripts/migrate-scripts-phase1.cjs`

#### Step 1.3: Create Script Inventory (2 hours)

**File**: `scripts/SCRIPT_INVENTORY.json`
**Contents**:
```json
{
  "version": "1.0.0",
  "total_scripts": 1630,
  "last_updated": "2025-10-26",
  "categories": {
    "handoff": {
      "path": "scripts/handoff",
      "count": 403,
      "scripts": [
        {
          "name": "accept-handoff.mjs",
          "path": "scripts/handoff/accept-handoff.mjs",
          "description": "Accept handoff from PLAN to EXEC",
          "deprecated": false
        }
      ]
    }
  }
}
```

#### Step 1.4: Build Unified CLI (2-3 hours)

**File**: `scripts/cli.cjs`
**Commands**:
```bash
# Search for scripts
scripts/cli.cjs search "handoff"
scripts/cli.cjs search --category handoff

# List scripts in category
scripts/cli.cjs list handoff

# Run script by name (finds automatically)
scripts/cli.cjs run accept-handoff

# Show script info
scripts/cli.cjs info accept-handoff
```

### Phase 2: Comprehensive Migration (Week 2, 4-6 hours)

#### Step 2.1: Analyze Uncategorized (1 hour)
- Review 640 uncategorized scripts
- Refine category patterns
- Manually categorize edge cases

#### Step 2.2: Migrate Remaining Categories (2-3 hours)
- Apply refined patterns
- Move scripts to appropriate folders
- Update inventory

#### Step 2.3: Create Symlinks for Backward Compatibility (30 min)
```bash
# Create symlinks in root scripts/ for commonly used scripts
ln -s handoff/accept-handoff.mjs scripts/accept-handoff.mjs
```

#### Step 2.4: Update Documentation (1 hour)
- Update README with new structure
- Document CLI usage
- Create migration guide for developers

### Phase 3: Validation & Cleanup (Week 2, 2 hours)

#### Step 3.1: Verify All Scripts Work (1 hour)
```bash
# Run smoke tests on migrated scripts
node scripts/test-migrated-scripts.cjs
```

#### Step 3.2: Archive Deprecated Scripts (30 min)
- Identify unused/deprecated scripts
- Move to `scripts/archive/`
- Document why each was deprecated

#### Step 3.3: Update CI/CD (30 min)
- Update GitHub Actions workflows with new paths
- Test CI/CD pipelines
- Verify all automated scripts still work

---

## 🔧 Implementation Scripts

### Required Scripts to Build

1. **create-folder-structure.cjs** (30 min)
   - Creates all folders and subdirectories
   - Sets up README.md in each folder
   - Creates .gitkeep files

2. **migrate-scripts-phase1.cjs** (1 hour)
   - Migrates top 5 categories
   - Updates imports/require paths
   - Generates migration report

3. **generate-script-inventory.cjs** (1 hour)
   - Scans all scripts
   - Extracts metadata (description, params, etc.)
   - Generates JSON inventory

4. **cli.cjs** (2 hours)
   - Unified CLI for script management
   - Search, list, run commands
   - Uses inventory for fast lookups

5. **test-migrated-scripts.cjs** (30 min)
   - Smoke tests for migrated scripts
   - Verifies imports still work
   - Reports any broken scripts

---

## 📝 Migration Tracking

### Script to Track Migration Progress

```javascript
// scripts/migration-status.cjs
// Shows which scripts have been migrated

const status = {
  handoff: { target: 403, migrated: 0, percent: 0 },
  verification: { target: 207, migrated: 0, percent: 0 },
  // ... etc
};

// Run: node scripts/migration-status.cjs
```

### Migration Log

**File**: `scripts/MIGRATION_LOG.md`

```markdown
## Migration Log

### 2025-10-26 - Phase 1 Start
- Created folder structure
- Migrated handoff/ (403 scripts)
- Status: 24.7% complete

### 2025-10-27 - Phase 1 Continued
- Migrated verification/ (207 scripts)
- Status: 37.4% complete
```

---

## 🚨 Risks & Mitigations

### Risk 1: Breaking Changes
**Impact**: HIGH
**Probability**: MEDIUM

**Mitigation**:
1. Create symlinks for backward compatibility
2. Update all require/import paths
3. Run comprehensive smoke tests
4. Keep old structure for 1 sprint

### Risk 2: Lost Scripts
**Impact**: CRITICAL
**Probability**: LOW

**Mitigation**:
1. Git commit before migration
2. Create backup of scripts/ folder
3. Verify script count before/after
4. Generate inventory before migration

### Risk 3: Developer Confusion
**Impact**: MEDIUM
**Probability**: HIGH

**Mitigation**:
1. Clear documentation
2. CLI for easy discovery
3. Gradual migration (symlinks initially)
4. Team communication

### Risk 4: CI/CD Failures
**Impact**: HIGH
**Probability**: MEDIUM

**Mitigation**:
1. Update GitHub Actions workflows first
2. Test in staging branch
3. Keep monitoring for 1 week
4. Quick rollback plan ready

---

## ✅ Success Criteria

### Phase 1 (Week 1)
- [ ] Folder structure created (21 folders)
- [ ] Top 5 categories migrated (961 scripts, 59%)
- [ ] Script inventory generated (JSON)
- [ ] Unified CLI built and tested
- [ ] No CI/CD failures
- [ ] All smoke tests passing

### Phase 2 (Week 2)
- [ ] All categories defined (100% coverage)
- [ ] Remaining scripts migrated
- [ ] Backward compatibility symlinks created
- [ ] Documentation updated
- [ ] Developer guide published

### Phase 3 (Week 2)
- [ ] All scripts verified working
- [ ] Deprecated scripts archived
- [ ] CI/CD updated and tested
- [ ] Zero production incidents
- [ ] Team trained on new structure

---

## 📊 Metrics

### Before Migration
- **Scripts in root**: 1,630
- **Average search time**: 30-60 seconds
- **Categorization**: Manual, inconsistent
- **Discovery**: Difficult (need to know script name)

### After Migration
- **Scripts in root**: 0 (or symlinks only)
- **Average search time**: <5 seconds (using CLI)
- **Categorization**: 100% automated
- **Discovery**: Easy (search by keyword/category)

### ROI Calculation
- **Time saved per search**: ~45 seconds
- **Searches per day**: ~20 (estimated)
- **Time saved per day**: 15 minutes
- **Time saved per week**: 75 minutes (1.25 hours)
- **Break-even**: 12 hours / 1.25 hours/week = ~10 weeks

---

## 🔄 Maintenance Plan

### Weekly
- Run inventory generator to catch new scripts
- Check for scripts added to root (should be zero)

### Monthly
- Review uncategorized folder
- Update CLI with new patterns
- Archive deprecated scripts

### Quarterly
- Refine categories based on usage
- Update documentation
- Gather developer feedback

---

## 📚 References

- **Analysis Report**: `scripts/organization-analysis.json`
- **Current Inventory**: Generated during Phase 1
- **Migration Log**: `scripts/MIGRATION_LOG.md`
- **CLI Documentation**: `scripts/cli-README.md`

---

**Next Steps**:
1. Review and approve this migration plan
2. Create implementation scripts (Step 1 of Phase 1)
3. Begin Phase 1 migration (Week 1)

**Estimated Total Time**: 12-16 hours across 2 weeks
**Risk Level**: MEDIUM (with mitigations in place)
**Value**: HIGH (improved developer productivity, reduced confusion)

---

**Version History**:
- v1.0.0 (2025-10-26): Initial migration plan created
- Based on analysis of 1,630 scripts with 60.7% automated categorization

🤖 Generated as part of Phase 1 Implementation Plan (Sub-Agent Ecosystem Integration)
