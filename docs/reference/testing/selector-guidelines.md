---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Playwright E2E Test Selector Guidelines


## Table of Contents

- [Why Selector Strategy Matters](#why-selector-strategy-matters)
- [Quick Reference Table](#quick-reference-table)
- [The Selector Hierarchy](#the-selector-hierarchy)
  - [Tier 1: data-testid (ALWAYS PREFERRED)](#tier-1-data-testid-always-preferred)
  - [Tier 2: ARIA Roles with Accessible Names](#tier-2-aria-roles-with-accessible-names)
  - [Tier 3: Form Field Selectors](#tier-3-form-field-selectors)
  - [Tier 4: Text Content (LAST RESORT)](#tier-4-text-content-last-resort)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
  - [Anti-Pattern 1: Compound Fallback Selectors](#anti-pattern-1-compound-fallback-selectors)
  - [Anti-Pattern 2: Case-Insensitive Regex](#anti-pattern-2-case-insensitive-regex)
  - [Anti-Pattern 3: Generic Tag Selectors](#anti-pattern-3-generic-tag-selectors)
  - [Anti-Pattern 4: CSS Class Selectors](#anti-pattern-4-css-class-selectors)
  - [Anti-Pattern 5: URL Regex Without Anchors](#anti-pattern-5-url-regex-without-anchors)
- [data-testid Naming Conventions](#data-testid-naming-conventions)
- [When `.first()` is Acceptable](#when-first-is-acceptable)
- [Migration Guide for Existing Tests](#migration-guide-for-existing-tests)
  - [Step 1: Identify Anti-Patterns](#step-1-identify-anti-patterns)
  - [Step 2: Add data-testid to Components](#step-2-add-data-testid-to-components)
  - [Step 3: Update Test Selectors](#step-3-update-test-selectors)
  - [Step 4: Remove .first() Workarounds](#step-4-remove-first-workarounds)
- [Verification Checklist](#verification-checklist)
- [ESLint Rules](#eslint-rules)
- [Related Documentation](#related-documentation)

**Version**: 1.0.0
**Last Updated**: 2025-11-26
**Applies To**: All E2E tests in `tests/e2e/`

## Why Selector Strategy Matters

Poor selector choices are the #1 cause of flaky E2E tests in this codebase. Analysis of testing sub-agent retrospectives shows recurring failures from:

- **Strict mode violations**: Multiple elements matching regex patterns like `/ventures/i`
- **Ambiguous selectors**: Generic tag selectors matching unintended elements
- **Hidden element selection**: Selectors finding hidden notification divs instead of visible content

This guide establishes patterns that make tests:

- **Resilient**: Survive UI refactoring
- **Readable**: Self-documenting test code
- **Maintainable**: Easy to update when components change
- **Fast**: Avoid retry loops from ambiguous selectors

---

## Quick Reference Table

| Want to select... | Use this pattern | NOT this |
|-------------------|------------------|----------|
| A specific button | `[data-testid="submit-btn"]` | `button:has-text("Submit")` |
| Form input | `[name="email"]` or `[data-testid="email-input"]` | `input[type="email"]` |
| Status badge | `[data-testid="status-badge"]` | `.badge`, `text=Active` |
| Navigation link | `getByRole('link', { name: 'Dashboard' })` | `a[href="/dashboard"]` |
| Modal/Dialog | `[data-testid="confirm-dialog"]` | `[role="dialog"]` |
| Page heading | `[data-testid="page-heading"]` | `page.locator('h1')` |

---

## The Selector Hierarchy

### Tier 1: data-testid (ALWAYS PREFERRED)

**Priority**: Use for ALL interactive elements and key UI targets

```javascript
// Component
<button data-testid="create-venture-btn">Create Venture</button>

// Test
const createBtn = page.locator('[data-testid="create-venture-btn"]');
```

**Why data-testid wins**:
- Decoupled from styling (survives CSS changes)
- Decoupled from content (survives text changes)
- Explicit intent (screams "this is for testing!")
- Never ambiguous (unique by convention)

### Tier 2: ARIA Roles with Accessible Names

**Priority**: Use for standard UI components when data-testid unavailable

```javascript
// Good - specific accessible name
page.getByRole('button', { name: 'Create Venture' })
page.getByRole('heading', { name: 'Dashboard' })
page.getByRole('tab', { name: 'Settings' })

// Bad - regex can match multiple elements
page.getByRole('heading', { name: /ventures/i })  // AVOID
```

**Why ARIA roles work**:
- Accessibility-first testing
- Matches how screen readers see the page
- Less brittle than text selectors (when used with exact names)

### Tier 3: Form Field Selectors

**Priority**: Acceptable for form inputs with name attributes

```javascript
// Acceptable
page.fill('input[name="title"]', 'My Title')
page.selectOption('select[name="category"]', 'testing')
```

**Upgrade opportunity**: Add data-testid to critical form fields

### Tier 4: Text Content (LAST RESORT)

**Priority**: Only when text is unique and stable

```javascript
// Use sparingly - only for truly unique text
page.getByText('Welcome to the Dashboard')
```

**WARNING**: Text changes during i18n, A/B testing, or content updates

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Compound Fallback Selectors

```javascript
// BAD - Found in venture-creation-workflow.spec.js:61
const createButton = page.locator(
  'button:has-text("New Venture"), button:has-text("Create")'
).first();

// Problems:
// - Hides which selector actually matched
// - .first() masks ambiguity issues
// - Maintenance nightmare when UI changes

// GOOD
const createButton = page.locator('[data-testid="create-venture-btn"]');
```

### Anti-Pattern 2: Case-Insensitive Regex

```javascript
// BAD - Found in venture-creation-workflow.spec.js:69
page.locator('h1, h2').filter({ hasText: /create|new venture/i })

// Problems:
// - Fragile to text changes
// - Matches unintended elements
// - Hard to debug failures
// - Causes strict mode violations

// GOOD
page.locator('[data-testid="page-heading"]')
```

### Anti-Pattern 3: Generic Tag Selectors

```javascript
// BAD - Causes strict mode violations
page.locator('h1')
page.locator('button')
page.locator('nav, .navigation, .navbar')

// Problems:
// - Matches multiple elements
// - No semantic meaning
// - Breaks with any structural change

// GOOD
page.locator('[data-testid="main-heading"]')
page.locator('[data-testid="primary-nav"]')
```

### Anti-Pattern 4: CSS Class Selectors

```javascript
// BAD
page.locator('.btn-primary')
page.locator('.card-header')

// Problems:
// - Classes are for styling, not testing
// - Refactoring CSS breaks tests
// - No guarantee of uniqueness

// GOOD
page.locator('[data-testid="primary-action-btn"]')
```

### Anti-Pattern 5: URL Regex Without Anchors

```javascript
// BAD - matches /ventures, /ventures/, /ventures/new, etc.
await expect(page).toHaveURL(/\/ventures/)

// GOOD - explicit URL check
await expect(page).toHaveURL('/ventures')
await expect(page).toHaveURL(/^.*\/ventures$/)
```

---

## data-testid Naming Conventions

**Pattern**: `{component}-{element}-{modifier?}`

| Component | Element | Modifier | Result |
|-----------|---------|----------|--------|
| venture | card | - | `venture-card` |
| venture | create | btn | `venture-create-btn` |
| sd | status | badge | `sd-status-badge` |
| prd | form | submit | `prd-form-submit` |
| nav | link | dashboard | `nav-link-dashboard` |
| page | heading | - | `page-heading` |

**Rules**:
1. Use kebab-case (lowercase with hyphens)
2. Be descriptive but concise
3. Prefix with component context
4. Suffix interactive elements: `-btn`, `-input`, `-link`, `-select`
5. Suffix containers: `-section`, `-container`, `-list`, `-card`

---

## When `.first()` is Acceptable

Using `.first()` is acceptable ONLY when:

1. **Testing a list where any item is valid**:
   ```javascript
   // OK - we genuinely want any card
   const anyCard = page.locator('[data-testid="venture-card"]').first();
   ```

2. **The selector is already specific and duplicates are expected**:
   ```javascript
   // OK - multiple instances of same component in different sections
   const headerNav = page.locator('header [data-testid="nav-menu"]').first();
   ```

**NOT acceptable** when:
- You're using it to "fix" a selector that matches too many elements
- The test should target a specific element, not any matching element

---

## Migration Guide for Existing Tests

### Step 1: Identify Anti-Patterns

Search for these patterns in tests:
```bash
# Find case-insensitive regex
grep -r "/.*\/i" tests/e2e/

# Find compound selectors
grep -r ", " tests/e2e/*.spec.* | grep "locator"

# Find generic tag selectors
grep -rE "locator\(['\"]h[1-6]['\"]" tests/e2e/
grep -rE "locator\(['\"]button['\"]" tests/e2e/
```

### Step 2: Add data-testid to Components

```jsx
// Before (component)
<button onClick={handleCreate}>Create Venture</button>

// After (component)
<button data-testid="create-venture-btn" onClick={handleCreate}>
  Create Venture
</button>
```

### Step 3: Update Test Selectors

```javascript
// Before (test)
page.locator('button:has-text("Create Venture")').first()

// After (test)
page.locator('[data-testid="create-venture-btn"]')
```

### Step 4: Remove .first() Workarounds

If you need `.first()`, the selector is too ambiguous.
Add a data-testid to make selection deterministic.

---

## Verification Checklist

When writing or reviewing tests, ensure:

- [ ] No `has-text` for buttons (use data-testid)
- [ ] No case-insensitive regex in selectors (`/pattern/i`)
- [ ] No compound selectors with fallbacks
- [ ] No `.first()` or `.nth()` as ambiguity workarounds
- [ ] No generic tag selectors (`button`, `h1`, etc.)
- [ ] All interactive elements use data-testid
- [ ] Text assertions scoped to data-testid containers

---

## ESLint Rules

This codebase includes ESLint rules to catch selector anti-patterns:

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `playwright-selectors/no-case-insensitive-regex` | error | `filter({ hasText: /pattern/i })` |
| `playwright-selectors/no-ambiguous-locators` | warn | `page.locator('button')` |
| `playwright-selectors/require-locator-specificity` | warn | Compound selectors without `.first()` |

Run `npm run lint:e2e` to check for violations.

---

## Related Documentation

- [tests/e2e/README.md](./README.md) - E2E testing overview
- [docs/reference/qa-director-guide.md](../qa-director-guide.md) - QA Engineering Director guide
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Official Playwright guidance
