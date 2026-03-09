# Vision: Design as Competitive Advantage

## Executive Summary
EHG's venture factory launches products into competitive markets where design quality increasingly determines user preference and retention. Currently, design quality is strong but siloed — the Chairman V3 UI has 86+ components, design tokens, accessibility testing, and a design sub-agent, but this infrastructure doesn't systematically transfer to new ventures. This vision transforms design from an ad-hoc per-venture effort into a portfolio-level strategic asset: a Design Intelligence Layer that compounds across ventures, ensuring every EHG product launches with design quality that took competitors years to achieve.

The strategic bet: in a world where AI commoditizes code generation, design quality and design intelligence become the durable differentiators. EHG's venture factory model generates the diversity of design contexts that trains this intelligence — a compounding advantage no single-product company can replicate.

## Problem Statement
EHG has invested significantly in design infrastructure for the Chairman V3 UI — 60 Shadcn components, 3-tier design tokens, accessibility testing (axe-core), a design sub-agent (v4.2.0), and quality gates. But this investment is locked in a single application. New ventures start from scratch, encountering the same design decisions and making the same mistakes. There is no systematic measurement of design quality, no cross-venture component sharing, and no mechanism to translate design decisions in one venture into institutional knowledge. The design-agent validates accessibility but doesn't enforce broader design quality across all SD types.

## Personas
- **Chairman (Rick)**: Portfolio-level view. Cares about consistent design quality across all ventures. Values design as a differentiator but cannot personally review every screen in every venture.
- **EVA (AI Advisor)**: Can assess design quality at scale — component compliance, token usage, accessibility scores — and surface insights across the portfolio.
- **Venture Development Teams (LEO/Claude)**: Consume the shared design system. Need components that are high-quality, well-documented, and easy to customize for their venture's brand identity.
- **End Users (per venture)**: Experience the result. Design quality affects perception of product quality, trust, and willingness to pay.

## Information Architecture
- **Design Token Registry**: Supabase-backed registry of design tokens organized in 3-tier hierarchy (Brand → Semantic → Component). Each venture inherits base tokens and can override for brand customization. Version-controlled with change tracking.
- **Component Quality Index**: Every shared component scored on accessibility (axe-core), performance (bundle size, render time), design coherence (token compliance), and usage health (adoption across ventures).
- **Design Decision Log**: Captures *why* design decisions were made — which pattern was chosen, what alternatives were considered, what evidence informed the choice. Feeds into the cross-venture pattern library.
- **Venture Design Health Dashboard**: Aggregated view across all ventures — consistency scores, accessibility compliance, component reuse ratios, design debt tracking.
- **Existing Foundation**: Design tokens (`ehg-design-tokens.json`), 60 Shadcn components, design-agent (v4.2.0), accessibility testing (7 test files), Golden Nugget Validator, component audit tools.

## Key Decision Points
- **Design Quality Tiers by Venture Stage**: Validation-stage ventures get minimal design requirements (accessibility baseline only). Growth-stage ventures get full design system integration. This resolves the speed-vs-quality tension — design investment scales with venture maturity, not applied uniformly.
- **Shared System Architecture**: Layered design system — immutable foundation (spacing, type scale, accessibility utilities) that every venture uses, with fully customizable surface layer (colors, brand tokens, component variants). Ventures own their visual identity while inheriting structural quality.
- **Design Hygiene vs Design Excellence**: Automated review (axe-core, token compliance, component usage) handles the floor. Human/AI judgment handles the ceiling. The two are never conflated — "passing gates" means baseline quality, not great design.
- **Cross-Venture Sharing Mechanism**: npm workspace-based shared packages (`@ehg/components`, `@ehg/tokens`) published from a monorepo structure. Components have semver versioning, ventures can pin versions.
- **Design Review Scope**: Expand design-agent auto-invocation to ALL feature SDs (not just subset). Add design quality metrics to retrospective data.

## Integration Patterns
- **LEO Protocol**: Design becomes a first-class quality dimension in the SD workflow. LEAD phase assesses design implications, PLAN phase includes design acceptance criteria in PRDs, EXEC phase runs design quality gates on every PR, retrospectives capture design learnings.
- **EVA Chat Canvas**: Canvas artifacts serve as both a product feature and a design system testbed. Components used in the canvas are shared library components, providing continuous validation.
- **Competitive Intelligence**: Design benchmarking integrated into competitor monitoring — systematically track competitors' accessibility scores, design consistency, performance metrics. Surface design gaps as strategic opportunities.
- **EVA Intake**: Design complexity becomes a classification dimension in the intake taxonomy. New ideas are assessed for their design system compatibility.
- **Existing Design-Agent**: Extended from accessibility auditing to broader design quality scoring — token compliance, component usage validation, responsive design verification.

## Evolution Plan
- **Phase 1** (3 weeks): Metrics and Measurement — Design quality scorecard (consistency %, accessibility %, reuse ratio, component adoption rate). Dashboard showing design metrics across ventures. Baseline data collection.
- **Phase 2** (3 weeks): Systematize Design Review — Expand design-agent to all feature SDs. Add design quality acceptance criteria to PRD process. Pre-commit design linting for token compliance. Accessibility testing in CI/CD.
- **Phase 3** (6 weeks): Shared Component Library — npm workspace structure (`@ehg/components`, `@ehg/tokens`). Extract and generalize Chairman V3's best components. Storybook for interactive documentation. Visual regression testing.
- **Phase 4** (4 weeks): Venture Brand Customization — Token override system for per-venture branding. Database table for venture design customizations. Token build script generates venture-specific CSS variables. Onboarding documentation.
- **Phase 5** (4 weeks): Cross-Venture Pattern Library — Extract 20-30 high-value patterns with usage examples and decision rationale. Searchable pattern explorer. Decision journal tracking pattern provenance across ventures.

## Out of Scope
- Design-as-a-Service product for external companies (future evolution, post-maturity)
- AI-generated complete page layouts (future — current AI produces competent but generic UI)
- Design A/B testing infrastructure (future — requires user analytics pipeline per venture)
- Mobile-specific design system (desktop-first, mobile adaptations later)
- Replacing the chairman's taste-level design judgment with automation (human ceiling, automated floor)
- Hiring full-time designers per venture (contradicts venture factory cost structure)

## UI/UX Wireframes
N/A — this is primarily infrastructure and process. Design quality surfaces through improved output of every venture's UI, not through a dedicated interface (except the metrics dashboard, which follows existing Chairman V3 patterns).

## Success Criteria
- Design quality score reaches 85%+ across all active ventures (baseline TBD in Phase 1)
- WCAG AA accessibility compliance reaches 95%+ (currently ~85% in EHG app)
- Component reuse ratio reaches 60%+ across ventures (currently ~40%, single-venture only)
- New venture time-to-design-baseline drops 50% (measured from first commit to passing design gates)
- Design-agent review coverage: 100% of feature SDs (currently subset)
- Accessibility testing runs in CI/CD on every PR (currently manual)
- At least 20 cross-venture design patterns documented with provenance and evidence
- Design review time per SD drops 30% via automated gates
