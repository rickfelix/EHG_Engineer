/**
 * Create technical debt SDs discovered during SD-VWC-PHASE4-001
 *
 * SD-TECH-DEBT-DOCS-001: Legacy Markdown File Cleanup
 * SD-TECH-DEBT-PERF-001: Performance Optimization (Bundles, Memory, Queries)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('\n📋 Creating Technical Debt SDs from SD-VWC-PHASE4-001 Blockers\n');

// SD 1: Documentation Architecture Cleanup
const sd1 = {
  id: 'SD-TECH-DEBT-DOCS-001',
  sd_key: 'TECH-DEBT-DOCS-001',
  title: 'Legacy Markdown File Cleanup: Database-First Migration',
  scope: 'Audit and migrate 14+ legacy SD markdown files to database. Archive or consolidate historical documentation. Add gitignore rules to prevent future violations.',
  target_application: 'EHG_Engineer',
  description: `Migrate 14+ legacy SD markdown files to database-first architecture to resolve DOCMON violations.

**Context**: During SD-VWC-PHASE4-001 EXEC→PLAN handoff, DOCMON detected 14+ legacy markdown files that violate database-first architecture. These files pre-date the database-first enforcement and should be migrated or archived.

**Discovered Files**:
- docs/retrospectives/SD-002-With-Control-Points.md
- docs/SD-AGENT-PLATFORM-001_IMPLEMENTATION_GUIDE.md
- docs/SD-BACKEND-002A-USAGE.md
- docs/SD-LLM-CENTRAL-001-IMPLEMENTATION.md
- docs/strategic-directives/SD-002-shimmer-ai-avatar.md
- docs/strategic-directives/SD-2025-001-openai-realtime-voice.md
- docs/strategic-directives/SD-TEST-001-shimmer-avatar.md
- SD-AGENT-PLATFORM-001_STATUS.md
- SD-BACKEND-002B-LESSONS-LEARNED.md
- SD-BACKEND-002B-VERIFICATION-CHECKLIST.md
- SD-MULTIMEDIA-001-IMPLEMENTATION.md
- SD-NAV-REFACTOR-001_FINAL_SUMMARY.md
- SD-NAV-REFACTOR-001_RETROSPECTIVE.md
- SD-RD-DEPT-001_PHASE_2_STATUS.md
- ...and potentially more

**Required Actions**:
1. Audit all SD-*.md files across repository
2. Categorize by type (SD definition, retrospective, status, implementation guide)
3. Migrate historical SDs to strategic_directives_v2 table
4. Migrate retrospectives to retrospectives table
5. Archive implementation guides (convert to docs/guides/*.md with proper naming)
6. Update any references to migrated files
7. Add .gitignore rules to prevent future SD-*.md creation at root level
8. Document migration process for future reference

**Success Criteria**:
- Zero SD-*.md files at repository root
- All historical SDs in database with proper metadata
- DOCMON passes without violations
- No broken references to migrated content

**Estimated Effort**: 2-3 hours
**Priority**: Medium (blocks handoff validation but not functionality)
**Category**: Technical Debt`,
  category: 'Technical Debt',
  rationale: 'Database-first architecture enforcement. Legacy files from before this standard was implemented block automated validation. Cleanup improves system integrity and prevents future violations.',
  priority: 'medium',
  status: 'pending_approval',
  progress: 0
};

// SD 2: Performance Optimization
const sd2 = {
  id: 'SD-TECH-DEBT-PERF-001',
  sd_key: 'TECH-DEBT-PERF-001',
  title: 'Performance Optimization: Bundle Size, Memory Leaks, Query Optimization',
  scope: 'Optimize 4 oversized bundles, fix 1 memory leak, optimize 84 database queries. Establish performance baselines and monitoring. Target: <500KB bundles, 0 memory leaks, <50 unoptimized queries.',
  target_application: 'EHG',
  description: `Address 4 oversized bundles, 1 memory leak, and 84 unoptimized database queries.

**Context**: During SD-VWC-PHASE4-001 EXEC→PLAN handoff, PERFORMANCE sub-agent detected multiple pre-existing performance issues that should be addressed to improve application performance and user experience.

**Issues Detected**:

**1. Oversized Bundles (4 detected)**
- Impact: Slow initial page load, poor mobile experience
- Threshold: >500KB compressed
- Recommendation: Code splitting, lazy loading, tree shaking

**2. Memory Leak (1 detected)**
- Impact: Performance degradation over time, browser crashes
- Likely Causes: Event listeners not cleaned up, circular references, cached data not released
- Recommendation: Component unmount cleanup, WeakMap usage, profiling

**3. Unoptimized Database Queries (84 detected)**
- Impact: Slow API responses, database load
- Common Issues: Missing indexes, N+1 queries, SELECT *, unnecessary JOINs
- Recommendation: Add indexes, use select() with specific columns, query batching

**4. Render Performance**
- Status: ✅ Some optimizations already detected
- Continue: Monitor and improve where needed

**Required Actions**:

**Phase 1: Analysis (1-2 hours)**
1. Bundle analyzer report (webpack-bundle-analyzer or equivalent)
2. Memory profiler analysis (Chrome DevTools)
3. Database query audit (pg_stat_statements or Supabase logs)
4. Establish performance baselines

**Phase 2: Quick Wins (2-3 hours)**
1. Implement code splitting for large components
2. Fix identified memory leak
3. Add critical database indexes
4. Convert heavy SELECT * to specific columns

**Phase 3: Optimization (3-4 hours)**
1. Lazy load non-critical routes
2. Implement query batching/caching
3. Tree shake unused dependencies
4. Image optimization (if applicable)

**Success Criteria**:
- All bundles <500KB compressed
- Zero memory leaks detected in 30-minute profiling session
- <50 unoptimized queries (80% reduction)
- PERFORMANCE sub-agent passes validation
- Page load time <3s (desktop), <5s (mobile 3G)

**Estimated Effort**: 6-9 hours
**Priority**: Medium (impacts user experience but not functionality)
**Category**: Technical Debt`,
  category: 'Technical Debt',
  rationale: 'Performance directly impacts user experience and scalability. While not blocking functionality, optimization improves application quality and reduces infrastructure costs.',
  priority: 'medium',
  status: 'pending_approval',
  progress: 0
};

// Insert SDs
console.log('Creating SD-TECH-DEBT-DOCS-001...');
const { data: data1, error: error1 } = await supabase
  .from('strategic_directives_v2')
  .insert(sd1)
  .select()
  .single();

if (error1) {
  console.error('❌ Error creating SD-TECH-DEBT-DOCS-001:', error1.message);
  if (error1.code === '23505') {
    console.log('   SD already exists, skipping...');
  } else {
    process.exit(1);
  }
} else {
  console.log('✅ Created SD-TECH-DEBT-DOCS-001');
  console.log('   Title:', data1.title);
  console.log('   Priority:', data1.priority);
}

console.log('\nCreating SD-TECH-DEBT-PERF-001...');
const { data: data2, error: error2 } = await supabase
  .from('strategic_directives_v2')
  .insert(sd2)
  .select()
  .single();

if (error2) {
  console.error('❌ Error creating SD-TECH-DEBT-PERF-001:', error2.message);
  if (error2.code === '23505') {
    console.log('   SD already exists, skipping...');
  } else {
    process.exit(1);
  }
} else {
  console.log('✅ Created SD-TECH-DEBT-PERF-001');
  console.log('   Title:', data2.title);
  console.log('   Priority:', data2.priority);
}

console.log('\n✅ Technical Debt SDs Created Successfully');
console.log('═══════════════════════════════════════════════════');
console.log('\nNext Steps:');
console.log('1. These SDs track pre-existing issues unrelated to SD-VWC-PHASE4-001');
console.log('2. Retry EXEC→PLAN handoff for SD-VWC-PHASE4-001');
console.log('3. Address tech debt SDs separately (not blocking Phase 4)');
console.log('4. Run: node scripts/unified-handoff-system.js execute EXEC-to-PLAN SD-VWC-PHASE4-001');
