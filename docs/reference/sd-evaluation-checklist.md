# 6-Step SD Evaluation Checklist


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, e2e, unit

## 5-Step SD Evaluation Checklist

**MANDATORY**: All agents (LEAD, PLAN) MUST complete these steps when evaluating a Strategic Directive:

### Step 1: Query SD Metadata
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-XXX')
  .single();
```

**Extract**: title, status, priority, progress, current_phase, scope, category, target_application

### Step 2: Check for Existing PRD
```javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-XXX');
```

**If exists**: Review PRD objectives, features, acceptance criteria
**If missing**: PRD creation required (PLAN responsibility)

### Step 3: Query Backlog Items ✅ CRITICAL
```javascript
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-XXX')
  .order('priority', { ascending: false })
  .order('sequence_no', { ascending: true });
```

**Review for EACH item**:
- `backlog_title`: Short description
- `item_description`: Additional context
- `extras.Description_1`: **Detailed feature description** (MOST IMPORTANT)
- `priority`: High/Medium/Low
- `description_raw`: Must Have/Nice to Have/Future
- `completion_status`: NOT_STARTED/IN_PROGRESS/COMPLETED
- `phase`: Discovery/Planning/Development/Launch
- `stage_number`: Sequence in overall backlog
- `extras.Page Category_1`: Feature category
- `extras.Category`: Business category

**Why Critical**: Backlog items contain the ACTUAL requirements. SD metadata may be generic; backlog items have specifics.

### Step 4: Search Codebase for Existing Infrastructure
```bash
# Search for related services
find . -name "*service*.ts" -o -name "*Service.ts" | grep -i [feature-name]

# Search for UI components
find . -name "*.tsx" -o -name "*.jsx" | grep -i [feature-name]

# Check routing
grep -r "/[route-name]" src/App.tsx src/routes/
```

**Document**:
- Existing files (paths, line counts, capabilities)
- Mock data vs real data
- Database tables expected vs existing
- UI components complete vs partial

### Step 5: Gap Analysis
**Compare**: Backlog requirements vs Existing infrastructure

**Identify**:
1. ✅ **Satisfied**: Backlog items fully met by existing code
2. ⚠️ **Partial**: Existing code needs integration/configuration
3. ❌ **Missing**: Backlog items require new implementation
4. 🔄 **Mismatch**: Existing code does different things than backlog requests

**Output**: Scope recommendation
- **Option A**: Implement all backlog items (high effort)
- **Option B**: Connect/configure existing infrastructure (low effort)
- **Option C**: Hybrid (phase existing code, defer new features)

### Step 6: Execute QA Smoke Tests ✅ NEW

**Evidence**: SD-EXPORT-001 - "5-step checklist comprehensive but missing testing"

**CRITICAL**: Before approving ANY SD as complete, verify tests have been executed.

```javascript
// For LEAD or PLAN agents evaluating SD completion
const { data: testResults } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', sd_id)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (!testResults || testResults.verdict !== 'PASS') {
  throw new Error('Cannot approve SD without passing test evidence');
}
```

**Checklist**:
- [ ] Unit tests executed and passed
- [ ] E2E tests executed and passed
- [ ] Test evidence documented (screenshots, reports)
- [ ] Coverage meets minimum threshold (50% unit, 100% user story coverage for E2E)
- [ ] QA Engineering Director sub-agent executed
- [ ] Test results stored in database

**Why Added**:
- **SD-EXPORT-001**: "Done-done definition ignored" - tests existed but weren't run before approval
- **Impact**: Prevents 30-minute gap between claiming complete and discovering test failures

---

## Common Mistakes to Avoid

❌ **Skipping backlog review**: Leads to scope misunderstandings
❌ **Assuming SD description = full scope**: Backlog has the details
❌ **Not checking completion_status**: May duplicate completed work
❌ **Ignoring priority conflicts**: `priority: High` but `description_raw: Nice to Have`
❌ **Missing extras.Description_1**: This field has the most detailed requirements
❌ **Approving SD without test evidence**: Step 6 MANDATORY (added based on retrospectives)

## Example: SD-041 Analysis

**Step 1**: SD-041 = "Knowledge Base: Consolidated", status: active, priority: high, 30% complete
**Step 2**: No PRD exists
**Step 3**: 2 backlog items found:
  - Item #62: "Define Cloning Process for Venture Ideation" (Low priority, Must Have)
  - Item #290: "AI-Powered Knowledge Base & Help Docs" (High priority, Nice to Have)
**Step 4**: Found 698-line knowledgeManagementService.ts + 1,300 lines UI (mock data)
**Step 5**: Gap = Backlog requests competitive intelligence + AI docs; existing code does pattern recognition
**Step 6**: No test evidence found → BLOCKS approval

**Result**: Scope mismatch identified + Testing gap → LEAD decision required before proceeding
