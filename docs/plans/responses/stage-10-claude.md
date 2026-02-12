# Stage 10 "Naming / Brand" -- Claude Response

> Independent response to the Stage 10 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Name candidate generation | AI-generatable strategic narrative | None (all user-provided) | **5 Critical** | Without AI generation, Stage 10 is an empty form requiring users to invent 5+ names from scratch. The analysisStep is essential. | CLOSE | Challenge: Name generation is subjective and culturally nuanced. But LLMs excel at creative naming when given structured brand constraints. |
| Brand narrative (vision/mission) | Vision, mission, value prop, strategic narrative | None (brand genome only) | **3 Medium** | Vision/mission are useful for GTM (Stage 11) but the brand genome's archetype + tone + audience captures the strategic intent. | PARTIAL ADOPT | Challenge: Vision and mission statements are standard brand deliverables, but at the IDENTITY phase they're premature -- the venture doesn't exist yet. Brand genome is sufficient strategic direction. |
| Cultural/design style | 5 presets with color palettes | None | **2 Low** | Visual identity informs marketing collateral but doesn't affect naming or GTM strategy decisions. | DEFER | Challenge: Cultural style is a BUILD concern. At IDENTITY, you need the name and strategic positioning, not a color palette. |
| Domain availability | Domain status per candidate | None | **4 High** | A great name with no available domain is a non-starter for modern ventures. Domain availability is a practical filter that changes naming decisions. | ADAPT | Challenge: Domain checking requires external API calls (WHOIS, registrar APIs). In a CLI context, this could be an optional enrichment step, not a hard requirement. |
| Trademark status | 4 statuses (available/pending/conflict/unknown) | None | **3 Medium** | Trademark conflicts discovered after BUILD are expensive. Early screening saves future cost. But full trademark search is a legal process, not an AI task. | DEFER | Challenge: Automated trademark checking is unreliable. It requires jurisdiction-specific legal databases. A simple "check USPTO basic search" could be useful, but shouldn't gate naming decisions at IDENTITY phase. |
| Visual identity | Colors, fonts, visual style | None | **2 Low** | Visual identity is execution. The name and brand genome are the strategic deliverables of Stage 10. | DEFER | Challenge: Colors and fonts are BUILD phase. Stage 10 outputs should inform visual direction, not define it. |
| Key messages / brand voice | Dynamic arrays + brand voice field | None (tone in genome) | **3 Medium** | Stage 11 (GTM) needs messaging direction. Brand genome's "tone" field partially covers this. | PARTIAL ADOPT | Challenge: "Key messages" are marketing copy, not strategic identity. The brand genome's tone + audience + differentiators already provide GTM input. |
| Scoring preset criteria | Domain, trademark, score per predefined metric | Fully flexible user-defined criteria | **2 Low** | CLI's flexible approach is actually superior -- users can weight what matters to THEM. Preset criteria force assumptions. | PRESERVE CLI | Challenge: CLI's approach is better because different ventures value different things. A B2B SaaS might weight "professional sound" high; a consumer app might weight "memorability." |
| Decision output (ADVANCE/REVISE/REJECT) | Unified decision with confidence | Just ranking | **3 Medium** | A decision output makes the stage more actionable. But at IDENTITY, naming rarely "fails" -- it iterates. | ADAPT | Challenge: Ranking IS a decision. Top-ranked candidate is the recommended name. Adding ADVANCE/REVISE/REJECT adds complexity without clarity -- what would "REJECT" mean for a naming exercise? |
| Stage mapping divergence | Technical Review at Stage 10 | Naming / Brand at Stage 10 | **N/A** | CLI's scoping is correct. Technical review belongs in Stage 14. | CLI CORRECT | The GUI combines technical assessment with branding, which violates phase boundaries. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 1**: Venture description, problem statement, target market (B2B/B2C/B2B2C)
- **Stage 3**: Market validation metrics (market type, competitive density)
- **Stage 4**: Competitive landscape (competitor names -- avoid similarities)
- **Stage 7**: Pricing model (subscription, freemium, etc. -- implies brand positioning)
- **Stage 8**: BMC Value Propositions, Customer Segments (who the brand speaks to)
- **Stage 9**: Exit strategy buyer types (strategic/financial/PE -- implies brand positioning), exit thesis

**Process (single LLM call)**:
1. **Brand Genome Generation**: Derive archetype, values, tone, audience, differentiators from Stages 1-9
2. **Scoring Criteria Suggestion**: Propose 4-6 weighted criteria based on venture type (e.g., B2B → weight "professional" higher; consumer → weight "memorability" higher)
3. **Name Candidate Generation**: Generate 7-10 name candidates, each with rationale and scores per criterion
4. **Competitor Name Avoidance**: Check generated names against Stage 4 competitors for similarity
5. **Domain Suggestions**: For each name, suggest 2-3 likely available domain variants (.io, .co, .app)

**Output**: Complete Stage 10 input data (brandGenome, scoringCriteria, candidates with scores)

### 3. Brand Genome Structure Decision

**Keep CLI's 5-key structure. Add one optional field.**

The CLI's brand genome is well-designed:
- `archetype` -- brand personality anchor (e.g., "The Innovator", "The Sage")
- `values` -- core brand values
- `tone` -- communication style
- `audience` -- target audience description
- `differentiators` -- what makes this brand unique

**Add optional `positioning_statement`** -- a one-line strategic summary that captures the brand's market position. This bridges to Stage 11 (GTM) better than separate vision/mission fields.

**Do NOT add**: vision statement, mission statement, cultural style, key messages. These are either premature (cultural style → BUILD) or redundant (vision/mission are verbose versions of archetype + values).

### 4. Name Candidate Generation Design

**LLM generates 7-10 candidates. User can add/edit. Minimum 5 after curation.**

**Per candidate, the analysisStep should generate**:
- `name`: The proposed name
- `rationale`: Why this name fits the brand genome
- `naming_approach`: How the name was derived (portmanteau, metaphor, acronym, invented word, real word, compound)
- `scores`: Score per criterion (0-100)
- `domain_suggestions`: 2-3 likely available domain variants (heuristic, not checked)

**Naming approach taxonomy**:
- `portmanteau`: Combined words (e.g., Pinterest = Pin + Interest)
- `metaphor`: Abstract concept (e.g., Amazon, Apple)
- `acronym`: Initials (e.g., IBM, AWS)
- `invented`: Made-up word (e.g., Kodak, Xerox)
- `real_word`: Existing word repurposed (e.g., Slack, Notion)
- `compound`: Two words combined (e.g., Facebook, YouTube)

This taxonomy helps users understand the naming strategy and compare approaches.

### 5. Domain & Trademark: Include or Defer?

**Domain: Include as heuristic suggestions. Defer live checking.**

At IDENTITY phase, the LLM can suggest likely available domain variants (`.io`, `.co`, `.app` are usually more available than `.com`). This is a heuristic, not a live check. Live domain checking requires external API calls that add complexity.

**Add optional `domain_suggestions[]` per candidate** (LLM-generated, not verified).

**Trademark: Defer entirely.**

Trademark searching requires legal databases and jurisdiction-specific knowledge. Automated trademark checking gives false confidence. A "no conflicts found" result from a basic search means nothing legally. This belongs in BUILD or pre-launch legal review.

### 6. Visual Identity: Include or Defer?

**Defer to BUILD phase.**

Visual identity (colors, fonts, design style) is execution, not strategy. Stage 10's job is to name the venture and define its strategic identity (brand genome). Visual expression of that identity happens during BUILD when marketing collateral is being created.

The brand genome's `archetype` and `tone` already imply visual direction (e.g., "The Innovator" + "bold, direct" → modern, high-contrast visuals). Making this explicit is premature.

### 7. Scoring Criteria Design

**Keep fully flexible. Add default suggestions.**

CLI's approach (user-defined criteria with weights summing to 100) is superior to preset criteria. Different ventures need different evaluation dimensions.

**The analysisStep should suggest default criteria based on venture type**:

For B2B SaaS:
- Professional credibility (30%)
- Memorability (25%)
- Domain availability potential (20%)
- Competitive differentiation (15%)
- International scalability (10%)

For B2C Consumer:
- Memorability (30%)
- Emotional resonance (25%)
- Pronunciation ease (20%)
- Social shareability (15%)
- Competitive differentiation (10%)

Users can accept defaults or customize. Weights must still sum to 100.

### 8. Stage 9 → 10 Consumption Mapping

| Stage 9 Output | Stage 10 Application |
|----------------|---------------------|
| Exit thesis | If "acquired by enterprise," brand should be professional, trustworthy. If "IPO," brand should be market-facing, memorable. |
| buyer_type = strategic | Brand emphasizes technology/IP value, integration potential. Professional naming. |
| buyer_type = financial/pe | Brand emphasizes metrics, scalability, market position. Clean, corporate naming. |
| buyer_type = competitor | Brand should differentiate clearly. Avoid names too similar to potential acquirers. |
| exit_type = ipo | Brand must work for public markets. Needs broad appeal, easy pronunciation, global scalability. |
| exit_type = acquisition | Brand can be more niche. Acquirer will likely rebrand anyway. |
| valuation_estimate | Higher-value exits justify premium branding investment. Informs brand ambition level. |

### 9. CLI Superiorities (preserve these)

- **Flexible weighted scoring**: User-defined criteria with weights summing to 100. Superior to preset metrics.
- **Minimum 5 candidates**: Forces breadth of exploration.
- **Per-criterion scoring (0-100)**: Granular, transparent ranking.
- **Clean brand genome**: 5-key structure captures strategic identity without bloat.
- **`computeDerived()` ranking**: Deterministic, testable weighted scoring.
- **Correct phase scoping**: Naming/Brand at Stage 10 is the right scope. GUI's technical review mixed in here is a design error.

### 10. Recommended Stage 10 Schema

```javascript
const TEMPLATE = {
  id: 'stage-10',
  slug: 'naming-brand',
  title: 'Naming / Brand',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    brandGenome: {
      type: 'object', required: true,
      fields: {
        archetype: { type: 'string', required: true },
        values: { type: 'array', minItems: 1 },
        tone: { type: 'string', required: true },
        audience: { type: 'string', required: true },
        differentiators: { type: 'array', minItems: 1 },
        positioning_statement: { type: 'string' }, // NEW, optional
      },
    },

    // === Existing (unchanged) ===
    scoringCriteria: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        weight: { type: 'number', min: 0, max: 100, required: true },
      },
      // weights must sum to 100
    },

    // === Updated: candidates with naming_approach + domain_suggestions ===
    candidates: {
      type: 'array', minItems: 5,
      items: {
        name: { type: 'string', required: true },
        rationale: { type: 'string', required: true },
        naming_approach: { type: 'enum', values: ['portmanteau', 'metaphor', 'acronym', 'invented', 'real_word', 'compound'] },
        scores: { type: 'object', required: true },
        domain_suggestions: { type: 'array' }, // NEW, optional
        weighted_score: { type: 'number', derived: true },
      },
    },

    // === Existing derived (unchanged) ===
    ranked_candidates: { type: 'array', derived: true },

    // === NEW: Provenance ===
    provenance: {
      type: 'object', derived: true,
      properties: {
        dataSource: { type: 'string' },
        model: { type: 'string' },
        stagesConsumed: { type: 'array' },
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. Added optional `positioning_statement` to brandGenome
2. Added `naming_approach` enum to candidates (6 values)
3. Added `domain_suggestions` to candidates (heuristic, not verified)
4. Added `provenance` tracking
5. All existing fields preserved unchanged
6. Scoring weights still sum to 100, min 5 candidates

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for brand/name generation**. Single LLM call consuming Stages 1-9. Produces brand genome, suggested scoring criteria, and 7-10 name candidates with rationale and scores.

2. **P0: Wire Stages 1-9 into analysisStep**. Exit strategy buyer types inform brand positioning. BMC value propositions inform differentiators. Competitor names inform avoidance.

3. **P1: Add `naming_approach` enum to candidates**. Categorizes how each name was derived for transparency.

4. **P1: Add optional `positioning_statement` to brandGenome**. Bridges to Stage 11 GTM.

5. **P2: Add `domain_suggestions` per candidate**. LLM-heuristic domain variants, not live checked.

6. **P3: Do NOT add vision/mission statements**. Redundant with brand genome archetype + values.
7. **P3: Do NOT add cultural design styles**. Visual identity belongs in BUILD.
8. **P3: Do NOT add trademark checking**. Requires legal databases, unreliable if automated.
9. **P3: Do NOT add technical review content**. Belongs in Stage 14.
10. **P3: Do NOT add ADVANCE/REVISE/REJECT decision**. Ranking is the decision.

### 12. Cross-Stage Impact

| Change | Stage 11 (GTM) | Stage 14 (Technical Architecture) | Broader Pipeline |
|--------|----------------|-----------------------------------|-----------------|
| Brand genome + name generation | GTM messaging can use brand tone, audience, and positioning_statement directly. Named venture enables concrete marketing. | Technical Architecture can reference the chosen name in system design. | The venture now has an identity. Every subsequent stage can reference the brand. |
| Naming approach taxonomy | GTM can emphasize the naming strategy (invented word → education needed, real word → instant recognition). | N/A | Naming approach informs marketing effort estimation. |
| Exit-informed branding | GTM for "acquisition target" venture vs "IPO candidate" requires different messaging strategies. Stage 10 captures this. | N/A | Exit strategy → brand → GTM is a clean signal chain from ENGINE through IDENTITY. |

### 13. Dependency Conflicts (with Stages 1-9 decisions)

**No blocking dependency conflicts identified.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 1 → 10 (venture description for brand) | **OK** | Stage 1 has target market, problem statement. Sufficient for brand genome derivation. |
| Stage 4 → 10 (competitor names for avoidance) | **OK** | Stage 4 consensus includes competitor names. Available for name collision checking. |
| Stage 8 → 10 (BMC for brand values) | **OK** | Stage 8 Value Propositions and Customer Segments inform brand differentiators and audience. |
| Stage 9 → 10 (exit strategy for brand positioning) | **OK** | Stage 9 buyer_type and exit_type influence brand tone. No missing fields. |

**One forward concern**: Stage 11 (GTM) expects a named venture. If Stage 10 fails to produce a viable name (all candidates rejected by user), Stage 11 cannot proceed. However, this is a user decision issue, not a schema issue. The analysisStep generating 7-10 candidates with clear rationale should prevent this.

### 14. Contrarian Take

**Arguing AGAINST adding naming_approach taxonomy and domain_suggestions:**

The most obvious recommendations are adding `naming_approach` (portmanteau, metaphor, etc.) and `domain_suggestions` per candidate. Here's why these could be wrong:

1. **Naming approach is retrospective classification, not generative guidance.** When the LLM generates a name like "Vantage," classifying it as "real_word" doesn't help the user decide if it's a good name. The rationale field already explains why the name works. Adding a taxonomy creates the illusion of systematic naming methodology when in reality, name generation is creative and non-taxonomic. Users won't filter candidates by approach type.

2. **Domain suggestions without verification are worse than nothing.** Suggesting "vantage.io" as "likely available" when it's actually taken creates false expectations. Users will see domain suggestions, assume they're validated, and be disappointed when they check. The honest approach is either live-check domains (complex, requires API) or don't suggest at all (clean, honest). Heuristic suggestions occupy an unhelpful middle ground.

3. **The CLI already works well for naming.** Brand genome + weighted scoring + ranking is a clean, proven system. The risk is turning a focused naming tool into a mini-brand consultancy with taxonomies, domain heuristics, and visual direction that nobody asked for. The 5 candidates with scores IS the deliverable.

**Counter-argument**: Naming approach helps users understand the diversity of options (all metaphors? all acronyms? that's a problem). And domain suggestions, even unverified, save users a brainstorming step. But both are nice-to-haves (P1-P2), not essentials.

**Verdict**: Include naming_approach as optional metadata. Drop domain_suggestions to P3 (nice-to-have) rather than P2, given the false confidence risk.
