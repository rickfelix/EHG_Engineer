#!/usr/bin/env node

/**
 * Update LEO Protocol Quick Start Decision Tree
 * Merges Session Verification with comprehensive workflow guidance
 *
 * Created: 2025-11-28
 * Purpose: Prevent process confusion by providing clear next-step guidance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MERGED_CONTENT = `## 🚀 Session Verification & Quick Start (MANDATORY)

**Anti-Hallucination Protocol**: Never trust session summaries for database state. ALWAYS verify, then act.

---

### STEP 1: Verify SD State

\`\`\`sql
-- Find SD and determine current state
SELECT id, title, status, current_phase, sd_type, progress
FROM strategic_directives_v2
WHERE id = 'SD-XXX' OR title ILIKE '%keyword%';

-- Check for PRD
SELECT id, status, progress FROM product_requirements_v2 WHERE sd_id = 'SD-XXX';

-- Check for user stories
SELECT COUNT(*) FROM user_stories WHERE sd_id = 'SD-XXX';
\`\`\`

**Document**: "Verified SD [title] exists, status=[X], phase=[Y], PRD=[exists/missing]"

---

### STEP 2: Quick Start Decision Tree

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                    LEO PROTOCOL QUICK START                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
               What did verification find?
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ No SD    │        │ SD in    │        │ SD in    │
    │ Found    │        │ LEAD     │        │ PLAN/EXEC│
    └──────────┘        └──────────┘        └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   Create SD first      See LEAD Flow      See PLAN/EXEC Flow
\`\`\`

---

### LEAD Phase Flow (current_phase = 'LEAD')

\`\`\`
1. Run: npm run prio:top3          # Is this work justified?
   ├── SD in top 3? → Proceed
   └── Not in top 3? → Consider deferring or /quick-fix

2. Read CLAUDE_LEAD.md             # Strategic validation

3. SD Type determines validation:
   ├── feature        → Full (TESTING, SECURITY, DESIGN, DATABASE)
   ├── infrastructure → Reduced (DOCMON, STORIES, GITHUB)
   ├── database       → Full + DATABASE sub-agent required
   ├── security       → Full + SECURITY sub-agent required
   └── documentation  → Minimal (DOCMON, STORIES only)

4. Create PRD:
   node scripts/add-prd-to-database.js SD-XXX "Title"

   This auto-triggers:
   ✓ PRD record creation
   ✓ STORIES sub-agent
   ✓ sd_type detection
   ✓ Component recommendations
\`\`\`

---

### PLAN Phase Flow (current_phase = 'PLAN')

\`\`\`
Check PRD & Stories:
├── No PRD? → Create PRD first (see LEAD flow)
├── PRD exists, no stories? → STORIES sub-agent runs auto, or create manually
└── PRD + Stories exist? → READY FOR EXEC!

Ready for EXEC means:
1. Navigate to /mnt/c/_EHG/ehg/    # Implementation target
2. Read PRD requirements
3. Implement features
4. Write tests as you go
5. Commit with SD-ID
\`\`\`

---

### EXEC Phase Flow (current_phase = 'EXEC')

\`\`\`
JUST IMPLEMENT!

1. cd /mnt/c/_EHG/ehg/             # Navigate to impl target
2. Read PRD & reference docs        # Understand requirements
3. Write code                       # THE ACTUAL WORK
4. npm run test:unit                # Unit tests
5. npm run test:e2e                 # E2E tests (MANDATORY)
6. git commit -m "SD-XXX: ..."      # Track the change

After implementation complete:
node scripts/unified-handoff-system.js --type EXEC-TO-PLAN --sd SD-XXX
\`\`\`

---

### Scripts Reference

**Run Directly (CLI):**
- \`node scripts/add-prd-to-database.js SD-XXX "Title"\` → Creates PRD
- \`node scripts/unified-handoff-system.js --type X --sd Y\` → Handoffs
- \`npm run prio:top3\` → Priority ranking
- \`npm run leo:generate\` → Regenerate CLAUDE files
- \`npm run test:unit / test:e2e\` → Tests

**DO NOT Run Directly (Libraries):**
- \`lib/sub-agent-executor.js\` → Library, not CLI
- \`scripts/phase-preflight.js\` → May fail with UUID mismatch

**Runs Automatically:**
- Sub-agents → Triggered by PRD creation and handoffs
- Validation gates → Triggered by unified-handoff-system.js

---

### Fast-Track Rules

| Situation | Skip | Keep |
|-----------|------|------|
| PRD exists with clear requirements | Sub-agent enrichment | Implement + Test |
| Reference doc exists (e.g., UI Report) | PRD rewrite | Read & implement |
| Small fix (<50 LOC) | Full SD workflow | Use /quick-fix |
| EXEC phase already | LEAD/PLAN re-validation | Just implement |

---

### Minimum Viable Workflow

\`\`\`
1. npm run prio:top3                    # Confirm priority
2. Query SD: status, phase, PRD         # Know starting point
3. If no PRD: add-prd-to-database.js    # Create PRD
4. cd /mnt/c/_EHG/ehg                   # Navigate to impl target
5. IMPLEMENT THE FEATURE                # THE ACTUAL WORK
6. npm run test:unit && test:e2e        # Verify it works
7. git commit with SD-ID                # Track the change
8. Create handoff (if phase complete)   # Document completion
\`\`\`

**The goal is IMPLEMENTATION, not PROCESS COMPLIANCE.**

---

### Why This Matters
- Session summaries describe *context*, not *state*
- AI can hallucinate successful database operations
- Database is the ONLY source of truth
- Clear next-step guidance prevents process confusion

**Pattern Reference**: PAT-SESS-VER-001, PAT-QUICK-START-001`;

async function updateSection() {
  console.log('🔄 Updating LEO Protocol Quick Start Decision Tree...\n');

  // Update section 94 with merged content
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .update({
      title: '🚀 Session Verification & Quick Start (MANDATORY)',
      section_type: 'session_verification_quick_start',
      content: MERGED_CONTENT,
      metadata: {
        updated_at: new Date().toISOString(),
        update_reason: 'Merged Session Verification with Quick Start Decision Tree',
        previous_section_type: 'session_verification',
        patterns_referenced: ['PAT-SESS-VER-001', 'PAT-QUICK-START-001']
      }
    })
    .eq('id', 94)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating section:', error.message);
    process.exit(1);
  }

  console.log('✅ Section 94 updated successfully');
  console.log('   Title:', data.title);
  console.log('   Type:', data.section_type);
  console.log('   Content length:', data.content.length, 'chars');
  console.log('');
  console.log('📋 Next step: Run "npm run leo:generate" to regenerate CLAUDE_CORE.md');
}

updateSection().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
