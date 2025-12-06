# Stage 12: Agent Orchestration & Governance

## Python CrewAI Mappings

### Stage 12 Crew Definition

```python
# Stage 12: Adaptive Naming Module Crew
# Authority: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:506-550

from crewai import Agent, Task, Crew

stage_12_crew = Crew(
    agents=[
        localization_strategist,    # Lead for substage 12.1
        translation_specialist,      # Lead for substage 12.2
        market_research_analyst,     # Lead for substage 12.3
        cultural_consultant,         # Support for all substages
        qa_validator                 # Exit gate validation
    ],
    tasks=[
        market_analysis_task,        # Substage 12.1
        name_adaptation_task,        # Substage 12.2
        testing_validation_task,     # Substage 12.3
        localization_guide_task      # Exit deliverable
    ],
    process="sequential",            # Substages are sequential
    verbose=True
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:531-548 "substages:...12.1...12.2...12.3"

---

## Agent Definitions

### Agent 1: Localization Strategist
**Role**: Lead for Substage 12.1 (Market Analysis)

```python
localization_strategist = Agent(
    role="Localization Strategist",
    goal="Map target markets and assess cultural factors for brand name adaptation",
    backstory="""Expert in international market research and cultural analysis.
    Specializes in identifying naming sensitivities across diverse markets.""",
    tools=[
        market_research_db_tool,     # Access to market data
        cultural_database_tool,      # Hofstede Insights, etc.
        trademark_registry_tool      # Per-market trademark checks
    ],
    verbose=True,
    allow_delegation=True
)
```

**Responsibilities**:
- Execute Steps 12.1.1 (Market Mapping) and 12.1.2 (Cultural Factors Assessment)
- Coordinate with cultural_consultant for deep-dive research
- Deliver market mapping document + cultural assessment reports

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:532-536 "Market Analysis...Cultural factors assessed"

### Agent 2: Translation Specialist
**Role**: Lead for Substage 12.2 (Name Adaptation)

```python
translation_specialist = Agent(
    role="Translation Specialist",
    goal="Create and verify market-specific name variations with phonetic validation",
    backstory="""Multilingual linguist with expertise in brand localization.
    Ensures translations maintain brand integrity while respecting local nuances.""",
    tools=[
        translation_api_tool,        # Google Translate, DeepL
        ipa_transcription_tool,      # Phonetic validation
        native_speaker_network_tool  # Human verification
    ],
    verbose=True,
    allow_delegation=True
)
```

**Responsibilities**:
- Execute Steps 12.2.1 (Variations Creation), 12.2.2 (Translations Verification), 12.2.3 (Phonetics Validation)
- Coordinate with native speakers for human review
- Deliver name variations database with verified translations

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:537-542 "Name Adaptation...Phonetics validated"

### Agent 3: Market Research Analyst
**Role**: Lead for Substage 12.3 (Testing & Validation)

```python
market_research_analyst = Agent(
    role="Market Research Analyst",
    goal="Conduct market testing and validate name acceptance across target markets",
    backstory="""Data-driven researcher specializing in brand perception studies.
    Expert in survey design and qualitative analysis.""",
    tools=[
        survey_platform_tool,        # SurveyMonkey, Typeform
        recruitment_platform_tool,   # UserTesting, Respondent.io
        analytics_tool,              # Data analysis (pandas, scipy)
        focus_group_tool             # Zoom, Miro for facilitation
    ],
    verbose=True,
    allow_delegation=False           # Cannot delegate testing execution
)
```

**Responsibilities**:
- Execute Steps 12.3.1 (Market Testing Setup), 12.3.2 (Execution), 12.3.3 (Feedback Incorporation), 12.3.4 (Final Selections)
- Analyze quantitative and qualitative data
- Deliver market testing results report + final name selections

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:543-548 "Testing & Validation...Final selections made"

### Agent 4: Cultural Consultant (Support)
**Role**: Advisory for all substages (on-demand cultural expertise)

```python
cultural_consultant = Agent(
    role="Cultural Consultant",
    goal="Provide deep cultural insights to avoid naming missteps",
    backstory="""Anthropologist with 20+ years studying cross-cultural communication.
    Specialized in brand perception across Asian, European, and Latin American markets.""",
    tools=[
        cultural_database_tool,
        academic_research_tool,
        native_speaker_network_tool
    ],
    verbose=True,
    allow_delegation=False
)
```

**Responsibilities**:
- Advise localization_strategist on cultural factors (12.1.2)
- Review translation_specialist's variations for cultural appropriateness (12.2.1)
- Interpret market_research_analyst's qualitative feedback (12.3.3)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:513-514 "inputs:...Cultural factors"

### Agent 5: QA Validator
**Role**: Exit gate validation and quality assurance

```python
qa_validator = Agent(
    role="QA Validator",
    goal="Validate all Stage 12 exit gates and ensure deliverable quality",
    backstory="""Quality assurance specialist for multi-stage workflows.
    Expert in gate validation and compliance checking.""",
    tools=[
        database_query_tool,         # Verify data completeness
        documentation_checker_tool,  # Validate guide quality
        metrics_dashboard_tool       # Check KPI thresholds
    ],
    verbose=True,
    allow_delegation=False
)
```

**Responsibilities**:
- Validate Exit Gate 1 (Variations Approved)
- Validate Exit Gate 2 (Localizations Complete)
- Validate Exit Gate 3 (Guidelines Updated)
- Verify metrics meet thresholds (see File 09)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:527-530 "exit:...Guidelines updated"

---

## Task Definitions

### Task 1: Market Analysis (Substage 12.1)

```python
market_analysis_task = Task(
    description="""
    Map all target markets and assess cultural factors:
    1. Create market mapping document (region, language, demographics, priority)
    2. Assess cultural factors (phonetics, connotations, restrictions) per market
    3. Flag high-risk markets requiring name adaptation
    4. Obtain PLAN approval on market scope

    Inputs:
    - Primary brand name (from Stage 11)
    - Target markets list (from business requirements)

    Outputs:
    - Market mapping document (database records)
    - Cultural assessment reports (per-market risk analysis)
    """,
    agent=localization_strategist,
    expected_output="Market mapping + cultural assessment (validated by PLAN)",
    tools=[market_research_db_tool, cultural_database_tool],
    output_file="stage_12_substage_1_market_analysis.json"
)
```

**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:535-536 "Target markets mapped...Cultural factors assessed"

### Task 2: Name Adaptation (Substage 12.2)

```python
name_adaptation_task = Task(
    description="""
    Create market-specific name variations and verify translations:
    1. Generate name variations for high-risk markets (transliteration/adaptation/alternative)
    2. Verify translations with native speakers (human review required)
    3. Validate phonetics with IPA transcription (score ≥ 70/100)
    4. Obtain PLAN approval on all variations

    Inputs:
    - Cultural assessment reports (from Task 1)
    - Primary brand name (from Stage 11)

    Outputs:
    - Name variations database (per-market alternatives)
    - Translation verification logs
    - Phonetic validation reports (IPA + scores)
    """,
    agent=translation_specialist,
    expected_output="Name variations database (all translations verified, phonetics validated)",
    tools=[translation_api_tool, ipa_transcription_tool, native_speaker_network_tool],
    output_file="stage_12_substage_2_name_variations.json",
    context=[market_analysis_task]  # Depends on Task 1 completion
)
```

**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:540-542 "Variations created...Phonetics validated"

### Task 3: Testing & Validation (Substage 12.3)

```python
testing_validation_task = Task(
    description="""
    Conduct market testing and finalize name selections:
    1. Design and deploy market acceptance tests (surveys, focus groups)
    2. Collect and analyze testing data (target: acceptance score ≥ 3.5/5.0)
    3. Incorporate feedback and adjust variations as needed
    4. Finalize name selections (one per market, approved by PLAN/LEAD)

    Inputs:
    - Name variations database (from Task 2)
    - Market segments data (from Task 1)

    Outputs:
    - Market testing results report (scores + qualitative insights)
    - Feedback incorporation log
    - Final name selections (locked and approved)
    """,
    agent=market_research_analyst,
    expected_output="Final name selections (all markets with acceptance score ≥ 3.5/5.0)",
    tools=[survey_platform_tool, recruitment_platform_tool, analytics_tool],
    output_file="stage_12_substage_3_testing_results.json",
    context=[name_adaptation_task]  # Depends on Task 2 completion
)
```

**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:546-548 "Market testing complete...Final selections made"

### Task 4: Localization Guide (Exit Deliverable)

```python
localization_guide_task = Task(
    description="""
    Create comprehensive localization guide for downstream stages:
    1. Compile final name matrix (market → name mapping)
    2. Document usage guidelines (when to use which variation)
    3. Include pronunciation guides (IPA transcriptions)
    4. Add cultural notes (dos/don'ts per market)
    5. Include legal disclaimers (trademark registrations)
    6. Publish guide and obtain PLAN sign-off

    Inputs:
    - Final name selections (from Task 3)
    - Cultural assessment reports (from Task 1)
    - Phonetic validation reports (from Task 2)

    Outputs:
    - Localization guide (markdown document + database records)
    """,
    agent=translation_specialist,  # Best positioned to synthesize naming artifacts
    expected_output="Published localization guide (validated by QA, approved by PLAN)",
    tools=[documentation_generator_tool],
    output_file="docs/localization/stage-12-guide.md",
    context=[testing_validation_task]  # Depends on Task 3 completion
)
```

**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:530 "Guidelines updated"

---

## Governance Mappings

### LEAD Agent Role
**Responsibility**: Strategic oversight and escalation handling

**Involvement Points**:
1. **Entry Gate Approval**: Validate Stage 11 completion and market scope
2. **Substage 12.1 Sign-off**: Approve market mapping and cultural assessments
3. **Substage 12.2 Sign-off**: Approve name variations (especially for high-risk markets)
4. **Substage 12.3 Sign-off**: Approve final name selections
5. **Exit Gate Approval**: Final sign-off on localization guide
6. **Escalations**: Handle rollback decisions (if cultural fit < 60, acceptance < 50%)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:18 "Clear ownership (PLAN)"

**Escalation Triggers**:
- Cultural fit score < 60 → Consider Stage 11 rollback
- Market acceptance < 50% → Re-evaluate primary name
- Budget overrun > 50% → Approve additional resources or scope reduction

### PLAN Agent Role
**Responsibility**: Stage 12 execution leadership and coordination

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:18 "Clear ownership (PLAN)"

**Involvement Points**:
1. **Entry Gate Validation**: Confirm Stage 11 outputs and market list
2. **Crew Orchestration**: Manage stage_12_crew execution (assign tasks, monitor progress)
3. **Substage Reviews**: Validate completion of 12.1, 12.2, 12.3 (per SOP in File 05)
4. **Exit Gate Validation**: Coordinate with qa_validator for gate checks
5. **Handoff to Stage 13**: Deliver localization guide and notify downstream team

**Decision Authority**:
- Approve market scope (which markets to include)
- Approve name variations (which alternatives are acceptable)
- Approve final selections (lock in market-specific names)
- Approve localization guide (final deliverable)

### EXEC Agent Role
**Responsibility**: Implementation of tooling and automation (if required)

**Involvement Points**:
1. **Tooling Setup**: Configure translation APIs, survey platforms, databases
2. **Automation**: Build workflows for translation verification, phonetic validation
3. **Integration**: Connect cultural databases, trademark registries
4. **Testing Support**: Assist market_research_analyst with data collection

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:31-34 "Enhance Automation...Build automation workflows"

**NOT involved in**: Strategic decisions (name variations, market scope) - PLAN authority only

### QA Agent Role
**Responsibility**: Exit gate validation and quality assurance

**Involvement Points**:
1. **Exit Gate 1**: Validate variations approved (all markets signed off)
2. **Exit Gate 2**: Validate localizations complete (translations + phonetics verified)
3. **Exit Gate 3**: Validate guidelines updated (localization guide published)
4. **Metrics Check**: Verify KPI thresholds met (see File 09)
5. **Final Sign-off**: Approve Stage 12 completion

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:527-530 "exit:...Guidelines updated"

---

## Inter-Agent Communication Protocols

### PLAN ↔ LEAD
**Communication Channel**: Direct escalation (high-priority decisions)

**Scenarios**:
- PLAN escalates: Cultural fit score < 60 in key market → LEAD decides: rollback Stage 11 or drop market
- PLAN escalates: Budget overrun → LEAD decides: approve overage or reduce scope
- PLAN requests: Final sign-off on name selections → LEAD reviews and approves

**Frequency**: As-needed (escalations only)

### PLAN ↔ Localization Strategist
**Communication Channel**: Task assignment and progress updates

**Scenarios**:
- PLAN assigns: Market Analysis task (Task 1)
- Strategist reports: Cultural factors assessed → PLAN reviews and approves
- PLAN provides: Feedback on market scope → Strategist adjusts

**Frequency**: Daily during Substage 12.1

### PLAN ↔ Translation Specialist
**Communication Channel**: Task assignment and quality reviews

**Scenarios**:
- PLAN assigns: Name Adaptation task (Task 2)
- Specialist reports: Variations created → PLAN reviews for brand alignment
- PLAN flags: Variation doesn't match brand guidelines → Specialist revises

**Frequency**: Daily during Substage 12.2

### PLAN ↔ Market Research Analyst
**Communication Channel**: Task assignment and results review

**Scenarios**:
- PLAN assigns: Testing & Validation task (Task 3)
- Analyst reports: Testing results (acceptance scores) → PLAN decides: approve or re-test
- PLAN provides: Guidance on feedback incorporation → Analyst adjusts variations

**Frequency**: Daily during Substage 12.3 (data collection period may have gaps)

### Translation Specialist ↔ Cultural Consultant
**Communication Channel**: Advisory consultation (on-demand)

**Scenarios**:
- Specialist requests: Cultural review of name variation for Japanese market
- Consultant provides: Detailed analysis of phonetic/connotation issues
- Specialist incorporates: Consultant's feedback into variation revision

**Frequency**: As-needed (per problematic market)

### QA Validator ↔ PLAN
**Communication Channel**: Gate validation results

**Scenarios**:
- QA validates: Exit Gate 1 (variations approved) → Reports PASS/FAIL to PLAN
- PLAN requests: Re-validation after fixing issues → QA re-checks
- QA blocks: Exit Gate 3 (guide incomplete) → PLAN coordinates completion

**Frequency**: End of each substage + final exit validation

---

## Parallel Execution Opportunities

**Stage 12 substages are SEQUENTIAL** (12.1 → 12.2 → 12.3) due to data dependencies.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:531-548 "substages:...12.1...12.2...12.3"

**However, within substages, parallelization is possible**:

### Substage 12.1 Parallelization
- **Market mapping** (Step 12.1.1) and **Cultural assessment** (Step 12.1.2) can run in parallel IF market list is pre-defined
- Multiple markets can be researched simultaneously (e.g., US and UK in parallel)

### Substage 12.2 Parallelization
- **Translation verification** (Step 12.2.2) and **Phonetics validation** (Step 12.2.3) can run in parallel for different markets
- Multiple native speakers can review different markets simultaneously

### Substage 12.3 Parallelization
- **Market testing** (Step 12.3.2) for all markets can run in parallel (independent surveys/focus groups)
- Data analysis can be parallelized per-market

**Optimization Strategy**: Use parallel execution within substages to reduce overall Stage 12 duration from 10-18 days (sequential) to 7-12 days (parallelized).

---

## Error Handling & Rollback

### Agent-Level Error Handling

**Scenario 1: Translation API Failure**
- **Agent**: translation_specialist
- **Error**: API rate limit exceeded or service outage
- **Handling**:
  1. Retry with exponential backoff (3 attempts)
  2. If still failing: Switch to alternate API (e.g., Google → DeepL)
  3. If all APIs fail: Escalate to PLAN for manual translation approval

**Scenario 2: Market Testing Low Response Rate**
- **Agent**: market_research_analyst
- **Error**: < 50 survey responses after 5 days (target: 100)
- **Handling**:
  1. Increase recruitment incentives (higher payment per response)
  2. Extend data collection period (+2 days)
  3. If still insufficient: Accept lower sample size with statistical disclaimer

**Scenario 3: Cultural Consultant Unavailable**
- **Agent**: cultural_consultant
- **Error**: Subject matter expert not available for critical market
- **Handling**:
  1. Escalate to PLAN: Delay substage 12.1 or proceed without deep-dive review?
  2. If delay unacceptable: Use secondary sources (academic research, AI cultural insights)
  3. Flag market as "partial validation" (higher risk)

### Stage-Level Rollback Protocol

**Rollback Trigger 1: Primary Name Fundamentally Flawed**
- **Detection**: Cultural fit score < 60 in multiple key markets
- **Decision Authority**: LEAD
- **Action**:
  1. BLOCK Stage 12 progression
  2. LEAD calls strategic review: Is primary name salvageable?
  3. If NO: Rollback to Stage 11 (select new primary name)
  4. If YES: Create radical variations for problematic markets (high effort)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-12.md:47-50 "Add Rollback Procedures"

**Rollback Trigger 2: Unacceptable Market Acceptance**
- **Detection**: Market acceptance < 50% across majority of markets
- **Decision Authority**: PLAN (escalates to LEAD if critical)
- **Action**:
  1. PAUSE Stage 12 at Substage 12.3
  2. Analyze root cause: Translation issues? Cultural tone? Phonetics?
  3. Return to Substage 12.2 (create new variations)
  4. If new variations still fail: Escalate to LEAD for Stage 11 rollback

---

## Metrics & Monitoring (Agent Perspective)

Agents track these KPIs (detailed in File 09):

### Localization Strategist Metrics
- **Market coverage**: % of markets with completed cultural assessments
- **Risk identification rate**: % of markets flagged as high-risk (expect 20-40%)

### Translation Specialist Metrics
- **Translation success rate**: % of translations verified on first attempt (target: ≥80%)
- **Phonetic score**: Average phonetic validation score across all markets (target: ≥70/100)

### Market Research Analyst Metrics
- **Response rate**: Survey responses per market (target: ≥100)
- **Market acceptance**: Average acceptance score across markets (target: ≥3.5/5.0)

### QA Validator Metrics
- **Gate pass rate**: % of exit gates passed on first validation (target: 100%)
- **Defect detection**: Number of quality issues caught before PLAN sign-off

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:519-522 "metrics:...Market acceptance"

---

## Agent Outputs & Artifacts

### Localization Strategist Outputs
- `stage_12_substage_1_market_analysis.json` (database export)
- `docs/stage-12-artifacts/market-mapping.md` (summary report)
- `docs/stage-12-artifacts/cultural-assessments/{market_id}.md` (per-market reports)

### Translation Specialist Outputs
- `stage_12_substage_2_name_variations.json` (database export)
- `docs/stage-12-artifacts/translation-verification-logs.csv`
- `docs/stage-12-artifacts/phonetic-validation-reports.csv`
- `docs/localization/stage-12-guide.md` (FINAL DELIVERABLE)

### Market Research Analyst Outputs
- `stage_12_substage_3_testing_results.json` (database export)
- `docs/stage-12-artifacts/market-testing-results.xlsx` (raw data)
- `docs/stage-12-artifacts/feedback-incorporation-log.md`
- `docs/stage-12-artifacts/final-name-selections.csv`

### QA Validator Outputs
- `stage_12_exit_gate_validation_report.md` (PASS/FAIL for each gate)
- `stage_12_metrics_report.json` (KPI summary)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
