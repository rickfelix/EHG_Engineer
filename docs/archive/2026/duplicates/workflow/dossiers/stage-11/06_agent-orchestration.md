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
- [Agent Roles (Proposed CrewAI Implementation)](#agent-roles-proposed-crewai-implementation)
  - [Primary Agent: BrandStrategist](#primary-agent-brandstrategist)
  - [Supporting Agent: TrademarkAnalyst](#supporting-agent-trademarkanalyst)
  - [Supporting Agent: BrandDesigner](#supporting-agent-branddesigner)
  - [Supporting Agent: LinguisticAnalyzer (Optional, for assisted automation)](#supporting-agent-linguisticanalyzer-optional-for-assisted-automation)
- [CrewAI Workflow (Proposed)](#crewai-workflow-proposed)
  - [Phase 1: Entry Gate Validation](#phase-1-entry-gate-validation)
  - [Phase 2: Substage 11.1 (Name Generation)](#phase-2-substage-111-name-generation)
  - [Phase 3: Substage 11.2 (Trademark Search)](#phase-3-substage-112-trademark-search)
  - [Phase 4: Substage 11.3 (Brand Foundation)](#phase-4-substage-113-brand-foundation)
  - [Phase 5: Exit Gate Validation](#phase-5-exit-gate-validation)
  - [Full Crew Assembly](#full-crew-assembly)
- [Governance Mappings](#governance-mappings)
  - [Chairman Approval Points](#chairman-approval-points)
  - [Quality Gates](#quality-gates)
  - [Metric Thresholds (Proposed)](#metric-thresholds-proposed)
  - [Error Handling](#error-handling)
  - [Rollback Triggers](#rollback-triggers)
- [Integration with SD-CREWAI-ARCHITECTURE-001](#integration-with-sd-crewai-architecture-001)

<!-- ARCHIVED: 2026-01-26T16:26:45.892Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-11\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 11: Agent Orchestration & Governance


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, rls, guide

**Agent Framework**: Python CrewAI (future implementation)

**Current State**: ⚠️ Not Implemented (manual execution by LEAD agent)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:505 "progression_mode: Manual → Assisted → Auto"

---

## Agent Roles (Proposed CrewAI Implementation)

### Primary Agent: BrandStrategist

**Role**: Lead Stage 11 execution, coordinate substages, enforce brand quality

**Responsibilities**:
1. Orchestrate Substage 11.1 (Name Generation)
2. Orchestrate Substage 11.2 (Trademark Search)
3. Orchestrate Substage 11.3 (Brand Foundation)
4. Validate entry gates (positioning defined, market validated)
5. Validate exit gates (name selected, trademark cleared, guidelines set)
6. Escalate to Chairman if all candidates fail trademark search (rollback trigger)

**Tools**:
- Name generation AI (GPT-4 with brand strategy prompt)
- Trademark search APIs (USPTO, WIPO)
- Brand strength scoring algorithm
- Linguistic analysis tools

**Evidence**: (Inferred from Stage 11 ownership pattern, similar to other marketing stages)

---

### Supporting Agent: TrademarkAnalyst

**Role**: Execute trademark search and legal clearance (Substage 11.2)

**Responsibilities**:
1. Perform preliminary trademark search (USPTO, WIPO, EU IPO)
2. Check domain availability (.com, .io, .co)
3. Coordinate with external trademark attorney (if human review required)
4. Assess trademark risk (Clear, Low, Medium, High)
5. Reserve domains for top candidates

**Tools**:
- USPTO TESS API
- WIPO Global Brand Database API
- Domain registrar APIs (GoDaddy, Namecheap)
- WHOIS lookup

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:492-497 "Substage 11.2: Trademark Search"

---

### Supporting Agent: BrandDesigner

**Role**: Create visual identity and brand guidelines (Substage 11.3)

**Responsibilities**:
1. Design logo (wordmark or logomark)
2. Select color palette (primary + secondary + neutral)
3. Choose typography (heading + body fonts)
4. Generate brand guidelines document (PDF)
5. Create templates (business card, letterhead, presentation)

**Tools**:
- Design APIs (if available, e.g., Figma API for template generation)
- Color palette generators
- Font pairing tools
- PDF generation libraries

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:498-503 "Substage 11.3: Brand Foundation"

---

### Supporting Agent: LinguisticAnalyzer (Optional, for assisted automation)

**Role**: Perform linguistic analysis on name candidates (Substage 11.1)

**Responsibilities**:
1. Phonetic analysis (pronunciation, syllable count)
2. Connotation analysis (positive/negative associations)
3. Cross-cultural analysis (meanings in target languages)
4. Spelling complexity assessment
5. Generate linguistic analysis report per candidate

**Tools**:
- Phonetics libraries (CMU Pronouncing Dictionary)
- Translation APIs (Google Translate, DeepL)
- Sentiment analysis (for connotations)
- Etymology databases

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:491 "done_when: Linguistic analysis done"

---

## CrewAI Workflow (Proposed)

### Phase 1: Entry Gate Validation

**Agent**: BrandStrategist

**Workflow**:
```python
from crewai import Agent, Task, Crew

brand_strategist = Agent(
    role="Brand Strategist",
    goal="Develop strategic brand identity and naming conventions",
    backstory="Expert in brand strategy with 15 years experience in naming and identity development",
    tools=[name_generator, trademark_search, brand_scorer]
)

# Task 1: Validate entry gates
validate_entry_gates = Task(
    description="""
    Validate Stage 11 entry gates:
    1. Check market positioning document exists (from Stage 4/6)
    2. Check brand strategy document exists (from Stage 2/3)
    3. Confirm Stage 10 (Technical Review) is complete

    If all gates pass, proceed to Substage 11.1.
    If any gate fails, escalate to Chairman with gap details.
    """,
    agent=brand_strategist,
    expected_output="Entry gates validation report (PASS/FAIL with details)"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:479-481 "entry gates"

---

### Phase 2: Substage 11.1 (Name Generation)

**Agents**: BrandStrategist (lead), LinguisticAnalyzer (support)

**Workflow**:
```python
linguistic_analyzer = Agent(
    role="Linguistic Analyzer",
    goal="Analyze name candidates for phonetics, connotations, cross-cultural fit",
    backstory="Computational linguist with expertise in phonetics and cross-cultural communication",
    tools=[phonetics_analyzer, translation_api, sentiment_analyzer]
)

# Task 2: Generate name candidates
generate_names = Task(
    description="""
    Generate 10-15 name candidates using naming methodologies:
    - Descriptive names (clearly describe product)
    - Invented names (coined words)
    - Metaphorical names (evoke brand attributes)
    - Acronyms (abbreviations)
    - Compound names (combine words)

    Input constraints:
    - Brand strategy (personality, tone, themes)
    - Market positioning (target audience, competitive landscape)
    - Legal requirements (regulatory, geographic, industry)

    Output: Name candidates list (10-15 names with rationale)
    """,
    agent=brand_strategist,
    expected_output="Name candidates list (JSON format with rationale)"
)

# Task 3: Linguistic analysis
analyze_linguistics = Task(
    description="""
    For each name candidate, analyze:
    1. Phonetics: pronunciation, syllable count, memorability
    2. Connotations: positive/negative associations in target languages
    3. Cross-cultural: meanings in other languages (avoid offensive translations)
    4. Spelling: easy to spell, common misspellings
    5. Domain availability: .com available (preliminary check)

    Output: Linguistic analysis report per candidate
    """,
    agent=linguistic_analyzer,
    context=[generate_names],  # Depends on Task 2
    expected_output="Linguistic analysis report (JSON format per candidate)"
)

# Task 4: Score candidates
score_candidates = Task(
    description="""
    Score each name candidate (0-100) on:
    1. Memorability (0-25): easy to remember and recall
    2. Differentiation (0-25): distinct from competitors
    3. Relevance (0-25): aligns with brand strategy and market positioning
    4. Linguistic Quality (0-25): phonetics, connotations, cross-cultural fit

    Select top 5 candidates (score ≥70) for trademark search.

    Output: Scored candidates list (sorted by total score)
    """,
    agent=brand_strategist,
    context=[generate_names, analyze_linguistics],  # Depends on Tasks 2, 3
    expected_output="Scored candidates list (JSON format, sorted)"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:487-491 "Substage 11.1"

---

### Phase 3: Substage 11.2 (Trademark Search)

**Agents**: TrademarkAnalyst (lead), BrandStrategist (approval)

**Workflow**:
```python
trademark_analyst = Agent(
    role="Trademark Analyst",
    goal="Verify trademark availability and secure domain for top candidates",
    backstory="Trademark paralegal with 10 years experience in USPTO and international searches",
    tools=[uspto_api, wipo_api, domain_registrar_api, whois_lookup]
)

# Task 5: Preliminary trademark search
trademark_search = Task(
    description="""
    For top 5 candidates, search trademark databases:
    1. USPTO TESS (US trademarks)
    2. WIPO Global Brand Database (international)
    3. EU IPO eSearch plus (Europe)

    Search for:
    - Exact match (name as proposed)
    - Phonetic match (sounds similar)
    - Visual match (looks similar)
    - Same industry class (Nice Classification Class 42 for software)

    Output: Trademark search report per candidate (CLEAR, LOW RISK, MEDIUM RISK, HIGH RISK)
    """,
    agent=trademark_analyst,
    context=[score_candidates],  # Depends on Task 4
    expected_output="Trademark search report (JSON format per candidate)"
)

# Task 6: Domain availability check
domain_check = Task(
    description="""
    For top 5 candidates, check domain availability:
    - .com (primary, must be available)
    - .io (tech startups, fallback)
    - .co (fallback)
    - Country-specific (if targeting specific markets)

    For unavailable domains, check WHOIS (current owner, expiration, for-sale status).

    Output: Domain availability report per candidate
    """,
    agent=trademark_analyst,
    context=[score_candidates],  # Depends on Task 4
    expected_output="Domain availability report (JSON format per candidate)"
)

# Task 7: Legal clearance coordination
legal_clearance = Task(
    description="""
    For top 3 candidates (lowest trademark risk from Task 5):
    1. Prepare trademark attorney brief (search findings, risk assessment)
    2. Coordinate with external trademark attorney (if human review required)
    3. Obtain legal opinion (CLEAR, LOW RISK, MEDIUM RISK, HIGH RISK)
    4. Document attorney recommendations

    Output: Legal clearance report per candidate
    """,
    agent=trademark_analyst,
    context=[trademark_search, domain_check],  # Depends on Tasks 5, 6
    expected_output="Legal clearance report (JSON format per candidate)"
)

# Task 8: Domain reservation
reserve_domain = Task(
    description="""
    For top 2 candidates (lowest risk from Task 7):
    1. Purchase domain (if available) or initiate acquisition (if owned)
    2. Configure DNS to placeholder page (optional)
    3. Document domain ownership (registrar, expiration, renewal settings)

    Output: Domain reservation confirmation
    """,
    agent=trademark_analyst,
    context=[domain_check, legal_clearance],  # Depends on Tasks 6, 7
    expected_output="Domain reservation confirmation (JSON format)"
)

# Task 9: Final name selection
select_name = Task(
    description="""
    Select final name from top 2 candidates based on:
    1. Trademark risk (prefer CLEAR or LOW RISK)
    2. Domain quality (prefer .com, shorter is better)
    3. Brand strength score (higher score wins)
    4. Market resonance (if customer validation done)

    Document selection rationale.

    Output: Final name selection with rationale
    """,
    agent=brand_strategist,
    context=[score_candidates, trademark_search, domain_check, legal_clearance, reserve_domain],
    expected_output="Final name selection (JSON format with rationale)"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:492-497 "Substage 11.2"

---

### Phase 4: Substage 11.3 (Brand Foundation)

**Agents**: BrandDesigner (lead), BrandStrategist (approval)

**Workflow**:
```python
brand_designer = Agent(
    role="Brand Designer",
    goal="Create visual identity and brand guidelines",
    backstory="Senior brand designer with 12 years experience in visual identity systems",
    tools=[design_api, color_palette_generator, font_pairing_tool, pdf_generator]
)

# Task 10: Define brand values
define_values = Task(
    description="""
    Articulate core values, mission, vision related to selected brand name:
    1. Core values (3-5 values): what brand stands for
    2. Mission statement (1-2 sentences): what brand does
    3. Vision statement (1-2 sentences): where brand is going
    4. Brand promise (1 sentence): what customers can expect

    Output: Brand values document
    """,
    agent=brand_strategist,
    context=[select_name],  # Depends on Task 9
    expected_output="Brand values document (JSON format)"
)

# Task 11: Create visual identity
create_visual_identity = Task(
    description="""
    Design visual identity components:
    1. Logo: wordmark (text-based) or logomark (icon + text)
    2. Color palette: primary + secondary (2-3) + neutral colors
    3. Typography: heading font + body font (max 2 fonts)
    4. Iconography: icon style (line, filled, etc.)

    Output: Visual identity package (logo files, color codes, font licenses)
    """,
    agent=brand_designer,
    context=[select_name, define_values],  # Depends on Tasks 9, 10
    expected_output="Visual identity package (file URLs + metadata JSON)"
)

# Task 12: Document brand guidelines
create_guidelines = Task(
    description="""
    Create brand guidelines document (PDF, 10-20 pages):
    1. Brand Overview: values, mission, vision, promise
    2. Visual Identity: logo usage, color palette, typography
    3. Logo Usage Rules: minimum size, clear space, placement, backgrounds
    4. Do's and Don'ts: correct/incorrect logo usage examples
    5. Tone of Voice: writing style, vocabulary, messaging examples
    6. Templates: business card, letterhead, presentation, social media (optional)

    Output: Brand guidelines PDF + source files
    """,
    agent=brand_designer,
    context=[define_values, create_visual_identity],  # Depends on Tasks 10, 11
    expected_output="Brand guidelines document (PDF URL + source files)"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:498-503 "Substage 11.3"

---

### Phase 5: Exit Gate Validation

**Agent**: BrandStrategist

**Workflow**:
```python
# Task 13: Validate exit gates
validate_exit_gates = Task(
    description="""
    Validate Stage 11 exit gates:
    1. Name selected (final name documented and approved)
    2. Trademark cleared (legal clearance Low Risk or Clear, domain secured)
    3. Brand guidelines set (document complete and accessible)

    Capture metrics:
    - Brand strength score (from Task 4)
    - Trademark availability status (from Task 7)
    - Market resonance score (if customer validation done)

    If all gates pass, mark Stage 11 complete and hand off to Stage 12.
    If any gate fails, escalate to Chairman with gap details.
    """,
    agent=brand_strategist,
    context=[select_name, legal_clearance, reserve_domain, create_guidelines],
    expected_output="Exit gates validation report (PASS/FAIL with metrics)"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:482-485 "exit gates"

---

### Full Crew Assembly

```python
# Assemble crew
stage_11_crew = Crew(
    agents=[brand_strategist, trademark_analyst, brand_designer, linguistic_analyzer],
    tasks=[
        validate_entry_gates,      # Phase 1
        generate_names,            # Phase 2
        analyze_linguistics,       # Phase 2
        score_candidates,          # Phase 2
        trademark_search,          # Phase 3
        domain_check,              # Phase 3
        legal_clearance,           # Phase 3
        reserve_domain,            # Phase 3
        select_name,               # Phase 3
        define_values,             # Phase 4
        create_visual_identity,    # Phase 4
        create_guidelines,         # Phase 4
        validate_exit_gates        # Phase 5
    ],
    process="sequential",  # Tasks execute in order (dependencies enforced)
    verbose=True
)

# Execute Stage 11
result = stage_11_crew.kickoff()
```

---

## Governance Mappings

### Chairman Approval Points

**No Chairman approval required for Stage 11** (non-critical path, standard execution).

**Exception**: If all name candidates fail trademark search (rollback trigger), escalate to Chairman with options:
1. Regenerate names with stricter trademark constraints (recurse to Substage 11.1)
2. Accept higher trademark risk (Medium Risk with legal mitigation plan)
3. Delay Stage 11 and engage specialized naming agency

**Evidence**: (Inferred from non-critical path status, per critique line 60)

---

### Quality Gates

**Entry Gates** (automated validation):
1. Positioning defined → Check: `stage_4_outputs.market_positioning EXISTS AND stage_4_status = 'COMPLETE'`
2. Market validated → Check: `stage_3_outputs.validation_decision = 'PROCEED' AND stage_4_status = 'COMPLETE'`

**Exit Gates** (automated validation):
1. Name selected → Check: `stage_11_outputs.brand_name EXISTS AND stage_11_outputs.selection_rationale EXISTS`
2. Trademark cleared → Check: `stage_11_outputs.trademark_status IN ['Clear', 'Low Risk'] AND stage_11_outputs.domain_secured = TRUE`
3. Brand guidelines set → Check: `stage_11_outputs.brand_guidelines_url EXISTS AND file_accessible(url) = TRUE`

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:479-485 "entry/exit gates"

---

### Metric Thresholds (Proposed)

**Brand strength score**: ≥70/100 to advance to trademark search (from Substage 11.1)

**Trademark availability**: Must be "Clear" or "Low Risk" to pass exit gate (from Substage 11.2)

**Market resonance**: ≥60/100 to pass (if customer validation implemented, per improvement #5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:37-39 "Missing threshold values" (gap, proposed thresholds)

---

### Error Handling

**Error Scenario 1**: All name candidates fail trademark search

**Handling**:
1. BrandStrategist logs error: "Zero candidates with Low Risk or Clear trademark status"
2. Escalate to Chairman with options:
   - Option A: Regenerate names with stricter constraints (avoid phonetic matches)
   - Option B: Accept Medium Risk candidate with legal mitigation plan
   - Option C: Engage specialized naming agency (external resource)
3. Chairman selects option, Stage 11 recurses to Substage 11.1 or proceeds with exception

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:26 "No explicit error handling" (gap, proposed handling)

---

**Error Scenario 2**: Domain unavailable for all candidates

**Handling**:
1. TrademarkAnalyst checks domain alternatives (.io, .co, get[name].com)
2. If no acceptable alternative, log error: "No acceptable domain available"
3. Escalate to Chairman with options:
   - Option A: Accept alternative domain (.io, .co)
   - Option B: Initiate domain acquisition (purchase from current owner)
   - Option C: Recurse to Substage 11.1 (new candidates)
4. Chairman selects option, proceed accordingly

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:48-50 "Add Rollback Procedures" (gap, proposed handling)

---

### Rollback Triggers

**Trigger 1**: Brand strength score < 70 for all candidates
- **Action**: Recurse to Substage 11.1 (regenerate names with adjusted constraints)

**Trigger 2**: Trademark status = "High Risk" for all candidates
- **Action**: Recurse to Substage 11.1 (regenerate names avoiding trademark conflicts)

**Trigger 3**: Market resonance < 60 (if customer validation implemented)
- **Action**: Recurse to Substage 11.1 (regenerate names, re-test with customers)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:48-50 "Current: No rollback defined" (gap, proposed triggers)

---

## Integration with SD-CREWAI-ARCHITECTURE-001

**Gap**: Stage 11 agent mappings not yet integrated into SD-CREWAI-ARCHITECTURE-001 (CrewAI system architecture SD).

**Proposed Integration**:
- Add BrandStrategist, TrademarkAnalyst, BrandDesigner, LinguisticAnalyzer to agent registry
- Define agent capabilities, tools, governance rules
- Map to Stage 11 workflow phases

**Cross-Reference**: (Feeds SD-CREWAI-ARCHITECTURE-001)

**Evidence**: (Proposed integration for future SD implementation)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
