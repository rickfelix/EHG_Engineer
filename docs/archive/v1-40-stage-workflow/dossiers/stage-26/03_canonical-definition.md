# Stage 26: Canonical Definition (stages.yaml)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1149-1194

---

## Full YAML Definition

```yaml
  - id: 26
    title: Security & Compliance Certification
    description: Security validation and compliance certification processes.
    depends_on:
      - 25
    inputs:
      - Security requirements
      - Compliance standards
      - Audit criteria
    outputs:
      - Security report
      - Compliance certificates
      - Audit trail
    metrics:
      - Security score
      - Compliance rate
      - Vulnerability count
    gates:
      entry:
        - Security requirements defined
        - Standards identified
      exit:
        - Security verified
        - Compliance achieved
        - Certificates issued
    substages:
      - id: '26.1'
        title: Security Testing
        done_when:
          - Penetration testing complete
          - Vulnerabilities patched
          - OWASP compliance verified
      - id: '26.2'
        title: Compliance Validation
        done_when:
          - Standards reviewed
          - Evidence collected
          - Audits passed
      - id: '26.3'
        title: Certification Process
        done_when:
          - Documentation prepared
          - Certificates obtained
          - Records archived
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field-by-Field Analysis

### Core Identification

| Field | Value | Notes |
|-------|-------|-------|
| `id` | 26 | Sequential stage number |
| `title` | Security & Compliance Certification | Security-focused stage title |
| `description` | Security validation and compliance certification processes. | Focus on security and compliance |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1149-1151

### Dependencies

| Field | Value | Notes |
|-------|-------|-------|
| `depends_on` | [25] | Requires QA Certification complete |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1152-1153

### Inputs

| Input | Type | Source |
|-------|------|--------|
| Security requirements | Requirements document | From PRD/technical specs |
| Compliance standards | Standards list | Industry/regulatory requirements |
| Audit criteria | Criteria checklist | Compliance framework |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1154-1157

### Outputs

| Output | Type | Consumer |
|--------|------|----------|
| Security report | Report document | Stage 27, stakeholders |
| Compliance certificates | Certificates | Audit trail, production gate |
| Audit trail | Audit log | Compliance records |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1158-1161

### Metrics

| Metric | Type | Purpose |
|--------|------|---------|
| Security score | Numeric score | Overall security assessment |
| Compliance rate | Percentage | Standards compliance level |
| Vulnerability count | Integer count | Security issue tracking |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1162-1165

**Critique Note**: No threshold values defined (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:38)

### Gates

#### Entry Gates

| Gate | Type | Verification Method |
|------|------|---------------------|
| Security requirements defined | Requirement | Documentation review |
| Standards identified | Standard | Compliance mapping |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1167-1169

#### Exit Gates

| Gate | Type | Verification Method |
|------|------|---------------------|
| Security verified | Validation | Penetration test results |
| Compliance achieved | Certification | Audit pass confirmation |
| Certificates issued | Artifact | Certificate documents |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1170-1173

### Substages

#### 26.1 Security Testing

**Done When**:
- Penetration testing complete
- Vulnerabilities patched
- OWASP compliance verified

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1175-1180

#### 26.2 Compliance Validation

**Done When**:
- Standards reviewed
- Evidence collected
- Audits passed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1181-1186

#### 26.3 Certification Process

**Done When**:
- Documentation prepared
- Certificates obtained
- Records archived

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1187-1192

### Notes

**Progression Mode**: Manual → Assisted → Auto (suggested)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1193-1194

**Interpretation**: Stage designed for eventual automation but currently manual/assisted.

---

## Cross-Reference Check

**Phase Assignment**: EXEC (Stages 11-40)
**Typical Ownership**: Security team, Compliance team
**Automation Readiness**: Low (score 3/5 from critique)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:11

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Full YAML | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1149-1194 | "id: 26" through "progression_mode" |
| Critique thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 38 | "Missing: Threshold values" |
| Critique automation | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 11 | "Automation Leverage | 3" |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
