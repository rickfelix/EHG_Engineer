---
description: Force DESIGN sub-agent analysis for UI/UX issues
argument-hint: [describe the UI/design issue]
---

# 🎨 LEO DESIGN Sub-Agent Analysis (Enhanced UI/UX + Application Expertise)

**Design Task:** $ARGUMENTS

## 🏗️ Application Architecture Awareness (v4.2.0)

**NEW**: Design sub-agent now has deep knowledge of EHG application structure:
- ✅ 10+ feature areas (Chairman, Ventures, Analytics, etc.)
- ✅ 40+ existing page routes and purposes
- ✅ Reusable component patterns catalog
- ✅ Documented user workflows
- ✅ Historical design decisions

### Pre-Implementation Context Query

Before designing new UI, the sub-agent will:
1. **Query** `ehg_feature_areas` for related domains
2. **Search** `ehg_page_routes` for similar pages
3. **Check** `ehg_component_patterns` for reusable components
4. **Review** `ehg_user_workflows` for existing user journeys
5. **Analyze** `ehg_design_decisions` for past patterns

**Run Context Builder**:
```bash
node scripts/design-subagent-context-builder.js context "Your feature description" [AREA_CODE] [keywords]
```

**Search Similar Features**:
```bash
node scripts/design-subagent-context-builder.js search "search term"
```

## 🔍 Workflow Mode Detection

The Design sub-agent automatically determines the appropriate mode based on your task:

- **🎨 UI Mode**: Visual components, styling, design system
- **👤 UX Mode**: User flows, navigation, interactions
- **🔄 Integrated Mode**: Complete feature with both UI and UX (default for backend features)

## 📋 Analysis Checklist

### 🏗️ Application Context Checklist (NEW - REQUIRED FIRST)
- [ ] **Similar features identified**: Searched for existing pages/components
- [ ] **UI placement evaluated**: Determined optimal location (extend page, new page, modal, tab)
- [ ] **Component reuse assessed**: Identified reusable patterns (80%+ match = reuse)
- [ ] **Workflow integration planned**: Mapped to existing user journeys
- [ ] **Design decision documented**: Recorded rationale in `ehg_design_decisions`

### UI Checklist (Visual Component Design)
- [ ] Visual components defined with complete specifications
- [ ] Design system compliance verified
- [ ] Responsive design tested at all breakpoints
- [ ] Theme support (light/dark mode) implemented
- [ ] CSS/Tailwind implementation ready

### UX Checklist (User Experience Design)
- [ ] User flows documented and mapped
- [ ] Navigation paths clear and intuitive
- [ ] WCAG 2.1 AA accessibility compliance verified
- [ ] Interaction patterns defined for all user actions
- [ ] End-to-end user journey validated

## 🎯 Focus Areas by Mode

### UI Mode (Visual Design)
1. **Component Visual Design**
   - Layout and spacing
   - Typography and color
   - Design tokens application

2. **CSS & Styling**
   - Tailwind class usage
   - CSS specificity issues
   - Style overrides
   - Responsive breakpoints

3. **Theme Implementation**
   - `dark:` prefix for dark mode
   - Document root class toggle
   - LocalStorage persistence
   - CSS variables

4. **Design System Compliance**
   - Component patterns
   - Color palette adherence
   - Typography scale
   - Spacing system

### UX Mode (Experience Design)
1. **User Flow Mapping**
   - Entry points
   - User journeys
   - Exit points
   - Error states

2. **Navigation Architecture**
   - Information architecture
   - Menu structure
   - Breadcrumb trails
   - Deep linking

3. **Accessibility**
   - WCAG 2.1 AA compliance
   - ARIA labels and roles
   - Keyboard navigation
   - Screen reader support
   - Focus management

4. **Interaction Patterns**
   - Click/tap targets (44x44px min)
   - Hover states
   - Loading indicators
   - Error messages
   - Success feedback

### Integrated Mode (Complete Feature)
**Runs both UI and UX analysis in sequence:**
1. UX analysis → Create user flows
2. UI analysis → Design components
3. Validate flows work with components
4. Create unified handoff with both specs

## 🚨 Backend Feature Detection

**CRITICAL**: If backend features are detected without UI specifications:
- API endpoints
- Database tables/models
- New routes/controllers
- Service layer logic

The Design sub-agent will:
1. **Flag** missing UI/UX requirements
2. **Run** integrated mode automatically
3. **Block** EXEC handoff until design approved
4. **Generate** component specifications

## 📁 Files to Review

### UI Files:
- `tailwind.config.js`
- Component style files
- Theme hook implementation
- CSS class applications
- Design token definitions

### UX Files:
- Route configurations
- Navigation components
- Accessibility attributes
- User flow diagrams
- Interaction handlers

## 🔧 Implementation Strategy

1. **Detect mode** based on task keywords
2. **Run appropriate checklist(s)**
3. **Verify completeness** (100% required)
4. **Generate handoff** to EXEC with specifications
5. **Ensure accessibility** compliance

## ✅ Success Criteria

**All THREE checklists must be 100% complete before EXEC handoff:**
1. **Application Context Checklist** (NEW) - Ensures optimal UI placement
2. **UI Checklist** - All UI components specified
3. **UX Checklist** - All UX flows documented

**Additional Requirements**:
- Accessibility verified (WCAG 2.1 AA)
- Design system compliance confirmed
- Responsive design validated
- Design decision recorded in database

## 🎯 UI Placement Decision Framework

### Step 1: Analyze Context
**Question**: What is this feature trying to accomplish?
- Query `ehg_feature_areas` for related domains
- Search `ehg_page_routes` for similar pages
- Check `ehg_user_workflows` for existing journeys

### Step 2: Evaluate Placement Options
**Question**: Where should this UI live?

| Option | When to Use | Example |
|--------|-------------|---------|
| **Extend existing page** | Feature complements current functionality | Add tab to detail page |
| **New page in existing area** | Distinct but part of existing domain | New report type in /reports |
| **New top-level navigation** | Entirely new domain with multiple pages | New "Forecasting" section |
| **Modal/dialog** | Supporting action in existing flow | Quick edit or confirmation |

### Step 3: Component Reuse Assessment
**Question**: Can we reuse existing components?
- Query `ehg_component_patterns` for matching patterns
- Check `example_usage` for similar implementations
- **Rule**: If existing pattern fits 80%+ of requirements → REUSE

**Preference Order**: Reuse > Extend > Create New

### Step 4: Workflow Integration
**Question**: How does this fit into user workflows?
- Query `ehg_user_workflows` for related journeys
- Identify natural entry/exit points
- Ensure navigation paths make sense

### Step 5: Document Decision
**Question**: Why did we choose this approach?
- Insert into `ehg_design_decisions` table
- Document alternatives considered
- Record rationale for future reference

## 🔧 Pre-Implementation Questions

The Design sub-agent will ask:
1. "Is there a similar feature in [FEATURE_AREA]?"
2. "Can this extend the existing [PAGE_NAME] instead of creating new page?"
3. "Does this fit into the [WORKFLOW_NAME] user workflow?"
4. "Are there existing [PATTERN_NAME] components we can reuse?"
5. "Would users expect to find this in [NAVIGATION_PATH]?"
6. "Is this better as a tab, modal, or separate page?"

## 🔍 Audit Command

To check existing features for UI/UX coverage:
```bash
node scripts/design-ui-ux-audit.js --all
```

---

**The Design sub-agent ensures:**
✅ No "invisible backend features"
✅ Every feature has a user-facing interface
✅ Accessibility is never an afterthought
✅ Design system consistency maintained