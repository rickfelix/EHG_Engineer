---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 29: Professional Standard Operating Procedure (SOP)


## Table of Contents

- [Purpose](#purpose)
- [Prerequisites (Entry Gate Validation)](#prerequisites-entry-gate-validation)
  - [Gate 1: Features Complete](#gate-1-features-complete)
  - [Gate 2: Testing Done](#gate-2-testing-done)
- [Stage 29 Execution Procedure](#stage-29-execution-procedure)
  - [Phase 1: Pre-Flight Checklist](#phase-1-pre-flight-checklist)
  - [Phase 2: Substage 29.1 — UI Refinement](#phase-2-substage-291-ui-refinement)
  - [Phase 3: Substage 29.2 — UX Optimization](#phase-3-substage-292-ux-optimization)
  - [Phase 4: Substage 29.3 — Asset Preparation](#phase-4-substage-293-asset-preparation)
- [Exit Gate Validation](#exit-gate-validation)
  - [Gate 1: UI Polished](#gate-1-ui-polished)
  - [Gate 2: UX Optimized](#gate-2-ux-optimized)
  - [Gate 3: Assets Ready](#gate-3-assets-ready)
- [Rollback Procedures](#rollback-procedures)
  - [Rollback Triggers](#rollback-triggers)
  - [Rollback Procedure](#rollback-procedure)
- [Quality Metrics](#quality-metrics)
  - [Key Performance Indicators (KPIs)](#key-performance-indicators-kpis)
- [Tools & Resources](#tools-resources)
  - [Required Tools](#required-tools)
  - [Documentation](#documentation)
- [Common Issues & Solutions](#common-issues-solutions)
  - [Issue 1: Design Token Compliance Fails](#issue-1-design-token-compliance-fails)
  - [Issue 2: Animation Janky on Mobile](#issue-2-animation-janky-on-mobile)
  - [Issue 3: Bundle Size Exceeds Threshold](#issue-3-bundle-size-exceeds-threshold)
- [Approval & Sign-off](#approval-sign-off)
  - [Required Approvals](#required-approvals)
- [Revision History](#revision-history)
- [Sources Table](#sources-table)

**Version**: 1.0
**Effective Date**: 2025-11-06
**Review Cycle**: Quarterly
**Owner**: PLAN Phase Lead

---

## Purpose

This SOP defines the step-by-step execution procedure for Stage 29 (Final Polish), ensuring consistent UI/UX refinement and production readiness preparation across all ventures.

**Scope**: All ventures entering Stage 29 from Stage 28 (Performance Optimization)
**Audience**: PLAN phase engineers, QA teams, UX designers

---

## Prerequisites (Entry Gate Validation)

**MUST VERIFY** before proceeding:

### Gate 1: Features Complete

**Validation Steps**:
1. Verify all PRs merged to main branch
2. Confirm no open feature branches
3. Check product backlog for remaining P0/P1 items
4. Obtain product owner sign-off

**Command**:
```bash
# Check for open feature PRs
gh pr list --state open --label "feature"

# Expected: No results (empty list)
```

**Evidence Required**: Product owner approval email/Slack thread

---

### Gate 2: Testing Done

**Validation Steps**:
1. Verify 100% unit test pass rate
2. Verify 100% integration test pass rate
3. Verify 100% E2E test pass rate
4. Confirm no flaky tests in last 10 runs

**Commands**:
```bash
# Run all test suites
npm run test:all

# Check test coverage
npm run test:coverage

# Expected: All suites pass, coverage ≥80%
```

**Evidence Required**: Test report with 100% pass rate, coverage report

---

## Stage 29 Execution Procedure

### Phase 1: Pre-Flight Checklist

**Duration**: 30 minutes
**Owner**: PLAN Phase Lead

| Step | Action | Verification | Rollback |
|------|--------|--------------|----------|
| 1.1 | Clone production-ready branch | Branch exists, up-to-date | N/A |
| 1.2 | Review Stage 28 outputs | Performance report available | Contact Stage 28 owner |
| 1.3 | Load UI/UX feedback | Feedback doc accessible | Request from QA team |
| 1.4 | Load user testing results | Test results formatted | Request from UX team |
| 1.5 | Create Stage 29 tracking branch | `stage-29/polish-{venture-id}` | Delete branch |

**Completion Criteria**: All 5 steps verified

---

### Phase 2: Substage 29.1 — UI Refinement

**Duration**: 2-3 days
**Owner**: UI Engineer

#### Step 2.1: Visual Polish Applied

**Procedure**:
1. Run design consistency audit
   ```bash
   npm run audit:design-tokens
   ```
2. Verify all components use design system tokens
3. Fix inconsistencies (colors, spacing, typography)
4. Update Storybook documentation
5. Request design team review

**Acceptance Criteria**:
- ✅ 100% design token compliance
- ✅ Zero visual regressions in Percy/Chromatic
- ✅ Design team approval

**Evidence**: Design token audit report, Percy baseline comparison

---

#### Step 2.2: Animations Smooth

**Procedure**:
1. Profile animations with Chrome DevTools Performance tab
2. Verify all animations ≥60fps
3. Optimize heavy animations (use `will-change`, GPU acceleration)
4. Test on low-end devices (CPU throttling 4x)
5. Record performance metrics

**Acceptance Criteria**:
- ✅ All animations ≥60fps (desktop)
- ✅ All animations ≥30fps (low-end mobile)
- ✅ No layout thrashing detected

**Tools**:
```bash
# Run Lighthouse performance audit
npm run lighthouse:performance

# Expected: Performance score ≥90
```

**Evidence**: Lighthouse report, DevTools flame graph

---

#### Step 2.3: Responsive Design Verified

**Procedure**:
1. Test breakpoints: 320px, 768px, 1024px, 1440px, 1920px
2. Verify touch targets ≥44px on mobile
3. Test landscape/portrait orientations
4. Verify no horizontal scrollbars
5. Test print stylesheets

**Acceptance Criteria**:
- ✅ All breakpoints render correctly
- ✅ Touch targets meet accessibility standards
- ✅ Print layout functional

**Tools**:
```bash
# Run responsive design tests
npm run test:responsive

# Manual testing: BrowserStack device matrix
```

**Evidence**: BrowserStack test report, screenshot matrix

---

**Substage 29.1 Exit Gate**: All 3 steps (2.1, 2.2, 2.3) complete ✅

---

### Phase 3: Substage 29.2 — UX Optimization

**Duration**: 2-3 days
**Owner**: UX Engineer

#### Step 3.1: Flows Optimized

**Procedure**:
1. Map critical user flows (checkout, onboarding, etc.)
2. Measure flow completion rates (baseline)
3. Identify friction points (analytics, heatmaps)
4. Implement optimizations (reduce steps, autofill, etc.)
5. Measure flow completion rates (post-optimization)

**Acceptance Criteria**:
- ✅ ≥5% improvement in flow completion rates
- ✅ User journey maps updated
- ✅ Product team approval

**Tools**:
- Google Analytics (flow funnel reports)
- Hotjar (heatmaps, session recordings)

**Evidence**: Before/after completion rate comparison

---

#### Step 3.2: Friction Removed

**Procedure**:
1. Conduct friction audit (unnecessary clicks, confusing labels, etc.)
2. Prioritize friction points by impact
3. Remove top 5 friction points
4. A/B test changes (if time permits)
5. Document changes in changelog

**Acceptance Criteria**:
- ✅ ≥5 friction points removed
- ✅ User testing validates improvements
- ✅ No new friction introduced

**Evidence**: Friction audit report, user testing feedback

---

#### Step 3.3: Accessibility Verified

**Procedure**:
1. Run automated accessibility tests
   ```bash
   npm run test:a11y
   ```
2. Verify WCAG 2.1 AA compliance
3. Test with screen readers (NVDA, JAWS, VoiceOver)
4. Test keyboard navigation (no mouse)
5. Obtain accessibility sign-off

**Acceptance Criteria**:
- ✅ Zero critical accessibility issues (Axe audit)
- ✅ Screen reader compatibility verified
- ✅ Keyboard navigation functional

**Tools**:
```bash
# Run Axe accessibility audit
npm run axe:audit

# Run Lighthouse accessibility audit
npm run lighthouse:a11y

# Expected: Accessibility score ≥95
```

**Evidence**: Axe report, Lighthouse report, screen reader test notes

---

**Substage 29.2 Exit Gate**: All 3 steps (3.1, 3.2, 3.3) complete ✅

---

### Phase 4: Substage 29.3 — Asset Preparation

**Duration**: 1-2 days
**Owner**: DevOps Engineer

#### Step 4.1: Assets Optimized

**Procedure**:
1. Audit image assets
   ```bash
   npm run audit:images
   ```
2. Compress images (WebP, AVIF formats)
3. Generate responsive image variants (srcset)
4. Lazy-load below-the-fold images
5. Measure asset size reduction

**Acceptance Criteria**:
- ✅ ≥30% reduction in total image size
- ✅ All images have alt text
- ✅ Modern formats (WebP/AVIF) used

**Tools**:
```bash
# Optimize images with sharp
npm run optimize:images

# Verify compression
npm run analyze:bundle
```

**Evidence**: Bundle size comparison report

---

#### Step 4.2: CDN Configured

**Procedure**:
1. Configure CDN (Cloudflare, CloudFront, etc.)
2. Upload static assets to CDN
3. Update asset URLs in codebase
4. Verify cache headers (max-age, immutable)
5. Test CDN delivery (global edge locations)

**Acceptance Criteria**:
- ✅ CDN serving 100% of static assets
- ✅ Cache hit rate ≥90%
- ✅ Global latency <100ms (p95)

**Tools**:
```bash
# Test CDN configuration
curl -I https://cdn.example.com/assets/logo.png

# Expected: CF-Cache-Status: HIT
```

**Evidence**: CDN analytics report, latency measurements

---

#### Step 4.3: Bundles Minimized

**Procedure**:
1. Analyze bundle composition
   ```bash
   npm run analyze:bundle
   ```
2. Remove unused dependencies
3. Code-split large routes
4. Tree-shake dead code
5. Measure bundle size reduction

**Acceptance Criteria**:
- ✅ Main bundle <200KB (gzipped)
- ✅ Vendor bundle <300KB (gzipped)
- ✅ No duplicate dependencies

**Tools**:
```bash
# Analyze webpack bundle
npm run webpack:analyze

# Check for duplicates
npm run depcheck
```

**Evidence**: Bundle analyzer report, bundle size comparison

---

**Substage 29.3 Exit Gate**: All 3 steps (4.1, 4.2, 4.3) complete ✅

---

## Exit Gate Validation

**MUST VERIFY** before advancing to Stage 30:

### Gate 1: UI Polished

**Validation**:
- ✅ Substage 29.1 complete (all 3 steps)
- ✅ Design team sign-off obtained
- ✅ Visual regression tests pass

**Evidence**: Design approval email, Percy baseline

---

### Gate 2: UX Optimized

**Validation**:
- ✅ Substage 29.2 complete (all 3 steps)
- ✅ UX team sign-off obtained
- ✅ Flow completion rates improved ≥5%

**Evidence**: UX approval email, analytics report

---

### Gate 3: Assets Ready

**Validation**:
- ✅ Substage 29.3 complete (all 3 steps)
- ✅ CDN operational (cache hit rate ≥90%)
- ✅ Bundle sizes meet thresholds

**Evidence**: CDN analytics, bundle size report

---

**Stage 29 Exit Approval**: All 3 gates pass → Advance to Stage 30 ✅

---

## Rollback Procedures

### Rollback Triggers

| Trigger | Severity | Action |
|---------|----------|--------|
| UI consistency drops below 90% | **CRITICAL** | Rollback to Stage 28 baseline |
| UX score regression >10 points | **CRITICAL** | Rollback to Stage 28 baseline |
| Performance degradation >20% | **CRITICAL** | Rollback to Stage 28 baseline |
| Critical accessibility failures | **HIGH** | Fix in Stage 29, do not advance |
| CDN failure | **HIGH** | Revert to direct asset serving |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-29.md:47-50 (rollback requirement)

---

### Rollback Procedure

**Steps**:
1. Stop all Stage 29 work immediately
2. Notify PLAN phase lead
3. Revert tracking branch to Stage 28 baseline
   ```bash
   git checkout stage-28/performance-{venture-id}
   git branch -D stage-29/polish-{venture-id}
   ```
4. Document rollback reason in venture notes
5. Create incident report
6. Schedule retrospective

**Recovery Time Objective (RTO)**: <1 hour

---

## Quality Metrics

### Key Performance Indicators (KPIs)

| Metric | Threshold | Measurement | Frequency |
|--------|-----------|-------------|-----------|
| UI consistency | ≥95% | Design token audit | Continuous |
| UX score | ≥85/100 | User testing + analytics | Daily |
| Performance (LCP) | <2.5s | Lighthouse | Continuous |
| Performance (FID) | <100ms | Lighthouse | Continuous |
| Performance (CLS) | <0.1 | Lighthouse | Continuous |
| Accessibility | ≥95/100 | Axe + Lighthouse | Continuous |
| Bundle size (main) | <200KB gzipped | webpack-bundle-analyzer | Continuous |
| CDN cache hit rate | ≥90% | CDN analytics | Hourly |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-29.md:36-39 (metrics thresholds needed)

**Tracking**: See `09_metrics-monitoring.md` for Supabase queries and dashboards.

---

## Tools & Resources

### Required Tools

| Tool | Purpose | Installation |
|------|---------|-------------|
| Lighthouse | Performance + A11y audits | `npm install -g lighthouse` |
| Axe DevTools | Accessibility testing | Browser extension |
| Percy/Chromatic | Visual regression testing | SaaS |
| BrowserStack | Cross-device testing | SaaS |
| webpack-bundle-analyzer | Bundle analysis | `npm install -D webpack-bundle-analyzer` |

### Documentation

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Web Vitals](https://web.dev/vitals/)
- Design System: (internal link TBD)

---

## Common Issues & Solutions

### Issue 1: Design Token Compliance Fails

**Symptom**: Audit shows <100% compliance
**Root Cause**: Hard-coded values in components
**Solution**:
```bash
# Find hard-coded colors
grep -r "color: #" src/

# Replace with design tokens
# Example: color: #FF5733 → color: var(--color-primary)
```

---

### Issue 2: Animation Janky on Mobile

**Symptom**: Frame rate <30fps on mobile
**Root Cause**: Heavy DOM manipulation, layout thrashing
**Solution**:
- Use CSS transforms (GPU-accelerated)
- Batch DOM reads/writes
- Add `will-change` property
- Test with CPU throttling

---

### Issue 3: Bundle Size Exceeds Threshold

**Symptom**: Main bundle >200KB gzipped
**Root Cause**: Large dependencies, no code-splitting
**Solution**:
```bash
# Analyze bundle composition
npm run webpack:analyze

# Identify largest modules
# Consider: lazy loading, dynamic imports, tree-shaking
```

---

## Approval & Sign-off

### Required Approvals

| Role | Gate | Evidence |
|------|------|----------|
| Design Lead | UI Polished | Email approval + Percy baseline |
| UX Lead | UX Optimized | Email approval + analytics report |
| DevOps Lead | Assets Ready | CDN operational + bundle sizes met |
| PLAN Phase Lead | Stage 29 Complete | All 3 approvals obtained |

**Approval Template**:
```
Subject: Stage 29 Approval — [Venture Name]

I approve advancement from Stage 29 to Stage 30.

Gate: [UI Polished / UX Optimized / Assets Ready]
Venture ID: [UUID]
Evidence: [Link to report]
Signed: [Name], [Date]
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-06 | Claude Code | Initial SOP created from stages.yaml + critique |

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Evidence |
|--------|------|--------|------|-------|----------|
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1305-1307 | 2 entry conditions |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1308-1311 | 3 exit conditions |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1312-1330 | 3 substages with done_when |
| Rollback requirement | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 47-50 | Improvement #4 |
| Metrics thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 36-39 | Improvement #2 |

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
