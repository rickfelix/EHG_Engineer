# User Stories for SD-VENTURE-STAGE0-UI-001
**Stage 0 Inception & 25-Stage Ventures UI Integration**

## Overview
Created: 2025-12-11
Status: READY FOR REVIEW (awaiting SD creation in database)
Total Stories: 7
Total Story Points: 39
Agent: stories-agent (Sonnet 4.5)

## INVEST Criteria Compliance
All user stories follow INVEST principles:
- **Independent**: Each story can be developed separately
- **Negotiable**: Implementation details are flexible
- **Valuable**: Clear user benefit for each story
- **Estimable**: 3-8 story points per story
- **Small**: Each story completable in 1-2 days
- **Testable**: Given-When-Then acceptance criteria with E2E tests

## User Story Summary

### US-001: Create Venture via Manual Entry (Stage 0 - INCEPTION)
**Priority**: CRITICAL | **Points**: 5

**AS A** Venture Creator
**I WANT** to create a new venture from scratch using manual entry, starting at Stage 0 (INCEPTION)
**SO THAT** I can quickly capture venture ideas as they come to me, without needing existing competitors or blueprints

**Key Acceptance Criteria**:
- Venture created with stage_id = 0 (INCEPTION)
- Form validates required fields (name, description, category)
- Stage 0 badge displays in ventures grid
- Success message confirms creation

**E2E Test**: `/tests/e2e/ventures/US-001-manual-entry-stage0.spec.ts`

**Implementation Context**:
- Extends existing CreateVentureDialog component
- First of three creation paths (baseline for others)
- Simple path with no external data dependencies

**Architecture References**:
- `src/components/ventures/CreateVentureDialog.tsx` - Existing dialog to extend
- `src/components/ventures/VenturesManager.tsx` - Grid display component
- `src/components/ventures/VentureStageDisplay.tsx` - NEW component for stage badges
- `Database: ventures table (stage_id column)`
- `Database: venture_lifecycle_stages table (stage 0 definition)`

---

### US-002: Create Venture via Competitor Clone (Stage 0 - INCEPTION)
**Priority**: HIGH | **Points**: 8

**AS A** Venture Creator
**I WANT** to create a new venture by cloning an existing competitor venture, starting at Stage 0
**SO THAT** I can quickly replicate successful venture patterns and adapt them to my own ideas

**Key Acceptance Criteria**:
- Clone inherits: description, category, tags from source
- Clone does NOT inherit: stage, financials, metrics, tasks
- New venture always starts at stage_id = 0 (not source stage)
- Validation requires unique venture name
- Preview shows what will/won't be copied

**E2E Test**: `/tests/e2e/ventures/US-002-competitor-clone-stage0.spec.ts`

**Implementation Context**:
- Second of three creation paths
- More complex than Manual Entry (source selection + selective copying)
- Helps users leverage existing venture patterns

**Architecture References**:
- `src/components/ventures/CreateVentureDialog.tsx` - Extend with clone mode
- `src/components/ventures/VenturePicker.tsx` - NEW component for selecting source
- `src/components/ventures/ClonePreview.tsx` - NEW component showing inheritance rules

---

### US-003: Create Venture via Blueprint Browse (Stage 0 - INCEPTION)
**Priority**: HIGH | **Points**: 8

**AS A** Venture Creator
**I WANT** to create a new venture by selecting a pre-defined blueprint template, starting at Stage 0
**SO THAT** I can leverage expert-designed venture frameworks and best practices

**Key Acceptance Criteria**:
- Blueprint catalog shows categorized templates (SaaS, E-commerce, Services)
- Each blueprint displays preview (description, key milestones, difficulty)
- New venture inherits: recommended progression, milestone templates, suggested metrics
- User can customize blueprint data before creating venture
- Empty catalog handled gracefully

**E2E Test**: `/tests/e2e/ventures/US-003-blueprint-browse-stage0.spec.ts`

**Implementation Context**:
- Third of three creation paths
- Most complex (catalog browsing + structure inheritance)
- Provides guided venture creation for less experienced users

**Architecture References**:
- `src/components/ventures/BlueprintCatalog.tsx` - NEW component for browsing
- `src/components/ventures/BlueprintPreview.tsx` - NEW component for details
- `src/hooks/useBlueprints.ts` - NEW hook for fetching blueprints
- `Database: venture_blueprints table` - NEW table for blueprint templates

**Note**: Requires at least 3 sample blueprints created in database

---

### US-004: Filter Ventures by Stage 0 (INCEPTION Phase)
**Priority**: HIGH | **Points**: 3

**AS A** Venture Manager
**I WANT** to filter the ventures grid to show only ventures in Stage 0 (INCEPTION)
**SO THAT** I can focus on early-stage ventures that need initial development and planning

**Key Acceptance Criteria**:
- Filter dropdown includes "Stage 0: INCEPTION" option
- Grid displays only stage_id = 0 ventures when filter active
- Filter badge shows "Stage 0: INCEPTION" with count
- Clear filter returns to all stages
- Empty state handled when no Stage 0 ventures exist
- URL query param (?stage=0) persists filter on refresh

**E2E Test**: `/tests/e2e/ventures/US-004-filter-stage0.spec.ts`

**Implementation Context**:
- Extends existing stage filter (1-25) to include Stage 0
- Builds on existing filtering system
- Ensures backward compatibility with existing stage filters

**Architecture References**:
- `src/components/ventures/StageFilter.tsx` - EXISTING filter dropdown to extend
- `src/hooks/useVentures.ts` - Data fetching with filter params

---

### US-005: Display Dynamic Stage Labels from Database
**Priority**: CRITICAL | **Points**: 5

**AS A** Venture Manager
**I WANT** to see stage labels (0-25) loaded from the database instead of hardcoded values
**SO THAT** stage names stay consistent and can be updated centrally without code changes

**Key Acceptance Criteria**:
- Stage labels fetched from venture_lifecycle_stages table
- Each venture badge shows correct stage label (e.g., "Stage 0: INCEPTION")
- Phase-specific styling applied (blue for INCEPTION, green for Foundation, etc.)
- Loading state displayed while fetching stages
- Fallback label shown for stages not in database ("Stage 99: Unknown")
- React Query caches stage data for performance

**E2E Test**: `/tests/e2e/ventures/US-005-dynamic-stage-labels.spec.ts`

**Implementation Context**:
- CRITICAL for 25-stage system (replaces hardcoded 7-stage labels)
- Enables dynamic stage management without code deployments
- Creates reusable service layer for stage configuration

**Architecture References**:
- `src/services/StageConfigService.ts` - NEW service for stage configuration
- `src/hooks/useStages.ts` - NEW hook for fetching stages
- `src/components/ventures/VentureStageDisplay.tsx` - Update to use dynamic labels
- `Database: venture_lifecycle_stages table (25 stage definitions)`

**Technical Notes**:
- Service layer implements caching (1 hour stale time)
- Phase-based color mapping: INCEPTION (blue), Foundation (green), Development (yellow), Market Entry (orange), Growth (purple), Maturity (gray)

---

### US-006: Filter Ventures by Phase (INCEPTION, Foundation, etc.)
**Priority**: HIGH | **Points**: 5

**AS A** Venture Manager
**I WANT** to filter ventures by lifecycle phase (INCEPTION, Foundation, Development, Market Entry, Growth, Maturity)
**SO THAT** I can group and manage ventures by high-level phase instead of individual stages

**Key Acceptance Criteria**:
- Phase filter dropdown shows 6 phases with stage ranges
- Selecting "INCEPTION" shows only Stage 0 ventures
- Selecting "Foundation" shows Stages 1-5 ventures
- Filter badge shows "Phase: [NAME] (Stages X-Y)"
- Phase filter can combine with category filter
- Empty state handled when no ventures in selected phase

**E2E Test**: `/tests/e2e/ventures/US-006-filter-by-phase.spec.ts`

**Implementation Context**:
- Higher-level filtering than stage filter
- Useful for portfolio management and reporting
- Phase definitions come from database (grouped from stages)

**Architecture References**:
- `src/components/ventures/PhaseFilter.tsx` - NEW component for phase filtering
- `src/hooks/usePhases.ts` - NEW hook for fetching phase definitions
- `src/services/StageConfigService.ts` - Service for stage/phase mapping

**Phase Mapping**:
- INCEPTION: Stage 0
- Foundation: Stages 1-5
- Development: Stages 6-10
- Market Entry: Stages 11-15
- Growth: Stages 16-20
- Maturity: Stages 21-25

---

### US-007: Promote Venture from Stage 0 to Stage 1
**Priority**: CRITICAL | **Points**: 5

**AS A** Venture Manager
**I WANT** to promote a venture from Stage 0 (INCEPTION) to Stage 1 (Foundation Setup)
**SO THAT** I can move ventures through the lifecycle as they progress

**Key Acceptance Criteria**:
- "Promote to Stage 1" button shows for Stage 0 ventures only
- Confirmation dialog prevents accidental promotion
- Readiness validation checks required fields (name, description, category)
- Venture stage_id updates from 0 to 1
- Stage badge updates to "Stage 1: Foundation Setup"
- Stage change recorded in venture_stage_history table (audit trail)
- Success message confirms promotion

**E2E Test**: `/tests/e2e/ventures/US-007-promote-stage0-to-1.spec.ts`

**Implementation Context**:
- First stage promotion in 25-stage lifecycle
- Establishes pattern for future stage promotions (1→2, 2→3, etc.)
- Critical workflow - must be reversible and auditable

**Architecture References**:
- `src/components/ventures/PromoteStageButton.tsx` - NEW component for promotion
- `src/components/ventures/PromoteStageDialog.tsx` - NEW confirmation dialog
- `src/hooks/usePromoteVenture.ts` - NEW mutation hook for promotion
- `Database: ventures table (stage_id update)`
- `Database: venture_stage_history table` - NEW table for audit trail

**Technical Notes**:
- Stage history tracks: venture_id, stage_from, stage_to, changed_at, changed_by
- Future stages may have additional readiness checks (e.g., Stage 10 requires market validation data)

---

## Implementation Order (Suggested)

### Phase 1: Foundation (Stories 5, 4)
1. **US-005**: Dynamic Stage Labels (CRITICAL - needed by all other stories)
2. **US-004**: Filter by Stage 0 (extends existing filter)

### Phase 2: Creation Paths (Stories 1, 2, 3)
3. **US-001**: Manual Entry (simplest path - baseline)
4. **US-002**: Competitor Clone (builds on Manual Entry pattern)
5. **US-003**: Blueprint Browse (most complex - requires blueprint table)

### Phase 3: Advanced Features (Stories 6, 7)
6. **US-006**: Filter by Phase (higher-level filtering)
7. **US-007**: Promote Stage 0→1 (stage progression workflow)

## Database Dependencies

### Existing Tables (Must Exist)
- `ventures` - Main ventures table (with stage_id column)
- `venture_lifecycle_stages` - Stage definitions (0-25)

### New Tables (To Be Created)
- `venture_blueprints` - Blueprint templates (for US-003)
- `venture_stage_history` - Stage change audit trail (for US-007)

## Total Effort Estimate
- **Total Story Points**: 39
- **Estimated Developer Days**: 7-10 days (assuming 1 developer)
- **Testing Days**: 3-4 days (E2E test development)
- **Total Project Duration**: 10-14 days

## Risk Assessment

### High Risk Items
1. **Blueprint System** (US-003) - New table and complex inheritance logic
2. **Dynamic Labels** (US-005) - Critical dependency for all other stories
3. **Stage History** (US-007) - New audit trail system

### Medium Risk Items
4. **Phase Filtering** (US-006) - Complex query logic (JOIN with stages)
5. **Competitor Clone** (US-002) - Selective data copying rules

### Low Risk Items
6. **Manual Entry** (US-001) - Extends existing dialog
7. **Stage 0 Filter** (US-004) - Simple filter extension

## Next Steps

1. **Create SD in Database**: Run SD creation script to enable user story insertion
2. **Create Blueprint Table**: Required for US-003
   ```sql
   CREATE TABLE venture_blueprints (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     description TEXT,
     milestones JSONB,
     metrics JSONB,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

3. **Create Stage History Table**: Required for US-007
   ```sql
   CREATE TABLE venture_stage_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venture_id UUID REFERENCES ventures(id),
     stage_from INTEGER,
     stage_to INTEGER,
     changed_at TIMESTAMP DEFAULT NOW(),
     changed_by UUID REFERENCES auth.users(id)
   );
   ```

4. **Insert User Stories**: Once SD exists, run `/scripts/add-user-stories-sd-venture-stage0-ui-001.js`

5. **Begin EXEC Phase**: Start with US-005 (Dynamic Stage Labels) as foundation

## Files Created

1. `/scripts/add-user-stories-sd-venture-stage0-ui-001.js` - User story insertion script
2. `/scripts/check-sd-venture-stage0.mjs` - SD existence checker
3. `/docs/user-stories/SD-VENTURE-STAGE0-UI-001-USER-STORIES.md` - This summary document

## v2.0.0 Compliance

This user story set follows LEO Protocol v2.0.0 guidelines:

### INVEST Criteria (Improvement #3)
- All 7 stories validated against INVEST criteria
- Independent, Negotiable, Valuable, Estimable, Small, Testable

### Acceptance Criteria Templates (Improvement #4)
- Given-When-Then format for all acceptance criteria
- Happy path, error path, and edge cases covered
- Minimum 3-4 criteria per story

### Rich Implementation Context (Improvement #5)
- Architecture references for each story
- Example code patterns included
- Integration points documented
- Technical notes with edge cases

### E2E Test Mapping (Improvement #1)
- E2E test path specified for each story
- Tests follow US-XXX naming convention
- Ready for automated E2E test mapping script

### Auto-Validation Ready (Improvement #2)
- All stories created in 'draft' status
- Ready for auto-validation on EXEC completion
- Definition of done clearly specified

---

**Generated by**: stories-agent (Sonnet 4.5)
**Model ID**: claude-sonnet-4-5-20250929
**Phase**: PLAN
**SD**: SD-VENTURE-STAGE0-UI-001
