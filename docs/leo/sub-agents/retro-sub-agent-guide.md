# Retrospective Sub-Agent Guide

**SD-REFACTOR-RETRO-001: Retrospective Sub-Agent Modularization**
**Updated: SD-LEO-REFAC-TESTING-INFRA-001 (2026-01-23): Quality improvements**

This guide documents the RETRO sub-agent architecture, quality scoring algorithms, and pattern learning integration.

## Recent Improvements (2026-01-23)

**SD-LEO-REFAC-TESTING-INFRA-001** delivered critical quality enhancements to eliminate generic/boilerplate retrospectives:

### Problem
- Retrospectives scored 42-46/100 (below 70/100 quality gate threshold)
- Action items were stripped to plain strings, losing SMART metadata
- Content generation used templates instead of extracting actual SD insights
- All SDs of same type received identical boilerplate learnings

### Solution
1. **Preserved SMART Action Items** (`lib/sub-agents/retro/action-items.js`)
   - Removed string stripping at end of `generateSmartActionItems()`
   - Action items now retain full SMART metadata (owner, deadline, success_criteria, verification_query)
   - Added specific verification queries and real deadlines instead of generic placeholders

2. **SD-Specific Insight Extraction** (`lib/sub-agents/retro/generators.js`)
   - Replaced template-based generators with data extractors
   - New functions: `extractSubAgentInsights()`, `extractPRDInsights()`, `extractHandoffInsights()`, `extractTestEvidence()`
   - Learnings now reference actual SD work: "TESTING initially blocked (2x) then passed (1x) for SD-XXX-001. Resolution required 3 iterations."
   - "What Went Well" and "What Could Improve" pull from actual handoff scores, sub-agent results, and PRD deliverables

### Results
- Quality score: 90/100 (46/100 improvement)
- 16 key learnings with specific SD references
- Zero boilerplate detection patterns
- RETROSPECTIVE_QUALITY_GATE now consistently passes

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| RETRO Sub-Agent | lib/sub-agents/retro.js | Retrospective generation | ~500 |
| Pattern Mapper | lib/learning/pattern-to-subagent-mapper.js | Pattern learning | ~350 |
| Phase Orchestrator | scripts/orchestrate-phase-subagents.js | RETRO orchestration | ~650 |
| Issue Patterns | database table: issue_patterns | Pattern storage | N/A |

---

## 1. Module Boundaries & Mapping

### Architecture Overview

```
lib/sub-agents/retro.js              # Main RETRO sub-agent
  ├── execute()                       # Entry point
  ├── gatherSDMetadata()              # SD info collection
  ├── gatherHandoffHistory()          # Handoff chain analysis
  ├── gatherSubAgentResults()         # Previous sub-agent data
  ├── generateRetrospective()         # Core retrospective logic
  └── storeRetrospective()            # Database persistence

lib/learning/pattern-to-subagent-mapper.js  # Pattern learning
  ├── getPatternBasedSubAgents()      # Query patterns for SD
  ├── analyzeSDAgainstPatterns()      # Match SD to known issues
  └── updatePatternOccurrences()      # Increment pattern counts
```

### Trigger Keywords

```javascript
// From lib/context-aware-sub-agent-selector.js
RETRO_KEYWORDS: [
  'retrospective', 'retro', 'lessons', 'learning',
  'continuous improvement', 'post-mortem', 'review'
]
```

---

## 2. Backward-Compatible Entrypoint

### Canonical Execute Function

```javascript
// lib/sub-agents/retro.js
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔄 Starting RETRO for ${options.sdKey || sdId}...`);

  try {
    // Phase 1: Gather SD metadata
    const sdMetadata = await gatherSDMetadata(sdId);

    // Phase 1.5: Check for existing valid retrospective
    const existing = await checkExistingRetrospective(sdId);
    if (existing && existing.quality_score >= 70) {
      return { verdict: 'PASS', message: 'Valid retrospective exists' };
    }

    // Phases 2-4: Parallel data gathering
    const [prdData, handoffs, subAgentResults] = await Promise.all([
      gatherPRDData(sdId),
      gatherHandoffHistory(sdId),
      gatherSubAgentResults(sdId)
    ]);

    // Phase 5: Generate retrospective
    const retro = await generateRetrospective({
      sd: sdMetadata,
      prd: prdData,
      handoffs,
      subAgentResults,
      options
    });

    // Phase 6: Store retrospective
    const stored = await storeRetrospective(sdId, retro);

    return {
      verdict: 'PASS',
      confidence: retro.quality_score,
      message: `Retrospective generated (quality: ${retro.quality_score}/100)`,
      retrospective_id: stored.id
    };

  } catch (error) {
    return {
      verdict: 'FAIL',
      confidence: 0,
      error: error.message
    };
  }
}
```

### Legacy Compatibility

```javascript
// For backward compatibility with older scripts
export async function generateRetro(sdId, options) {
  console.warn('DEPRECATED: Use execute() instead of generateRetro()');
  return execute(sdId, { name: 'RETRO', code: 'RETRO' }, options);
}

export { execute as run };
export { execute as analyze };
```

---

## 3. Semantic Deduplication Utility

### Finding Deduplication

Retrospective lessons are deduplicated using semantic similarity:

```javascript
// lib/utils/semantic-dedup.js
import crypto from 'crypto';

/**
 * Deduplicate lessons using semantic hashing
 * @param {Array} lessons - Array of lesson strings
 * @returns {Array} Deduplicated lessons
 */
export function deduplicateLessons(lessons) {
  const seen = new Map();
  const deduplicated = [];

  for (const lesson of lessons) {
    // Normalize: lowercase, remove punctuation, trim
    const normalized = lesson
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();

    // Generate semantic key (first 3 words + length bucket)
    const words = normalized.split(/\s+/);
    const key = `${words.slice(0, 3).join('_')}_${Math.floor(words.length / 5)}`;

    if (!seen.has(key)) {
      seen.set(key, lesson);
      deduplicated.push(lesson);
    } else {
      // Keep the longer/more detailed version
      const existing = seen.get(key);
      if (lesson.length > existing.length) {
        const idx = deduplicated.indexOf(existing);
        deduplicated[idx] = lesson;
        seen.set(key, lesson);
      }
    }
  }

  return deduplicated;
}

/**
 * Generate content hash for finding deduplication
 */
export function generateFindingHash(finding) {
  const content = `${finding.type}-${finding.file}-${finding.description.slice(0, 50)}`;
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}
```

---

## 4. Database-Backed Templates

### Retrospective Templates Schema

```sql
-- Table: retrospective_templates
CREATE TABLE retrospective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL,  -- 'sd_completion', 'phase_handoff', 'sprint'
  sections JSONB NOT NULL,
  quality_weights JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Standard Template Structure

```javascript
const SD_COMPLETION_TEMPLATE = {
  template_name: 'sd_completion_standard',
  template_type: 'sd_completion',
  sections: [
    { name: 'executive_summary', required: true, weight: 15 },
    { name: 'objectives_achieved', required: true, weight: 20 },
    { name: 'key_learnings', required: true, weight: 25 },
    { name: 'challenges_faced', required: false, weight: 15 },
    { name: 'action_items', required: true, weight: 15 },
    { name: 'team_satisfaction', required: false, weight: 10 }
  ],
  quality_weights: {
    completeness: 0.30,
    specificity: 0.25,
    actionability: 0.25,
    measurability: 0.20
  }
};
```

### Loading Templates

```javascript
async function loadTemplate(templateType) {
  const { data, error } = await supabase
    .from('retrospective_templates')
    .select('*')
    .eq('template_type', templateType)
    .eq('active', true)
    .single();

  if (error) {
    console.warn(`Template not found, using default for ${templateType}`);
    return DEFAULT_TEMPLATES[templateType];
  }

  return data;
}
```

---

## 5. Quality Scoring Algorithm

### Score Calculation

```javascript
/**
 * Calculate retrospective quality score
 * @param {Object} retro - Retrospective content
 * @param {Object} template - Template with weights
 * @returns {number} Quality score 0-100
 */
function calculateQualityScore(retro, template) {
  const weights = template.quality_weights;
  let score = 0;

  // Completeness (30%)
  const requiredSections = template.sections.filter(s => s.required);
  const completedRequired = requiredSections.filter(s =>
    retro[s.name] && retro[s.name].length > 0
  ).length;
  const completenessScore = (completedRequired / requiredSections.length) * 100;
  score += completenessScore * weights.completeness;

  // Specificity (25%) - measured by detail level
  const avgWordCount = calculateAvgWordCount(retro);
  const specificityScore = Math.min(100, (avgWordCount / 50) * 100);
  score += specificityScore * weights.specificity;

  // Actionability (25%) - presence of action verbs
  const actionVerbs = ['implement', 'add', 'create', 'fix', 'update', 'remove'];
  const actionItems = retro.action_items || [];
  const actionableCount = actionItems.filter(item =>
    actionVerbs.some(verb => item.toLowerCase().includes(verb))
  ).length;
  const actionabilityScore = actionItems.length > 0
    ? (actionableCount / actionItems.length) * 100
    : 0;
  score += actionabilityScore * weights.actionability;

  // Measurability (20%) - presence of metrics/numbers
  const measurablePattern = /\d+%|\d+\s*(minutes|hours|days|files|lines)/gi;
  const measurableMatches = JSON.stringify(retro).match(measurablePattern) || [];
  const measurabilityScore = Math.min(100, measurableMatches.length * 20);
  score += measurabilityScore * weights.measurability;

  return Math.round(score);
}
```

### Score Thresholds

| Score Range | Status | Meaning |
|-------------|--------|---------|
| 90-100 | EXCELLENT | Comprehensive, actionable retrospective |
| 75-89 | GOOD | Solid retrospective with minor gaps |
| 60-74 | ACCEPTABLE | Meets minimum requirements |
| 40-59 | POOR | Significant improvements needed |
| 0-39 | CRITICAL | Retrospective incomplete |

---

## 6. Pattern Learning Integration

### Pattern Extraction

```javascript
// lib/learning/pattern-extractor.js

/**
 * Extract patterns from retrospective for future learning
 * @param {Object} retro - Completed retrospective
 * @returns {Array} Extracted patterns
 */
export async function extractPatterns(retro) {
  const patterns = [];

  // Extract from challenges
  for (const challenge of retro.challenges_faced || []) {
    const category = categorizeIssue(challenge);
    const existing = await findSimilarPattern(challenge, category);

    if (existing) {
      // Update existing pattern
      await updatePatternOccurrence(existing.pattern_id);
    } else {
      // Create new pattern
      patterns.push({
        category,
        issue_summary: challenge,
        occurrence_count: 1,
        severity: determineSeverity(challenge),
        proven_solutions: retro.action_items?.slice(0, 3) || [],
        prevention_checklist: generatePreventionChecklist(challenge)
      });
    }
  }

  return patterns;
}

/**
 * Store extracted patterns in issue_patterns table
 */
export async function storePatterns(patterns) {
  const { data, error } = await supabase
    .from('issue_patterns')
    .insert(patterns.map(p => ({
      ...p,
      pattern_id: `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      status: 'active',
      trend: 'new'
    })));

  return data;
}
```

### Pattern Feedback Loop

```
Retrospective Generated
         ↓
Pattern Extraction
         ↓
issue_patterns Table Updated
         ↓
Next SD Execution
         ↓
Pattern Matching (selectSubAgentsHybrid)
         ↓
Proactive Prevention Checklist
         ↓
Reduced Issue Recurrence
```

---

## 7. Feature Flags & Rollout

### Configuration

```javascript
// Environment variables for RETRO behavior
const RETRO_CONFIG = {
  ENABLE_PATTERN_LEARNING: process.env.RETRO_PATTERN_LEARNING !== 'false',
  ENABLE_LLM_GENERATION: process.env.RETRO_LLM_GENERATION !== 'false',
  MIN_QUALITY_SCORE: parseInt(process.env.RETRO_MIN_QUALITY || '60'),
  MAX_LESSONS: parseInt(process.env.RETRO_MAX_LESSONS || '10'),
  PARALLEL_GATHER: process.env.RETRO_PARALLEL !== 'false'
};
```

### Rollout Playbook

1. **Phase 1: Shadow Mode** (Week 1)
   - Generate retrospectives but don't store
   - Log quality scores for baseline

2. **Phase 2: Optional Storage** (Week 2)
   - Store if quality >= 70
   - Alert on low quality scores

3. **Phase 3: Required Storage** (Week 3+)
   - Store all retrospectives
   - Block handoff if quality < 60

---

## Best Practices

### DO

- Gather data in parallel where independent
- Deduplicate lessons before storing
- Calculate quality score before persisting
- Extract patterns for future learning
- Use templates for consistency

### DON'T

- Don't skip retrospective for small SDs
- Don't store duplicate lessons
- Don't ignore low quality scores
- Don't hardcode template structure
- Don't skip pattern extraction

---

## Related Documentation

- [Sub-Agent Patterns Guide](./sub-agent-patterns-guide.md) - Base patterns
- [Governance Library Guide](./governance-library-guide.md) - Exception handling
- [Design Sub-Agent Guide](./design-sub-agent-guide.md) - DESIGN patterns

---

*Generated for SD-REFACTOR-RETRO-001 | LEO Protocol v4.3.3*
