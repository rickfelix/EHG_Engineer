# Stage 11: Configurability Matrix

**Tunable Parameters**: Stage 11 behavior can be customized via configuration

**Current State**: ⚠️ Not Implemented (manual execution, no configuration system)

---

## Parameter Categories

### 1. Name Generation Parameters

**Parameter**: `name_generation_count`
- **Type**: Integer
- **Default**: 15
- **Range**: 5-30
- **Description**: Number of name candidates to generate in Substage 11.1
- **Impact**:
  - **Lower** (5-10): Faster generation, fewer options, higher risk of all candidates failing trademark search
  - **Higher** (20-30): Slower generation, more options, better chance of finding trademark-clear name
- **Use Case**: Strategic ventures (high stakes) → 25-30 candidates; Experimental ventures → 10 candidates

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:489 "done_when: Name candidates created" (quantity not specified, gap)

---

**Parameter**: `naming_methodologies`
- **Type**: Array<String>
- **Default**: `['descriptive', 'invented', 'metaphorical', 'acronym', 'compound']`
- **Options**: `['descriptive', 'invented', 'metaphorical', 'acronym', 'compound', 'founder_name', 'geographic', 'numeric']`
- **Description**: Naming methodologies to use in name generation
- **Impact**:
  - **Descriptive**: Clear but less distinctive (e.g., "DataStream")
  - **Invented**: Distinctive but harder to remember (e.g., "Zephyr")
  - **Metaphorical**: Evocative but may not convey product (e.g., "Lighthouse")
  - **Acronym**: Compact but loses meaning (e.g., "SAGE")
  - **Compound**: Balanced but can be generic (e.g., "CloudForge")
- **Use Case**: B2B software → descriptive/compound; Consumer brand → metaphorical/invented

**Evidence**: (Proposed parameter, addresses critique gap at line 31 "Build automation workflows")

---

**Parameter**: `linguistic_analysis_languages`
- **Type**: Array<String>
- **Default**: `['en', 'es', 'fr', 'de', 'zh']` (English, Spanish, French, German, Chinese)
- **Options**: Any ISO 639-1 language codes
- **Description**: Languages to check for cross-cultural connotations
- **Impact**:
  - **More languages**: Slower analysis, better cross-cultural fit
  - **Fewer languages**: Faster analysis, risk of offensive translations in unchecked languages
- **Use Case**: Global ventures → 10+ languages; US-only ventures → ['en']

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:491 "done_when: Linguistic analysis done" (languages not specified, gap)

---

### 2. Scoring & Threshold Parameters

**Parameter**: `brand_strength_threshold`
- **Type**: Integer (0-100)
- **Default**: 70
- **Range**: 50-90
- **Description**: Minimum brand strength score to advance to trademark search
- **Impact**:
  - **Lower** (50-60): More candidates advance, faster process, lower quality names
  - **Higher** (80-90): Fewer candidates advance, slower process, higher quality names
- **Use Case**: Strategic ventures → 80-85; Experimental ventures → 60

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:37-39 "Missing threshold values" (gap, proposed default)

---

**Parameter**: `scoring_weights`
- **Type**: Object `{ memorability: Float, differentiation: Float, relevance: Float, linguistic: Float }`
- **Default**: `{ memorability: 0.25, differentiation: 0.25, relevance: 0.25, linguistic: 0.25 }` (equal weights)
- **Range**: Each weight 0.0-1.0, total must sum to 1.0
- **Description**: Weighting for brand strength scoring dimensions
- **Impact**:
  - **High memorability weight** (0.4): Prioritize easy-to-remember names
  - **High differentiation weight** (0.4): Prioritize unique names (stand out from competitors)
  - **High relevance weight** (0.4): Prioritize names that clearly convey brand strategy
  - **High linguistic weight** (0.4): Prioritize phonetically strong, cross-culturally safe names
- **Use Case**:
  - Consumer brands → High memorability (0.35), lower relevance (0.15)
  - B2B technical → High relevance (0.35), lower memorability (0.15)
  - Global brands → High linguistic (0.35), lower differentiation (0.15)

**Evidence**: (Proposed parameter, scoring weights not defined in stages.yaml)

---

**Parameter**: `market_resonance_threshold`
- **Type**: Integer (0-100)
- **Default**: 60
- **Range**: 40-80
- **Description**: Minimum market resonance score (from customer validation) to pass
- **Impact**:
  - **Lower** (40-50): Easier to pass, risk of poor market fit
  - **Higher** (70-80): Harder to pass, ensures strong market alignment
- **Use Case**: Strategic ventures → 70-75; Experimental ventures → 50

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:52-55 "Add customer validation checkpoint" (gap, proposed threshold)

---

### 3. Trademark Search Parameters

**Parameter**: `trademark_search_scope`
- **Type**: Array<String>
- **Default**: `['USPTO', 'WIPO', 'EUIPO']` (US, international, EU)
- **Options**: `['USPTO', 'WIPO', 'EUIPO', 'UKIPO', 'CIPO', 'JPO', 'CNIPA']` (US, intl, EU, UK, Canada, Japan, China)
- **Description**: Trademark databases to search
- **Impact**:
  - **More databases**: Slower search, better global coverage
  - **Fewer databases**: Faster search, risk of conflicts in unchecked jurisdictions
- **Use Case**: Global ventures → all databases; US-only ventures → ['USPTO']

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:494 "done_when: Availability checked" (scope not specified, gap)

---

**Parameter**: `trademark_risk_tolerance`
- **Type**: Enum
- **Default**: `'Low Risk'`
- **Options**: `['Clear', 'Low Risk', 'Medium Risk']`
- **Description**: Maximum acceptable trademark risk level to pass exit gate
- **Impact**:
  - **Clear only**: Very strict, may require many name regenerations
  - **Low Risk**: Balanced, attorney review confirms low likelihood of conflict
  - **Medium Risk**: Lenient, accept potential opposition (requires legal mitigation plan)
- **Use Case**: Enterprise ventures → 'Clear' or 'Low Risk'; Startup ventures → 'Low Risk' or 'Medium Risk'

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:484 "exit: Trademark cleared" (tolerance not specified, gap)

---

**Parameter**: `domain_extensions_required`
- **Type**: Array<String>
- **Default**: `['.com']`
- **Options**: `['.com', '.io', '.co', '.ai', '.app', '.dev', country-specific]`
- **Description**: Domain extensions that must be available to pass exit gate
- **Impact**:
  - **Only .com**: Strict, premium domain, may be unavailable
  - **.com or .io**: Flexible, tech-friendly fallback
  - **Multiple extensions**: Harder to satisfy, ensures comprehensive domain coverage
- **Use Case**: Enterprise → ['.com']; Tech startup → ['.com', '.io']; Developer tools → ['.dev', '.io']

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:495 "done_when: Domain secured" (extensions not specified, gap)

---

### 4. Legal & Compliance Parameters

**Parameter**: `attorney_review_required`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Require external trademark attorney review before finalizing name
- **Impact**:
  - **True**: Slower process (2-3 days for attorney), higher confidence in legal clearance
  - **False**: Faster process (automated search only), higher risk of trademark issues
- **Use Case**: Strategic/Enterprise ventures → true; Experimental/Internal projects → false

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:496 "done_when: Legal clearance obtained" (attorney review implied but not required)

---

**Parameter**: `trademark_application_auto_file`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Automatically file trademark application upon name selection
- **Impact**:
  - **True**: Immediate legal protection initiated, faster time-to-protection
  - **False**: Manual trademark filing (Chairman decides timing), more flexibility
- **Use Case**: Strategic ventures with budget → true; Experimental ventures → false

**Evidence**: (Proposed parameter, trademark filing not mentioned in stages.yaml)

---

### 5. Brand Foundation Parameters

**Parameter**: `visual_identity_automation`
- **Type**: Enum
- **Default**: `'assisted'`
- **Options**: `['manual', 'assisted', 'auto']`
- **Description**: Level of automation for visual identity creation (Substage 11.3)
- **Impact**:
  - **Manual**: Designer creates logo from scratch (2-3 days, high quality, high cost)
  - **Assisted**: AI-generated logo templates, designer refines (1 day, medium quality, medium cost)
  - **Auto**: Fully automated logo generation (1 hour, lower quality, low cost)
- **Use Case**: Strategic ventures → manual/assisted; Experimental ventures → assisted/auto

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:505 "progression_mode: Manual → Assisted → Auto"

---

**Parameter**: `brand_guidelines_template`
- **Type**: Enum
- **Default**: `'standard'`
- **Options**: `['minimal', 'standard', 'comprehensive']`
- **Description**: Brand guidelines document template complexity
- **Impact**:
  - **Minimal**: 5-10 pages (logo, colors, fonts only), fast creation
  - **Standard**: 10-20 pages (includes tone of voice, templates), balanced
  - **Comprehensive**: 30-50 pages (detailed usage rules, extensive templates), slow creation
- **Use Case**: Internal projects → minimal; Customer-facing ventures → standard/comprehensive

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:502 "done_when: Guidelines documented" (template level not specified, gap)

---

### 6. Customer Validation Parameters (Proposed Enhancement)

**Parameter**: `customer_validation_enabled`
- **Type**: Boolean
- **Default**: `false` (not implemented yet)
- **Description**: Enable customer validation of name candidates (improvement #5 from critique)
- **Impact**:
  - **True**: 1-2 days added for customer testing, higher market resonance confidence
  - **False**: Faster process, risk of brand misalignment
- **Use Case**: Consumer brands → true; B2B internal tools → false

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:52-55 "Customer Integration opportunity"

---

**Parameter**: `customer_validation_method`
- **Type**: Enum
- **Default**: `'survey'`
- **Options**: `['survey', 'focus_group', 'A/B_test', 'all']`
- **Description**: Method for customer validation of brand names
- **Impact**:
  - **Survey**: Fast (1 day), large sample, quantitative data
  - **Focus group**: Medium speed (2 days), small sample, qualitative insights
  - **A/B test**: Slow (3-5 days), real-world testing, highest confidence
  - **All**: Comprehensive (5-7 days), highest cost, best data
- **Use Case**: Strategic ventures → focus_group or A/B_test; Experimental → survey

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-11.md:52-55 "Customer Integration opportunity"

---

**Parameter**: `customer_validation_sample_size`
- **Type**: Integer
- **Default**: 100
- **Range**: 50-500
- **Description**: Number of customers to survey/test in validation
- **Impact**:
  - **Smaller** (50-100): Faster, cheaper, higher margin of error
  - **Larger** (300-500): Slower, more expensive, lower margin of error
- **Use Case**: Niche markets → 50-100; Mass market → 200-500

**Evidence**: (Proposed parameter, addresses critique line 14 "No customer touchpoint")

---

### 7. Recursion Control Parameters (Proposed)

**Parameter**: `max_recursions_LEGAL_001`
- **Type**: Integer
- **Default**: 2
- **Range**: 1-5
- **Description**: Max auto-recursions for trademark failures before Chairman escalation
- **Impact**:
  - **Lower** (1): Fast escalation, Chairman involved early
  - **Higher** (3-5): More auto-retries, Chairman involved only if persistent failures
- **Use Case**: Strategic ventures → 1-2 (Chairman control); Experimental → 3-5 (more autonomy)

**Evidence**: (Proposed parameter from File 07 recursion blueprint)

---

**Parameter**: `max_recursions_QUALITY_001`
- **Type**: Integer
- **Default**: 3
- **Range**: 1-5
- **Description**: Max auto-recursions for weak brand strength before Chairman escalation
- **Impact**: Same as above

**Evidence**: (Proposed parameter from File 07 recursion blueprint)

---

## Configuration Profiles (Preset Templates)

### Profile: "Strategic Venture" (High stakes, high quality)

```json
{
  "name_generation_count": 25,
  "brand_strength_threshold": 80,
  "market_resonance_threshold": 70,
  "trademark_risk_tolerance": "Low Risk",
  "domain_extensions_required": [".com"],
  "attorney_review_required": true,
  "trademark_application_auto_file": true,
  "visual_identity_automation": "assisted",
  "brand_guidelines_template": "comprehensive",
  "customer_validation_enabled": true,
  "customer_validation_method": "focus_group",
  "customer_validation_sample_size": 200,
  "max_recursions_LEGAL_001": 2,
  "max_recursions_QUALITY_001": 2
}
```

**Use Case**: Enterprise product launch, customer-facing brand, budget >$50k

---

### Profile: "Experimental Venture" (Fast iteration, lower stakes)

```json
{
  "name_generation_count": 10,
  "brand_strength_threshold": 60,
  "market_resonance_threshold": 50,
  "trademark_risk_tolerance": "Medium Risk",
  "domain_extensions_required": [".com", ".io"],
  "attorney_review_required": false,
  "trademark_application_auto_file": false,
  "visual_identity_automation": "auto",
  "brand_guidelines_template": "minimal",
  "customer_validation_enabled": false,
  "max_recursions_LEGAL_001": 3,
  "max_recursions_QUALITY_001": 3
}
```

**Use Case**: Internal tool, MVP, proof-of-concept, budget <$10k

---

### Profile: "B2B Technical" (Clarity over creativity)

```json
{
  "name_generation_count": 15,
  "naming_methodologies": ["descriptive", "compound", "acronym"],
  "brand_strength_threshold": 70,
  "scoring_weights": {
    "memorability": 0.15,
    "differentiation": 0.25,
    "relevance": 0.40,
    "linguistic": 0.20
  },
  "trademark_risk_tolerance": "Low Risk",
  "domain_extensions_required": [".com", ".io", ".dev"],
  "attorney_review_required": true,
  "visual_identity_automation": "assisted",
  "brand_guidelines_template": "standard",
  "customer_validation_enabled": true,
  "customer_validation_method": "survey",
  "customer_validation_sample_size": 100
}
```

**Use Case**: B2B SaaS, developer tools, technical products

---

### Profile: "Consumer Brand" (Memorability and emotion)

```json
{
  "name_generation_count": 20,
  "naming_methodologies": ["invented", "metaphorical", "compound"],
  "brand_strength_threshold": 75,
  "scoring_weights": {
    "memorability": 0.35,
    "differentiation": 0.30,
    "relevance": 0.20,
    "linguistic": 0.15
  },
  "trademark_risk_tolerance": "Low Risk",
  "domain_extensions_required": [".com"],
  "attorney_review_required": true,
  "visual_identity_automation": "manual",
  "brand_guidelines_template": "comprehensive",
  "customer_validation_enabled": true,
  "customer_validation_method": "A/B_test",
  "customer_validation_sample_size": 300
}
```

**Use Case**: Consumer apps, retail brands, lifestyle products

---

## Configuration Management

**Storage**: Configuration stored in database (ventures table, `stage_11_config` JSONB column)

**Inheritance**: Default values from global config, overridden by venture-specific config

**Validation**: Schema validation ensures parameters are within allowed ranges

**Evidence**: (Proposed configuration system, addresses critique line 31 "Build automation workflows")

---

## Cross-Reference

**Integration with SD-CONFIGURABILITY-FRAMEWORK-001** (if exists):
- Stage 11 parameters should be registered in centralized configurability framework
- UI for Chairman to select/customize configuration profiles
- API for programmatic configuration updates

**Evidence**: (Proposed integration for future SD implementation)

---

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
