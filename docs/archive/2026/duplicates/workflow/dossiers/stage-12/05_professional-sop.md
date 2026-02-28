---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Purpose & Scope](#purpose-scope)
- [Pre-Execution Checklist (Entry Gates)](#pre-execution-checklist-entry-gates)
  - [Entry Gate 1: Primary Name Selected](#entry-gate-1-primary-name-selected)
  - [Entry Gate 2: Markets Identified](#entry-gate-2-markets-identified)
  - [Pre-Flight Summary](#pre-flight-summary)
- [Substage 12.1: Market Analysis](#substage-121-market-analysis)
  - [Step 12.1.1: Market Mapping](#step-1211-market-mapping)
  - [Step 12.1.2: Cultural Factors Assessment](#step-1212-cultural-factors-assessment)
  - [Step 12.1.3: Substage 12.1 Validation](#step-1213-substage-121-validation)
- [Substage 12.2: Name Adaptation](#substage-122-name-adaptation)
  - [Step 12.2.1: Variations Creation](#step-1221-variations-creation)
  - [Step 12.2.2: Translations Verification](#step-1222-translations-verification)
  - [Step 12.2.3: Phonetics Validation](#step-1223-phonetics-validation)
  - [Step 12.2.4: Substage 12.2 Validation](#step-1224-substage-122-validation)
- [Substage 12.3: Testing & Validation](#substage-123-testing-validation)
  - [Step 12.3.1: Market Testing Setup](#step-1231-market-testing-setup)
  - [Step 12.3.2: Market Testing Execution](#step-1232-market-testing-execution)
  - [Step 12.3.3: Feedback Incorporation](#step-1233-feedback-incorporation)
  - [Step 12.3.4: Final Selections](#step-1234-final-selections)
  - [Step 12.3.5: Substage 12.3 Validation](#step-1235-substage-123-validation)
- [Exit Gate Validation](#exit-gate-validation)
  - [Exit Gate 1: Variations Approved](#exit-gate-1-variations-approved)
  - [Exit Gate 2: Localizations Complete](#exit-gate-2-localizations-complete)
  - [Exit Gate 3: Guidelines Updated](#exit-gate-3-guidelines-updated)
  - [Exit Summary](#exit-summary)
- [Post-Execution Actions](#post-execution-actions)
  - [1. Update Stage Status](#1-update-stage-status)
  - [2. Trigger Stage 13](#2-trigger-stage-13)
  - [3. Archive Artifacts](#3-archive-artifacts)
  - [4. Metrics Reporting](#4-metrics-reporting)
  - [5. Retrospective](#5-retrospective)
- [Rollback Procedures (Proposed)](#rollback-procedures-proposed)
  - [Rollback Trigger 1: Cultural Fit Score < 60](#rollback-trigger-1-cultural-fit-score-60)
  - [Rollback Trigger 2: Translation Failure Rate > 20%](#rollback-trigger-2-translation-failure-rate-20)
  - [Rollback Trigger 3: Market Acceptance < 50%](#rollback-trigger-3-market-acceptance-50)
- [Tool & Resource Requirements](#tool-resource-requirements)
  - [Software Tools](#software-tools)
  - [Human Resources](#human-resources)
  - [Budget (Estimated)](#budget-estimated)
- [Success Criteria Summary](#success-criteria-summary)

<!-- ARCHIVED: 2026-01-26T16:26:43.678Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-12\05_professional-sop.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 12: Professional Standard Operating Procedure (SOP)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, guide

## Purpose & Scope

This SOP provides step-by-step execution instructions for **Stage 12: Adaptive Naming Module**, covering all three substages from entry gate validation through exit gate completion.

**Authority**: Derived from EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-550

**Audience**: PLAN agent, EXEC implementers, QA validators

**Related Dossier Files**:
- **File 03**: Canonical YAML definition (requirements)
- **File 06**: Agent orchestration (CrewAI mappings)
- **File 09**: Metrics & monitoring (KPI tracking)

---

## Pre-Execution Checklist (Entry Gates)

### Entry Gate 1: Primary Name Selected
**Validation**: Confirm Stage 11 exit gate "Primary name approved" is TRUE.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:525 "Primary name selected"

**Verification Steps**:
1. Query Stage 11 status: `SELECT status, exit_gates_passed FROM stages WHERE id = 11`
2. Confirm `status = 'complete'` AND `exit_gates_passed = TRUE`
3. Retrieve primary name: `SELECT primary_brand_name FROM stage_11_outputs`
4. Validate name is non-null, non-empty, and approved by LEAD

**Failure Action**: BLOCK Stage 12 start; escalate to PLAN for Stage 11 completion.

### Entry Gate 2: Markets Identified
**Validation**: Confirm target markets list exists and is validated.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:526 "Markets identified"

**Verification Steps**:
1. Query markets: `SELECT * FROM target_markets WHERE venture_id = {current_venture}`
2. Confirm `COUNT(*) > 0` (at least one market defined)
3. Validate each market has: region, language, cultural_factors
4. Check markets are approved by PLAN

**Failure Action**: BLOCK Stage 12 start; request market definition from business stakeholders.

### Pre-Flight Summary
✅ Stage 11 complete with primary name locked
✅ Target markets list validated and approved
✅ Cultural factors data available for all markets
✅ Tools/APIs accessible (translation, cultural DB)
✅ Substage 12.1 assignee confirmed

**Proceed to Substage 12.1 when all checkboxes are TRUE.**

---

## Substage 12.1: Market Analysis

**Objective**: Map target markets and assess cultural factors for each.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:532-536 "Market Analysis...Cultural factors assessed"

**Assignee**: PLAN agent (research lead)
**Estimated Duration**: 2-3 days (per 5-10 markets)

### Step 12.1.1: Market Mapping
**Action**: Create comprehensive list of target markets with metadata.

**Procedure**:
1. Review business requirements for geographic scope (e.g., "Launch in US, UK, Germany, Japan")
2. For each market, document:
   - **Region**: Country/region code (ISO 3166)
   - **Language**: Primary language(s) spoken (ISO 639)
   - **Demographics**: Target age, income, segments
   - **Market Size**: TAM/SAM estimates
   - **Priority**: High/Medium/Low (for resource allocation)
3. Store in database: `INSERT INTO target_markets (venture_id, region, language, priority, ...) VALUES (...)`
4. Validate completeness: All required fields populated

**Deliverable**: Market mapping document (database records + summary report)

**Done When**: All target markets have complete metadata records.

### Step 12.1.2: Cultural Factors Assessment
**Action**: Assess cultural sensitivities, phonetics, and localization requirements per market.

**Procedure**:
1. For each target market, research:
   - **Language phonetics**: How primary name sounds in local language
   - **Cultural connotations**: Any negative meanings or associations
   - **Naming conventions**: Local preferences (short names, compound words, etc.)
   - **Legal restrictions**: Trademark conflicts, restricted terms
   - **Competitor landscape**: Similar names in market
2. Use cultural databases (e.g., Hofstede Insights, local trademark registries)
3. Document findings: `INSERT INTO cultural_factors (market_id, phonetic_notes, connotations, restrictions, ...) VALUES (...)`
4. Flag high-risk markets (e.g., "Primary name sounds like offensive word in Japanese")

**Deliverable**: Cultural assessment report (per-market risk flags + recommendations)

**Done When**: All markets have cultural factors assessed and documented.

### Step 12.1.3: Substage 12.1 Validation
**Verification**:
- ✅ Target markets mapped (database records complete)
- ✅ Cultural factors assessed (all markets have reports)
- ✅ Risk flags identified (high-risk markets documented)
- ✅ PLAN approval obtained (sign-off on market scope)

**Exit Criteria**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:535-536 "Target markets mapped...Cultural factors assessed"

**Transition**: Proceed to Substage 12.2 (Name Adaptation)

---

## Substage 12.2: Name Adaptation

**Objective**: Create market-specific name variations, verify translations, validate phonetics.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:537-542 "Name Adaptation...Phonetics validated"

**Assignee**: PLAN + EXEC (design + implementation)
**Estimated Duration**: 3-5 days (per 5-10 markets)

### Step 12.2.1: Variations Creation
**Action**: Generate market-specific name alternatives where primary name is problematic.

**Procedure**:
1. Review cultural assessment reports (from 12.1.2)
2. For markets with HIGH-RISK flags:
   - **Option A**: Transliterate primary name (maintain phonetic similarity)
   - **Option B**: Adapt name (modify to avoid negative connotations)
   - **Option C**: Use alternative name (completely different for that market)
3. For LOW-RISK markets:
   - Keep primary name unchanged (default)
4. Document variations: `INSERT INTO name_variations (market_id, variation_type, localized_name, rationale, ...) VALUES (...)`
5. Create variation matrix (table of primary name vs. market-specific names)

**Deliverable**: Name variations database (per-market alternatives with rationale)

**Done When**: All markets have name variation decision (keep primary OR use alternative).

### Step 12.2.2: Translations Verification
**Action**: For markets requiring translation (non-English), verify accuracy and appropriateness.

**Procedure**:
1. Identify markets with translation requirement (e.g., name has English meaning, need German equivalent)
2. Use translation APIs (Google Translate, DeepL) for initial translation
3. **CRITICAL**: Human review by native speaker (API translation is NOT sufficient)
   - Verify meaning preserved
   - Check for unintended connotations
   - Validate grammar/spelling
4. Document translation: `UPDATE name_variations SET translation_verified = TRUE, verified_by = {reviewer_id}, verified_at = NOW() WHERE id = {variation_id}`
5. For failed translations: Iterate with different phrasing until verified

**Deliverable**: Translation verification log (all translations human-approved)

**Done When**: All translated names have `translation_verified = TRUE`.

### Step 12.2.3: Phonetics Validation
**Action**: Ensure localized names are pronounceable and sound appealing in target language.

**Procedure**:
1. For each name variation, generate IPA (International Phonetic Alphabet) transcription
2. Methods:
   - **Automated**: Use IPA transcription API (e.g., eSpeak, pronunciation dictionaries)
   - **Manual**: Consult with native speakers for phonetic breakdown
3. Assess phonetic appeal:
   - **Easy to pronounce**: ✅ (1-2 syllables, common phonemes)
   - **Moderately difficult**: ⚠️ (3+ syllables, uncommon phonemes)
   - **Difficult/awkward**: ❌ (tongue-twisters, harsh sounds)
4. For failed phonetics: Return to Step 12.2.1 (create new variation)
5. Document validation: `UPDATE name_variations SET phonetics_validated = TRUE, ipa_transcription = {ipa}, phonetic_score = {score} WHERE id = {variation_id}`

**Deliverable**: Phonetic validation report (IPA transcriptions + scores)

**Done When**: All name variations have `phonetics_validated = TRUE` with score ≥ 70/100.

### Step 12.2.4: Substage 12.2 Validation
**Verification**:
- ✅ Variations created (all markets have name decision)
- ✅ Translations verified (human-approved for translated names)
- ✅ Phonetics validated (IPA transcriptions + scores ≥ 70)
- ✅ PLAN approval obtained (sign-off on all variations)

**Exit Criteria**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:540-542 "Variations created...Phonetics validated"

**Transition**: Proceed to Substage 12.3 (Testing & Validation)

---

## Substage 12.3: Testing & Validation

**Objective**: Conduct market testing, incorporate feedback, finalize selections.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:543-548 "Testing & Validation...Final selections made"

**Assignee**: PLAN + QA (market research + validation)
**Estimated Duration**: 5-10 days (includes market testing wait time)

### Step 12.3.1: Market Testing Setup
**Action**: Design and deploy market acceptance tests (surveys, focus groups).

**Procedure**:
1. Define testing methodology:
   - **Quantitative**: Online surveys (100-500 respondents per market)
   - **Qualitative**: Focus groups (5-10 participants per market)
2. Create testing instruments:
   - Survey questions: "How appealing is the name '[localized name]'?" (1-5 scale)
   - Focus group script: Open-ended questions about name perception
3. Recruit participants:
   - Target demographics match market segments (from Step 12.1.1)
   - Use recruitment platforms (e.g., UserTesting, Respondent.io)
4. Deploy tests:
   - Launch surveys via SurveyMonkey/Typeform
   - Schedule focus group sessions (in-person or Zoom)
5. Wait for data collection (3-7 days)

**Deliverable**: Market testing plan + recruitment confirmations

**Done When**: Tests deployed for all priority markets.

### Step 12.3.2: Market Testing Execution
**Action**: Collect and analyze market acceptance data.

**Procedure**:
1. Monitor survey responses (aim for 100+ per market)
2. Conduct focus group sessions (record and transcribe)
3. Analyze quantitative data:
   - **Market acceptance score**: Average survey rating (1-5 scale)
   - **Threshold**: ≥ 3.5/5.0 (70% acceptance)
4. Analyze qualitative data:
   - Identify recurring themes (positive/negative)
   - Flag unexpected connotations or concerns
5. Store results: `INSERT INTO market_testing_results (market_id, acceptance_score, qualitative_notes, ...) VALUES (...)`

**Deliverable**: Market testing results report (scores + qualitative insights)

**Done When**: All markets have testing data collected and analyzed.

### Step 12.3.3: Feedback Incorporation
**Action**: Adjust name variations based on market testing feedback.

**Procedure**:
1. Review results: Identify markets with acceptance score < 3.5/5.0 (FAIL threshold)
2. For failed markets:
   - Analyze qualitative feedback for root cause (e.g., "Name sounds too corporate")
   - **Option A**: Tweak existing variation (minor adjustment)
   - **Option B**: Create new variation (return to Step 12.2.1)
   - **Option C**: Escalate to LEAD (if fundamental issue with primary name)
3. Re-test adjusted variations (mini-survey with 20-50 respondents)
4. Document changes: `UPDATE name_variations SET revision_history = {changes}, retest_score = {score} WHERE id = {variation_id}`
5. Repeat until all markets pass acceptance threshold

**Deliverable**: Feedback incorporation log (changes made + retest results)

**Done When**: All markets have acceptance score ≥ 3.5/5.0.

### Step 12.3.4: Final Selections
**Action**: Lock in final localized names for each market.

**Procedure**:
1. Review all name variations with PLAN + LEAD
2. For each market, select FINAL name (primary or variation)
3. Document selection: `UPDATE name_variations SET is_final = TRUE, selected_at = NOW() WHERE id = {final_variation_id}`
4. Generate final name matrix (table of market → final name)
5. Obtain PLAN/LEAD approval (formal sign-off)

**Deliverable**: Final name selections (locked and approved)

**Done When**: All markets have `is_final = TRUE` for exactly one name variation.

### Step 12.3.5: Substage 12.3 Validation
**Verification**:
- ✅ Market testing complete (all markets tested)
- ✅ Feedback incorporated (acceptance scores ≥ 3.5/5.0)
- ✅ Final selections made (all markets have locked names)
- ✅ PLAN/LEAD approval obtained (formal sign-off)

**Exit Criteria**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:546-548 "Market testing complete...Final selections made"

**Transition**: Proceed to Exit Gate Validation

---

## Exit Gate Validation

### Exit Gate 1: Variations Approved
**Validation**: Confirm all name variations are approved by PLAN/LEAD.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:528 "Variations approved"

**Verification Steps**:
1. Query variations: `SELECT * FROM name_variations WHERE is_final = TRUE`
2. Confirm `COUNT(*) = {number_of_markets}` (one per market)
3. Check approval status: `approval_status = 'approved'` for all
4. Validate approval signatures (PLAN + LEAD sign-off records exist)

**Failure Action**: BLOCK exit; escalate to PLAN for re-approval.

### Exit Gate 2: Localizations Complete
**Validation**: Confirm all translations verified and phonetics validated.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:529 "Localizations complete"

**Verification Steps**:
1. Query localizations: `SELECT * FROM name_variations WHERE is_final = TRUE`
2. For markets requiring translation: Confirm `translation_verified = TRUE`
3. For all markets: Confirm `phonetics_validated = TRUE`
4. Check validation timestamps (recent, not stale)

**Failure Action**: BLOCK exit; return to Substage 12.2 (re-verify).

### Exit Gate 3: Guidelines Updated
**Validation**: Confirm localization guide is published and accessible.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:530 "Guidelines updated"

**Verification Steps**:
1. Check guide exists: `docs/localization/stage-12-guide.md` OR database record
2. Validate guide contents:
   - ✅ Final name matrix (market → name mapping)
   - ✅ Usage guidelines (when to use which variation)
   - ✅ Pronunciation guides (IPA transcriptions)
   - ✅ Cultural notes (dos/don'ts per market)
   - ✅ Legal disclaimers (trademark registrations)
3. Confirm guide is published (accessible to downstream teams)
4. Obtain PLAN sign-off on guide completeness

**Failure Action**: BLOCK exit; complete localization guide documentation.

### Exit Summary
✅ Variations approved (all markets signed off)
✅ Localizations complete (translations + phonetics validated)
✅ Guidelines updated (localization guide published)
✅ All substages complete (12.1, 12.2, 12.3 validated)
✅ Metrics recorded (see File 09 for KPI tracking)

**Mark Stage 12 as COMPLETE when all exit gates pass.**

---

## Post-Execution Actions

### 1. Update Stage Status
**Action**: Mark Stage 12 complete in database.

**Procedure**:
```sql
UPDATE stages
SET status = 'complete',
    exit_gates_passed = TRUE,
    completed_at = NOW()
WHERE id = 12;
```

### 2. Trigger Stage 13
**Action**: Notify Stage 13 that upstream dependency is satisfied.

**Procedure**:
- Send handoff notification to PLAN (Stage 13 can now start)
- Provide Stage 12 outputs (localized names, guide) to Stage 13 team

### 3. Archive Artifacts
**Action**: Store all Stage 12 artifacts in version-controlled repository.

**Artifacts**:
- Market mapping document
- Cultural assessment reports
- Name variations database export
- Translation verification logs
- Phonetic validation reports
- Market testing results
- Feedback incorporation log
- Final name selections
- Localization guide

**Storage**: `docs/stage-12-artifacts/` + database backups

### 4. Metrics Reporting
**Action**: Generate Stage 12 metrics report (see File 09 for KPI definitions).

**Key Metrics**:
- Adaptation coverage: {X}% of markets with finalized names
- Cultural fit score: {Y}/100 average across markets
- Market acceptance: {Z}% positive sentiment average

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:519-522 "metrics:...Market acceptance"

### 5. Retrospective
**Action**: Conduct Stage 12 retrospective with PLAN + EXEC.

**Discussion Topics**:
- What went well? (e.g., automation effectiveness)
- What could improve? (e.g., testing timeline)
- Lessons learned for future naming stages

**Deliverable**: Retrospective notes (inform Stage 12 v2 improvements)

---

## Rollback Procedures (Proposed)

**Note**: Rollback procedures are NOT defined in stages.yaml; these are proposed protocols.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:47-50 "Add Rollback Procedures...Define rollback decision tree"

### Rollback Trigger 1: Cultural Fit Score < 60
**Scenario**: Market testing reveals severe cultural issues with primary name.

**Action**: Escalate to Stage 11 (primary name may need replacement).

**Procedure**:
1. BLOCK Stage 12 progression
2. Document cultural issues in detail (market, connotations, severity)
3. Escalate to LEAD for strategic decision:
   - **Option A**: Abandon problematic market (reduce scope)
   - **Option B**: Create completely different name for that market (high-effort)
   - **Option C**: Return to Stage 11 (select new primary name)
4. If Option C: Roll back Stage 11, re-execute naming process
5. Resume Stage 12 with new primary name

### Rollback Trigger 2: Translation Failure Rate > 20%
**Scenario**: More than 20% of markets have failed translations (cannot verify).

**Action**: Re-evaluate market selection or translation strategy.

**Procedure**:
1. PAUSE Stage 12 at Substage 12.2
2. Analyze translation failures (root cause: API limitations? Complex name?)
3. **Option A**: Switch translation provider (e.g., Google → DeepL)
4. **Option B**: Hire professional translators (increase budget)
5. **Option C**: Reduce market scope (drop problematic markets)
6. Resume Substage 12.2 with revised approach

### Rollback Trigger 3: Market Acceptance < 50%
**Scenario**: Market testing shows majority rejection of localized name.

**Action**: Return to Substage 12.2 (create new variations).

**Procedure**:
1. PAUSE Stage 12 at Substage 12.3
2. Analyze testing feedback (identify specific objections)
3. Generate new name variations (avoid identified issues)
4. Re-test new variations (expedited mini-survey)
5. If still < 50%: Escalate to LEAD (may require Stage 11 rollback)

---

## Tool & Resource Requirements

### Software Tools
- **Translation APIs**: Google Translate, DeepL (API keys required)
- **Cultural Databases**: Hofstede Insights, local trademark registries
- **IPA Transcription**: eSpeak, pronunciation dictionaries
- **Survey Platforms**: SurveyMonkey, Typeform, Google Forms
- **Recruitment**: UserTesting, Respondent.io (for market testing)

### Human Resources
- **PLAN Agent**: Overall stage leadership, decision authority
- **Native Speakers**: Per-market translation verification (1-2 per market)
- **Market Researchers**: Survey design, focus group facilitation
- **QA Validators**: Exit gate verification, metrics tracking

### Budget (Estimated)
- **Translation APIs**: $500-1000 (depending on volume)
- **Market Testing**: $5000-10000 (100-500 respondents × $10-20 per response)
- **Native Speaker Reviews**: $2000-5000 (per-market hourly rates)
- **Total**: $7500-16000 (for 5-10 markets)

---

## Success Criteria Summary

**Stage 12 is COMPLETE when**:
1. ✅ All entry gates validated (primary name, markets identified)
2. ✅ Substage 12.1 complete (markets mapped, cultural factors assessed)
3. ✅ Substage 12.2 complete (variations created, verified, validated)
4. ✅ Substage 12.3 complete (testing done, feedback incorporated, selections made)
5. ✅ All exit gates validated (variations approved, localizations complete, guidelines updated)
6. ✅ Metrics recorded (adaptation coverage, cultural fit, market acceptance)
7. ✅ Artifacts archived (documentation, testing results, guide)
8. ✅ Stage 13 notified (handoff complete)

**Authority**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-550

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
