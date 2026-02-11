# Governance Exceptions Directory

**Purpose**: This directory stores Chairman-approved exceptions to governance policies, particularly CrewAI compliance exceptions for stages.

**Authority**: Chairman (sole approver)
**Policy Reference**: [CrewAI Compliance Policy](../../workflow/crewai_compliance_policy.md)

---

## Directory Structure

```
exceptions/
├── README.md (this file)
├── stage-XX-crewai-exception.md (CrewAI compliance exceptions per stage)
├── stage-XX-timeline-exception.md (Timeline/deadline exceptions)
└── [other exception types as needed]
```

---

## Exception Types

### 1. CrewAI Compliance Exceptions
**Naming**: `stage-XX-crewai-exception.md` (where XX = stage number, zero-padded)
**Purpose**: Document approved deviations from mandatory CrewAI implementation requirements
**Template**: See [CrewAI Compliance Policy](../../workflow/crewai_compliance_policy.md) Section 5

**Example Filenames**:
- `stage-04-crewai-exception.md` (Stage 4 exception)
- `stage-38-crewai-exception.md` (Stage 38 exception)

### 2. Timeline Exceptions
**Naming**: `stage-XX-timeline-exception.md`
**Purpose**: Document approved deadline extensions or schedule changes
**Status**: Template TBD (create when first needed)

### 3. Other Exception Types
As new exception types emerge, templates will be added to this directory.

---

## Exception Lifecycle

### 1. Request
- Reviewer identifies non-compliance during stage review
- Reviewer creates exception request document using template
- Reviewer submits to Chairman for approval

### 2. Review
- Chairman reviews rationale, impact analysis, alternatives considered
- Chairman may request additional information or justification
- Chairman makes decision: GRANT or DENY

### 3. Active Exception
- If GRANTED: Exception file updated with Chairman signature and conditions
- Exception tracked in SD metadata:
  ```json
  {
    "crewai_compliance_status": "exception",
    "crewai_exception_id": "EX-STAGE-XX-CREWAI",
    "crewai_exception_file": "/docs/governance/exceptions/stage-XX-crewai-exception.md",
    "crewai_exception_sunset": "YYYY-MM-DD"
  }
  ```
- Sunset date set for re-evaluation

### 4. Monitoring
- System tracks approaching sunset dates (manual process currently)
- Chairman reviews exceptions quarterly
- Exceptions approaching expiration flagged for action

### 5. Resolution
- **Remediated**: Exception no longer needed, CrewAI components implemented → Status: REMEDIATED
- **Extended**: Sunset date extended with updated rationale → Status: ACTIVE
- **Expired**: Sunset date passed, no action taken → Status: EXPIRED (requires immediate attention)
- **Permanent Deviation**: Dossier updated to reflect new reality (rare) → Status: ARCHIVED

---

## Exception Tracking Queries

### Find All Active Exceptions
```sql
SELECT sd.id, sd.title,
       sd.metadata->>'source_stage' as stage,
       sd.metadata->>'crewai_compliance_status' as status,
       sd.metadata->>'crewai_exception_id' as exception_id,
       (sd.metadata->>'crewai_exception_sunset')::date as expires
FROM strategic_directives_v2 sd
WHERE sd.metadata->>'crewai_compliance_status' = 'exception'
  AND sd.metadata->>'crewai_exception_status' = 'ACTIVE'
ORDER BY expires ASC;
```

### Find Expiring Exceptions (Next 30 Days)
```sql
SELECT sd.id, sd.title,
       sd.metadata->>'source_stage' as stage,
       (sd.metadata->>'crewai_exception_sunset')::date as expires,
       (sd.metadata->>'crewai_exception_sunset')::date - CURRENT_DATE as days_remaining
FROM strategic_directives_v2 sd
WHERE sd.metadata->>'crewai_compliance_status' = 'exception'
  AND sd.metadata->>'crewai_exception_status' = 'ACTIVE'
  AND (sd.metadata->>'crewai_exception_sunset')::date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY expires ASC;
```

### Find Expired Exceptions (Require Action)
```sql
SELECT sd.id, sd.title,
       sd.metadata->>'source_stage' as stage,
       (sd.metadata->>'crewai_exception_sunset')::date as expired_on,
       CURRENT_DATE - (sd.metadata->>'crewai_exception_sunset')::date as days_overdue
FROM strategic_directives_v2 sd
WHERE sd.metadata->>'crewai_compliance_status' = 'exception'
  AND sd.metadata->>'crewai_exception_status' = 'ACTIVE'
  AND (sd.metadata->>'crewai_exception_sunset')::date < CURRENT_DATE
ORDER BY days_overdue DESC;
```

---

## Exception Statistics

**Current Active Exceptions**: 0 (as of 2025-11-07)
**Total Exceptions Granted**: 0
**Exceptions Remediated**: 0
**Exceptions Expired**: 0

**Last Updated**: 2025-11-07

*(Update these stats quarterly or after exception activity)*

---

## Guidelines for Exception Requests

### Strong Justifications (Likely to be Granted)
- **Technical Blocker**: CrewAI library bug prevents implementation, workaround planned
- **Regulatory Constraint**: Legal requirement prohibits full automation
- **Architectural Dependency**: Awaiting upstream stage completion or infrastructure upgrade
- **Temporary**: Clear timeline for remediation with committed resources

### Weak Justifications (Likely to be Denied)
- **Time Pressure**: "We need to ship fast" → CrewAI is mandatory, not optional
- **Complexity**: "It's too hard to implement" → SD should be created to address complexity
- **Resource Constraint**: "No one available to do it" → Schedule/priority issue, not exception
- **Preference**: "We prefer manual process" → Contradicts automation strategy

### Exception Request Quality
- **Specific**: Cite exact dossier prescriptions and implementation gaps
- **Evidence-Based**: Show attempts to implement, document blockers
- **Alternative Analysis**: Demonstrate due diligence in exploring options
- **Time-Bound**: Propose realistic sunset date, not indefinite deferral

---

## Related Documentation

- [CrewAI Compliance Policy](../../workflow/crewai_compliance_policy.md) - Full policy and exception process
- [Stage Review Process](../../workflow/review_process.md) - Step 2.5 (CrewAI Compliance Check)
- [Stage Review Template](../../workflow/review_templates/stage_review_template.md) - Section 2.6 (Exception documentation)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-07 | Initial exceptions directory creation with README | Claude Code |

---

**Directory Owner**: Chairman
**Directory Status**: Active
**Last Exception Activity**: None (awaiting first exception request)

---

<!-- Generated by Claude Code | Governance Exceptions Directory | 2025-11-07 -->
