# Vercel React Best Practices Performance Index

**Source**: [Vercel Labs Agent Skills - React Best Practices](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md)
**SD**: SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
**Heuristics**: 57 performance patterns organized by category

## Quick Reference: Critical Anti-Patterns

| Anti-Pattern | Severity | Gate Block | Detection |
|--------------|----------|------------|-----------|
| Barrel exports (`export * from`) | CRITICAL | Yes | `grep -r "export \* from"` |
| Waterfall requests | HIGH | Advisory | Sequential awaits analysis |
| Unoptimized images | MEDIUM | Advisory | Missing `next/image` |
| Client-side data fetching | MEDIUM | Advisory | useEffect + fetch pattern |

---

## Category 1: Bundle Optimization (12 Heuristics)

### B01: No Barrel Exports
**Pattern**: Never use `export * from './module'`
**Why**: Prevents tree-shaking, bloats bundles
**Fix**: Use direct imports from source files

```javascript
// BAD
import { Button } from './components';  // loads ALL components

// GOOD
import { Button } from './components/Button.js';  // loads only Button
```

### B02: Named Re-exports Over Star Exports
**Pattern**: Use explicit named exports
**Why**: Enables proper tree-shaking

```javascript
// BAD: lib/index.js
export * from './utils';

// GOOD: lib/index.js
export { formatDate, parseDate } from './utils/date.js';
```

### B03: Code Splitting by Route
**Pattern**: Split code at route boundaries
**Why**: Reduces initial bundle size
**Implementation**: Next.js automatic, manual with `React.lazy()`

### B04: Dynamic Imports for Heavy Modules
**Pattern**: Use `import()` for large dependencies
**Why**: Defers loading until needed

```javascript
// BAD
import { heavyChart } from 'chart-library';

// GOOD
const Chart = dynamic(() => import('chart-library'), { ssr: false });
```

### B05: Tree-Shakeable Libraries
**Pattern**: Choose libraries with ES module exports
**Why**: Enables dead code elimination
**Check**: Package has `"module"` or `"exports"` field

### B06: Analyze Bundle with @next/bundle-analyzer
**Pattern**: Regularly audit bundle composition
**Command**: `ANALYZE=true npm run build`

### B07: Minimize Dependencies
**Pattern**: Avoid duplicate functionality libraries
**Why**: Each dependency adds bundle weight

### B08: Use Native APIs Over Libraries
**Pattern**: Prefer built-in browser APIs
**Examples**: `fetch()` over axios, `Intl` over moment

### B09: Server-Only Imports
**Pattern**: Use `server-only` package for server modules
**Why**: Prevents accidental client bundling

```javascript
import 'server-only';
export function getSecretKey() { ... }
```

### B10: Dead Code Elimination
**Pattern**: Remove unused exports and functions
**Tool**: ESLint no-unused-vars

### B11: CSS Module Scoping
**Pattern**: Use CSS Modules or scoped styles
**Why**: Prevents global CSS bloat

### B12: Font Optimization
**Pattern**: Use `next/font` for self-hosted fonts
**Why**: Eliminates font loading flash

---

## Category 2: React Rendering (15 Heuristics)

### R01: Server Components by Default
**Pattern**: Use Server Components unless state needed
**Why**: Zero client JS bundle impact

### R02: Minimal Client Components
**Pattern**: Push `'use client'` to leaf components
**Why**: Maximizes server rendering benefits

### R03: Avoid Prop Drilling
**Pattern**: Use composition or Context sparingly
**Why**: Reduces re-render cascades

### R04: Memoize Expensive Computations
**Pattern**: Use `useMemo` for complex calculations
**Caution**: Don't over-memoize simple operations

```javascript
const sorted = useMemo(() =>
  items.sort((a, b) => a.value - b.value),
  [items]
);
```

### R05: Stable References with useCallback
**Pattern**: Memoize callbacks passed to children
**Why**: Prevents unnecessary re-renders

### R06: Avoid Anonymous Functions in JSX
**Pattern**: Extract handlers to named functions
**Why**: Improves readability, enables memoization

### R07: Use React.memo Selectively
**Pattern**: Wrap components with expensive renders
**Caution**: Profile before applying

### R08: Keys Must Be Stable
**Pattern**: Use unique, stable IDs as keys
**Never**: Use index as key for dynamic lists

### R09: Colocate State
**Pattern**: Keep state close to where it's used
**Why**: Limits re-render scope

### R10: Avoid State Duplication
**Pattern**: Derive state instead of syncing
**Why**: Prevents stale data bugs

### R11: Batch State Updates
**Pattern**: Group related setState calls
**Note**: React 18+ auto-batches

### R12: Suspense for Loading States
**Pattern**: Use Suspense boundaries
**Why**: Declarative loading, streaming support

### R13: Error Boundaries
**Pattern**: Wrap fallible components
**Why**: Graceful degradation

### R14: Avoid Layout Thrashing
**Pattern**: Batch DOM reads and writes
**Why**: Prevents forced reflows

### R15: Virtualize Long Lists
**Pattern**: Use react-window or react-virtual
**Threshold**: Lists > 100 items

---

## Category 3: Data Fetching (10 Heuristics)

### D01: Server-Side Data Fetching
**Pattern**: Fetch in Server Components or Route Handlers
**Why**: Eliminates client-side waterfalls

```javascript
// GOOD: Server Component
async function Page() {
  const data = await fetchData();  // Server-side
  return <Display data={data} />;
}

// BAD: Client Component
function Page() {
  const [data, setData] = useState(null);
  useEffect(() => { fetchData().then(setData); }, []);  // Waterfall!
}
```

### D02: Parallel Data Fetching
**Pattern**: Use Promise.all for independent requests
**Why**: Eliminates sequential waterfalls

```javascript
// BAD: Sequential
const user = await getUser();
const posts = await getPosts();

// GOOD: Parallel
const [user, posts] = await Promise.all([getUser(), getPosts()]);
```

### D03: Preload Critical Data
**Pattern**: Use `preload()` for known data needs
**Implementation**: Next.js preload pattern

### D04: Streaming with Suspense
**Pattern**: Stream partial responses
**Why**: Shows content progressively

### D05: Cache Responses
**Pattern**: Use fetch cache options
**Options**: `force-cache`, `no-store`, time-based

### D06: Revalidation Strategies
**Pattern**: Configure revalidation based on data freshness needs
**Options**: Time-based, on-demand

### D07: Avoid N+1 Queries
**Pattern**: Batch related queries
**Tool**: DataLoader pattern

### D08: Use SWR or React Query for Client Data
**Pattern**: Client caching with stale-while-revalidate
**When**: Interactive mutations needed

### D09: Prefetch on Hover
**Pattern**: Load data before navigation
**Implementation**: `<Link prefetch={true}>`

### D10: Optimistic Updates
**Pattern**: Update UI before server confirms
**Why**: Perceived instant response

---

## Category 4: Image & Media (8 Heuristics)

### I01: Use next/image
**Pattern**: Always use Image component
**Why**: Auto-optimization, lazy loading, sizing

### I02: Explicit Width/Height
**Pattern**: Provide dimensions
**Why**: Prevents layout shift

### I03: Priority for LCP Images
**Pattern**: Add `priority` to above-fold images
**Why**: Faster Largest Contentful Paint

### I04: Responsive Images
**Pattern**: Use `sizes` prop
**Why**: Serves appropriate size

### I05: Modern Formats
**Pattern**: Let next/image convert to WebP/AVIF
**Why**: Better compression

### I06: Lazy Load Below-Fold
**Pattern**: Default lazy behavior
**Note**: Only disable for LCP images

### I07: Placeholder Blur
**Pattern**: Use `placeholder="blur"`
**Why**: Smooth loading experience

### I08: Video Optimization
**Pattern**: Compress, use appropriate codec
**Consider**: Streaming vs download

---

## Category 5: Caching & Delivery (7 Heuristics)

### C01: Static Generation Where Possible
**Pattern**: Use `generateStaticParams`
**Why**: Fastest possible delivery

### C02: ISR for Dynamic Content
**Pattern**: Incremental Static Regeneration
**Why**: Static speed, fresh content

### C03: Edge Caching
**Pattern**: Cache at CDN edge
**Why**: Minimal latency globally

### C04: Client-Side Cache
**Pattern**: Configure cache headers
**Tool**: `Cache-Control` headers

### C05: Service Worker Caching
**Pattern**: Cache static assets
**Caution**: Update strategy matters

### C06: API Response Caching
**Pattern**: Cache API responses appropriately
**Consider**: Invalidation strategy

### C07: Database Query Caching
**Pattern**: Cache expensive queries
**Tools**: Redis, in-memory cache

---

## Category 6: Core Web Vitals (5 Heuristics)

### V01: LCP < 2.5s
**Target**: Largest Contentful Paint
**Techniques**: Preload, priority images, SSR

### V02: FID < 100ms
**Target**: First Input Delay
**Techniques**: Code splitting, minimize main thread work

### V03: CLS < 0.1
**Target**: Cumulative Layout Shift
**Techniques**: Size placeholders, font loading

### V04: INP < 200ms
**Target**: Interaction to Next Paint
**Techniques**: Avoid blocking renders

### V05: TTFB < 800ms
**Target**: Time to First Byte
**Techniques**: Edge deployment, caching

---

## Gate Integration

The PERFORMANCE sub-agent validates these heuristics during EXEC phase:

### Phase 6: Waterfall Detection
- Analyzes async patterns for sequential awaits
- Recommends Promise.all for independent operations
- Advisory for all SD types

### Phase 7: Barrel Import Audit
- Detects `export * from` patterns
- Compares against baseline (grandfathered)
- **BLOCKS** feature/performance/enhancement SDs with new violations

### Phase 8: Server Cache Patterns
- Validates caching strategies
- Checks static generation usage
- Advisory recommendations

### Enforcement by SD Type

| SD Type | Barrel Gate | Waterfall Gate |
|---------|-------------|----------------|
| feature | REQUIRED | ADVISORY |
| performance | REQUIRED | REQUIRED |
| enhancement | REQUIRED | ADVISORY |
| fix/bugfix | ADVISORY | ADVISORY |
| infrastructure | SKIP | SKIP |
| documentation | SKIP | SKIP |
| refactor | ADVISORY | ADVISORY |

---

## Remediation Resources

- **Barrel Imports**: `.claude/skills/barrel-remediation.md`
- **Baseline**: `config/barrel-baseline-2026-01-29.json`
- **Bundle Analysis**: `ANALYZE=true npm run build`
- **Performance Monitoring**: `/api/performance-metrics`
