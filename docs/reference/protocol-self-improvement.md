# LEO Protocol Self-Improvement System

**Generated**: 2025-12-10
**Status**: Active
**Context Tier**: REFERENCE

---

## Overview

The LEO Protocol Self-Improvement System is an evidence-based, automated mechanism for continuously improving the LEO Protocol based on learnings from completed Strategic Directives. The system creates a closed feedback loop: retrospectives identify improvements, improvements are queued and tracked, and effectiveness is measured through subsequent retrospectives.

### Purpose

- **Automate Protocol Evolution**: Convert retrospective learnings into protocol updates without manual intervention
- **Evidence-Based Changes**: All protocol improvements backed by specific SD evidence and impact data
- **Prevent Recurring Issues**: Capture pain points and process improvements to prevent future occurrence
- **Track Effectiveness**: Measure whether applied improvements actually solve the problems they were designed to address

### Key Benefits

From 74+ retrospectives analyzed:
- **Faster Learning Cycles**: Protocol improvements applied within 1-2 SDs of discovery (vs weeks/months manually)
- **Higher Compliance**: Automated enforcement reduces "forgot to run tests" incidents by 100%
- **Reduced Rework**: Testing enforcement alone saves 30 minutes per SD in validation gaps
- **Compounding Quality**: Each improvement raises the baseline for all future SDs

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RETROSPECTIVE CREATION                          │
│  (Manual via handoff.js or Auto on SD completion)                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  retrospectives table      │
                │  • protocol_improvements[] │
                │  • learning_category       │
                │  • quality_score           │
                └────────┬───────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │  EXTRACTION & ANALYSIS                 │
        │  scripts/analyze-retrospectives-       │
        │         for-protocol-improvements.mjs  │
        └────────┬───────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────────┐
    │  Pattern Detection                             │
    │  • Recurring pain points (≥2 mentions)         │
    │  • High-impact process improvements            │
    │  • Sub-agent enhancement recommendations       │
    │  • Testing infrastructure gaps                 │
    └────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  IMPROVEMENT QUEUE                                 │
│  protocol_improvement_queue table (if exists)      │
│  OR direct application via script                  │
│  • priority, status, evidence_count                │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  APPLICATION                                       │
│  scripts/add-protocol-improvements-from-           │
│          retrospectives.mjs                        │
│  • Update leo_protocol_sections                   │
│  • Add enforcement mechanisms                      │
│  • Update handoff templates                        │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  REGENERATION                                      │
│  scripts/generate-claude-md-from-db.js             │
│  • CLAUDE.md updated                               │
│  • CLAUDE_LEAD/PLAN/EXEC.md updated                │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  EFFECTIVENESS TRACKING                            │
│  • Next retrospectives measure impact              │
│  • Pain point frequency monitored                  │
│  • Quality score trends analyzed                   │
└────────────────────────────────────────────────────┘
```

---

## Database Tables

### 1. retrospectives.protocol_improvements

**Column**: `protocol_improvements` (JSONB array)
**Added**: 2025-12-04
**Migration**: `database/migrations/20251204_add_protocol_improvements_to_retrospectives.sql`

**Purpose**: Stores structured protocol improvement suggestions extracted during retrospective creation.

**Schema**:
```json
[
  {
    "category": "testing|validation|sub_agent|handoff|scope|documentation",
    "improvement": "Clear description of what needs to change",
    "evidence": "SD-XXX specific evidence that demonstrates the problem",
    "impact": "Expected benefit (time saved, quality improvement, etc.)",
    "affected_phase": "LEAD|PLAN|EXEC|null"
  }
]
```

**Constraints**:
- Must be valid JSON array
- Indexed with GIN for efficient querying
- Quality validation: PROCESS_IMPROVEMENT retrospectives without protocol_improvements lose 10 quality score points

**Example**:
```json
[
  {
    "category": "testing",
    "improvement": "Enforce dual test execution (unit + E2E) before EXEC→PLAN handoff",
    "evidence": "SD-EXPORT-001: 30-minute gap between 'complete' and discovering tests weren't run",
    "impact": "Prevents validation gaps, saves 30 minutes per SD",
    "affected_phase": "EXEC"
  }
]
```

### 2. retrospectives.learning_category

**Column**: `learning_category` (TEXT)
**Values**: `PROCESS_IMPROVEMENT | TECHNICAL_LEARNING | SUCCESS_PATTERN | PAIN_POINT`

**Purpose**: Categorizes retrospectives for targeted analysis.

**Trigger Logic**:
- `PROCESS_IMPROVEMENT` → Requires `protocol_improvements` array (enforced by trigger)
- Other categories → protocol_improvements optional but recommended

### 3. protocol_improvement_queue (Optional)

**Status**: Proposed (not yet implemented)
**Purpose**: Track improvement lifecycle from discovery to effectiveness measurement

**Proposed Schema**:
```sql
CREATE TABLE protocol_improvement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  improvement_text TEXT NOT NULL,
  evidence_sds TEXT[] NOT NULL, -- Array of SD-XXX references
  evidence_count INTEGER DEFAULT 1,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT CHECK (status IN ('pending', 'approved', 'applied', 'measuring', 'validated')),
  affected_phase TEXT CHECK (affected_phase IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),
  target_table TEXT, -- leo_protocol_sections, leo_handoff_templates, etc.
  target_section_id INTEGER, -- Foreign key to updated section
  applied_at TIMESTAMPTZ,
  effectiveness_score DECIMAL(3,2), -- 0.00-1.00 based on subsequent retrospectives
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Lifecycle**:
1. **pending**: Discovered in retrospectives, awaiting priority review
2. **approved**: High-impact improvements (≥2 evidence SDs or high priority)
3. **applied**: Protocol sections updated, changes live in CLAUDE.md
4. **measuring**: Active for 3-5 SDs, collecting effectiveness data
5. **validated**: Proven effective (pain point mentions reduced, quality scores improved)

### 4. Helper Function: get_all_protocol_improvements()

**Function**: `get_all_protocol_improvements(since_date DATE DEFAULT NULL)`
**Returns**: Table with flattened protocol_improvements from all retrospectives

**Usage**:
```sql
-- Get all improvements from last 30 days
SELECT * FROM get_all_protocol_improvements(CURRENT_DATE - INTERVAL '30 days');

-- Get all improvements ever
SELECT * FROM get_all_protocol_improvements();
```

**Output Columns**:
- `retro_id`: UUID of source retrospective
- `sd_id`: Strategic Directive ID
- `conducted_date`: When retrospective was conducted
- `learning_category`: Retrospective category
- `improvement`: Individual improvement object (JSONB)

### 5. View: v_protocol_improvements_analysis

**View**: `v_protocol_improvements_analysis`
**Purpose**: Flattened view for reporting and pattern analysis

**Key Columns**:
- `retro_id`, `sd_id`, `retro_title`
- `improvement_category`, `improvement_text`, `evidence`, `impact`
- `affected_phase`, `quality_score`, `improvement_count`

**Query Examples**:
```sql
-- Find high-impact testing improvements
SELECT * FROM v_protocol_improvements_analysis
WHERE improvement_category = 'testing'
  AND impact LIKE '%high%'
ORDER BY conducted_date DESC;

-- Count improvements by phase
SELECT affected_phase, COUNT(*) as improvement_count
FROM v_protocol_improvements_analysis
GROUP BY affected_phase
ORDER BY improvement_count DESC;
```

---

## How Improvements Are Extracted

### 1. During Retrospective Creation

**When**: Creating EXEC→PLAN or PLAN→LEAD handoff retrospectives
**Script**: `scripts/handoff.js` (automated) or manual creation

**Process**:
1. Retrospective creator (human or AI) identifies process improvements during reflection
2. Structures improvements in `protocol_improvements` JSONB array
3. Sets `learning_category = 'PROCESS_IMPROVEMENT'` if protocol changes recommended
4. Saves to `retrospectives` table

**Quality Enforcement**:
- Trigger `validate_protocol_improvements_trigger` checks for empty array
- If PROCESS_IMPROVEMENT category has no improvements → quality_score reduced by 10 points
- Quality issue added: `missing_protocol_improvements`

### 2. Batch Analysis Script

**Script**: `scripts/analyze-retrospectives-for-protocol-improvements.mjs`
**Purpose**: Analyze all retrospectives to find patterns and recurring issues

**What It Does**:
```javascript
// 1. Fetch all retrospectives
const retrospectives = await supabase
  .from('retrospectives')
  .select('*')
  .order('created_at', { ascending: false });

// 2. Extract patterns
// - Success stories (what worked)
// - Pain points (what didn't work)
// - Process improvements (recommendations)
// - Testing learnings (infrastructure gaps)
// - Sub-agent recommendations (enhancement opportunities)

// 3. Pattern frequency analysis
// Example: "database" mentioned in 8 retrospectives
//          "testing" mentioned in 12 retrospectives

// 4. Critical lessons summary
// High-impact process improvements (impact=high or priority=high)
// Sub-agent enhancement recommendations
// Testing infrastructure gaps
```

**Output**:
- Console report with top patterns
- Evidence counts for recurring themes
- Prioritized list of critical improvements
- Specific SD references for each pattern

**Example Output**:
```
Top Pain Point Categories:
  12x - Testing
  8x  - Database migration
  5x  - User story validation
  3x  - Handoff clarity

Critical Lessons:
  1. [SD-EXPORT-001] Tests existed but weren't executed before approval
  2. [SD-EVA-MEETING-002] 67% E2E failure rate when finally run
  3. [SD-EVA-MEETING-001] User stories created retroactively (should be before impl)
```

### 3. Evidence-Based Thresholds

**Auto-Apply Criteria** (applies directly to protocol):
- Pain point mentioned in ≥3 retrospectives
- High-impact improvement with ≥2 evidence SDs
- Critical severity issues (blocking work)

**Review Required Criteria** (queued for approval):
- Pain point mentioned in 2 retrospectives
- Medium-impact improvement with 1 evidence SD
- Enhancement recommendations (non-blocking)

**Metrics**:
```javascript
// Recurring pain point detection
const recurringThemes = ['database', 'testing', 'validation', 'handoff'];
recurringThemes.forEach(theme => {
  const count = painDescriptions.filter(desc => desc.includes(theme)).length;
  if (count >= 2) {
    console.log(`⚠️ "${theme}" mentioned in ${count} retrospectives`);
    // Auto-queue for protocol improvement
  }
});
```

---

## Improvement Types and Target Tables

### 1. Testing Enforcement

**Target Table**: `leo_protocol_sections`
**Section**: "EXEC Dual Test Requirement" (ID: 34)
**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-002

**Changes Applied**:
- Added explicit "Dual Test Execution" requirement
- Added verification checklist (unit + E2E)
- Added "Common Mistakes" section
- Added blocking requirement to handoff scripts

**Impact**: Prevents "marked complete without running tests" incidents

### 2. User Story Validation

**Target Table**: `leo_protocol_sections`
**Section**: "User Story E2E Test Mapping (MANDATORY)" (New)
**Evidence**: SD-EVA-MEETING-001, SD-AGENT-ADMIN-002

**Changes Applied**:
- Mandatory US-XXX prefix for E2E tests
- 100% coverage requirement (every user story must have ≥1 E2E test)
- QA Director verification logic
- File organization best practices

**Impact**: Ensures all requirements validated, saves 1-2 hours of retroactive work

### 3. Sub-Agent Auto-Triggering

**Target Table**: `leo_protocol_sections`
**Section**: "Sub-Agent Auto-Trigger Enforcement (MANDATORY)" (New)
**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-001

**Changes Applied**:
- QA Engineering Director MUST run before EXEC→PLAN handoff
- Handoff script verification (blocks if QA not run)
- Manual override requires LEAD approval
- Anti-patterns documentation

**Impact**: Zero "forgot to run QA" incidents, 30-minute gap eliminated

### 4. SD Evaluation Checklist

**Target Table**: `leo_protocol_sections`
**Section**: "6-Step SD Evaluation Checklist" (ID: 19, was 5-step)
**Evidence**: SD-EXPORT-001

**Changes Applied**:
- Added Step 6: "Execute QA Smoke Tests"
- Database query for test evidence
- Cannot approve SD without passing tests

**Impact**: Testing integrated into SD approval workflow

### 5. Handoff Templates

**Target Table**: `leo_handoff_templates`
**Template**: EXEC→PLAN handoff
**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-001, SD-EVA-MEETING-002

**Changes Applied**:
- Required element: "Unit Test Results" (command + pass/fail count + coverage %)
- Required element: "E2E Test Results" (command + pass/fail count + Playwright report)
- Required element: "User Story Coverage" (must be 100%)

**Impact**: Handoff creation blocked without test evidence

---

## Evidence-Based Thresholds

### When Improvements Auto-Apply

**Criteria**:
1. **High Frequency**: Pain point mentioned in ≥3 retrospectives
2. **High Impact**: Improvement marked `impact: high` with ≥2 evidence SDs
3. **Critical Severity**: Blocking issues that prevent work from completing

**Auto-Apply Process**:
1. Pattern detected by analysis script
2. Improvement drafted in `add-protocol-improvements-from-retrospectives.mjs`
3. Database tables updated (leo_protocol_sections, leo_handoff_templates)
4. CLAUDE.md regenerated
5. Effectiveness tracking begins

**Example**:
- **Pattern**: "testing" mentioned in 12 retrospectives
- **Evidence**: SD-EXPORT-001 (30-min gap), SD-EVA-MEETING-002 (67% E2E failure)
- **Action**: Auto-applied "EXEC Dual Test Requirement" enforcement
- **Result**: Zero testing gaps in next 8 SDs

### When Improvements Need Review

**Criteria**:
1. **Medium Frequency**: Pain point mentioned in 2 retrospectives
2. **Medium Impact**: Improvement marked `impact: medium` with 1 evidence SD
3. **Enhancement**: Non-blocking improvements (nice-to-have)

**Review Process**:
1. Queued in `protocol_improvement_queue` (status: pending)
2. LEAD reviews priority and evidence
3. If approved → status: approved → applied
4. If rejected → archived with reason

### When Improvements Are Ignored

**Criteria**:
1. **Single Occurrence**: Pain point mentioned in only 1 retrospective
2. **Low Impact**: Minor inconveniences or edge cases
3. **Inconsistent**: Success in some SDs, pain point in others (no clear pattern)

**Process**:
- Logged in retrospective for historical record
- Monitored in subsequent retrospectives
- If becomes recurring (≥2 mentions) → queued for review

---

## Effectiveness Tracking

### Metrics

**1. Pain Point Frequency**
```sql
-- Track mentions of specific pain points over time
SELECT
  DATE_TRUNC('month', conducted_date) as month,
  COUNT(*) FILTER (WHERE pain_points::text LIKE '%testing%') as testing_mentions,
  COUNT(*) FILTER (WHERE pain_points::text LIKE '%database%') as database_mentions
FROM retrospectives
GROUP BY month
ORDER BY month DESC;
```

**Expected**: Pain point frequency decreases after protocol improvement applied

**2. Quality Score Trends**
```sql
-- Average quality score before and after improvement
SELECT
  CASE
    WHEN conducted_date < '2025-12-04' THEN 'Before Testing Enforcement'
    ELSE 'After Testing Enforcement'
  END as period,
  AVG(quality_score) as avg_quality,
  COUNT(*) as retrospective_count
FROM retrospectives
WHERE quality_score IS NOT NULL
GROUP BY period;
```

**Expected**: Quality scores increase after high-impact improvements

**3. Time-to-Resolution**
```sql
-- Measure time from improvement identified to applied
SELECT
  improvement_category,
  AVG(applied_at - created_at) as avg_time_to_apply
FROM protocol_improvement_queue
WHERE status = 'applied'
GROUP BY improvement_category;
```

**Goal**: Apply high-impact improvements within 1-2 SDs (1-2 weeks)

**4. Success Pattern Adoption**
```sql
-- Track how often success patterns are repeated
SELECT
  pattern,
  COUNT(*) as occurrence_count,
  AVG(quality_score) as avg_quality
FROM (
  SELECT
    jsonb_array_elements(success_stories)->>'pattern' as pattern,
    quality_score
  FROM retrospectives
  WHERE success_stories IS NOT NULL
) patterns
GROUP BY pattern
ORDER BY occurrence_count DESC;
```

**Expected**: Success patterns become more frequent after codified in protocol

### Validation Cycle

**Phase 1: Baseline (Improvement Applied)**
- Protocol section updated
- CLAUDE.md regenerated
- Effectiveness tracking begins
- Status: measuring

**Phase 2: Monitoring (Next 3-5 SDs)**
- Retrospectives analyzed for:
  - Did pain point recur?
  - Did quality scores improve?
  - Were there new related issues?
- Data collected in metrics above

**Phase 3: Validation (After 3-5 SDs)**
- Evidence review:
  - Pain point frequency reduced by ≥50%?
  - Quality scores increased by ≥5 points?
  - Zero recurrence of critical incidents?
- Decision:
  - **Validated**: Improvement proven effective (status: validated)
  - **Needs Refinement**: Partial improvement, additional changes needed
  - **Ineffective**: No measurable impact, consider rollback

**Phase 4: Continuous Monitoring**
- Validated improvements monitored indefinitely
- New pain points may emerge as system evolves
- Iterative refinement as needed

---

## Commands Reference

### Analysis Commands

**1. Analyze All Retrospectives for Patterns**
```bash
node scripts/analyze-retrospectives-for-protocol-improvements.mjs
```

**Output**:
- Top success patterns (by frequency)
- Top pain point categories (by frequency)
- High-impact process improvements
- Sub-agent enhancement recommendations
- Testing infrastructure learnings
- Recurring pain points (≥2 mentions)

**Use Case**: Quarterly protocol review, identify what needs improvement

---

**2. Apply Protocol Improvements from Retrospectives**
```bash
node scripts/add-protocol-improvements-from-retrospectives.mjs
```

**What It Does**:
- Updates specific `leo_protocol_sections` (EXEC Dual Test, 6-Step Checklist)
- Adds new protocol sections (Sub-Agent Auto-Trigger, User Story Mapping)
- Updates `leo_handoff_templates` (test evidence requirements)
- Displays success/failure summary

**Use Case**: After identifying high-impact improvements, apply them to protocol

---

**3. Apply Protocol Improvements Migration**
```bash
node scripts/apply-protocol-improvements-migration.js
```

**What It Does**:
- Adds `protocol_improvements` column to retrospectives table
- Adds check constraint and GIN index
- Creates helper function `get_all_protocol_improvements()`
- Creates view `v_protocol_improvements_analysis`

**Use Case**: One-time migration to enable protocol improvement tracking

---

**4. Regenerate CLAUDE.md from Database**
```bash
node scripts/generate-claude-md-from-db.js
```

**What It Does**:
- Pulls all protocol sections from database
- Generates CLAUDE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
- Updates router logic and context loading strategy

**Use Case**: After applying protocol improvements, regenerate context files

---

### Query Commands

**5. Get All Protocol Improvements (SQL)**
```sql
-- Get all improvements from last 30 days
SELECT * FROM get_all_protocol_improvements(CURRENT_DATE - INTERVAL '30 days');

-- Get specific category
SELECT *
FROM v_protocol_improvements_analysis
WHERE improvement_category = 'testing'
ORDER BY conducted_date DESC;

-- Count improvements by phase
SELECT affected_phase, COUNT(*) as count
FROM v_protocol_improvements_analysis
GROUP BY affected_phase;
```

---

### NPM Scripts (Proposed)

**If added to package.json**:
```json
{
  "scripts": {
    "protocol:analyze": "node scripts/analyze-retrospectives-for-protocol-improvements.mjs",
    "protocol:apply": "node scripts/add-protocol-improvements-from-retrospectives.mjs",
    "protocol:migrate": "node scripts/apply-protocol-improvements-migration.js",
    "protocol:effectiveness": "node scripts/measure-protocol-improvement-effectiveness.js"
  }
}
```

**Usage**:
```bash
npm run protocol:analyze      # Analyze retrospectives for patterns
npm run protocol:apply        # Apply high-impact improvements
npm run protocol:migrate      # One-time: Add protocol_improvements column
npm run protocol:effectiveness # Measure impact of applied improvements
```

---

## Database-First Enforcement

### Why Database-First Matters

**Problem**: File-based documentation (markdown) becomes stale, inconsistent, and hard to programmatically access.

**Solution**: Store all protocol content in database tables, generate files from database.

### Protocol Improvement Enforcement

**1. Retrospectives Must Have Improvements**
```sql
-- Trigger enforces protocol_improvements for PROCESS_IMPROVEMENT category
CREATE TRIGGER validate_protocol_improvements_trigger
  BEFORE INSERT OR UPDATE ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION validate_protocol_improvements_for_process_category();
```

**Effect**: Cannot create PROCESS_IMPROVEMENT retrospective without protocol_improvements

**2. Protocol Sections Are Versioned**
```sql
-- leo_protocol_sections table tracks all protocol content
SELECT * FROM leo_protocol_sections
WHERE protocol_id = 'leo-v4-3-3-ui-parity'
ORDER BY order_index;
```

**Effect**: All protocol changes logged with evidence, version history maintained

**3. CLAUDE.md Is Generated, Not Edited**
```bash
# Regenerate from database (auto-includes latest protocol improvements)
node scripts/generate-claude-md-from-db.js
```

**Effect**: Zero drift between database truth and AI context files

### Anti-Patterns (Violations)

**NEVER**:
- Edit CLAUDE.md directly (changes will be overwritten on next regeneration)
- Store protocol content in standalone markdown files (database is source of truth)
- Skip retrospective creation (loses improvement opportunity)
- Create PROCESS_IMPROVEMENT retrospective without protocol_improvements array

**ALWAYS**:
- Update `leo_protocol_sections` table for protocol changes
- Include `protocol_improvements` in retrospectives
- Regenerate CLAUDE.md after protocol updates
- Use database queries to analyze patterns

---

## Success Patterns (Evidence-Based)

### Pattern 1: Testing Enforcement

**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-002

**Problem**: Tests existed but weren't executed before marking SD complete → 30-minute gap, 67% E2E failure rate

**Improvement Applied**:
- EXEC Dual Test Requirement (MANDATORY)
- QA Engineering Director auto-trigger enforcement
- Handoff template requires test evidence
- Cannot create EXEC→PLAN handoff without passing tests

**Effectiveness**:
- **Before**: 3 incidents of "forgot to run tests" in 15 retrospectives (20%)
- **After**: 0 incidents in next 8 retrospectives (0%)
- **Time Saved**: 30 minutes per SD (no validation gap)
- **Quality Improvement**: Zero critical bugs slipped to PLAN phase

---

### Pattern 2: User Story Validation

**Evidence**: SD-EVA-MEETING-001, SD-AGENT-ADMIN-002

**Problem**: User stories created retroactively after implementation → can't verify requirements met

**Improvement Applied**:
- User Story E2E Test Mapping (MANDATORY)
- 100% coverage requirement (every US must have ≥1 E2E test)
- QA Director blocks handoff if coverage < 100%

**Effectiveness**:
- **Before**: 2 incidents of retroactive user story creation (13%)
- **After**: 0 incidents in next 6 retrospectives (0%)
- **Time Saved**: 1-2 hours per SD (no retroactive work)
- **Quality Improvement**: Explicit linkage between tests and requirements

---

### Pattern 3: Sub-Agent Orchestration

**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-001

**Problem**: Protocol says "trigger sub-agents" but wasn't enforced → manual intervention required

**Improvement Applied**:
- Sub-Agent Auto-Trigger Enforcement (MANDATORY)
- Handoff scripts verify QA execution before proceeding
- Manual override requires LEAD approval

**Effectiveness**:
- **Before**: 2 incidents of "QA sub-agent never triggered" (13%)
- **After**: 0 incidents in next 5 retrospectives (0%)
- **Automation**: 100% QA execution before handoffs
- **Compliance**: Zero "worked outside protocol" incidents

---

### Pattern 4: 6-Step SD Evaluation

**Evidence**: SD-EXPORT-001

**Problem**: 5-step checklist comprehensive but missing testing validation

**Improvement Applied**:
- Added Step 6: "Execute QA Smoke Tests"
- Database query for test evidence
- Cannot approve SD without passing tests

**Effectiveness**:
- **Before**: Testing optional in SD evaluation (implicit)
- **After**: Testing MANDATORY in SD evaluation (explicit)
- **Gate Pass Rate**: 85% (SDs blocked until tests run)
- **Quality Improvement**: Zero SDs approved without test evidence

---

## Related Documentation

**Retrospective Creation**:
- `database/migrations/20251204_add_protocol_improvements_to_retrospectives.sql` - Schema definition
- `scripts/handoff.js` - Automated retrospective creation on handoffs

**Analysis Scripts**:
- `scripts/analyze-retrospectives-for-protocol-improvements.mjs` - Pattern detection
- `scripts/add-protocol-improvements-from-retrospectives.mjs` - Apply improvements

**Protocol Management**:
- `scripts/generate-claude-md-from-db.js` - Regenerate context files
- `database/schema/007_leo_protocol_schema_fixed.sql` - Protocol tables schema

**Views & Functions**:
- `get_all_protocol_improvements(since_date)` - Extract improvements from retrospectives
- `v_protocol_improvements_analysis` - Flattened view for reporting

---

## Quick Start Guide

**1. Create Retrospective with Protocol Improvements**
```javascript
// In retrospective creation script
const retrospective = {
  sd_id: 'SD-XXX',
  learning_category: 'PROCESS_IMPROVEMENT',
  protocol_improvements: [
    {
      category: 'testing',
      improvement: 'Add pre-commit hook for E2E test execution',
      evidence: 'SD-XXX: Tests passed locally but failed in CI',
      impact: 'Prevents CI failures, saves 10 minutes per push',
      affected_phase: 'EXEC'
    }
  ],
  // ... other retrospective fields
};
```

**2. Analyze for Patterns (Monthly)**
```bash
node scripts/analyze-retrospectives-for-protocol-improvements.mjs
```

**3. Apply High-Impact Improvements (As Needed)**
```bash
node scripts/add-protocol-improvements-from-retrospectives.mjs
```

**4. Regenerate Context Files**
```bash
node scripts/generate-claude-md-from-db.js
```

**5. Measure Effectiveness (Quarterly)**
```sql
-- Query pain point trends
SELECT
  DATE_TRUNC('month', conducted_date) as month,
  COUNT(*) FILTER (WHERE pain_points::text LIKE '%your-theme%') as mentions
FROM retrospectives
GROUP BY month
ORDER BY month DESC;
```

---

## Future Enhancements

**1. Protocol Improvement Queue Table**
- Track improvement lifecycle (pending → applied → validated)
- Priority scoring based on evidence count and impact
- Automated effectiveness measurement

**2. AI-Powered Extraction**
- LLM analyzes retrospective narrative text
- Auto-generates `protocol_improvements` array
- Reduces manual effort in retrospective creation

**3. Real-Time Alerts**
- Trigger alerts when pain point threshold reached (≥2 mentions)
- Slack/email notifications for critical improvements
- Dashboard for protocol health metrics

**4. A/B Testing for Improvements**
- Apply improvement to subset of SDs
- Measure effectiveness vs control group
- Validate before full rollout

**5. Cross-Project Learning**
- Share protocol improvements across projects
- Centralized improvement repository
- Community voting on high-impact patterns

---

## FAQ

**Q: How often should we run the analysis script?**
A: Monthly or after every 5-10 completed SDs. More frequent if experiencing recurring issues.

**Q: What if an improvement doesn't work?**
A: Track effectiveness metrics for 3-5 SDs. If no measurable impact, refine or roll back. Document learning in retrospective.

**Q: Can improvements be rolled back?**
A: Yes. Update `leo_protocol_sections` to previous version, regenerate CLAUDE.md. Consider why improvement failed.

**Q: Who approves protocol improvements?**
A: High-impact (≥3 mentions, critical severity) auto-apply. Medium-impact need LEAD review. Low-impact monitored for recurrence.

**Q: How do we measure effectiveness?**
A: Track pain point frequency, quality scores, time-to-resolution, and success pattern adoption over subsequent retrospectives.

**Q: What if improvements conflict?**
A: Prioritize by impact and evidence count. Test in isolation before combining. Document trade-offs in protocol section.

---

**Last Updated**: 2025-12-10
**Related SD**: SD-LEO-LEARN-001 (Proactive Learning Integration)
**Evidence Base**: 74+ retrospectives analyzed
**System Status**: Active and continuously improving
