---
description: Force DESIGN sub-agent analysis for UI/UX issues
argument-hint: [describe the UI/design issue]
---

# 🎨 LEO DESIGN Sub-Agent Analysis

**Design Task:** $ARGUMENTS

## DESIGN Sub-Agent Focus Areas:

### 1. Visual Analysis
- Current design state
- Design inconsistencies
- Theme implementation (light/dark mode)
- Color scheme adherence

### 2. CSS & Styling
- Tailwind class usage
- CSS specificity issues
- Style overrides
- Responsive breakpoints

### 3. Component Structure
- Component hierarchy
- Props flow
- State management for UI
- Re-render optimization

### 4. UX Considerations
- User interaction patterns
- Accessibility (WCAG compliance)
- Mobile responsiveness
- Loading states & transitions

### 5. Specific Checks for Dark Mode
- `dark:` prefix implementation
- Document root class toggle
- LocalStorage theme persistence
- CSS variable usage

## Implementation Strategy:
1. Identify affected components
2. Review Tailwind configuration
3. Check theme switching logic
4. Verify CSS class application
5. Test across viewports

## Files to Review:
- `tailwind.config.js`
- Component style files
- Theme hook implementation
- CSS class applications

Provide specific CSS fixes and component modifications needed.