# Audit Retrospective Process: Triangulated Synthesis


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, migration, schema, security

**Date**: 2025-12-28
**Models**: Claude Code, OpenAI ChatGPT, Google Antigravity
**Topic**: Adding Phase 7 (Audit Retrospective) to Runtime Audit Protocol

---

## Consensus Summary

| Aspect | OpenAI | Antigravity | Consensus |
|--------|--------|-------------|-----------|
| Add Phase 7 after SD creation | ✓ | ✓ | **HIGH** |
| Extend existing RETRO (not new agent) | Implicit | ✓ Explicit (`mode='audit_retro'`) | **HIGH** |
| Structured sub-agent contributions | ✓ JSON schema | ✓ JSON in retro_contribution column | **HIGH** |
| Preserve triangulation outputs | ✓ Artifacts table | ✓ `audit_triangulation_log` table | **HIGH** |
| Coverage metrics required | ✓ `audit_metrics` table | ✓ Coverage metric in quality criteria | **HIGH** |
| Verbatim preservation mandatory | ✓ Immutable artifacts | ✓ Quote Chairman 3x minimum | **HIGH** |
| Pattern learning from audit | ✓ Cross-audit patterns | ✓ Pattern mining (NAV-17, NAV-22 → theme) | **HIGH** |
| Time-boxed automation | ✓ ≤15-20 minutes | ✓ 1-click, fully automated | **HIGH** |

---

## Key Architectural Decisions

### 1. Retrospective Timing

| Model | Recommendation |
|-------|----------------|
| **OpenAI** | **Two retros**: Immediate (post-SD-creation) for process/loss prevention + Follow-up (post-execution) for outcomes |
| **Antigravity** | **Single retro** with comprehensive coverage immediately after SD creation |

**Synthesis**: Implement **two-phase approach** but make Phase 1 mandatory and Phase 2 optional:
- **Phase 7A (Mandatory)**: Audit Retrospective immediately after SD creation
- **Phase 7B (Optional)**: Outcome Retrospective after SDs complete (handled by existing RETRO on SD completion)

### 2. Sub-Agent Contribution Model

| Model | Recommendation |
|-------|----------------|
| **OpenAI** | Separate `retrospective_contributions` table with normalized contributor types |
| **Antigravity** | Add `retro_contribution` JSONB column to existing `sub_agent_execution_results` |

**Synthesis**: Use **both approaches** for different purposes:
- Add `retro_contribution` column to `sub_agent_execution_results` (per-execution capture)
- Create `retrospective_contributions` table (aggregated view for retro generation)

### 3. Triangulation Preservation

| Model | Recommendation |
|-------|----------------|
| **OpenAI** | Store artifacts first, summaries second; immutable references |
| **Antigravity** | `audit_triangulation_log` table with per-issue 3-model outputs + consensus score |

**Synthesis**: Create `audit_triangulation_log` table with:
- Issue-level granularity (NAV-xx)
- 3 columns for each model's analysis (Claude, ChatGPT, Antigravity)
- Consensus score (0-100)
- Final decision text

### 4. Chairman Verbatim Weighting

**Antigravity's Unique Insight**:
> "Hardcode a rule in the RETRO agent: If Chairman feedback exists in chairman_feedback table matching this audit, weight it 2x higher than AI consensus."

**Synthesis**: Implement **Chairman Authority Rule**:
- Chairman verbatim = source of truth
- AI consensus can inform but not override Chairman strategic observations
- Aligns with "Two-Track Triangulation" from earlier synthesis

---

## Unified Schema Additions

### 1. Audit Identity Table

```sql
-- Track audits as first-class entities (OpenAI recommendation)
CREATE TABLE runtime_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_file_path TEXT NOT NULL UNIQUE,
  audit_date DATE NOT NULL,
  target_application VARCHAR(50) DEFAULT 'EHG',

  -- Coverage metrics (both models)
  total_findings INTEGER,
  sd_created_count INTEGER,
  deferred_count INTEGER,
  wont_fix_count INTEGER,
  needs_discovery_count INTEGER,
  coverage_pct DECIMAL(5,2),

  -- Triangulation metrics
  triangulation_consensus_rate DECIMAL(5,2),
  verbatim_preservation_rate DECIMAL(5,2),

  -- Timing
  time_to_triage_minutes INTEGER,
  time_to_sd_minutes INTEGER,

  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,  -- When retro completed

  -- Status
  status VARCHAR(20) DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'triaged', 'sd_created', 'retro_complete', 'closed'))
);
```

### 2. Triangulation Log Table (Antigravity)

```sql
-- Preserve 3-model outputs per issue
CREATE TABLE audit_triangulation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES runtime_audits(id),

  -- Issue reference
  issue_id VARCHAR(50) NOT NULL,  -- NAV-xx
  issue_verbatim TEXT,            -- Chairman's exact words

  -- 3-model analysis (immutable)
  claude_analysis TEXT,
  chatgpt_analysis TEXT,
  antigravity_analysis TEXT,

  -- Consensus
  consensus_score INTEGER CHECK (consensus_score BETWEEN 0 AND 100),
  consensus_type VARCHAR(20) CHECK (consensus_type IN ('HIGH', 'MEDIUM', 'LOW', 'DIVERGENT')),
  final_decision TEXT,

  -- Root cause (if triangulated)
  triangulated_root_cause TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Sub-Agent Contribution Column (Antigravity)

```sql
-- Add to existing table
ALTER TABLE sub_agent_execution_results
ADD COLUMN retro_contribution JSONB DEFAULT '{}'::jsonb;

-- Example contribution format:
-- {
--   "observation": "Auth middleware missing error handling",
--   "severity": "HIGH",
--   "pattern_candidate": true,
--   "suggested_action": "Add global error boundary",
--   "evidence_ids": ["NAV-33", "NAV-42"]
-- }
```

### 4. Retrospective Contributions Table (OpenAI)

```sql
-- Normalized multi-voice contributions
CREATE TABLE retrospective_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retro_id UUID REFERENCES retrospectives(id),

  -- Contributor identity
  contributor_type VARCHAR(30) NOT NULL
    CHECK (contributor_type IN ('triangulation_partner', 'sub_agent', 'chairman', 'system')),
  contributor_name VARCHAR(50) NOT NULL,  -- 'Claude', 'ChatGPT', 'Antigravity', 'DATABASE', 'SECURITY', etc.

  -- Structured contribution
  observations JSONB,      -- Array of atomic observations
  risks JSONB,             -- Array of identified risks
  recommendations JSONB,   -- Array of recommendations
  evidence_refs JSONB,     -- Array of NAV-xx, SD-xx references

  -- Metrics
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  scope VARCHAR(50),       -- What area this covers
  time_spent_minutes INTEGER,

  -- Raw text (optional backup)
  raw_text TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_retro_contributions_retro ON retrospective_contributions(retro_id);
CREATE INDEX idx_retro_contributions_contributor ON retrospective_contributions(contributor_type, contributor_name);
```

### 5. Update Retrospectives Table

```sql
-- Add audit support to existing retrospectives table
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;

ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_retro_type_check
CHECK (retro_type IN ('SPRINT', 'SD_COMPLETION', 'INCIDENT', 'AUDIT'));

-- Add audit reference
ALTER TABLE retrospectives
ADD COLUMN audit_id UUID REFERENCES runtime_audits(id);

-- Add audit-specific fields
ALTER TABLE retrospectives
ADD COLUMN triangulation_divergence_insights JSONB,  -- Where models disagreed
ADD COLUMN verbatim_citations JSONB,                 -- Chairman quotes used
ADD COLUMN coverage_analysis JSONB;                  -- Findings → SDs analysis
```

---

## Quality Criteria (Merged)

### Minimum Requirements for Valid Audit Retrospective

| Criterion | Source | Threshold |
|-----------|--------|-----------|
| **Triage Coverage** | Both | 100% of findings have disposition |
| **Verbatim Citations** | Antigravity | ≥3 Chairman quotes |
| **Evidence-Linked Lessons** | OpenAI | Every lesson references NAV-xx |
| **SMART Action Items** | OpenAI | Owner + deadline + success criteria |
| **Divergence Analysis** | Antigravity | ≥1 insight from model disagreement |
| **Process vs Product Split** | Antigravity | Separate "app broken" from "audit broken" |
| **Time Constraint** | Both | ≤15-20 minutes to generate |

### Quality Score Formula

```javascript
const qualityScore = (
  (triageCoverage * 0.25) +           // 25%: All items triaged
  (verbatimCitationCount >= 3 ? 20 : verbatimCitationCount * 7) +  // 20%: Chairman voice
  (evidenceLinkedLessons * 0.20) +    // 20%: Lessons cite evidence
  (smartActionItems * 0.15) +         // 15%: Actionable items
  (divergenceAnalysis ? 10 : 0) +     // 10%: Model disagreement insights
  (processSplit ? 10 : 0)             // 10%: Clear separation
);
```

---

## Process Flow: Phase 7 Implementation

### Phase 7A: Audit Retrospective (Mandatory)

```
1. TRIGGER
   └─ npm run audit:retro --file docs/audits/2025-12-26-navigation-audit.md

2. AGGREGATE DATA
   ├─ Load audit_finding_sd_mapping (all 79 items)
   ├─ Load audit_triangulation_log (3-model outputs)
   ├─ Load chairman_feedback (verbatim text)
   ├─ Load sub_agent_execution_results.retro_contribution (sub-agent insights)
   └─ Load linked SDs from audit_finding_sd_links

3. COMPUTE METRICS
   ├─ Coverage: pending/sd_created/deferred/wont_fix/needs_discovery
   ├─ Triangulation consensus rate
   ├─ Verbatim preservation rate
   └─ Time metrics

4. INVOKE RETRO SUB-AGENT
   └─ RETRO.execute({
        mode: 'audit_retro',
        auditContext: {
          audit_id: '...',
          findings: [...],
          triangulation: [...],
          chairman_verbatim: [...],
          sub_agent_contributions: [...]
        }
      })

5. GENERATE RETROSPECTIVE
   ├─ What went well (in the AUDIT PROCESS)
   ├─ What needs improvement (in the AUDIT PROCESS)
   ├─ Key learnings (from this audit)
   ├─ Divergence insights (where models disagreed)
   ├─ Pattern candidates (for issue_patterns)
   └─ Protocol improvements (for audit methodology)

6. STORE ARTIFACTS
   ├─ Create retrospective (retro_type='AUDIT')
   ├─ Create retrospective_contributions (per voice)
   ├─ Update runtime_audits.status = 'retro_complete'
   ├─ Insert new patterns to issue_patterns
   └─ Queue protocol improvements

7. OUTPUT REPORT
   └─ Display summary with quality score
```

### Script: `scripts/audit-retro.ts`

```typescript
// Usage: npx ts-node scripts/audit-retro.ts --file docs/audits/2025-12-26-navigation-audit.md

interface AuditRetroContext {
  audit_id: string;
  audit_file_path: string;

  // From audit_finding_sd_mapping
  findings: AuditFinding[];

  // From audit_triangulation_log
  triangulation: TriangulationEntry[];

  // From chairman_feedback
  chairman_verbatim: string[];

  // From sub_agent_execution_results.retro_contribution
  sub_agent_contributions: SubAgentContribution[];

  // Computed metrics
  metrics: {
    total_findings: number;
    coverage_pct: number;
    consensus_rate: number;
    verbatim_preservation_rate: number;
  };
}

// Invoke RETRO with audit mode
const retroResult = await execute(audit.sd_id || audit.id, retroSubAgent, {
  mode: 'audit_retro',
  auditContext
});
```

---

## RETRO Sub-Agent Extension

### New Mode: `audit_retro`

Add to `lib/sub-agents/retro.js`:

```javascript
export async function execute(sdId, subAgent, options = {}) {
  const mode = options.mode || 'completion';

  if (mode === 'audit_retro') {
    console.log(`\n📋 Starting RETRO (AUDIT MODE) for ${options.auditContext?.audit_file_path}...`);
    return await generateAuditRetrospective(options.auditContext, results);
  }

  // ... existing completion mode code
}

async function generateAuditRetrospective(auditContext, results) {
  // 1. Analyze coverage
  const coverage = analyzeCoverage(auditContext.findings);

  // 2. Extract divergence insights
  const divergence = analyzeTriangulationDivergence(auditContext.triangulation);

  // 3. Collect sub-agent contributions
  const contributions = aggregateSubAgentContributions(auditContext.sub_agent_contributions);

  // 4. Preserve Chairman verbatim with 2x weighting
  const chairmanInsights = extractChairmanInsights(auditContext.chairman_verbatim);

  // 5. Generate retrospective with quality scoring
  const retro = {
    retro_type: 'AUDIT',
    audit_id: auditContext.audit_id,

    // Process learnings (about the audit itself)
    what_went_well: [
      `Captured ${coverage.total_findings} findings across application`,
      `Triangulation achieved ${coverage.consensus_rate}% consensus rate`,
      ...contributions.what_went_well
    ],

    what_needs_improvement: [
      ...divergence.missed_by_consensus,  // What AI consensus missed
      ...chairmanInsights.improvement_areas  // Chairman's strategic observations
    ],

    // Key learnings from THIS audit
    key_learnings: [
      ...extractPatternCandidates(auditContext.findings),
      ...divergence.model_specific_insights,
      ...chairmanInsights.learnings  // 2x weight
    ],

    // Audit-specific metrics
    coverage_analysis: coverage,
    triangulation_divergence_insights: divergence,
    verbatim_citations: chairmanInsights.citations,

    // Standard fields
    action_items: generateAuditActionItems(coverage, divergence, chairmanInsights),
    quality_score: calculateAuditRetroQuality(coverage, chairmanInsights, divergence)
  };

  return retro;
}
```

---

## Chairman Authority Rule

### Implementation (Antigravity's Insight)

```javascript
function extractChairmanInsights(verbatimList) {
  return {
    citations: verbatimList.slice(0, 10),  // Preserve up to 10 verbatim quotes
    learnings: verbatimList.map(v => ({
      source: 'chairman',
      text: v,
      weight: 2.0,  // 2x weight vs AI consensus
      immutable: true
    })),
    improvement_areas: verbatimList
      .filter(v => v.toLowerCase().includes('first principles') ||
                   v.toLowerCase().includes('needs') ||
                   v.toLowerCase().includes('purpose unclear'))
      .map(v => ({
        observation: v,
        source: 'chairman_authority',
        override_consensus: true  // Chairman can override AI consensus
      }))
  };
}
```

---

## Risk Mitigations

| Risk | Source | Mitigation |
|------|--------|------------|
| **Overhead creep** (>20 min) | OpenAI | Strict template + time-box + automation |
| **Garbage JSON** | OpenAI | Validate against JSON schema |
| **Hallucinated patterns** | Antigravity | Require evidence_ids (NAV-xx) for every pattern |
| **Process bypass** | OpenAI | Make retro mandatory to "close" audit |
| **Meta-work overload** | Antigravity | 1-click automation, user only reviews output |

---

## Implementation Sequence

| Phase | Deliverable | Priority |
|-------|-------------|----------|
| **1** | Add `runtime_audits` table | P1 |
| **1** | Add `audit_triangulation_log` table | P1 |
| **2** | Add `retro_contribution` column to `sub_agent_execution_results` | P1 |
| **2** | Add `retrospective_contributions` table | P2 |
| **3** | Update `retrospectives` table (audit_id, new fields) | P1 |
| **4** | Extend RETRO sub-agent with `mode='audit_retro'` | P1 |
| **5** | Create `scripts/audit-retro.ts` | P1 |
| **6** | Update Runtime Audit Protocol (add Phase 7) | P1 |
| **7** | Create triangulation capture mechanism | P2 |

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| **CREATE** | `database/migrations/YYYYMMDD_audit_retrospective_schema.sql` | All schema additions |
| **MODIFY** | `lib/sub-agents/retro.js` | Add `audit_retro` mode |
| **CREATE** | `scripts/audit-retro.ts` | CLI to trigger audit retrospective |
| **MODIFY** | `scripts/add-runtime-audit-protocol-section.mjs` | Add Phase 7 |
| **CREATE** | `lib/utils/triangulation-capture.js` | Capture 3-model outputs during audit |

---

*Synthesis completed: 2025-12-28*
*Triangulation confidence: HIGH (both models aligned on core architecture)*
*Key unique insight: Chairman Authority Rule (2x weighting) from Antigravity*
