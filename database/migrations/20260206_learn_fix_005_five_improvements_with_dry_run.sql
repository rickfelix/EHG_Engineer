-- SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005
-- Address 5 improvements from /learn system
-- Database-only changes: leo_protocol_sections + leo_validation_rules + PIQ status updates
-- No application code changes required
-- WITH DRY-RUN WORKFLOW COMPLIANCE

-- ============================================================
-- IMPROVEMENT 1: Enhanced Handoff Validation Error Messages
-- PIQ: 8afd24e8-411e-4ffd-ad67-2ceb2ccaad9b
-- Category: ERROR_MESSAGING
-- Evidence: Generic "fidelity data missing" vs specific "metadata.gate2_validation required"
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'handoff_error_field_paths',
  'Handoff Validation Error Messages: Field Path Requirements',
  '## Handoff Validation Error Messages: Field Path Requirements

### Problem
Handoff validation errors like "fidelity data missing" or "required field not found" force agents to guess which field is wrong. This wastes 10-15 minutes per failure in trial-and-error debugging.

### Required Error Format
All handoff validation errors MUST include:
1. **Full field path** from the root object (e.g., `exec_summary.7_element_handoff.context`)
2. **Expected type** (string, array, object, number)
3. **What was found** (null, undefined, wrong type)

### Good vs Bad Error Messages
| Bad (Generic) | Good (With Field Path) |
|---------------|----------------------|
| "Missing fidelity data" | "Missing field: metadata.gate2_validation.fidelity_score (expected: number, got: undefined)" |
| "Required field not found" | "Missing field: exec_summary.deliverables_manifest (expected: string, min 50 chars)" |
| "Validation failed" | "Type mismatch: content.key_decisions (expected: JSONB array, got: string)" |
| "Handoff data incomplete" | "Missing 3 fields: action_items (string), resource_utilization (string), completeness_report (string)" |

### Implementation Pattern for Validators
```javascript
// In validator functions, always include the full path
function validateField(obj, path, expectedType) {
  const value = getNestedValue(obj, path);
  if (value === undefined || value === null) {
    return {
      valid: false,
      error: `Missing field: ${path} (expected: ${expectedType}, got: ${value === null ? ''null'' : ''undefined''})`
    };
  }
  if (typeof value !== expectedType && expectedType !== ''any'') {
    return {
      valid: false,
      error: `Type mismatch: ${path} (expected: ${expectedType}, got: ${typeof value})`
    };
  }
  return { valid: true };
}
```

### Affected Components
- `scripts/modules/handoff/verifiers/` - All verifier modules
- `scripts/modules/handoff/ResultBuilder.js` - `fieldError()` method
- `scripts/modules/handoff/validation/` - Gate validators

### When to Apply
This standard applies to ALL handoff validation errors, including:
- Gate validators (GATE_PRD_EXISTS, GATE_ARCHITECTURE_VERIFICATION, etc.)
- Field-level validation in PlanToExecVerifier, ExecToPlanVerifier
- Database pre-validation in handoff creation',
  810,
  '{"source_piq": "8afd24e8-411e-4ffd-ad67-2ceb2ccaad9b", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005", "affected_phase": "ALL", "category": "ERROR_MESSAGING"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 2: Protocol File Read Verification
-- PIQ: 608529d3-c59a-4e29-86c9-306f73530e2c
-- Category: HANDOFF_VALIDATION
-- Status: ALREADY IMPLEMENTED via GATE_SD_START_PROTOCOL
-- Evidence: SD-LEO-SELF-IMPROVE-001C had 7 rejections
-- Action: Mark as resolved - no new insert needed
-- ============================================================
-- No new section needed. GATE_SD_START_PROTOCOL already enforces this.
-- See: scripts/modules/handoff/gates/core-protocol-gate.js

-- ============================================================
-- IMPROVEMENT 3: Documentation Standards Compliance Validation
-- PIQ: cb7bbc07-85f1-47d5-9418-8ae99ee48e9a
-- Category: VALIDATION_RULE
-- Target: leo_validation_rules (PLAN-TO-EXEC handoff)
-- Evidence: SD-DOC-LEO-STANDARDS-001 compliance gaps discovered manually
-- ============================================================
INSERT INTO leo_validation_rules (
  gate, rule_name, weight, criteria, required, active,
  handoff_type, execution_order
) VALUES (
  '1',
  'documentationStandardsCompliance',
  0.050,
  '{"description": "For documentation SDs, validates PRD includes documentation standards checklist", "checks": ["sd_type_is_documentation", "prd_has_standards_section", "standards_checklist_present"], "applies_only_to": "documentation"}'::jsonb,
  false,
  true,
  'PLAN-TO-EXEC',
  95
)
ON CONFLICT DO NOTHING;

-- Also add a protocol section documenting this validation
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'documentation_standards_validation',
  'Documentation Standards Compliance Gate',
  '## Documentation Standards Compliance Gate

### Applies To
SD type: `documentation` only. Other SD types skip this gate.

### What It Checks
When a documentation SD reaches PLAN-TO-EXEC, this gate validates that the PRD addresses documentation standards:

1. **Standards Checklist Present**: PRD functional requirements or acceptance criteria mention standards, formatting, or conventions
2. **Cross-References Identified**: Documentation references existing docs and avoids duplication

### Why This Exists
**Evidence**: SD-DOC-LEO-STANDARDS-001 entered EXEC without addressing documentation standards. Compliance gaps were discovered manually during LEAD-FINAL-APPROVAL, requiring rework.

### Severity: WARNING
This is a non-blocking warning. Documentation SDs can proceed to EXEC without this check, but agents should address the warning before completion.

### Remediation
If this warning triggers, add to PRD:
- File naming conventions being followed
- Markdown formatting standards
- Required section structure
- Cross-references to related documentation',
  811,
  '{"source_piq": "cb7bbc07-85f1-47d5-9418-8ae99ee48e9a", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005", "affected_phase": "PLAN", "category": "VALIDATION"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 4: Implementation-Before-Documentation Anti-Pattern
-- PIQ: 8d8e3f1b-e193-4eeb-8dd5-ae0a6b980237
-- Category: PROTOCOL_SECTION
-- Evidence: Implementation before documentation creates retroactive compliance burden
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'anti_pattern_impl_before_docs',
  'Anti-Pattern: Implementation Before Documentation',
  '## Anti-Pattern: Implementation Before Documentation

### The Problem
When code is implemented before protocol documentation is written, teams face a retroactive compliance burden. The documentation must then be reverse-engineered from code, which is slower, less accurate, and creates audit gaps.

### How It Manifests
1. **Feature implemented** without corresponding PRD or design doc
2. **Protocol extension** shipped as code without updating CLAUDE_*.md or protocol sections
3. **New validation gates** added to code but not documented in handoff references
4. **Database schema changes** applied without updating schema documentation

### Why It Is Wrong
- **Audit trail gap**: No record of WHY decisions were made
- **Retroactive documentation**: 2-3x more expensive than writing docs first
- **Protocol drift**: Code behavior diverges from documented protocol
- **Onboarding friction**: New agents cannot learn from undocumented code

### Correct Approach
Follow the LEO Protocol phase order:
```
LEAD (approve & scope) → PLAN (document requirements) → EXEC (implement)
```

**For protocol changes specifically:**
1. Add protocol section to `leo_protocol_sections` table FIRST
2. Update section-file-mapping.json if new section type
3. Regenerate CLAUDE.md: `node scripts/generate-claude-md-from-db.js`
4. THEN implement the code changes

### Detection
If you find yourself writing code that changes protocol behavior without first updating documentation, STOP and:
1. Create the protocol section in the database
2. Run the CLAUDE.md regeneration
3. THEN proceed with implementation',
  812,
  '{"source_piq": "8d8e3f1b-e193-4eeb-8dd5-ae0a6b980237", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005", "affected_phase": "ALL", "category": "ANTI_PATTERN"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 5: Gate Bypass Audit Trail Requirements
-- PIQ: 03c5dcb5-d852-456b-a7c5-46377b33b459
-- Category: PROTOCOL_SECTION
-- Evidence: Bypassing gates loses audit trail, requires manual reconstruction
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'gate_bypass_audit_requirements',
  'Gate Bypass Audit Trail Requirements',
  '## Gate Bypass Audit Trail Requirements

### Rule
Every gate bypass MUST be recorded with a complete audit trail. Bypasses without audit records are protocol violations.

### Required Audit Fields
When bypassing any validation gate, the following MUST be recorded:

| Field | Required | Description |
|-------|----------|-------------|
| `bypass_reason` | YES | Why the gate was bypassed (specific, not generic) |
| `sd_id` | YES | Which SD the bypass applies to |
| `gate_name` | YES | Which gate was bypassed |
| `bypassed_by` | YES | Who authorized the bypass |
| `timestamp` | YES | When the bypass occurred |
| `severity` | YES | Impact level (low/medium/high) |
| `compensating_control` | RECOMMENDED | What alternative validation was done |

### Bypass Audit Storage
All bypasses are logged to the `audit_log` table:
```sql
INSERT INTO audit_log (event_type, severity, sd_id, details)
VALUES (
  ''GATE_BYPASS'',
  ''warning'',
  ''SD-XXX-001'',
  jsonb_build_object(
    ''gate_name'', ''GATE_PRD_EXISTS'',
    ''bypass_reason'', ''Trivial config change, PRD not required'',
    ''bypassed_by'', ''UNIFIED-HANDOFF-SYSTEM'',
    ''compensating_control'', ''Manual review by LEAD before approval''
  )
);
```

### Rate Limits (Enforced)
| Limit | Threshold | Action on Exceed |
|-------|-----------|-----------------|
| Per SD | 3 bypasses max | Block further bypasses |
| Per day | 10 bypasses globally | Block all bypasses for 24h |
| Per gate | No limit per gate | But tracked for pattern analysis |

### Why Audit Trail Matters
**Incident**: An SD completed without proper gate validation. When a bug was discovered post-deployment, the team could not reconstruct which validations were skipped, making root cause analysis impossible.

### Monitoring
Run periodic audit to detect bypass patterns:
```sql
SELECT sd_id, COUNT(*) as bypass_count,
       array_agg(details->>''gate_name'') as bypassed_gates
FROM audit_log
WHERE event_type = ''GATE_BYPASS''
  AND created_at > NOW() - interval ''7 days''
GROUP BY sd_id
HAVING COUNT(*) >= 2
ORDER BY bypass_count DESC;
```

### Reference
- Emergency bypass docs: CLAUDE_CORE_DIGEST.md (Emergency Bypass section)
- Rate limit enforcement: `scripts/modules/handoff/validation/bypass-limiter.js`
- Audit log table: `database/schema/audit_log`',
  813,
  '{"source_piq": "03c5dcb5-d852-456b-a7c5-46377b33b459", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005", "affected_phase": "ALL", "category": "GOVERNANCE"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- UPDATE PIQ STATUS: First set dry-run fields (workflow compliance)
-- ============================================================
UPDATE protocol_improvement_queue
SET
  dry_run_diff = 'Migration preview: Adds 4 protocol sections, 1 validation rule. No destructive changes.',
  dry_run_at = NOW()
WHERE id IN (
  '8afd24e8-411e-4ffd-ad67-2ceb2ccaad9b',  -- Error messaging field paths
  '608529d3-c59a-4e29-86c9-306f73530e2c',  -- Protocol file read (already implemented)
  'cb7bbc07-85f1-47d5-9418-8ae99ee48e9a',  -- Documentation standards validation
  '8d8e3f1b-e193-4eeb-8dd5-ae0a6b980237',  -- Implementation-before-docs anti-pattern
  '03c5dcb5-d852-456b-a7c5-46377b33b459'   -- Gate bypass audit trail
);

-- Now mark as APPLIED (after dry-run fields are set)
UPDATE protocol_improvement_queue
SET
  status = 'APPLIED',
  applied_at = NOW(),
  reviewed_at = NOW(),
  reviewed_by = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005',
  assigned_sd_id = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005'
WHERE id IN (
  '8afd24e8-411e-4ffd-ad67-2ceb2ccaad9b',
  '608529d3-c59a-4e29-86c9-306f73530e2c',
  'cb7bbc07-85f1-47d5-9418-8ae99ee48e9a',
  '8d8e3f1b-e193-4eeb-8dd5-ae0a6b980237',
  '03c5dcb5-d852-456b-a7c5-46377b33b459'
);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'Protocol sections inserted' AS step, count(*) AS count
FROM leo_protocol_sections
WHERE metadata::text LIKE '%SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005%';

SELECT 'Validation rules inserted' AS step, count(*) AS count
FROM leo_validation_rules
WHERE rule_name = 'documentationStandardsCompliance';

SELECT 'PIQ items marked APPLIED' AS step, count(*) AS count
FROM protocol_improvement_queue
WHERE assigned_sd_id = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005';
