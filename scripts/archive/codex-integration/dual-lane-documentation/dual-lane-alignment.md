# Dual-Lane Alignment Document

**Purpose**: Permanent audit artifact proving lane alignment and governance compliance
**Effective Date**: 2025-01-19
**Protocol Version**: LEO v4.2.0_story_gates
**Authoritative Sources**: CLAUDE.md, AGENTS.md, docs/dual-lane-SOP.md

---

## Lane Responsibility Comparison

| **Aspect** | **Codex (Builder Lane)** | **Claude/EXEC (Enforcer Lane)** |
|------------|--------------------------|----------------------------------|
| **Primary Role** | Read-only builder generating patches | Write-enabled enforcer applying changes |
| **Database Access** | Read-only (`SUPABASE_ANON_KEY`) | Write-enabled (`SUPABASE_SERVICE_ROLE_KEY`) |
| **Branch Namespace** | `staging/codex-*` only | `feature/*` only |
| **Commit Marker** | `[CODEX-READY:<hash>]` | `[CLAUDE-APPLIED:<hash>]` |
| **Artifact Creation** | ✅ Creates patches, SBOM, attestations | ❌ Only re-signs if needed |
| **Signing Authority** | ❌ No Sigstore access | ✅ Full Sigstore keyless signing |
| **PR Creation** | ❌ Prohibited | ✅ Required |
| **Workflow Triggering** | ❌ Cannot trigger | ✅ Triggers all gates |
| **Gate Monitoring** | ❌ No monitoring role | ❌ No monitoring role |
| **PASS Verdict Authority** | ❌ Cannot issue | ❌ Cannot issue |
| **Network Access** | ❌ Blocked/sandboxed | ✅ Full network access |
| **File Creation** | ❌ No PRD/handoff files | ❌ No PRD/handoff files |

---

## Responsibilities Checklist

### ✅ Codex (Builder) Responsibilities
- Generate unified diffs (`changes.patch`)
- Create SBOM (CycloneDX 1.5)
- Create attestation (in-toto v1.0, SLSA v0.2)
- Document merge-base SHA
- Write rollback instructions
- Bundle as `artifact.tar.gz`
- Commit to `staging/codex-*`
- Mark with `[CODEX-READY:<hash>]`
- **STOP** - Handoff to Claude

### ✅ Claude/EXEC (Enforcer) Responsibilities
- Verify artifact integrity (SHA256)
- Validate attestation format
- Confirm SBOM compliance
- Re-sign with Sigstore (if needed)
- Create `feature/*` branch
- Apply patch via cherry-pick/apply
- Commit with `[CLAUDE-APPLIED:<hash>]`
- Open PR with required labels
- Trigger verification workflows
- Update database tracking
- **STOP** - Handoff to PLAN

---

## Out-of-Scope Actions

### ❌ Codex CANNOT
- Write to database
- Create PRs
- Trigger workflows
- Monitor gates
- Issue verdicts
- Access production secrets
- Sign with Sigstore
- Work in `feature/*` branches
- Interpret gate results
- Bypass PLAN verification

### ❌ Claude/EXEC CANNOT
- Generate initial patches
- Work in `staging/codex-*`
- Monitor gates after PR creation
- Issue PASS/FAIL verdicts
- Determine ≥85% threshold
- Override PLAN decisions
- Bypass branch protection
- Create PRD/handoff files
- Skip verification workflows
- Merge without PLAN approval

---

## Lane Boundaries

| **Phase** | **Codex Boundary** | **Claude/EXEC Boundary** |
|-----------|-------------------|---------------------------|
| **START** | Receive PRD/requirements | Receive `[CODEX-READY]` bundle |
| **WORK** | Generate patches and artifacts | Apply patches and create PR |
| **STOP** | Commit `[CODEX-READY]` marker | PR created with workflows triggered |
| **HANDOFF TO** | Claude/EXEC | PLAN Supervisor |
| **CANNOT PROCEED TO** | PR creation or gates | Gate monitoring or verdicts |

---

## Governance Guarantees

### 1. **Codex stops at `[CODEX-READY]`**
- Work is complete once handoff marker is committed
- No further actions permitted beyond this point
- Reference: AGENTS.md line 23, dual-lane-SOP.md section 1.1

### 2. **Claude stops at PR creation/workflow trigger**
- Responsibility ends after workflows are initiated
- No gate monitoring or verdict interpretation
- Reference: CLAUDE.md lines 34-39, dual-lane-SOP.md section 1.2

### 3. **PLAN Supervisor alone issues ≥85% PASS verdict**
- Exclusive authority for verification verdicts
- Required confidence threshold: ≥85%
- Reference: CLAUDE.md lines 443, AGENTS.md line 24

### 4. **LEAD retains escalation authority**
- Reviews CONDITIONAL_PASS and ESCALATE verdicts
- Final strategic approval after PLAN PASS
- Reference: CLAUDE.md lines 170-171, dual-lane-SOP.md section 2.2

### 5. **Database-first integrity preserved**
- No PRD files created (use `scripts/add-prd-to-database.js`)
- No handoff document files (use database tables)
- All state tracked in Supabase tables
- Reference: CLAUDE.md lines 106-125

---

## Compliance Verification

This document confirms:
- ✅ Clear separation of duties between lanes
- ✅ No overlapping authorities or responsibilities
- ✅ Explicit handoff markers and boundaries
- ✅ Database-first architecture enforced
- ✅ PLAN Supervisor verification supremacy maintained
- ✅ Alignment with LEO Protocol v4.2.0 percentages:
  - EXEC (Codex + Claude combined): 30%
  - PLAN: 35% (including 15% verification)
  - LEAD: 35% (including 15% approval)

---

## Document Control

| Field | Value |
|-------|-------|
| **Classification** | Governance Audit Artifact |
| **Review Frequency** | Upon protocol version change |
| **Owner** | Platform Engineering Team |
| **Last Validated** | 2025-01-19 |
| **Next Review** | Upon LEO Protocol update |

---

*This alignment document is maintained under database-first governance. Any changes must be reflected in the authoritative sources: CLAUDE.md, AGENTS.md, and docs/dual-lane-SOP.md.*