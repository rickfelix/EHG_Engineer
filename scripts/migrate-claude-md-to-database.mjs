#!/usr/bin/env node

/**
 * Migrate Hardcoded CLAUDE.md Sections to Database
 *
 * Extracts all hardcoded narrative content from generate-claude-md-from-db.js
 * and inserts into leo_protocol_sections table for pure database-driven architecture.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PROTOCOL_ID = 'leo-v4-2-0-story-gates';

const sectionsToMigrate = [
  {
    section_type: 'session_prologue',
    title: 'Session Prologue (Short)',
    content: `1. **Follow LEAD→PLAN→EXEC** - Target ≥85% gate pass rate
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **Small PRs** - Target ≤100 lines, max 400 with justification
5. **7-element handoffs** - Required for all phase transitions
6. **Priority-first** - Use \`npm run prio:top3\` to justify work

*For copy-paste version: see \`templates/session-prologue.md\` (generate via \`npm run session:prologue\`)*`,
    order_index: 1
  },
  {
    section_type: 'application_architecture',
    title: '🏗️ Application Architecture - CRITICAL CONTEXT',
    content: `### Two Distinct Applications:
1. **EHG_Engineer** (Management Dashboard) - WHERE YOU ARE NOW
   - **Path**: \`/mnt/c/_EHG/EHG_Engineer/\`
   - **Purpose**: LEO Protocol dashboard for managing Strategic Directives & PRDs
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase)
   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
   - **Port**: 3000-3001
   - **Role**: MANAGEMENT TOOL ONLY - no customer features here!

2. **EHG** (Business Application) - IMPLEMENTATION TARGET
   - **Path**: \`/mnt/c/_EHG/ehg/\`
   - **Purpose**: The actual customer-facing business application
   - **Database**: liapbndqlqxdcgpwntbv (Supabase)
   - **GitHub**: https://github.com/rickfelix/ehg.git
   - **Built with**: Vite + React + Shadcn + TypeScript
   - **Role**: WHERE ALL FEATURES GET IMPLEMENTED

### ⚠️ CRITICAL: During EXEC Phase Implementation
1. **Read PRD** from EHG_Engineer database
2. **Navigate** to \`/mnt/c/_EHG/ehg/\` for implementation
3. **Make code changes** in EHG application (NOT in EHG_Engineer!)
4. **Push changes** to EHG's GitHub repo: \`rickfelix/ehg.git\`
5. **Track progress** in EHG_Engineer dashboard

### 🔄 Workflow Relationship
\`\`\`
EHG_Engineer (Management)          EHG App (Implementation)
├── Strategic Directives     →     Features implemented here
├── PRDs                     →     Code changes made here
├── Progress Tracking        ←     Results verified from here
└── Dashboard Views          ←     No changes here!
\`\`\``,
    order_index: 2
  },
  {
    section_type: 'exec_implementation_requirements',
    title: '🚨 EXEC Agent Implementation Requirements',
    content: `### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **APPLICATION CHECK** ⚠️ CRITICAL FIRST STEP
   - Confirm target app: \`/mnt/c/_EHG/ehg/\` (NOT EHG_Engineer!)
   - Verify: \`cd /mnt/c/_EHG/ehg && pwd\` should show \`/mnt/c/_EHG/ehg\`
   - Check GitHub: \`git remote -v\` should show \`rickfelix/ehg.git\`
   - If you're in EHG_Engineer, you're in the WRONG place for implementation!

1. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

2. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

3. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD
   - Document: "Application: [/path/to/app] on port [XXXX]"

4. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
\`\`\`markdown
## EXEC Pre-Implementation Checklist
- [ ] URL verified: [exact URL from PRD]
- [ ] Page accessible: [YES/NO]
- [ ] Component identified: [path/to/component]
- [ ] Application path: [/full/path/to/app]
- [ ] Port confirmed: [port number]
- [ ] Screenshot taken: [timestamp]
- [ ] Target location confirmed: [where changes go]
\`\`\`

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation`,
    order_index: 10
  },
  {
    section_type: 'git_commit_guidelines',
    title: '🔄 Git Commit Guidelines',
    content: `### Commit Format (MANDATORY)
All commits MUST follow Conventional Commits format with SD-ID:
\`\`\`
<type>(<SD-ID>): <subject>

<body>

<footer>
\`\`\`

### Required Elements
- **Type**: feat|fix|docs|style|refactor|test|chore|perf|ci|revert
- **Scope**: MUST include Strategic Directive ID (e.g., SD-2025-001)
- **Subject**: Imperative mood, no period, max 72 chars
- **Body**: Explain "why" not "what", wrap at 72 chars
- **Footer**: Breaking changes, co-authorship, AI attribution

### Commit Timing (During EXEC Phase)
1. **After completing each checklist item**
2. **Before context switches** (end of session, meetings, breaks)
3. **At logical breakpoints** (feature complete, tests passing)
4. **Frequency**: Min 1/session, Max 10/checklist item

### Branch Strategy by Application
- **EHG_Engineer changes** (dashboard/tooling): Use \`eng/\` prefix
  - Example: \`eng/dashboard-update\`, \`eng/leo-protocol-v4\`
- **EHG app features** (customer features): Use standard prefixes
  - Example: \`feature/SD-2025-001-voice-api\`, \`fix/SD-2025-002-auth-bug\`
- **CRITICAL**: Verify you're in the correct directory before branching!
  - \`pwd\` should show \`/mnt/c/_EHG/ehg\` for feature implementation
  - \`pwd\` should show \`/mnt/c/_EHG/EHG_Engineer\` for dashboard changes
- **Main branch**: NO direct commits during EXEC phase
- **Merges**: Only via approved Pull Requests after LEAD approval

### AI Attribution
When AI generates code, include in footer:
\`\`\`bash
git commit -m "feat(SD-2025-001): Implement retry logic

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
\`\`\`

### Quick Reference
- Format: \`<type>(<SD-ID>): <subject>\`
- Size: <100 lines ideal, <200 max
- Files: 1-3 ideal, 10 max per commit
- Validation: Commits without proper format fail CI

**Full Guidelines**: See \`docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md\``,
    order_index: 20
  },
  {
    section_type: 'communication_context',
    title: '📊 Communication & Context',
    content: `### Context Economy Rules

**Core Principles**:
- **Response Budget**: ≤500 tokens default (unless complexity requires more)
- **Summarize > Paste**: Reference paths/links instead of full content
- **Fetch-on-Demand**: Name files first, retrieve only needed parts
- **Running Summaries**: Keep condensed handoff/PR descriptions

### Best Practices

**Efficient Context Usage**:
- **Quote selectively**: Show only relevant lines with context
- **Use file:line references**: \`src/component.js:42-58\` instead of full file
- **Batch related reads**: Minimize round-trips when exploring
- **Archive verbosity**: Move details to handoffs/database, not conversation

### Examples

| ❌ Inefficient | ✅ Efficient |
|----------------|--------------|
| Paste entire 500-line file | Quote lines 42-58 with \`...\` markers |
| Read file multiple times | Batch read relevant sections once |
| Repeat full error in response | Summarize error + reference line |
| Include all test output | Show failed tests + counts only |

### 🔄 MANDATORY: Server Restart Protocol
After ANY code changes:
1. **Kill the dev server**: \`kill [PID]\` or Ctrl+C
2. **Restart the server**: \`npm run dev\` or appropriate command
3. **Wait for ready message**: Confirm server is fully started
4. **Hard refresh browser**: Ctrl+Shift+R / Cmd+Shift+R
5. **Verify changes are live**: Test the new functionality

**WHY**: Dev servers may cache components, especially new files. Hot reload is NOT always reliable.`,
    order_index: 30
  },
  {
    section_type: 'lead_operations',
    title: '🎯 LEAD Agent Operations',
    content: `### Finding Active Strategic Directives

As the LEAD agent, you have immediate access to strategic directives:

**Quick Command**:
\`\`\`bash
node scripts/query-active-sds.js
\`\`\`

**Direct Database Query**:
\`\`\`javascript
const { data: activeSDs } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .in('status', ['draft', 'in_progress', 'active', 'pending_approval'])
  .order('priority', { ascending: false })
  .order('created_at', { ascending: false });
\`\`\`

### LEAD Decision Matrix

| SD Status | LEAD Action | Command/Script |
|-----------|-------------|----------------|
| **Draft** | Review & approve | \`node scripts/lead-approve-sdip.js\` |
| **Pending Approval** | Final review | \`node scripts/conduct-lead-approval-assessment.js\` |
| **Active** | Create LEAD→PLAN handoff | \`node scripts/create-exec-to-plan-handoff.js\` |
| **In Progress** | Monitor execution | \`node scripts/debug-dashboard-progress.js\` |

### Key LEAD Responsibilities

1. **Strategic Direction**
   - Define business objectives
   - Set priorities (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49)
   - Approve strategic directives

2. **Handoff Creation**
   - LEAD→PLAN: Strategic objectives to technical planning
   - Must include all 7 mandatory elements
   - Use \`node scripts/unified-handoff-system.js\`

3. **Progress Monitoring**
   - Review SD progress: \`node scripts/test-progress-calculation.js\`
   - Check phase completion: \`node scripts/complete-lead-phase.js\`
   - Final approval: \`node scripts/start-lead-approval.js\`

### Strategic Directive Lifecycle

\`\`\`mermaid
graph LR
    Draft --> LEAD_Review
    LEAD_Review --> Active
    Active --> LEAD_PLAN_Handoff
    LEAD_PLAN_Handoff --> In_Progress
    In_Progress --> Pending_Approval
    Pending_Approval --> LEAD_Final_Approval
    LEAD_Final_Approval --> Completed
\`\`\``,
    order_index: 40
  },
  {
    section_type: 'directive_submission_review',
    title: '📋 Directive Submission Review Process',
    content: `**CRITICAL**: Directive submissions contain essential context not present in SDs. Always review linked submissions before making strategic decisions.

#### Step-by-Step Review Workflow

1. **Query Pending Submissions**:
\`\`\`javascript
// Find submissions needing LEAD review
const { data: pendingSubmissions } = await supabase
  .from('directive_submissions')
  .select('*')
  .in('status', ['pending_review', 'completed'])
  .is('gate_status->resulting_sd_id', null)
  .order('created_at', { ascending: false });
\`\`\`

2. **Get Full Submission Context**:
\`\`\`javascript
// Retrieve submission with linked SD (if exists)
const { data: submission } = await supabase
  .from('directive_submissions')
  .select(\`
    *,
    linked_sd:strategic_directives_v2!gate_status->resulting_sd_id(*)
  \`)
  .eq('id', submission_id)
  .single();
\`\`\`

3. **Review Checklist**:
- [ ] **Original Input**: Review chairman_input for true intent
- [ ] **Intent Clarity**: Verify intent_summary captures essence
- [ ] **Visual Context**: Check screenshot_url if provided
- [ ] **Strategic Alignment**: Assess fit with organizational goals
- [ ] **Priority Assessment**: Determine business impact (Critical/High/Medium/Low)
- [ ] **Scope Validation**: Ensure scope is achievable and clear
- [ ] **Duplicate Check**: Verify no existing SDs cover this need
- [ ] **Gate Progression**: Confirm all validation gates passed

4. **Decision Matrix**:

| Submission State | Gate Status | LEAD Action | Command |
|-----------------|-------------|-------------|---------|
| Completed + No SD | Gates passed | Create SD | \`node scripts/create-sd-from-submission.js\` |
| Completed + SD exists | Linked to SD | Verify & handoff | \`node scripts/unified-handoff-system.js\` |
| Pending | Gates incomplete | Monitor | \`node scripts/check-submission-status.js\` |
| Failed validation | Gates failed | Archive/remediate | \`node scripts/archive-submission.js\` |

5. **Quick Review Command**:
\`\`\`bash
node scripts/lead-review-submissions.js
\`\`\`

#### Critical Context Elements

When reviewing submissions, pay special attention to:
- **Chairman Input**: The unfiltered original request
- **Screenshot URL**: Visual context for UI/UX requests
- **SDIP ID**: For tracking through the processing pipeline
- **Processing History**: Number of steps and iterations
- **Metadata**: Additional context from processing

#### Linking Submissions to Strategic Directives

When creating an SD from a submission:
1. Include submission_id in SD metadata
2. Reference key context in SD description
3. Preserve chairman's original intent
4. Map submission scope to SD objectives`,
    order_index: 45
  },
  {
    section_type: 'unified_handoff_system',
    title: '🔄 Unified Handoff System (Database-First)',
    content: `### ⚠️ CRITICAL: Use the Unified Handoff System Script

**PRIMARY METHOD**: \`node scripts/unified-handoff-system.js execute <TYPE> <SD-ID>\`

**DO NOT** manually create handoff scripts or query handoff tables directly. The unified system handles:
- Template loading from \`leo_handoff_templates\` table
- Validation using 7-element structure
- Storage in \`sd_phase_handoffs\` table
- Automatic SD phase progression
- Dashboard synchronization

### Handoff Types

| Type | From | To | Purpose |
|------|------|----|----|
| \`LEAD-to-PLAN\` | LEAD | PLAN | Strategic objectives → Technical planning |
| \`PLAN-to-EXEC\` | PLAN | EXEC | PRD approval → Implementation |
| \`EXEC-to-PLAN\` | EXEC | PLAN | Implementation complete → Verification |
| \`PLAN-to-LEAD\` | PLAN | LEAD | Verification complete → Final approval |

### Database Tables

- **Templates**: \`leo_handoff_templates\` - Handoff structure definitions
- **Storage**: \`sd_phase_handoffs\` - All handoff instances (NO markdown files!)
- **Tracking**: Links to \`strategic_directives_v2\` via \`sd_id\`

### 7 Mandatory Elements (Missing ANY = AUTOMATIC REJECTION)

1. **Executive Summary** - High-level overview of what's being handed off
2. **Completeness Report** - Status of all deliverables and requirements
3. **Deliverables Manifest** - List of all artifacts with locations
4. **Key Decisions & Rationale** - Critical decisions made with justification
5. **Known Issues & Risks** - Problems identified and mitigation strategies
6. **Resource Utilization** - Time/budget spent and remaining estimates
7. **Action Items for Receiver** - Specific next steps with priorities

### Usage Examples

\`\`\`bash
# LEAD approves SD, hands off to PLAN
node scripts/unified-handoff-system.js execute LEAD-to-PLAN SD-RECONNECT-006

# PLAN completes PRD, hands off to EXEC
node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-RECONNECT-006

# EXEC completes implementation, hands back to PLAN for verification
node scripts/unified-handoff-system.js execute EXEC-to-PLAN SD-RECONNECT-006

# PLAN verifies, hands to LEAD for final approval
node scripts/unified-handoff-system.js execute PLAN-to-LEAD SD-RECONNECT-006
\`\`\`

### ❌ What NOT to Do

- ❌ Don't create handoff markdown files
- ❌ Don't manually insert into \`sd_phase_handoffs\`
- ❌ Don't skip handoff validation
- ❌ Don't use old handoff scripts (they're deprecated)
- ❌ Don't store handoffs in SD metadata (use table instead)`,
    order_index: 460
  },
  {
    section_type: 'database_schema_overview',
    title: 'Database Schema Overview',
    content: `### Core Tables
- \`leo_protocols\` - Protocol versions and content
- \`leo_protocol_sections\` - Modular protocol sections
- \`leo_agents\` - Agent definitions and percentages
- \`leo_handoff_templates\` - Standardized handoffs
- \`leo_sub_agents\` - Sub-agent definitions
- \`leo_sub_agent_triggers\` - Activation rules
- \`leo_validation_rules\` - Protocol validation

### Key Queries

**Get Current Protocol**:
\`\`\`sql
SELECT * FROM leo_protocols WHERE status = 'active';
\`\`\`

**Check Sub-Agent Triggers**:
\`\`\`sql
SELECT sa.*, t.*
FROM leo_sub_agents sa
JOIN leo_sub_agent_triggers t ON sa.id = t.sub_agent_id
WHERE t.trigger_phrase ILIKE '%keyword%';
\`\`\`

**Get Handoff Template**:
\`\`\`sql
SELECT * FROM leo_handoff_templates
WHERE from_agent = 'EXEC' AND to_agent = 'PLAN';
\`\`\`

## API Endpoints (Database-Backed)

- \`GET /api/leo/current\` - Current active protocol
- \`GET /api/leo/agents\` - All agents with percentages
- \`GET /api/leo/sub-agents\` - Active sub-agents with triggers
- \`GET /api/leo/handoffs/:from/:to\` - Handoff template
- \`POST /api/leo/validate\` - Validate against rules

## Key Scripts (Database-Aware)

- \`get-latest-leo-protocol-from-db.js\` - Get version from database
- \`generate-claude-md-from-db.js\` - Generate this file
- \`migrate-leo-protocols-to-database.js\` - Migration tool
- \`activate-sub-agents-from-db.js\` - Check database triggers

## Compliance Tools

All tools now query database instead of files:

### 1. Version Check
\`\`\`bash
node scripts/get-latest-leo-protocol-from-db.js
\`\`\`

### 2. Update CLAUDE.md
\`\`\`bash
node scripts/generate-claude-md-from-db.js
\`\`\`

### 3. Validate Handoff
\`\`\`bash
node scripts/leo-checklist-db.js [agent-name]
\`\`\`

## 🔍 PLAN Supervisor Verification

### Overview
PLAN agent now includes supervisor capabilities for final "done done" verification:
- Queries ALL sub-agents for their verification results
- Ensures all requirements are truly met
- Resolves conflicts between sub-agent reports
- Provides confidence scoring and clear pass/fail verdict

### Activation
Trigger PLAN supervisor verification via:
- **Command**: \`/leo-verify [what to check]\`
- **Script**: \`node scripts/plan-supervisor-verification.js --prd PRD-ID\`
- **Automatic**: When testing phase completes

### Verification Process
1. **Read-Only Access**: Queries existing sub-agent results (no re-execution)
2. **Summary-First**: Prevents context explosion with tiered reporting
3. **Conflict Resolution**: Priority-based rules (Security > Database > Testing)
4. **Circuit Breakers**: Graceful handling of sub-agent failures
5. **Maximum 3 Iterations**: Prevents infinite verification loops

### Verdicts
- **PASS**: All requirements met, high confidence (≥85%)
- **FAIL**: Critical issues or unmet requirements
- **CONDITIONAL_PASS**: Minor issues, needs LEAD review
- **ESCALATE**: Cannot reach consensus, needs LEAD intervention

## Dashboard Integration

Dashboard automatically connects to database:
- Real-time protocol updates via Supabase subscriptions
- Version detection from \`leo_protocols\` table
- Sub-agent status from \`leo_sub_agents\` table
- PLAN supervisor verification status
- No file scanning needed

## Important Notes

1. **Database is Source of Truth** - Files are deprecated
2. **Real-time Updates** - Changes reflect immediately
3. **No Version Conflicts** - Single active version enforced
4. **Audit Trail** - All changes tracked in database
5. **WebSocket Updates** - Dashboard stays synchronized
6. **PLAN Supervisor** - Final verification before LEAD approval`,
    order_index: 500
  },
  {
    section_type: 'supabase_operations',
    title: '🗄️ Supabase Database Operations',
    content: `### Connection Details
- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Connection**: Via Supabase client using environment variables

### Environment Variables Required
\`\`\`bash
# For EHG application (liapbndqlqxdcgpwntbv)
EHG_SUPABASE_URL=https://liapbndqlqxdcgpwntbv.supabase.co
EHG_SUPABASE_ANON_KEY=[anon-key]
EHG_POOLER_URL=postgresql://postgres.liapbndqlqxdcgpwntbv:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require

# For EHG_Engineer (dedlbzhpgkmetvhbkyzq)
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=[anon-key]
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_DB_PASSWORD=Fl!M32DaM00n!1
\`\`\``,
    order_index: 600
  },
  {
    section_type: 'development_workflow',
    title: '🔧 CRITICAL DEVELOPMENT WORKFLOW',
    content: `### ⚠️ Server Restart Protocol (MANDATORY)

**After ANY changes to the application, you MUST**:
1. **Kill the server process**
2. **Build the React client** (if UI changes were made)
3. **Restart the server**

\`\`\`bash
# Method 1: Using process management
pkill -f "node server.js"

# Method 2: If running in Claude Code background
# Use KillBash tool with shell_id

# Build React client (REQUIRED for UI/component changes)
cd /mnt/c/_EHG/EHG_Engineer
npm run build:client

# Restart server
PORT=3000 node server.js
\`\`\`

### Why This is Required

**React Build Process**:
- React components are compiled from \`src/client/src/\` to \`src/client/dist/\`
- Server serves static files from \`dist\`, not source files
- CSS changes must be bundled and minified via Vite
- No hot-reloading is configured in this setup

**File Structure**:
\`\`\`
src/client/
├── src/               # Source files (your edits)
│   ├── components/    # React components
│   └── styles/        # CSS files
└── dist/              # Built files (served by server)
    ├── index.html
    └── assets/
\`\`\`

### Development Commands

\`\`\`bash
# Complete development cycle
cd /mnt/c/_EHG/EHG_Engineer
npm run build:client && PORT=3000 node server.js

# Build client only
npm run build:client

# Check if server is running
lsof -i :3000
\`\`\``,
    order_index: 700
  }
];

async function migrate() {
  console.log('🔄 Migrating hardcoded CLAUDE.md sections to database...\n');

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const section of sectionsToMigrate) {
    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('protocol_id', PROTOCOL_ID)
      .eq('section_type', section.section_type)
      .single();

    if (existing) {
      console.log(`⏭️  Skipping ${section.section_type} (already exists)`);
      skipped++;
      continue;
    }

    // Insert new section
    const { error } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: PROTOCOL_ID,
        section_type: section.section_type,
        title: section.title,
        content: section.content,
        order_index: section.order_index,
        metadata: {}
      });

    if (error) {
      console.error(`❌ Error inserting ${section.section_type}:`, error.message);
      errors++;
    } else {
      console.log(`✅ Inserted ${section.section_type}`);
      inserted++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log('');

  if (errors === 0) {
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📋 Next step: Refactor generate-claude-md-from-db.js to use database sections');
  } else {
    console.log('⚠️  Migration completed with errors. Review above.');
    process.exit(1);
  }
}

migrate().catch(console.error);
