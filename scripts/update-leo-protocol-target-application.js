#!/usr/bin/env node
/**
 * Update LEO Protocol Target Application Sections
 *
 * Updates database sections to ensure consistent target application guidance
 * for the unified frontend architecture.
 *
 * Run: node scripts/update-leo-protocol-target-application.js
 * Then: node scripts/generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Updated EXEC Implementation Requirements (Section 210)
const UPDATED_EXEC_REQUIREMENTS = `### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

**Common Ambiguities to Watch For**:
- Vague feature descriptions ("improve UX", "make it better")
- Missing edge case handling ("what if user inputs invalid data?")
- Unclear success criteria ("should be fast", "should look good")
- Conflicting requirements between PRD sections
- Undefined behavior for error states

**Example Ambiguity Resolution**:
\`\`\`
❌ BAD: Guess at implementation based on similar feature
✅ GOOD:
  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules
  - Tier 2: Query user_stories table → Found implementation_context with validation spec
  - Resolution: "Email validation will use regex pattern from US-002 context"
\`\`\`

1. **APPLICATION CHECK** ⚠️ CRITICAL
   - **ALL UI changes** (user AND admin) go to \`../ehg/\`
   - **User features**: \`../ehg/src/components/\` and \`/src/pages/\`
   - **Admin features**: \`../ehg/src/components/admin/\` and \`/src/pages/admin/\`
   - **Stage components**: \`../ehg/src/components/stages/admin/\`
   - **Backend API only**: \`./\` (routes, scripts, no UI)
   - Verify: \`cd ../ehg && pwd\`
   - Check GitHub: \`git remote -v\` should show \`rickfelix/ehg.git\` for frontend

2. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

3. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

4. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD (8080 for frontend, 3000 for backend API)
   - Document: "Application: [/path/to/app] on port [XXXX]"

5. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
\`\`\`markdown
## EXEC Pre-Implementation Checklist
- [ ] **Ambiguity Check**: All requirements clear and unambiguous
- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]
- [ ] **Application verified**: [EHG unified frontend confirmed]
- [ ] **Feature type**: [User /src/ | Admin /src/components/admin/ | Backend API EHG_Engineer]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [8080 frontend | 3000 backend API]
- [ ] **Screenshot taken**: [timestamp]
- [ ] **Target location confirmed**: [where changes go]
\`\`\`

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation
- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous
- ❌ **CRITICAL**: Putting admin UI code in EHG_Engineer (all UI goes to EHG)`;

// Updated SD Execution Protocol (Section 246)
const UPDATED_SD_EXECUTION_PROTOCOL = `# STRATEGIC DIRECTIVE EXECUTION PROTOCOL

**When executing a Strategic Directive, follow this structured 5-phase workflow.**

## Target Application Selection (SD-ARCH-EHG-007)

**CRITICAL FIRST STEP**: EHG is the unified frontend for ALL UI work.

### Unified Architecture Overview

| Component | Path | Port | Purpose |
|-----------|------|------|---------|
| **EHG** (Unified Frontend) | \`../ehg/\` | 8080 | ALL UI (user + admin features) |
| **EHG_Engineer** (Backend) | \`./\` | 3000 | API routes, scripts, no UI |
| **Agent Platform** | \`../ehg/agent-platform/\` | 8000 | AI research backend |

> **NOTE (SD-ARCH-EHG-006)**: Both applications use the **CONSOLIDATED** database (dedlbzhpgkmetvhbkyzq).

### Where to Implement (by feature type)

| Feature Type | Target Directory | Repository |
|--------------|------------------|------------|
| **User Features** | \`../ehg/src/\` | rickfelix/ehg.git |
| **Admin Features** | \`../ehg/src/components/admin/\` | rickfelix/ehg.git |
| **Admin Pages** | \`../ehg/src/pages/admin/\` | rickfelix/ehg.git |
| **Stage Components** | \`../ehg/src/components/stages/admin/\` | rickfelix/ehg.git |
| **Backend API** | \`./\` | rickfelix/EHG_Engineer.git |

**Key Rule**: ALL UI changes go to EHG. Only backend API/script changes go to EHG_Engineer.

## Priority Tiers

- **CRITICAL** (90+): Business-critical, immediate action required
- **HIGH** (70-89): Important features, near-term priority
- **MEDIUM** (50-69): Standard enhancements, planned work
- **LOW** (30-49): Nice-to-have improvements

## Workflow Overview

Execute in order: **LEAD PRE-APPROVAL → PLAN PRD → EXEC IMPLEMENTATION → PLAN VERIFICATION → LEAD FINAL APPROVAL**

Each phase has:
- Assigned agent (LEAD/PLAN/EXEC)
- Percentage allocation
- Required sub-agents
- Exit criteria
- Mandatory handoff

See detailed phase sections below.`;

// Updated Multi-Application Testing Architecture (Section 189)
const UPDATED_TESTING_ARCHITECTURE = `**Multi-App Testing**: Two test suites for unified frontend + backend.

**CRITICAL**: All UI tests (user + admin) run against EHG unified frontend.

| Application | Test Framework | What to Test |
|-------------|----------------|--------------|
| **EHG** (Unified Frontend) | Vitest (unit) + Playwright (E2E) | User features, admin features, stage components |
| **EHG_Engineer** (Backend) | Vitest + Jest | API routes, scripts, database operations |

**Test Location by Feature**:
- User features: \`../ehg/tests/\`
- Admin features: \`../ehg/tests/\` (same as user, different routes)
- Backend API: \`./tests/\`

**Full Guide**: See \`docs/reference/multi-app-testing.md\``;

async function main() {
  console.log('🔄 Updating LEO Protocol target application sections...\\n');

  try {
    // Update Section 210 - EXEC Implementation Requirements
    console.log('📝 Updating EXEC Implementation Requirements (ID: 210)...');
    const { error: error210 } = await supabase
      .from('leo_protocol_sections')
      .update({ content: UPDATED_EXEC_REQUIREMENTS })
      .eq('id', 210);

    if (error210) {
      console.error('❌ Failed to update section 210:', error210);
    } else {
      console.log('✅ Updated EXEC Implementation Requirements');
    }

    // Update Section 246 - SD Execution Protocol
    console.log('📝 Updating SD Execution Protocol (ID: 246)...');
    const { error: error246 } = await supabase
      .from('leo_protocol_sections')
      .update({ content: UPDATED_SD_EXECUTION_PROTOCOL })
      .eq('id', 246);

    if (error246) {
      console.error('❌ Failed to update section 246:', error246);
    } else {
      console.log('✅ Updated SD Execution Protocol');
    }

    // Update Section 189 - Multi-Application Testing Architecture
    console.log('📝 Updating Multi-Application Testing (ID: 189)...');
    const { error: error189 } = await supabase
      .from('leo_protocol_sections')
      .update({ content: UPDATED_TESTING_ARCHITECTURE })
      .eq('id', 189);

    if (error189) {
      console.error('❌ Failed to update section 189:', error189);
    } else {
      console.log('✅ Updated Multi-Application Testing Architecture');
    }

    console.log('\\n✅ Database updates complete!');
    console.log('\\n📋 Next steps:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Review generated CLAUDE_EXEC.md and CLAUDE_CORE.md');
    console.log('   3. Commit the updated files\\n');

  } catch (_error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
}

main();
