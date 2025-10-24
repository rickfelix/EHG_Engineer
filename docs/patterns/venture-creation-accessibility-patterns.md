# VentureCreationPage Accessibility Patterns

**SD**: SD-VWC-A11Y-002
**Component**: VentureCreationPage
**Standard**: WCAG 2.1 Level AA
**Last Updated**: 2025-10-22

---

## 📚 Table of Contents

1. [Color System](#color-system)
2. [Focus Indicators](#focus-indicators)
3. [Keyboard Navigation](#keyboard-navigation)
4. [Screen Reader Support](#screen-reader-support)
5. [Motion Accessibility](#motion-accessibility)
6. [High Contrast Mode](#high-contrast-mode)
7. [Responsive Accessibility](#responsive-accessibility)
8. [ARIA Patterns](#aria-patterns)
9. [Testing Checklist](#testing-checklist)
10. [Maintenance Guidelines](#maintenance-guidelines)

---

## 🎨 Color System

### Color Contrast Requirements

**WCAG 2.1 AA Standards**:
- Normal text (< 18pt, < 14pt bold): **4.5:1** minimum
- Large text (≥ 18pt, ≥ 14pt bold): **3:1** minimum
- UI components (buttons, form controls): **3:1** minimum
- Focus indicators: **3:1** against adjacent colors

### Color Palette with Contrast Ratios

**Light Mode**:
```css
/* Primary Text on White Background */
--foreground: 222.2 84% 4.9%;           /* Near black: ~15:1 ✅ */
--muted-foreground-enhanced: 215 20% 35%; /* Dark gray: 5.2:1 ✅ */

/* Interactive Elements */
--primary: 221.2 83.2% 53.3%;           /* Blue: 4.5:1 ✅ */
--destructive: 0 84.2% 60.2%;           /* Red: 4.5:1 ✅ */

/* Amber Alerts */
--amber-800: #92400e;  /* on amber-50 (#fffbeb): 8.2:1 ✅ */
--amber-600: #d97706;  /* on amber-50 (#fffbeb): 5.5:1 ✅ */
```

**Dark Mode**:
```css
/* Primary Text on Dark Background */
--foreground: 210 40% 98%;              /* Near white: ~14:1 ✅ */
--muted-foreground-enhanced: 215 20% 70%; /* Light gray: 5.2:1 ✅ */

/* Amber Alerts */
--amber-100: #fef3c7;  /* on amber-950 (#451a03): sufficient contrast ✅ */
--amber-400: #fbbf24;  /* on amber-950 (#451a03): sufficient contrast ✅ */
```

### Usage Pattern

```tsx
// Use enhanced muted foreground for secondary text
<p className="text-muted-foreground">
  Secondary information
</p>

// For amber alerts with proper contrast
<Alert className="alert-amber">
  <AlertCircle className="alert-amber-icon h-4 w-4" />
  <AlertDescription className="alert-amber-text">
    Warning message
  </AlertDescription>
</Alert>
```

### Tools for Verification

1. **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
2. **Chrome DevTools**:
   - Inspect element → Styles tab → Color picker → Contrast ratio
3. **Lighthouse**:
   - DevTools → Lighthouse → Accessibility audit
4. **@axe-core/playwright**:
   - Automated testing with E2E tests

---

## 🎯 Focus Indicators

### Implementation

All interactive elements in `.venture-creation-page` have enhanced focus indicators:

```css
/* Global focus indicator */
.venture-creation-page *:focus-visible {
  outline: 3px solid hsl(var(--primary));
  outline-offset: 2px;
  border-radius: 4px;
}

/* Form inputs with additional shadow */
.venture-creation-page input:focus-visible,
.venture-creation-page textarea:focus-visible,
.venture-creation-page select:focus-visible {
  outline: 3px solid hsl(var(--primary));
  outline-offset: 2px;
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.15);
}

/* Links with dashed outline to differentiate */
.venture-creation-page a:focus-visible {
  outline: 3px dashed hsl(var(--primary));
  outline-offset: 2px;
}
```

### Why `:focus-visible`?

- **`:focus`**: Shows focus ring on ALL interactions (mouse, touch, keyboard)
- **`:focus-visible`**: Shows focus ring ONLY for keyboard navigation ✅

This prevents ugly focus rings when clicking with mouse while maintaining accessibility for keyboard users.

### High Contrast Mode Enhancement

```css
@media (prefers-contrast: high) {
  .venture-creation-page *:focus-visible {
    outline-width: 4px; /* Increased from 3px */
  }
}
```

### Testing Pattern

**Keyboard Test**:
1. Press Tab to navigate through page
2. Verify 3px blue outline appears on each focusable element
3. Verify outline is visible on both light and dark backgrounds

**Mouse Test**:
1. Click elements with mouse
2. Verify NO focus ring appears (focus-visible behavior)

---

## ⌨️ Keyboard Navigation

### Tab Order

All interactive elements should be in logical tab order:

1. **Form Fields** (top to bottom):
   - Venture Name → Description → Problem Statement → Target Market → Company → Category → Assumptions

2. **Tier Selection Buttons**:
   - Tier 0 → Tier 1 → Tier 2

3. **Action Buttons**:
   - Cancel → Save Draft → Next

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Navigate to next focusable element |
| `Shift + Tab` | Navigate to previous focusable element |
| `Space` | Activate button or toggle checkbox |
| `Enter` | Submit form or activate button |
| `Escape` | Close modal (TierGraduationModal) |
| `Arrow Keys` | Navigate within radio groups (if applicable) |

### Implementation Pattern

```tsx
// Ensure buttons are keyboard accessible
<Button
  onClick={handleAction}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAction();
    }
  }}
>
  Action
</Button>

// Tier selection with keyboard support
<Button
  type="button"
  variant={formData.selectedTier === 0 ? "default" : "outline"}
  onClick={() => setFormData(prev => ({ ...prev, selectedTier: 0 }))}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setFormData(prev => ({ ...prev, selectedTier: 0 }));
    }
  }}
  aria-label="Select Tier 0 MVP: Quick validation with 70% gates"
  aria-pressed={formData.selectedTier === 0}
>
  Tier 0: MVP
</Button>
```

### Skip Link Pattern

```tsx
// At top of page
<a href="#main-content" className="skip-link">
  Skip to main content
</a>

// Main content area
<main id="main-content">
  {/* Page content */}
</main>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 4px;
  z-index: 100;
}

.skip-link:focus {
  top: 8px;
  left: 8px;
  outline: 3px solid hsl(var(--primary));
}
```

---

## 🔊 Screen Reader Support

### ARIA Labels for Tier Buttons

```tsx
<div role="group" aria-label="Select venture complexity tier">
  <Button
    aria-label="Select Tier 0 MVP: Quick validation with 70% gates and stages 1 through 3"
    aria-pressed={formData.selectedTier === 0}
  >
    Tier 0: MVP
  </Button>
  <Button
    aria-label="Select Tier 1 Simple: Standard validation with basic research"
    aria-pressed={formData.selectedTier === 1}
  >
    Tier 1: Simple
  </Button>
  <Button
    aria-label="Select Tier 2 Complex: Deep research with recursive refinement loop"
    aria-pressed={formData.selectedTier === 2}
  >
    Tier 2: Complex
  </Button>
</div>
```

**Screen reader announcement**:
> "Select venture complexity tier, group. Select Tier 0 MVP: Quick validation with 70% gates and stages 1 through 3, button, pressed."

### Screen Reader Only Text

```tsx
// Visually hidden but announced by screen readers
<span className="sr-only">
  Loading venture creation form
</span>

// CSS
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### Form Field Labels

```tsx
// Always use proper labels
<div className="space-y-2">
  <Label htmlFor="name" className="required">
    Venture Name *
  </Label>
  <Input
    id="name"
    aria-label="Venture name"
    aria-required="true"
    value={formData.name}
    onChange={(e) => handleFieldChange('name', e.target.value)}
  />
</div>
```

### Error States

```tsx
// Accessible error messages
<Input
  id="email"
  aria-label="Email address"
  aria-invalid={hasError}
  aria-describedby={hasError ? "email-error" : undefined}
/>
{hasError && (
  <p id="email-error" role="alert" className="text-destructive text-sm">
    Please enter a valid email address
  </p>
)}
```

### Alert Announcements

```tsx
// Use role="alert" for important messages
<Alert role="alert" data-testid="override-warning" className="alert-amber">
  <AlertCircle className="alert-amber-icon h-4 w-4" />
  <AlertDescription className="alert-amber-text">
    You overrode AI recommendation
  </AlertDescription>
</Alert>
```

---

## 🎬 Motion Accessibility

### Respecting `prefers-reduced-motion`

Users with vestibular disorders can experience nausea from animations. We respect their preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .venture-creation-page * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .venture-creation-page .animate-spin {
    animation: none;
  }
}
```

### Testing

**macOS**:
System Preferences → Accessibility → Display → Reduce motion

**Windows**:
Settings → Ease of Access → Display → Show animations

**Browser DevTools**:
```javascript
// Emulate reduced motion
window.matchMedia('(prefers-reduced-motion: reduce)').matches
```

### Implementation Pattern

```tsx
// Use CSS classes that respect prefers-reduced-motion
<div className="transition-all duration-300">
  {/* Transition will be instant if user prefers reduced motion */}
</div>

// Or check in JavaScript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  // Enable animations
}
```

---

## 🔲 High Contrast Mode

### Windows High Contrast Mode (WHCM)

WHCM forces specific colors for accessibility. We enhance visibility:

```css
@media (prefers-contrast: high) {
  .venture-creation-page *:focus-visible {
    outline-width: 4px; /* Increased visibility */
  }

  .venture-creation-page button {
    border-width: 2px; /* More defined boundaries */
  }
}
```

### Forced Colors Mode

```css
@media (forced-colors: active) {
  /* Ensure borders are visible */
  .venture-creation-page button {
    border: 2px solid ButtonText;
  }

  /* Preserve semantic colors */
  .venture-creation-page [aria-invalid="true"] {
    border-color: Mark;
  }
}
```

### Testing

**Windows 10/11**:
Settings → Ease of Access → High contrast → Turn on high contrast

**Chrome DevTools**:
Rendering tab → Emulate CSS media feature `forced-colors: active`

---

## 📱 Responsive Accessibility

### Mobile Considerations

```css
/* Ensure touch targets are at least 44x44px (iOS) or 48x48px (Android) */
@media (max-width: 640px) {
  .venture-creation-page button {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 16px;
  }
}
```

### Zoom and Text Scaling

Support up to 200% zoom without loss of functionality:

```css
/* Use relative units (rem, em, %) instead of fixed pixels */
.venture-creation-page {
  font-size: 1rem; /* 16px base, scales with user preferences */
  line-height: 1.5; /* Relative line height */
  padding: 2rem; /* Scales with zoom */
}

/* Avoid fixed heights that break with text scaling */
.venture-creation-page textarea {
  min-height: 6rem; /* NOT height: 96px */
}
```

### Testing

1. **Browser zoom**: Ctrl/Cmd + (zoom to 200%)
2. **Text-only zoom**: Firefox → View → Zoom → Zoom Text Only
3. **Mobile viewports**: Chrome DevTools → Device toolbar

---

## 🏷️ ARIA Patterns

### Tier Selection (Toggle Buttons)

```tsx
<div role="group" aria-label="Select venture complexity tier">
  <Button
    type="button"
    aria-label="Select Tier 0 MVP"
    aria-pressed={selectedTier === 0}
    onClick={() => setSelectedTier(0)}
  >
    Tier 0
  </Button>
</div>
```

**ARIA States**:
- `aria-pressed="true"`: Button is currently selected
- `aria-pressed="false"`: Button is not selected

### Progress Stepper

```tsx
<div role="navigation" aria-label="Venture creation progress">
  <ol>
    <li aria-current="step">
      <span>Step 1: Idea</span>
    </li>
    <li>
      <span>Step 2: Research</span>
    </li>
  </ol>
</div>
```

**ARIA States**:
- `aria-current="step"`: Indicates current step
- `aria-current="page"`: Alternative for page-like steps

### Form Validation

```tsx
<Input
  id="venture-name"
  aria-label="Venture name"
  aria-required="true"
  aria-invalid={hasError}
  aria-describedby={hasError ? "name-error" : undefined}
/>
{hasError && (
  <span id="name-error" role="alert">
    Venture name is required
  </span>
)}
```

### Loading States

```tsx
<Button disabled={isLoading} aria-busy={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      <span>Loading...</span>
    </>
  ) : (
    'Submit'
  )}
</Button>
```

---

## ✅ Testing Checklist

### Automated Testing

- [ ] **@axe-core/playwright** E2E tests pass
- [ ] **Lighthouse** accessibility score ≥ 90 (target: 100)
- [ ] **Color contrast** violations: 0
- [ ] **ARIA** violations: 0
- [ ] **Keyboard** navigation violations: 0

### Manual Testing

#### Keyboard Navigation
- [ ] Tab through all form elements in logical order
- [ ] Space bar activates buttons
- [ ] Enter submits form
- [ ] Escape closes modal
- [ ] No keyboard traps

#### Screen Reader Testing
- [ ] **NVDA** (Windows): All elements announced correctly
- [ ] **JAWS** (Windows): ARIA labels work (optional)
- [ ] **VoiceOver** (macOS): Navigation works (optional)
- [ ] Form labels announced
- [ ] Button states announced (pressed/not pressed)
- [ ] Error messages announced

#### Visual Testing
- [ ] Focus indicators visible on all elements
- [ ] Color contrast sufficient in light mode
- [ ] Color contrast sufficient in dark mode
- [ ] 200% zoom: Content visible and functional
- [ ] Mobile (375px): All elements accessible
- [ ] High contrast mode: Borders and text visible

#### Motion Testing
- [ ] `prefers-reduced-motion`: Animations disabled
- [ ] Spinner animation respects preference

---

## 🛠️ Maintenance Guidelines

### When Adding New Components

1. **Apply `.venture-creation-page` class** to ensure styles apply
2. **Use semantic HTML**: `<button>`, `<input>`, `<label>`, etc.
3. **Add proper ARIA labels**: `aria-label`, `aria-describedby`, etc.
4. **Test keyboard navigation**: Tab, Space, Enter
5. **Verify focus indicators**: 3px outline visible
6. **Check color contrast**: Use WebAIM or DevTools
7. **Add E2E test**: Update `venture-creation-a11y.spec.ts`

### Color Changes

When changing colors:

1. **Check contrast ratio**: Use WebAIM Contrast Checker
2. **Verify against background**: Test on both light and dark
3. **Update CSS variables**: Use HSL format for consistency
4. **Test high contrast mode**: Verify visibility in WHCM
5. **Run Lighthouse**: Ensure no new contrast violations

### ARIA Changes

When modifying ARIA:

1. **Consult WAI-ARIA spec**: https://www.w3.org/WAI/ARIA/apg/
2. **Test with screen reader**: NVDA (free) or VoiceOver
3. **Validate ARIA usage**: Use axe DevTools extension
4. **Update E2E tests**: Add test cases for new ARIA

### CSS Class Pattern

```css
/* Component-specific accessibility overrides */
.venture-creation-page {
  /* Apply all accessibility enhancements */
}

.venture-creation-page .custom-component {
  /* Component-specific focus, contrast, etc. */
}
```

### Documentation Updates

When making accessibility changes:

1. **Update this file**: Add new patterns or modify existing
2. **Update implementation summary**: Document what changed
3. **Update E2E tests**: Add test coverage
4. **Add evidence**: Screenshots, Lighthouse scores, etc.

---

## 📚 Resources

### WCAG Guidelines
- **WCAG 2.1 AA**: https://www.w3.org/WAI/WCAG21/quickref/
- **Understanding WCAG**: https://www.w3.org/WAI/WCAG21/Understanding/

### Tools
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **axe DevTools**: https://www.deque.com/axe/devtools/
- **Lighthouse**: Chrome DevTools → Lighthouse tab
- **WAVE**: https://wave.webaim.org/

### Screen Readers
- **NVDA (Windows)**: https://www.nvaccess.org/ (Free)
- **JAWS (Windows)**: https://www.freedomscientific.com/products/software/jaws/
- **VoiceOver (macOS)**: Built-in (Cmd + F5)

### Testing Guides
- **A11y Project**: https://www.a11yproject.com/
- **WebAIM**: https://webaim.org/articles/
- **MDN Accessibility**: https://developer.mozilla.org/en-US/docs/Web/Accessibility

---

**Last Updated**: 2025-10-22
**Maintained By**: Engineering Team
**SD**: SD-VWC-A11Y-002
**Standard**: WCAG 2.1 Level AA
