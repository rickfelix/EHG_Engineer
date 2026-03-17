#!/usr/bin/env node
/**
 * Create Venture Evaluation Strategic Directive
 * Captures all venture candidate research for future evaluation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const scope = `## VENTURE CANDIDATES IDENTIFIED

### VENTURE 1: Opportunity Discovery Engine ("MarketGap Scanner")
**What it does:**
- Fetches LIVE competitor websites (not training data)
- 6-dimension gap analysis (Features, Pricing, Segments, Experience, Integrations, Quality)
- Four Buckets epistemic classification (Fact/Assumption/Simulation/Unknown)
- Ranked opportunity scoring
- Automated blueprint generation

**Files:** lib/discovery/, lib/research/competitor-intelligence.js, gap-analyzer.js
**Target Market:** Entrepreneurs, corporate innovation teams, VC firms
**Implementation Status:** ✅ 100% REAL - Production ready
**TAM:** $500M+ | **Build Time:** 6 weeks | **Revenue Potential:** $10-50M ARR

**ChatGPT Objection Response:**
> ChatGPT can't fetch live URLs, can't structure into ranked opportunities, can't classify epistemic confidence, can't generate executive summaries.

---

### VENTURE 2: Business Model Blueprinting Suite ("ModelBuilder")
**What it does:**
- Business Model Canvas (9-block framework)
- Unit economics modeling (CAC, LTV, margins, payback)
- Pricing strategy development
- Go-to-Market strategy
- Financial projections with stage-specific benchmarks (Seed/Series A/B)

**Files:** lib/sub-agents/financial.js, pricing.js, marketing.js
**Target Market:** Pre-seed/Seed founders, corporate venture teams, MBA students
**Implementation Status:** ✅ Sub-agent works (artifacts only, needs real modeling)
**TAM:** $1B+ | **Build Time:** 8 weeks | **Revenue Potential:** $20-100M ARR

**ChatGPT Objection Response:**
> ChatGPT doesn't generate structured financial models, doesn't apply industry benchmarks, doesn't create downloadable artifacts, hallucinates unit economics.

---

### VENTURE 3: Sales Playbook Automation ("PlaybookBuilder")
**What it does:**
- Sales process stage definition
- Methodology selection (SPIN, Challenger, Solution Selling, Product-Led)
- Playbook generation with talk tracks
- Objection handlers, case study templates
- Conversion rate targets per stage

**Files:** lib/sub-agents/sales.js
**Target Market:** Sales leaders, startups building SDR teams, sales consultants
**Implementation Status:** ✅ Sub-agent works (artifacts only, needs real frameworks)
**TAM:** $800M+ | **Build Time:** 4 weeks | **Revenue Potential:** $5-30M ARR

**ChatGPT Objection Response:**
> ChatGPT doesn't apply specific methodologies consistently, doesn't create playbook frameworks, can't integrate with CRM.

---

### VENTURE 4: Exit Strategy & Valuation Modeling ("ExitPlanner")
**What it does:**
- Multi-method valuation (Revenue Multiple, DCF, Comparables, VC method)
- Exit scenario modeling (Strategic acquisition, PE, IPO)
- Comparable company analysis
- 3-5 year revenue projections
- Investor return modeling

**Files:** lib/sub-agents/valuation.js
**Target Market:** VC-backed founders, CFOs planning exits, startup advisors
**Implementation Status:** ✅ Sub-agent works (artifacts only, needs real comps)
**TAM:** $400M+ | **Build Time:** 6 weeks | **Revenue Potential:** $5-25M ARR

**ChatGPT Objection Response:**
> ChatGPT hallucinates multiples, doesn't track comparables, no scenario modeling framework.

---

### VENTURE 5: Naming + URL + Branding Package ("NameForge")
**What it does:**
- AI-generated venture/product names (scored, ranked)
- Domain availability checking (instant .com/.io/.co lookup)
- Logo concept generation (style, colors, typography recommendations)
- Tagline generation
- Brand voice guidelines

**Status:** ❌ NOT YET BUILT (validation schemas exist, no generation)
**Target Market:** Every startup, agencies, product teams
**TAM:** $300M+ | **Build Time:** 4 weeks | **Revenue Potential:** $5-20M ARR

**ChatGPT Objection Response:**
> ChatGPT can suggest names but can't check domain availability, can't score names against phonetic/memorability criteria, can't generate coordinated brand packages.

---

### VENTURE 6: Marketing Content Generator ("ContentForge")
**What it does:**
- Ad copy generation (Facebook, Google, LinkedIn formats)
- Landing page copy (hero, benefits, CTA sections)
- Email sequence writing (welcome, nurture, win-back)
- Social media posts (platform-specific formats)
- Blog post outlines and drafts

**Status:** ❌ NOT YET BUILT (DB schema + E2E tests exist, no API endpoints)
**Target Market:** Founders, marketers, agencies, content teams
**TAM:** $1B+ | **Build Time:** 6 weeks | **Revenue Potential:** $10-50M ARR

**ChatGPT Objection Response:**
> ChatGPT generates generic copy. This tool generates platform-specific, conversion-optimized content with A/B variants, integrated with your ICP and positioning.

---

### VENTURE 7: Distribution Automation ("LaunchPad")
**What it does:**
- Automated social posting (schedule, cross-platform)
- Ad campaign setup (budget allocation, audience targeting)
- SEO optimization (keyword research, meta generation)
- Analytics integration (attribution, conversion tracking)
- Launch sequence orchestration

**Status:** ❌ NOT YET BUILT (channel recommendations only)
**Target Market:** Founders, growth teams, agencies
**TAM:** $2B+ | **Build Time:** 12 weeks | **Revenue Potential:** $20-100M ARR

**ChatGPT Objection Response:**
> ChatGPT gives advice. This tool takes action - connects to ad platforms, schedules posts, monitors performance.

---

## VENTURE COMPARISON MATRIX

| Venture | TAM | Differentiation | Build Time | ChatGPT Defensible | Implementation Status |
|---------|-----|-----------------|------------|-------------------|----------------------|
| **Opportunity Discovery** | $500M+ | 9/10 (4 Buckets unique) | 6 weeks | ✅ Live data | ✅ 100% REAL |
| **Business Model Suite** | $1B+ | 7/10 (benchmarks) | 8 weeks | ✅ Artifacts | ✅ Sub-agent works |
| **Sales Playbooks** | $800M+ | 6/10 (methodology) | 4 weeks | ✅ Frameworks | ✅ Sub-agent works |
| **Exit Valuation** | $400M+ | 7/10 (scenarios) | 6 weeks | ✅ Comps data | ✅ Sub-agent works |
| **NameForge** | $300M+ | 6/10 (domain check) | 4 weeks | ✅ Integrations | ❌ Schema only |
| **ContentForge** | $1B+ | 5/10 (ICP integration) | 6 weeks | ⚠️ Moderate | ❌ Schema + tests |
| **LaunchPad** | $2B+ | 8/10 (action vs advice) | 12 weeks | ✅ Automation | ❌ Nothing |
| **Validator (Tiered)** | $200M+ | 8/10 (integrated) | 10 weeks | ✅ SLO model | ✅ Discovery works |

---

## THE INTEGRATED STACK OPPORTUNITY

**Key Insight:** These aren't 7 separate ventures - they're stages of ONE founder journey:

\`\`\`
Discover Gap → Validate Idea → Model Business → Plan GTM/Sales → Plan Exit
     ↓              ↓               ↓                ↓              ↓
  MarketGap    Validator      ModelBuilder     PlaybookBuilder  ExitPlanner
\`\`\`

**Strategic Options:**
- **Option A:** Launch as separate ventures, cross-sell
- **Option B:** Launch as one integrated platform ("Founder OS")
- **Option C:** Start with one, add others as premium tiers

---

## FEATURE-ONLY CAPABILITIES (Stay in EHG)

These are valuable but NOT standalone ventures:
- Analytics & Metrics Framework (commodity - Amplitude/Mixpanel dominate)
- User Story Context Engineering (too platform-specific)
- Design System Validation (Storybook/Chromatic dominate)
- Testing Intelligence (Playwright/Cypress ecosystem owns this)
- Security Scanning (Snyk/GitHub Security own this)`;

const rationale = `This SD captures the comprehensive venture evaluation research conducted during the EHG capability audit. The research identified 7 potential venture candidates based on:

1. **Implementation Status**: What's already built vs scaffolding
2. **Market Potential**: TAM/SAM/SOM estimates
3. **Differentiation**: ChatGPT objection defense strength
4. **Build Effort**: Weeks to production-ready

Key findings:
- Discovery pipeline is 100% production-ready (best candidate for quick launch)
- Sub-agents work but produce artifacts only (need real modeling/data)
- Naming, Content, Distribution are pure scaffolding (highest build effort)

This SD should be resumed when ready to:
1. Run triangulation research on selected candidates
2. Select first venture to productize
3. Create implementation SDs`;

const success_criteria = `## RESEARCH PROTOCOL

For each venture candidate, run triangulation research (ChatGPT + Gemini + Claude):

1. **MARKET**: Who pays for this today? What do they pay?
2. **COMPETITION**: What tools exist? Pricing? Gaps?
3. **ECONOMICS**: Realistic CPC, conversion rates, break-even CAC?
4. **ZERO-TOUCH**: Can this run without human support at target price?
5. **DIFFERENTIATION**: How do we defeat "just use ChatGPT"?
6. **VERDICT**: GO / CONDITIONAL GO / NO GO with rationale

## DELIVERABLES

1. [ ] Select which ventures to research (all 7, top 3, or single deep-dive)
2. [ ] Generate specific research prompts for each selected venture
3. [ ] Run triangulation (ChatGPT + Gemini + Claude for each)
4. [ ] Synthesize results into final ranking
5. [ ] Select first venture for implementation
6. [ ] Create implementation SD for selected venture

## SUCCESS CRITERIA

- Clear GO/NO-GO verdict for each researched venture
- Selected venture has validated:
  - Market demand (people pay for this)
  - Viable economics (SLO or profitable)
  - Zero-touch feasibility (solo operator model)
  - ChatGPT defensibility (clear differentiation)`;

async function createVentureEvaluationSD() {
  const sd = {
    id: 'SD-VENTURE-EVAL-001',
    sd_key: 'SD-VENTURE-EVAL-001',
    title: 'Venture Candidate Evaluation & Productization Research',
    description: 'Comprehensive evaluation of 7 venture candidates identified from EHG capability audit. Includes market analysis framework, competitive positioning, and triangulation research protocol for each candidate.',
    category: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    scope: scope,
    rationale: rationale,
    success_criteria: success_criteria,
    target_application: 'EHG_Engineer',
    metadata: {
      venture_candidates: 7,
      production_ready: ['Opportunity Discovery', 'Validator'],
      sub_agent_ready: ['Business Model Suite', 'Sales Playbooks', 'Exit Valuation'],
      scaffolding_only: ['NameForge', 'ContentForge', 'LaunchPad'],
      total_tam: '$6B+',
      research_protocol: 'triangulation',
      source: 'EHG Capability Audit 2026-01-04'
    }
  };

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .upsert(sd, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Created SD:', sd.id);
  console.log('   Title:', sd.title);
  console.log('   Status:', sd.status);
  console.log('   Category:', sd.category);
  console.log('   Venture Candidates:', sd.metadata.venture_candidates);
  console.log('   Total TAM:', sd.metadata.total_tam);
}

createVentureEvaluationSD();
