# LEO Protocol Checklist Enforcement Amendment

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, unit, migration

## Version 4.1.3 - Dashboard Checklist Integration

### Critical Change: Mandatory Checklist Updates

**EFFECTIVE IMMEDIATELY**: All agent handoffs MUST update dashboard checklists in the database before proceeding to the next phase.

---

## Enforcement Rules

### 1. PLAN Phase Handoff to EXEC

**Before handoff is valid:**
```bash
# Step 1: Update all completed checklist items
node scripts/update-prd-checklist.js

# Step 2: Verify checklist completion
node scripts/verify-checklist-status.js PLAN

# Step 3: Create handoff record
node scripts/create-handoff-record.js PLAN EXEC
```

**Required Checklist Items (ALL must be checked):**
- ✅ PRD created and saved
- ✅ SD requirements mapped to technical specs
- ✅ Technical architecture defined
- ✅ Implementation approach documented
- ✅ Test scenarios defined
- ✅ Acceptance criteria established
- ✅ Resource requirements estimated
- ✅ Timeline and milestones set
- ✅ Risk assessment completed

**Verification Query:**
```sql
SELECT 
  plan_checklist,
  EVERY((item->>'checked')::boolean = true) as all_complete
FROM product_requirements_v2
WHERE id = 'PRD-[ID]';
```

### 2. EXEC Phase Handoff to PLAN (Verification)

**Before handoff is valid:**
```bash
# Step 1: Update completed implementation items
node scripts/update-exec-checklist.js

# Step 2: Verify checklist completion
node scripts/verify-checklist-status.js EXEC

# Step 3: Create handoff record
node scripts/create-handoff-record.js EXEC PLAN
```

**Required Checklist Items (ALL must be checked):**
- ✅ Development environment setup
- ✅ Core functionality implemented
- ✅ Unit tests written
- ✅ Integration tests completed
- ✅ Code review completed
- ✅ Documentation updated

### 3. PLAN Verification Handoff to LEAD

**Before handoff is valid:**
```bash
# Step 1: Update validation checklist
node scripts/update-validation-checklist.js

# Step 2: Verify all phases complete
node scripts/verify-checklist-status.js ALL

# Step 3: Create final handoff
node scripts/create-handoff-record.js PLAN LEAD
```

**Required Checklist Items (ALL must be checked):**
- ✅ All acceptance criteria met
- ✅ Performance requirements validated
- ✅ Security review completed
- ✅ User acceptance testing passed
- ✅ Deployment readiness confirmed

---

## Dashboard Integration

### Real-time Progress Tracking

The LEO Protocol Dashboard (`http://localhost:3000/dashboard`) now shows:

1. **Checklist Progress Bars**
   - PLAN Phase: Green when 100%
   - EXEC Phase: Green when 100%
   - VALIDATION Phase: Green when 100%

2. **Handoff Readiness Indicators**
   - 🔴 Red: Checklist incomplete, handoff blocked
   - 🟡 Yellow: Checklist partially complete
   - 🟢 Green: Ready for handoff

3. **Automatic Rejection**
   - Dashboard prevents handoff if checklist incomplete
   - Shows specific missing items
   - Requires completion before proceeding

---

## Implementation Scripts

### 1. Update Checklist Script Template
```javascript
// scripts/update-[phase]-checklist.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function updateChecklist() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  // Get current PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', 'PRD-[ID]')
    .single();
  
  // Update appropriate checklist
  const updatedChecklist = prd.[phase]_checklist.map(item => ({
    ...item,
    checked: true // Mark as complete
  }));
  
  // Save to database
  await supabase
    .from('product_requirements_v2')
    .update({
      [phase]_checklist: updatedChecklist,
      progress: calculateProgress(),
      updated_at: new Date().toISOString()
    })
    .eq('id', 'PRD-[ID]');
}
```

### 2. Verification Script
```javascript
// scripts/verify-checklist-status.js
async function verifyChecklist(phase) {
  // Check if all items in phase are complete
  const incomplete = checklist.filter(item => !item.checked);
  
  if (incomplete.length > 0) {
    console.error('❌ Handoff BLOCKED - Incomplete items:');
    incomplete.forEach(item => console.log(`  - ${item.text}`));
    process.exit(1);
  }
  
  console.log('✅ Checklist complete - Handoff authorized');
}
```

### 3. Handoff Record Creation
```javascript
// scripts/create-handoff-record.js
async function createHandoff(from, to) {
  const handoff = {
    id: `HANDOFF-${Date.now()}`,
    from_agent: from,
    to_agent: to,
    sd_id: 'SD-[ID]',
    prd_id: 'PRD-[ID]',
    timestamp: new Date().toISOString(),
    checklist_status: getChecklistStatus(),
    deliverables: getDeliverables(),
    status: 'ready'
  };
  
  // Store in leo_handoffs table
  await supabase
    .from('leo_handoffs')
    .insert(handoff);
}
```

---

## Compliance Monitoring

### Dashboard Alerts
- **Red Banner**: "Handoff Blocked - Complete Checklist First"
- **Yellow Banner**: "Checklist Partially Complete - X items remaining"
- **Green Banner**: "Ready for Handoff - All items complete"

### Audit Trail
Every checklist update is logged:
```sql
INSERT INTO leo_audit_log (agent, action, document_id, metadata)
VALUES ('PLAN', 'checklist_update', 'PRD-001', '{"items_completed": 9}');
```

### Smart Refresh Integration
The Smart Refresh button automatically:
1. Queries database for latest checklist status
2. Updates dashboard display
3. Shows completion percentage
4. Enables/disables handoff buttons

---

## Benefits

1. **Transparency**: Real-time progress visibility
2. **Accountability**: Clear ownership of checklist items
3. **Quality**: Ensures all steps completed before handoff
4. **Automation**: Dashboard enforces rules automatically
5. **Traceability**: Complete audit trail of all updates

---

## Migration for Existing Projects

For projects already in progress:
```bash
# Audit current status
node scripts/audit-checklist-status.js

# Backfill completed items
node scripts/backfill-checklists.js

# Verify compliance
node scripts/verify-leo-compliance.js
```

---

*Amendment Date: 2025-09-01*
*Author: PLAN Agent*
*Status: ACTIVE*
*Enforcement: MANDATORY*