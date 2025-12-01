-- LEO Protocol v4.3.3 - UI Parity Governance Migration
-- SD Reference: SD-LEO-v4.3.3-UI-PARITY
-- Date: 2025-11-28
-- Purpose: Add UI Parity requirements to LEO Protocol governance

-- ============================================================================
-- STEP 1: Create new protocol version 4.3.3 (keeping 4.3.2 as fallback)
-- ============================================================================

-- First, mark 4.3.2 as superseded
UPDATE leo_protocols
SET status = 'superseded',
    superseded_by = 'leo-v4-3-3-ui-parity',
    superseded_at = NOW()
WHERE id = 'leo-v4-3-1-hardening';

-- Insert the new protocol version
INSERT INTO leo_protocols (id, version, status, title, description, created_at, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    '4.3.3',
    'active',
    'LEO Protocol v4.3.3 - UI Parity Governance',
    'LEO Protocol v4.3.3 introduces UI Parity Governance requirements:\n- Mandatory UI representation for backend data contracts\n- Human Inspectability Gate (Gate 2.5) in validation flow\n- Strategic Validation Question 7: "Can users see and interpret outputs?"\n- Stage 7 hard block until ≥80% UI coverage for Stages 1-6\n- SD/PRD templates updated with UI/UX requirements sections',
    NOW(),
    '{"governance_focus": "ui_parity", "backward_handling": "backfill_sd", "forward_handling": "mandatory_gate"}'
);

-- ============================================================================
-- STEP 2: Copy all existing sections from 4.3.2 to 4.3.3
-- ============================================================================

INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
SELECT
    'leo-v4-3-3-ui-parity',
    section_type,
    title,
    content,
    order_index,
    metadata
FROM leo_protocol_sections
WHERE protocol_id = 'leo-v4-3-1-hardening';

-- ============================================================================
-- STEP 3: Add new UI Parity sections
-- ============================================================================

-- 3a. Add UI Parity section to CLAUDE_CORE.md (execution_philosophy area)
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    'ui_parity_requirement',
    '🖥️ UI Parity Requirement (MANDATORY)',
    '## 🖥️ UI Parity Requirement (MANDATORY)

**Every backend data contract field MUST have a corresponding UI representation.**

### Principle
If the backend produces data that humans need to act on, that data MUST be visible in the UI. "Working" is not the same as "visible."

### Requirements

1. **Data Contract Coverage**
   - Every field in `stageX_data` wrappers must map to a UI component
   - Score displays must show actual numeric values, not just pass/fail
   - Confidence levels must be visible with appropriate visual indicators

2. **Human Inspectability**
   - Stage outputs must be viewable in human-readable format
   - Key findings, red flags, and recommendations must be displayed
   - Source citations must be accessible

3. **No Hidden Logic**
   - Decision factors (GO/NO_GO/REVISE) must show contributing scores
   - Threshold comparisons must be visible
   - Stage weights must be displayed in aggregation views

### Verification Checklist
Before marking any stage/feature as complete:
- [ ] All output fields have UI representation
- [ ] Scores are displayed numerically
- [ ] Key findings are visible to users
- [ ] Recommendations are actionable in the UI

**BLOCKING**: Features cannot be marked EXEC_COMPLETE without UI parity verification.',
    7,  -- After execution_philosophy (order_index 6)
    '{"added_in": "4.3.3", "category": "governance", "phase": "CORE"}'
);

-- 3b. Add Strategic Validation Question 7 to CLAUDE_LEAD.md
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    'lead_strategic_validation_q7',
    '🔍 Strategic Validation Question 7: UI Inspectability',
    '## Strategic Validation Question 7: UI Inspectability

**Added in LEO v4.3.3** - Part of LEAD Pre-Approval Gate

### The Question
> "Can users see and interpret the outputs this feature produces?"

### Evaluation Criteria

| Rating | Criteria |
|--------|----------|
| ✅ YES | All backend outputs have corresponding UI components, users can view/act on data |
| ⚠️ PARTIAL | Some outputs visible, others require DB queries or logs to access |
| ❌ NO | Backend works but outputs are not visible in UI |

### LEAD Agent Actions

**If YES**: Proceed with approval
**If PARTIAL**:
- Require UI component list in PRD
- Add "UI Coverage" acceptance criteria
- May approve with explicit UI backfill task

**If NO**:
- Block approval until UI representation plan is documented
- Either expand SD scope to include UI OR
- Create linked child SD for UI implementation

### Integration with 6-Question Gate

This question is MANDATORY for all SDs that produce user-facing data. It should be evaluated alongside:
1. Is this minimal scope?
2. Does it fit the current phase?
3. Are there simpler alternatives?
4. What is the maintenance cost?
5. Does it follow existing patterns?
6. Is it required for the stated goal?
**7. Can users see and interpret the outputs?** ← NEW',
    47,  -- After directive_submission_review (order_index 45)
    '{"added_in": "4.3.3", "category": "governance", "phase": "LEAD"}'
);

-- 3c. Add Gate 2.5 (Human Inspectability Gate) to CLAUDE_PLAN.md
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    'gate_2_5_human_inspectability',
    '🚪 Gate 2.5: Human Inspectability Validation',
    '## 🚪 Gate 2.5: Human Inspectability Validation

**Position**: Between Gate 2 (EXEC → PLAN Handback) and Gate 3 (PLAN → LEAD)

### Purpose
Verify that all backend functionality has corresponding UI representation before marking implementation complete.

### Gate Checklist

#### Data Contract Coverage
- [ ] All `stageX_data` fields mapped to UI components
- [ ] Score values displayed (not just derived states)
- [ ] Confidence indicators visible
- [ ] Timestamps/metadata accessible

#### Component Verification
- [ ] Stage output viewer exists for this stage
- [ ] Key findings panel displays all findings
- [ ] Recommendations are actionable
- [ ] Red flags are highlighted

#### User Journey Validation
- [ ] User can navigate to view outputs
- [ ] Data is presented in human-readable format
- [ ] No "hidden" data requiring DB queries
- [ ] Export/sharing capability exists (if required)

### Scoring

| Score | Criteria |
|-------|----------|
| 100% | All backend fields have UI representation |
| 80% | Core fields visible, minor fields may require expansion |
| 60% | Major fields visible, some data requires logs/DB |
| <60% | BLOCKING - Significant UI gaps |

### Enforcement

**Minimum Score**: 80% to pass Gate 2.5
**Blocking Condition**: Score <80% blocks progression to Gate 3

### Handoff Template Addition

When creating EXEC → PLAN handoff, include:
```json
{
  "ui_coverage": {
    "total_backend_fields": <count>,
    "fields_with_ui": <count>,
    "coverage_percentage": <percent>,
    "missing_components": [<list>],
    "gate_2_5_status": "PASS|FAIL"
  }
}
```',
    156,  -- After design_database_validation_gates (order_index 155)
    '{"added_in": "4.3.3", "category": "governance", "phase": "PLAN", "gate_id": "2.5"}'
);

-- 3d. Add UI Parity Verification to CLAUDE_EXEC.md
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    'exec_ui_parity_verification',
    '✅ EXEC UI Parity Verification Checklist',
    '## ✅ EXEC UI Parity Verification Checklist

**Added in LEO v4.3.3** - MANDATORY before marking implementation complete

### Pre-Completion Checklist

Before marking any backend implementation as complete, verify:

#### 1. Data Contract Mapping
```
For each field in output contract:
  ├── [ ] Field has corresponding UI component
  ├── [ ] Component displays actual value (not derived)
  └── [ ] Component handles loading/error states
```

#### 2. Stage Output Visibility
```
For stage implementations:
  ├── [ ] StageOutputViewer component exists
  ├── [ ] Key findings displayed in list format
  ├── [ ] Recommendations are actionable
  ├── [ ] Score breakdown is visible
  └── [ ] Confidence indicators shown
```

#### 3. User Accessibility
```
For all features:
  ├── [ ] User can navigate to view outputs
  ├── [ ] No hidden data (no "check logs" or "query DB")
  ├── [ ] Loading states indicate progress
  └── [ ] Error states are informative
```

### Integration with Dual Test Requirement

The existing dual test requirement (Unit + E2E) is extended:

| Test Type | Original | With UI Parity |
|-----------|----------|----------------|
| Unit | Backend logic | Backend logic |
| E2E | Feature works | Feature works AND is visible |

**E2E tests MUST now verify:**
1. Feature functionality (existing)
2. Output visibility in UI (NEW)
3. Data displayed matches backend (NEW)

### Handoff Modification

Update implementation handoff to include:
```
UI Parity Status:
- Backend Fields: X
- Fields with UI: Y
- Coverage: Y/X (Z%)
- Missing: [list]
- Gate 2.5 Status: PASS/FAIL
```',
    156,  -- Same area as dual test requirement
    '{"added_in": "4.3.3", "category": "governance", "phase": "EXEC"}'
);

-- 3e. Add Stage 7 Hard Block section
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-3-ui-parity',
    'stage_7_hard_block',
    '🚫 Stage 7 Hard Block: UI Coverage Prerequisite',
    '## 🚫 Stage 7 Hard Block: UI Coverage Prerequisite

**Effective**: LEO v4.3.3
**Scope**: IDEATION Pipeline (Stages 1-40)

### Block Condition

Stage 7 (Strategy Formulation) CANNOT begin until:
- Stages 1-6 achieve ≥80% UI coverage
- UI Parity backfill SD is completed or in-progress

### Rationale

Strategy Formulation (Stage 7) relies on human review of all prior stage outputs. If those outputs are not visible in the UI, stakeholders cannot:
1. Verify stage findings before strategic decisions
2. Review confidence levels across stages
3. Understand the full GO/NO_GO/REVISE rationale
4. Export or share findings with external stakeholders

### Verification Before Stage 7

```
STAGE 7 PRE-REQUISITES:
├── [ ] Stage 1-6 backend complete (existing)
├── [ ] Stage 1-6 tests passing (existing)
├── [ ] Stage 1-6 UI coverage ≥80% (NEW)
│   ├── Stage 1: __% coverage
│   ├── Stage 2: __% coverage
│   ├── Stage 3: __% coverage
│   ├── Stage 4: __% coverage
│   ├── Stage 5: __% coverage
│   └── Stage 6: __% coverage
└── [ ] UI Parity backfill SD status: ________
```

### Exception Process

To request an exception to this block:
1. Document business justification
2. Create explicit UI backfill SD with timeline
3. Get LEAD approval with acknowledged technical debt
4. Mark Stage 7 SD with `ui_debt_acknowledged: true`

**No exceptions without explicit LEAD approval.**',
    12,  -- Early in the document, after exec_implementation_requirements
    '{"added_in": "4.3.3", "category": "governance", "phase": "CORE", "blocking": true}'
);

-- ============================================================================
-- STEP 4: Log the protocol change
-- ============================================================================

INSERT INTO leo_protocol_changes (protocol_id, change_type, description, changed_fields, change_reason, changed_by)
VALUES (
    'leo-v4-3-3-ui-parity',
    'version_upgrade',
    'LEO Protocol v4.3.3 - UI Parity Governance',
    '{"new_sections": ["ui_parity_requirement", "lead_strategic_validation_q7", "gate_2_5_human_inspectability", "exec_ui_parity_verification", "stage_7_hard_block"]}',
    'Address governance gap where ~70% of UI components were missing despite backend being complete. Adds mandatory UI representation requirements, Gate 2.5 for human inspectability, and Stage 7 hard block until UI coverage achieved.',
    'SD-LEO-v4.3.3-UI-PARITY'
);

-- ============================================================================
-- STEP 5: Verify the migration
-- ============================================================================

-- Count sections in new protocol
SELECT
    'New Protocol Sections' as metric,
    COUNT(*) as count
FROM leo_protocol_sections
WHERE protocol_id = 'leo-v4-3-3-ui-parity';

-- List new sections added
SELECT
    section_type,
    title,
    order_index
FROM leo_protocol_sections
WHERE protocol_id = 'leo-v4-3-3-ui-parity'
AND metadata->>'added_in' = '4.3.3'
ORDER BY order_index;

-- Verify active protocol
SELECT id, version, status, title
FROM leo_protocols
WHERE status = 'active';
