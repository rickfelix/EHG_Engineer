#!/usr/bin/env node
/**
 * Update pattern_search_guide section in leo_protocol_sections
 * One-time script to enhance the guidance content
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const enhancedContent = `Before implementing fixes or designing features, search the pattern database for known issues and proven solutions.

### When to Search Patterns

**PLAN Phase:**
- Before schema changes: Search \`category: 'database'\`
- Before auth/security work: Search \`category: 'security'\`
- Before designing new features: Search for related architecture patterns

**EXEC Phase:**
- Before implementing: Search for known issues in affected areas
- Before testing: Search \`category: 'testing'\` for common pitfalls
- When hitting errors: Search error message keywords

**Retrospective:** Automatic extraction - no manual search needed

---

### CLI Commands (Quick Lookups)

\`\`\`bash
# View active patterns
npm run pattern:alert:dry          # Shows patterns near thresholds

# Check maintenance status
npm run pattern:maintenance:dry    # Preview all maintenance tasks

# Resolve a pattern
npm run pattern:resolve PAT-XXX "Fixed by implementing XYZ"

# Full documentation
cat docs/reference/pattern-lifecycle.md
\`\`\`

---

### Programmatic API (For Integration)

\`\`\`javascript
import { IssueKnowledgeBase } from './lib/learning/issue-knowledge-base.js';
const kb = new IssueKnowledgeBase();

// Search by category (most common)
const dbPatterns = await kb.search('', { category: 'database' });

// Search by keyword + category
const rlsPatterns = await kb.search('RLS policy', { category: 'security' });

// Get specific pattern with solutions
const pattern = await kb.getPattern('PAT-003');
const solution = await kb.getSolution('PAT-003');
// Returns: { recommended: {...}, alternatives: [...], prevention_checklist: [...] }
\`\`\`

---

### Category → Sub-Agent Mapping

| Category | Sub-Agents | Trigger On |
|----------|------------|------------|
| database | DATABASE, SECURITY | Schema, RLS, migrations |
| testing | TESTING, UAT | Test failures, coverage |
| security | SECURITY, DATABASE | Auth, tokens, permissions |
| deployment | GITHUB, DEPENDENCY | CI/CD, pipeline issues |
| build | GITHUB, DEPENDENCY | Vite, compilation |
| protocol | RETRO, DOCMON, VALIDATION | LEO handoffs, phases |
| performance | PERFORMANCE, DATABASE | Latency, slow queries |

---

### Acting on Search Results

**When pattern found:**
1. Check \`proven_solutions\` - apply highest \`success_rate\` solution first
2. Review \`prevention_checklist\` - add items to your implementation checklist
3. Pattern \`occurrence_count\` auto-updates via retrospective if issue recurs

**When no pattern found:**
1. Proceed with implementation
2. Document learnings in retrospective
3. Pattern will be auto-extracted for future reference

---

### Thresholds for Auto-SD Creation

Patterns exceeding these thresholds auto-create CRITICAL SDs:
- **Critical severity**: 5+ occurrences
- **High severity**: 7+ occurrences
- **Increasing trend**: 4+ occurrences

**Weekly Maintenance:** \`npm run pattern:maintenance\` (also runs via GitHub Action)`;

async function updateSection() {
  console.log('Updating pattern_search_guide section...');

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .update({
      content: enhancedContent,
      metadata: { enhanced_at: new Date().toISOString(), version: '2.0' }
    })
    .eq('id', 188)
    .select('id, section_type, title');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Updated pattern_search_guide section');
  console.log('   ID:', data[0].id);
  console.log('   Title:', data[0].title);
  console.log('\nNext steps:');
  console.log('   1. Run: npm run leo:generate');
  console.log('   2. Commit CLAUDE*.md files');
}

updateSection();
