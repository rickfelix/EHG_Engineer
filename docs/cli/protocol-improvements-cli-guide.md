# Protocol Improvements CLI Guide

This guide covers the CLI tools for managing the protocol improvement system that automatically extracts, reviews, and applies improvements from retrospectives.

## Overview

The protocol improvement system consists of:
1. **Extraction**: Automatically scans retrospectives for protocol improvements
2. **Review Queue**: Maintains a queue of pending improvements with auto-apply scoring
3. **Approval Workflow**: Human review and approval before application
4. **Application**: Applies approved improvements to the database
5. **Effectiveness Tracking**: Measures if improvements actually reduce issues

## Installation

All scripts are already installed. Available via npm scripts or direct execution.

## CLI Scripts

### 1. Protocol Improvements Management

**Script**: `scripts/protocol-improvements.js`

#### List Improvements

```bash
# List all improvements
npm run protocol:improvements

# List pending improvements only
npm run protocol:review

# List by status
node scripts/protocol-improvements.js list --status=PENDING
node scripts/protocol-improvements.js list --status=APPROVED
node scripts/protocol-improvements.js list --status=APPLIED

# List by phase
node scripts/protocol-improvements.js list --phase=PLAN
node scripts/protocol-improvements.js list --phase=EXEC

# Limit results
node scripts/protocol-improvements.js list --limit=10
```

#### Review Improvement

```bash
# Show detailed view of a specific improvement
node scripts/protocol-improvements.js review <queue-id>
```

**Output includes**:
- ID, status, source SD
- Category, phase, impact
- Improvement text
- Evidence
- Auto-apply score (0-1)

#### Approve/Reject Improvements

```bash
# Approve an improvement
node scripts/protocol-improvements.js approve <queue-id>

# Reject with reason
node scripts/protocol-improvements.js reject <queue-id> --reason="Not applicable to current workflow"
```

#### AI Quality Judge Evaluation (Phase 1)

**Added**: January 2026 - SD-LEO-SELF-IMPROVE-AIJUDGE-001

Automated evaluation of improvement proposals using:
- Constitution validation (9 immutable rules)
- Russian Judge multi-criterion scoring (0-100)
- Model diversity via triangulation protocol
- GOVERNED pipeline (human approval required)

```bash
# Single improvement evaluation
node scripts/protocol-improvements.js evaluate <queue-id>

# Batch evaluate pending improvements
node scripts/protocol-improvements.js evaluate --all
node scripts/protocol-improvements.js evaluate --all --limit=10 --threshold=70

# Detailed evaluation report
node scripts/protocol-improvements.js evaluation-report <queue-id>

# AI judge statistics
node scripts/protocol-improvements.js judge-stats
```

**Evaluation Output**:
- Constitution check results (PASS/FAIL with violations)
- Multi-criterion scores (safety, specificity, necessity, evidence, atomicity)
- Aggregate score (0-100)
- Recommendation (APPROVE/NEEDS_REVISION/REJECT)
- Confidence level (HIGH/MEDIUM/LOW)
- Human review flag (if required)

**Scoring Criteria**:
| Criterion | Weight | Description |
|-----------|--------|-------------|
| Safety | 25% | Risk assessment and backwards compatibility |
| Specificity | 20% | Concrete, actionable implementation details |
| Necessity | 20% | Clear problem statement and justification |
| Evidence | 20% | Empirical data supporting the improvement |
| Atomicity | 15% | Single, focused change (not multiple unrelated changes) |

**Constitution Rules**:
The Protocol Constitution contains 9 immutable rules that govern self-improvement:
- CONST-001: Human approval for GOVERNED tier
- CONST-002: Separation of proposer and evaluator
- CONST-003: Audit logging requirement
- CONST-004: Reversibility requirement
- CONST-005: Database-first architecture
- CONST-006: Zero-sum complexity
- CONST-007: Rate limiting (max 3 AUTO/24h)
- CONST-008: Chesterton's Fence (review before removal)
- CONST-009: Human FREEZE command

**For complete details**: See [Protocol Constitution Guide](../governance/protocol-constitution-guide.md)

#### Apply Improvements

```bash
# Apply a single improvement (dry run first)
node scripts/protocol-improvements.js apply <queue-id> --dry-run
node scripts/protocol-improvements.js apply <queue-id>

# Auto-apply all eligible improvements (score >= 0.85)
npm run protocol:apply-auto

# Custom threshold
node scripts/protocol-improvements.js apply-auto --threshold=0.90

# Dry run for testing
node scripts/protocol-improvements.js apply-auto --dry-run
```

**Auto-Apply Criteria**:
- Status: APPROVED
- AI Quality Judge score >= threshold (default 70%)
- Auto-apply score >= threshold (default 0.85)
- Safe categories: DOCUMENTATION, TEMPLATE, CHECKLIST
- Evidence quality: Well-documented with examples

#### Effectiveness Tracking

```bash
# View overall effectiveness report
npm run protocol:effectiveness

# View specific improvement effectiveness
node scripts/protocol-improvements.js effectiveness <queue-id>

# Filter by minimum score
node scripts/protocol-improvements.js effectiveness --minScore=70
```

**Effectiveness Metrics**:
- Score: 0-100 (based on issue recurrence reduction)
- Before/After frequency comparison
- Reoccurrence count
- Status: Effective (70+), Moderate (40-69), Ineffective (<40)

#### Rescan Retrospectives

```bash
# Rescan all retrospectives
npm run protocol:rescan

# Rescan since a specific date
node scripts/protocol-improvements.js rescan --since=2025-01-01
```

This command:
1. Extracts improvements from retrospectives
2. Analyzes patterns
3. Calculates auto-apply scores
4. Populates the improvement queue

#### System Statistics

```bash
# View queue statistics
npm run protocol:stats
node scripts/protocol-improvements.js stats
```

**Stats Include**:
- Total improvements
- Breakdown by status (Pending, Approved, Applied, Rejected)
- By category
- By phase
- By impact level

### 2. Handoff Retrospectives

**Script**: `scripts/create-handoff-retrospective.js`

Create focused retrospectives for specific handoff types.

#### Usage

```bash
# Create a PLAN-TO-EXEC handoff retrospective
node scripts/create-handoff-retrospective.js PLAN_TO_EXEC SD-XXX-001

# Create a LEAD-TO-PLAN handoff retrospective
node scripts/create-handoff-retrospective.js LEAD_TO_PLAN SD-XXX-001

# Create a EXEC-TO-PLAN handoff retrospective
node scripts/create-handoff-retrospective.js EXEC_TO_PLAN SD-XXX-001

# Create a PLAN-TO-LEAD handoff retrospective
node scripts/create-handoff-retrospective.js PLAN_TO_LEAD SD-XXX-001
```

#### Interactive Prompts

The script guides you through:

1. **Focus Areas**: Specific to the handoff type
   - LEAD_TO_PLAN: Strategic clarity, simplicity, INVEST criteria
   - PLAN_TO_EXEC: PRD quality, BMAD validation, test plans
   - EXEC_TO_PLAN: Implementation fidelity, test coverage, traceability
   - PLAN_TO_LEAD: Verification, quality gates, ROI

2. **Effectiveness Rating**: For each focus area (Excellent/Good/Fair/Poor/N/A)

3. **Notes**: Observations about each focus area

4. **Improvements**: Suggested improvements for weak areas

5. **Overall Assessment**:
   - Handoff quality rating
   - Success stories
   - Pain points
   - Protocol improvements
   - Quality score (0-100)

#### Output

Creates a retrospective in the database with:
- Structured focus area responses
- Success stories array
- Pain points array
- Protocol improvements array (auto-extracted for queue)
- Quality score
- Handoff type metadata

## Module Structure

The implementation is modular and testable:

```
scripts/modules/protocol-improvements/
├── index.js                              # Module exports
├── ProtocolImprovementOrchestrator.js    # Main coordinator
├── ImprovementRepository.js              # Database operations
├── ImprovementExtractor.js               # Extract from retrospectives
├── ImprovementApplicator.js              # Apply to database
├── EffectivenessTracker.js               # Track effectiveness
└── ValidationGuard.js                    # Security validation
```

### ImprovementExtractor

Extracts improvements from:
- `protocol_improvements` JSONB field (primary)
- `failure_patterns` array
- `what_needs_improvement` for PROCESS_IMPROVEMENT category
- Action items

Auto-applies scores based on:
- Impact level
- Category safety
- Evidence quality
- Phase targeting

### ImprovementApplicator

Applies improvements by category:
- **DOCUMENTATION**: Adds to `leo_protocol_sections`
- **TEMPLATE**: Requires manual file updates
- **CHECKLIST**: Updates checklist sections
- **VALIDATION**: Requires code changes (creates SD)
- **SUB_AGENT**: Updates sub-agent instructions
- **TRIGGER_PATTERN**: Adds to `leo_sub_agent_triggers`
- **ENFORCEMENT**: Requires database migration

### EffectivenessTracker

Measures effectiveness by:
1. Comparing issue frequency before/after application
2. 30-day window before application
3. 7-37 day window after (skip first week for adoption)
4. Tracks reoccurrence in subsequent retrospectives
5. Flags ineffective improvements (<40 score)

## Workflow Example

### 1. After Completing an SD with Retrospective

```bash
# Rescan to extract new improvements
npm run protocol:rescan

# Review pending improvements
npm run protocol:review

# Review specific improvement
node scripts/protocol-improvements.js review abc-123-def

# Approve if good
node scripts/protocol-improvements.js approve abc-123-def

# Or reject if not applicable
node scripts/protocol-improvements.js reject abc-123-def --reason="Already covered in v4.3.3"
```

### 2. Apply Approved Improvements

```bash
# Test with dry run first
node scripts/protocol-improvements.js apply-auto --dry-run

# Apply for real
npm run protocol:apply-auto

# Or apply individually
node scripts/protocol-improvements.js apply abc-123-def
```

### 3. Track Effectiveness (After 7+ Days)

```bash
# View overall effectiveness
npm run protocol:effectiveness

# Check specific improvement
node scripts/protocol-improvements.js effectiveness abc-123-def
```

### 4. Create Handoff Retrospective

After each handoff execution:

```bash
# Create focused retrospective
node scripts/create-handoff-retrospective.js PLAN_TO_EXEC SD-XXX-001

# Follow interactive prompts
# Improvements will be extracted automatically on next rescan
```

## Database Schema

### protocol_improvement_queue

```sql
CREATE TABLE protocol_improvement_queue (
  id UUID PRIMARY KEY,
  retro_id UUID REFERENCES retrospectives(id),
  sd_id TEXT,
  improvement_category TEXT,
  improvement_text TEXT NOT NULL,
  evidence TEXT,
  impact TEXT,
  affected_phase TEXT CHECK (affected_phase IN ('LEAD', 'PLAN', 'EXEC', NULL)),
  status TEXT CHECK (status IN ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED')),
  auto_apply_score NUMERIC(3,2),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  applied_at TIMESTAMPTZ,
  rejection_reason TEXT,
  effectiveness_score INTEGER,
  effectiveness_measured_at TIMESTAMPTZ,
  effectiveness_notes TEXT
);
```

## NPM Scripts Quick Reference

| Command | Description |
|---------|-------------|
| `npm run protocol:improvements` | List all improvements |
| `npm run protocol:review` | List pending improvements |
| `npm run protocol:apply-auto` | Auto-apply eligible improvements |
| `npm run protocol:effectiveness` | Show effectiveness report |
| `npm run protocol:rescan` | Rescan retrospectives |
| `npm run protocol:stats` | Show statistics |

## Best Practices

### Review Process

1. **Weekly Review**: Run `npm run protocol:review` weekly
2. **Batch Approval**: Review and approve/reject in batches
3. **High Impact**: Always manually review high-impact improvements
4. **Evidence Check**: Ensure evidence is clear and specific

### Application Strategy

1. **Dry Run First**: Always test with `--dry-run`
2. **Low Threshold**: Start with higher threshold (0.90) and lower over time
3. **Manual High Risk**: Never auto-apply VALIDATION, ENFORCEMENT, WORKFLOW_PHASE
4. **Regenerate**: System auto-regenerates CLAUDE.md after application

### Effectiveness Tracking

1. **Wait 7 Days**: Don't measure effectiveness before 7 days (adoption period)
2. **Monthly Review**: Review effectiveness monthly
3. **Flag Ineffective**: Automatically flags improvements with <40 score
4. **Iterate**: Use ineffective improvements to improve extraction logic

## Troubleshooting

### No Improvements Extracted

**Cause**: Retrospectives don't have `protocol_improvements` field populated

**Solution**:
```bash
# Check retrospective structure
node scripts/validate-retrospective-schema.js

# Ensure retrospectives include protocol_improvements array
```

### Auto-Apply Score Too Low

**Cause**: Improvement text lacks detail or is high-impact

**Solution**:
- Add more evidence in retrospectives
- Be specific about affected phase
- Use "low" impact for documentation improvements
- Review extraction logic in `ImprovementExtractor.js`

### Application Failed

**Cause**: Target table doesn't exist or schema mismatch

**Solution**:
```bash
# Check error message
# Review target table mapping in ImprovementApplicator.js
# Some categories require manual application (creates SD instead)
```

### Effectiveness Score Null

**Cause**: Not enough time passed since application

**Solution**:
- Wait at least 7 days after application
- Run effectiveness tracking: `npm run protocol:effectiveness`

## Integration with LEO Protocol

The protocol improvement system integrates with:
- **Retrospectives**: Primary data source
- **Handoff System**: Creates handoff-focused retrospectives
- **LEO Protocol Versions**: Applied improvements update active protocol
- **CLAUDE.md Generation**: Auto-regenerates after application
- **Sub-Agents**: Updates sub-agent instructions and triggers

## Recent Improvements (January 2026)

### SD-LEO-PROCESS-IMPROVEMENTS-001: Post Self-Improvement Loop Enhancements

**Status**: Completed (January 23, 2026)
**PR**: #503

Six process improvements discovered during the Self-Improvement Loop implementation:

#### 1. PRD Derivation from SD Fields

**Issue**: PRD creation used placeholder text like "To be defined" instead of deriving values from existing SD fields.

**Fix**: Added three new functions in `scripts/add-prd-to-database-refactored.js`:
- `deriveFunctionalRequirements()` - Extracts from `strategic_objectives` and `key_changes`
- `deriveTestScenarios()` - Extracts from `success_criteria` and `success_metrics`
- `deriveAcceptanceCriteria()` - Derives from `success_criteria`

**Impact**: PRDs now start with meaningful initial values, reducing LLM processing time and improving PRD quality.

#### 2. DESIGN Sub-Agent Expansion

**Issue**: DESIGN sub-agent only triggered for UI/UX keywords, missing backend code-producing work.

**Fix**: Expanded `.claude/agents/design-agent.md` description to include all code-producing SD types (feature, enhancement, bugfix, refactor, performance) and added backend keywords (API endpoint, service layer, controller, database table).

**Impact**: Better validation coverage for all code changes, not just UI work.

#### 3. GATE6_BRANCH_ENFORCEMENT Messaging

**Issue**: Branch auto-switching provided minimal feedback, causing confusion about when branches were created vs switched.

**Fix**: Enhanced `scripts/verify-git-branch-status.js` with clear AUTO-SWITCH and AUTO-CREATED messaging in both verification and summary phases.

**Impact**: Improved UX for automatic git branch management, clearer feedback on branch state changes.

#### 4. Retrospective Enum Error Messages

**Issue**: Database constraint violations for retrospective enums (retro_type, outcome_type) didn't include valid values in error messages.

**Fix**: Added validation in `scripts/validate-retrospective-schema.js`:
- `retro_type` validation with valid values (SPRINT, SD_COMPLETION, INCIDENT, AUDIT)
- `outcome_type` validation with valid values (SUCCESS, PARTIAL, FAILED, BLOCKED)
- New `enhanceConstraintError()` function for database constraint violations

**Impact**: Faster debugging when retrospective creation fails due to enum violations.

#### 5. Deprecated max_tokens Parameter

**Issue**: OpenAI API deprecated `max_tokens` in favor of `max_completion_tokens`.

**Fix**: Updated parameter across 3 files:
- `scripts/modules/prd-llm-service.mjs`
- `scripts/modules/ai-quality-judge/index.js`
- `scripts/modules/shipping/ShippingDecisionEvaluator.js`

**Impact**: API compliance, prevents future deprecation warnings.

#### 6. Deterministic LLM Calls

**Issue**: SD type classification was non-deterministic, causing different results for the same input.

**Fix**: Added `temperature: 0` and `seed: 42` to `scripts/modules/sd-type-classifier.js`.

**Impact**: Reproducible SD type classification results, easier debugging and testing.

---

## Future Enhancements

Planned features:
- AI-assisted improvement extraction
- Pattern clustering for similar improvements
- Automatic SD creation for high-impact improvements
- Improvement effectiveness prediction
- Rollback capability for ineffective improvements
- Integration with git commit analysis

## Support

For issues or questions:
1. Check this guide
2. Review module code in `scripts/modules/protocol-improvements/`
3. Run with `--dry-run` to test safely
4. Create an SD if enhancement needed
