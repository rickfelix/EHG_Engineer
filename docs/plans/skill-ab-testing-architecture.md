# Architecture Plan: Skill Assessment System & Triage Auto-Escalation

## Stack & Repository Decisions
- **Repository**: EHG_Engineer — all skill infrastructure lives here
- **Runtime**: Node.js (ESM), consistent with existing LEO/EVA scripts
- **Database**: Supabase (PostgreSQL) — 2 new tables, 1 new view
- **Skill files**: `.claude/skills/*.md` — YAML frontmatter `description` field is the primary lever
- **LLM**: Not required for Phase 1 (rubric-based scoring is deterministic). Phase 2 may use Claude Haiku for semantic similarity in test corpus evaluation
- **CLI pattern**: `npm run skill:audit` — follows existing `npm run` conventions

## Legacy Deprecation Plan
- **No deprecation required** — this is a new capability layer
- Existing skill files are extended (description frontmatter added), not replaced
- No existing scripts or tables are modified
- Skills without descriptions continue to work via explicit `/command` invocation

## Route & Component Structure

### Module Organization
```
lib/
├── skills/
│   ├── skill-auditor.js          # Core rubric scoring engine
│   ├── skill-parser.js           # Parse .md files, extract frontmatter + metadata
│   ├── rubric-dimensions.js      # Scoring dimension definitions and weights
│   └── conflict-detector.js      # Find overlapping trigger patterns between skills

scripts/
├── skill-audit.js                # CLI: npm run skill:audit
├── skill-test.js                 # CLI: npm run skill:test (Phase 2)
└── skill-ab.js                   # CLI: npm run skill:ab <skill> <variant> (Phase 2)

.claude/skills/
├── skill-audit.md                # New skill: /skill-audit — runs assessment on demand
```

### Scoring Rubric Dimensions
```
1. keyword_coverage    (weight: 0.25) — Does the description contain domain-specific trigger keywords?
2. specificity         (weight: 0.25) — Is the description narrow enough to avoid false triggers?
3. exclusion_clarity   (weight: 0.20) — Does it define when NOT to trigger?
4. action_orientation  (weight: 0.15) — Does it describe what the skill DOES (not just what it IS)?
5. conflict_avoidance  (weight: 0.15) — Does it avoid overlapping with other skill descriptions?
```

Each dimension scored 0-10, weighted, producing a total 0-10 score per skill.

## Data Layer

### New Table: `skill_assessment_scores`
```sql
CREATE TABLE skill_assessment_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_name TEXT NOT NULL,
  skill_file TEXT NOT NULL,
  version TEXT NOT NULL,
  description_text TEXT,
  rubric_scores JSONB NOT NULL,
  total_score NUMERIC(4,2) NOT NULL,
  is_baseline BOOLEAN DEFAULT false,
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessed_by TEXT DEFAULT 'manual'
);

CREATE INDEX idx_skill_scores_name ON skill_assessment_scores(skill_name);
CREATE INDEX idx_skill_scores_baseline ON skill_assessment_scores(is_baseline) WHERE is_baseline = true;
```

### New Table: `skill_ab_test_results` (Phase 2)
```sql
CREATE TABLE skill_ab_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_name TEXT NOT NULL,
  variant_a_desc TEXT NOT NULL,
  variant_b_desc TEXT NOT NULL,
  test_prompts JSONB NOT NULL,
  variant_a_accuracy NUMERIC(5,2),
  variant_b_accuracy NUMERIC(5,2),
  winner TEXT CHECK (winner IN ('a', 'b', 'tie')),
  tested_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New View: `v_skill_health`
```sql
CREATE OR REPLACE VIEW v_skill_health AS
SELECT
  s.skill_name,
  s.skill_file,
  s.description_text,
  s.total_score AS current_score,
  b.total_score AS baseline_score,
  s.total_score - COALESCE(b.total_score, 0) AS delta,
  CASE
    WHEN s.description_text IS NULL THEN 'missing'
    WHEN s.total_score >= 7.0 THEN 'healthy'
    WHEN s.total_score >= 4.0 THEN 'needs_work'
    ELSE 'critical'
  END AS health_status,
  s.assessed_at
FROM skill_assessment_scores s
LEFT JOIN skill_assessment_scores b
  ON b.skill_name = s.skill_name AND b.is_baseline = true
WHERE s.assessed_at = (
  SELECT MAX(assessed_at)
  FROM skill_assessment_scores
  WHERE skill_name = s.skill_name
);
```

## API Surface

### CLI Commands (npm scripts)
| Command | Description | Phase |
|---------|-------------|-------|
| `npm run skill:audit` | Score all skills against rubric, save to DB, show report | 1 |
| `npm run skill:audit -- --baseline` | Same but marks scores as baseline | 1 |
| `npm run skill:test` | Run test corpus against descriptions, measure accuracy | 2 |
| `npm run skill:ab <skill> <variant>` | AB test a description variant | 2 |

### Supabase RPC (none in Phase 1)
Phase 2 may add an RPC for bulk test corpus evaluation.

## Implementation Phases

### Phase 1: Baseline Scoring + Description Addition
**Deliverables:**
1. `lib/skills/skill-parser.js` — Parse all `.md` skill files, extract frontmatter
2. `lib/skills/rubric-dimensions.js` — Define 5 scoring dimensions with weights
3. `lib/skills/skill-auditor.js` — Score each skill against rubric
4. `scripts/skill-audit.js` — CLI entry point, Supabase persistence, report output
5. Migration: `skill_assessment_scores` table + `v_skill_health` view
6. Add `description` frontmatter to 18 skills that lack it
7. `.claude/skills/skill-audit.md` — New `/skill-audit` skill
8. Run baseline: `npm run skill:audit -- --baseline`

**Estimated scope:** ~200-300 LOC across 5-6 files

### Phase 2: Automated Test Harness
**Deliverables:**
1. `lib/skills/conflict-detector.js` — Find overlapping trigger patterns
2. Test corpus: `tests/fixtures/skill-test-corpus.json` — 5-10 labeled prompts per skill
3. `scripts/skill-test.js` — Run corpus, measure precision/recall per skill
4. `scripts/skill-ab.js` — Swap description, re-run, compare
5. Migration: `skill_ab_test_results` table

**Estimated scope:** ~300-400 LOC

### Phase 3: Continuous Improvement (Future)
- Session telemetry integration
- Auto-suggest description improvements
- HEAL-loop integration for skill health

## Testing Strategy
- **Unit tests**: Rubric scoring logic — given a description text, verify correct dimension scores
- **Integration tests**: Full audit pipeline — parse files → score → persist → report
- **Fixture-based**: Test corpus is itself the test fixture; accuracy thresholds are assertions
- **Regression**: Baseline scores must not decrease after description changes (unless intentional)

## Triage Auto-Escalation Components

### Modified Files
```
scripts/modules/triage-gate.js           # Add --estimated-loc, --arch-key flags
scripts/create-quick-fix.js              # Add EVA doc pre-check warning
.claude/skills/leo.md                    # Update /leo create section with auto-escalation logic
```

### Triage Gate Changes (`triage-gate.js`)
```javascript
// New flags
--estimated-loc <number>    // Override default LOC estimate
--arch-key <key>            // Look up architecture plan LOC from EVA

// Logic change
if (archKey) {
  const archLoc = await getArchPlanEstimatedLoc(archKey);
  if (archLoc > 75) return { tier: 3, shouldGate: false, reason: 'arch-plan-override' };
}
if (estimatedLoc && estimatedLoc > tierMaxLoc) {
  return { tier: 3, shouldGate: false, reason: 'loc-override' };
}
```

### Quick Fix Pre-Check (`create-quick-fix.js`)
Before creating the QF, query EVA for matching vision/architecture docs:
```javascript
// If vision or arch plan exists for this topic, warn
const matchingDocs = await queryEVAForTopic(title);
if (matchingDocs.length > 0) {
  console.warn('⚠️ EVA vision/architecture docs exist for this topic.');
  console.warn('   Scope likely exceeds QF limits. Consider full SD instead.');
}
```

### Protocol Update (via `leo_protocol_sections` DB)
Add to Work Item Routing section:
```
| Rule | When architecture plan exists with LOC > 75 | Auto-escalate to Tier 3 (full SD) |
```

### Issue Pattern Registration
```sql
INSERT INTO issue_patterns (pattern_key, title, severity, category, description)
VALUES (
  'PAT-TRIAGE-SCOPE-REDUCTION',
  'Triage gate recommends QF when scope exceeds limits',
  'medium',
  'workflow',
  'When vision/architecture docs exist with LOC estimates exceeding QF tier limits, triage gate should auto-escalate to full SD instead of presenting QF as an option'
);
```

**Estimated additional scope:** ~50-80 LOC across 3 files

## Risk Mitigation
| Risk | Mitigation |
|------|-----------|
| Over-triggering after adding descriptions | Start with conservative/narrow descriptions; measure before broadening |
| Rubric subjectivity | Document scoring criteria with examples; calibrate across 2-3 skills before bulk scoring |
| Test corpus bias | Include both positive (should trigger) and negative (should NOT trigger) prompts per skill |
| Description changes affect all sessions | Phase descriptions through: add conservative → measure → refine |
| Triage override too aggressive | Only override when arch plan exists AND LOC exceeds tier max; preserve manual override option |
