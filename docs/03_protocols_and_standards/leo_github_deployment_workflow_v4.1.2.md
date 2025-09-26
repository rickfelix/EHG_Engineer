# LEO Protocol v4.1.2 - GitHub Deployment Workflow Specification

**Version**: 1.0.0  
**Based On**: LEO Protocol v4.1.2 (Database-First Enforcement Update)  
**Date**: 2025-09-01  
**Status**: Active  

---

## Executive Summary

This document defines the proper GitHub deployment workflow according to LEO Protocol v4.1.2. It clarifies when and how GitHub operations should occur within the **EXEC → PLAN → LEAD → DEPLOYMENT** verification cycle.

**Key Principle**: **NO production deployments occur until after LEAD approval.**

---

## Core Workflow Integration

### LEO Protocol v4.1.2 Verification Cycle
```
LEAD Planning (20%) → Database operations only
    ↓
PLAN Design (20%) → Database operations only
    ↓
EXEC Implementation (30%) → Development Git operations only
    ↓ (handback)
PLAN Verification (15%) → Code review, no deployment
    ↓ (recommendation)
LEAD Approval (15%) → Strategic validation
    ↓ (authorization)
GitHub Deployment Sub-Agent → Production deployment
    ↓
DEPLOYMENT COMPLETE (100%)
```

---

## Git Operations by Phase

### Phase 1-2: LEAD/PLAN (Database-First)
**Git Operations**: None
- **LEO Protocol v4.1.2**: "NO FILES MAY BE CREATED in the filesystem"
- All documents exist in database only
- Strategic Directives and PRDs stored in Supabase tables

### Phase 3: EXEC Implementation (30%)
**Git Operations**: Development only
- ✅ Create feature branches for organization
- ✅ Local commits for progress tracking (following commit guidelines)
- ✅ Push to development/feature branches
- ✅ Evidence preservation (screenshots, test results)
- ❌ NO production branch merges
- ❌ NO release tags
- ❌ NO deployment triggers

**Allowed Branch Patterns**:
```bash
exec/<sd-id>/<purpose>
feature/<sd-id>-<description>
dev/<sd-id>
```

**Commit Message Requirements**:
All commits MUST follow LEO Protocol v4.2.0 Git Commit Guidelines:
- Format: `<type>(SD-YYYY-XXX): <subject>`
- Types: feat|fix|docs|style|refactor|test|chore|perf|ci|revert
- See: `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`

### Phase 4: PLAN Verification (15%)
**Git Operations**: Review only
- ✅ Code review of EXEC's branches
- ✅ Run acceptance tests
- ✅ Verify implementation quality
- ❌ NO merges to production branches
- ❌ NO deployment actions

### Phase 5: LEAD Approval (15%)
**Git Operations**: Authorization only
- ✅ Review strategic alignment
- ✅ Authorize production deployment
- ❌ NO direct Git operations
- ❌ Deployment authorization triggers sub-agent

---

## GitHub Deployment Sub-Agent

### Activation Criteria
**REQUIRED**: LEAD approval completed (Phase 5 = 100%)

**Activation Trigger**:
- Strategic Directive status = 'archived'
- PRD status = 'approved' 
- LEAD approval checklist = 7/7 complete
- Database progress = 100%

### Sub-Agent Responsibilities

#### 1. Pre-Deployment Validation
```bash
# Verify LEAD approval
node scripts/validate-sd-completion.js SD-YYYY-XXX

# Confirm all phases complete
node scripts/verify-deployment-readiness.js SD-YYYY-XXX
```

#### 2. Production Deployment Operations
```bash
# Merge to production branch
git checkout main
git merge --no-ff feature/SD-YYYY-XXX

# Create release tag
git tag -a v$(date +%Y.%m.%d) -m "Release: $(SD_TITLE)"

# Push to production
git push origin main --tags

# Create GitHub Release
gh release create v$(date +%Y.%m.%d) \
  --title "$(SD_TITLE)" \
  --notes "$(DEPLOYMENT_NOTES)"
```

#### 3. Post-Deployment Verification
```bash
# Monitor deployment status
node scripts/monitor-deployment-status.js

# Update database with deployment metadata
node scripts/update-deployment-complete.js SD-YYYY-XXX
```

### Sub-Agent Handoff Requirements
- [ ] Production branch updated
- [ ] Release tag created  
- [ ] GitHub release published
- [ ] Deployment monitoring active
- [ ] Database updated with deployment info
- [ ] Rollback procedures documented

---

## Deployment Validation Checklist

Before ANY production Git operations:

### Database Validation (MANDATORY)
- [ ] Strategic Directive exists in `strategic_directives_v2`
- [ ] SD status = 'archived'
- [ ] PRD exists in `product_requirements_v2`  
- [ ] PRD status = 'approved'
- [ ] All phase progress = 100%
- [ ] LEAD approval date recorded

### Implementation Validation
- [ ] All acceptance tests passing
- [ ] Code review completed
- [ ] Security review passed
- [ ] Performance benchmarks met
- [ ] Documentation complete

### Authorization Validation  
- [ ] LEAD approval checklist 7/7 complete
- [ ] Business value confirmed
- [ ] Strategic objectives met
- [ ] Deployment authorized by LEAD

---

## Prohibited Operations

### During Implementation Phase (EXEC)
❌ **NEVER** merge to main/production branches  
❌ **NEVER** create release tags  
❌ **NEVER** trigger production deployments  
❌ **NEVER** push to branches that auto-deploy  

### Before LEAD Approval
❌ **NEVER** deploy to production  
❌ **NEVER** create public releases  
❌ **NEVER** announce feature availability  
❌ **NEVER** merge feature branches to main  

---

## GitHub Sub-Agent Integration

### Mandatory Activation Criteria
The GitHub Deployment Sub-Agent MUST be activated when:
- PRD mentions deployment/release requirements
- Strategic Directive includes production delivery
- Implementation phase mentions going live
- Any production environment changes needed

**Activation Threshold**: ANY deployment mention = MUST activate GitHub sub-agent

### Sub-Agent Decision Tree Integration
```
EXEC reads PRD
  ↓
Contains deployment requirements? → YES → Queue GitHub Sub-Agent for post-approval
  ↓ NO
Contains production mentions? → YES → Queue GitHub Sub-Agent for post-approval  
  ↓ NO
Proceed without GitHub sub-agent
```

**Note**: GitHub sub-agent is queued but NOT activated until LEAD approval complete.

---

## Error Prevention

### Common Anti-Patterns (DON'T)
```bash
# ❌ WRONG - Deploying during EXEC phase
git push origin main  # While EXEC is implementing

# ❌ WRONG - Creating releases before approval  
gh release create v1.0.0  # Without LEAD authorization

# ❌ WRONG - Merging before verification
git merge feature-branch  # Before PLAN verification
```

### Correct Patterns (DO)
```bash
# ✅ CORRECT - Development tracking
git push origin feature/SD-2025-001  # During EXEC phase

# ✅ CORRECT - Post-approval deployment
# (After LEAD approval complete)
node scripts/deploy-with-approval.js SD-2025-001
```

---

## Migration from Previous Versions

### Breaking Changes from v3.1.5
- **v3.1.5**: "EXEC SHOULD push to Git" during implementation
- **v4.1.2**: EXEC only pushes to development branches, production after LEAD approval

### Updated Git Operation Timing
- **OLD**: Push timing triggers during EXEC phase
- **NEW**: Production deployment only after verification cycle complete

---

## Implementation Scripts

### Required Scripts for v4.1.2 Compliance

#### 1. Deployment Readiness Validator
```bash
scripts/validate-deployment-readiness.js
# Checks LEAD approval before any production Git operations
```

#### 2. GitHub Sub-Agent Orchestrator  
```bash
scripts/github-deployment-subagent.js
# Handles production deployment after LEAD authorization
```

#### 3. Post-Deployment Database Update
```bash
scripts/update-deployment-metadata.js  
# Records deployment completion in database
```

---

## Best Practices

### DO's
✅ Use development branches during implementation  
✅ Wait for LEAD approval before production deployment  
✅ Validate database state before any deployment  
✅ Document all deployment decisions  
✅ Monitor deployment status post-release  

### DON'Ts
❌ Deploy without completing verification cycle  
❌ Skip LEAD approval for any production change  
❌ Create releases during EXEC implementation  
❌ Merge to main before PLAN verification  
❌ Ignore database-first requirements  

---

## Conclusion

GitHub deployment in LEO Protocol v4.1.2 is governed by the verification cycle principle: **EXEC → PLAN → LEAD → DEPLOY**. Production deployments are a specialized sub-agent responsibility that activates only after complete strategic and technical approval.

This ensures quality, strategic alignment, and proper governance for all production releases.

---

*LEO Protocol v4.1.2 GitHub Deployment Workflow*  
*For support: Use latest protocol version only*