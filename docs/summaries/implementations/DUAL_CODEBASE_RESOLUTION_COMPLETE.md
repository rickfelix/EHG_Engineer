# Dual Codebase Resolution - Complete

**Date**: 2025-10-17
**Status**: ✅ COMPLETE
**Scope**: Permanent resolution of dual-codebase confusion

## Problem Statement

During UI/UX improvements to the Ventures page, we discovered two separate codebases for the ehg application:

1. `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/` - Stale clone with outdated code
2. `/mnt/c/_EHG/ehg` - Actual git repository with current code

This caused confusion when editing files, as changes were sometimes applied to the wrong location.

## Root Cause Analysis

The EHG_Engineer multi-application architecture was designed to:
- Serve as a LEO Protocol orchestration layer
- Manage multiple venture applications (APP001, APP002, APP003...)
- Support EHG creating future ventures

According to the design (see `applications/README.md`):
- Each APP directory has a `config.json` pointing to the actual repo location
- `codebase/` directories should be **gitignored** and NOT contain code
- Development should always happen in the actual repository

The stale `APP001/codebase/` directory violated this architecture and created a dual-codebase situation.

## Resolution Implemented

### Phase 1: Cleanup & Verification ✅

1. **Deleted stale APP001/codebase directory**
   - Removed outdated code clone
   - No data loss (all real work in `/mnt/c/_EHG/ehg`)

2. **Verified .gitignore rules**
   - Confirmed `*/codebase/` is gitignored (line 4 of `.gitignore`)
   - Prevents future accidental commits

3. **Validated APP001 configuration**
   - Confirmed `config.json` correctly points to `/mnt/c/_EHG/ehg`
   - Git repository is healthy and active

### Phase 2: Safeguards ✅

4. **Created placeholder in APP001/codebase/**
   - Added `DO_NOT_USE_README.md`
   - Documents correct workflow
   - Prevents accidental git clones

5. **Updated applications/README.md**
   - Added CRITICAL warning section
   - Clarified codebase/ should never be used for development
   - Provided clear examples of correct vs. incorrect workflows

### Phase 3: Workflow Documentation ✅

6. **Created DEVELOPMENT_WORKFLOW.md**
   - Comprehensive guide for EHG_Engineer architecture
   - Clear separation: orchestration vs. application code
   - Claude Code session checklist
   - Quick reference table
   - Future venture preparation guidance

7. **Removed duplicate APP003 registration**
   - Cleaned registry.json (removed APP003 entry)
   - Deleted APP003 directory
   - Updated metadata (total_apps: 3 → 2)

### Phase 4: Validation & Future-Proofing ✅

8. **Created validation script**
   - `scripts/validate-app-configs.mjs`
   - Checks local_path exists and is valid git repo
   - Warns if codebase/ contains files
   - Verifies git remotes match configuration
   - **Validation Result for APP001**: ✅ All checks passed

## Architecture Clarification

### EHG_Engineer (Orchestration Layer)
**Location**: `/mnt/c/_EHG/EHG_Engineer`

**Purpose**:
- Houses LEO Protocol tooling (CLAUDE.md, agents, scripts)
- Manages multi-application registry
- Contains Strategic Directives and retrospectives
- Coordinates development across multiple ventures

**Contents**:
- ✅ `CLAUDE*.md` files
- ✅ `agents/` directory
- ✅ `scripts/` directory
- ✅ `applications/` directory (configs only)
- ✅ `migrations/`, `docs/`, `retrospectives/`

### Application Repositories (Separate Git Repos)
**APP001 Location**: `/mnt/c/_EHG/ehg`

**Purpose**:
- The actual ehg portfolio application
- Where development happens
- Where dev server runs (`PORT=8080 npm run dev`)

**Contents**:
- ✅ Complete application source code
- ✅ `package.json`, `vite.config.ts`
- ✅ `src/`, `public/`, `tests/`
- ✅ Separate git history

### Relationship

```
EHG_Engineer                    Application Repos
  (Orchestration)                  (Source Code)
       │                                │
       ├── APP001/config.json    ─────→ /mnt/c/_EHG/ehg
       │   (points to repo)             (actual code)
       │
       ├── APP002/config.json    ─────→ /future/venture-2
       └── APP003/config.json    ─────→ /future/venture-3
```

## Files Created/Modified

### Created:
1. `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/DO_NOT_USE_README.md`
2. `/mnt/c/_EHG/EHG_Engineer/DEVELOPMENT_WORKFLOW.md`
3. `/mnt/c/_EHG/EHG_Engineer/scripts/validate-app-configs.mjs`
4. `/mnt/c/_EHG/EHG_Engineer/DUAL_CODEBASE_RESOLUTION_COMPLETE.md` (this file)

### Modified:
1. `/mnt/c/_EHG/EHG_Engineer/applications/README.md`
   - Added CRITICAL warning section about codebase/ usage

2. `/mnt/c/_EHG/EHG_Engineer/applications/registry.json`
   - Removed APP003 duplicate entry
   - Updated metadata (total_apps, last_updated)

### Deleted:
1. `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/` (stale code)
2. `/mnt/c/_EHG/EHG_Engineer/applications/APP003/` (duplicate registration)

## Validation Results

Running `node scripts/validate-app-configs.mjs`:

```
📦 Validating APP001 (ehg)...
  ✅ config.json is valid JSON
  ✅ local_path exists: /mnt/c/_EHG/ehg
  ✅ local_path is a valid git repository
  ✅ codebase/ contains only placeholder (correct)
  ✅ Git remote matches configuration
```

## Developer Guidance

### For ehg Development:
```bash
cd /mnt/c/_EHG/ehg          # ✅ CORRECT
PORT=8080 npm run dev
# Make changes, commit, push
```

### For LEO Protocol Work:
```bash
cd /mnt/c/_EHG/EHG_Engineer  # ✅ CORRECT
# Edit CLAUDE.md, agents, scripts
git add . && git commit && git push
```

### Verification:
```bash
# Check which repo you're working in
pwd

# Validate all app configurations
cd /mnt/c/_EHG/EHG_Engineer
node scripts/validate-app-configs.mjs
```

## Success Criteria

- [x] Single source of truth for ehg code: `/mnt/c/_EHG/ehg`
- [x] No stale copies in EHG_Engineer
- [x] Clear documentation prevents future confusion
- [x] Validation script catches configuration issues
- [x] Architecture supports future ventures
- [x] Claude Code sessions have clear guidance

## Benefits Achieved

1. **No More Confusion**: Single location for ehg development
2. **No Sync Conflicts**: No need to maintain multiple copies
3. **Clear Separation**: Orchestration vs. application code
4. **Future-Proof**: Ready for ventures created by ehg
5. **Validated**: Automated checks ensure correctness
6. **Documented**: Comprehensive guides for developers and AI

## Next Steps for Future Ventures

When ehg creates a new venture:

1. Create the venture's repository separately
2. Register it in EHG_Engineer: `npm run register-app`
3. Update config.json to point to actual repo location
4. Never clone code into `applications/APP00X/codebase/`
5. Run `node scripts/validate-app-configs.mjs` to verify

## Related Documentation

- `DEVELOPMENT_WORKFLOW.md` - Comprehensive workflow guide
- `applications/README.md` - Multi-app architecture overview
- `applications/APP001/codebase/DO_NOT_USE_README.md` - Placeholder warning
- `scripts/validate-app-configs.mjs` - Configuration validator

---

**Completed By**: Claude Code
**Approved By**: User
**Architecture Validated**: ✅
**Future-Proof**: ✅
