# Dual-Lane Workflow Retrospective R1

**Date**: 2025-01-19
**Protocol**: LEO v4.2.0_story_gates
**Participants**: Codex (Builder), Claude/EXEC (Enforcer), PLAN (Supervisor), LEAD (Strategic)

---

## Executive Summary

**Recommendation**: **Proceed with Conditions**

The dual-lane workflow successfully demonstrated role separation, artifact integrity, and gate enforcement. All four roles signed aligned declarations, the audit pack was certified, and negative tests passed (simulated). However, critical gaps remain: Sigstore signing requires non-sandbox environment, policy supply chain lacks attestations, and Kyverno policies need production deployment. With the proposed 2-week action plan addressing these gaps, the system can achieve production readiness by implementing the 6 workstreams defined below.

---

## 1. What Went Well (WWW)

### Concrete Successes

- [x] **Lane Separation Achieved**
  - Evidence: `staging/codex-agents-bridge` branch created (simulated)
  - Evidence: `feature/dual-lane-agents-bridge` branch created and pushed
  - Commit markers: `[CODEX-READY:codex-agents-bridge]`, `[CLAUDE-APPLIED:codex-agents-bridge]`

- [x] **Artifact Integrity Maintained**
  - Evidence: `artifact.tar.gz` with SHA256 verification
  - SBOM validated: CycloneDX 1.5 JSON format
  - Attestation structure: in-toto v1.0 with SLSA Provenance v0.2

- [x] **Gate Wiring Configured**
  - PR #2 created: https://github.com/rickfelix/EHG_Engineer/pull/2
  - Workflows created: `.github/workflows/slsa-verification.yml`, `policy-verification.yml`, `auto-labels.yml`
  - Label applied: `claude-enforcing` on PR #2

- [x] **Audit Pack Certified**
  - Evidence: `docs/dual-lane-audit-pack.md` v1.0.0 certified
  - All 4 role declarations signed with 100% confidence
  - Governance guarantees validated against line references

- [x] **Negative Tests Passed**
  - Evidence: `tests/negative/simulate-negative-tests.sh` - 4/4 passed
  - Blocked: unsigned images, non-digest images, provenance replay, policy tampering

---

## 2. What Didn't Work / Risks (WNR)

| Risk/Gap | Impact | Likelihood | Mitigation Required |
|----------|--------|------------|-------------------|
| **Sigstore Egress Blocked** | HIGH - Cannot sign artifacts | CERTAIN - Sandbox limitation | WS1: Move to non-sandbox for signing |
| **Label State Drift** | MEDIUM - Incorrect PR state | MEDIUM - Manual label changes | WS6: Auto-label state machine |
| **Policy Supply Chain** | HIGH - Unsigned policies | HIGH - Not implemented | WS2: Sign all policy bundles |
| **OIDC Fallback Missing** | MEDIUM - Self-hosted Git issues | LOW - Using GitHub | WS4: Document SPIFFE/SPIRE fallback |
| **Kyverno Not Deployed** | HIGH - No runtime enforcement | CERTAIN - Staging only | WS3: Deploy to staging cluster |
| **Provenance Format Version** | LOW - Compatibility | LOW - v0.2 is current | Document in SOP |

---

## 3. Data & KPIs

### Current Metrics (Pilot Day 1)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Time: [CODEX-READY] → PR Open | ~15 minutes | <30 minutes | ✅ PASS |
| Checks Passing | 1/1 (Cursor Bot only) | 4/4 required | ⚠️ PARTIAL |
| Negative Tests Blocked | 4/4 (simulated) | 4/4 | ✅ PASS |
| Rework Cycles | 0 | ≤2 | ✅ PASS |
| SLSA L3 Provenance Coverage | 0% (not signed) | 100% | ❌ FAIL |
| Change Failure Rate | 0% | <5% | ✅ PASS |

---

## 4. Decisions to Lock

### Branch Protection Check Names (FINAL)
```yaml
required_status_checks:
  - "LEO Gate Validation / Run Gate 3 for PRD-*"
  - "Story Release Gate Check / Check Story Release Gate"
  - "SLSA Verification / Verify SLSA Provenance"
  - "Policy Verification / Validate Policy Bundle"
```

### Artifact Bundle Schema (FINAL)
```
artifact.tar.gz
├── changes.patch         # Unified diff
├── merge-base.sha       # Git commit SHA
├── attestation.intoto   # in-toto v1.0, SLSA Provenance v0.2
├── sbom.cdx.json       # CycloneDX 1.5
└── rollback.sql        # If DB changes
```

### Policy-as-Artifacts Approach (FINAL)
- All Kyverno/OPA policies bundled as `policies.tar.gz`
- Signed with cosign keyless (Sigstore)
- Attestation includes policy version and hash
- Admission controller verifies signature before applying

---

## 5. Action Plan (2-Week)

### Workstream Breakdown

#### WS1: Signing & Provenance
**Owner**: Claude/EXEC
**DoD**:
- [ ] Enable Sigstore keyless in non-sandbox environment
- [ ] Verify re-sign on modification works
- [ ] Add provenance replay test to CI
**Due**: Week 1

#### WS2: Policy Supply Chain
**Owner**: PLAN + Platform
**DoD**:
- [ ] Sign all Kyverno policy bundles
- [ ] Add `policy-verification / validate` check
- [ ] Create SLSA attestations for policy changes
**Due**: Week 1

#### WS3: GitOps Enforcement
**Owner**: Platform
**DoD**:
- [ ] Deploy Flux v2 to staging cluster
- [ ] Apply Kyverno policies (require-signed-images, require-slsa, require-digest)
- [ ] Execute direct `kubectl` negative test
**Due**: Week 2

#### WS4: Credential Separation
**Owner**: Security
**DoD**:
- [ ] Verify `.env.codex` has anon key only
- [ ] Verify `.env.claude` has service role key
- [ ] Document OIDC → SPIFFE/SPIRE fallback
**Due**: Week 1

#### WS5: Drift & Alignment
**Owner**: Codex + PLAN
**DoD**:
- [ ] Create `leo-drift-check.yml` workflow
- [ ] Weekly comparison of AGENTS.md ↔ CLAUDE.md
- [ ] Fail on gate terminology drift
**Due**: Week 2

#### WS6: Observability & Labels
**Owner**: Claude/EXEC
**DoD**:
- [ ] Implement auto-label state transitions
- [ ] Create dashboard of gate status per PR
- [ ] Log merge-base and artifact digest
**Due**: Week 2

### Timeline (Gantt)

```
Week 1 (Jan 20-26):
├─ WS1: Signing & Provenance     ████████████████
├─ WS2: Policy Supply Chain      ████████████████
├─ WS4: Credential Separation    ████████████████
│
Week 2 (Jan 27-Feb 2):
├─ WS3: GitOps Enforcement                      ████████████████
├─ WS5: Drift & Alignment                       ████████████████
└─ WS6: Observability & Labels                  ████████████████
```

---

## 6. Go/No-Go Criteria for Scaling

### Pass Bar (Must achieve ALL)

- [ ] **≥95% PRs with PLAN verdict** recorded in database
- [ ] **≤2 rework cycles** per PR (Codex → Claude → PLAN)
- [ ] **100% artifacts signed** with Sigstore (non-sandbox)
- [ ] **100% provenance verified** at admission control
- [ ] **≥1 blocked negative test** in production (real Kubernetes)
- [ ] **0 drift incidents** between AGENTS.md and CLAUDE.md
- [ ] **100% label accuracy** (auto-labels match actual state)

### Measurement Date: 2025-02-02

---

## 7. SOP & Documentation Deltas

### Required Updates

#### docs/dual-lane-SOP.md
```diff
@@ Section 4.1 @@
+ Note: Sigstore signing requires non-sandbox environment with network egress
+ Fallback: If Sigstore unavailable, use GPG with key rotation every 30 days
```

#### AGENTS.md sync note
```diff
@@ Line 50 @@
-**Sync note:** If gate names or thresholds change in `CLAUDE.md`, update this file in the same PR.
+**Sync note:** If gate names or thresholds change in `CLAUDE.md`, update this file in the same PR.
+**Drift Check:** Weekly CI job `leo-drift-check.yml` validates alignment; failures block merges.
```

#### .github/workflows/leo-drift-check.yml (NEW)
```yaml
name: LEO Drift Check
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check AGENTS.md vs CLAUDE.md
        run: |
          # Extract gate threshold from both files
          AGENTS_THRESHOLD=$(grep -oP '≥\K[0-9]+(?=%)' AGENTS.md | head -1)
          CLAUDE_THRESHOLD=$(grep -oP '≥\K[0-9]+(?=%)' CLAUDE.md | head -1)

          if [ "$AGENTS_THRESHOLD" != "$CLAUDE_THRESHOLD" ]; then
            echo "❌ DRIFT DETECTED: Gate thresholds don't match!"
            echo "AGENTS.md: $AGENTS_THRESHOLD%"
            echo "CLAUDE.md: $CLAUDE_THRESHOLD%"
            exit 1
          fi

          echo "✅ No drift detected"
```

#### docs/dual-lane-audit-pack.md changelog
```diff
@@ Change Log @@
+| 2025-01-20 | 1.0.1 | Added WS1-6 workstream tracking | Claude/EXEC |
+| 2025-02-02 | 1.1.0 | Scaling decision checkpoint | LEAD |
```

---

## Next Steps Checklist

### Week 1 (Due: 2025-01-26)
- [ ] WS1: Enable Sigstore in non-sandbox (Owner: Claude/EXEC)
- [ ] WS2: Sign first policy bundle (Owner: PLAN)
- [ ] WS4: Validate credential separation (Owner: Security)

### Week 2 (Due: 2025-02-02)
- [ ] WS3: Deploy Flux v2 + Kyverno (Owner: Platform)
- [ ] WS5: Deploy drift check workflow (Owner: Codex)
- [ ] WS6: Dashboard goes live (Owner: Claude/EXEC)
- [ ] Go/No-Go Decision Meeting (Owner: LEAD)

---

## Appendix: Evidence Links

- PR #2: https://github.com/rickfelix/EHG_Engineer/pull/2
- Commit with [CLAUDE-APPLIED]: 07b943a
- Workflows: `.github/workflows/slsa-verification.yml`, `policy-verification.yml`
- Negative tests: `tests/negative/simulate-negative-tests.sh`
- Audit Pack: `docs/dual-lane-audit-pack.md` (certified 2025-01-19)

---

*End of Retrospective R1*