# Architecture Plan: Design as Competitive Advantage

## Stack & Repository Decisions
- **Repositories**: EHG (frontend — shared component library source), EHG_Engineer (LEO Protocol design gates, metrics pipeline)
- **Component Library**: `@ehg/components` npm workspace package (extracted from EHG's `src/components/ui/`)
- **Token System**: `@ehg/tokens` npm workspace package (built from `ehg-design-tokens.json`)
- **Design Documentation**: Storybook 8.x (new dependency for interactive component explorer)
- **Quality Scoring**: Existing design-agent (v4.2.0) + new metrics aggregation layer
- **Database**: Supabase (PostgreSQL) — extends existing schema
- **Existing Infrastructure (Fully Reusable)**: Design-agent v4.2.0 (WCAG audits, responsive validation), design tokens (3-tier hierarchy), 60 Shadcn components, axe-core (Playwright + React), eslint-plugin-jsx-a11y, Golden Nugget Validator, component audit scripts, design-database gates
- **New Dependencies**: `storybook@8.x` (documentation), `chromatic` or Playwright visual regression (testing)

## Legacy Deprecation Plan
N/A — additive infrastructure. Existing design-agent, components, and gates remain in place. The shared library is extracted from existing code, not replacing it. The EHG app becomes a consumer of its own published components.

## Route & Component Structure

### EHG_Engineer (Backend/Infrastructure)
- `lib/integrations/design-quality-scorer.js` — Aggregates design quality metrics across ventures (accessibility, token compliance, reuse ratio)
- `lib/integrations/design-metrics-collector.js` — Collects and stores per-venture design health data
- `scripts/eva/design-health-dashboard.mjs` — Generates venture design health report
- `scripts/design/component-reuse-analyzer.js` — Analyzes component usage across ventures
- `scripts/design/design-token-compliance-checker.js` — Validates venture token usage against shared system

### EHG (Frontend — Shared Library)
- `packages/components/` — `@ehg/components` workspace package
  - `src/` — Generalized versions of current `src/components/ui/` components
  - `stories/` — Storybook stories for each component
  - `package.json` — Publishable package with semver
- `packages/tokens/` — `@ehg/tokens` workspace package
  - `src/tokens.json` — Base design tokens (brand + semantic tiers)
  - `src/themes/` — Per-venture theme overrides
  - `build.js` — Generates CSS variables, Tailwind config, TypeScript constants
- `.storybook/` — Storybook configuration at workspace root

## Data Layer

### New Tables
- `venture_design_health` — Per-venture design quality metrics
  - `id` (uuid), `venture_id` (fk → ventures), `measured_at` (timestamptz)
  - `accessibility_score` (int 0-100), `token_compliance_score` (int 0-100)
  - `component_reuse_ratio` (numeric), `consistency_score` (int 0-100)
  - `design_debt_count` (int), `details` (jsonb — per-category breakdowns)

- `design_patterns` — Cross-venture design pattern library
  - `id` (uuid), `pattern_name` (text), `category` (text — navigation, form, data-display, feedback, layout)
  - `description` (text), `usage_examples` (jsonb — code snippets, screenshots)
  - `provenance` (jsonb — which venture discovered it, evidence of effectiveness)
  - `components_used` (text[] — references to @ehg/components)
  - `status` (active, deprecated), `created_at` (timestamptz)

- `venture_design_customizations` — Per-venture brand token overrides
  - `id` (uuid), `venture_id` (fk → ventures)
  - `brand_tokens` (jsonb — color overrides, typography, spacing)
  - `theme_config` (jsonb — light/dark mode customizations)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

### Existing Tables Used
- `ventures` — Venture context for design health scoring
- `strategic_directives_v2` — SD type and status for design gate enforcement
- `sd_phase_handoffs` — Handoff data for design quality gate results
- `ehg_component_patterns` — Existing component usage tracking

### RLS
- Service role for backend metrics collection
- Authenticated read for dashboard access (chairman view)

## API Surface
- No new REST endpoints needed (internal pipeline)
- RPC: `get_venture_design_health(venture_id, since_date)` — for dashboard integration
- RPC: `get_design_patterns(category, search_term)` — pattern library search
- The existing design-agent gates handle SD workflow integration

## Implementation Phases
- **Phase 1** (3 weeks): Metrics — Create `venture_design_health` table. Build design-quality-scorer.js aggregating existing axe-core results, token usage, and component audit data. Dashboard script for chairman view. Establish baseline measurements.
- **Phase 2** (3 weeks): Review Expansion — Expand `requiresDesignDatabaseGatesSync()` to all feature SDs. Add accessibility testing to CI/CD pipeline (pre-merge hook). Add design quality acceptance criteria to PRD creation template. Pre-commit design linting for token compliance.
- **Phase 3** (6 weeks): Shared Library — Set up npm workspaces in EHG repo. Extract and generalize 30 most-used components into `@ehg/components`. Create `@ehg/tokens` package with build pipeline. Add Storybook with stories for all published components. Visual regression testing baseline.
- **Phase 4** (4 weeks): Venture Customization — Create `venture_design_customizations` table. Token override system (venture tokens inherit from base, override specific values). Token build script generates venture-specific CSS variables. Documentation for venture design onboarding.
- **Phase 5** (4 weeks): Pattern Library — Create `design_patterns` table. Extract 20-30 patterns from existing components with usage examples and decision rationale. Build searchable UI in chairman view. Provenance tracking (which venture, what evidence).

## Testing Strategy
- Unit tests for design quality scorer (known component data → expected scores)
- Integration tests for token compliance checker (valid/invalid token usage → correct flags)
- Visual regression tests for shared components (Storybook + Playwright screenshots)
- Accessibility regression tests in CI/CD (axe-core on component Storybook stories)
- Cross-venture component compatibility tests (shared components render correctly with venture-specific tokens)

## Risk Mitigation
- **Speed-vs-quality tension**: Design quality tiers by venture stage. Validation-stage ventures: accessibility baseline only (axe-core passes). Growth-stage: full design system compliance. Gates scale with venture maturity.
- **Homogeneity (all ventures look the same)**: Layered token system — immutable foundation (spacing, type scale) + fully customizable surface (colors, brand). Ventures own their visual identity. Component variants supported without forking.
- **Shared library governance**: Clear ownership model. Shared library changes require backward compatibility or semver major bump. Ventures can pin versions. Quarterly maintenance review.
- **AI can't replace design taste**: Explicitly scope automation to "design hygiene" (floor). Design excellence (ceiling) requires chairman or human judgment. Gates are labeled "baseline quality" not "design approved."
- **Market relevance**: Design investment is optional per venture. Portfolio strategy determines which ventures are in design-sensitive markets. Infrastructure supports all ventures; enforcement intensity varies.
- **Storybook maintenance burden**: Stories auto-generated from component props. Visual regression catches drift. Maintenance is incremental, not a separate workstream.
