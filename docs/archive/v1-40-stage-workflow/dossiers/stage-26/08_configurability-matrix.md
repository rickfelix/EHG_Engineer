# Stage 26: Configurability Matrix

**Purpose**: Define tunable parameters for security and compliance certification processes.

---

## Configuration Categories

### 1. Security Testing Parameters

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `owasp_compliance_level` | Enum | `strict` | `basic`, `standard`, `strict` | OWASP Top 10 testing depth | stages.yaml:1180 |
| `pen_test_frequency` | Integer | 90 | 30-365 days | Days between penetration tests | stages.yaml:1178 |
| `vulnerability_scan_schedule` | Cron | `0 2 * * *` | Valid cron | Daily vulnerability scanning | stages.yaml:1179 |
| `cvss_critical_threshold` | Float | 9.0 | 7.0-10.0 | Minimum CVSS for critical severity | stages.yaml:1179 |
| `cvss_high_threshold` | Float | 7.0 | 4.0-8.9 | Minimum CVSS for high severity | stages.yaml:1179 |
| `auto_patch_enabled` | Boolean | false | true/false | Automatically patch low severity issues | stages.yaml:1179 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1175-1180 "Security Testing"

---

### 2. Compliance Validation Parameters

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `compliance_standards` | Array | `["SOC2"]` | SOC2, ISO27001, GDPR, HIPAA, PCI_DSS, CCPA | Applicable standards to validate | stages.yaml:1156 |
| `audit_frequency` | Integer | 365 | 90-730 days | Days between internal audits | stages.yaml:1186 |
| `evidence_retention_days` | Integer | 2555 | 365-3650 | Days to retain compliance evidence (7 years default) | stages.yaml:1192 |
| `auto_evidence_collection` | Boolean | true | true/false | Automatically collect compliance evidence | stages.yaml:1185 |
| `audit_pass_threshold` | Float | 0.95 | 0.80-1.00 | Minimum % of controls to pass audit | stages.yaml:1186 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1181-1186 "Compliance Validation"

---

### 3. Certification Process Parameters

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `certificate_renewal_days` | Integer | 30 | 7-90 days | Days before expiry to trigger renewal | stages.yaml:1191 |
| `external_certification_required` | Boolean | false | true/false | Require external auditor certification | stages.yaml:1191 |
| `documentation_format` | Enum | `pdf` | `pdf`, `html`, `markdown` | Format for security reports | stages.yaml:1190 |
| `archive_encryption_enabled` | Boolean | true | true/false | Encrypt archived records | stages.yaml:1192 |
| `archive_storage_location` | String | `/compliance/` | Valid path | Storage path for archived records | stages.yaml:1192 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1187-1192 "Certification Process"

---

### 4. Metrics & Thresholds

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `security_score_target` | Float | 85.0 | 0-100 | Target security score to pass | stages.yaml:1163 |
| `compliance_rate_target` | Float | 95.0 | 0-100 | Target compliance rate (%) to pass | stages.yaml:1164 |
| `max_critical_vulnerabilities` | Integer | 0 | 0-5 | Maximum allowed critical vulnerabilities | stages.yaml:1165 |
| `max_high_vulnerabilities` | Integer | 3 | 0-10 | Maximum allowed high vulnerabilities | stages.yaml:1165 |
| `max_medium_vulnerabilities` | Integer | 10 | 0-50 | Maximum allowed medium vulnerabilities | stages.yaml:1165 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1162-1165 "metrics"

**Note**: Default thresholds are PROPOSED; not currently defined in stages.yaml (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:38)

---

### 5. Automation Levels

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `automation_mode` | Enum | `manual` | `manual`, `assisted`, `auto` | Automation level for Stage 26 | stages.yaml:1194 |
| `auto_trigger_pen_test` | Boolean | false | true/false | Automatically trigger pen tests on schedule | stages.yaml:1194 |
| `auto_trigger_audit` | Boolean | false | true/false | Automatically trigger internal audits | stages.yaml:1194 |
| `auto_renewal_enabled` | Boolean | false | true/false | Automatically renew expiring certificates | stages.yaml:1194 |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1194 "progression_mode: Manual → Assisted → Auto"

---

### 6. Recursion Triggers

| Parameter | Type | Default | Range | Purpose | Evidence |
|-----------|------|---------|-------|---------|----------|
| `recursion_enabled` | Boolean | false | true/false | Enable recursion triggers | critique:15 |
| `auto_recursion_critical` | Boolean | true | true/false | Auto-trigger SECURITY-001 (critical vuln) | Proposed |
| `auto_recursion_certificate` | Boolean | true | true/false | Auto-trigger SECURITY-003 (cert expiry) | Proposed |
| `recursion_approval_required` | Boolean | true | true/false | Require human approval for recursion | Proposed |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-26.md:15 "Recursion Readiness | 2"

---

## Configuration Storage

### Proposed Database Schema

**Table**: `stage_26_config`

```sql
CREATE TABLE stage_26_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),

  -- Security Testing
  owasp_compliance_level TEXT DEFAULT 'strict',
  pen_test_frequency INTEGER DEFAULT 90,
  vulnerability_scan_schedule TEXT DEFAULT '0 2 * * *',
  cvss_critical_threshold FLOAT DEFAULT 9.0,
  cvss_high_threshold FLOAT DEFAULT 7.0,
  auto_patch_enabled BOOLEAN DEFAULT false,

  -- Compliance Validation
  compliance_standards TEXT[] DEFAULT ARRAY['SOC2'],
  audit_frequency INTEGER DEFAULT 365,
  evidence_retention_days INTEGER DEFAULT 2555,
  auto_evidence_collection BOOLEAN DEFAULT true,
  audit_pass_threshold FLOAT DEFAULT 0.95,

  -- Certification Process
  certificate_renewal_days INTEGER DEFAULT 30,
  external_certification_required BOOLEAN DEFAULT false,
  documentation_format TEXT DEFAULT 'pdf',
  archive_encryption_enabled BOOLEAN DEFAULT true,
  archive_storage_location TEXT DEFAULT '/compliance/',

  -- Metrics & Thresholds
  security_score_target FLOAT DEFAULT 85.0,
  compliance_rate_target FLOAT DEFAULT 95.0,
  max_critical_vulnerabilities INTEGER DEFAULT 0,
  max_high_vulnerabilities INTEGER DEFAULT 3,
  max_medium_vulnerabilities INTEGER DEFAULT 10,

  -- Automation Levels
  automation_mode TEXT DEFAULT 'manual',
  auto_trigger_pen_test BOOLEAN DEFAULT false,
  auto_trigger_audit BOOLEAN DEFAULT false,
  auto_renewal_enabled BOOLEAN DEFAULT false,

  -- Recursion Triggers
  recursion_enabled BOOLEAN DEFAULT false,
  auto_recursion_critical BOOLEAN DEFAULT true,
  auto_recursion_certificate BOOLEAN DEFAULT true,
  recursion_approval_required BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Configuration Profiles

### Profile 1: Development Environment

**Use Case**: Early-stage ventures, internal testing, non-production

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `owasp_compliance_level` | `basic` | Lighter testing for development |
| `pen_test_frequency` | 180 | Less frequent testing |
| `compliance_standards` | `[]` | No compliance required |
| `external_certification_required` | false | Internal only |
| `automation_mode` | `manual` | Manual review required |

---

### Profile 2: Production Environment

**Use Case**: Production-ready ventures, external customers, compliance required

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `owasp_compliance_level` | `strict` | Full OWASP Top 10 testing |
| `pen_test_frequency` | 90 | Quarterly pen tests |
| `compliance_standards` | `["SOC2", "ISO27001"]` | Full compliance required |
| `external_certification_required` | true | External auditor required |
| `automation_mode` | `assisted` | Automated tests, manual review |
| `recursion_enabled` | true | Enable security monitoring |

---

### Profile 3: High-Security Environment

**Use Case**: Healthcare (HIPAA), finance (PCI DSS), highly regulated industries

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `owasp_compliance_level` | `strict` | Maximum security testing |
| `pen_test_frequency` | 30 | Monthly pen tests |
| `compliance_standards` | `["SOC2", "ISO27001", "HIPAA", "PCI_DSS"]` | Multiple compliance frameworks |
| `cvss_critical_threshold` | 7.0 | Lower threshold (more strict) |
| `max_critical_vulnerabilities` | 0 | Zero tolerance |
| `max_high_vulnerabilities` | 0 | Zero tolerance |
| `external_certification_required` | true | Mandatory external audit |
| `automation_mode` | `auto` | Full automation with oversight |
| `recursion_enabled` | true | Continuous monitoring |

---

## Configuration API (Proposed)

### Get Configuration

```javascript
// GET /api/ventures/:ventureId/stage-26-config
const config = await getStage26Config(ventureId);
```

### Update Configuration

```javascript
// PUT /api/ventures/:ventureId/stage-26-config
await updateStage26Config(ventureId, {
  owasp_compliance_level: 'strict',
  pen_test_frequency: 90,
  compliance_standards: ['SOC2', 'ISO27001']
});
```

### Apply Profile

```javascript
// POST /api/ventures/:ventureId/stage-26-config/apply-profile
await applyProfile(ventureId, 'production');
```

---

## Configuration Validation

### Validation Rules

| Parameter | Validation | Error Message |
|-----------|------------|---------------|
| `pen_test_frequency` | >= 30 && <= 365 | "Pen test frequency must be 30-365 days" |
| `cvss_critical_threshold` | >= 7.0 && <= 10.0 | "CVSS critical threshold must be 7.0-10.0" |
| `audit_pass_threshold` | >= 0.80 && <= 1.00 | "Audit pass threshold must be 80-100%" |
| `compliance_standards` | Valid enum values | "Invalid compliance standard" |
| `documentation_format` | pdf, html, markdown | "Invalid documentation format" |

---

## Configuration Impact Analysis

**High-Impact Parameters** (changing these requires security review):
- `compliance_standards` (adds/removes audit requirements)
- `external_certification_required` (changes certification process)
- `max_critical_vulnerabilities` (changes security gate)

**Medium-Impact Parameters** (changing these requires team notification):
- `pen_test_frequency` (affects scheduling)
- `automation_mode` (affects workflow)

**Low-Impact Parameters** (can change freely):
- `documentation_format` (cosmetic)
- `archive_storage_location` (administrative)

---

## Gaps Identified

1. **No configuration table**: Must create `stage_26_config` table
2. **No configuration API**: Must implement CRUD endpoints
3. **No profile system**: Must implement configuration profiles
4. **No validation logic**: Must implement validation rules
5. **No impact analysis**: Must implement change tracking

**Action**: Add to 10_gaps-backlog.md

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Security testing | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1175-1180 | "Security Testing" |
| Compliance validation | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1181-1186 | "Compliance Validation" |
| Certification process | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1187-1192 | "Certification Process" |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1162-1165 | "Security score, Compliance rate" |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1194 | "Manual → Assisted → Auto" |
| Threshold gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 38 | "Missing: Threshold values" |
| Recursion score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-26.md | 15 | "Recursion Readiness | 2" |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
