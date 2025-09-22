---
description: Force PERFORMANCE sub-agent analysis for optimization
argument-hint: [describe the performance issue]
---

# ⚡ LEO PERFORMANCE Sub-Agent Analysis

**Performance Issue:** $ARGUMENTS

## PERFORMANCE Sub-Agent Metrics:

### 1. Current Performance Assessment
- Load time analysis
- Render performance
- Network waterfall
- Bundle size impact

### 2. Frontend Optimization
- Component re-renders
- React memo opportunities
- useMemo/useCallback usage
- Virtual DOM efficiency
- Code splitting points

### 3. Backend Optimization
- Database query performance
- N+1 query detection
- API response times
- Caching opportunities
- Connection pooling

### 4. Asset Optimization
- Image optimization
- Lazy loading implementation
- Bundle size reduction
- Tree shaking effectiveness
- CDN utilization

### 5. Specific Bottlenecks
- Identify slowest operations
- Memory leaks
- CPU-intensive tasks
- Network bottlenecks
- Rendering bottlenecks

## Performance Targets:
- First Contentful Paint (FCP): < 1.8s
- Largest Contentful Paint (LCP): < 2.5s
- Time to Interactive (TTI): < 3.8s
- Cumulative Layout Shift (CLS): < 0.1

## Optimization Strategy:
1. Quick wins (immediate improvements)
2. Medium-term optimizations
3. Long-term architectural changes

## Tools & Monitoring:
- Chrome DevTools Performance tab
- React DevTools Profiler
- Lighthouse recommendations
- Bundle analyzer results

Provide specific code optimizations with before/after comparisons and expected performance gains.