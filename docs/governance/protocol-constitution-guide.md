# Protocol Constitution Guide

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-23
- **Tags**: governance, self-improvement, constitution, ai-quality-judge, protocol
- **Related SD**: SD-LEO-SELF-IMPROVE-AIJUDGE-001

## Overview

The **Protocol Constitution** is a set of 11 immutable rules that govern the LEO Protocol's self-improvement system. These rules enforce safety, governance, and audit controls to prevent the autonomous system from making dangerous or unchecked modifications to itself.

**Key Principle**: The constitution ensures that while the system can *propose* improvements autonomously, critical safeguards remain in place to preserve human oversight, system stability, and architectural integrity.

## Table of Contents

1. [The Eleven Constitutional Rules](#the-eleven-constitutional-rules)
2. [Enforcement Mechanisms](#enforcement-mechanisms)
3. [Integration with AI Quality Judge](#integration-with-ai-quality-judge)
4. [Violation Severity Levels](#violation-severity-levels)
5. [Relationship to Other Governance](#relationship-to-other-governance)
6. [Technical Implementation](#technical-implementation)
7. [Use Cases and Examples](#use-cases-and-examples)
8. [Amendment Process](#amendment-process)
9. [Related Documentation](#related-documentation)

---

## The Eleven Constitutional Rules

### CONST-001: Human Approval for GOVERNED Tier

**Rule**: All GOVERNED tier changes require human approval. AI scores inform but never decide.

**Category**: Governance
**Rationale**: Ensures human oversight of significant protocol changes

**What This Means**:
- The AI Quality Judge can *score* and *recommend* improvements
- Only humans can make the final decision to approve GOVERNED tier changes
- AUTO tier changes have limited scope (see CONST-007)
- This prevents the system from autonomously implementing major architectural changes

**Enforcement**:
```javascript
// In constitution-validator.js
validateConst001(improvement) {
  if (improvement.risk_tier === 'GOVERNED' && improvement.auto_applicable) {
    return {
      rule_code: 'CONST-001',
      message: 'GOVERNED tier improvements cannot be auto-applied',
      severity: 'CRITICAL'
    };
  }
}
```

**Example Violations**:
- ❌ AUTO-tier improvement marked as GOVERNED
- ❌ System attempting to self-approve a GOVERNED change
- ✅ GOVERNED improvement queued for human review

---

### CONST-002: Separation of Proposer and Evaluator

**Rule**: The system that proposes improvements cannot approve its own proposals.

**Category**: Safety
**Rationale**: Prevents self-serving modifications and maintains separation of duties

**What This Means**:
- If Claude Sonnet proposes an improvement, Claude Sonnet cannot evaluate it
- The triangulation protocol ensures different model families are used
- Proposer and evaluator must be from different vendors (Anthropic, OpenAI, Google)
- This prevents confirmation bias and self-reinforcing changes

**Enforcement**:
```javascript
// Model family detection
getModelFamily(modelName) {
  if (modelName.includes('claude') || modelName.includes('anthropic')) return 'anthropic';
  if (modelName.includes('gpt') || modelName.includes('openai')) return 'openai';
  if (modelName.includes('gemini') || modelName.includes('google')) return 'google';
  return 'unknown';
}

validateConst002(improvement, evaluatorModel, proposerModel) {
  const evaluatorFamily = this.getModelFamily(evaluatorModel);
  const proposerFamily = this.getModelFamily(proposerModel);

  if (evaluatorFamily === proposerFamily) {
    return {
      rule_code: 'CONST-002',
      message: 'Evaluator cannot be from same model family as proposer',
      severity: 'CRITICAL'
    };
  }
}
```

**Example Violations**:
- ❌ GPT-4 proposes → GPT-4 evaluates
- ❌ Claude Sonnet proposes → Claude Opus evaluates
- ✅ Claude proposes → GPT-4 evaluates → Human approves

---

### CONST-003: Audit Logging Requirement

**Rule**: All protocol changes must be logged to audit tables with actor, timestamp, and payload.

**Category**: Audit
**Rationale**: Ensures traceability and accountability for all changes

**What This Means**:
- Every change must record who made it, when, and what was changed
- Audit logs cannot be deleted (RLS policy enforcement)
- Full payload is preserved for rollback capability
- This creates an immutable trail of all protocol evolution

**Enforcement**:
```javascript
validateConst003(improvement) {
  // Check if improvement targets audit bypass
  if (improvement.target_table === 'audit_log' &&
      improvement.target_operation === 'DELETE') {
    return {
      rule_code: 'CONST-003',
      message: 'Cannot delete audit log entries',
      severity: 'HIGH'
    };
  }
}
```

**Required Audit Fields**:
- `actor` - Who made the change (model, human, system)
- `timestamp` - When the change occurred
- `payload` - Full JSON of what was changed
- `improvement_id` - Link to source improvement
- `status` - APPLIED, ROLLED_BACK, etc.

**Example Violations**:
- ❌ Improvement targets deletion of audit_log entries
- ❌ Change applied without audit log entry
- ✅ All changes logged to `protocol_improvement_queue` with full context

---

### CONST-004: Reversibility Requirement

**Rule**: Every applied change must be reversible within the rollback window.

**Category**: Safety
**Rationale**: Enables recovery from bad changes and maintains system stability

**What This Means**:
- All improvements must include rollback instructions
- Database migrations must be reversible
- Changes marked as `irreversible: true` are rejected
- Rollback window is typically 30 days

**Enforcement**:
```javascript
validateConst004(improvement) {
  const payload = improvement.payload || {};
  if (payload.irreversible === true) {
    return {
      rule_code: 'CONST-004',
      message: 'Improvement is marked as irreversible',
      severity: 'HIGH'
    };
  }
}
```

**Rollback Pattern**:
```javascript
// Improvement payload must include rollback instructions
{
  "payload": {
    "operation": "INSERT",
    "table": "leo_protocol_sections",
    "data": { ... },
    "rollback": {
      "operation": "DELETE",
      "table": "leo_protocol_sections",
      "where": { "id": 123 }
    }
  }
}
```

**Example Violations**:
- ❌ Database migration without rollback SQL
- ❌ Improvement explicitly marked `irreversible: true`
- ✅ All changes include rollback instructions in payload

---

### CONST-005: Database-First Architecture

**Rule**: All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.

**Category**: Governance
**Rationale**: Ensures single source of truth and prevents configuration drift

**What This Means**:
- Protocol content stored in `leo_protocol_sections` table
- CLAUDE.md files are generated from database via `generate-claude-md-from-db.js`
- Direct file edits are overwritten on next regeneration
- Database is the authoritative source

**Enforcement**:
```javascript
validateConst005(improvement) {
  // Check if improvement has target_table specified
  if (!improvement.target_table) {
    return {
      rule_code: 'CONST-005',
      message: 'Improvement must specify target_table (database-first)',
      severity: 'HIGH'
    };
  }

  // Check for file-based targets (markdown, etc.)
  if (improvement.target_table && improvement.target_table.includes('.md')) {
    return {
      rule_code: 'CONST-005',
      message: 'Cannot target markdown files directly (database-first)',
      severity: 'HIGH'
    };
  }
}
```

**Correct Workflow**:
1. Update database: `INSERT INTO leo_protocol_sections ...`
2. Regenerate files: `node scripts/generate-claude-md-from-db.js`
3. Commit generated files to git

**Example Violations**:
- ❌ Improvement targets CLAUDE_CORE.md directly
- ❌ Improvement has no `target_table` specified
- ✅ Improvement specifies `target_table: "leo_protocol_sections"`

---

### CONST-006: Zero-Sum Complexity (Complexity Conservation)

**Rule**: New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).

**Category**: Governance
**Rationale**: Prevents protocol bloat and maintains context window efficiency

**What This Means**:
- Protocol has a total token budget (e.g., 200k tokens)
- Adding new content requires removing old content of equal size
- Large payloads (>5000 chars) trigger review flags
- This prevents unbounded growth of protocol instructions

**Enforcement**:
```javascript
validateConst006(improvement) {
  const payload = improvement.payload || {};
  const payloadSize = JSON.stringify(payload).length;

  if (payloadSize > 5000) {
    return {
      rule_code: 'CONST-006',
      message: 'Large payload may indicate complexity increase - review recommended',
      severity: 'MEDIUM'
    };
  }
}
```

**Complexity Budget**:
- CLAUDE.md router: 15k tokens (fixed)
- CLAUDE_CORE.md: ~25k tokens (budget controlled)
- Phase-specific files: ~15k each (budget controlled)
- Total target: <200k tokens

**Example Violations**:
- ⚠️ Adding 10k tokens of new instructions without removal
- ⚠️ Payload exceeds 5000 characters
- ✅ Adding 2k tokens, removing 2k tokens (zero-sum)

---

### CONST-007: Rate Limiting for AUTO Tier

**Rule**: Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.

**Category**: Safety
**Rationale**: Limits velocity of automated changes to allow human oversight

**What This Means**:
- Only 3 AUTO tier improvements can be applied automatically per day
- GOVERNED tier changes do not count against this limit (human approved)
- Rate limit resets every 24 hours
- Prevents runaway autonomous modification

**Enforcement**:
```javascript
async validateConst007(improvement) {
  if (improvement.risk_tier !== 'AUTO') return [];

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await this.supabase
    .from('protocol_improvement_queue')
    .select('*', { count: 'exact', head: true })
    .eq('risk_tier', 'AUTO')
    .eq('status', 'APPLIED')
    .gte('applied_at', twentyFourHoursAgo);

  if (count >= 3) {
    return {
      rule_code: 'CONST-007',
      message: 'Maximum AUTO changes per 24h reached (3)',
      severity: 'CRITICAL',
      details: { auto_changes_in_24h: count, max_allowed: 3 }
    };
  }
}
```

**Rate Limit Tracking**:
```sql
SELECT COUNT(*)
FROM protocol_improvement_queue
WHERE risk_tier = 'AUTO'
  AND status = 'APPLIED'
  AND applied_at >= NOW() - INTERVAL '24 hours';
```

**Example Violations**:
- ❌ Attempting 4th AUTO change within 24 hours
- ❌ Bypassing rate limit check
- ✅ 3 AUTO changes applied, 4th queued for next day

---

### CONST-008: Chesterton's Fence

**Rule**: No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.

**Category**: Governance
**Rationale**: Implements Chesterton's Fence - understand why before removing

**What This Means**:
- Before removing a rule, review why it was added
- Must retrieve and read the original retrospective that identified the need
- Prevents removing rules whose purpose is forgotten
- Named after Chesterton's principle: "Don't remove a fence until you know why it was put up"

**Enforcement**:
```javascript
validateConst008(improvement) {
  // Check if removing a rule without reviewing original retrospective
  if (improvement.target_operation === 'DELETE' ||
      (improvement.payload?.action === 'remove')) {
    if (!improvement.source_retro_id) {
      return {
        rule_code: 'CONST-008',
        message: "Removal requires review of original retrospective (Chesterton's Fence)",
        severity: 'MEDIUM',
        details: {
          operation: improvement.target_operation,
          source_retro_id: improvement.source_retro_id
        }
      };
    }
  }
}
```

**Removal Workflow**:
1. Identify rule to remove: `rule_id = "PLAN-VAL-006"`
2. Query source: `SELECT source_retro_id FROM protocol_improvement_queue WHERE id = ...`
3. Review retrospective: `SELECT * FROM retrospectives WHERE id = source_retro_id`
4. Document justification: "Rule was added for X, but X is no longer relevant because Y"
5. Only then approve removal

**Example Violations**:
- ❌ DELETE operation without `source_retro_id`
- ❌ Removing rule without reviewing original context
- ✅ Removal includes `source_retro_id` and justification

---

### CONST-009: Human FREEZE Command

**Rule**: Human can invoke FREEZE command to halt all AUTO changes immediately.

**Category**: Safety
**Rationale**: Provides emergency stop capability for autonomous system

**What This Means**:
- System flag `AUTO_FREEZE` can be set to halt all AUTO tier changes
- Only affects AUTO tier (GOVERNED continues to require human approval)
- Provides emergency brake if system behavior becomes concerning
- FREEZE can only be lifted by human operator

**Enforcement**:
```javascript
async validateConst009(improvement) {
  if (improvement.risk_tier !== 'AUTO') return [];

  const { data, error } = await this.supabase
    .from('system_flags')
    .select('value')
    .eq('key', 'AUTO_FREEZE')
    .single();

  if (data?.value === true || data?.value === 'true') {
    return {
      rule_code: 'CONST-009',
      message: 'AUTO changes are frozen by human FREEZE command',
      severity: 'CRITICAL',
      details: { freeze_active: true }
    };
  }
}
```

**FREEZE Command Usage**:
```bash
# Set FREEZE flag
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('system_flags')
  .upsert({ key: 'AUTO_FREEZE', value: true })
  .then(() => console.log('✅ AUTO changes FROZEN'));
"

# Clear FREEZE flag
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('system_flags')
  .upsert({ key: 'AUTO_FREEZE', value: false })
  .then(() => console.log('✅ AUTO changes UNFROZEN'));
"
```

**Example Violations**:
- ❌ AUTO change attempted while FREEZE active
- ❌ System bypassing FREEZE check
- ✅ AUTO change blocked with FREEZE message

---

### CONST-010: Non-Manipulation Principle

**Rule**: AI-generated improvement proposals must not use manipulative framing, urgent language, certainty claims, or emotional appeals to influence human reviewers.

**Category**: Safety
**Rationale**: Implements Anthropic's Claude Constitution principle of non-manipulative persuasion. Ensures AI recommendations are factual and neutral, preserving human agency.
**Source SD**: SD-LEO-INFRA-CONST-AMEND-001

**What This Means**:
- AI proposals must use factual evidence and reasoning only
- Urgent/pressure language is flagged (e.g., "URGENT", "CRITICAL", "MUST")
- Certainty claims are flagged (e.g., "ALWAYS", "NEVER", "DEFINITELY")
- Emotional appeals are flagged (e.g., "disaster", "catastrophic", "crisis")
- False scarcity framing is flagged (e.g., "only option", "no alternative")

**Enforcement**:
```javascript
validateConst010(improvement) {
  const text = improvement.description + JSON.stringify(improvement.payload);

  const manipulativePatterns = [
    /\b(URGENT|CRITICAL|IMMEDIATE|ASAP)\b/i,
    /\b(MUST|ALWAYS|NEVER|DEFINITELY)\b/i,
    /\b(disaster|catastrophic|crisis|emergency)\b/i,
    /\b(only option|no alternative|no choice)\b/i
  ];

  const matchCount = manipulativePatterns.filter(p => p.test(text)).length;

  // Require 2+ patterns to avoid false positives
  if (matchCount >= 2) {
    return {
      rule_code: 'CONST-010',
      message: 'Improvement contains potentially manipulative language patterns',
      severity: 'MEDIUM'
    };
  }
}
```

**Severity**: MEDIUM (advisory - flags for human review but does not block)

**Example Violations**:
- ⚠️ "URGENT: This MUST be approved immediately or we face DISASTER"
- ⚠️ "This is CRITICAL - there is NO ALTERNATIVE to this change"
- ✅ "This improvement adds validation based on retrospective evidence from SD-XXX"
- ✅ "Consider adding precheck command to reduce handoff iterations"

---

### CONST-011: Value Priority Hierarchy

**Rule**: When constitutional rules conflict, prioritize in this order: (1) Human Safety, (2) System Integrity, (3) Audit Compliance, (4) Operational Efficiency.

**Category**: Governance
**Rationale**: Provides explicit value hierarchy for conflict resolution, based on Anthropic's Claude Constitution value ordering (Safe > Ethical > Compliant > Helpful).
**Source SD**: SD-LEO-INFRA-CONST-AMEND-001

**Value Hierarchy**:

| Priority | Value | Rules |
|----------|-------|-------|
| 1 (Highest) | **Human Safety** | CONST-001, CONST-002, CONST-009 |
| 2 | **System Integrity** | CONST-004, CONST-007 |
| 3 | **Audit Compliance** | CONST-003, CONST-008 |
| 4 (Lowest) | **Operational Efficiency** | CONST-005, CONST-006, CONST-010 |

**What This Means**:
- When two rules conflict, the higher-priority rule wins
- Human Safety always takes precedence over efficiency concerns
- This is advisory guidance for human reviewers, not automated enforcement
- Helps resolve edge cases where multiple rules apply

**Enforcement**:
```javascript
validateConst011(improvement, context) {
  // Advisory only - provides hierarchy context when multiple violations exist
  if (context.existing_violations && context.existing_violations.length >= 2) {
    const categories = categorizeViolations(context.existing_violations);

    if (categories.size >= 2) {
      return {
        rule_code: 'CONST-011',
        message: 'Multiple rule categories violated. Prioritize: Human Safety > System Integrity > Audit Compliance > Operational Efficiency.',
        severity: 'ADVISORY',
        details: { value_hierarchy: valueHierarchy }
      };
    }
  }
}
```

**Severity**: ADVISORY (informational only - no automatic violations)

**Example Application**:
- If CONST-001 (Human Safety) conflicts with CONST-006 (Complexity), human safety wins
- If CONST-004 (System Integrity) conflicts with CONST-005 (Database-first), system integrity wins
- Human reviewer uses hierarchy to make decision when both rules apply

---

## Enforcement Mechanisms

### Layer 1: Constitution Validator

**Location**: `scripts/modules/ai-quality-judge/constitution-validator.js`

**Purpose**: Pre-validation before AI Quality Judge scoring

**Process**:
1. Load all 9 rules from `protocol_constitution` table
2. Run each rule validation function
3. Categorize violations by severity (CRITICAL, HIGH, MEDIUM)
4. Return validation result with violation details

**Integration**:
```javascript
// In AI Quality Judge
const constitutionValidator = new ConstitutionValidator(supabase);
const constitutionResult = await constitutionValidator.validate(improvement, context);

if (!constitutionResult.passed) {
  // Critical violations auto-reject
  if (constitutionResult.critical_count > 0) {
    return { recommendation: 'REJECT', reason: 'Constitutional violation' };
  }
  // High/Medium violations flag for review
  improvement.requires_human_review = true;
}
```

### Layer 2: RLS Policies

**Database Level**: Row-Level Security on `protocol_constitution` table

**Policy Configuration**:
```sql
-- Allow SELECT for everyone
CREATE POLICY select_constitution ON protocol_constitution
  FOR SELECT TO public USING (true);

-- Allow INSERT for service role only
CREATE POLICY insert_constitution ON protocol_constitution
  FOR INSERT TO public WITH CHECK (true);

-- BLOCK all UPDATE operations (immutable)
CREATE POLICY no_update_constitution ON protocol_constitution
  FOR UPDATE TO public USING (false);

-- BLOCK all DELETE operations (immutable)
CREATE POLICY no_delete_constitution ON protocol_constitution
  FOR DELETE TO public USING (false);
```

**Why Immutable**: The constitution rules themselves cannot be modified via normal database operations. This ensures the enforcement logic cannot be bypassed by modifying the rules.

### Layer 3: AI Quality Judge Integration

**Workflow**:
1. Improvement extracted from retrospective
2. Constitution validation runs FIRST (before scoring)
3. Critical violations → Auto-reject
4. High/Medium violations → Flag for human review
5. Passes constitution → Proceed to multi-criterion scoring
6. Final recommendation includes constitution compliance status

**Scoring Impact**:
- Constitution pass: Proceed to Russian Judge scoring
- Constitution fail (CRITICAL): Auto-reject, no scoring
- Constitution fail (HIGH/MEDIUM): Score reduced, human review required

### Layer 4: CLI Integration

**Command**: `node scripts/protocol-improvements.js evaluate <queue-id>`

**Output Example**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏛️  CONSTITUTION VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSED

Rules Checked: 11/11

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MULTI-CRITERION SCORING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Safety:        85/100  (25% weight)
Specificity:   90/100  (20% weight)
Necessity:     80/100  (20% weight)
Evidence:      70/100  (20% weight)
Atomicity:     95/100  (15% weight)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGGREGATE SCORE: 83/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommendation: APPROVE
Confidence: HIGH
Requires Human Review: No
```

---

## Violation Severity Levels

### CRITICAL (Auto-Reject)

**Rules**: CONST-001, CONST-002, CONST-007, CONST-009

**Impact**: Improvement automatically rejected without scoring

**Rationale**: These violations represent fundamental safety or governance breaches that cannot be overridden by high scores

**Examples**:
- GOVERNED tier marked as auto-applicable
- Same model family proposing and evaluating
- 4th AUTO change within 24 hours
- AUTO change attempted during FREEZE

**Resolution**: Fix violation and resubmit

### HIGH (Flag for Review)

**Rules**: CONST-003, CONST-004, CONST-005

**Impact**: Improvement flagged for mandatory human review, score reduced

**Rationale**: These violations indicate structural problems that require human judgment

**Examples**:
- Missing audit logging
- Irreversible change
- Direct file modification instead of database

**Resolution**: Human reviews and decides whether to proceed with fixes

### MEDIUM (Advisory)

**Rules**: CONST-006, CONST-008, CONST-010

**Impact**: Warning flag, no auto-rejection, human review recommended

**Rationale**: These violations suggest potential issues but may be justified

**Examples**:
- Large payload size (complexity increase)
- Removal without reviewing original retrospective

**Resolution**: Review justification, may proceed if valid reason exists

### ADVISORY (Informational)

**Rules**: CONST-011

**Impact**: Informational guidance only, no violation generated automatically

**Rationale**: Provides context for human decision-making when rules conflict

**Examples**:
- Multiple categories of violations detected - hierarchy guidance provided
- Edge case where rules seem to contradict

**Resolution**: Human reviewer uses guidance to make informed decision

---

## Integration with AI Quality Judge

### Phase 1 Implementation (Current)

**Status**: All improvements go through GOVERNED pipeline (human approval required)

**Workflow**:
```
Improvement Extracted
  ↓
Constitution Validation
  ↓
Critical Violation? → AUTO-REJECT
  ↓
High/Medium Violation? → FLAG for review
  ↓
Russian Judge Scoring (5 criteria)
  ↓
Aggregate Score + Recommendation
  ↓
Store in database with assessment
  ↓
HUMAN REVIEWS ALL → Approve/Reject
```

**Key Point**: Even high-scoring improvements (90+) require human approval in Phase 1

### Phase 2 (Future)

**Status**: Not yet implemented

**Planned AUTO Tier Criteria**:
- Constitution: PASS (no violations)
- Aggregate Score: ≥ 85/100
- Confidence: HIGH
- Risk Tier: AUTO
- Evidence: Strong
- Category: Safe (DOCUMENTATION, TEMPLATE, CHECKLIST)

**Workflow**:
```
Improvement with score ≥ 85
  ↓
Constitution: PASS
  ↓
Risk Tier: AUTO
  ↓
Category: Safe
  ↓
AUTO-APPLY (within rate limit)
  ↓
Human notified post-application
```

**Rate Limit**: CONST-007 still applies (max 3 per 24h)

### Constitution Check Integration

```javascript
// From ai-quality-judge/index.js
async evaluateImprovement(improvementId) {
  const improvement = await this.repository.getImprovement(improvementId);

  // STEP 1: Constitution validation (FIRST)
  const constitutionResult = await this.constitutionValidator.validate(
    improvement,
    { evaluator_model: this.model, proposer_model: improvement.created_by_model }
  );

  // Critical violations → Auto-reject
  if (constitutionResult.critical_count > 0) {
    await this.storage.storeAssessment(improvementId, {
      recommendation: 'REJECT',
      reason: 'Constitutional violation (CRITICAL)',
      constitution_result: constitutionResult
    });
    return { passed: false, reason: 'Constitution violation' };
  }

  // STEP 2: Multi-criterion scoring
  const scores = await this.scoring.scoreImprovement(improvement);

  // STEP 3: Aggregate and recommend
  const assessment = this.scoring.aggregateScores(scores, constitutionResult);

  // Store assessment
  await this.storage.storeAssessment(improvementId, assessment);

  return assessment;
}
```

---

## Relationship to Other Governance

The Protocol Constitution is one of several governance frameworks in the EHG system:

### Governance Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ EVA MANIFESTO (Agent Behavior - All Agents)                 │
│ - Four Oaths (Transparency, Boundaries, Escalation, etc.)   │
│ - Chain of Command (L1-L4)                                  │
│ - Token Budgets, Authority Matrix                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├──────────────────────┐
                              ↓                      ↓
┌───────────────────────────────────┐  ┌────────────────────────────────┐
│ PROTOCOL CONSTITUTION             │  │ DOCTRINE OF CONSTRAINT         │
│ (Self-Improvement System)         │  │ (EXEC Role Limits)             │
│ - 9 immutable rules               │  │ - Database-level enforcement   │
│ - AI Quality Judge enforcement    │  │ - EXEC cannot create SDs/PRDs  │
│ - Governance/Safety/Audit         │  │ - Preserves LEAD authority     │
└───────────────────────────────────┘  └────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ GENESIS OATH (Venture Creation)                             │
│ - Simulation → Reality workflow                             │
│ - 25-stage validation                                        │
│ - Contract of Pain                                           │
└─────────────────────────────────────────────────────────────┘
```

### Comparison Table

| Framework | Scope | Enforcement | Mutability |
|-----------|-------|-------------|------------|
| **Protocol Constitution** | Self-improvement system | AI Quality Judge + RLS | Immutable (RLS blocked) |
| **Four Oaths** | All agent behavior | `four-oaths-enforcement.js` | Immutable (manifesto) |
| **Doctrine of Constraint** | EXEC role limits | Database triggers | Immutable (schema) |
| **Genesis Oath** | Venture creation | Ritual/workflow | Mutable (vision evolution) |

### Overlap and Coordination

- **Four Oaths + Protocol Constitution**: Both enforce transparency (Oath 1 = audit logging, CONST-003 = audit tables)
- **Doctrine of Constraint + CONST-001**: Both preserve human decision authority (EXEC can't create SDs, AI can't auto-approve GOVERNED)
- **Genesis Oath + CONST-006**: Both enforce complexity conservation (simulation ≠ commitment, zero-sum protocol growth)

---

## Technical Implementation

### Database Schema

**Table**: `protocol_constitution`

```sql
CREATE TABLE protocol_constitution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(50) NOT NULL UNIQUE,  -- CONST-001, CONST-002, etc.
  rule_text TEXT NOT NULL,                -- The rule statement
  category VARCHAR(50),                   -- governance, safety, audit
  rationale TEXT,                         -- Why this rule exists
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE protocol_constitution ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_constitution ON protocol_constitution
  FOR SELECT TO public USING (true);

CREATE POLICY insert_constitution ON protocol_constitution
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY no_update_constitution ON protocol_constitution
  FOR UPDATE TO public USING (false);

CREATE POLICY no_delete_constitution ON protocol_constitution
  FOR DELETE TO public USING (false);
```

### Constitution Validator Class

**Location**: `scripts/modules/ai-quality-judge/constitution-validator.js`

**Key Methods**:

```javascript
class ConstitutionValidator {
  constructor(supabase) {
    this.supabase = supabase;
    this.constitutionRules = null;
  }

  // Load rules from database
  async loadRules() { ... }

  // Individual rule validators
  validateConst001(improvement) { ... }
  validateConst002(improvement, evaluatorModel, proposerModel) { ... }
  validateConst003(improvement) { ... }
  validateConst004(improvement) { ... }
  validateConst005(improvement) { ... }
  validateConst006(improvement) { ... }
  async validateConst007(improvement) { ... }
  validateConst008(improvement) { ... }
  async validateConst009(improvement) { ... }

  // Main validation entry point
  async validate(improvement, context = {}) {
    await this.loadRules();

    const allViolations = [];
    allViolations.push(...this.validateConst001(improvement));
    allViolations.push(...this.validateConst002(improvement, context.evaluator_model, context.proposer_model));
    // ... etc for all rules

    const criticalViolations = allViolations.filter(v => v.severity === 'CRITICAL');
    const passed = criticalViolations.length === 0;

    return {
      passed,
      requires_human_review: allViolations.length > 0,
      violations: allViolations,
      critical_count: criticalViolations.length,
      rules_checked: this.constitutionRules.length
    };
  }
}
```

### AI Quality Judge Integration

**Location**: `scripts/modules/ai-quality-judge/index.js`

**Main Class**: `AIQualityJudge`

**Evaluation Flow**:
```javascript
class AIQualityJudge {
  constructor(supabase, model = 'gpt-4') {
    this.supabase = supabase;
    this.model = model;
    this.constitutionValidator = new ConstitutionValidator(supabase);
    this.scoring = new RussianJudgeScoring();
    this.storage = new AIQualityJudgeStorage(supabase);
  }

  async evaluateImprovement(improvementId) {
    // 1. Fetch improvement
    const improvement = await this.repository.getImprovement(improvementId);

    // 2. Constitution validation (FIRST GATE)
    const constitutionResult = await this.constitutionValidator.validate(
      improvement,
      { evaluator_model: this.model, proposer_model: improvement.created_by_model }
    );

    // 3. Handle critical violations
    if (constitutionResult.critical_count > 0) {
      return await this.storage.storeAssessment(improvementId, {
        recommendation: 'REJECT',
        reason: 'Constitutional violation (CRITICAL)',
        constitution_result: constitutionResult,
        aggregate_score: 0
      });
    }

    // 4. Multi-criterion scoring
    const criterionScores = await this.scoring.scoreImprovement(improvement);

    // 5. Aggregate scores
    const assessment = this.scoring.aggregateScores(criterionScores, constitutionResult);

    // 6. Store assessment
    await this.storage.storeAssessment(improvementId, assessment);

    return assessment;
  }
}
```

### CLI Commands

**Evaluate Single Improvement**:
```bash
node scripts/protocol-improvements.js evaluate <improvement-id>
```

**Batch Evaluate**:
```bash
node scripts/protocol-improvements.js evaluate --all --limit=10
```

**View Evaluation Report**:
```bash
node scripts/protocol-improvements.js evaluation-report <improvement-id>
```

**Judge Statistics**:
```bash
node scripts/protocol-improvements.js judge-stats
```

---

## Use Cases and Examples

### Example 1: Valid Improvement (Passes Constitution)

**Improvement**:
```json
{
  "id": "abc-123",
  "improvement_type": "DOCUMENTATION",
  "target_table": "leo_protocol_sections",
  "target_operation": "INSERT",
  "description": "Add precheck command to handoff documentation",
  "payload": {
    "section_id": 307,
    "content": "## Precheck Command\n\n`handoff.js precheck` validates all requirements before execution."
  },
  "risk_tier": "AUTO",
  "evidence": "SD-LEO-HANDOFF-001 retrospective",
  "source_retro_id": "xyz-789"
}
```

**Constitution Check**:
- ✅ CONST-001: AUTO tier, not GOVERNED
- ✅ CONST-002: Different models (Claude proposes, GPT-4 evaluates)
- ✅ CONST-003: Audit logging via protocol_improvement_queue
- ✅ CONST-004: Reversible (DELETE operation in rollback)
- ✅ CONST-005: Targets database table, not .md file
- ✅ CONST-006: Small payload (~200 chars)
- ✅ CONST-007: Only 2nd AUTO change today
- ✅ CONST-008: Not a removal operation
- ✅ CONST-009: AUTO_FREEZE not active

**Result**: ✅ Passes constitution → Proceeds to scoring → High score (85+) → Approved

---

### Example 2: CRITICAL Violation (Auto-Reject)

**Improvement**:
```json
{
  "id": "def-456",
  "improvement_type": "VALIDATION_RULE",
  "target_table": "leo_validation_rules",
  "target_operation": "INSERT",
  "description": "Add validation for schema changes",
  "payload": { ... },
  "risk_tier": "GOVERNED",
  "auto_applicable": true,  // ❌ VIOLATION
  "evidence": "Multiple SDs failed due to schema issues",
  "source_retro_id": "abc-999"
}
```

**Constitution Check**:
- ❌ CONST-001: GOVERNED tier cannot be auto-applicable

**Violation Details**:
```json
{
  "rule_code": "CONST-001",
  "message": "GOVERNED tier improvements cannot be auto-applied",
  "severity": "CRITICAL",
  "details": {
    "risk_tier": "GOVERNED",
    "auto_applicable": true
  }
}
```

**Result**: ❌ Auto-rejected without scoring → Human must review and fix

---

### Example 3: Rate Limit Violation

**Improvement**:
```json
{
  "id": "ghi-789",
  "improvement_type": "CHECKLIST_ITEM",
  "target_table": "leo_protocol_sections",
  "target_operation": "UPDATE",
  "description": "Add RLS verification to EXEC checklist",
  "payload": { ... },
  "risk_tier": "AUTO",
  "evidence": "RLS blocked operations in SD-GTM-INTEL-001"
}
```

**Constitution Check** (assuming 3 AUTO changes already applied today):
- ❌ CONST-007: 4th AUTO change within 24 hours

**Violation Details**:
```json
{
  "rule_code": "CONST-007",
  "message": "Maximum AUTO changes per 24h reached (3)",
  "severity": "CRITICAL",
  "details": {
    "auto_changes_in_24h": 3,
    "max_allowed": 3
  }
}
```

**Result**: ❌ Auto-rejected → Queued for next 24h cycle

---

### Example 4: Same Model Family Violation

**Improvement**: Proposed by Claude Sonnet

**Evaluator**: Claude Opus (same family: Anthropic)

**Constitution Check**:
- ❌ CONST-002: Evaluator from same model family as proposer

**Violation Details**:
```json
{
  "rule_code": "CONST-002",
  "message": "Evaluator cannot be from same model family as proposer",
  "severity": "CRITICAL",
  "details": {
    "evaluator_model": "claude-opus-4-5",
    "proposer_model": "claude-sonnet-4-5",
    "evaluator_family": "anthropic",
    "proposer_family": "anthropic"
  }
}
```

**Result**: ❌ Auto-rejected → Must use different model family (GPT-4, Gemini)

---

### Example 5: Removal Without Retrospective Review

**Improvement**:
```json
{
  "id": "jkl-012",
  "improvement_type": "VALIDATION_RULE",
  "target_table": "leo_validation_rules",
  "target_operation": "DELETE",
  "description": "Remove outdated validation rule PLAN-VAL-006",
  "payload": {
    "rule_id": "PLAN-VAL-006",
    "action": "remove"
  },
  "risk_tier": "GOVERNED",
  "evidence": "Rule no longer needed",
  "source_retro_id": null  // ⚠️ VIOLATION
}
```

**Constitution Check**:
- ⚠️ CONST-008: Removal without reviewing original retrospective

**Violation Details**:
```json
{
  "rule_code": "CONST-008",
  "message": "Removal requires review of original retrospective (Chesterton's Fence)",
  "severity": "MEDIUM",
  "details": {
    "operation": "DELETE",
    "source_retro_id": null
  }
}
```

**Result**: ⚠️ Flagged for review → Proceeds to scoring → Human reviews justification

---

## Amendment Process

### Can the Constitution Be Changed?

**Short Answer**: Yes, but with extreme caution and high barriers.

### Amendment Principles

1. **RLS Immutability**: Constitution rules are immutable at the database level (no UPDATE/DELETE allowed)
2. **Addition-Only**: New rules can be added via INSERT (requires service role)
3. **No Removal**: Existing rules cannot be deleted (Chesterton's Fence)
4. **Supersession**: New rules can supersede old ones (e.g., CONST-001-v2) but old rules remain in database

### Amendment Process

**Step 1: Identify Need**
- Pattern emerges from retrospectives showing constitutional gap
- Multiple improvements violate unstated principle
- Safety incident reveals missing safeguard

**Step 2: Proposal**
- Create Strategic Directive for constitutional amendment
- Document: problem, proposed rule, rationale, impact analysis
- Review with all stakeholders (human oversight required)

**Step 3: Triangulation**
- Use `/triangulation-protocol` to validate with multiple AIs
- Ensure different model families review proposal
- Check for unintended consequences

**Step 4: Database Insertion**
```sql
-- Service role only
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-010',
  'All improvements must include test coverage verification.',
  'quality',
  'Ensures changes do not introduce regressions without tests'
);
```

**Step 5: Validator Update**
- Add `validateConst010()` method to ConstitutionValidator
- Update severity configuration in `config.js`
- Add to aggregate validation in `validate()` method

**Step 6: Documentation Update**
- Update this guide with new rule
- Update CLI guide with new violation examples
- Regenerate CLAUDE.md files

**Step 7: Deployment**
- Create migration for new rule
- Update constitution-validator.js
- Deploy to production
- Monitor for first 30 days

### Historical Amendments

| Amendment | Date | Rule Added | Reason |
|-----------|------|------------|--------|
| Initial | 2026-01-22 | CONST-001 through CONST-009 | Foundation for AI Quality Judge Phase 1 |
| Anthropic Alignment | 2026-01-23 | CONST-010, CONST-011 | Aligned with Anthropic Claude Constitution (SD-LEO-INFRA-CONST-AMEND-001) |

---

## Related Documentation

### Primary References

- **[Self-Improvement System Guide](../guides/self-improvement-system-guide.md)** - Overview of the self-improvement system
- **[Protocol Improvements CLI Guide](../cli/protocol-improvements-cli-guide.md)** - CLI commands for managing improvements
- **[AI Quality Judge Implementation](../../scripts/modules/ai-quality-judge/)** - Technical implementation details
- **[Constitution Validator](../../scripts/modules/ai-quality-judge/constitution-validator.js)** - Enforcement logic

### Related Governance

- **[EVA Manifesto](../../docs/doctrine/EVA_MANIFESTO_v1.md)** - Four Oaths and agent governance
- **[Four Oaths Enforcement](../../lib/governance/four-oaths-enforcement.js)** - Oath validation implementation
- **[Doctrine of Constraint](../../database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql)** - EXEC role limits
- **[Genesis Oath](../../docs/vision/GENESIS_OATH_V3.md)** - Venture creation governance

### Schema Documentation

- **[protocol_constitution Table](../reference/schema/engineer/tables/protocol_constitution.md)** - Auto-generated schema reference
- **[protocol_improvement_queue Table](../reference/schema/engineer/tables/protocol_improvement_queue.md)** - Improvement queue schema

### Implementation Files

| File | Purpose |
|------|---------|
| `scripts/modules/ai-quality-judge/constitution-validator.js` | Validation logic |
| `scripts/modules/ai-quality-judge/config.js` | Severity configuration |
| `scripts/modules/ai-quality-judge/index.js` | AI Quality Judge orchestrator |
| `scripts/protocol-improvements.js` | CLI entry point |
| `database/migrations/20260122_self_improvement_foundation.sql` | Constitution table migration |

---

## Changelog

### Version 1.0.0 (2026-01-23)

**Initial Release**:
- Documented all 9 constitutional rules
- Enforcement mechanisms and severity levels
- Integration with AI Quality Judge
- Technical implementation details
- Use cases and examples
- Amendment process

**Source**: SD-LEO-SELF-IMPROVE-AIJUDGE-001 (Phase 1 Implementation)

---

*This document is part of the LEO Protocol governance framework.*
*Last Updated: 2026-01-23*
*Maintained by: DOCMON Sub-Agent*
