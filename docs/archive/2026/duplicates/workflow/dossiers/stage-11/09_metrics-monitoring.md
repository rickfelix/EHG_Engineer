<!-- ARCHIVED: 2026-01-26T16:26:52.070Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-11\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 11: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**KPIs Defined**: 3 metrics from stages.yaml
**Monitoring State**: ⚠️ Not Implemented (no automated tracking)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:474-477 "metrics: Brand strength score, Trademark availability, Market resonance"

---

## Key Performance Indicators (KPIs)

### 1. Brand Strength Score

**Definition**: Composite score (0-100) measuring brand name quality across 4 dimensions

**Formula**:
```
Brand Strength Score = (
  Memorability (0-25) +
  Differentiation (0-25) +
  Relevance (0-25) +
  Linguistic Quality (0-25)
)

Where:
- Memorability: Easy to remember, recall, spell
- Differentiation: Distinct from competitors, unique
- Relevance: Aligns with brand strategy, market positioning
- Linguistic Quality: Phonetics, connotations, cross-cultural fit
```

**Data Source**:
- **Automated scoring**: AI analysis (linguistic models, competitor database)
- **Manual scoring**: Brand strategist evaluation (if automation unavailable)

**Threshold**: ≥70/100 to advance from Substage 11.1 to 11.2 (proposed)

**Measurement Frequency**: One-time per name candidate (during Substage 11.1)

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:475 "metrics: Brand strength score"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:37-39 "Missing threshold values" (gap)

---

#### Memorability Sub-Metric (0-25)

**Calculation**:
```
Memorability = (
  Syllable Score (0-10) +      // 2-3 syllables optimal (10 pts), 1 or 4+ syllables (5 pts), 5+ syllables (0 pts)
  Phonetic Simplicity (0-10) + // Easy pronunciation (10 pts), medium (5 pts), complex (0 pts)
  Spelling Simplicity (0-5)    // Common spelling (5 pts), uncommon (2 pts), very unusual (0 pts)
)
```

**Example**:
- "Zephyr": 2 syllables (10) + easy pronunciation (8) + uncommon spelling (2) = **20/25**
- "CloudForge": 2 syllables (10) + easy pronunciation (10) + common spelling (5) = **25/25**

---

#### Differentiation Sub-Metric (0-25)

**Calculation**:
```
Differentiation = (
  Competitor Similarity (0-15) +  // No similar competitor names (15 pts), some similarity (7 pts), very similar (0 pts)
  Naming Pattern Uniqueness (0-10) // Unique pattern (10 pts), common pattern (5 pts), generic (0 pts)
)

Competitor Similarity = 15 - (similarCompetitorNames.length * 3)  // Capped at 0
```

**Example**:
- "CloudForge": 2 competitors with "Cloud" prefix (15 - 6 = 9) + compound pattern (5) = **14/25**
- "Zephyr": 0 competitors with "Zephyr" (15) + metaphorical pattern (10) = **25/25**

---

#### Relevance Sub-Metric (0-25)

**Calculation**:
```
Relevance = (
  Brand Strategy Alignment (0-15) + // Strongly aligned (15 pts), partially (7 pts), misaligned (0 pts)
  Market Positioning Fit (0-10)     // Fits target market (10 pts), neutral (5 pts), poor fit (0 pts)
)
```

**Example**:
- "CloudForge" (for cloud infrastructure product): Strong alignment (15) + fits technical market (10) = **25/25**
- "Zephyr" (for cloud infrastructure product): Weak alignment (5) + doesn't convey tech (3) = **8/25**

---

#### Linguistic Quality Sub-Metric (0-25)

**Calculation**:
```
Linguistic Quality = (
  Phonetic Appeal (0-10) +          // Pleasant sound (10 pts), neutral (5 pts), harsh (0 pts)
  Positive Connotations (0-10) +    // Positive associations (10 pts), neutral (5 pts), negative (0 pts)
  Cross-Cultural Safety (0-5)       // No negative translations (5 pts), minor issues (2 pts), offensive (0 pts)
)
```

**Example**:
- "Zephyr": Pleasant sound (10) + positive (gentle breeze) (10) + safe in 5 languages (5) = **25/25**
- "CloudForge": Neutral sound (7) + positive (building) (8) + safe in 5 languages (5) = **20/25**

---

### 2. Trademark Availability

**Definition**: Legal clearance status for brand name (categorical)

**Categories**:
1. **Clear**: No trademark conflicts, no similar marks in same industry class
2. **Low Risk**: Minor phonetic/visual similarities in unrelated industries, attorney approves
3. **Medium Risk**: Some conflicts in related industries, attorney identifies mitigation strategies
4. **High Risk**: Direct conflicts in same industry class, attorney recommends against

**Data Source**:
- **Automated search**: USPTO TESS API, WIPO Global Brand Database, EUIPO eSearch
- **Attorney review**: External trademark attorney opinion (for top 3 candidates)

**Threshold**: "Clear" or "Low Risk" to pass exit gate (proposed)

**Measurement Frequency**: One-time per name candidate (during Substage 11.2)

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:476 "metrics: Trademark availability"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:496 "done_when: Legal clearance obtained"

---

#### Trademark Risk Scoring (Automated Preliminary Assessment)

**Risk Factors**:
```
Risk Score = (
  Exact Match Weight +           // Exact match in same class: +50 pts
  Phonetic Match Weight +        // Phonetic match in same class: +30 pts
  Visual Match Weight +          // Visual match in same class: +20 pts
  Related Industry Weight        // Match in related class: +10 pts
)

Risk Category:
- 0-10 pts: Clear
- 11-30 pts: Low Risk
- 31-60 pts: Medium Risk
- 61+ pts: High Risk
```

**Example**:
- "CloudForge": 0 exact matches (0) + 1 phonetic match in unrelated class (10) + 0 visual (0) + 0 related (0) = **10 pts (Low Risk)**
- "Zephyr": 1 phonetic match in Class 42 (30) + 0 others (0) = **30 pts (Medium Risk)**

---

### 3. Market Resonance

**Definition**: Customer validation score (0-100) measuring brand name appeal to target market

**Formula** (if customer validation implemented):
```
Market Resonance = (
  Top-of-Mind Awareness (0-33) +    // Recall test: unprompted recall after 24 hours
  Brand Association Quality (0-33) + // Positive/negative associations evoked by name
  Purchase Intent (0-34)             // Would you buy from this brand? (1-10 scale, normalized)
)

Top-of-Mind Awareness = (recall_count / sample_size) * 33
Brand Association Quality = (positive_associations - negative_associations) / total_associations * 33
Purchase Intent = (average_purchase_intent / 10) * 34
```

**Data Source**:
- **Customer surveys**: 100-500 respondents from target market
- **Focus groups**: 8-12 participants, qualitative feedback
- **A/B testing**: Real-world testing (if applicable)

**Threshold**: ≥60/100 to pass (proposed, if customer validation enabled)

**Measurement Frequency**: One-time (after final name selection) OR Iterative (test top 3-5 candidates)

**Current Status**: ⚠️ Not implemented (critique line 14: "No customer touchpoint")

**Evidence**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:477 "metrics: Market resonance"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:14, 52-55 "UX/Customer Signal: 1, Customer Integration opportunity"

---

## Secondary Metrics (Process Efficiency)

### 4. Time to Completion (Stage 11 Duration)

**Definition**: Days from Stage 11 start to exit gate validation

**Target**:
- **Manual**: 5-7 business days
- **Assisted** (with automation): 2-3 business days
- **Auto**: <1 business day

**Measurement**: `exit_gate_timestamp - entry_gate_timestamp`

**Dashboard**: Venture timeline view (Stage 11 duration vs target)

**Evidence**: (Proposed metric, addresses critique line 31 "Enhance Automation")

---

### 5. Trademark Search Success Rate

**Definition**: Percentage of name candidates that pass trademark clearance

**Formula**: `(candidates_with_clearance / total_candidates) * 100`

**Target**: ≥30% (at least 3-5 out of 15 candidates should pass)

**Measurement**: Tracked per venture, aggregated across ventures for trend analysis

**Dashboard**: Stage 11 efficiency dashboard (historical success rates)

**Evidence**: (Proposed metric, addresses critique line 24 "Unclear rollback procedures")

---

### 6. Recursion Rate (LEGAL-001 Triggers)

**Definition**: Percentage of ventures that trigger trademark failure recursion

**Formula**: `(ventures_with_LEGAL_001 / total_ventures_in_stage_11) * 100`

**Target**: <20% (most ventures should find trademark-clear name on first attempt)

**Measurement**: Query recursion_events table (trigger_type = 'LEGAL-001')

**Dashboard**: Recursion monitoring dashboard (by trigger type)

**Evidence**: (Proposed metric from File 07 recursion blueprint)

---

## Database Schema (Proposed)

### stage_11_metrics Table

```sql
CREATE TABLE stage_11_metrics (
  id UUID PRIMARY KEY,
  venture_id UUID NOT NULL REFERENCES ventures(id),

  -- Brand Strength Score
  brand_strength_score INTEGER,  -- 0-100
  memorability INTEGER,           -- 0-25
  differentiation INTEGER,        -- 0-25
  relevance INTEGER,              -- 0-25
  linguistic_quality INTEGER,     -- 0-25

  -- Trademark Availability
  trademark_status VARCHAR(20),   -- 'Clear', 'Low Risk', 'Medium Risk', 'High Risk'
  trademark_risk_score INTEGER,   -- 0-100
  trademark_conflicts JSONB,      -- Array of conflicts
  attorney_opinion TEXT,

  -- Market Resonance (optional)
  market_resonance_score INTEGER, -- 0-100 (NULL if not validated)
  top_of_mind_awareness FLOAT,    -- 0-33
  brand_association_quality FLOAT, -- 0-33
  purchase_intent FLOAT,           -- 0-34
  customer_feedback JSONB,         -- Survey/focus group data

  -- Process Metrics
  time_to_completion_days FLOAT,
  recursion_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stage_11_metrics_venture ON stage_11_metrics(venture_id);
CREATE INDEX idx_stage_11_metrics_trademark_status ON stage_11_metrics(trademark_status);
```

---

### name_candidates Table (Proposed)

```sql
CREATE TABLE name_candidates (
  id UUID PRIMARY KEY,
  venture_id UUID NOT NULL REFERENCES ventures(id),
  name VARCHAR(255) NOT NULL,

  -- Scoring
  brand_strength_score INTEGER,  -- 0-100
  memorability INTEGER,           -- 0-25
  differentiation INTEGER,        -- 0-25
  relevance INTEGER,              -- 0-25
  linguistic_quality INTEGER,     -- 0-25

  -- Trademark
  trademark_status VARCHAR(20),   -- 'Clear', 'Low Risk', 'Medium Risk', 'High Risk'
  trademark_risk_score INTEGER,

  -- Domain
  primary_domain VARCHAR(255),
  domain_available BOOLEAN,

  -- Selection
  selected BOOLEAN DEFAULT FALSE,
  selection_rationale TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_name_candidates_venture ON name_candidates(venture_id);
CREATE INDEX idx_name_candidates_selected ON name_candidates(selected);
```

---

## SQL Queries for Dashboards

### Query 1: Brand Strength Distribution (All Candidates)

```sql
-- Show distribution of brand strength scores across all name candidates
SELECT
  CASE
    WHEN brand_strength_score >= 80 THEN 'Excellent (80-100)'
    WHEN brand_strength_score >= 70 THEN 'Strong (70-79)'
    WHEN brand_strength_score >= 60 THEN 'Medium (60-69)'
    ELSE 'Weak (<60)'
  END AS strength_category,
  COUNT(*) AS candidate_count,
  ROUND(AVG(brand_strength_score), 1) AS avg_score
FROM name_candidates
WHERE venture_id = $1  -- Filter by venture
GROUP BY strength_category
ORDER BY avg_score DESC;
```

**Dashboard Use**: Visualize name quality distribution (bar chart)

---

### Query 2: Trademark Success Rate by Methodology

```sql
-- Calculate trademark clearance rate by naming methodology
SELECT
  naming_methodology,
  COUNT(*) AS total_candidates,
  SUM(CASE WHEN trademark_status IN ('Clear', 'Low Risk') THEN 1 ELSE 0 END) AS cleared_candidates,
  ROUND(
    SUM(CASE WHEN trademark_status IN ('Clear', 'Low Risk') THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100,
    1
  ) AS clearance_rate_pct
FROM name_candidates
WHERE venture_id = $1
GROUP BY naming_methodology
ORDER BY clearance_rate_pct DESC;
```

**Dashboard Use**: Identify which naming methodologies have highest trademark success (table or bar chart)

---

### Query 3: Stage 11 Process Efficiency (Across All Ventures)

```sql
-- Calculate average time to completion and recursion rate
SELECT
  COUNT(*) AS total_ventures,
  ROUND(AVG(time_to_completion_days), 1) AS avg_days_to_complete,
  SUM(CASE WHEN recursion_count > 0 THEN 1 ELSE 0 END) AS ventures_with_recursions,
  ROUND(
    SUM(CASE WHEN recursion_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100,
    1
  ) AS recursion_rate_pct
FROM stage_11_metrics
WHERE created_at >= NOW() - INTERVAL '90 days';  -- Last 90 days
```

**Dashboard Use**: Monitor Stage 11 efficiency trends (KPI cards)

---

### Query 4: Market Resonance vs Brand Strength Correlation

```sql
-- Analyze correlation between brand strength score and market resonance
SELECT
  nc.name,
  nc.brand_strength_score,
  m.market_resonance_score,
  m.top_of_mind_awareness,
  m.brand_association_quality,
  m.purchase_intent
FROM name_candidates nc
JOIN stage_11_metrics m ON nc.venture_id = m.venture_id
WHERE nc.selected = TRUE  -- Only selected names
  AND m.market_resonance_score IS NOT NULL  -- Only validated names
ORDER BY nc.brand_strength_score DESC;
```

**Dashboard Use**: Validate scoring algorithm (scatter plot: brand strength vs market resonance)

---

### Query 5: Recursion Triggers by Type (Historical Analysis)

```sql
-- Track recursion events for Stage 11 by trigger type
SELECT
  trigger_type,
  COUNT(*) AS event_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400), 1) AS avg_days_to_resolve,
  SUM(CASE WHEN resolution_action = 'RECURSION_COMPLETED' THEN 1 ELSE 0 END) AS successful_resolutions,
  SUM(CASE WHEN resolution_action = 'CHAIRMAN_OVERRIDE' THEN 1 ELSE 0 END) AS chairman_overrides
FROM recursion_events
WHERE from_stage = 11
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY trigger_type
ORDER BY event_count DESC;
```

**Dashboard Use**: Monitor recursion patterns (table, identify problem areas)

---

## Dashboard Mockups (Proposed)

### Dashboard 1: Stage 11 Execution View (Per Venture)

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Stage 11: Strategic Naming & Brand Foundation               │
│ Venture: VNT-2025-042 | Status: In Progress (Substage 11.2) │
├─────────────────────────────────────────────────────────────┤
│ Name Candidates (15 generated)                              │
│ ┌─────────┬─────────┬──────────┬─────────────┬────────────┐ │
│ │ Name    │ Score   │ Trademark│ Domain      │ Selected?  │ │
│ ├─────────┼─────────┼──────────┼─────────────┼────────────┤ │
│ │ CloudF. │ 77/100  │ Low Risk │ .com avail  │ [Select]   │ │
│ │ Zephyr  │ 83/100  │ Med Risk │ .io avail   │ [Select]   │ │
│ │ ...     │ ...     │ ...      │ ...         │ ...        │ │
│ └─────────┴─────────┴──────────┴─────────────┴────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Metrics Summary                                             │
│ • Brand Strength: 77/100 (top candidate)                    │
│ • Trademark Status: 3/15 cleared (20%)                      │
│ • Market Resonance: Not yet tested                          │
│ • Time Elapsed: 2.5 days / 5-7 days target                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Dashboard 2: Stage 11 Analytics (Historical Trends)

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Stage 11 Analytics (Last 90 Days)                           │
├─────────────────────────────────────────────────────────────┤
│ Process Efficiency                                          │
│ • Avg Time to Complete: 5.2 days (target: 5-7)      ✅     │
│ • Trademark Success Rate: 28% (target: ≥30%)        ⚠️     │
│ • Recursion Rate: 18% (target: <20%)                ✅     │
├─────────────────────────────────────────────────────────────┤
│ Brand Strength Distribution                                 │
│ [Bar Chart: Excellent 12% | Strong 35% | Medium 40% | Weak 13%] │
├─────────────────────────────────────────────────────────────┤
│ Trademark Status Breakdown                                  │
│ [Pie Chart: Clear 15% | Low Risk 25% | Medium 35% | High 25%] │
└─────────────────────────────────────────────────────────────┘
```

---

## Alerting & Notifications (Proposed)

### Alert 1: Trademark Success Rate Below Threshold

**Trigger**: `trademark_clearance_rate < 20%` (after all candidates tested)

**Notification**:
```
⚠️ Stage 11 Alert: Low Trademark Success Rate

Venture: VNT-2025-042
Name Candidates: 15 generated
Cleared: 2/15 (13%, below 30% target)

Action Required:
- Review naming constraints (may be too restrictive)
- Consider alternative naming methodologies
- May trigger LEGAL-001 recursion
```

---

### Alert 2: Time to Completion Exceeding Target

**Trigger**: `time_elapsed > 7 days` (manual mode) OR `time_elapsed > 3 days` (assisted mode)

**Notification**:
```
⏰ Stage 11 Alert: Process Delay

Venture: VNT-2025-042
Current Duration: 8.5 days (target: 5-7 days)
Bottleneck: Substage 11.2 (Trademark Search)

Action Required:
- Check trademark attorney availability
- Consider expedited trademark search
- Update venture timeline
```

---

## Integration with SD-METRICS-FRAMEWORK-001

**Gap**: Stage 11 metrics not yet integrated into centralized metrics framework (if exists).

**Proposed Integration**:
- Register Stage 11 KPIs in metrics registry (Brand Strength Score, Trademark Availability, Market Resonance)
- Define metric collection endpoints (API to submit scores)
- Configure dashboard templates (Execution View, Analytics View)
- Set up alerting rules (trademark success rate, time to completion)

**Cross-Reference**: (Feeds SD-METRICS-FRAMEWORK-001)

**Evidence**: (Proposed integration for future SD implementation)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
