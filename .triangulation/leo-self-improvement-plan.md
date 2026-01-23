# LEO Maintains LEO — Self-Improvement Loop Design

**Status**: TRIANGULATION COMPLETE — Ready for Implementation
**Constraint**: No self-approval loops; high-impact changes require human approval
**Triangulation**: AntiGravity reviewed (4.5/5 confidence) — Design validated with modifications

---

## TRIANGULATION SUMMARY (2026-01-22)

**External Review**: AntiGravity
**Verdict**: "Audacious but Fragile" — Architecture sound, safeguards need hardening

### Critical Changes Required (from triangulation):

| Issue | Original Design | Required Change |
|-------|-----------------|-----------------|
| AUTO threshold too low | 70% | **95%** + deterministic check |
| Probabilistic safety | AI score only | Add **AST/semantic parsing** |
| No velocity limit | Unbounded | **Max 3 AUTO changes per 24h** |
| Linear decay math | Can go negative | **Multiplicative decay** with floor |
| No cooldown | Immediate apply | **1-hour staging** before AUTO |
| Missing traceability | Rules unlinked | **Chesterton's Fence** (link to retro_id) |
| Shared model bias | Same LLM family | Use **different model families** |

### Additional Constitution Rules (from triangulation):

- CONST-006: Complexity Conservation (zero-sum rule additions)
- CONST-007: Velocity Limit (max 3 AUTO/day)
- CONST-008: Chesterton's Fence (no removal without origin)
- CONST-009: Emergency Freeze (human STOP command)

### Revised Rollout (from triangulation):

Phase 5 now includes "WOULD AUTO APPLY" prediction testing before enabling real auto-apply. Full autonomy only after 100 correct predictions.

*Full triangulation results: `.triangulation/leo-self-improvement-triangulation-results.md`*

---

## 1. CODEBASE EVIDENCE PACK

### What Already Exists (WORKS)

| Component | Table/File | Data Volume | Status |
|-----------|------------|-------------|--------|
| **Outcome Capture** | `sub_agent_execution_results` | 10,380+ rows | WORKS - verdicts, confidence, timing |
| **Retrospectives** | `retrospectives` | 466 rows | WORKS - quality scores, patterns, improvements |
| **Protocol Versioning** | `leo_protocols` | 3+ versions | WORKS - supersession chain intact |
| **Protocol Sections** | `leo_protocol_sections` | Modular | WORKS - database-first storage |
| **Improvement Queue** | `protocol_improvement_queue` | 40+ items | WORKS - extraction + consolidation |
| **Audit Log** | `protocol_improvement_audit_log` | Active | WORKS - full trace |
| **CLAUDE.md Generation** | `generate-claude-md-from-db.js` | Automated | WORKS - regenerates from DB |

### Key File Paths

**Schema & Tables**:
- `database/schema/007_leo_protocol_schema_fixed.sql` — leo_protocols, leo_protocol_sections, leo_protocol_changes
- `database/migrations/20251210_retrospective_self_improvement_system.sql` — protocol_improvement_queue, extraction trigger

**Improvement Pipeline**:
- `scripts/modules/protocol-improvements/ImprovementExtractor.js` — parses retrospectives
- `scripts/modules/protocol-improvements/ImprovementApplicator.js` — applies to database
- `scripts/modules/protocol-improvements/EffectivenessTracker.js` — measures impact
- `scripts/protocol-improvements.js` — CLI (list, review, approve, apply)

**CLAUDE.md Generation**:
- `scripts/generate-claude-md-from-db.js` — master script
- `scripts/modules/claude-md-generator/` — modular V3 system

### Current Workflow (Already Implemented)

```
Retrospective.protocol_improvements (JSONB)
    ↓ trigger: extract_protocol_improvements_from_retro()
protocol_improvement_queue (status: PENDING)
    ↓ manual review
    ↓ node scripts/protocol-improvements.js approve <id>
protocol_improvement_queue (status: APPROVED)
    ↓ node scripts/protocol-improvements.js apply <id>
Target table updated (leo_validation_rules, leo_protocol_sections, etc.)
    ↓
node scripts/generate-claude-md-from-db.js
    ↓
CLAUDE.md files regenerated
```

### What's Missing (GAPS for Self-Improvement Loop)

| Gap | Current State | Needed For Loop |
|-----|---------------|-----------------|
| **AI Quality Scoring** | None | Score improvements 0-100 before human review |
| **Risk Tier Classification** | `auto_applicable` boolean only | 4-tier taxonomy (immutable → cosmetic) |
| **Separation of Duties** | Same system extracts + queues | Proposer ≠ Evaluator ≠ Approver |
| **Canary/Shadow Mode** | None | Test changes on subset before global |
| **Rot Rate Detection** | None | Flag unused rules for removal |
| **Constitution File** | None | Immutable rules that can never change |
| **Effectiveness Automation** | Field exists, not computed | Auto-measure post-application impact |
| **Rollback Mechanism** | Manual | Automated revert if metrics degrade |

---

## 2. MINIMAL SELF-IMPROVEMENT ARCHITECTURE (Incremental)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEO SELF-IMPROVEMENT LOOP                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ OBSERVE  │───▶│ DIAGNOSE │───▶│ PROPOSE  │───▶│  REVIEW  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │                                                │         │
│       │          ┌──────────┐    ┌──────────┐         │         │
│       │          │  SHIP    │◀───│  GATE    │◀────────┘         │
│       │          │(version) │    │(approve) │                   │
│       │          └──────────┘    └──────────┘                   │
│       │               │                                          │
│       └───────────────┴──────── feedback ───────────────────────┘
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

SEPARATION OF DUTIES:
- Proposer: ImprovementExtractor (existing) + Pattern Analyzer
- Evaluator: AI Quality Judge (NEW - different prompt/model)
- Approver: Human (high-risk) or Automated (cosmetic only)
```

### Proposed Data Model Additions

**1. Risk Tier Classification** (new column on `protocol_improvement_queue`):
```sql
ALTER TABLE protocol_improvement_queue
ADD COLUMN risk_tier VARCHAR(20) CHECK (risk_tier IN (
  'TIER_0_IMMUTABLE',   -- Cannot change, ever
  'TIER_1_STRUCTURAL',  -- Routing, validation logic, gates
  'TIER_2_BEHAVIORAL',  -- Prompts, rubrics, checklists
  'TIER_3_COSMETIC'     -- Formatting, typos, documentation
));
```

**2. AI Quality Assessment** (new table):
```sql
CREATE TABLE improvement_quality_assessments (
  id UUID PRIMARY KEY,
  improvement_id UUID REFERENCES protocol_improvement_queue(id),
  evaluator_model VARCHAR(50),   -- e.g., 'gpt-4o-mini', 'claude-sonnet'
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  criteria_scores JSONB,         -- { specificity: 18, necessity: 15, ... }
  recommendation VARCHAR(20),    -- 'APPROVE', 'REJECT', 'REVISE', 'ESCALATE'
  reasoning TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**3. Constitution File** (new table):
```sql
CREATE TABLE protocol_constitution (
  id UUID PRIMARY KEY,
  rule_code VARCHAR(50) UNIQUE,  -- e.g., 'CONST-001'
  rule_text TEXT NOT NULL,
  category VARCHAR(50),          -- 'safety', 'governance', 'audit'
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- NO updated_at, NO superseded_by — truly immutable
  CONSTRAINT no_delete CHECK (true)  -- RLS prevents DELETE
);
```

**4. Effectiveness Tracking** (enhance existing):
```sql
ALTER TABLE protocol_improvement_queue
ADD COLUMN effectiveness_measured_at TIMESTAMPTZ,
ADD COLUMN baseline_metric JSONB,    -- Metric before change
ADD COLUMN post_metric JSONB,        -- Metric after change
ADD COLUMN rollback_reason TEXT;     -- If reverted, why
```

### Process Steps

| Step | Actor | Input | Output | Gate |
|------|-------|-------|--------|------|
| **OBSERVE** | System | Retrospectives, execution results | Patterns, anomalies | Auto |
| **DIAGNOSE** | Pattern Analyzer | Patterns | Root causes, improvement candidates | Auto |
| **PROPOSE** | ImprovementExtractor | Candidates | `protocol_improvement_queue` entries | Auto |
| **EVALUATE** | AI Quality Judge | Queue entries | Scores, recommendations | Auto |
| **CLASSIFY** | Risk Classifier | Scored entries | Risk tier assignment | Auto |
| **GATE** | Human or Auto | Classified entries | APPROVED or REJECTED | Tier-based |
| **SHIP** | ImprovementApplicator | Approved entries | Database updates, version bump | Auto |
| **VERIFY** | EffectivenessTracker | Applied changes | Effectiveness score, rollback if needed | Auto |

### Governance Gates by Risk Tier (Updated per Triangulation)

| Tier | Examples | AI Score Threshold | Human Required | Auto-Rollback |
|------|----------|-------------------|----------------|---------------|
| **IMMUTABLE** | Safety constraints, audit requirements | N/A | ALWAYS + Chairman | N/A (immutable) |
| **GOVERNED** | Routing logic, validation gates, handoff rules | 95+ | YES | Within 24h |
| **AUTO** | Typos, formatting, documentation | **95%** + deterministic check | NO (1-hour cooldown) | Within 7d |

**AUTO Tier Hardening** (from AntiGravity triangulation):
1. Threshold raised: 70% → **95%**
2. **Deterministic check required**: AST/semantic parsing must prove no logic change
3. **1-hour cooldown**: Changes sit in "Staging" state before apply
4. **Velocity limit**: Max 3 AUTO changes per 24-hour cycle
5. **First 3 months**: "WOULD AUTO APPLY" classification only, no actual auto-apply

### Versioning Strategy

**Protocol Version Bump Rules**:
- TIER_1 change applied → MINOR version bump (4.3.3 → 4.4.0)
- TIER_2 change applied → PATCH version bump (4.3.3 → 4.3.4)
- TIER_3 change applied → No version bump (cosmetic)
- Multiple changes batched → Single bump at end of day

**Rollback Mechanism**:
```
If effectiveness_score < 50 within rollback_window:
  1. Revert target_table to previous state (using payload inverse)
  2. Mark improvement as ROLLED_BACK with reason
  3. Log to audit_log with severity=WARNING
  4. Notify human for TIER_1/TIER_2
```

---

## 3. DESIGN CHOICES — MCQ RESPONSES

### MCQ #1: Improvement Targets
**Question**: What should the self-improvement loop be allowed to modify?
**Answer**: ALL FOUR CATEGORIES
- ✅ Prompts & Documentation (safest)
- ✅ Rubrics & Checklists (medium risk)
- ✅ Routing & Triggers (higher risk)
- ✅ Gates & Enforcement (highest risk)

**Implication**: Full scope requires robust risk tiering and governance gates. No category is off-limits, but higher-risk changes need stricter approval.

### MCQ #2: Risk Tier Taxonomy
**Question**: How should risk tiers be structured?
**Answer**: 3 TIERS

| Tier | Name | Approval | Examples |
|------|------|----------|----------|
| **TIER_0** | IMMUTABLE | Never changes | Safety constraints, audit requirements, core governance |
| **TIER_1** | GOVERNED | Human approval required | Gates, routing, validation logic, structural changes |
| **TIER_2** | AUTO | Auto-apply if AI score ≥ threshold | Typos, formatting, documentation, cosmetic prompts |

**Implication**: Need to define exactly what falls into each tier. GOVERNED tier is the "middle ground" where AI scores inform but humans decide.

### MCQ #3: Separation of Duties
**Question**: For GOVERNED tier changes, who/what should approve?
**Answer**: HUMAN ONLY

| Tier | Proposer | Evaluator | Approver |
|------|----------|-----------|----------|
| **IMMUTABLE** | N/A | N/A | Cannot be proposed |
| **GOVERNED** | ImprovementExtractor | AI Quality Judge (scores 0-100) | Human (informed by AI score) |
| **AUTO** | ImprovementExtractor | AI Quality Judge | Auto if score ≥ threshold |

**Implication**: AI provides recommendations but never has final authority for GOVERNED changes. This prevents self-approval loops.

### MCQ #4: Evidence Requirements
**Question**: What evidence threshold should be required before proposing a change?
**Answer**: INTELLIGENT EVIDENCE SYSTEM (not just occurrence count)

**Problem Identified**: Occurrence counts don't decay. Patterns sit in queue even after root cause is fixed elsewhere.

**Proposed Hybrid Approach** (automated):

```
-- ORIGINAL (flawed - can go negative):
-- evidence_score = (occurrence_count * recency_weight) - time_decay

-- REVISED (per AntiGravity triangulation - multiplicative decay with floor):
evidence_score = MAX(
  (occurrence_count * severity_multiplier) * (0.95 ^ days_since_last_occurrence),
  min_floor[severity]  -- Critical events never fully decay
)

-- Severity floors:
-- CRITICAL: min_floor = 10 (never forgotten)
-- HIGH: min_floor = 5
-- MEDIUM: min_floor = 2
-- LOW: min_floor = 0

IF evidence_score < threshold → STALE (archive)
IF evidence_score >= threshold AND no_new_occurrences_30d → POTENTIALLY_RESOLVED (flag)
IF evidence_score >= threshold AND recent_occurrences → ACTIVE (propose)
```

**Key insight from triangulation**: Linear subtraction can zero out periodic catastrophic risks. Multiplicative decay ensures severe events never truly disappear.

**Resolution Detection** (automated signals):
1. **Recency decay**: Weight occurrences by age (newer = higher)
2. **Post-improvement tracking**: If improvement applied and recurrence drops, mark pattern resolved
3. **SD-completion correlation**: If SD completes that mentions pattern keywords, flag for auto-check
4. **Staleness threshold**: If no activity for 90 days, auto-archive

**New Table Needed**: `pattern_resolution_signals`
```sql
CREATE TABLE pattern_resolution_signals (
  id UUID PRIMARY KEY,
  pattern_id UUID REFERENCES issue_patterns(id),
  signal_type VARCHAR(50),  -- 'sd_completion', 'improvement_applied', 'no_recurrence', 'manual'
  signal_source TEXT,       -- SD ID, improvement ID, or 'system'
  confidence DECIMAL(3,2),  -- 0.00-1.00
  detected_at TIMESTAMPTZ DEFAULT NOW()
);
```

### MCQ #5: Rollout Strategy
**Question**: How should approved changes be rolled out?
**Answer**: DIRECT APPLY

- Apply immediately to target table
- Regenerate CLAUDE.md files
- Rely on effectiveness tracking + rollback if metrics degrade
- No shadow/canary complexity

**Rollback Window by Tier**:
| Tier | Auto-Rollback Window | Trigger |
|------|---------------------|---------|
| GOVERNED | 72 hours | effectiveness_score < 50 OR human request |
| AUTO | 7 days | effectiveness_score < 50 |

### MCQ #6: Data Retention
**Question**: How long should learning data be retained for pattern analysis?
**Answer**: 30 DAYS (Aggressive)

- Active window: 30 days for pattern weight calculation
- Archived data: Move to cold storage after 30 days (queryable but not in hot path)
- Implication: System adapts quickly but may miss slow-burn issues
- Mitigation: Severity multiplier ensures critical issues don't decay too fast

### MCQ #7: Drift Prevention (Revised)
**Question**: How should the system prevent checklist/protocol bloat over time?
**Answer**: MULTI-PRONGED APPROACH

**Three concerns to address**:
1. Context window limits (measurable)
2. Contradictory rules (semantic)
3. Noise drowns signal (prioritization)

**Solution: Three-Layer Anti-Bloat System**

**Layer 1: Token Budget Cap** (addresses context limits)
```sql
-- Track protocol size
CREATE VIEW v_protocol_size AS
SELECT
  SUM(LENGTH(content)) as total_chars,
  SUM(LENGTH(content)) / 4 as approx_tokens  -- rough estimate
FROM leo_protocol_sections
WHERE active = true;

-- Alert if approaching limit (e.g., 80% of 20k tokens)
```
- Hard cap: 20,000 tokens for CLAUDE.md total
- Warning at 80%: new additions require consolidation proposal
- At 100%: block additions until something removed

**Layer 2: Semantic Conflict Detection** (addresses contradictions)
- When adding new rule: AI evaluator checks for conflicts with existing rules
- Prompt: "Does this new rule contradict or duplicate any existing rules in [section]?"
- If conflict detected: GOVERNED tier (human reviews both rules)

**Layer 3: Priority Hierarchy** (addresses noise vs signal)
```sql
ALTER TABLE leo_protocol_sections
ADD COLUMN priority VARCHAR(20) DEFAULT 'STANDARD'
  CHECK (priority IN ('CORE', 'STANDARD', 'SITUATIONAL'));
```
- **CORE**: Always loaded, never removed (constitution-level)
- **STANDARD**: Normal rules, subject to review
- **SITUATIONAL**: Context-dependent, first candidates for consolidation

**Domain Activity Tracking** (alternative to usage tracking):
```sql
-- Track which domains are active based on SD work
CREATE VIEW v_domain_activity AS
SELECT
  ps.section_type as domain,
  COUNT(DISTINCT sd.id) as sds_in_domain_30d,
  MAX(sd.updated_at) as last_sd_activity
FROM leo_protocol_sections ps
LEFT JOIN strategic_directives_v2 sd
  ON sd.category ILIKE '%' || ps.section_type || '%'
  AND sd.updated_at > NOW() - INTERVAL '30 days'
GROUP BY ps.section_type;

-- Sections with no related SD activity in 90 days → review candidates
```

**Weekly Maintenance Job**:
1. Check token budget → warn if > 80%
2. Identify SITUATIONAL rules in dormant domains → flag for review
3. Generate consolidation suggestions for similar rules
4. Human reviews flagged items

---

## 4. DECISION SUMMARY

| Question | Decision |
|----------|----------|
| Improvement Targets | ALL (prompts, rubrics, routing, gates) |
| Risk Tiers | 3 tiers: IMMUTABLE / GOVERNED / AUTO |
| Approval Model | Human-only for GOVERNED; AI scores but doesn't approve |
| Evidence System | Intelligent (recency-weighted, decay, auto-resolution detection) |
| Rollout Strategy | Direct apply with rollback |
| Data Retention | 30 days active window |
| Drift Prevention | **Multi-pronged**: Token budget + Semantic conflict detection + Priority hierarchy + Domain activity tracking |

---

## 5. FINAL IMPLEMENTATION PLAN

### Phase 0: Foundation (Week 1)
**Goal**: Add infrastructure without changing existing behavior

**Database Changes**:
```sql
-- 1. Risk tier on improvement queue
ALTER TABLE protocol_improvement_queue
ADD COLUMN risk_tier VARCHAR(20) DEFAULT 'GOVERNED'
  CHECK (risk_tier IN ('IMMUTABLE', 'GOVERNED', 'AUTO'));

-- 2. AI quality assessment table
CREATE TABLE improvement_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID REFERENCES protocol_improvement_queue(id),
  evaluator_model VARCHAR(50),
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  criteria_scores JSONB,
  recommendation VARCHAR(20),
  reasoning TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Priority hierarchy on sections
ALTER TABLE leo_protocol_sections
ADD COLUMN priority VARCHAR(20) DEFAULT 'STANDARD'
  CHECK (priority IN ('CORE', 'STANDARD', 'SITUATIONAL'));

-- 4. Pattern resolution signals
CREATE TABLE pattern_resolution_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id VARCHAR(50),
  signal_type VARCHAR(50),
  signal_source TEXT,
  confidence DECIMAL(3,2),
  detected_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files to Create/Modify**:
- `database/migrations/YYYYMMDD_self_improvement_foundation.sql`
- `scripts/modules/protocol-improvements/RiskClassifier.js` (new)
- `scripts/modules/protocol-improvements/AIQualityJudge.js` (new)

### Phase 1: AI Evaluation (Week 2)
**Goal**: Add AI scoring to improvement pipeline

**New Module**: `AIQualityJudge.js`
- Separate prompt from ImprovementExtractor (different "persona")
- Uses rubric defined in Section 10
- Returns: score 0-100, recommendation, reasoning
- Stores result in `improvement_quality_assessments`

**Integration Point**: After extraction, before human review
```
Extract → AI Judge scores → Queue with score visible → Human reviews
```

### Phase 2: Risk Classification (Week 3)
**Goal**: Auto-classify improvements by risk tier

**Classification Rules**:
| Target Table | Default Tier |
|--------------|--------------|
| leo_protocol_sections (CORE priority) | IMMUTABLE |
| leo_validation_rules | GOVERNED |
| leo_sub_agent_triggers | GOVERNED |
| leo_protocol_sections (STANDARD) | GOVERNED |
| leo_protocol_sections (SITUATIONAL) | AUTO |
| Typo/formatting changes | AUTO |

**File**: `scripts/modules/protocol-improvements/RiskClassifier.js`

### Phase 3: AUTO Classification (Week 4) — NO AUTO-APPLY YET
**Goal**: Enable AUTO classification but **do not auto-apply** (per triangulation)

**Logic**:
```javascript
// Phase 3: Classification only
if (improvement.risk_tier === 'AUTO' && improvement.ai_score >= 95) {
  // Run deterministic check (AST/semantic parsing)
  const logicChanged = await checkForLogicChanges(improvement);

  if (!logicChanged) {
    // Flag as "WOULD AUTO APPLY" but DO NOT apply
    await markAsWouldAutoApply(improvement.id);
    await logToAudit('WOULD_AUTO_APPLY', improvement.id);
  } else {
    // Escalate to GOVERNED
    await escalateToGoverned(improvement.id, 'Logic change detected');
  }
} else {
  await queueForHumanReview(improvement.id);
}
```

**Safety (from triangulation)**:
- **No actual auto-apply** in Phase 3
- Review "WOULD AUTO APPLY" predictions weekly
- Track prediction accuracy
- Proceed to Phase 6 only after 100 correct predictions

### Phase 4: Intelligent Evidence System (Week 5)
**Goal**: Replace simple occurrence count with weighted scoring

**Evidence Score Formula**:
```javascript
const evidenceScore =
  (occurrenceCount * recencyWeight(daysSinceLastOccurrence)) +
  (severityMultiplier[severity]) -
  (daysSinceLastOccurrence / 30 * DECAY_FACTOR);

// Auto-archive if score < STALE_THRESHOLD
// Flag for resolution check if no occurrences in 30d but score still high
```

**Resolution Detection**:
- When SD completes, check if any patterns match keywords → add resolution signal
- After improvement applied, track if related pattern recurrence drops → auto-resolve

### Phase 5: Anti-Bloat System (Week 6)
**Goal**: Implement three-layer drift prevention

**Components**:
1. Token budget view + warning trigger
2. Conflict detection in AI Judge prompt
3. Priority assignment for new sections
4. Domain activity tracking view
5. Weekly maintenance job
6. **Chesterton's Fence**: Link every rule to original retro_id

### Phase 6: Full Autonomy (Week 8+) — GATED
**Goal**: Enable actual AUTO-tier auto-apply

**Prerequisites** (all must be met):
1. 100+ "WOULD AUTO APPLY" predictions logged
2. Prediction accuracy ≥ 95% (human agrees with prediction)
3. Zero false positives on logic changes
4. Emergency freeze mechanism tested

**Logic** (only after prerequisites met):
```javascript
if (improvement.risk_tier === 'AUTO' &&
    improvement.ai_score >= 95 &&
    !await checkForLogicChanges(improvement) &&
    await checkVelocityLimit()) {  // Max 3 per day

  // 1-hour cooldown in staging
  await moveToStaging(improvement.id);
  await scheduleApply(improvement.id, { delayHours: 1 });

  // After cooldown, apply
  await applyImprovement(improvement.id);
  await logToAudit('AUTO_APPLIED', improvement.id);
}
```

---

## 6. FILES TO MODIFY

| File | Change |
|------|--------|
| `database/migrations/YYYYMMDD_*.sql` | New tables and columns |
| `scripts/modules/protocol-improvements/index.js` | Export new modules |
| `scripts/modules/protocol-improvements/RiskClassifier.js` | NEW |
| `scripts/modules/protocol-improvements/AIQualityJudge.js` | NEW - use different model family from extractor |
| `scripts/modules/protocol-improvements/EvidenceScorer.js` | NEW - multiplicative decay formula |
| `scripts/modules/protocol-improvements/DeterministicChecker.js` | **NEW (from triangulation)** - AST/semantic parsing |
| `scripts/modules/protocol-improvements/VelocityLimiter.js` | **NEW (from triangulation)** - max 3 AUTO/day |
| `scripts/modules/protocol-improvements/EmergencyFreeze.js` | **NEW (from triangulation)** - FREEZE command |
| `scripts/modules/protocol-improvements/ImprovementApplicator.js` | Add staging + cooldown logic |
| `scripts/protocol-improvements.js` | CLI updates for new features |
| `scripts/generate-claude-md-from-db.js` | Add token count reporting + retro_id linking |

---

## 7. VERIFICATION & VALIDATION FRAMEWORK

### 7.1 Pre-Flight Checks (Before Each Phase Goes Live)

**Phase 0 Pre-Flight**:
- [ ] All new tables created and accessible
- [ ] Foreign key constraints verified
- [ ] RLS policies applied (especially DELETE prevention on constitution)
- [ ] Existing `protocol_improvement_queue` data migrated with `risk_tier = 'GOVERNED'`

**Phase 1 Pre-Flight (AI Evaluation)**:
- [ ] AIQualityJudge uses **different model** than ImprovementExtractor (verify model config)
- [ ] Scoring rubric documented and reviewed by human
- [ ] 10 sample improvements manually scored to calibrate AI vs human agreement
- [ ] Score distribution logged for baseline

**Phase 2 Pre-Flight (Risk Classification)**:
- [ ] Classification rules documented in code comments
- [ ] 20 historical improvements manually classified → compare to RiskClassifier output
- [ ] No CORE/IMMUTABLE changes ever get classified as AUTO

**Phase 3 Pre-Flight (AUTO Classification)**:
- [ ] DeterministicChecker tested against 10 known "semantic changes disguised as typos"
- [ ] False positive rate measured (blocks valid typo fixes)
- [ ] False negative rate measured (allows logic changes through)
- [ ] VelocityLimiter tested with 5 rapid-fire AUTO submissions

**Phase 6 Pre-Flight (Full Autonomy)**:
- [ ] 100+ "WOULD AUTO APPLY" predictions logged
- [ ] Human review of predictions shows ≥95% agreement
- [ ] Zero false negatives on logic-change detection
- [ ] Emergency freeze tested and documented

---

### 7.2 Runtime Validations (Continuous Checks)

**Every Improvement Proposal**:
```javascript
// Validation chain - all must pass before queuing
const validations = [
  checkNotImmutableTarget(improvement),      // Cannot target CORE/constitution
  checkHasRetroId(improvement),              // Must link to source retrospective
  checkNotDuplicate(improvement),            // No duplicate proposals
  checkTokenBudgetAvailable(improvement),    // Room in context budget
];

// If any fail → REJECTED with reason logged
```

**Every AUTO Classification**:
```javascript
// Additional checks for AUTO tier
const autoValidations = [
  checkAIScore >= 95,                        // Threshold met
  checkDeterministicNoLogicChange(),         // AST/semantic check passed
  checkVelocityLimitNotExceeded(),           // < 3 today
  checkNotFrozen(),                          // Emergency freeze not active
  checkCooldownComplete(),                   // 1-hour staging elapsed
];

// If any fail → Escalate to GOVERNED
```

**Every Applied Change**:
```javascript
// Post-apply validations
const postApplyChecks = [
  logBaselineMetrics(),                      // Capture pre-change state
  scheduleEffectivenessCheck(72h),           // Queue follow-up
  verifyAuditLogEntry(),                     // Audit trail created
  verifyRollbackPayloadStored(),             // Can revert if needed
];
```

---

### 7.3 Audit Checks (Periodic Reviews)

**Daily Automated Checks**:
| Check | Query | Alert If |
|-------|-------|----------|
| AUTO velocity | `SELECT COUNT(*) WHERE status='AUTO_APPLIED' AND created_at > NOW() - '24h'` | > 3 |
| Orphan rules | `SELECT * FROM leo_protocol_sections WHERE source_retro_id IS NULL` | Any exist |
| Token budget | `SELECT approx_tokens FROM v_protocol_size` | > 16,000 (80%) |
| Frozen state | `SELECT frozen_at FROM protocol_freeze_status` | Frozen > 24h without human action |

**Weekly Human Review**:
- [ ] Review all "WOULD AUTO APPLY" predictions from past week
- [ ] Spot-check 5 GOVERNED approvals for appropriateness
- [ ] Review any escalated AUTO → GOVERNED items
- [ ] Check for evidence score drift (patterns going stale)

**Monthly Governance Review**:
- [ ] Constitution rules still appropriate?
- [ ] Threshold values (95%, 3/day) still appropriate?
- [ ] Model family separation still enforced?
- [ ] Overall protocol health (size, complexity, effectiveness)

---

### 7.4 Specific Test Cases (With Expected Outcomes)

**Test Case 1: "Formatting Trojan Horse"**
```
Input: Improvement claiming "typo fix" that changes "NOT" to ""
Expected: DeterministicChecker detects logic change
Expected: Escalated to GOVERNED tier
Expected: Audit log shows "ESCALATED: Logic change detected"
Failure Mode: If this gets AUTO classification, deterministic check is broken
```

**Test Case 2: Velocity Limit Enforcement**
```
Input: Submit 4 AUTO-eligible improvements in 10 minutes
Expected: First 3 classified as AUTO
Expected: 4th blocked with "VELOCITY_LIMIT_EXCEEDED"
Expected: 4th queued for next 24h window or escalated to GOVERNED
Failure Mode: If 4th applies, velocity limiter is broken
```

**Test Case 3: Chesterton's Fence**
```
Input: Try to remove a rule via Anti-Bloat maintenance
Expected: System queries for source_retro_id
Expected: If missing, block removal with "CHESTERTON_FENCE_VIOLATION"
Expected: If present, show original context before removal decision
Failure Mode: If rule removed without context, traceability is broken
```

**Test Case 4: Emergency Freeze**
```
Input: Run `node scripts/protocol-improvements.js freeze`
Expected: All pending AUTO items moved to FROZEN state
Expected: New AUTO classifications blocked
Expected: GOVERNED items still processed normally
Expected: Human notified of freeze activation
Failure Mode: If AUTO processing continues, freeze is broken
```

**Test Case 5: Rollback Verification**
```
Input: Apply improvement, then trigger rollback
Expected: Target table reverted to pre-change state
Expected: Improvement status set to "ROLLED_BACK"
Expected: Audit log shows rollback with reason
Expected: CLAUDE.md regenerated from reverted state
Failure Mode: If reversion incomplete, rollback mechanism is broken
```

**Test Case 6: Evidence Decay Floor**
```
Input: CRITICAL severity pattern with 0 occurrences for 90 days
Expected: evidence_score >= 10 (min_floor for CRITICAL)
Expected: Pattern NOT archived (floor prevents full decay)
Expected: Pattern flagged as "POTENTIALLY_RESOLVED" for human review
Failure Mode: If score = 0, critical events can be forgotten
```

---

### 7.5 Validation CLI Commands

```bash
# Pre-flight validation for a phase
node scripts/protocol-improvements.js validate-phase --phase=1

# Run all test cases
node scripts/protocol-improvements.js run-test-suite

# Check specific validation
node scripts/protocol-improvements.js check-deterministic --id=<improvement_id>
node scripts/protocol-improvements.js check-velocity
node scripts/protocol-improvements.js check-token-budget
node scripts/protocol-improvements.js check-chesterton --id=<rule_id>

# Audit report
node scripts/protocol-improvements.js audit-report --period=weekly

# View queue with scores and validation status
node scripts/protocol-improvements.js list --show-scores --show-validations

# Evaluate pending improvements
node scripts/protocol-improvements.js evaluate-all

# Test auto-apply classification (no actual apply)
node scripts/protocol-improvements.js classify-auto --dry-run

# Emergency freeze
node scripts/protocol-improvements.js freeze

# View prediction accuracy (Phase 5+)
node scripts/protocol-improvements.js prediction-accuracy
```

---

### 7.6 Rollback Triggers

**Automatic Rollback Conditions**:
| Condition | Detection | Action |
|-----------|-----------|--------|
| effectiveness_score < 50 | Scheduled check at 24h/72h/7d | Auto-rollback + notify human |
| Related pattern recurrence spike | > 3x baseline in 48h | Flag for human review |
| Human veto | Manual command | Immediate rollback |
| Test suite failure | CI/CD hook | Block deployment + notify |

**Rollback Procedure**:
1. Retrieve `rollback_payload` from `protocol_improvement_audit_log`
2. Apply inverse operation to target table
3. Mark improvement as `ROLLED_BACK` with reason
4. Regenerate CLAUDE.md files
5. Notify human with rollback summary
6. Log to audit trail with `severity=WARNING`

---

## 8. CONSTITUTION FILE (Seed Rules)

These rules are IMMUTABLE — the system cannot propose changes to them:

```sql
INSERT INTO leo_protocol_sections (section_type, title, content, priority) VALUES
-- Original 5 rules
('constitution', 'CONST-001: Human Approval Required',
 'All GOVERNED tier changes require human approval. AI scores inform but never decide.', 'CORE'),
('constitution', 'CONST-002: No Self-Approval',
 'The system that proposes improvements cannot approve its own proposals.', 'CORE'),
('constitution', 'CONST-003: Audit Trail',
 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.', 'CORE'),
('constitution', 'CONST-004: Rollback Capability',
 'Every applied change must be reversible within the rollback window.', 'CORE'),
('constitution', 'CONST-005: Database First',
 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.', 'CORE'),

-- NEW rules from AntiGravity triangulation
('constitution', 'CONST-006: Complexity Conservation',
 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).', 'CORE'),
('constitution', 'CONST-007: Velocity Limit',
 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.', 'CORE'),
('constitution', 'CONST-008: Chesterton''s Fence',
 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.', 'CORE'),
('constitution', 'CONST-009: Emergency Freeze',
 'Human can invoke FREEZE command to halt all AUTO changes immediately.', 'CORE');
```

---

## 9. TRIANGULATION ARTIFACTS

All triangulation documents saved to `.triangulation/`:

| File | Purpose |
|------|---------|
| `leo-self-improvement-plan.md` | Permanent copy of design |
| `leo-self-improvement-review-prompt.md` | Prompt sent to external AIs |
| `leo-self-improvement-triangulation-results.md` | Analysis of external AI feedback |

---

## 10. RUBRIC & LEVEL DEFINITIONS

### 10.1 AI Quality Judge Scoring Rubric (0-100)

The AIQualityJudge scores each improvement proposal on 5 criteria, each worth 20 points:

| Criterion | 0-5 Points | 6-12 Points | 13-17 Points | 18-20 Points |
|-----------|------------|-------------|--------------|--------------|
| **Specificity** | Vague, no clear action | General direction, some ambiguity | Clear action, minor gaps | Precise, unambiguous, actionable |
| **Necessity** | Redundant or already covered | Nice-to-have, low priority | Addresses real pattern | Critical gap, clear evidence |
| **Atomicity** | Multiple changes bundled | 2-3 related changes | Single change with dependencies | Single, isolated change |
| **Safety** | Could break core functionality | Risk to non-critical paths | Minimal risk, well-bounded | Zero risk, purely cosmetic |
| **Evidence** | No supporting data | 1-2 occurrences | 3-5 occurrences, some recency | 5+ occurrences, recent, linked |

**Score Interpretation**:
| Score Range | Recommendation | Meaning |
|-------------|----------------|---------|
| 0-49 | REJECT | Insufficient quality, needs significant rework |
| 50-69 | REVISE | Has potential but needs refinement |
| 70-84 | ESCALATE | Could be good but needs human judgment |
| 85-94 | APPROVE (GOVERNED only) | High quality, proceed with human approval |
| 95-100 | APPROVE (AUTO eligible) | Excellent quality, eligible for auto-apply if deterministic check passes |

**Rubric Prompt Template**:
```
You are an independent Quality Judge for protocol improvements.
Your role is to evaluate proposals - NOT to agree with them.

Score this improvement on 5 criteria (0-20 each):

1. SPECIFICITY: Is the proposed change precise and unambiguous?
2. NECESSITY: Does evidence support this is needed?
3. ATOMICITY: Is this a single, isolated change?
4. SAFETY: Could this break functionality or introduce risks?
5. EVIDENCE: Is there sufficient pattern data?

For each criterion, provide:
- Score (0-20)
- Brief justification (1 sentence)

Final output:
- Total score (0-100)
- Recommendation: REJECT | REVISE | ESCALATE | APPROVE
- Overall reasoning (2-3 sentences)

IMPORTANT: You must be skeptical. Assume the proposer may have blind spots.
If you're uncertain, score lower.
```

---

### 10.2 Risk Tier Definitions

| Tier | Definition | Target Tables | Change Types | Never AUTO |
|------|------------|---------------|--------------|------------|
| **IMMUTABLE** | Core governance constraints that cannot change without breaking the system's safety guarantees | `protocol_constitution`, `leo_protocol_sections` WHERE priority='CORE' | ANY | Always true |
| **GOVERNED** | Behavioral changes that affect how the system operates, routes, validates, or enforces | `leo_validation_rules`, `leo_sub_agent_triggers`, `leo_protocols`, `leo_protocol_sections` WHERE priority='STANDARD' | Logic changes, threshold changes, routing changes, gate modifications | True |
| **AUTO** | Cosmetic changes with zero functional impact | `leo_protocol_sections` WHERE priority='SITUATIONAL', documentation-only changes | Typos, formatting, wording improvements, clarifications | False (if score ≥95 AND deterministic check passes) |

**Classification Rules (in order)**:

```javascript
function classifyRiskTier(improvement) {
  const { target_table, change_type, affects_priority } = improvement;

  // Rule 1: Constitution is always IMMUTABLE
  if (target_table === 'protocol_constitution') return 'IMMUTABLE';

  // Rule 2: CORE priority sections are IMMUTABLE
  if (target_table === 'leo_protocol_sections' && affects_priority === 'CORE') return 'IMMUTABLE';

  // Rule 3: Validation rules are always GOVERNED
  if (target_table === 'leo_validation_rules') return 'GOVERNED';

  // Rule 4: Triggers are always GOVERNED
  if (target_table === 'leo_sub_agent_triggers') return 'GOVERNED';

  // Rule 5: Protocol versions are always GOVERNED
  if (target_table === 'leo_protocols') return 'GOVERNED';

  // Rule 6: STANDARD priority sections are GOVERNED
  if (target_table === 'leo_protocol_sections' && affects_priority === 'STANDARD') return 'GOVERNED';

  // Rule 7: Logic changes are always GOVERNED regardless of target
  if (['threshold_change', 'condition_change', 'logic_change'].includes(change_type)) return 'GOVERNED';

  // Rule 8: SITUATIONAL sections with cosmetic changes can be AUTO
  if (target_table === 'leo_protocol_sections' &&
      affects_priority === 'SITUATIONAL' &&
      ['typo', 'formatting', 'wording', 'clarification'].includes(change_type)) {
    return 'AUTO';
  }

  // Rule 9: Default to GOVERNED if uncertain
  return 'GOVERNED';
}
```

---

### 10.3 Severity Level Definitions

Used for evidence scoring and pattern prioritization:

| Severity | Definition | Examples | Evidence Floor | Decay Rate |
|----------|------------|----------|----------------|------------|
| **CRITICAL** | Production breakage, data loss, security vulnerability, or complete workflow failure | Build failures, auth bypass, data corruption, CI/CD blocks | 10 | 0.95^days |
| **HIGH** | Significant user-facing issues or repeated validation failures | E2E test failures, sub-agent rejections, PRD validation blocks | 5 | 0.95^days |
| **MEDIUM** | Process friction or quality degradation | Documentation gaps, unclear error messages, inconsistent behavior | 2 | 0.95^days |
| **LOW** | Minor annoyances or style issues | Typos, formatting inconsistencies, verbose output | 0 | 0.95^days |

**Severity Classification Rules**:

```javascript
function classifySeverity(pattern) {
  const { category, impact, frequency } = pattern;

  // CRITICAL: Production impact
  if (category === 'build_failure') return 'CRITICAL';
  if (category === 'security') return 'CRITICAL';
  if (category === 'data_integrity') return 'CRITICAL';
  if (impact === 'blocks_all_work') return 'CRITICAL';

  // HIGH: Significant but recoverable
  if (category === 'test_failure' && frequency >= 3) return 'HIGH';
  if (category === 'validation_rejection') return 'HIGH';
  if (impact === 'blocks_some_work') return 'HIGH';

  // MEDIUM: Friction
  if (category === 'documentation') return 'MEDIUM';
  if (category === 'unclear_error') return 'MEDIUM';
  if (impact === 'slows_work') return 'MEDIUM';

  // LOW: Default
  return 'LOW';
}
```

---

### 10.4 Priority Level Definitions

Used for protocol section prioritization:

| Priority | Definition | Loaded When | Removal Policy |
|----------|------------|-------------|----------------|
| **CORE** | Essential rules that define system identity | Always | Never (constitution-level) |
| **STANDARD** | Normal operating rules | Always | Human approval required |
| **SITUATIONAL** | Context-dependent guidance | On-demand based on SD category | Can be consolidated/archived via Anti-Bloat |

**Priority Assignment Rules**:

```javascript
function assignPriority(section) {
  const { section_type, is_constitution, usage_frequency } = section;

  // CORE: Constitution sections
  if (section_type === 'constitution') return 'CORE';
  if (is_constitution === true) return 'CORE';

  // CORE: Fundamental governance sections
  if (['session_prologue', 'skill_intent_detection', 'sub_agent_triggers'].includes(section_type)) return 'CORE';

  // STANDARD: Regular operating sections
  if (['phase_guidance', 'common_commands', 'validation_rules'].includes(section_type)) return 'STANDARD';

  // SITUATIONAL: Domain-specific or infrequently used
  if (usage_frequency < 0.1) return 'SITUATIONAL';  // < 10% of SDs reference this
  if (['domain_specific', 'edge_case', 'troubleshooting'].includes(section_type)) return 'SITUATIONAL';

  // Default to STANDARD
  return 'STANDARD';
}
```

---

## 11. LEVERAGING EXISTING LEO INFRASTRUCTURE

Based on codebase exploration, the LEO protocol already has sophisticated enforcement mechanisms that the self-improvement loop should integrate with rather than duplicate.

### 11.1 Hooks to Leverage

| Existing Hook | Location | How to Leverage for Self-Improvement |
|---------------|----------|--------------------------------------|
| **Stop Hook** | `scripts/hooks/stop-subagent-enforcement.js` | Add protocol improvement validation before session end |
| **Pre-Commit Hook** | `.githooks/pre-commit.js` | Block commits that violate newly applied protocol rules |
| **Hook Failure Logging** | `.leo-hook-failures.json` | Feed failures into pattern detection for improvements |
| **Hook Subagent Activator** | `scripts/hook-subagent-activator.js` | Map improvement failures to appropriate sub-agents |
| **Circuit Breaker Pattern** | `scripts/leo-hook-feedback.js` | Apply to AUTO tier (3 failures = human escalation) |

**New Hook to Create**: `scripts/hooks/protocol-improvement-enforcement.js`
```javascript
// Add to .claude/settings.json as PreToolUse hook
// When: Edit/Write tool on CLAUDE.md or protocol files
// Action: Block direct edits, require database-first flow
// Exit 2: Block with remediation JSON
```

### 11.2 Database Validation to Leverage

| Existing Pattern | Table/Function | How to Leverage |
|------------------|----------------|-----------------|
| **RLS Service Role Check** | `fn_is_service_role()` | Protect `protocol_constitution` - only service_role can read |
| **Doctrine of Constraint** | `enforce_doctrine_of_constraint()` | Extend to block EXEC agents from modifying protocol |
| **Handoff Audit Log** | `handoff_audit_log` | Model `protocol_improvement_audit_log` similarly |
| **Quality Enforcement Trigger** | `validate_retrospective_quality()` | Create `validate_improvement_quality()` with same pattern |
| **Gate Validation Registry** | `leo_validation_rules` | Register improvement validation rules in same registry |

**New Database Enforcement to Add**:

```sql
-- 1. Extend Doctrine of Constraint to protocol improvements
CREATE OR REPLACE FUNCTION enforce_protocol_improvement_constraint()
RETURNS TRIGGER AS $$
BEGIN
  -- Block if not from approved improvement applicator
  IF NEW.applied_by NOT IN ('IMPROVEMENT_APPLICATOR', 'ADMIN_OVERRIDE') THEN
    INSERT INTO protocol_improvement_violations (
      improvement_id, attempted_by, blocked, reason
    ) VALUES (
      NEW.id, current_user, true, 'Direct modification blocked'
    );
    RAISE EXCEPTION 'Protocol modifications must go through improvement pipeline';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create improvement audit trigger (like handoff_audit_log pattern)
CREATE TRIGGER trg_improvement_audit
BEFORE INSERT OR UPDATE ON leo_protocol_sections
FOR EACH ROW
EXECUTE FUNCTION log_protocol_improvement_attempt();

-- 3. Velocity limit enforcement (database-level)
CREATE OR REPLACE FUNCTION check_auto_velocity_limit()
RETURNS BOOLEAN AS $$
DECLARE
  auto_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO auto_count
  FROM protocol_improvement_queue
  WHERE risk_tier = 'AUTO'
    AND status = 'APPLIED'
    AND applied_at > NOW() - INTERVAL '24 hours';

  RETURN auto_count < 3;  -- CONST-007: Max 3 AUTO/day
END;
$$ LANGUAGE plpgsql;
```

### 11.3 GitHub CI/CD to Leverage

| Existing Workflow | File | How to Leverage |
|-------------------|------|-----------------|
| **LEO Gates** | `leo-gates.yml` | Add "Gate P" (Protocol) for improvement validation |
| **Schema Drift Detection** | `schema-drift.yml` | Detect protocol drift (CLAUDE.md vs database) |
| **Protocol Drift Check** | `leo-drift-check.yml` | Already exists - enable with DATABASE_URL secret |
| **Pattern Maintenance** | `pattern-maintenance-weekly.yml` | Feed into improvement extraction |
| **Retrospective Quality** | `retrospective-quality-gates.yml` | Source of improvement proposals |

**New GitHub Workflow to Add**: `protocol-improvement-validation.yml`

```yaml
name: Protocol Improvement Validation

on:
  schedule:
    - cron: '0 6 * * *'  # Daily 6 AM UTC
  workflow_dispatch:

jobs:
  validate-pending-improvements:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Evaluate pending AUTO improvements
        run: node scripts/protocol-improvements.js evaluate-all

      - name: Check velocity limit
        run: node scripts/protocol-improvements.js velocity-status

      - name: Run deterministic checks
        run: node scripts/protocol-improvements.js classify-auto --dry-run

      - name: Generate prediction report
        run: node scripts/protocol-improvements.js prediction-report >> $GITHUB_STEP_SUMMARY

      - name: Check token budget
        run: |
          BUDGET=$(node scripts/protocol-improvements.js budget --json)
          echo "$BUDGET" >> $GITHUB_STEP_SUMMARY
          if [ $(echo "$BUDGET" | jq '.usage_percent') -gt 80 ]; then
            echo "::warning::Token budget above 80%"
          fi
```

### 11.4 Existing Sub-Agent Integration

| Sub-Agent | Code | How to Leverage |
|-----------|------|-----------------|
| **VALIDATION** | Codebase validation | Run before applying improvements |
| **REGRESSION** | Backward compatibility | Verify improvements don't break existing behavior |
| **RETRO** | Retrospective generation | Source of improvement proposals |
| **RCA** | Root cause analysis | Investigate improvement failures |

**Sub-Agent Execution for Improvements**:
```bash
# Before applying any GOVERNED improvement:
node scripts/execute-subagent.js --code VALIDATION --sd-id IMPROVEMENT-{id}
node scripts/execute-subagent.js --code REGRESSION --sd-id IMPROVEMENT-{id}

# After applying, track effectiveness:
node scripts/execute-subagent.js --code RETRO --sd-id IMPROVEMENT-{id}
```

### 11.5 Existing Audit Tables to Extend

| Table | Current Purpose | Extension for Self-Improvement |
|-------|-----------------|-------------------------------|
| `doctrine_constraint_violations` | EXEC governance blocks | Add improvement violation tracking |
| `handoff_audit_log` | Handoff attempts | Model `improvement_audit_log` similarly |
| `governance_audit_log` | Governance actions | Include improvement approvals/rejections |
| `validation_audit_log` | Rule execution | Track improvement validation runs |

### 11.6 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SELF-IMPROVEMENT INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  EXISTING HOOKS                    NEW IMPROVEMENTS                      │
│  ─────────────                    ────────────────                       │
│  stop-subagent-enforcement.js ──► Validate improvements applied         │
│  pre-commit.js ────────────────► Block direct CLAUDE.md edits           │
│  hook-subagent-activator.js ───► Map failures to improvement proposals  │
│  leo-hook-feedback.js ─────────► Circuit breaker for AUTO tier          │
│                                                                          │
│  EXISTING DATABASE                 NEW IMPROVEMENTS                      │
│  ─────────────────                ────────────────                       │
│  fn_is_service_role() ──────────► Protect protocol_constitution          │
│  enforce_doctrine_of_constraint() ► Block EXEC from protocol changes     │
│  leo_validation_rules ──────────► Register improvement validation rules │
│  handoff_audit_log ─────────────► Model improvement_audit_log           │
│                                                                          │
│  EXISTING CI/CD                    NEW IMPROVEMENTS                      │
│  ──────────────                   ────────────────                       │
│  leo-gates.yml ─────────────────► Add Gate P (Protocol)                  │
│  schema-drift.yml ──────────────► Detect CLAUDE.md vs DB drift           │
│  leo-drift-check.yml ───────────► Enable with DATABASE_URL               │
│  pattern-maintenance-weekly.yml ► Feed into improvement extraction       │
│                                                                          │
│  EXISTING SUB-AGENTS               NEW IMPROVEMENTS                      │
│  ───────────────────              ────────────────                       │
│  VALIDATION ────────────────────► Pre-apply validation                   │
│  REGRESSION ────────────────────► Backward compatibility check           │
│  RETRO ─────────────────────────► Improvement effectiveness tracking     │
│  RCA ───────────────────────────► Investigate improvement failures       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.7 Implementation Priority (Leverage First)

| Priority | Leverage Existing | Reason |
|----------|-------------------|--------|
| **1** | `handoff_audit_log` pattern | Model improvement audit the same way |
| **2** | `leo_validation_rules` registry | Register improvement validations in existing registry |
| **3** | `schema-drift.yml` workflow | Already detects CLAUDE.md vs DB drift |
| **4** | `stop-subagent-enforcement.js` | Add improvement validation to existing hook |
| **5** | `hook-subagent-activator.js` | Map improvement failures to sub-agents |
| **6** | `enforce_doctrine_of_constraint()` | Extend to block EXEC from protocol |
| **7** | `fn_is_service_role()` | Protect constitution table |

---

## 12. UPDATED FILES TO MODIFY (Including Integration)

| File | Change | Integration Type |
|------|--------|------------------|
| **EXISTING - MODIFY** | | |
| `scripts/hooks/stop-subagent-enforcement.js` | Add improvement validation check | Hook Integration |
| `.githooks/pre-commit.js` | Block direct CLAUDE.md edits | Hook Integration |
| `scripts/hook-subagent-activator.js` | Add improvement failure mappings | Hook Integration |
| `database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql` | Extend for protocol protection | DB Integration |
| `.github/workflows/schema-drift.yml` | Add CLAUDE.md vs DB comparison | CI/CD Integration |
| `.github/workflows/leo-gates.yml` | Add Gate P (Protocol) | CI/CD Integration |
| **NEW - CREATE** | | |
| `database/migrations/YYYYMMDD_self_improvement_foundation.sql` | New tables and columns | DB Schema |
| `scripts/modules/protocol-improvements/RiskClassifier.js` | Risk tier classification | New Module |
| `scripts/modules/protocol-improvements/AIQualityJudge.js` | AI scoring (different model) | New Module |
| `scripts/modules/protocol-improvements/EvidenceScorer.js` | Multiplicative decay formula | New Module |
| `scripts/modules/protocol-improvements/DeterministicChecker.js` | AST/semantic parsing | New Module |
| `scripts/modules/protocol-improvements/VelocityLimiter.js` | Max 3 AUTO/day | New Module |
| `scripts/modules/protocol-improvements/EmergencyFreeze.js` | FREEZE command | New Module |
| `.github/workflows/protocol-improvement-validation.yml` | Daily improvement validation | CI/CD |
| `scripts/hooks/protocol-improvement-enforcement.js` | Block direct protocol edits | Hook |

---

## 13. USER INTERFACE DESIGN

The EHG frontend (`/admin` section) already has established patterns for dashboards, lists, approval workflows, and metrics. The Protocol Improvement Management UI will follow these patterns.

### 13.1 Route Structure

Add to `/admin/protocol` route (currently placeholder):

| Route | Page | Purpose |
|-------|------|---------|
| `/admin/protocol` | ProtocolDashboard | Overview metrics and quick actions |
| `/admin/protocol/queue` | ImprovementQueuePage | Filterable list of pending improvements |
| `/admin/protocol/history` | ImprovementHistoryPage | Applied/rejected improvement history |
| `/admin/protocol/constitution` | ConstitutionPage | View immutable rules (read-only) |
| `/admin/protocol/health` | ProtocolHealthPage | Token budget, drift detection, rot rate |

### 13.2 Protocol Dashboard (Main View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEO Protocol Management                                     v4.3.3 Active  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   PENDING   │  │  GOVERNED   │  │    AUTO     │  │   APPLIED   │        │
│  │     12      │  │      3      │  │      7      │  │     45      │        │
│  │  awaiting   │  │   human     │  │   ready     │  │  this month │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌───────────────────────────────────┐│
│  │  Token Budget                   │  │  Velocity Today                   ││
│  │  ████████████░░░░ 14,200/20,000 │  │  ██░░░░ 2/3 AUTO applied          ││
│  │  71% used                       │  │  1 remaining                      ││
│  └─────────────────────────────────┘  └───────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Quick Actions                                                          ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   ││
│  │  │ Review Queue │ │ Run Evaluate │ │ Check Health │ │ 🔴 FREEZE    │   ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Recent Activity                                                        ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  ✓ IMP-047 applied (AUTO)           "Fix typo in validation message"   ││
│  │    2 hours ago                       Score: 96 | Tier: AUTO             ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  ⏳ IMP-046 awaiting review         "Add logging to handoff trigger"   ││
│  │    5 hours ago                       Score: 82 | Tier: GOVERNED         ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  ✗ IMP-045 rejected                 "Remove validation gate"           ││
│  │    Yesterday                         Score: 41 | Tier: GOVERNED         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Improvement Queue (List View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Improvement Queue                                              12 pending  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ Filters ────────────────────────────────────────────────────────────┐  │
│  │ Status: [All ▼]  Tier: [All ▼]  Score: [0-100]  Search: [________]   │  │
│  │ ☐ Show only actionable    ☐ Hide already scored                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ▼ IMP-048                                              GOVERNED  92  │  │
│  │   "Adjust sub-agent timeout from 30s to 45s"                         │  │
│  │   Target: leo_sub_agents.timeout_seconds                             │  │
│  │   Source: RETRO-2026-01-21 (3 occurrences)                          │  │
│  │   ┌────────────────────────────────────────────────────────────────┐ │  │
│  │   │ AI Assessment:                                                  │ │  │
│  │   │ Specificity: 18/20 | Necessity: 17/20 | Atomicity: 20/20       │ │  │
│  │   │ Safety: 18/20 | Evidence: 19/20                                 │ │  │
│  │   │ Recommendation: APPROVE                                         │ │  │
│  │   │ "Clear, evidence-backed change with minimal risk"               │ │  │
│  │   └────────────────────────────────────────────────────────────────┘ │  │
│  │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │  │
│  │   │ ✓ Approve    │ │ ✗ Reject     │ │ ↻ Re-score   │                │  │
│  │   └──────────────┘ └──────────────┘ └──────────────┘                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ► IMP-047                                                AUTO  96    │  │
│  │   "Fix typo: 'recieve' → 'receive' in error message"                 │  │
│  │   Target: leo_protocol_sections.content                              │  │
│  │   ⚡ WOULD AUTO APPLY (deterministic check passed)                   │  │
│  │   ┌──────────────┐ ┌──────────────┐                                 │  │
│  │   │ ✓ Confirm    │ │ ✗ Override   │   Staging: 45min remaining      │  │
│  │   └──────────────┘ └──────────────┘                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ► IMP-046                                              GOVERNED  82  │  │
│  │   "Add logging to handoff trigger function"                          │  │
│  │   Target: leo_protocol_sections (STANDARD priority)                  │  │
│  │   [Click to expand]                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Improvement Detail (Expanded View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMP-048: Adjust sub-agent timeout                           GOVERNED  92  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ Summary ────────────────────────────────────────────────────────────┐  │
│  │ Proposed Change: Increase timeout from 30s to 45s for sub-agents     │  │
│  │ Target Table: leo_sub_agents                                         │  │
│  │ Target Column: timeout_seconds                                       │  │
│  │ Current Value: 30                                                    │  │
│  │ New Value: 45                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Evidence (Chesterton's Fence) ──────────────────────────────────────┐  │
│  │ Source Retrospective: RETRO-2026-01-21                               │  │
│  │ Occurrences: 3 (last 14 days)                                        │  │
│  │ Evidence Score: 8.7 (threshold: 5.0)                                 │  │
│  │                                                                       │  │
│  │ Pattern Matches:                                                      │  │
│  │ • SD-LEO-BUG-TIMEOUT-001: "Sub-agent timed out during large PRD"    │  │
│  │ • SD-LEO-BUG-TIMEOUT-002: "Database agent timeout on migration"     │  │
│  │ • SD-LEO-BUG-TIMEOUT-003: "Security scan exceeded time limit"       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ AI Quality Assessment ──────────────────────────────────────────────┐  │
│  │ Evaluator Model: gpt-4o-mini (different from extractor)              │  │
│  │ Evaluated At: 2026-01-22 08:45:00                                    │  │
│  │                                                                       │  │
│  │ Criteria Scores:                                                      │  │
│  │ ┌────────────────────────────────────────────────────────────────┐   │  │
│  │ │ Specificity   ████████████████████░░░░  18/20                  │   │  │
│  │ │ Necessity     ███████████████████░░░░░  17/20                  │   │  │
│  │ │ Atomicity     ████████████████████████  20/20                  │   │  │
│  │ │ Safety        ████████████████████░░░░  18/20                  │   │  │
│  │ │ Evidence      ███████████████████████░  19/20                  │   │  │
│  │ └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  │ Reasoning: "Clear, atomic change with strong evidence from multiple  │  │
│  │ retrospectives. Timeout increase is bounded and reversible."         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Deterministic Check ────────────────────────────────────────────────┐  │
│  │ ✓ No logic change detected (value change only)                       │  │
│  │ ✓ No semantic conflicts with existing rules                          │  │
│  │ ✓ Token budget available (14,200 + 0 = 14,200 < 20,000)             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Human Decision ─────────────────────────────────────────────────────┐  │
│  │ Decision: [Approve ▼]                                                │  │
│  │ Notes: [Optional notes for audit trail___________________________]   │  │
│  │                                                                       │  │
│  │ ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │ │                         Submit Decision                          │ │  │
│  │ └──────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.5 Protocol Health Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Protocol Health                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ Token Budget ───────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  CLAUDE.md Total: 14,200 / 20,000 tokens (71%)                       │  │
│  │  ████████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░   │  │
│  │                                                                       │  │
│  │  By Section:                                                          │  │
│  │  ├─ Session Prologue (CORE)        1,200 tokens  ██░░░░░░  6%        │  │
│  │  ├─ Skill Intent (CORE)            3,400 tokens  ██████░░  17%       │  │
│  │  ├─ Sub-Agent Triggers (CORE)      2,800 tokens  █████░░░  14%       │  │
│  │  ├─ Phase Guidance (STANDARD)      4,100 tokens  ███████░  21%       │  │
│  │  ├─ Validation Rules (STANDARD)    1,900 tokens  ███░░░░░  10%       │  │
│  │  └─ Domain Specific (SITUATIONAL)    800 tokens  █░░░░░░░  4%        │  │
│  │                                                                       │  │
│  │  ⚠️ Warning at 80% (16,000 tokens)                                   │  │
│  │  🛑 Block at 100% (20,000 tokens)                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Section Activity (Last 30 Days) ────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Section                      SDs Referencing    Last Activity       │  │
│  │  ──────────────────────────────────────────────────────────────────  │  │
│  │  Phase Guidance               47                 2 hours ago    ✓    │  │
│  │  Validation Rules             32                 Yesterday      ✓    │  │
│  │  Sub-Agent Triggers           28                 3 days ago     ✓    │  │
│  │  Database Patterns            12                 1 week ago     ⚠️   │  │
│  │  Legacy Compatibility          0                 45 days ago    🔴   │  │
│  │                                                                       │  │
│  │  🔴 = Candidate for consolidation (no activity 30+ days)             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Constitution Rules ─────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🔒 CONST-001: Human Approval Required              Status: ACTIVE   │  │
│  │  🔒 CONST-002: No Self-Approval                     Status: ACTIVE   │  │
│  │  🔒 CONST-003: Audit Trail                          Status: ACTIVE   │  │
│  │  🔒 CONST-004: Rollback Capability                  Status: ACTIVE   │  │
│  │  🔒 CONST-005: Database First                       Status: ACTIVE   │  │
│  │  🔒 CONST-006: Complexity Conservation              Status: ACTIVE   │  │
│  │  🔒 CONST-007: Velocity Limit                       Status: ACTIVE   │  │
│  │  🔒 CONST-008: Chesterton's Fence                   Status: ACTIVE   │  │
│  │  🔒 CONST-009: Emergency Freeze                     Status: ACTIVE   │  │
│  │                                                                       │  │
│  │  These rules are IMMUTABLE and cannot be modified by the system.     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Improvement Effectiveness ──────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Last 30 Days:                                                        │  │
│  │  ├─ Applied: 45                                                       │  │
│  │  ├─ Effective (reduced pattern recurrence): 38 (84%)                 │  │
│  │  ├─ Neutral (no measurable change): 5 (11%)                          │  │
│  │  └─ Rolled Back: 2 (4%)                                              │  │
│  │                                                                       │  │
│  │  AUTO Tier Prediction Accuracy:                                       │  │
│  │  ├─ "WOULD AUTO APPLY" predictions: 127                              │  │
│  │  ├─ Human agreed: 121 (95.3%)                                        │  │
│  │  ├─ Human overrode: 6 (4.7%)                                         │  │
│  │  └─ Status: ✓ READY FOR FULL AUTONOMY (>100 predictions, >95%)       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.6 Emergency Freeze Modal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│     ┌───────────────────────────────────────────────────────────────────┐   │
│     │                                                                   │   │
│     │   🔴 EMERGENCY FREEZE                                             │   │
│     │                                                                   │   │
│     │   This will immediately halt all AUTO tier processing.           │   │
│     │   GOVERNED tier changes will continue to require human approval. │   │
│     │                                                                   │   │
│     │   Currently in AUTO pipeline:                                     │   │
│     │   • IMP-047: "Fix typo..." (45 min until apply)                  │   │
│     │   • IMP-049: "Update..." (staging)                               │   │
│     │                                                                   │   │
│     │   Reason for freeze (required):                                   │   │
│     │   ┌─────────────────────────────────────────────────────────────┐ │   │
│     │   │ ________________________________________________            │ │   │
│     │   │                                                             │ │   │
│     │   └─────────────────────────────────────────────────────────────┘ │   │
│     │                                                                   │   │
│     │   ┌─────────────────────┐  ┌─────────────────────┐               │   │
│     │   │      Cancel         │  │   🔴 FREEZE NOW     │               │   │
│     │   └─────────────────────┘  └─────────────────────┘               │   │
│     │                                                                   │   │
│     └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.7 Component Structure (Frontend)

```
src/
├── pages/admin/
│   └── ProtocolManagementPage.tsx          # Main page wrapper
│
├── components/admin/protocol-management/
│   ├── ProtocolManagement.tsx              # Main container with tabs
│   ├── ProtocolDashboard.tsx               # Overview metrics
│   ├── ImprovementQueue.tsx                # Filterable list
│   ├── ImprovementCard.tsx                 # Single improvement display
│   ├── ImprovementDetail.tsx               # Expanded view with actions
│   ├── ImprovementFilters.tsx              # Filter controls
│   ├── ProtocolHealth.tsx                  # Health metrics
│   ├── TokenBudgetChart.tsx                # Token usage visualization
│   ├── SectionActivityTable.tsx            # Activity tracking
│   ├── ConstitutionView.tsx                # Immutable rules display
│   ├── EffectivenessMetrics.tsx            # Improvement success rates
│   ├── EmergencyFreezeModal.tsx            # Freeze confirmation
│   └── ApprovalForm.tsx                    # Human decision input
│
├── types/
│   └── protocol-improvement.ts             # Type definitions
│
└── services/
    └── protocolApi.ts                      # API integration
```

### 13.8 API Endpoints (Backend)

Add to EHG_Engineer API (`scripts/api/` or new dedicated service):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/protocol/improvements` | GET | List improvements with filters |
| `/api/protocol/improvements/:id` | GET | Get improvement detail |
| `/api/protocol/improvements/:id/approve` | POST | Approve improvement |
| `/api/protocol/improvements/:id/reject` | POST | Reject improvement |
| `/api/protocol/improvements/:id/rescore` | POST | Re-run AI evaluation |
| `/api/protocol/health` | GET | Token budget, activity, effectiveness |
| `/api/protocol/constitution` | GET | List immutable rules |
| `/api/protocol/freeze` | POST | Trigger emergency freeze |
| `/api/protocol/freeze` | DELETE | Unfreeze (resume AUTO) |
| `/api/protocol/velocity` | GET | Today's AUTO application count |
| `/api/protocol/predictions` | GET | WOULD AUTO APPLY accuracy |

### 13.9 Implementation Priority (UI)

| Phase | Components | Effort |
|-------|------------|--------|
| **Phase 0** | ProtocolDashboard (metrics only) | 1 day |
| **Phase 1** | ImprovementQueue + ImprovementCard | 2 days |
| **Phase 2** | ImprovementDetail + ApprovalForm | 2 days |
| **Phase 3** | ProtocolHealth + TokenBudgetChart | 1 day |
| **Phase 4** | EmergencyFreezeModal | 0.5 day |
| **Phase 5** | EffectivenessMetrics + predictions | 1 day |

---

## 14. IDENTIFIED GAPS & ENHANCEMENTS

After comprehensive review, these gaps and potential enhancements should be addressed:

### 14.1 Gaps to Address Before Implementation

| Gap | Current State | Required Addition | Priority |
|-----|---------------|-------------------|----------|
| **Notification System** | Not defined | How humans get notified for: GOVERNED reviews, AUTO applications, rollbacks, freezes | HIGH |
| **Error Handling** | Not defined | What happens when AI Quality Judge API fails mid-evaluation? | HIGH |
| **Improvement Dependencies** | Not defined | What if improvement A must apply before B? | MEDIUM |
| **Conflict Detection** | Semantic conflicts only | What if two improvements conflict, or would undo each other? | MEDIUM |
| **Backup/Recovery** | Individual rollback only | Full protocol backup/restore mechanism | LOW |

### 14.2 Notification System (Missing)

**Recommended Implementation**:

```javascript
// Notification channels (leverage existing LEO patterns)
const notificationChannels = {
  SLACK: process.env.SLACK_WEBHOOK_URL,      // Team channel
  EMAIL: process.env.NOTIFICATION_EMAIL,      // Fallback
  GITHUB_ISSUE: true,                         // Auto-create issues
  UI_BADGE: true,                             // In-app notification
};

// Notification triggers
const notifications = [
  { event: 'GOVERNED_PENDING', channel: ['UI_BADGE', 'SLACK'], urgency: 'normal' },
  { event: 'AUTO_APPLIED', channel: ['UI_BADGE'], urgency: 'low' },
  { event: 'AUTO_STAGING', channel: ['UI_BADGE'], urgency: 'low' },
  { event: 'ROLLBACK_TRIGGERED', channel: ['SLACK', 'UI_BADGE'], urgency: 'high' },
  { event: 'EMERGENCY_FREEZE', channel: ['SLACK', 'EMAIL', 'UI_BADGE'], urgency: 'critical' },
  { event: 'TOKEN_BUDGET_WARNING', channel: ['UI_BADGE', 'SLACK'], urgency: 'medium' },
  { event: 'VELOCITY_LIMIT_HIT', channel: ['UI_BADGE'], urgency: 'low' },
];
```

**UI Enhancement**: Add notification bell to admin header showing pending items.

### 14.3 Error Handling (Missing)

**AI Quality Judge Failures**:
```javascript
async function evaluateWithFallback(improvement) {
  try {
    // Primary: Different model family (e.g., GPT-4o-mini if extractor uses Claude)
    return await evaluateWith(process.env.JUDGE_MODEL_PRIMARY);
  } catch (primaryError) {
    log.warn('Primary model failed, trying fallback', primaryError);
    try {
      // Fallback: Another model family
      return await evaluateWith(process.env.JUDGE_MODEL_FALLBACK);
    } catch (fallbackError) {
      // If both fail: Queue for manual evaluation, don't block
      await markForManualEvaluation(improvement.id, {
        reason: 'AI evaluation failed',
        errors: [primaryError.message, fallbackError.message],
      });
      return { score: null, recommendation: 'MANUAL_REQUIRED' };
    }
  }
}
```

**Database Connection Failures**:
- All write operations should be wrapped in transactions
- Failed transactions logged to local file for recovery
- Health check endpoint for monitoring

### 14.4 Improvement Dependencies (Missing)

**Schema Addition**:
```sql
ALTER TABLE protocol_improvement_queue
ADD COLUMN depends_on UUID REFERENCES protocol_improvement_queue(id),
ADD COLUMN blocked_by_dependencies BOOLEAN DEFAULT false;

-- View for dependency chain
CREATE VIEW v_improvement_dependencies AS
SELECT
  i.id,
  i.title,
  i.depends_on,
  d.title as depends_on_title,
  d.status as depends_on_status,
  CASE WHEN d.status != 'APPLIED' THEN true ELSE false END as is_blocked
FROM protocol_improvement_queue i
LEFT JOIN protocol_improvement_queue d ON i.depends_on = d.id;
```

**Validation Rule**:
- Cannot apply improvement if depends_on is not APPLIED
- UI shows dependency chain
- Auto-apply respects dependency order

### 14.5 Conflict Detection (Enhancement)

**Types of Conflicts**:
1. **Direct Conflict**: Two improvements modify the same target field
2. **Undo Conflict**: Improvement would revert a recently applied change
3. **Semantic Conflict**: Already in AI Judge prompt, but needs UI visibility

**Schema Addition**:
```sql
CREATE TABLE improvement_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_a UUID REFERENCES protocol_improvement_queue(id),
  improvement_b UUID REFERENCES protocol_improvement_queue(id),
  conflict_type VARCHAR(50),  -- 'direct', 'undo', 'semantic'
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolution VARCHAR(50),     -- 'a_wins', 'b_wins', 'merged', 'both_rejected'
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ
);
```

### 14.6 Enhancements for Future Phases

| Enhancement | Description | Phase |
|-------------|-------------|-------|
| **Multi-Role Approval** | Different approval authorities (Lead, Chairman, Team) | Future |
| **Improvement Batching** | Group related improvements for single approval | Future |
| **A/B Testing** | Run shadow protocol on subset of work | Future |
| **ML Model for Classification** | Train on historical data for better risk classification | Future |
| **Protocol Diff Viewer** | Side-by-side comparison of protocol versions | UI Phase 3 |
| **Audit Export** | Export audit trails for compliance (CSV, PDF) | UI Phase 5 |
| **API Rate Limiting** | Protect AI Quality Judge from overload | Phase 1 |
| **Improvement Templates** | Pre-defined templates for common improvements | Future |

### 14.7 Model Configuration (Clarification Needed)

**Question for Implementation**: Which model families should be used?

| Role | Recommended Model | Rationale |
|------|-------------------|-----------|
| **ImprovementExtractor** | Claude (Sonnet/Haiku) | Already in LEO ecosystem |
| **AIQualityJudge (Primary)** | GPT-4o-mini | Different family for separation of duties |
| **AIQualityJudge (Fallback)** | Gemini Flash | Third family for redundancy |

**Environment Variables**:
```bash
EXTRACTOR_MODEL=claude-3-5-sonnet
JUDGE_MODEL_PRIMARY=gpt-4o-mini
JUDGE_MODEL_FALLBACK=gemini-1.5-flash
```

### 14.8 Performance Considerations

**Potential Bottlenecks**:
1. Weekly maintenance job with 1000+ improvements → Use pagination
2. Token budget calculation on every insert → Use materialized view with periodic refresh
3. AI evaluation of all pending improvements → Rate limit to 10/minute

**Mitigation**:
```sql
-- Materialized view for token budget (refresh every 5 minutes)
CREATE MATERIALIZED VIEW mv_protocol_token_budget AS
SELECT
  SUM(LENGTH(content)) as total_chars,
  SUM(LENGTH(content)) / 4 as approx_tokens,
  NOW() as computed_at
FROM leo_protocol_sections
WHERE active = true;

-- Refresh trigger
CREATE OR REPLACE FUNCTION refresh_token_budget()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_protocol_token_budget;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### 14.9 Testing the Self-Improvement System Itself

**Test Strategy**:
1. **AI Quality Judge Calibration**:
   - Score 50 historical improvements manually
   - Compare to AI scores
   - Require >85% agreement before deployment

2. **Deterministic Checker Validation**:
   - Create 20 known "trojan horse" changes
   - Verify 100% detection rate
   - Zero false negatives before enabling AUTO

3. **End-to-End Integration Test**:
   - Create mock retrospective
   - Verify extraction triggers
   - Verify scoring happens
   - Verify tier classification
   - Verify approval workflow
   - Verify CLAUDE.md regeneration

4. **Rollback Test**:
   - Apply improvement
   - Trigger rollback
   - Verify complete reversion
   - Verify audit trail

### 14.10 Relationship to Strategic Directive Process

**CRITICAL CLARIFICATION**: The self-improvement loop operates on protocol improvements, but governance integration with the SD process is required.

#### Current Design (Lightweight Process)

The plan proposes that protocol improvements flow through:
```
Retrospective → protocol_improvement_queue → AI Score → Tier Classification → Approval → Apply
```

This is a **separate, faster track** than full SDs, intended for:
- Typo fixes
- Documentation clarifications
- Threshold adjustments
- Prompt wording improvements

#### Option A: Improvements Create SDs (Full Governance)

All improvements above a certain threshold could **automatically create SDs**:

```javascript
// If improvement is GOVERNED tier, create an SD to track it
if (improvement.risk_tier === 'GOVERNED') {
  const sd = await createSD({
    type: 'PROTOCOL_IMPROVEMENT',
    title: `Protocol Improvement: ${improvement.title}`,
    source_improvement_id: improvement.id,
    category: 'LEO_MAINTENANCE',
    auto_generated: true,
  });
  improvement.linked_sd_id = sd.id;
  // Improvement cannot be applied until SD reaches EXEC phase
}
```

**Implications**:
- All GOVERNED changes go through LEAD → PLAN → EXEC
- More overhead, but full audit trail
- Handoffs required at each phase
- Sub-agents validate the improvement

#### Option B: Separate Track with SD Escalation (Hybrid)

Keep lightweight process for most changes, but **escalate to SD when**:
1. Change affects multiple tables
2. Change exceeds LOC threshold (e.g., >50 lines of protocol content)
3. Change affects validation gates or sub-agent routing
4. AI Judge recommends ESCALATE
5. Human reviewer requests SD creation

```javascript
// Escalation triggers
const shouldEscalateToSD = (improvement) => {
  if (improvement.affects_tables.length > 1) return true;
  if (improvement.loc_change > 50) return true;
  if (improvement.recommendation === 'ESCALATE') return true;
  if (improvement.target_table === 'leo_validation_rules') return true;
  if (improvement.target_table === 'leo_sub_agent_triggers') return true;
  return false;
};
```

**Implications**:
- Cosmetic changes stay fast (minutes)
- Structural changes get full SD treatment (days)
- Clear boundary between operational and strategic

#### Decision: Option A (Full SD Integration)

**User Decision**: All protocol improvements must go through the Strategic Directive process.

**Implementation**:
- ALL GOVERNED tier improvements automatically create SDs
- SD follows full LEAD → PLAN → EXEC workflow
- Sub-agents validate the improvement at each phase
- AUTO tier improvements create lightweight SDs (expedited workflow)
- No bypass of the LEO Protocol for any protocol changes

#### Constitution Addition (REQUIRED)

```sql
-- CONST-010: SD Integration Required
('constitution', 'CONST-010: SD Integration Required',
 'ALL protocol improvements MUST create a linked Strategic Directive and follow the LEO Protocol (LEAD→PLAN→EXEC). No bypass permitted.', 'CORE')
```

### 14.11 Outstanding Questions for User

Before implementation, clarify:

1. **SD Integration**: Should ALL GOVERNED improvements create SDs? Or only those meeting escalation criteria (Option B)?
2. **Notification preference**: Slack webhook available? Prefer email?
3. **Model budget**: Which AI models can we use for Quality Judge?
4. **Multi-user**: Will multiple humans review improvements, or single owner?
5. **Rollback authority**: Can any user trigger rollback, or only admins?

---

## 15. SUMMARY: IMPLEMENTATION READINESS

**Plan Coverage**:
- ✅ Architecture design (triangulation-validated)
- ✅ Database schema changes
- ✅ Rubric and level definitions
- ✅ Validation framework with test cases
- ✅ Existing infrastructure integration
- ✅ UI wireframes and components
- ✅ API endpoints
- ✅ Constitution rules (9 immutable)
- ✅ 6-phase implementation timeline
- ✅ Gap analysis and enhancements

**Implementation Order**:
1. Phase 0: Foundation (database + basic modules)
2. Phase 1: AI Evaluation (with model fallback)
3. Phase 2: Risk Classification
4. Phase 3: AUTO Classification (no auto-apply)
5. Phase 4: Evidence Scoring
6. Phase 5: Anti-Bloat System
7. Phase 6: Full Autonomy (gated by 100 predictions)
8. UI Phases 0-5 (parallel with backend)

**Total Estimated Effort**:
- Backend: 6-8 weeks
- Frontend: ~7.5 days
- Testing/Validation: 1-2 weeks
- Total: ~10 weeks to full autonomy

---

*Plan complete — triangulation validated — rubrics defined — existing infrastructure mapped — UI designed — gaps identified — ready for implementation approval*
