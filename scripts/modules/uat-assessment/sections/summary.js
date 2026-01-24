/**
 * UAT Assessment Template - Summary Section
 * Priority actions and QA team notes
 *
 * @module uat-assessment/sections/summary
 */

export const summarySection = `
## PRIORITY ACTIONS SUMMARY

### CRITICAL (Block UAT Pass)
1. Replace hard-coded portfolio stage counts with dynamic queries
2. Replace hard-coded team utilization with dynamic data OR remove section
3. Fix Priority Alerts fixed height layout issue (min-h/max-h solution)
4. Add missing ARIA labels to all icon-only buttons
5. Verify authentication enforcement (unauthenticated access redirects)
6. Verify company data isolation (RLS policies working)

### HIGH (Strongly Recommended)
1. Implement ARIA live regions for real-time updates
2. Verify all 6 tab components have backend integration
3. Test Export/Configure button functionality (implement or remove)
4. Conduct full keyboard navigation testing
5. Verify color contrast ratios (WCAG AA compliance)
6. Test responsive design at all breakpoints

### MEDIUM (Nice to Have)
1. Decide on Strategic Decision Support: implement, remove, or keep placeholder
2. Increase alert title font size from text-sm to text-base
3. Add tooltips to icon-only tab labels on mobile
4. Optimize alert polling frequency (consider WebSocket)
5. Add database indexes for frequently queried alert data
6. Implement audit logging for executive decisions

### LOW (Future Enhancement)
1. Add dashboard customization features (Configure button)
2. Implement PDF/Excel export functionality
3. Add keyboard shortcuts for tab navigation
4. Enhance empty states with "Get Started" guidance
5. Add data export functionality for individual sections

---

## NOTES FOR QA TEAM

### Testing Environment Setup
- **Database**: Requires populated ventures, chairman_feedback, compliance_violations tables
- **Test Users**: Need accounts with varying permissions (executive, non-executive)
- **Test Companies**: Need multiple companies with varying venture counts
- **Test Data**: Create test alerts in different urgency levels

### Known Issues to Document
1. Priority Alerts fixed height may cause layout problems (reported in MANUAL-DASHBOARD-MG5GGDV0)
2. Portfolio stage counts are hard-coded (do not reflect real data)
3. Team utilization percentages are hard-coded (do not reflect real data)
4. Strategic Decision Support is a placeholder (not implemented)
5. Export/Configure buttons may be non-functional placeholders

### Testing Tools Recommended
- **Accessibility**: WAVE, axe DevTools, Lighthouse
- **Screen Readers**: NVDA (Windows), VoiceOver (Mac), JAWS
- **Performance**: Chrome DevTools Performance tab, React DevTools Profiler
- **Responsive**: Browser DevTools device emulation + real devices
- **Network**: Chrome DevTools Network tab, throttling options

### Success Criteria
- All critical issues resolved
- No broken functionality (buttons do something or are properly disabled)
- Data accuracy verified (no hard-coded values displayed as real data)
- Accessibility baseline met (WCAG 2.1 AA compliance)
- Responsive design works on mobile, tablet, desktop
- Performance targets met (< 3 second load time)
- Security requirements met (authentication, authorization, data isolation)

---

**Assessment Completed**: 2025-10-01
**Next Steps**: Execute manual UAT testing using checklists above
**Follow-Up**: Document findings, create bug tickets for failures, verify fixes
**Related Test**: MANUAL-DASHBOARD-MG5GGDV0 (focuses on specific Priority Alerts issue)`;
