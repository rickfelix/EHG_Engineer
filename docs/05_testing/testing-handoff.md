# TESTING SUB-AGENT ACTIVATION HANDOFF

**From**: EXEC Agent  
**To**: Testing Sub-Agent  
**Date**: [ISO Date]  
**PRD Reference**: [PRD-ID]  
**Activation Trigger**: [Specific trigger phrase from PRD]

---

## 1. EXECUTIVE SUMMARY (≤200 tokens)

**Sub-Agent**: Testing Sub-Agent  
**Activation Reason**: [coverage >80% | e2e testing | visual inspection | automated testing]  
**Scope**: Automated visual inspection and comprehensive testing validation  
**Priority**: [Critical/High/Medium/Low]  
**Expected Deliverable**: Complete automated testing report with visual evidence

---

## 2. SCOPE & REQUIREMENTS

### Primary Objectives:
- [ ] Execute automated visual inspection using Playwright
- [ ] Validate responsive design across multiple viewports
- [ ] Capture component interaction states
- [ ] Generate comprehensive test coverage report
- [ ] Identify accessibility compliance issues

### Success Criteria:
- [ ] All critical UI components visually validated
- [ ] Responsive design tested on mobile, tablet, desktop
- [ ] Interactive elements tested (hover, focus, click states)
- [ ] Performance metrics captured and analyzed
- [ ] Accessibility audit completed with recommendations

### Out of Scope:
- Manual testing procedures
- Unit test creation (unless specifically requested)
- Backend API testing (unless UI integration required)

---

## 3. CONTEXT PACKAGE

**PRD Requirements**: [Copy relevant testing sections from PRD]

**Technical Stack**: 
- Frontend: [React/Vue/Angular/Vanilla]
- Testing Tools: Playwright, Jest
- Browser Targets: [Chrome, Firefox, Safari, Mobile browsers]

**Existing Constraints**:
- Context Budget: [Token limit]
- Time Constraint: [Deadline]
- Performance Targets: [Load time requirements]

**Integration Points**:
- Dashboard runs on: localhost:3456
- Components to test: [List specific components]
- Test results integrate into: EXEC final deliverable

---

## 4. DELIVERABLES MANIFEST

### Required Outputs:
- **Automated Test Report**: `test-results/automated/reports/automated-test-report.html`
- **Visual Screenshots**: `test-results/automated/screenshots/[component-name].png`
- **Performance Metrics**: JSON format with load times, resource usage
- **Accessibility Report**: WCAG 2.1 compliance analysis
- **Fix Recommendations**: `test-results/fix-requests/` (if failures detected)
- **EXEC Handoff Document**: `test-results/fix-requests/EXEC-handoff.md` (if fixes needed)

### Supporting Documentation:
- **Test Execution Log**: Console output with timing and success/failure
- **Error State Captures**: Screenshots of any failures or issues
- **Responsive Design Validation**: Mobile, tablet, desktop screenshots
- **Failure Analysis**: Root cause analysis for each failed test
- **Fix Confidence Scores**: Estimated success rate for each recommendation

---

## 5. SUCCESS CRITERIA & VALIDATION

### Acceptance Criteria:
- [ ] All identified components captured in screenshots
- [ ] Responsive design validated on 3+ viewport sizes
- [ ] Interactive states documented (hover, focus, active)
- [ ] Performance thresholds met or issues identified
- [ ] Accessibility score >90% or improvement plan provided

### Quality Gates:
- **Performance Threshold**: Page load <3s, DOM ready <2s
- **Visual Quality**: Screenshots clear, full components visible
- **Test Coverage**: 100% of critical UI components tested
- **Error Rate**: <5% test failures acceptable

---

## 6. RESOURCE ALLOCATION

**Context Budget**: [X tokens] - Stay within limit  
**Time Constraint**: Complete within [X hours]  
**External Dependencies**: 
- Dashboard server must be running on localhost:3456
- Playwright browsers must be installed
- Network access for performance testing

**Escalation Path**: 
- If dashboard server unavailable → Notify EXEC immediately
- If critical test failures → Provide detailed error analysis
- If performance issues detected → Flag as high priority

---

## 7. HANDOFF REQUIREMENTS

### Immediate Actions Required:
1. **Activate Testing Sub-Agent** (within 5 minutes)
2. **Verify dashboard accessibility** (within 10 minutes) 
3. **Begin automated test execution** (within 15 minutes)
4. **If failures detected**: Generate fix recommendations
5. **If fixes needed**: Create EXEC handoff with actionable suggestions

### Review Checkpoints:
- [ ] **Initial approach confirmation** (within 30 minutes)
- [ ] **Mid-point progress review** (at 50% completion)
- [ ] **Final deliverable handback** (by deadline)

### Expected Communication:
- Progress updates every 25% completion
- Immediate notification of blockers or critical issues
- Final handback using standard Sub-Agent → EXEC template

---

**HANDOFF STATUS**: ✅ Activated - Testing Sub-Agent may proceed  
**AUTOMATION LEVEL**: Full automation required - no manual intervention  
**EXPECTED COMPLETION**: [Deadline with specific time]

---

*Template Version: LEO v4.1.3 - Enhanced with Fix Recommendations*  
*Auto-generated handoff for Testing Sub-Agent activation with failure analysis*