# Strategic Directive: SD-002
## Add Shimmer Effect to AI Avatar Button

**Status**: Active  
**Agent**: LEAD  
**Created**: 2025-08-30  
**Priority**: Medium  
**Category**: UI Enhancement  

---

## Executive Summary

Apply the existing shimmer animation effect currently used on Quick Action buttons to the AI Avatar circular button to maintain visual consistency across the application's interactive elements.

---

## Context & Background

### Current State Analysis

After analyzing the EHG codebase, the following has been identified:

1. **Shimmer Animation Exists**: The application already has a well-defined shimmer animation in `tailwind.config.ts`:
   - Keyframe: Translates from -100% to 100% with opacity fade
   - Duration: 6s ease-in-out infinite
   - CSS Class: `animate-shimmer`

2. **Quick Action Buttons Implementation**: Located in `src/components/navigation/ModernNavigationSidebar.tsx`
   - Uses inline Tailwind classes with `before:` pseudo-element
   - Different shimmer variations for different action types:
     - Voice Assistant: Blue shimmer (4s duration)
     - New Venture: Emerald shimmer (4.5s duration)
     - Quick Search: Purple shimmer (3.5s duration)
     - Notifications: Amber shimmer (4.2s duration)

3. **Loading Shimmer Pattern**: A separate loading shimmer exists in `src/index.css`:
   - Class: `.loading-shimmer`
   - Uses gradient overlay with `animate-shimmer`

---

## Requirements

### Functional Requirements

1. **FR-001**: Add shimmer effect to AI Avatar button matching the Quick Action button style
2. **FR-002**: Maintain the circular shape of the avatar button
3. **FR-003**: Ensure shimmer is subtle and non-intrusive
4. **FR-004**: Shimmer should be visible in both light and dark modes

### Technical Requirements

1. **TR-001**: Use existing `animate-shimmer` animation from Tailwind config
2. **TR-002**: Apply using Tailwind's `before:` pseudo-element pattern for consistency
3. **TR-003**: Match the implementation pattern from ModernNavigationSidebar
4. **TR-004**: No new CSS animations or keyframes needed

### Performance Requirements

1. **PR-001**: Animation must not cause layout shifts
2. **PR-002**: Use GPU-accelerated properties (transform, opacity)
3. **PR-003**: Animation should not impact page performance metrics

---

## Implementation Specification

### Step 1: Locate AI Avatar Component

Search for AI Avatar button component in:
- Voice-related components
- Navigation components
- Header/toolbar components

### Step 2: Apply Shimmer Pattern

Based on the Quick Action implementation pattern:

```tsx
className={cn(
  "relative overflow-hidden",
  "before:absolute before:inset-0",
  "before:bg-gradient-to-r before:from-blue-500/0 before:via-blue-500/5 before:to-blue-500/0",
  "before:animate-[shimmer_4s_ease-in-out_infinite]",
  // Existing avatar button classes
)}
```

### Step 3: Color Scheme

For AI Avatar, use a blue/cyan color scheme to indicate AI/intelligence:
- Primary: `blue-500` or `cyan-500`
- Opacity: 5-8% for subtlety
- Duration: 4s (matching voice assistant timing)

### Step 4: Dark Mode Support

Ensure proper dark mode variants:
```tsx
"dark:before:from-blue-400/0 dark:before:via-blue-400/10 dark:before:to-blue-400/0"
```

---

## Success Criteria

- [ ] AI Avatar button has shimmer effect visible
- [ ] Shimmer animation matches Quick Action button style
- [ ] Works in both light and dark modes
- [ ] No performance degradation (measured via Chrome DevTools)
- [ ] Animation is subtle and professional
- [ ] Maintains accessibility standards (no motion sickness triggers)

---

## Testing Requirements

1. **Visual Testing**
   - Verify shimmer is visible on AI Avatar button
   - Check consistency with Quick Action buttons
   - Test in light and dark modes

2. **Performance Testing**
   - Monitor FPS during animation
   - Check for layout shifts
   - Verify GPU acceleration is active

3. **Cross-browser Testing**
   - Chrome/Edge (Chromium)
   - Firefox
   - Safari

---

## Implementation Notes

- The shimmer effect is already well-established in the codebase
- Follow the existing pattern from ModernNavigationSidebar.tsx
- No new animations or keyframes needed - reuse existing ones
- Consider using the same timing (4s) as the voice assistant button for consistency

---

## References

- Shimmer animation: `tailwind.config.ts` lines 139-143
- Quick Action implementation: `ModernNavigationSidebar.tsx` lines 490-510
- Loading shimmer pattern: `src/index.css` lines 172-179

---

## Approval & Sign-off

**Created by**: LEO Protocol LEAD Agent  
**Date**: 2025-08-30  
**Version**: 1.0  

### Next Steps
1. Hand off to PLAN agent for technical planning
2. EXEC agent to implement the changes
3. Validate against success criteria
4. Push to GitHub for review

---

*This Strategic Directive was created after thorough analysis of the EHG codebase to ensure accurate and implementable requirements.*