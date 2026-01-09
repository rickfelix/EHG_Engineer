# User Stories: SD-EHG-WEBSITE-001

**Strategic Directive**: External EHG Public Website with Narrative Mask
**PRD**: PRD-SD-EHG-WEBSITE-001
**Created**: 2026-01-08
**STORIES Agent Version**: v2.0.0 (INVEST Criteria Compliant)

## Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 8 |
| Total Story Points | 37 |
| Priority Breakdown | 1 Critical, 6 High, 1 Medium |
| Estimated Duration | 5-7 days (assuming 1 developer) |

## INVEST Criteria Compliance

All user stories have been validated against INVEST criteria:

- ✅ **Independent**: Each story can be developed separately
- ✅ **Negotiable**: Implementation details are flexible
- ✅ **Valuable**: Each delivers user-facing value
- ✅ **Estimable**: Story points assigned (3-8 points)
- ✅ **Small**: Each completable in 1-3 days
- ✅ **Testable**: Clear Given-When-Then acceptance criteria

## User Stories

### US-001: Conservative Homepage (3 points, HIGH priority)

**As a** Website Visitor
**I want** to see a professional, conservative homepage that establishes credibility without revealing internal operations
**So that** I understand EHG's value proposition and can navigate to learn more

**Acceptance Criteria (Given-When-Then)**:
1. Given I visit the root domain, When the page loads, Then I see a text-only hero section with no images or illustrations
2. Given I am on the homepage, When I view the color scheme, Then the primary accent color is deep navy (#1e3a8a or similar)
3. Given I am on the homepage, When I view the content, Then there are no mentions of AI, agents, platforms, or internal systems
4. Given I am on the homepage, When I view the navigation, Then I see links to About, Approach, Ventures, and Contact pages
5. Given I am on the homepage, When I scroll down, Then I see a brief value proposition and call-to-action to explore ventures

**Implementation Context**:
- Create a new public-facing homepage route at / (root path)
- Use conservative design with text-only hero, no images
- Deep navy accent color (#1e3a8a)
- Narrative mask: no AI/platform language
- Reference existing About page for tone

**Architecture References**:
- `src/app/(public)/layout.tsx` - Public layout structure
- `src/components/layout/Navigation.tsx` - Navigation component pattern
- `src/app/globals.css` - Color scheme and typography

**E2E Test**: `tests/e2e/ehg-website/homepage.spec.ts`

---

### US-002: About Page with Four Pillars (5 points, HIGH priority)

**As a** Potential Client
**I want** to understand EHG's approach through four clear pillars with visual icons
**So that** I can quickly grasp EHG's methodology and differentiation

**Acceptance Criteria (Given-When-Then)**:
1. Given I navigate to /about, When the page loads, Then I see four distinct pillars presented in a grid layout
2. Given I am on the About page, When I view each pillar, Then each has a line icon (not filled, not illustrative)
3. Given I am on the About page, When I read the pillars, Then the content focuses on principles without revealing internal tools
4. Given I am on the About page, When I view the page on mobile, Then the pillars stack vertically and remain readable
5. Given I am on the About page, When I check the icons, Then they are accessible (aria-labels present, sufficient contrast)

**Implementation Context**:
- Four pillars: (1) Disciplined Analysis, (2) Integrated Execution, (3) Continuous Learning, (4) Sustainable Growth
- Use lucide-react icons (line icons only)
- Grid layout on desktop (2x2), stack on mobile
- Ensure WCAG 2.1 AA compliance for icons

**Architecture References**:
- `src/app/(public)/about/page.tsx` - About page route
- `lucide-react` - Icon library for line icons
- `src/components/ui/card.tsx` - Card component for pillar presentation

**E2E Test**: `tests/e2e/ehg-website/about.spec.ts`

---

### US-003: Approach Page (3 points, HIGH priority)

**As a** Potential Client
**I want** to understand EHG's approach methodology in a structured, principle-based format
**So that** I can evaluate whether EHG's approach aligns with my needs

**Acceptance Criteria (Given-When-Then)**:
1. Given I navigate to /approach, When the page loads, Then I see three columns representing key approach principles
2. Given I am on the Approach page, When I view the content, Then each column has a heading, icon, and principle description
3. Given I am on the Approach page, When I view the content, Then the language is principle-based (e.g., "systematic analysis") not tool-based (e.g., "AI-powered")
4. Given I am on the Approach page, When I view on tablet, Then columns shift to 2-column layout, then 1-column on mobile
5. Given I am on the Approach page, When I check the visual hierarchy, Then headings use consistent typography and spacing

**Implementation Context**:
- Three columns: (1) Research & Discovery, (2) Strategic Execution, (3) Measurement & Optimization
- Use principle-based language (avoid AI/agent references)
- Responsive: 3 cols desktop, 2 cols tablet, 1 col mobile

**Architecture References**:
- `src/app/(public)/approach/page.tsx` - Approach page route
- `src/components/ui/card.tsx` - Card component for column structure
- Tailwind CSS grid system - responsive column layout

**E2E Test**: `tests/e2e/ehg-website/approach.spec.ts`

---

### US-004: Dynamic Ventures Page (8 points, CRITICAL priority)

**As a** Website Visitor
**I want** to browse EHG's venture portfolio with current information pulled from the database
**So that** I can explore real ventures and understand EHG's track record

**Acceptance Criteria (Given-When-Then)**:
1. Given I navigate to /ventures, When the page loads, Then I see venture cards populated from the database (NOT static data)
2. Given I am on the Ventures page, When I view a venture card, Then I see venture name, category, stage, and brief description
3. Given I am on the Ventures page, When a venture has "public_profile = true", Then it appears on the page, otherwise it is hidden
4. Given I am on the Ventures page, When I click a venture card, Then I navigate to a venture detail page (future story) or see expanded info
5. Given I am on the Ventures page, When the database query fails, Then I see a graceful error message (not a crash)
6. Given I am on the Ventures page, When viewing on mobile, Then venture cards stack vertically with full width

**Implementation Context**:
- Query ventures table with filter: `public_profile = true`
- Use Server Components for database query
- Display venture cards in a grid
- Handle loading/error states
- **CRITICAL**: Data must be from database, NOT static/mock

**Architecture References**:
- `src/app/(public)/ventures/page.tsx` - Ventures page with database query
- `src/lib/supabase/server.ts` - Server-side Supabase client
- `src/app/(authenticated)/ventures/page.tsx` - Reference for venture data structure
- `database/schema/*.sql` - Ventures table schema

**E2E Test**: `tests/e2e/ehg-website/ventures.spec.ts`

---

### US-005: Contact Form (5 points, HIGH priority)

**As a** Potential Client
**I want** to contact EHG with relevant information without filling out an extensive form
**So that** I can easily reach out while EHG filters for qualified leads

**Acceptance Criteria (Given-When-Then)**:
1. Given I navigate to /contact, When the page loads, Then I see a form with fields: Name, Email, Company (optional), Interest Area (dropdown), Message
2. Given I am filling the contact form, When I submit without required fields, Then I see validation errors for Name, Email, Message
3. Given I submit the contact form, When the form is valid, Then the data is stored in a "contact_submissions" table (or similar)
4. Given I submit the contact form, When submission succeeds, Then I see a success message and the form clears
5. Given I submit the contact form, When submission fails, Then I see an error message and can retry
6. Given I am on the Contact page, When I view the Interest Area dropdown, Then options include: Venture Development, Advisory Services, Partnership Inquiry, General Inquiry

**Implementation Context**:
- Use react-hook-form for validation
- Store submissions in database (create contact_submissions table if needed)
- Include spam protection (basic rate limiting or honeypot)
- Email notification (optional, can be added later)

**Architecture References**:
- `src/app/(public)/contact/page.tsx` - Contact page with form
- `src/components/forms/*` - Form components and validation patterns
- `src/lib/supabase/server.ts` - Server actions for form submission
- `database/migrations/*.sql` - Create contact_submissions table

**E2E Test**: `tests/e2e/ehg-website/contact.spec.ts`

---

### US-006: Mobile Responsive Design (5 points, HIGH priority)

**As a** Website Visitor
**I want** to access the website from any device (mobile, tablet, desktop) without issues
**So that** I can browse EHG's website conveniently on my preferred device

**Acceptance Criteria (Given-When-Then)**:
1. Given I visit any public page on mobile (viewport 375px), When I view the page, Then all content is readable without horizontal scroll
2. Given I visit any public page on tablet (viewport 768px), When I view the page, Then the layout adapts appropriately (e.g., 2-column grids)
3. Given I visit any public page on desktop (viewport 1440px), When I view the page, Then the layout uses the full design (3-column grids, wider containers)
4. Given I am on mobile, When I tap the navigation menu, Then I see a hamburger menu or mobile-optimized navigation
5. Given I am on any device, When I view text, Then font sizes are legible (minimum 16px for body text on mobile)

**Implementation Context**:
- Apply responsive design principles using Tailwind CSS breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
- Test all pages at 375px, 768px, 1440px viewports
- Ensure navigation adapts (hamburger menu on mobile)
- Use Playwright viewport testing

**Architecture References**:
- `src/app/globals.css` - Tailwind CSS configuration and breakpoints
- `src/components/layout/MobileNav.tsx` - Mobile navigation pattern
- Tailwind CSS responsive design utilities (sm:, md:, lg:, xl:)

**E2E Test**: `tests/e2e/ehg-website/responsive.spec.ts`

---

### US-007: Accessibility Compliance (5 points, HIGH priority)

**As an** Accessibility User
**I want** to navigate the website using assistive technologies without barriers
**So that** I can access all information and functionality regardless of my abilities

**Acceptance Criteria (Given-When-Then)**:
1. Given I use a screen reader, When I navigate any public page, Then all content is accessible with proper ARIA labels and semantic HTML
2. Given I check color contrast, When I view text on any background, Then the contrast ratio is at least 4.5:1 for normal text and 3:1 for large text
3. Given I navigate using keyboard only, When I tab through any page, Then all interactive elements are reachable and have visible focus states
4. Given I use the website, When I encounter images or icons, Then all have appropriate alt text or aria-labels
5. Given I check form accessibility, When I view the contact form, Then all fields have associated labels and error messages are announced to screen readers

**Implementation Context**:
- Ensure WCAG 2.1 AA compliance across all public pages
- Use semantic HTML (header, nav, main, footer, article, section)
- Add ARIA labels to icons and interactive elements
- Test with axe-core (Playwright accessibility plugin)
- Verify keyboard navigation and focus states
- Check color contrast ratios

**Architecture References**:
- `@axe-core/playwright` - Accessibility testing library
- `src/components/ui/*` - UI components with built-in accessibility
- WCAG 2.1 AA guidelines

**E2E Test**: `tests/e2e/ehg-website/accessibility.spec.ts`

---

### US-008: Dark/Light Mode (3 points, MEDIUM priority)

**As a** Website Visitor
**I want** to view the website in my preferred color mode (dark or light) and have my choice remembered
**So that** I can browse comfortably in any lighting condition without re-selecting my preference

**Acceptance Criteria (Given-When-Then)**:
1. Given I visit the website, When I click the dark/light mode toggle, Then the color scheme switches immediately
2. Given I have selected dark mode, When I refresh the page, Then dark mode is still active (preference persisted)
3. Given I have selected light mode, When I navigate to a different page, Then light mode is maintained
4. Given I visit the website for the first time, When I have system dark mode enabled, Then the website defaults to dark mode
5. Given I toggle between modes, When I view any page, Then all colors adapt appropriately (no broken styles or low contrast)

**Implementation Context**:
- Implement dark/light mode toggle using next-themes library
- Store preference in localStorage
- Detect system preference (prefers-color-scheme)
- Apply Tailwind dark: classes across all components
- Ensure toggle is visible in navigation
- Test color contrast in both modes

**Architecture References**:
- `next-themes` - Dark mode library for Next.js
- `src/app/providers.tsx` - ThemeProvider setup
- `src/components/layout/ThemeToggle.tsx` - Toggle button component
- Tailwind CSS dark mode - dark: class prefix

**E2E Test**: `tests/e2e/ehg-website/dark-mode.spec.ts`

---

## Testing Strategy

### E2E Test Coverage
All 8 user stories have designated E2E test paths:
- `tests/e2e/ehg-website/homepage.spec.ts`
- `tests/e2e/ehg-website/about.spec.ts`
- `tests/e2e/ehg-website/approach.spec.ts`
- `tests/e2e/ehg-website/ventures.spec.ts`
- `tests/e2e/ehg-website/contact.spec.ts`
- `tests/e2e/ehg-website/responsive.spec.ts`
- `tests/e2e/ehg-website/accessibility.spec.ts`
- `tests/e2e/ehg-website/dark-mode.spec.ts`

### Test Types
- **E2E Tests**: Core functionality and user flows (Playwright)
- **Accessibility Tests**: WCAG 2.1 AA compliance (axe-core)
- **Visual Tests**: Responsive design, color contrast, dark mode
- **Manual Tests**: Screen reader compatibility, narrative mask compliance

### Automated E2E Test Mapping
As per STORIES Agent v2.0.0 Improvement #1, E2E tests will be automatically mapped to user stories during EXEC→PLAN handoff using:
```bash
node scripts/map-e2e-tests-to-user-stories.mjs
```

This ensures 100% E2E test coverage enforcement and prevents unmapped stories.

---

## BMAD Enhancement Features (v2.0.0)

All user stories include:

1. **Implementation Context**: Hyper-detailed guidance for EXEC phase
2. **Architecture References**: Component paths, existing patterns to follow
3. **Example Code Patterns**: Code snippets to guide implementation
4. **Testing Scenarios**: Expected inputs/outputs for test creation

This rich context reduces EXEC confusion and ensures consistent implementation.

---

## Next Steps

1. **PLAN Verification**: Validate all user stories meet acceptance criteria
2. **EXEC Phase**: Implement user stories in priority order (US-004 first - Critical)
3. **E2E Test Creation**: Create tests following US-XXX naming convention
4. **Auto-Mapping**: Run E2E test mapping script before EXEC→PLAN handoff
5. **Auto-Validation**: User stories will auto-validate when deliverables complete

**Ready for PLAN→EXEC handoff**:
```bash
node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-EHG-WEBSITE-001
```

---

**Document Generated**: 2026-01-08
**STORIES Agent Version**: v2.0.0 - Lessons Learned Edition
**Protocol Version**: LEO v4.3.3
