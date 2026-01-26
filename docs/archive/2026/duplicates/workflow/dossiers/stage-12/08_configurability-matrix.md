<!-- ARCHIVED: 2026-01-26T16:26:50.039Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-12\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 12: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, feature

## Overview

This file documents all tunable parameters for **Stage 12: Adaptive Naming Module**, enabling operational flexibility without requiring code changes. Parameters are categorized by substage and decision authority.

**Evidence**: Configuration needs inferred from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-550

---

## Substage 12.1 Parameters (Market Analysis)

### Parameter 1.1: Market Priority Thresholds
**Description**: Criteria for classifying markets as High/Medium/Low priority.

**Default Values**:
- **High Priority**: TAM > $100M, Strategic importance (US, UK, Germany, Japan, China)
- **Medium Priority**: TAM $20M-$100M, Secondary markets (Canada, France, Australia)
- **Low Priority**: TAM < $20M, Tertiary markets (all others)

**Configuration**:
```yaml
market_priority:
  high:
    tam_threshold: 100000000  # $100M USD
    strategic_markets: ["US", "UK", "DE", "JP", "CN"]
  medium:
    tam_threshold: 20000000   # $20M USD
  low:
    tam_threshold: 0          # All others
```

**Decision Authority**: PLAN (approve market prioritization)
**Impact**: Determines resource allocation for cultural assessments
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:535 "Target markets mapped"

### Parameter 1.2: Cultural Risk Scoring
**Description**: Thresholds for flagging markets as high/medium/low cultural risk.

**Default Values**:
- **High Risk**: Phonetic conflict OR negative connotation OR legal restriction detected
- **Medium Risk**: Naming convention mismatch OR competitor similarity
- **Low Risk**: No issues detected

**Configuration**:
```yaml
cultural_risk_scoring:
  high_risk_triggers:
    - phonetic_conflict: true       # Name sounds like offensive word
    - negative_connotation: true    # Cultural negative meaning
    - legal_restriction: true       # Trademark conflict
  medium_risk_triggers:
    - naming_convention_mismatch: true  # Doesn't fit local norms
    - competitor_similarity: 0.7        # >70% similar to competitor
  low_risk:
    default: true                   # No triggers = low risk
```

**Decision Authority**: Cultural Consultant (define triggers), PLAN (approve thresholds)
**Impact**: Determines which markets require name adaptation (vs. keeping primary name)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:536 "Cultural factors assessed"

---

## Substage 12.2 Parameters (Name Adaptation)

### Parameter 2.1: Variation Strategy Selection
**Description**: Decision tree for choosing variation strategy per market risk level.

**Default Values**:
- **High Risk**: Create alternative name (Option C)
- **Medium Risk**: Adapt primary name (Option B)
- **Low Risk**: Keep primary name unchanged (default)

**Configuration**:
```yaml
variation_strategy:
  high_risk_markets:
    strategy: "alternative_name"        # Completely different name
    manual_approval_required: true      # PLAN must approve
  medium_risk_markets:
    strategy: "adapt_primary"           # Modify to avoid issues
    manual_approval_required: false     # Auto-approved if passes validation
  low_risk_markets:
    strategy: "keep_primary"            # No changes
    manual_approval_required: false
```

**Decision Authority**: Translation Specialist (recommend strategy), PLAN (approve high-risk variations)
**Impact**: Balances brand consistency vs. market appropriateness
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:540 "Variations created"

### Parameter 2.2: Translation API Selection
**Description**: Preferred translation service and fallback order.

**Default Values**:
- **Primary**: DeepL (higher quality for European languages)
- **Fallback 1**: Google Translate (broader language coverage)
- **Fallback 2**: Manual translation (native speakers)

**Configuration**:
```yaml
translation_apis:
  primary:
    provider: "deepl"
    api_key: "${DEEPL_API_KEY}"
    languages: ["EN", "DE", "FR", "ES", "IT", "NL", "PL", "PT", "RU"]
  fallback_1:
    provider: "google_translate"
    api_key: "${GOOGLE_TRANSLATE_API_KEY}"
    languages: ["*"]  # All languages
  fallback_2:
    provider: "manual"
    cost_per_word: 0.10  # $0.10 USD per word
```

**Decision Authority**: EXEC (configure APIs), PLAN (approve fallback to manual)
**Impact**: Translation quality, cost, and coverage
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:31-34 "Build automation workflows"

### Parameter 2.3: Phonetic Validation Thresholds
**Description**: Minimum phonetic scores required for approval.

**Default Values**:
- **Excellent**: ≥85/100 (1-2 syllables, common phonemes, easy pronunciation)
- **Acceptable**: 70-84/100 (3 syllables, moderately difficult)
- **Unacceptable**: <70/100 (4+ syllables, tongue-twisters, harsh sounds)

**Configuration**:
```yaml
phonetic_validation:
  threshold_excellent: 85     # Auto-approved
  threshold_acceptable: 70    # Manual review recommended
  threshold_fail: 70          # Must revise variation
  scoring_criteria:
    syllable_count:
      weight: 0.3
      scoring:
        1-2: 100   # Perfect
        3: 70      # Acceptable
        4+: 40     # Poor
    phoneme_commonality:
      weight: 0.4
      scoring:
        common: 100        # Standard sounds in language
        uncommon: 60       # Unusual but pronounceable
        rare: 30           # Difficult phonemes
    pronunciation_ease:
      weight: 0.3
      scoring:
        easy: 100          # Native speakers pronounce correctly on first try
        moderate: 70       # Requires practice
        difficult: 40      # Consistently mispronounced
```

**Decision Authority**: Translation Specialist (define scoring), PLAN (approve thresholds)
**Impact**: Brand pronunciation consistency across markets
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:542 "Phonetics validated"

### Parameter 2.4: Translation Verification Requirements
**Description**: When human verification is required vs. API-only.

**Default Values**:
- **High Priority Markets**: ALWAYS require native speaker verification
- **Medium Priority Markets**: API + spot-check (10% sample)
- **Low Priority Markets**: API-only (no human review)

**Configuration**:
```yaml
translation_verification:
  high_priority_markets:
    human_verification_required: true
    verification_count: 2          # 2 independent native speakers
    consensus_required: true       # Both must approve
  medium_priority_markets:
    human_verification_required: false
    spot_check_percentage: 0.10    # 10% sample
  low_priority_markets:
    human_verification_required: false
    spot_check_percentage: 0.0     # API-only
```

**Decision Authority**: PLAN (approve verification requirements)
**Impact**: Translation quality vs. cost trade-off
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:541 "Translations verified"

---

## Substage 12.3 Parameters (Testing & Validation)

### Parameter 3.1: Market Testing Sample Sizes
**Description**: Target respondent counts per market priority level.

**Default Values**:
- **High Priority Markets**: 200-500 respondents (quantitative) + 2-3 focus groups (qualitative)
- **Medium Priority Markets**: 100-200 respondents + 1-2 focus groups
- **Low Priority Markets**: 50-100 respondents (quantitative only)

**Configuration**:
```yaml
market_testing_sample_sizes:
  high_priority:
    quantitative_min: 200
    quantitative_target: 500
    focus_groups: 2-3
    focus_group_size: 8-10
  medium_priority:
    quantitative_min: 100
    quantitative_target: 200
    focus_groups: 1-2
    focus_group_size: 6-8
  low_priority:
    quantitative_min: 50
    quantitative_target: 100
    focus_groups: 0
```

**Decision Authority**: Market Research Analyst (recommend), PLAN (approve budget)
**Impact**: Statistical confidence vs. cost
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:546 "Market testing complete"

### Parameter 3.2: Market Acceptance Thresholds
**Description**: Minimum acceptance scores required for approval.

**Default Values**:
- **Excellent**: ≥4.0/5.0 (80% acceptance) - Auto-approved
- **Acceptable**: 3.5-3.9/5.0 (70-79% acceptance) - Manual review
- **Unacceptable**: <3.5/5.0 (<70% acceptance) - Requires variation revision

**Configuration**:
```yaml
market_acceptance_thresholds:
  threshold_excellent: 4.0      # Auto-approved
  threshold_acceptable: 3.5     # PLAN review required
  threshold_fail: 3.5           # Must create new variation
  critical_failure: 2.5         # Escalate to LEAD (potential Stage 11 rollback)
```

**Decision Authority**: PLAN (set thresholds), LEAD (approve critical failures)
**Impact**: Launch readiness vs. market fit
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:522 "Market acceptance"

### Parameter 3.3: Cultural Fit Score Thresholds
**Description**: Minimum cultural fit scores (separate from market acceptance).

**Default Values**:
- **Excellent**: ≥85/100 - Auto-approved
- **Acceptable**: 70-84/100 - Manual review
- **Unacceptable**: 60-69/100 - Requires variation revision
- **Critical Failure**: <60/100 - Escalate to LEAD (potential Stage 11 rollback)

**Configuration**:
```yaml
cultural_fit_thresholds:
  threshold_excellent: 85       # Auto-approved
  threshold_acceptable: 70      # PLAN review required
  threshold_fail: 60            # Must revise variation
  critical_failure: 60          # Escalate to LEAD
  critical_market_percentage: 0.30  # If 30%+ markets fail, rollback to Stage 11
```

**Decision Authority**: PLAN (set thresholds), LEAD (approve rollbacks)
**Impact**: Brand integrity vs. market entry speed
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:521 "Cultural fit score"

### Parameter 3.4: Feedback Incorporation Rules
**Description**: When to iterate variations vs. escalate.

**Default Values**:
- **First failure**: Create new variation (return to 12.2)
- **Second failure**: PLAN review (approve 3rd iteration OR escalate)
- **Third failure**: Escalate to LEAD (potential Stage 11 rollback)

**Configuration**:
```yaml
feedback_incorporation:
  max_iterations: 3              # Maximum variation attempts per market
  iteration_1_failure:
    action: "create_new_variation"
    approval_required: false
  iteration_2_failure:
    action: "plan_review"
    approval_required: true
    options: ["iterate_again", "escalate_to_lead", "drop_market"]
  iteration_3_failure:
    action: "escalate_to_lead"
    approval_required: true
    lead_options: ["rollback_stage_11", "drop_market", "accept_lower_score"]
```

**Decision Authority**: PLAN (iterations 1-2), LEAD (iteration 3+)
**Impact**: Recursion frequency and resource consumption
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:547 "Feedback incorporated"

---

## Exit Gate Parameters

### Parameter EG-1: Variations Approval Quorum
**Description**: Who must approve final name variations.

**Default Values**:
- **High Priority Markets**: PLAN + LEAD (both required)
- **Medium Priority Markets**: PLAN (LEAD optional)
- **Low Priority Markets**: PLAN (auto-approved if passes thresholds)

**Configuration**:
```yaml
variation_approval_quorum:
  high_priority_markets:
    required_approvers: ["PLAN", "LEAD"]
    approval_mode: "unanimous"     # All must approve
  medium_priority_markets:
    required_approvers: ["PLAN"]
    approval_mode: "single"
  low_priority_markets:
    required_approvers: ["PLAN"]
    approval_mode: "automatic_if_thresholds_met"
    auto_approve_conditions:
      - cultural_fit_score >= 70
      - market_acceptance >= 3.5
      - phonetic_score >= 70
```

**Decision Authority**: LEAD (define approval process)
**Impact**: Decision velocity vs. quality control
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:528 "Variations approved"

### Parameter EG-2: Localization Completeness Requirements
**Description**: When to allow partial localizations vs. require 100% completion.

**Default Values**:
- **Strict Mode** (default): 100% of markets must have verified localizations
- **Flexible Mode**: Allow 80%+ completion (defer low-priority markets)

**Configuration**:
```yaml
localization_completeness:
  mode: "strict"  # Options: "strict", "flexible"
  strict_mode:
    required_completion: 1.0     # 100% of markets
    allow_deferrals: false
  flexible_mode:
    required_completion: 0.8     # 80% of markets
    allow_deferrals: true
    deferral_criteria:
      - priority: "low"           # Only low-priority markets
      - localization_complexity: "high"  # Complex translations
    deferred_markets_notification: true  # Notify Stage 13
```

**Decision Authority**: PLAN (choose mode), LEAD (approve deferrals)
**Impact**: Launch timeline vs. market coverage
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:529 "Localizations complete"

### Parameter EG-3: Localization Guide Completeness
**Description**: Required sections in localization guide.

**Default Values**:
- Final name matrix (MANDATORY)
- Usage guidelines (MANDATORY)
- Pronunciation guides (MANDATORY)
- Cultural notes (MANDATORY)
- Legal disclaimers (OPTIONAL if no trademark issues)

**Configuration**:
```yaml
localization_guide_requirements:
  mandatory_sections:
    - "final_name_matrix"
    - "usage_guidelines"
    - "pronunciation_guides"
    - "cultural_notes"
  optional_sections:
    - "legal_disclaimers"         # Required if trademark issues exist
    - "competitor_analysis"       # Optional market intelligence
    - "future_expansion"          # Optional roadmap
  validation:
    check_section_completeness: true
    minimum_words_per_section: 100  # Prevent stub sections
```

**Decision Authority**: PLAN (approve guide), QA (validate completeness)
**Impact**: Documentation quality for downstream stages
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:530 "Guidelines updated"

---

## Cross-Substage Parameters

### Parameter CS-1: Budget Caps
**Description**: Maximum spend per substage and overall Stage 12.

**Default Values**:
- **Substage 12.1**: $5,000 (market research, cultural databases)
- **Substage 12.2**: $5,000 (translation APIs, native speakers)
- **Substage 12.3**: $10,000 (market testing, recruitment)
- **Total Stage 12**: $20,000

**Configuration**:
```yaml
budget_caps:
  substage_12_1:
    max_budget: 5000   # USD
    overrun_approval: "PLAN"
  substage_12_2:
    max_budget: 5000
    overrun_approval: "PLAN"
  substage_12_3:
    max_budget: 10000
    overrun_approval: "PLAN"
  total_stage_12:
    max_budget: 20000
    overrun_threshold: 0.5        # 50% overrun triggers LEAD escalation
    escalation_approver: "LEAD"
```

**Decision Authority**: PLAN (approve overruns <50%), LEAD (approve overruns ≥50%)
**Impact**: Cost control vs. quality
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:8 "Requires significant resources"

### Parameter CS-2: Timeline Targets
**Description**: Target durations per substage and overall Stage 12.

**Default Values**:
- **Substage 12.1**: 2-3 days
- **Substage 12.2**: 3-5 days
- **Substage 12.3**: 5-10 days (includes market testing wait)
- **Total Stage 12**: 10-18 days

**Configuration**:
```yaml
timeline_targets:
  substage_12_1:
    target_days: 3
    max_days: 5
    delay_escalation_threshold: 5
  substage_12_2:
    target_days: 4
    max_days: 7
    delay_escalation_threshold: 7
  substage_12_3:
    target_days: 7
    max_days: 14
    delay_escalation_threshold: 14
  total_stage_12:
    target_days: 14
    max_days: 26       # Sum of max_days
    delay_escalation_threshold: 21  # 50% overrun
```

**Decision Authority**: PLAN (manage timeline), LEAD (approve major delays)
**Impact**: Launch timeline vs. thoroughness
**Evidence**: Inferred from substage complexity

### Parameter CS-3: Automation Level
**Description**: Degree of automation per substage (Manual → Assisted → Auto).

**Default Values** (current state per critique):
- **Substage 12.1**: Manual (0-20% automation)
- **Substage 12.2**: Assisted (30-50% automation with API support)
- **Substage 12.3**: Manual (0-20% automation)

**Target Values** (per improvement recommendations):
- **Substage 12.1**: Assisted (60-70% automation with cultural DB integration)
- **Substage 12.2**: Auto (80-90% automation with AI translation + phonetic validation)
- **Substage 12.3**: Assisted (50-60% automation with survey platforms + analytics)

**Configuration**:
```yaml
automation_level:
  progression_mode: "assisted"  # Options: "manual", "assisted", "auto"
  substage_12_1:
    current_level: "manual"
    target_level: "assisted"
    automation_features:
      - "cultural_database_api_integration"
      - "trademark_registry_automation"
      - "risk_scoring_algorithms"
  substage_12_2:
    current_level: "assisted"
    target_level: "auto"
    automation_features:
      - "multi_api_translation_fallback"
      - "automated_ipa_transcription"
      - "ai_phonetic_scoring"
      - "batch_native_speaker_review_dispatch"
  substage_12_3:
    current_level: "manual"
    target_level: "assisted"
    automation_features:
      - "automated_survey_deployment"
      - "real_time_analytics_dashboards"
      - "ai_sentiment_analysis"
```

**Decision Authority**: PLAN (approve automation roadmap), EXEC (implement)
**Impact**: Resource efficiency vs. human judgment
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:550 "progression_mode: Manual → Assisted → Auto"

---

## Configuration Management

### How to Update Parameters

**Procedure**:
1. Propose parameter change (document rationale)
2. Get approval from decision authority (PLAN or LEAD)
3. Update configuration file: `config/stage_12_parameters.yaml`
4. Version configuration (git commit with SD reference)
5. Notify affected agents (localization_strategist, translation_specialist, market_research_analyst)

**Configuration File Location**: `config/stage_12_parameters.yaml`

**Version Control**: All parameter changes MUST be tracked in git with commit message format:
```
chore(stage-12): Update [parameter name] from [old value] to [new value]

Rationale: [Why this change is needed]
Approved-By: [PLAN/LEAD]
SD-Reference: [SD-XXX if applicable]
```

### Parameter Validation

**Validation Rules**:
- Thresholds must be between 0-100 (or 0-5 for Likert scales)
- Budget caps must be positive integers
- Timeline targets must be > 0 days
- Automation levels must be "manual", "assisted", or "auto"
- Required approvers must be valid agent roles

**Validation Script**: `scripts/validate-stage-12-config.js`

**Run validation**:
```bash
npm run validate:stage-12-config
```

---

## Parameter Impact Analysis

### High-Impact Parameters (Require LEAD Approval)
1. **Cultural Fit Thresholds** (Parameter 3.3): Direct impact on Stage 11 rollback frequency
2. **Budget Caps** (Parameter CS-1): Resource allocation at venture level
3. **Variation Approval Quorum** (Parameter EG-1): Decision authority and velocity

### Medium-Impact Parameters (Require PLAN Approval)
1. **Market Acceptance Thresholds** (Parameter 3.2): Launch readiness criteria
2. **Localization Completeness** (Parameter EG-2): Stage 12 exit gate strictness
3. **Timeline Targets** (Parameter CS-2): Resource scheduling

### Low-Impact Parameters (Operational Decisions)
1. **Translation API Selection** (Parameter 2.2): Technical implementation choice
2. **Sample Sizes** (Parameter 3.1): Within approved budget
3. **Automation Level** (Parameter CS-3): Gradual optimization

---

## Recommended Parameter Tuning (Post-Phase 6)

**After Stage 12 is executed 3-5 times**, tune these parameters based on data:

1. **Market Acceptance Threshold** (3.2): Adjust based on actual launch success rates
   - If launches succeed with scores 3.0-3.5: Lower threshold to 3.0
   - If launches fail with scores 3.5-4.0: Raise threshold to 4.0

2. **Cultural Fit Threshold** (3.3): Adjust based on cultural incident rate
   - If no incidents with scores 60-70: Lower threshold to 60
   - If incidents occur with scores 70-80: Raise threshold to 80

3. **Feedback Iteration Count** (3.4): Adjust based on iteration success rates
   - If 2nd iterations rarely succeed: Reduce max to 2 (escalate faster)
   - If 2nd iterations often succeed: Maintain max at 3

4. **Budget Caps** (CS-1): Adjust based on actual spend patterns
   - If consistently under budget: Lower caps to match actuals
   - If consistently over budget: Raise caps or optimize processes

**Proposed SD**: **SD-STAGE12-CONFIG-TUNING-001** - Parameter optimization based on empirical data

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
