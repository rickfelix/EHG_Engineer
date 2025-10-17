#!/usr/bin/env node

/**
 * Add Sub-Agent Compression documentation to LEO Protocol
 * Part of Context Management Improvements - Week 3
 *
 * This adds comprehensive documentation for the priority-based
 * tiered compression system for sub-agent reports.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SUB_AGENT_COMPRESSION_CONTENT = `## Sub-Agent Report Compression System

**Critical Lesson**: Sub-agent reports provide essential validation but can consume 10K-20K tokens. Intelligent compression preserves critical context while reducing token usage by 70-90%.

---

### The Challenge

**Problem**: Multiple sub-agent executions create verbose reports:
- 3-5 sub-agents per SD × 500-1000 lines each = 10K-20K tokens
- Full reports needed during execution, but not after phase complete
- Critical issues must never be lost, but "all tests passed" can be summarized

**Solution**: Priority-based tiered compression that preserves critical context.

---

### 3-Tier Compression System

#### TIER 1: CRITICAL (No Compression)
**When Applied**:
- \`critical_issues.length > 0\`
- \`verdict === 'BLOCKED'\`
- \`verdict === 'FAIL'\`

**Action**: Full report preserved with zero compression

**Rationale**: Security vulnerabilities, database blockers, test failures require complete context

**Example**:
\`\`\`json
{
  "agent": "Chief Security Architect",
  "verdict": "BLOCKED",
  "confidence": 95,
  "critical_issues": [
    {
      "severity": "CRITICAL",
      "issue": "SQL injection vulnerability in user input",
      "location": "src/services/userService.ts:127",
      "recommendation": "Use parameterized queries instead of string concatenation",
      "code_snippet": "db.query('SELECT * FROM users WHERE id = ' + userId)"
    }
  ],
  "detailed_analysis": "...",
  "recommendations": ["..."],
  "_compression_tier": "TIER_1_CRITICAL",
  "_compression_note": "Full detail preserved - critical issues present"
}
\`\`\`

---

#### TIER 2: IMPORTANT (Structured Summary)
**When Applied**:
- \`warnings.length > 0\`
- \`verdict === 'CONDITIONAL_PASS'\`
- Sub-agent is relevant to current phase

**Action**: Structured summary with key findings
- All critical issues (if any)
- All warnings (with key fields: issue, severity, recommendation, location)
- Top 5 recommendations
- Key metrics only
- Reference to full report ID

**Rationale**: Warnings need attention but don't require full verbosity

**Example**:
\`\`\`json
{
  "agent": "QA Engineering Director",
  "verdict": "CONDITIONAL_PASS",
  "confidence": 85,
  "critical_issues": [],
  "warnings": [
    {
      "issue": "Test coverage below 50% for userService.ts",
      "severity": "MEDIUM",
      "recommendation": "Add unit tests for edge cases",
      "location": "src/services/userService.ts"
    }
  ],
  "recommendations": [
    "Add integration tests for authentication flow",
    "Implement E2E tests for critical user paths",
    "Add error boundary tests",
    "Test loading states",
    "Add accessibility tests"
  ],
  "key_metrics": {
    "tests_passed": 47,
    "tests_total": 50,
    "coverage": 48
  },
  "full_report_id": "uuid-of-full-report",
  "_compression_tier": "TIER_2_IMPORTANT",
  "_compression_note": "Structured summary - full report available via ID"
}
\`\`\`

---

#### TIER 3: INFORMATIONAL (Reference Only)
**When Applied**:
- \`verdict === 'PASS'\`
- No warnings
- No critical issues
- Not phase-relevant

**Action**: One-line summary with minimal metrics
- Agent name
- Verdict
- Confidence
- Intelligent one-liner based on report type
- Key metrics (2-3 only)
- Reference to full report ID

**Rationale**: "All tests passed" doesn't need 800 lines of detail

**Example**:
\`\`\`json
{
  "agent": "QA Engineering Director",
  "verdict": "PASS",
  "confidence": 95,
  "summary": "50/50 tests passed. No blockers identified.",
  "key_metrics": {
    "tests_passed": 50,
    "tests_total": 50,
    "coverage": 78
  },
  "full_report_id": "uuid-of-full-report",
  "_compression_tier": "TIER_3_INFORMATIONAL",
  "_compression_note": "Compressed to summary - retrieve full report if needed"
}
\`\`\`

---

### Phase Relevance Map

Different sub-agents matter more in different phases:

| Phase | Relevant Sub-Agents | Rationale |
|-------|---------------------|-----------|
| **EXEC** | QA Director, Database Architect, Security Architect | Implementation quality gates |
| **PLAN_VERIFICATION** | ALL sub-agents | Supervisor needs complete picture |
| **LEAD_APPROVAL** | Only BLOCKED or WARNING reports | LEAD focuses on issues, not successes |

**Impact**: Same sub-agent report may be TIER_2 during EXEC, TIER_3 after LEAD approval.

---

### Automatic Retrieval Rules

Full reports are automatically retrieved from database when:

1. **Context = PLAN Supervisor Verification**
   - PLAN supervisor always gets full reports for all sub-agents
   - Ensures comprehensive "done done" verification

2. **Context = Retrospective Generation**
   - Continuous Improvement Coach needs full detail for learning

3. **Context = Debugging**
   - Full error context required for troubleshooting

4. **Warnings Present + Context = Verification**
   - TIER_2 summaries expanded to full detail during verification phase

5. **TIER_1 Reports (Critical)**
   - Already full detail, no retrieval needed

---

### Intelligent One-Line Summaries

Compression library generates context-aware summaries based on report type:

**QA Director Pattern**:
\`\`\`
"50/50 tests passed. No blockers identified."
"47/50 tests passed. 3 edge case failures (non-blocking)."
\`\`\`

**Database Architect Pattern**:
\`\`\`
"12 tables validated. Schema compliant."
"Migration #007 applied successfully. No conflicts."
\`\`\`

**Security Architect Pattern**:
\`\`\`
"Security scan complete. 0 vulnerabilities found."
"3 vulnerabilities found (0 critical, 2 medium, 1 low)."
\`\`\`

**Performance Lead Pattern**:
\`\`\`
"Performance: 142ms load time. Within acceptable range."
"Load time: 3.2s (exceeds 2s target by 60%)."
\`\`\`

**Generic Pattern** (fallback):
\`\`\`
"PASS with 95% confidence. No issues identified."
"CONDITIONAL_PASS with 2 issue(s) noted."
\`\`\`

---

### Implementation Guide

#### For EXEC Agent (Storing Results)

After sub-agent execution:

\`\`\`javascript
import { getCompressionTier, compressSubAgentReport } from './lib/context/sub-agent-compressor.js';

// 1. Sub-agent generates full report
const fullReport = await executeSubAgent('qa-director', sdId);

// 2. Store full report in database (ALWAYS)
const { data: stored } = await supabase
  .from('sub_agent_execution_results')
  .insert(fullReport)
  .select()
  .single();

// 3. Determine compression tier
const tier = getCompressionTier(fullReport, currentPhase);

// 4. Compress for context
const compressed = compressSubAgentReport(fullReport, tier);

// 5. Use compressed version in conversation
console.log(\`QA Director: \${compressed.summary || compressed.verdict}\`);
\`\`\`

---

#### For PLAN Supervisor (Retrieving Full Reports)

During verification:

\`\`\`javascript
import { retrieveForPlanSupervisor, shouldRetrieveFullReport } from './lib/context/sub-agent-retrieval.js';

// 1. Retrieve organized reports
const reports = await retrieveForPlanSupervisor(sdId);

// 2. PLAN supervisor automatically gets full detail
// (retrieveForPlanSupervisor returns full reports, not compressed)

// 3. Analyze by priority
console.log(\`Critical issues: \${reports.critical.length}\`);
console.log(\`Warnings: \${reports.warnings.length}\`);
console.log(\`Passed: \${reports.passed.length}\`);

// 4. Focus on blockers first
for (const critical of reports.critical) {
  // Full report available for detailed analysis
}
\`\`\`

---

#### For Retrospective Generation

When Continuous Improvement Coach triggers:

\`\`\`javascript
import { retrieveAllSubAgentReports } from './lib/context/sub-agent-retrieval.js';

// Retrieve all full reports for learning analysis
const allReports = await retrieveAllSubAgentReports(sdId, {
  orderBy: 'created_at',
  ascending: false
});

// Analyze patterns across full reports
const patterns = analyzeTestingPatterns(allReports);
\`\`\`

---

### Token Savings Calculator

Expected savings per SD:

| Scenario | Before (Tokens) | After (Tokens) | Savings |
|----------|----------------|----------------|---------|
| 5 sub-agents, all PASS | 15,000 | 1,500 | 90% (13.5K) |
| 4 PASS, 1 WARNING | 15,000 | 4,000 | 73% (11K) |
| 3 PASS, 2 CRITICAL | 15,000 | 9,000 | 40% (6K) |
| All CRITICAL | 15,000 | 15,000 | 0% (preserved) |

**Average Expected Savings**: 15K-30K tokens per SD

---

### Database Integration

#### Storage Table: \`sub_agent_execution_results\`

Full reports always stored here:

\`\`\`sql
CREATE TABLE sub_agent_execution_results (
  id UUID PRIMARY KEY,
  sd_id TEXT REFERENCES strategic_directives_v2(id),
  sub_agent_code TEXT,
  sub_agent_name TEXT,
  verdict TEXT,
  confidence INTEGER,
  critical_issues JSONB,
  warnings JSONB,
  recommendations JSONB,
  detailed_analysis TEXT,
  execution_time INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

#### Retrieval Pattern

\`\`\`javascript
// Get full report by ID (from compressed report reference)
const fullReport = await retrieveFullSubAgentReport(compressed.full_report_id);

// Get all reports for SD
const allReports = await retrieveAllSubAgentReports(sdId);

// Get only blocked reports
const blocked = await retrieveReportsByVerdict(sdId, 'BLOCKED');
\`\`\`

---

### Benefits

1. **Context Efficiency**: 70-90% token reduction for passed validations
2. **Critical Preservation**: Zero information loss for blockers
3. **Phase Awareness**: Compression adapts to workflow stage
4. **On-Demand Detail**: Full reports retrievable when needed
5. **Automatic Handling**: PLAN supervisor gets full reports automatically

---

### Integration with Existing Systems

#### Handoff System
- Compressed reports in EXEC→PLAN handoffs
- Full reports automatically fetched during PLAN verification
- PLAN→LEAD handoffs include only critical/warning summaries

#### Dashboard
- Display compressed summaries in SD status view
- "View Full Report" button retrieves complete analysis
- Token savings displayed in metrics

#### Memory System
- Compressed reports stored in conversation memory
- Full reports in database memory
- Retrieval on-demand prevents memory bloat

---

### Example: Complete Workflow

\`\`\`javascript
// EXEC Phase: Implementation complete
const qaReport = await executeQADirector(sdId);
const securityReport = await executeSecurityArchitect(sdId);
const dbReport = await executeDatabaseArchitect(sdId);

// Store all full reports
await storeSubAgentResults([qaReport, securityReport, dbReport]);

// Compress for handoff
const { compressed_reports, statistics } = compressBatch(
  [qaReport, securityReport, dbReport],
  'EXEC'
);

console.log(\`Token savings: \${statistics.tokens_saved} (\${statistics.percentage_saved}%)\`);

// EXEC→PLAN handoff includes compressed reports
await createHandoff('EXEC-to-PLAN', sdId, {
  sub_agent_summaries: compressed_reports
});

// PLAN Verification: Automatic full retrieval
const fullReports = await retrieveForPlanSupervisor(sdId);

// PLAN supervisor has complete context
const verdict = await planSupervisorVerification(fullReports);
\`\`\`

---

**Related Tools**:
- \`lib/context/sub-agent-compressor.js\` - Compression library
- \`lib/context/sub-agent-retrieval.js\` - Retrieval helpers
- \`scripts/examples/compression-demo.js\` - Working examples (TODO)
`;

async function addSubAgentCompressionSection() {
  console.log('\n📦 Adding Sub-Agent Compression Documentation to LEO Protocol');
  console.log('='.repeat(60));
  console.log();

  try {
    // Get current active protocol
    const { data: protocol, error: protocolError } = await supabase
      .from('leo_protocols')
      .select('id, version')
      .eq('status', 'active')
      .single();

    if (protocolError || !protocol) {
      console.error('❌ Error finding active protocol:', protocolError);
      process.exit(1);
    }

    console.log(`✅ Found active protocol: ${protocol.version} (${protocol.id})`);
    console.log();

    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id, title')
      .eq('protocol_id', protocol.id)
      .eq('section_type', 'sub_agent_compression')
      .single();

    if (existing) {
      console.log('⚠️  Sub-agent compression section already exists');
      console.log(`   Updating: ${existing.title}`);
      console.log();

      const { error: updateError } = await supabase
        .from('leo_protocol_sections')
        .update({
          title: 'Sub-Agent Report Compression System',
          content: SUB_AGENT_COMPRESSION_CONTENT,
          order_index: 330,
          metadata: {
            source: 'Context Management Improvements',
            created_date: '2025-10-10',
            priority: 'high',
            category: 'context_management',
            token_savings: '15K-30K per SD',
            implementation_week: 3
          }
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('❌ Update failed:', updateError);
        process.exit(1);
      }

      console.log('✅ Sub-agent compression section updated');
    } else {
      console.log('Creating new sub-agent compression section...');
      console.log();

      const { error: insertError } = await supabase
        .from('leo_protocol_sections')
        .insert({
          protocol_id: protocol.id,
          section_type: 'sub_agent_compression',
          title: 'Sub-Agent Report Compression System',
          content: SUB_AGENT_COMPRESSION_CONTENT,
          order_index: 330,
          metadata: {
            source: 'Context Management Improvements',
            created_date: '2025-10-10',
            priority: 'high',
            category: 'context_management',
            token_savings: '15K-30K per SD',
            implementation_week: 3
          }
        });

      if (insertError) {
        console.error('❌ Insert failed:', insertError);
        process.exit(1);
      }

      console.log('✅ Sub-agent compression section added');
    }

    console.log();
    console.log('='.repeat(60));
    console.log('📋 NEXT STEPS:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify section appears in CLAUDE.md');
    console.log('   3. Update sub-agent execution workflow to use compression');
    console.log('   4. Test token savings across 3 SDs');
    console.log('='.repeat(60));
    console.log();

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addSubAgentCompressionSection();
