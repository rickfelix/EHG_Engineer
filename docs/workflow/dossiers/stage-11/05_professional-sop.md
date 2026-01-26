# Stage 11: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, security

**Execution Owner**: LEAD Agent

**Estimated Duration**: 5-7 business days (manual), 2-3 days (assisted with automation)

---

## Pre-Execution Checklist

**Before starting Stage 11, verify**:

- [ ] **Entry Gate 1**: Positioning defined
  - Check: Market positioning document exists from Stage 4/6
  - Check: Competitive landscape analysis complete
  - Check: Target segments identified and validated

- [ ] **Entry Gate 2**: Market validated
  - Check: Brand strategy document exists from Stage 2/3
  - Check: Market opportunity confirmed (Stage 4)
  - Check: Value proposition validated

- [ ] **Dependency Met**: Stage 10 complete
  - Check: Technical review approved
  - Check: Technical requirements documented (inform brand promise)
  - Check: Architecture design finalized (informs product naming)

- [ ] **Inputs Available**:
  - [ ] Market positioning document
  - [ ] Brand strategy document
  - [ ] Legal requirements list (regulatory, geographic, industry)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:464-469, 479-481 "depends_on, inputs, entry gates"

---

## Step-by-Step Execution

### Substage 11.1: Name Generation

**Objective**: Generate 10-15 name candidates with linguistic analysis

**Duration**: 2-3 days (manual), 4 hours (assisted)

---

#### Step 1.1: Review Inputs

**Action**: Analyze market positioning, brand strategy, legal requirements

**Specific Tasks**:
1. Identify key brand attributes (from brand strategy)
   - Brand personality (e.g., innovative, trustworthy, playful)
   - Tone of voice (e.g., professional, casual, technical)
   - Messaging themes (e.g., speed, security, simplicity)

2. Identify market constraints (from market positioning)
   - Target audience language preferences
   - Cultural considerations (geographic markets)
   - Competitive naming patterns (avoid similarity)

3. Identify legal constraints (from legal requirements)
   - Industry naming standards (e.g., healthcare, finance)
   - Regulatory restrictions (e.g., misleading claims)
   - Geographic restrictions (e.g., country-specific sensitivities)

**Deliverable**: Constraints document (brand attributes + market constraints + legal constraints)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:466-469 "inputs: Market positioning, Brand strategy, Legal"

---

#### Step 1.2: Generate Name Candidates

**Action**: Create 10-15 name candidates using naming methodologies

**Naming Methodologies**:
1. **Descriptive names**: Clearly describe product/service (e.g., "DataStream")
2. **Invented names**: Coined words (e.g., "Zephyr", "Quantix")
3. **Metaphorical names**: Evoke brand attributes (e.g., "Lighthouse" for guidance)
4. **Acronyms**: Abbreviations (e.g., "SAGE" = Strategic Analytics Growth Engine)
5. **Compound names**: Combine words (e.g., "CloudForge", "MarketPulse")

**Tools** (if assisted):
- AI name generators (GPT-4 with brand strategy prompt)
- Linguistic databases (phonetics, etymology)
- Competitor analysis (avoid similarity)

**Deliverable**: Name candidates list (10-15 names with rationale)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:489-490 "done_when: Name candidates created"

---

#### Step 1.3: Linguistic Analysis

**Action**: Analyze each name candidate for phonetics, connotations, cross-cultural implications

**Analysis Dimensions**:
1. **Phonetics**: Pronunciation, syllable count, phonetic memorability
2. **Connotations**: Positive/negative associations in target languages
3. **Cross-cultural**: Meanings in other languages (avoid offensive translations)
4. **Spelling**: Easy to spell? Common misspellings?
5. **Domain availability**: .com available? (preliminary check, not exhaustive)

**Deliverable**: Linguistic analysis report (per candidate)

**Example**:
```
Name: "Zephyr"
- Phonetics: 2 syllables, soft sound, easy to pronounce
- Connotations: "gentle breeze" (positive, calming)
- Cross-cultural: Greek origin (zephyros = west wind), no negative translations
- Spelling: Uncommon spelling (may be misspelled as "Zefir")
- Domain: zephyr.com (unavailable), getzephyr.com (available)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:491 "done_when: Linguistic analysis done"

---

#### Step 1.4: Internal Scoring

**Action**: Score each name candidate (0-100) on brand strength dimensions

**Scoring Dimensions**:
1. **Memorability** (0-25): Easy to remember and recall
2. **Differentiation** (0-25): Distinct from competitors
3. **Relevance** (0-25): Aligns with brand strategy and market positioning
4. **Linguistic Quality** (0-25): Phonetics, connotations, cross-cultural fit

**Deliverable**: Scored candidates list (sorted by total score)

**Example**:
```
| Name       | Memorability | Differentiation | Relevance | Linguistic | Total |
|------------|--------------|-----------------|-----------|------------|-------|
| Zephyr     | 20           | 22              | 18        | 23         | 83    |
| CloudForge | 18           | 15              | 24        | 20         | 77    |
| ...        | ...          | ...             | ...       | ...        | ...   |
```

**Threshold**: Top 5 candidates (score ≥70) advance to Substage 11.2

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:475 "metrics: Brand strength score"

---

#### Exit Criteria for Substage 11.1

- [ ] 10-15 name candidates generated
- [ ] Linguistic analysis complete for all candidates
- [ ] Top 5 candidates identified (score ≥70)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:489-491 "done_when"

---

### Substage 11.2: Trademark Search

**Objective**: Verify trademark availability and secure domain for top candidates

**Duration**: 2-3 days (manual), 1 day (assisted with API automation)

---

#### Step 2.1: Preliminary Trademark Search

**Action**: Search USPTO (US) and international trademark databases for top 5 candidates

**Search Scope**:
1. **Exact match**: Name exactly as proposed
2. **Phonetic match**: Names that sound similar (likelihood of confusion)
3. **Visual match**: Names that look similar (logo/wordmark)
4. **Related goods/services**: Same industry class (Nice Classification)

**Tools**:
- USPTO TESS (Trademark Electronic Search System)
- WIPO Global Brand Database
- EU IPO eSearch plus

**Deliverable**: Trademark search report (per candidate)

**Example**:
```
Name: "Zephyr"
- Exact match: 12 results (5 active in unrelated industries, 7 dead/abandoned)
- Phonetic match: "Zefir" (3 results, 1 active in software industry - HIGH RISK)
- Industry class: Class 42 (Computer services) - CONFLICT DETECTED
- Status: HIGH RISK (phonetic conflict in same industry)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:494 "done_when: Availability checked"

---

#### Step 2.2: Domain Availability Check

**Action**: Check domain availability for top 5 candidates (including high-risk trademark names, for completeness)

**Domain Extensions to Check**:
1. **.com** (primary, must be available)
2. **.io** (tech startups, fallback)
3. **.co** (fallback)
4. **Country-specific** (e.g., .uk, .de if targeting those markets)

**Tools**:
- Domain registrar search (GoDaddy, Namecheap)
- WHOIS lookup (current owner, expiration date)

**Deliverable**: Domain availability report (per candidate)

**Example**:
```
Name: "Zephyr"
- zephyr.com: UNAVAILABLE (owned by weather.com, not for sale)
- getzephyr.com: AVAILABLE
- zephyr.io: AVAILABLE
- zephyr.co: UNAVAILABLE (parked domain, may be available for purchase)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:495 "done_when: Domain secured"

---

#### Step 2.3: Legal Clearance (Attorney Review)

**Action**: Engage trademark attorney to review top 3 candidates (lowest risk from Steps 2.1-2.2)

**Attorney Review Scope**:
1. Confirm trademark search findings
2. Assess likelihood of confusion (expert opinion)
3. Recommend risk level (Clear, Low, Medium, High)
4. Identify any geographic restrictions or industry-specific issues

**Deliverable**: Legal clearance report (per candidate)

**Example**:
```
Name: "CloudForge"
- Attorney opinion: LOW RISK
- Rationale: No exact matches in Class 42, phonetic matches in unrelated industries
- Recommendation: Proceed with trademark application
- Estimated timeline: 12-18 months for registration
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:496 "done_when: Legal clearance obtained"

---

#### Step 2.4: Domain Reservation

**Action**: Reserve primary domain (.com or best alternative) for top 2 candidates

**Specific Tasks**:
1. Purchase domain (if available) or initiate domain acquisition (if owned)
2. Configure DNS to placeholder page (optional)
3. Document domain ownership (registrar, expiration date, renewal settings)

**Deliverable**: Domain reservation confirmation (per candidate)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:495 "done_when: Domain secured"

---

#### Step 2.5: Final Candidate Selection

**Action**: Select final name from top 2 candidates (trademark clear, domain secured)

**Selection Criteria**:
1. **Trademark risk**: Prefer "Clear" or "Low Risk" (avoid "Medium" or "High")
2. **Domain quality**: Prefer .com, shorter is better
3. **Brand strength score**: Higher score wins (from Step 1.4)
4. **Market resonance**: If customer validation done (optional improvement #5), prefer higher score

**Deliverable**: Final name selection with rationale

**Example**:
```
Selected Name: "CloudForge"
- Trademark: Low Risk (attorney approved)
- Domain: cloudforge.com (secured)
- Brand strength: 77/100
- Rationale: Strong differentiation, low legal risk, premium .com domain
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:483 "exit: Name selected"

---

#### Exit Criteria for Substage 11.2

- [ ] Trademark search complete (top 5 candidates)
- [ ] Domain availability checked (top 5 candidates)
- [ ] Legal clearance obtained (top 3 candidates)
- [ ] Domain reserved (final 2 candidates)
- [ ] Final name selected (1 candidate)
- [ ] **Exit Gate**: Trademark cleared (Low Risk or better)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:494-497, 484 "done_when, exit gate"

---

### Substage 11.3: Brand Foundation

**Objective**: Define brand values, create visual identity, document brand guidelines

**Duration**: 2-3 days (manual), 1 day (assisted with design tools)

---

#### Step 3.1: Define Brand Values

**Action**: Articulate core values, mission, vision related to selected brand name

**Specific Tasks**:
1. **Core values** (3-5 values): What the brand stands for (e.g., innovation, trust, simplicity)
2. **Mission statement**: What the brand does (1-2 sentences)
3. **Vision statement**: Where the brand is going (1-2 sentences)
4. **Brand promise**: What customers can expect (1 sentence)

**Deliverable**: Brand values document

**Example**:
```
Brand: CloudForge

Core Values:
1. Innovation: We build the future of cloud infrastructure
2. Reliability: 99.99% uptime, always-on support
3. Simplicity: Complex technology, simple experience

Mission: CloudForge empowers developers to build scalable applications without infrastructure complexity.

Vision: Every developer has enterprise-grade infrastructure at their fingertips.

Brand Promise: Launch faster, scale effortlessly, focus on code.
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:500 "done_when: Brand values defined"

---

#### Step 3.2: Create Visual Identity

**Action**: Design logo, select color palette, choose typography

**Visual Identity Components**:
1. **Logo**: Wordmark (text-based) or logomark (icon + text)
2. **Color palette**: Primary color (brand color) + secondary colors (2-3) + neutral colors
3. **Typography**: Heading font + body font (2 fonts maximum for consistency)
4. **Iconography**: Icon style (line icons, filled icons, etc.)

**Tools** (if assisted):
- Design tools (Figma, Adobe Illustrator)
- Color palette generators
- Font pairing tools

**Deliverable**: Visual identity package (logo files, color codes, font licenses)

**Example**:
```
Brand: CloudForge

Logo: Wordmark with stylized "C" (cloud + forge anvil fusion)
Primary Color: #1E40AF (deep blue, trust/stability)
Secondary Colors: #10B981 (green, growth), #F59E0B (amber, innovation)
Neutral Colors: #1F2937 (dark gray), #F9FAFB (light gray)
Heading Font: Inter Bold (modern, technical)
Body Font: Inter Regular (readable, professional)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:501 "done_when: Visual identity created"

---

#### Step 3.3: Document Brand Guidelines

**Action**: Create brand guidelines document covering usage rules, do's/don'ts, templates

**Guidelines Sections**:
1. **Brand Overview**: Values, mission, vision, promise (from Step 3.1)
2. **Visual Identity**: Logo usage, color palette, typography (from Step 3.2)
3. **Logo Usage Rules**: Minimum size, clear space, placement, backgrounds
4. **Do's and Don'ts**: Correct/incorrect logo usage (examples)
5. **Tone of Voice**: Writing style, vocabulary, messaging examples
6. **Templates**: Business card, letterhead, presentation, social media (optional)

**Deliverable**: Brand guidelines document (PDF, 10-20 pages)

**Example Structure**:
```
CloudForge Brand Guidelines

1. Brand Overview (pages 1-2)
   - Values, mission, vision, promise

2. Logo Usage (pages 3-6)
   - Primary logo, secondary logo, minimum size (40px height)
   - Clear space (minimum 1x logo height)
   - Incorrect usage examples (stretched, recolored, rotated)

3. Color Palette (pages 7-8)
   - Primary: #1E40AF, Secondary: #10B981, #F59E0B
   - Usage: Primary for CTAs, Secondary for highlights

4. Typography (pages 9-10)
   - Headings: Inter Bold, Body: Inter Regular
   - Sizes: H1 (48px), H2 (36px), Body (16px)

5. Tone of Voice (pages 11-12)
   - Professional but approachable
   - Technical but not jargon-heavy
   - Example: "Launch your app in minutes, not months"

6. Templates (pages 13-20)
   - Business card, letterhead, presentation templates
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:502 "done_when: Guidelines documented"

---

#### Exit Criteria for Substage 11.3

- [ ] Brand values defined (values, mission, vision, promise)
- [ ] Visual identity created (logo, colors, typography)
- [ ] Guidelines documented (usage rules, templates)
- [ ] **Exit Gate**: Brand guidelines set (document complete and accessible)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:500-503, 485 "done_when, exit gate"

---

## Final Stage Exit Checklist

**Before marking Stage 11 complete, verify ALL exit gates passed**:

- [ ] **Exit Gate 1**: Name selected
  - Final name documented and approved
  - Selection rationale recorded

- [ ] **Exit Gate 2**: Trademark cleared
  - Legal clearance obtained (Low Risk or Clear)
  - Domain secured (.com or best alternative)
  - Trademark application filed or planned

- [ ] **Exit Gate 3**: Brand guidelines set
  - Brand guidelines document complete (PDF)
  - Visual identity assets delivered (logo, colors, fonts)
  - Guidelines accessible to downstream stages (Stage 12+)

- [ ] **All Metrics Captured**:
  - [ ] Brand strength score documented (from Step 1.4)
  - [ ] Trademark availability status documented (from Step 2.3)
  - [ ] Market resonance score documented (if customer validation done)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:482-485 "exit gates"

---

## Handoff to Stage 12

**Deliverables to Pass**:
1. Brand name (final selection)
2. Brand guidelines document (PDF + source files)
3. Trademark search report (legal clearance)
4. Visual identity package (logo files, color codes, font licenses)

**Handoff Notes**:
- Stage 12 (Adaptive Naming Module) uses brand name as base for adaptations
- Brand guidelines constrain naming variations (must respect visual identity)
- Trademark clearance establishes legal boundaries for adaptations

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:470-473 "outputs"

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
