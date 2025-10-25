# Checkpoint 3 Clean Branch Strategy

**Strategic Directive:** SD-VWC-INTUITIVE-FLOW-001  
**Checkpoint:** 3 (Intelligence Integration & Tooltips)  
**Status:** CONDITIONAL_PASS - Deliverables complete, CI blocked by unrelated work  
**Created:** 2025-10-25

---

## Problem Statement

Checkpoint 3 (CP3) work is **100% complete** and fully compliant, but CI/CD pipeline is **FAILING** due to 135 jsx-a11y errors introduced by **unrelated commits** on the feature branch.

**CP3 Commits (Clean):**
- `76ba0db` - Checkpoint 2: Unit tests + dashboard bug fix
- `e2bc978` - Checkpoint 3: Disabled button tooltips

**Problematic Commits (Unrelated):**
- Multiple SDs added work without fixing accessibility violations
- 135 jsx-a11y errors across 15+ files
- None of these errors are in `VentureCreationPage.tsx` (CP3's only modified file)

---

## Strategy: Cherry-Pick to Clean Branch

### Step 1: Create Clean Branch from Main

```bash
cd /mnt/c/_EHG/ehg

# Fetch latest from remote
git fetch origin

# Create new branch from main
git checkout origin/main
git checkout -b feat/SD-VWC-001-CP3-clean

# Verify we're on clean base
git log --oneline -5
npm run lint  # Should pass with 0 errors (or minimal pre-existing warnings)
```

### Step 2: Cherry-Pick CP2 + CP3 Commits

```bash
# Cherry-pick CP2 first (has dependencies for CP3)
git cherry-pick 76ba0db

# Verify CP2 applied cleanly
npm run lint
npm run test:unit

# Cherry-pick CP3
git cherry-pick e2bc978

# Verify CP3 applied cleanly
npm run lint  # Should have 0 jsx-a11y errors
npm run test:unit
```

### Step 3: Verify CI/CD Will Pass

```bash
# Run full linting (production mode like CI)
NODE_ENV=production npm run lint

# Expected result: 0 errors (warnings OK)
# If errors appear, they're pre-existing from main, not from CP2/CP3

# Run unit tests
npm run test:unit

# Expected result: Same pass rate as main branch
```

### Step 4: Push and Create PR

```bash
# Push clean branch
git push -u origin feat/SD-VWC-001-CP3-clean

# Create PR
gh pr create \
  --title "feat(SD-VWC-001): Complete Checkpoint 3 - Intelligence Integration & Tooltips" \
  --body "$(cat <<'PR_BODY'
## Summary
Complete Checkpoint 3 for SD-VWC-INTUITIVE-FLOW-001:
- Verified IntelligenceSummaryCard integration (Steps 2 & 3)
- Added 2 new WCAG 2.1 AA compliant tooltips
- Total tooltip coverage: 5/5 disabled buttons (100%)

## Checkpoints Included
- **CP2** (76ba0db): 615 LOC unit tests + dashboard bug fix
- **CP3** (e2bc978): 55 LOC tooltip additions

## Testing
- Unit tests: 379/393 passing (96.4%)
- jsx-a11y: 0 violations in VentureCreationPage.tsx
- Manual keyboard navigation: Verified

## Clean Branch Strategy
This PR uses a **clean branch** strategy to isolate CP2+CP3 work from unrelated commits that introduced 135 jsx-a11y errors on the original feature branch. Those errors are being addressed separately in SD-A11Y-FEATURE-BRANCH-001.

## Retrospective
Quality Score: 90/100 (ID: be8c894a-23da-47d7-9ded-f3b07eb4f033)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
PR_BODY
  )" \
  --base main
```

### Step 5: Monitor CI/CD

```bash
# Watch CI/CD runs
gh run watch

# Expected results:
# ✅ Pre-Merge Verification: PASS
# ✅ CI/CD Pipeline: PASS (0 jsx-a11y errors from CP2/CP3)
# ✅ Docker Build & Push: PASS
```

---

## Verification Checklist

Before merging the clean branch PR:

- [ ] Clean branch created from `origin/main`
- [ ] CP2 commit (76ba0db) cherry-picked successfully
- [ ] CP3 commit (e2bc978) cherry-picked successfully
- [ ] `npm run lint` shows 0 jsx-a11y errors from CP2/CP3 work
- [ ] Unit tests pass at same rate as main branch
- [ ] PR created with clean branch
- [ ] CI/CD pipeline passes (all 3 workflows green)
- [ ] PR approved and merged

---

## Alternative: Rebase Feature Branch (NOT RECOMMENDED)

**Why not recommended:**
- Feature branch has 6 unrelated commits (SD-RECONNECT-011, SD-VIF-REFINE-001, etc.)
- Interactive rebase could introduce conflicts
- Risk of losing work from other SDs
- Cherry-pick strategy is safer and more explicit

**If you must rebase:**

```bash
# Interactive rebase to remove problematic commits
git checkout feat/SD-VWC-INTUITIVE-FLOW-001-venture-wizard-user-experience-completio
git rebase -i origin/main

# In editor, keep only CP2 (76ba0db) and CP3 (e2bc978)
# Drop all other commits

# Force push (DANGEROUS - ensure you have backup)
git push --force-with-lease
```

---

## Post-Merge Actions

After CP3 PR merges:

1. **Update SD-VWC-INTUITIVE-FLOW-001:**
   - Progress: 75% → 100% (if CP3 is final checkpoint)
   - Or: Progress: 75% → 85% (if CP4 exists)
   - Phase: PLAN → EXEC (for next checkpoint) OR LEAD (if complete)

2. **Address A11Y Technical Debt:**
   - SD-A11Y-FEATURE-BRANCH-001 awaiting LEAD approval
   - Estimate: 6-8 hours to fix 135 errors
   - Priority: HIGH (blocks other SDs on feature branch)

3. **Clean Up Feature Branch:**
   - Delete or archive contaminated feature branch
   - Or: Use for SD-A11Y-FEATURE-BRANCH-001 to fix in place

---

## Lessons Learned

1. **Branch Hygiene:** Multiple SDs on one branch creates merge conflicts and CI failures
2. **Scope Discipline:** Each SD should have its own branch to prevent contamination
3. **CI Enforcement:** jsx-a11y errors should block PR creation, not just merge
4. **Cherry-Pick Strategy:** Effective for isolating clean work from problematic commits

**Retrospective Reference:** be8c894a-23da-47d7-9ded-f3b07eb4f033 (Quality: 90/100)

---

**Next Steps:** Execute Step 1-5 above to create clean branch and PR for Checkpoint 3.
