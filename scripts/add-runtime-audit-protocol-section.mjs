#!/usr/bin/env node

/**
 * Add Runtime Audit Protocol Section to LEO Protocol
 *
 * This adds the Triangulated Runtime Audit Protocol as a formal
 * section in the LEO Protocol documentation stored in the database.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION = {
  protocol_id: 'leo-v4-3-3-ui-parity', // Current active protocol
  section_type: 'workflow',
  title: 'Triangulated Runtime Audit Protocol',
  order_index: 850, // After testing sections, before advanced
  content: `## Triangulated Runtime Audit Protocol

### Purpose
A structured workflow for manually testing the EHG application with AI-assisted diagnosis and remediation planning. Uses Claude Code as the testing guide and triangulates findings across 3 AI models (Claude, ChatGPT, Antigravity) for high-confidence root cause analysis and fix proposals.

### When to Use
- Periodic product health checks
- After major deployments
- When users report multiple issues
- Before major releases
- When you want to "click around" and find what's broken

### Quick Start
Invoke with: \`/runtime-audit\`

---

### Protocol Phases

#### Phase 1: SETUP
1. Start app: \`bash scripts/leo-stack.sh restart\`
2. Define context anchor (vision, immutables, pending SDs)
3. Claude enters "testing guide mode"

#### Phase 2: MANUAL TESTING (Claude Guides)
- Claude provides next click step
- You report what you see
- Claude logs issues in structured format
- Claude identifies "nearby failures" to check

**Issue Format:**
\`\`\`
[Flow]-[##]: One-line description
Route: /path
Severity: Critical | Major | Minor
Notes: expected vs actual
\`\`\`

**Flow Priority:**
1. \`/chairman/*\` (Chairman Console)
2. \`/ventures/*\` (Venture Management)
3. \`/eva-assistant\`, \`/ai-agents\` (EVA/Agents)
4. \`/analytics/*\`, \`/reports/*\` (Analytics)
5. \`/governance\`, \`/security/*\` (Governance)

#### Phase 3: ROOT CAUSE DIAGNOSIS (All 3 Models)
- Claude creates diagnostic prompt from logged issues
- Send SAME prompt to ChatGPT and Antigravity
- Each model investigates independently
- Compare findings to identify consensus vs divergence

#### Phase 4: REMEDIATION PLANNING (All 3 Models)
- Send confirmed root causes to all 3 models
- Each proposes fixes independently
- Triangulate to find best approach
- Decision rules:
  - All agree → High confidence, execute
  - 2 agree → Evaluate trade-offs, Chairman decides
  - Safety concern → Immediate investigation

#### Phase 5: SD CREATION (Claude Executes)
- Follow LEO Protocol orchestrator/child pattern (see \`docs/recommendations/child-sd-pattern-for-phased-work.md\`)
- Use proper hierarchy fields: \`relationship_type\`, \`parent_sd_id\`, \`sequence_rank\`
- Embed triangulation evidence in metadata
- Reference: \`scripts/templates/sd-creation-template.js\`

#### Phase 6: EXECUTION
- Execute child SDs in priority order
- Regression test each fix
- Mark complete when done

---

### Roles

| Model | Role | When Used |
|-------|------|-----------|
| **Claude Code** | Testing Guide + Synthesizer | Throughout |
| **ChatGPT** | Triangulation Partner | Phases 3-4 |
| **Antigravity** | Triangulation Partner | Phases 3-4 |

---

### Templates

#### Context Anchor Template
\`\`\`markdown
## Context Anchor

### Vision & Immutables
1. EHG is an Autonomous Venture Orchestrator
2. Role/permissions enforced at every action
3. No irreversible action without confirmation + audit trail
4. AI outputs labeled (recommendation vs action vs system-executed)
5. Venture state transitions must be valid and traceable
6. Governance and runtime are separate domains

### Pending SDs
[List any SDs in progress]

### Guardrails
- Don't propose changes that increase technical debt
- Prefer minimal diffs over refactors
\`\`\`

#### Diagnostic Prompt Template
See: \`/runtime-audit\` skill for full template

#### Remediation Prompt Template
See: \`/runtime-audit\` skill for full template

---

### Synthesis Grid Template

| Issue | Claude | ChatGPT | Antigravity | Consensus |
|-------|--------|---------|-------------|-----------|
| A-01 | [finding] | [finding] | [finding] | HIGH/MED/LOW |

---

### Decision Rules

| Scenario | Action |
|----------|--------|
| All 3 models agree on root cause + fix | Execute with high confidence |
| 2 models agree, 1 differs | Evaluate trade-offs, Chairman decides |
| All 3 differ significantly | More investigation needed |
| Single model flags safety/permission issue | Immediate investigation (don't wait) |
| Divergent fixes are complementary (A+B) | Take union of both approaches |
| Divergent fixes are contradictory (A vs B) | Chairman decides based on vision |

---

### Checklist

**Before Starting:**
- [ ] App running on localhost:8080
- [ ] Logged in with correct role
- [ ] Context anchor defined
- [ ] ChatGPT session ready
- [ ] Antigravity session ready

**During Testing:**
- [ ] Issues logged with ID, route, severity
- [ ] Nearby failures identified
- [ ] Console errors captured

**After Testing:**
- [ ] Diagnostic prompt sent to all models
- [ ] Root causes triangulated
- [ ] Remediation triangulated
- [ ] SDs created with evidence

---

### Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Issue Log | Inline or TEST_LOG.md | Track findings |
| Diagnostic Prompt | Generated by Claude | Send to partners |
| Synthesis Grid | Inline | Compare findings |
| SD Script | scripts/create-sd-runtime-audit-*.mjs | Create SDs |
| Strategic Directives | Database | Track fixes |

---

### Related Skills
- \`baseline-testing\` - Establishing test baselines
- \`e2e-ui-verification\` - Verifying UI before testing
- \`codebase-search\` - Finding code references
- \`schema-design\` - Database schema issues
`,
  metadata: {
    version: '1.0.0',
    created_date: new Date().toISOString(),
    created_by: 'Claude Code + Chairman',
    skill_path: '/home/rickf/.claude/skills/runtime-audit/SKILL.md',
    triggers: ['runtime audit', 'manual testing', 'click around', 'triangulated diagnosis'],
    related_skills: ['baseline-testing', 'e2e-ui-verification', 'codebase-search']
  }
};

async function addProtocolSection() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Adding Runtime Audit Protocol Section to LEO Protocol                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  try {
    // Check if section exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id, title')
      .eq('title', SECTION.title)
      .eq('protocol_id', SECTION.protocol_id)
      .single();

    if (existing) {
      console.log('⚠️  Section exists, updating...');
      const { error } = await supabase
        .from('leo_protocol_sections')
        .update(SECTION)
        .eq('id', existing.id);

      if (error) throw error;
      console.log('✅ Section updated successfully');
    } else {
      const { error } = await supabase
        .from('leo_protocol_sections')
        .insert(SECTION);

      if (error) throw error;
      console.log('✅ Section created successfully');
    }

    console.log('\n📋 Section Details:');
    console.log('─'.repeat(40));
    console.log(`Title: ${SECTION.title}`);
    console.log(`Order: ${SECTION.order_index}`);
    console.log(`Type: ${SECTION.section_type}`);
    console.log(`Target: ${SECTION.target_file}`);

    console.log('\n🚀 Next Steps:');
    console.log('─'.repeat(40));
    console.log('1. Regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
    console.log('2. Test skill: /runtime-audit');
    console.log('3. Update SKILL-INDEX.md in ~/.claude/skills/');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

addProtocolSection();
