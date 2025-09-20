# PERFORMANCE SUB-AGENT ACTIVATION HANDOFF

**From**: EXEC Agent  
**To**: Performance Sub-Agent  
**Date**: [ISO Date]  
**PRD Reference**: [PRD-ID]  
**Activation Trigger**: [load time | scalability | optimization | performance metrics]

---

## 1. EXECUTIVE SUMMARY (≤200 tokens)

**Sub-Agent**: Performance Sub-Agent  
**Activation Reason**: [Performance targets specified in PRD]  
**Scope**: Performance optimization and scalability validation  
**Priority**: High  
**Expected Deliverable**: Performance-optimized implementation with metrics validation

---

## 2. SCOPE & REQUIREMENTS

### Primary Objectives:
- [ ] Achieve specified performance targets (load time, scalability)
- [ ] Optimize frontend resource loading and rendering
- [ ] Optimize backend query performance and caching
- [ ] Implement performance monitoring and alerting
- [ ] Validate scalability under specified load

### Success Criteria:
- [ ] Page load time: [<X seconds]
- [ ] Time to interactive: [<X seconds]
- [ ] Bundle size: [<X MB]
- [ ] Memory usage: [<X MB]
- [ ] Concurrent user capacity: [>X users]

### Out of Scope:
- Infrastructure scaling (unless code-level optimizations)
- CDN configuration (unless implementation specific)
- Third-party service optimization (unless integration related)

---

## 3. CONTEXT PACKAGE

**PRD Requirements**: [Copy relevant performance sections from PRD]

**Performance Targets**:
- Page Load Time: [Target time]
- First Contentful Paint: [Target time]  
- Largest Contentful Paint: [Target time]
- Cumulative Layout Shift: [Target score]
- Concurrent Users: [Target capacity]

**Technical Stack**:
- Frontend: [React/Vue/Angular + build tools]
- Backend: [Node.js/Python + database]
- Hosting: [Cloud provider/CDN info]

**Current Performance Baseline**: [If available]

**Integration Points**:
- Frontend optimization → User experience improvement
- Backend optimization → API response time improvement
- Database optimization → Query performance enhancement

---

## 4. DELIVERABLES MANIFEST

### Required Outputs:
- **Performance-Optimized Code**: Frontend and backend optimizations
- **Benchmark Results**: `performance/benchmark-results.json`
- **Load Testing Report**: `performance/load-test-report.html`
- **Performance Monitoring Setup**: Monitoring dashboard configuration

### Supporting Documentation:
- **Performance Analysis**: Before/after metrics comparison
- **Optimization Strategies**: What was optimized and why
- **Performance Budget**: Ongoing performance guidelines

---

## 5. SUCCESS CRITERIA & VALIDATION

### Acceptance Criteria:
- [ ] All specified performance targets met or exceeded
- [ ] Load testing passes for expected user capacity
- [ ] No performance regressions introduced
- [ ] Performance monitoring actively tracking metrics
- [ ] Bundle size within acceptable limits

### Quality Gates:
- **Load Time**: [<X seconds] for critical pages
- **Scalability**: Handle [X concurrent users] without degradation
- **Resource Usage**: Memory usage [<X MB], CPU usage efficient
- **Mobile Performance**: 3G network performance acceptable

---

## 6. RESOURCE ALLOCATION

**Context Budget**: [X tokens] - Performance analysis intensive  
**Time Constraint**: Complete within [X hours]  
**External Dependencies**:
- Performance testing tools (Lighthouse, WebPageTest, Artillery)
- Monitoring services (if external)
- Load testing infrastructure

**Escalation Path**:
- Performance targets unachievable → Technical alternatives required
- Infrastructure limitations → Discuss scope adjustments
- Optimization conflicts → Prioritize based on user impact

---

## 7. HANDOFF REQUIREMENTS

### Immediate Actions Required:
1. **Performance baseline measurement** (within 1 hour)
2. **Bottleneck identification** (within 2 hours)
3. **Optimization strategy planning** (within 3 hours)

### Review Checkpoints:
- [ ] **Baseline performance documented** (within 2 hours)
- [ ] **Optimization progress review** (at 50% completion)
- [ ] **Load testing completion** (before handback)

### Performance Alerts:
- Critical performance regression → Immediate notification
- Target unachievable → Alternative approach required
- Resource constraint hit → Scope discussion needed

---

**HANDOFF STATUS**: ⚡ Activated - Performance Sub-Agent optimize for speed  
**PERFORMANCE LEVEL**: Target-driven - Meet specified metrics  
**EXPECTED COMPLETION**: [Deadline with performance validation]

---

*Template Version: LEO v4.1.1*  
*Performance Sub-Agent - Speed & Scalability Optimization*