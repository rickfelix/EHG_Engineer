import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addBacklogReviewRequirement() {
  console.log('📋 Adding mandatory backlog review to LEO Protocol...\n');

  // Update LEAD agent responsibilities
  const leadUpdate = {
    responsibilities: `Strategic planning, business objectives, final approval. **SIMPLICITY FIRST (PRE-APPROVAL ONLY)**: During initial SD review, challenge complexity and favor simple solutions. Ask "What's the simplest solution?" and "Why not just configure existing tools?" Apply 80/20 rule BEFORE approval. Once SD is approved, LEAD commits to full scope and verifies completion only - scope reduction post-approval is prohibited without explicit human authorization and creating new SDs for deferred work.
- **🛡️ HUMAN APPROVAL REQUIRED**: LEAD MUST request human approval before changing SD status/priority. Use standardized over-engineering rubric for evaluations. NEVER override user selections without explicit permission.
- **📋 Over-Engineering Evaluation**: Use \`scripts/lead-over-engineering-rubric.js\` for standardized assessments. Present findings to human for approval before any changes.
- **🔍 MANDATORY BACKLOG REVIEW**: When evaluating any Strategic Directive, LEAD MUST query \`sd_backlog_map\` table to review all linked backlog items. This is step 3 of the 5-step SD evaluation checklist (see below). Backlog items contain critical scope details not present in SD metadata.
- **🚫 PROHIBITED**: Autonomous SD status changes, user selection overrides, subjective over-engineering calls without rubric, **skipping backlog review before scope decisions**. **🤖 MANDATORY SUB-AGENT AUTOMATION**: Before approving any SD as complete, LEAD MUST run automated sub-agent validation. This automatically executes all required sub-agents (Continuous Improvement Coach for retrospectives, DevOps Platform Architect for CI/CD verification) and validates completion requirements. Failure to run this script will result in missed retrospectives and incomplete protocol execution. **✅ APPROVAL CHECKLIST**: LEAD may only approve an SD after: (1) Running sub-agent validation successfully, (2) Verifying output shows "✅ SD READY FOR COMPLETION", (3) Reviewing any warnings, (4) Obtaining human approval for status change.

**5-STEP SD EVALUATION CHECKLIST** (Mandatory for LEAD):
1. Query \`strategic_directives_v2\` for SD metadata (title, status, priority, progress, scope)
2. Query \`product_requirements_v2\` for existing PRD (if any)
3. **Query \`sd_backlog_map\` for linked backlog items** ← CRITICAL: Contains detailed requirements
4. Search codebase for existing infrastructure (services, components, routes)
5. Identify gaps between backlog requirements and existing code

**Backlog Review Requirements**:
- Review \`backlog_title\`, \`item_description\`, \`extras.Description_1\` for each item
- Assess priority alignment: \`priority\` field (High/Medium/Low) vs \`description_raw\` (Must Have/Nice to Have)
- Check completion status: \`completion_status\` (NOT_STARTED/IN_PROGRESS/COMPLETED)
- Evaluate scope match between backlog items and existing codebase
- Flag scope mismatches for LEAD decision (implement backlog vs use existing code)`,
    capabilities: [
      'Define strategic objectives',
      'Set priorities (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49)',
      'Approve strategic directives',
      'Apply simplicity gate assessment',
      'Challenge over-engineering',
      'Query sd_backlog_map for comprehensive scope understanding',
      'Evaluate backlog item alignment with business objectives',
      'Identify scope mismatches between backlog and existing infrastructure',
      'Make scope decisions (implement backlog vs reuse existing code)',
      'Create LEAD→PLAN handoffs with all 7 mandatory elements',
      'Final approval and retrospective triggering'
    ]
  };

  const { data: _leadData, error: leadError } = await supabase
    .from('leo_agents')
    .update(leadUpdate)
    .eq('agent_code', 'LEAD')
    .select()
    .single();

  if (leadError) {
    console.error('❌ Error updating LEAD agent:', leadError);
    return;
  }

  console.log('✅ LEAD agent updated with backlog review requirements');

  // Update PLAN agent responsibilities
  const planUpdate = {
    responsibilities: `Technical design, PRD creation with comprehensive test plans, pre-automation validation, acceptance testing. **PRAGMATIC ENGINEERING**: Use boring technology that works reliably. Prefer configuration over code, simple solutions over complex architectures. Filter sub-agent recommendations through simplicity lens. **If PRD seems over-engineered during creation, escalate to LEAD for scope reduction BEFORE proceeding to EXEC.**
- **🔍 MANDATORY BACKLOG REVIEW**: When creating PRD, PLAN MUST query \`sd_backlog_map\` table to ensure all backlog items are addressed in the PRD. This is step 3 of the 5-step SD evaluation checklist. Backlog items define the actual requirements to be implemented.
- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents
- **🔍 CI/CD VERIFICATION**: After EXEC completion, wait 2-3 minutes for GitHub CI/CD pipelines to complete, then trigger DevOps Platform Architect to verify no pipeline failures exist before final approval.

**5-STEP SD EVALUATION CHECKLIST** (Mandatory for PLAN):
1. Query \`strategic_directives_v2\` for SD metadata
2. Query \`product_requirements_v2\` for existing PRD (if creating new PRD)
3. **Query \`sd_backlog_map\` for linked backlog items** ← CRITICAL: These define what to build
4. Search codebase for existing infrastructure
5. Map backlog items to PRD sections (objectives, features, acceptance criteria)

**Backlog-to-PRD Mapping**:
- Each backlog item should map to at least one PRD objective
- Backlog \`extras.Description_1\` provides detailed feature descriptions
- Priority from backlog (\`priority\` + \`description_raw\`) informs PRD must-haves
- Existing infrastructure may satisfy some backlog items (document in PRD)
- Gap analysis: What backlog items require new implementation vs configuration?`,
    capabilities: [
      'Analyze Strategic Directive',
      'Create Product Requirements Document (PRD)',
      'Query sd_backlog_map for detailed requirements',
      'Map backlog items to PRD objectives and features',
      'Conduct gap analysis (backlog requirements vs existing infrastructure)',
      'Define technical specifications',
      'Design architecture approach',
      'Plan implementation phases',
      'Create comprehensive and detailed test plans with manual validation steps',
      'Define authentication flow test scenarios before automation',
      'Specify pre-Playwright validation requirements',
      'Document authentication handling strategies',
      'Establish manual testing prerequisites before automation',
      'Define test data and fixture requirements',
      'Create environment-specific test configurations',
      'Verify all backlog items are addressed in PRD before LEAD handoff'
    ],
    constraints: [
      'Must stay within Strategic Directive objectives',
      'Cannot change business objectives',
      'Cannot implement code',
      'MUST query sd_backlog_map before creating PRD',
      'MUST address all backlog items in PRD (or document deferral rationale)',
      'MUST create comprehensive manual test plans BEFORE automation',
      'MUST document authentication flow with detailed steps',
      'MUST specify pre-automation validation checklist',
      'CANNOT skip manual validation phase',
      'CANNOT approve Playwright automation without manual test success',
      'CANNOT skip backlog review step'
    ]
  };

  const { data: _planData, error: planError } = await supabase
    .from('leo_agents')
    .update(planUpdate)
    .eq('agent_code', 'PLAN')
    .select()
    .single();

  if (planError) {
    console.error('❌ Error updating PLAN agent:', planError);
    return;
  }

  console.log('✅ PLAN agent updated with backlog review requirements');

  // Create a new protocol section for the 5-step checklist
  const checklistSection = {
    protocol_id: 'leo-v4-2-0-story-gates',
    section_type: 'sd_evaluation',
    title: 'Strategic Directive Evaluation Checklist',
    order_index: 100, // High order to appear near end
    content: `## 5-Step SD Evaluation Checklist

**MANDATORY**: All agents (LEAD, PLAN) MUST complete these steps when evaluating a Strategic Directive:

### Step 1: Query SD Metadata
\`\`\`javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-XXX')
  .single();
\`\`\`

**Extract**: title, status, priority, progress, current_phase, scope, category, target_application

### Step 2: Check for Existing PRD
\`\`\`javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-XXX');
\`\`\`

**If exists**: Review PRD objectives, features, acceptance criteria
**If missing**: PRD creation required (PLAN responsibility)

### Step 3: Query Backlog Items ✅ CRITICAL
\`\`\`javascript
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-XXX')
  .order('priority', { ascending: false })
  .order('sequence_no', { ascending: true });
\`\`\`

**Review for EACH item**:
- \`backlog_title\`: Short description
- \`item_description\`: Additional context
- \`extras.Description_1\`: **Detailed feature description** (MOST IMPORTANT)
- \`priority\`: High/Medium/Low
- \`description_raw\`: Must Have/Nice to Have/Future
- \`completion_status\`: NOT_STARTED/IN_PROGRESS/COMPLETED
- \`phase\`: Discovery/Planning/Development/Launch
- \`stage_number\`: Sequence in overall backlog
- \`extras.Page Category_1\`: Feature category
- \`extras.Category\`: Business category

**Why Critical**: Backlog items contain the ACTUAL requirements. SD metadata may be generic; backlog items have specifics.

### Step 4: Search Codebase for Existing Infrastructure
\`\`\`bash
# Search for related services
find . -name "*service*.ts" -o -name "*Service.ts" | grep -i [feature-name]

# Search for UI components
find . -name "*.tsx" -o -name "*.jsx" | grep -i [feature-name]

# Check routing
grep -r "/[route-name]" src/App.tsx src/routes/
\`\`\`

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

---

## Common Mistakes to Avoid

❌ **Skipping backlog review**: Leads to scope misunderstandings
❌ **Assuming SD description = full scope**: Backlog has the details
❌ **Not checking completion_status**: May duplicate completed work
❌ **Ignoring priority conflicts**: \`priority: High\` but \`description_raw: Nice to Have\`
❌ **Missing extras.Description_1**: This field has the most detailed requirements

## Example: SD-041 Analysis

**Step 1**: SD-041 = "Knowledge Base: Consolidated", status: active, priority: high, 30% complete
**Step 2**: No PRD exists
**Step 3**: 2 backlog items found:
  - Item #62: "Define Cloning Process for Venture Ideation" (Low priority, Must Have)
  - Item #290: "AI-Powered Knowledge Base & Help Docs" (High priority, Nice to Have)
**Step 4**: Found 698-line knowledgeManagementService.ts + 1,300 lines UI (mock data)
**Step 5**: Gap = Backlog requests competitive intelligence + AI docs; existing code does pattern recognition

**Result**: Scope mismatch identified → LEAD decision required before proceeding`,
    metadata: {
      is_required: true,
      validation_rules: [
        'All 5 steps must be completed before creating PRD',
        'Backlog items must be reviewed individually',
        'Gap analysis must identify satisfied/partial/missing/mismatch items',
        'Scope recommendation must be provided to LEAD for decision'
      ]
    }
  };

  const { data: _sectionData, error: sectionError } = await supabase
    .from('leo_protocol_sections')
    .insert(checklistSection)
    .select()
    .single();

  if (sectionError) {
    console.error('❌ Error creating protocol section:', sectionError);
    return;
  }

  console.log('✅ Created new protocol section: SD Evaluation Checklist');

  console.log('\n📊 Summary:');
  console.log('- ✅ LEAD agent: Added 5-step checklist requirement');
  console.log('- ✅ PLAN agent: Added backlog-to-PRD mapping requirement');
  console.log('- ✅ Protocol section: Created detailed checklist documentation');
  console.log('\n🎯 Impact:');
  console.log('- LEAD must query sd_backlog_map before scope decisions');
  console.log('- PLAN must map backlog items to PRD objectives');
  console.log('- Prevents scope mismatches (like SD-041 situation)');
  console.log('- Ensures backlog requirements drive implementation');
  console.log('\n✅ LEO Protocol updated successfully!');
  console.log('\n📝 Next Step: Run `node scripts/generate-claude-md-from-db.js` to update CLAUDE.md');
}

addBacklogReviewRequirement().catch(console.error);
