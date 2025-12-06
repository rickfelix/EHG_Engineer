# Stage 26: Recursion Blueprint

**Current Recursion Status**: ⚠️ 2/5 (Generic recursion support pending)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:15 "Recursion Readiness | 2"

---

## Recursion Support Gap

**Current State**: No explicit recursion triggers defined for Stage 26

**Target State**: 4 recursion triggers for security and compliance issues

**Gap Impact**: Cannot automatically loop back for security issues discovered post-certification or compliance drift

---

## Proposed Recursion Triggers

### SECURITY-001: Critical Vulnerability Detected

**Trigger Condition**: Critical or high-severity vulnerability discovered after Stage 26 completion

**Source**:
- Post-production security monitoring
- Vulnerability disclosure (CVE, security researcher)
- Continuous vulnerability scanning

**Recursion Path**: Stage 27+ → Stage 26.1 (Security Testing)

**Process**:
1. Vulnerability alert received (CVSS ≥ 7.0)
2. Trigger Stage 26.1 security testing
3. Execute PenetrationTesterAgent to validate vulnerability
4. If confirmed, trigger VulnerabilityRemediationAgent
5. Patch vulnerability
6. Re-run security tests
7. Update security report
8. Resume normal flow (Stage 27+)

**Exit Condition**: Vulnerability remediated AND re-test passed

**Priority**: P0 CRITICAL (blocks production)

**Evidence**: Based on substage 26.1 (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1175-1180 "Penetration testing complete")

---

### SECURITY-002: Compliance Audit Failed

**Trigger Condition**: External or internal audit identifies compliance failures

**Source**:
- Annual SOC 2 audit
- ISO 27001 re-certification audit
- Internal compliance review
- Regulatory inspection

**Recursion Path**: Stage 27+ → Stage 26.2 (Compliance Validation)

**Process**:
1. Audit failure notification received
2. Trigger Stage 26.2 compliance validation
3. Execute ComplianceAuditorAgent to identify non-conformances
4. Remediate compliance gaps
5. Collect new evidence
6. Re-run internal audit
7. Re-submit for external audit (if required)
8. Update compliance certificates
9. Resume normal flow (Stage 27+)

**Exit Condition**: All audit findings remediated AND re-audit passed

**Priority**: P1 HIGH (compliance risk)

**Evidence**: Based on substage 26.2 (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1181-1186 "Audits passed")

---

### SECURITY-003: Certificate Expiring

**Trigger Condition**: Security or compliance certificate approaching expiration (30 days warning)

**Source**:
- Certificate monitoring system
- Automated expiration alerts
- Compliance calendar

**Recursion Path**: Stage 27+ → Stage 26.3 (Certification Process)

**Process**:
1. Certificate expiration alert (30 days before expiry)
2. Trigger Stage 26.3 certification process
3. Execute CertificateCoordinatorAgent to renew certificates
4. Review and update documentation
5. Re-submit for certification (if required)
6. Obtain renewed certificates
7. Archive new records
8. Update certificate database
9. Resume normal flow (Stage 27+)

**Exit Condition**: New certificates obtained AND archived

**Priority**: P2 MEDIUM (proactive renewal)

**Evidence**: Based on substage 26.3 (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1187-1192 "Certificates obtained")

---

### SECURITY-004: OWASP Compliance Verification Required

**Trigger Condition**: New OWASP Top 10 release or major code changes requiring re-verification

**Source**:
- OWASP Top 10 updated (annual/biennial)
- Major feature release (Stage 11-20 changes)
- Security policy update

**Recursion Path**: Stage 27+ → Stage 26.1 (Security Testing)

**Process**:
1. OWASP update notification OR major code change detected
2. Trigger Stage 26.1 security testing
3. Execute PenetrationTesterAgent with updated OWASP Top 10 tests
4. Validate compliance with new OWASP standards
5. Remediate any new vulnerabilities
6. Update security report
7. Update OWASP compliance scorecard
8. Resume normal flow (Stage 27+)

**Exit Condition**: OWASP compliance re-verified

**Priority**: P2 MEDIUM (ongoing compliance)

**Evidence**: Based on substage 26.1 done_when condition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1180 "OWASP compliance verified")

---

## Recursion Decision Matrix

| Trigger | Severity | Auto-Trigger | Human Approval | Target Substage | Estimated Duration |
|---------|----------|--------------|----------------|-----------------|-------------------|
| SECURITY-001 | Critical | Yes | No (emergency) | 26.1 | 1-3 days |
| SECURITY-002 | High | No | Yes | 26.2 | 3-7 days |
| SECURITY-003 | Medium | Yes | No (scheduled) | 26.3 | 1-2 days |
| SECURITY-004 | Medium | Yes | Yes | 26.1 | 2-4 days |

---

## Implementation Requirements

### Database Schema (Proposed)

**Table**: `security_recursion_triggers`

```sql
CREATE TABLE security_recursion_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_code TEXT NOT NULL, -- SECURITY-001, SECURITY-002, etc.
  venture_id UUID REFERENCES ventures(id),
  trigger_condition TEXT NOT NULL,
  severity TEXT NOT NULL, -- CRITICAL, HIGH, MEDIUM, LOW
  triggered_at TIMESTAMPTZ DEFAULT now(),
  target_substage TEXT NOT NULL, -- '26.1', '26.2', '26.3'
  auto_trigger BOOLEAN DEFAULT false,
  human_approval_required BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
  completed_at TIMESTAMPTZ,
  notes TEXT
);
```

### Monitoring Integration

**Automated Checks**:
- Daily vulnerability scan (SECURITY-001)
- Weekly compliance drift detection (SECURITY-002)
- Certificate expiration monitoring (SECURITY-003)
- OWASP update tracker (SECURITY-004)

**Alert Destinations**:
- Security team Slack channel
- Email to CISO
- Dashboard notification
- ventures table status update

---

## Recursion Metrics

Track recursion effectiveness:

| Metric | Description | Target |
|--------|-------------|--------|
| Time to detect | Time from issue occurrence to trigger | < 24 hours |
| Time to remediate | Time from trigger to exit condition met | < 7 days |
| Recursion frequency | Number of recursions per venture | < 2 per year |
| False positive rate | Triggers that didn't require action | < 10% |

**Storage**: `stage_metrics` table (proposed)

---

## Cross-Stage Recursion

### From Later Stages Back to Stage 26

**Stage 27-40** (Actor/Saga, Production, etc.) → **Stage 26**:
- Production security incident detected
- Compliance violation reported
- Certificate expired during production

**Trigger Mechanism**:
1. Later stage detects security/compliance issue
2. Creates recursion trigger in `security_recursion_triggers` table
3. Stage 26 SecurityComplianceCrew monitors triggers
4. Auto-executes appropriate substage
5. Updates venture status
6. Resumes later stage upon completion

---

## Recursion Testing

**Test Scenarios** (to be implemented):

1. **SECURITY-001 Test**: Inject known vulnerability, verify auto-trigger, confirm remediation
2. **SECURITY-002 Test**: Simulate audit failure, verify human approval required, confirm remediation
3. **SECURITY-003 Test**: Set certificate expiration date to 30 days, verify auto-renewal trigger
4. **SECURITY-004 Test**: Simulate OWASP update, verify compliance re-check triggered

**Evidence**: No tests currently implemented (gap)

---

## Gaps Identified

1. **No recursion triggers defined**: Must implement all 4 triggers
2. **No monitoring system**: Must create vulnerability/compliance monitoring
3. **No database schema**: Must create `security_recursion_triggers` table
4. **No alert integration**: Must integrate with Slack, email, dashboard
5. **No recursion testing**: Must create test scenarios

**Action**: Add to 10_gaps-backlog.md

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Recursion score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 15 | "Recursion Readiness | 2" |
| Substage 26.1 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1175-1180 | "Security Testing" |
| OWASP compliance | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1180 | "OWASP compliance verified" |
| Substage 26.2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1181-1186 | "Compliance Validation" |
| Audits condition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1186 | "Audits passed" |
| Substage 26.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1187-1192 | "Certification Process" |
| Certificates condition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1191 | "Certificates obtained" |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
