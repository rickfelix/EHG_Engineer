# Stage 28: Professional Standard Operating Procedure

**Purpose**: Execute performance optimization and caching implementation for EXEC-phase ventures.

**Scope**: Substages 28.1 (Performance Analysis), 28.2 (Cache Implementation), 28.3 (Code Optimization)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1267-1284 "substages: 28.1-28.3"

---

## Prerequisites

### Entry Gates (Must Pass All)

1. ✅ **Baseline measured**: Performance metrics collected for current system state
2. ✅ **Bottlenecks identified**: Hot paths and slow queries documented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1259-1261 "entry gates"

### Required Inputs (3)

1. **Performance metrics**: Baseline response times, throughput, resource consumption
2. **Bottleneck analysis**: Profiling data identifying slow code paths
3. **Cache requirements**: Identified cacheable data and invalidation triggers

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1246-1249 "inputs"

---

## Substage 28.1: Performance Analysis

### Objective
Profile system performance, identify bottlenecks, and set optimization targets.

### Steps

#### Step 1: Establish Performance Baseline
**Action**: Collect metrics across all application layers
- **Frontend**: Page load time, TTI (Time to Interactive), FCP (First Contentful Paint)
- **API**: P50/P95/P99 response times for all endpoints
- **Database**: Query execution times, connection pool utilization
- **Infrastructure**: CPU/memory/disk usage

**Tools**: Browser DevTools, Application Performance Monitoring (APM), database EXPLAIN ANALYZE

**Output**: Performance baseline report with current metrics

#### Step 2: Profile Application Hotspots
**Action**: Use profiling tools to identify expensive operations
- **Node.js**: `node --prof`, Chrome DevTools CPU profiler
- **Database**: Supabase slow query logs, `pg_stat_statements`
- **Frontend**: React DevTools Profiler, Lighthouse

**Output**: Bottleneck analysis report with top 10 hot paths ranked by impact

#### Step 3: Set Optimization Targets
**Action**: Define measurable performance goals
- **Response time**: Target P95 < threshold (e.g., 200ms API, 1s page load)
- **Throughput**: Requests per second target
- **Resource utilization**: CPU < 70%, Memory < 80%

**Output**: Optimization targets document with acceptance criteria

**Done When** (3 criteria):
1. ✅ Profiling complete
2. ✅ Bottlenecks identified
3. ✅ Optimization targets set

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1269-1272 "Performance Analysis done_when"

---

## Substage 28.2: Cache Implementation

### Objective
Implement caching layers to reduce database load and improve response times.

### Steps

#### Step 4: Define Cache Strategy
**Action**: Select appropriate caching patterns for each data type
- **Application cache**: Redis/Valkey for frequently accessed data
- **HTTP cache**: CDN for static assets, API responses with `Cache-Control` headers
- **Database cache**: Supabase built-in caching, materialized views

**Considerations**:
- **TTL (Time to Live)**: How long data remains valid
- **Invalidation triggers**: When to purge cache (on write, schedule, manual)
- **Cache keys**: Namespace design to avoid collisions

**Output**: Cache architecture document with layer diagram

#### Step 5: Implement Cache Layers
**Action**: Integrate caching into application code
- **Install dependencies**: Redis client, cache middleware
- **Wrap database queries**: Check cache before DB, populate on miss
- **Add cache headers**: Set `Cache-Control`, `ETag`, `Last-Modified` on API responses

**Code Example**:
```javascript
async function getVenture(id) {
  const cacheKey = `venture:${id}`;
  let venture = await redis.get(cacheKey);
  if (!venture) {
    venture = await db.ventures.findById(id);
    await redis.set(cacheKey, JSON.stringify(venture), 'EX', 3600); // 1hr TTL
  }
  return JSON.parse(venture);
}
```

**Output**: Cache layer code committed to repository

#### Step 6: Configure Cache Invalidation
**Action**: Ensure cache consistency on data updates
- **Write-through**: Update cache and DB simultaneously
- **Event-driven**: Purge cache on database triggers
- **Manual**: Admin endpoint to flush cache

**Output**: Invalidation logic implemented and tested

**Done When** (3 criteria):
1. ✅ Cache strategy defined
2. ✅ Layers implemented
3. ✅ Invalidation configured

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1274-1278 "Cache Implementation done_when"

---

## Substage 28.3: Code Optimization

### Objective
Optimize hot paths, improve algorithms, and reduce resource consumption.

### Steps

#### Step 7: Optimize Hot Paths
**Action**: Refactor top bottlenecks identified in Step 2
- **Algorithm improvements**: Replace O(n²) with O(n log n) where applicable
- **Query optimization**: Add indexes, rewrite N+1 queries
- **Lazy loading**: Defer expensive operations until needed

**Example**: Optimize venture list query
```sql
-- Before: Full table scan
SELECT * FROM ventures WHERE status = 'active';

-- After: Index-optimized with selective fields
CREATE INDEX idx_ventures_status ON ventures(status);
SELECT id, title, current_workflow_stage FROM ventures WHERE status = 'active';
```

**Output**: Optimized code with performance improvement documented

#### Step 8: Improve Algorithms
**Action**: Replace inefficient implementations
- **Data structures**: Use maps/sets instead of arrays for lookups
- **Batch operations**: Group multiple DB writes into single transaction
- **Async optimization**: Use Promise.all() for parallel operations

**Output**: Algorithm improvements committed with benchmarks

#### Step 9: Reduce Resource Usage
**Action**: Minimize CPU/memory footprint
- **Memory leaks**: Fix event listener cleanup, closure issues
- **Unnecessary computations**: Memoize expensive functions
- **Bundle size**: Tree-shake unused code, lazy-load routes

**Tools**: Node.js `--trace-gc`, Chrome Memory Profiler, webpack-bundle-analyzer

**Output**: Resource usage reduced by measurable percentage

**Done When** (3 criteria):
1. ✅ Hot paths optimized
2. ✅ Algorithms improved
3. ✅ Resources reduced

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1280-1284 "Code Optimization done_when"

---

## Exit Verification

### Exit Gates (Must Pass All)

1. ✅ **Performance targets met**: Metrics meet or exceed targets from Step 3
2. ✅ **Caching optimized**: Cache hit rate ≥70% for targeted queries
3. ✅ **Best practices applied**: Code passes linting, follows optimization patterns

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1262-1265 "exit gates"

### Final Outputs (3)

1. **Optimized code**: Committed to repository with performance improvements
2. **Cache layer**: Integrated and operational with monitoring
3. **Performance report**: Before/after metrics showing improvement

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1250-1253 "outputs"

---

## Quality Assurance

### Testing Requirements
1. **Load testing**: Verify performance under expected traffic (e.g., Apache JMeter, k6)
2. **Cache validation**: Confirm hit rates meet targets
3. **Regression testing**: Ensure optimizations don't break functionality

### Monitoring Setup
1. **Metrics dashboard**: Track response time, cache hit rate, resource utilization
2. **Alerts**: Trigger on performance degradation (e.g., P95 > threshold)
3. **Logging**: Capture cache misses and slow queries for ongoing optimization

---

## Rollback Procedure

**Trigger**: Performance degrades after optimization deployment

**Steps**:
1. Identify failing metric (response time spike, cache errors)
2. Revert last deployment via git
3. Flush cache if invalidation bug suspected
4. Re-run profiling to identify regression cause
5. Fix and redeploy with additional testing

**Evidence Gap**: Not defined in stages.yaml; added per critique recommendation

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-28.md:47-50 "Add rollback procedures"

---

## Common Pitfalls

1. ❌ **Over-caching**: Caching too much data increases memory pressure
2. ❌ **Stale cache**: Forgetting to invalidate on updates causes data inconsistency
3. ❌ **Premature optimization**: Optimizing before profiling wastes effort
4. ❌ **No benchmarks**: Cannot prove improvement without before/after metrics

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Substages definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1267-1284 |
| Entry/exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1259-1265 |
| Inputs/outputs | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1246-1253 |
| Rollback recommendation | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-28.md | 47-50 |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
