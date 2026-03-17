#!/usr/bin/env node
/**
 * Add retrospective-derived sections to leo_protocol_sections
 * Based on analysis of issue_patterns and retrospectives tables
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const protocolId = 'leo-v4-3-3-ui-parity';

async function main() {
  console.log('Adding retrospective-derived sections to LEO Protocol...\n');

  // 1. Test Infrastructure Gate for PLAN phase
  const testInfraGate = {
    protocol_id: protocolId,
    section_type: 'plan_test_infrastructure_gate',
    title: '🧪 Test Infrastructure Readiness Gate (Before PLAN→EXEC)',
    order_index: 136,
    content: `## 🧪 Test Infrastructure Readiness Gate (Before PLAN→EXEC)

**Source**: Retrospective analysis of SD-STAGE4-AI-FIRST-UX-001, SD-VENTURE-UNIFICATION-001

**Failure Pattern**: "Testing infrastructure validated AFTER implementation" caused:
- 28/32 E2E test failures (mock API config not planned)
- 11/18 unit test timeouts (vitest async issues)
- 2-4 hours of debugging per SD

### MANDATORY Verification Before PLAN→EXEC Handoff

\`\`\`markdown
## Test Infrastructure Readiness Checklist

### Authentication
- [ ] Test user exists in database (query auth.users)
- [ ] Test credentials match .env.test.local
- [ ] Manual login works: \`npm run test:auth:verify\` or manual browser test
- [ ] Service role key is valid (for admin operations)

### Unit Tests
- [ ] \`npm run test:unit\` runs without infrastructure errors
- [ ] Baseline count documented: ___ passing / ___ failing
- [ ] No timeout issues (if vitest, check async handling)

### E2E Tests
- [ ] Playwright installed: \`npx playwright --version\`
- [ ] Browser dependencies: \`npx playwright install\`
- [ ] \`npm run test:e2e -- --list\` shows available tests
- [ ] Mock API configuration reviewed (if applicable)

### Environment
- [ ] .env.test exists with test database credentials
- [ ] Test database is accessible
- [ ] No port conflicts with dev server
\`\`\`

### Exit Criteria

**BLOCKING**: Do NOT approve PLAN→EXEC handoff if:
- Test user authentication fails
- Unit test suite has infrastructure errors (not test failures)
- E2E environment is not configured

**Pattern Reference**: PAT-RECURSION-005, PAT-AUTH-PW-001

### Why This Gate Exists

From retrospectives:
> "Testing infrastructure validated AFTER implementation = failure pattern"
> "E2E test suite created but never executed due to auth blocker"
> "Mock API configuration not planned upfront"

**Time saved**: 2-4 hours per SD by catching infrastructure issues before implementation.`,
    metadata: {
      source_patterns: ['PAT-RECURSION-005', 'PAT-AUTH-PW-001'],
      source_retrospectives: ['SD-STAGE4-AI-FIRST-UX-001', 'SD-VENTURE-UNIFICATION-001'],
      added_date: new Date().toISOString()
    }
  };

  // 2. Enhanced Anti-Patterns for EXEC phase
  const execAntiPatterns = {
    protocol_id: protocolId,
    section_type: 'exec_retrospective_anti_patterns',
    title: '❌ Anti-Patterns from Retrospectives (EXEC Phase)',
    order_index: 15,  // After implementation requirements (10)
    content: `## ❌ Anti-Patterns from Retrospectives (EXEC Phase)

**Source**: Analysis of 175 high-quality retrospectives (score ≥60)

These patterns have caused significant time waste. **AVOID them.**

### 1. Manual Test Creation (2-3 hours waste per SD)
**Pattern**: Writing tests manually instead of delegating to testing-agent

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Manual test creation wasted 2-3 hours instead of delegating to testing-agent"

**Fix**: Always use Task tool with \`subagent_type: "testing-agent"\`
\`\`\`
Task(subagent_type="testing-agent", prompt="Create E2E tests for [feature] based on PRD acceptance criteria")
\`\`\`

---

### 2. Skipping Knowledge Retrieval (4-6 hours rework)
**Pattern**: Starting implementation without querying retrospectives/patterns

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Zero consultation of retrospectives before implementation (research_confidence_score = 0.00)"

**Fix**: Run before EXEC starts:
\`\`\`bash
node scripts/automated-knowledge-retrieval.js <SD-ID>
\`\`\`
If \`research_confidence_score = 0.00\`, you skipped this step.

---

### 3. Workarounds Before Root Cause (2-3x time multiplier)
**Pattern**: Working around issues instead of fixing root causes

**Evidence**: SD-2025-1020-E2E-SELECTORS (Score: 100)
> "Time spent on workarounds >> time to follow protocol"
> "Multiple workarounds instead of fixing root causes"

**Fix**: Before implementing a workaround, ask:
- [ ] Have I identified the root cause?
- [ ] Is this a fix or a workaround?
- [ ] What is the time multiplier? (typical: 2-3x)

---

### 4. Accepting Environmental Blockers Without Debug
**Pattern**: Accepting "it's environmental" without investigation

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Environmental issues treated as blockers rather than investigation opportunities"

**Fix**: 5-step minimum debug before accepting as environmental:
1. Check logs for specific error
2. Verify credentials/tokens
3. Test in isolation (curl, manual browser)
4. Check network/ports
5. Compare with known working state

---

### 5. Manual Sub-Agent Simulation (15% quality delta)
**Pattern**: Manually creating sub-agent results instead of executing tools

**Evidence**: SD-RECONNECT-014 (Score: 90)
> "Manual: 75% confidence. Tool: 60% confidence (-15% delta)"
> "Manual sub-agent simulation is an anti-pattern"

**Fix**: Sub-agent results MUST have:
- \`tool_executed: true\`
- Actual execution timestamp
- Real output (not simulated)

---

### Quick Reference

| Anti-Pattern | Time Cost | Fix |
|--------------|-----------|-----|
| Manual test creation | 2-3 hours | Use testing-agent |
| Skip knowledge retrieval | 4-6 hours | Run automated-knowledge-retrieval.js |
| Workarounds first | 2-3x multiplier | Fix root cause |
| Accept environmental | Hours of idle | 5-step debug minimum |
| Simulate sub-agents | 15% quality loss | Execute actual tools |

**Pattern References**: PAT-RECURSION-001 through PAT-RECURSION-005`,
    metadata: {
      source_patterns: ['PAT-RECURSION-001', 'PAT-RECURSION-002', 'PAT-RECURSION-003', 'PAT-RECURSION-004', 'PAT-RECURSION-005'],
      source_retrospectives: ['SD-VENTURE-UNIFICATION-001', 'SD-2025-1020-E2E-SELECTORS', 'SD-RECONNECT-014'],
      added_date: new Date().toISOString()
    }
  };

  // Insert sections
  const { data: result1, error: error1 } = await supabase
    .from('leo_protocol_sections')
    .insert(testInfraGate)
    .select();

  if (error1) {
    console.log('❌ Error inserting Test Infrastructure Gate:', error1.message);
  } else {
    console.log('✅ Added Test Infrastructure Gate section, id:', result1[0].id);
  }

  const { data: result2, error: error2 } = await supabase
    .from('leo_protocol_sections')
    .insert(execAntiPatterns)
    .select();

  if (error2) {
    console.log('❌ Error inserting EXEC Anti-Patterns:', error2.message);
  } else {
    console.log('✅ Added EXEC Anti-Patterns section, id:', result2[0].id);
  }

  console.log('\nDone! Now update section-file-mapping.json and regenerate CLAUDE files.');
}

main().catch(console.error);
