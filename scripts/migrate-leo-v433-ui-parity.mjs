#!/usr/bin/env node
/**
 * LEO Protocol v4.3.3 - UI Parity Governance Migration
 * SD Reference: SD-LEO-v4.3.3-UI-PARITY
 * Date: 2025-11-28
 *
 * This script:
 * 1. Marks v4.3.2 as superseded
 * 2. Creates v4.3.3 protocol
 * 3. Copies existing sections
 * 4. Adds new UI Parity governance sections
 * 5. Logs the change
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NEW_PROTOCOL_ID = 'leo-v4-3-3-ui-parity';
const OLD_PROTOCOL_ID = 'leo-v4-3-1-hardening';

// New sections to add
const newSections = [
  {
    protocol_id: NEW_PROTOCOL_ID,
    section_type: 'ui_parity_requirement',
    title: '🖥️ UI Parity Requirement (MANDATORY)',
    order_index: 7,
    metadata: { added_in: '4.3.3', category: 'governance', phase: 'CORE' },
    content: `## 🖥️ UI Parity Requirement (MANDATORY)

**Every backend data contract field MUST have a corresponding UI representation.**

### Principle
If the backend produces data that humans need to act on, that data MUST be visible in the UI. "Working" is not the same as "visible."

### Requirements

1. **Data Contract Coverage**
   - Every field in \`stageX_data\` wrappers must map to a UI component
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

**BLOCKING**: Features cannot be marked EXEC_COMPLETE without UI parity verification.`
  },
  {
    protocol_id: NEW_PROTOCOL_ID,
    section_type: 'lead_strategic_validation_q7',
    title: '🔍 Strategic Validation Question 7: UI Inspectability',
    order_index: 47,
    metadata: { added_in: '4.3.3', category: 'governance', phase: 'LEAD' },
    content: `## Strategic Validation Question 7: UI Inspectability

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
**7. Can users see and interpret the outputs?** ← NEW`
  },
  {
    protocol_id: NEW_PROTOCOL_ID,
    section_type: 'gate_2_5_human_inspectability',
    title: '🚪 Gate 2.5: Human Inspectability Validation',
    order_index: 156,
    metadata: { added_in: '4.3.3', category: 'governance', phase: 'PLAN', gate_id: '2.5' },
    content: `## 🚪 Gate 2.5: Human Inspectability Validation

**Position**: Between Gate 2 (EXEC → PLAN Handback) and Gate 3 (PLAN → LEAD)

### Purpose
Verify that all backend functionality has corresponding UI representation before marking implementation complete.

### Gate Checklist

#### Data Contract Coverage
- [ ] All \`stageX_data\` fields mapped to UI components
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
\`\`\`json
{
  "ui_coverage": {
    "total_backend_fields": "<count>",
    "fields_with_ui": "<count>",
    "coverage_percentage": "<percent>",
    "missing_components": ["<list>"],
    "gate_2_5_status": "PASS|FAIL"
  }
}
\`\`\``
  },
  {
    protocol_id: NEW_PROTOCOL_ID,
    section_type: 'exec_ui_parity_verification',
    title: '✅ EXEC UI Parity Verification Checklist',
    order_index: 157,
    metadata: { added_in: '4.3.3', category: 'governance', phase: 'EXEC' },
    content: `## ✅ EXEC UI Parity Verification Checklist

**Added in LEO v4.3.3** - MANDATORY before marking implementation complete

### Pre-Completion Checklist

Before marking any backend implementation as complete, verify:

#### 1. Data Contract Mapping
\`\`\`
For each field in output contract:
  ├── [ ] Field has corresponding UI component
  ├── [ ] Component displays actual value (not derived)
  └── [ ] Component handles loading/error states
\`\`\`

#### 2. Stage Output Visibility
\`\`\`
For stage implementations:
  ├── [ ] StageOutputViewer component exists
  ├── [ ] Key findings displayed in list format
  ├── [ ] Recommendations are actionable
  ├── [ ] Score breakdown is visible
  └── [ ] Confidence indicators shown
\`\`\`

#### 3. User Accessibility
\`\`\`
For all features:
  ├── [ ] User can navigate to view outputs
  ├── [ ] No hidden data (no "check logs" or "query DB")
  ├── [ ] Loading states indicate progress
  └── [ ] Error states are informative
\`\`\`

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
\`\`\`
UI Parity Status:
- Backend Fields: X
- Fields with UI: Y
- Coverage: Y/X (Z%)
- Missing: [list]
- Gate 2.5 Status: PASS/FAIL
\`\`\``
  },
  {
    protocol_id: NEW_PROTOCOL_ID,
    section_type: 'stage_7_hard_block',
    title: '🚫 Stage 7 Hard Block: UI Coverage Prerequisite',
    order_index: 12,
    metadata: { added_in: '4.3.3', category: 'governance', phase: 'CORE', blocking: true },
    content: `## 🚫 Stage 7 Hard Block: UI Coverage Prerequisite

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

\`\`\`
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
\`\`\`

### Exception Process

To request an exception to this block:
1. Document business justification
2. Create explicit UI backfill SD with timeline
3. Get LEAD approval with acknowledged technical debt
4. Mark Stage 7 SD with \`ui_debt_acknowledged: true\`

**No exceptions without explicit LEAD approval.**`
  }
];

async function migrate() {
  console.log('=== LEO Protocol v4.3.3 UI Parity Migration ===\n');

  try {
    // Step 1: Check if new protocol already exists
    const { data: existing } = await supabase
      .from('leo_protocols')
      .select('id')
      .eq('id', NEW_PROTOCOL_ID)
      .single();

    if (existing) {
      console.log('⚠️  Protocol v4.3.3 already exists. Skipping creation.\n');
    } else {
      // Step 1: Insert new protocol as DRAFT first (to satisfy FK constraint)
      console.log('Step 1: Inserting v4.3.3 protocol as draft...');
      const { error: insertProtocolErr } = await supabase
        .from('leo_protocols')
        .insert({
          id: NEW_PROTOCOL_ID,
          version: '4.3.3',
          status: 'draft',  // Start as draft to avoid unique constraint
          title: 'LEO Protocol v4.3.3 - UI Parity Governance',
          description: 'LEO Protocol v4.3.3 introduces UI Parity Governance requirements: Mandatory UI representation for backend data contracts, Human Inspectability Gate (Gate 2.5) in validation flow, Strategic Validation Question 7, Stage 7 hard block until ≥80% UI coverage for Stages 1-6.',
          metadata: { governance_focus: 'ui_parity', backward_handling: 'backfill_sd', forward_handling: 'mandatory_gate' }
        });

      if (insertProtocolErr) {
        console.error('Error inserting new protocol:', insertProtocolErr);
        return;
      }
      console.log('✓ v4.3.3 protocol inserted as draft\n');

      // Step 2: Mark old protocol as superseded (now FK is satisfied)
      console.log('Step 2: Marking v4.3.2 as superseded...');
      const { error: updateErr } = await supabase
        .from('leo_protocols')
        .update({
          status: 'superseded',
          superseded_by: NEW_PROTOCOL_ID,
          superseded_at: new Date().toISOString()
        })
        .eq('id', OLD_PROTOCOL_ID);

      if (updateErr) {
        console.error('Error updating old protocol:', updateErr);
        return;
      }
      console.log('✓ v4.3.2 marked as superseded\n');

      // Step 2b: Activate the new protocol (now no unique constraint conflict)
      console.log('Step 2b: Activating v4.3.3 protocol...');
      const { error: activateErr } = await supabase
        .from('leo_protocols')
        .update({ status: 'active' })
        .eq('id', NEW_PROTOCOL_ID);

      if (activateErr) {
        console.error('Error activating new protocol:', activateErr);
        return;
      }
      console.log('✓ v4.3.3 now active\n');

      // Copy existing sections
      console.log('Step 3: Copying existing sections from v4.3.2...');
      const { data: existingSections, error: fetchErr } = await supabase
        .from('leo_protocol_sections')
        .select('*')
        .eq('protocol_id', OLD_PROTOCOL_ID);

      if (fetchErr) {
        console.error('Error fetching sections:', fetchErr);
        return;
      }
      console.log(`  Found ${existingSections.length} sections to copy`);

      let copied = 0;
      for (const section of existingSections) {
        const { id, ...sectionData } = section;
        sectionData.protocol_id = NEW_PROTOCOL_ID;
        const { error: copyErr } = await supabase
          .from('leo_protocol_sections')
          .insert(sectionData);
        if (copyErr) {
          console.error(`  Error copying section ${section.section_type}:`, copyErr.message);
        } else {
          copied++;
        }
      }
      console.log(`✓ ${copied} sections copied\n`);
    }

    // Step 4: Insert new UI Parity sections (check if they exist first)
    console.log('Step 4: Inserting new UI Parity sections...');

    for (const section of newSections) {
      // Check if section already exists
      const { data: existingSection } = await supabase
        .from('leo_protocol_sections')
        .select('id')
        .eq('protocol_id', NEW_PROTOCOL_ID)
        .eq('section_type', section.section_type)
        .single();

      if (existingSection) {
        console.log(`  ⚠️ ${section.section_type} already exists, skipping`);
        continue;
      }

      const { error: insertErr } = await supabase
        .from('leo_protocol_sections')
        .insert(section);

      if (insertErr) {
        console.error(`  Error inserting ${section.section_type}:`, insertErr.message);
      } else {
        console.log(`  ✓ ${section.section_type}`);
      }
    }
    console.log('✓ New sections processed\n');

    // Step 5: Log the change
    console.log('Step 5: Logging protocol change...');
    await supabase.from('leo_protocol_changes').insert({
      protocol_id: NEW_PROTOCOL_ID,
      change_type: 'version_upgrade',
      description: 'LEO Protocol v4.3.3 - UI Parity Governance',
      changed_fields: { new_sections: newSections.map(s => s.section_type) },
      change_reason: 'Address governance gap where ~70% of UI components were missing despite backend being complete.',
      changed_by: 'SD-LEO-v4.3.3-UI-PARITY'
    });
    console.log('✓ Change logged\n');

    // Verification
    console.log('=== Verification ===');
    const { data: activeProtocol } = await supabase
      .from('leo_protocols')
      .select('id, version, status')
      .eq('status', 'active')
      .single();
    console.log('Active Protocol:', activeProtocol);

    const { data: newSectionCount } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('protocol_id', NEW_PROTOCOL_ID);
    console.log(`Total sections in v4.3.3: ${newSectionCount?.length || 0}`);

    const { data: addedSections } = await supabase
      .from('leo_protocol_sections')
      .select('section_type, title')
      .eq('protocol_id', NEW_PROTOCOL_ID)
      .contains('metadata', { added_in: '4.3.3' });
    console.log('\nNew UI Parity sections added:');
    addedSections?.forEach(s => console.log(`  - ${s.section_type}: ${s.title}`));

    console.log('\n=== Migration Complete ===');

  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
