---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Database Query Best Practices



## Table of Contents

- [Metadata](#metadata)
- [Database Query Best Practices (Context Efficiency)](#database-query-best-practices-context-efficiency)
  - [Core Principles](#core-principles)
  - [Rule 1: Select Specific Columns Only](#rule-1-select-specific-columns-only)
  - [Rule 2: Limit Results and Paginate](#rule-2-limit-results-and-paginate)
  - [Rule 3: Use File Read Offset/Limit](#rule-3-use-file-read-offsetlimit)
  - [Rule 4: Summarize Large Results](#rule-4-summarize-large-results)
  - [Rule 5: Batch Related Reads](#rule-5-batch-related-reads)
  - [Rule 6: Use Grep for Targeted Search](#rule-6-use-grep-for-targeted-search)
  - [Rule 7: Reference Instead of Dump](#rule-7-reference-instead-of-dump)
  - [Practical Examples](#practical-examples)
  - [Integration with Agent Workflows](#integration-with-agent-workflows)
  - [Expected Impact](#expected-impact)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, sd, directive

## Database Query Best Practices (Context Efficiency)

**Critical Lesson**: Large database query results consume massive context. Smart querying saves 5K-10K tokens per SD.

---

### Core Principles

1. **Select Specific Columns** - Don't fetch unused data
2. **Limit Results** - Use pagination for large datasets
3. **Summarize Large Results** - Show counts, not full dumps
4. **Reference Full Data** - Link to dashboard/database for details

---

### Rule 1: Select Specific Columns Only

**Problem**: `select('*')` fetches all columns, including verbose fields.

#### ❌ Bad Pattern
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')  // Returns all 20+ columns
  .eq('id', sdId)
  .single();

console.log(sd);  // Dumps entire object (500-1000 tokens)
```

#### ✅ Good Pattern
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority, progress')  // Only needed fields
  .eq('id', sdId)
  .single();

console.log(`SD-${sd.id}: ${sd.title} (status: ${sd.status}, priority: ${sd.priority}, progress: ${sd.progress}%)`);
// Output: SD-XXX: Title (status: active, priority: 85, progress: 45%)
// Tokens: ~50 vs 500-1000
```

**Token Savings**: 90% reduction (500+ tokens → 50 tokens)

---

### Rule 2: Limit Results and Paginate

**Problem**: Fetching all rows returns hundreds of records.

#### ❌ Bad Pattern
```javascript
const { data: allSDs } = await supabase
  .from('strategic_directives_v2')
  .select('*');  // Returns 100+ SDs with all columns

console.log(allSDs);  // Dumps 50K+ tokens
```

#### ✅ Good Pattern
```javascript
const { data: topSDs, count } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority', { count: 'exact' })
  .in('status', ['active', 'in_progress'])
  .order('priority', { ascending: false })
  .limit(5);

console.log(`Found ${count} active SDs, showing top 5 by priority:`);
topSDs.forEach((sd, i) => {
  console.log(`  ${i+1}. ${sd.id}: ${sd.title} (priority: ${sd.priority})`);
});
console.log(`\nFull list: http://localhost:3000/strategic-directives`);
```

**Token Savings**: 98% reduction (50K tokens → 1K tokens)

---

### Rule 3: Use File Read Offset/Limit

**Problem**: Reading entire large files when only a section is needed.

#### ❌ Bad Pattern
```javascript
const claudeMd = await read('/path/to/CLAUDE.md');  // Reads all 1,965 lines
// Only needed: Database Migration Validation section (lines 1180-1340)
// Wasted: 1,805 lines (~7,220 tokens)
```

#### ✅ Good Pattern
```javascript
const claudeMd = await read('/path/to/CLAUDE.md', {
  offset: 1180,
  limit: 160
});  // Reads only needed section

// OR: Use grep to find section first
const sectionStart = await bash('grep -n "## Database Migration Validation" CLAUDE.md');
const claudeMd = await read('/path/to/CLAUDE.md', {
  offset: parseInt(sectionStart),
  limit: 200
});
```

**Token Savings**: 95% reduction (7,220 tokens → 360 tokens)

---

### Rule 4: Summarize Large Results

**Problem**: Logging full objects/arrays dumps verbose JSON.

#### ❌ Bad Pattern
```javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', sdId)
  .single();

console.log(JSON.stringify(prd, null, 2));  // 2,000+ lines
```

#### ✅ Good Pattern
```javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, objectives, acceptance_criteria')
  .eq('directive_id', sdId)
  .single();

console.log(`PRD: ${prd.title}`);
console.log(`Status: ${prd.status}`);
console.log(`Objectives: ${prd.objectives?.length || 0} defined`);
console.log(`Acceptance Criteria: ${prd.acceptance_criteria?.length || 0} items`);
console.log(`\nFull PRD: http://localhost:3000/prd/${prd.id}`);
```

**Token Savings**: 95% reduction (8,000 tokens → 400 tokens)

---

### Rule 5: Batch Related Reads

**Problem**: Sequential reads add latency and context separately.

#### ❌ Bad Pattern
```javascript
const file1 = await read('path/to/file1.js');
const file2 = await read('path/to/file2.js');
const file3 = await read('path/to/file3.js');
// Each read appears separately in context
```

#### ✅ Good Pattern
```javascript
const [file1, file2, file3] = await Promise.all([
  read('path/to/file1.js'),
  read('path/to/file2.js'),
  read('path/to/file3.js')
]);
// Reads happen in parallel, results presented together
```

**Benefit**: Faster execution + cleaner context presentation

---

### Rule 6: Use Grep for Targeted Search

**Problem**: Reading entire files to search for specific content.

#### ❌ Bad Pattern
```javascript
const allFiles = await read('src/');
// Search through 10,000 lines for one function
```

#### ✅ Good Pattern
```javascript
const results = await grep({
  pattern: 'function executeSubAgent',
  path: 'src/',
  output_mode: 'content',
  '-n': true  // Show line numbers
});

// Now read only the specific file + lines found
```

**Token Savings**: 99% reduction for targeted searches

---

### Rule 7: Reference Instead of Dump

**Problem**: Full database dumps for verification.

#### ❌ Bad Pattern
```javascript
const { data: retrospectives } = await supabase
  .from('retrospectives')
  .select('*');

console.log('All retrospectives:', retrospectives);  // 50K+ tokens
```

#### ✅ Good Pattern
```javascript
const { data: retroSummary } = await supabase
  .from('retrospectives')
  .select('id, sd_id, quality_score, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

console.log(`Recent retrospectives (${retroSummary.length}):`);
retroSummary.forEach(r => {
  console.log(`  - ${r.sd_id}: Quality ${r.quality_score}/100 (${r.created_at})`);
});
console.log(`\nView all: http://localhost:3000/retrospectives`);
```

**Token Savings**: 98% reduction

---

### Practical Examples

#### Example 1: SD Status Check
```javascript
// Instead of fetching entire SD:
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, status, progress')
  .eq('id', sdId)
  .single();

console.log(`${sd.id}: ${sd.status} (${sd.progress}% complete)`);
```

#### Example 2: PRD Requirements Check
```javascript
// Instead of full PRD:
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('acceptance_criteria')
  .eq('directive_id', sdId)
  .single();

console.log(`Acceptance Criteria: ${prd.acceptance_criteria.length} items`);
console.log('First 3:');
prd.acceptance_criteria.slice(0, 3).forEach((item, i) => {
  console.log(`  ${i+1}. ${item.title}`);
});
```

#### Example 3: Sub-Agent Results Summary
```javascript
// Instead of full results:
const { data: results, count } = await supabase
  .from('sub_agent_execution_results')
  .select('sub_agent_id, verdict, confidence', { count: 'exact' })
  .eq('sd_id', sdId);

console.log(`Sub-agent executions: ${count}`);
console.log('Results:');
results.forEach(r => {
  console.log(`  - ${r.sub_agent_id}: ${r.verdict} (${r.confidence}% confidence)`);
});
```

---

### Integration with Agent Workflows

**PLAN Agent Pre-EXEC Checklist**:
- ✅ Query only needed PRD fields
- ✅ Limit backlog items to top 10
- ✅ Summarize results, not full dumps

**EXEC Agent Implementation**:
- ✅ Read specific file sections with offset/limit
- ✅ Use grep for targeted searches
- ✅ Batch related reads

**PLAN Supervisor Verification**:
- ✅ Query sub-agent summaries first
- ✅ Fetch full reports only if needed
- ✅ Reference database for comprehensive data

---

### Expected Impact

| Pattern | Before | After | Savings |
|---------|--------|-------|---------|
| select('*') vs specific columns | 500-1000 tokens | 50-100 tokens | 90% |
| All rows vs limit(5) | 50K tokens | 1K tokens | 98% |
| Full file vs offset/limit | 7K tokens | 360 tokens | 95% |
| JSON dump vs summary | 8K tokens | 400 tokens | 95% |

**Total Potential Savings**: 5K-10K tokens per SD

---

**Related Tools**:
- `scripts/examples/efficient-database-queries.js` - Working examples
- Read tool: Supports offset/limit parameters
- Grep tool: Targeted content search

